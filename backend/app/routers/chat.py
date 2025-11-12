"""
Chat endpoint that grounds responses in the application's database.

POST /api/chat
- Auth required
- Uses OpenAI (gpt-4o) and provides:
  * Database schema summary (all tables + columns)
  * Current user's profile and recent data (weights, targets)
  * Optional extra tables if present (achievements, streaks, user_preferences)

Environment: settings.openai_api_key must be set (OPENAI_API_KEY).
"""
from typing import List, Optional, Dict, Any
from datetime import date, timedelta

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import inspect, MetaData, Table, select
from sqlalchemy.orm import Session

from ..database import get_db, engine
from .. import models
from ..auth import get_current_user
from ..config import settings

try:
    # OpenAI python SDK v1
    from openai import OpenAI
except Exception:  # pragma: no cover
    OpenAI = None  # type: ignore


router = APIRouter(prefix="/api/chat", tags=["Chat"])


# -------------------- Schemas --------------------
class ChatMessage(BaseModel):
    role: str = Field(..., pattern=r"^(user|assistant)$")
    content: str


class ChatRequest(BaseModel):
    messages: List[ChatMessage]
    # Optional: when admin is chatting, they may request broader org context.
    # We keep default as False for safety; server still validates admin.
    admin_scope_all: bool = False


class ChatResponse(BaseModel):
    reply: str


# -------------------- Helpers --------------------
def _safe_float(val: Any) -> Optional[float]:
    try:
        if val is None:
            return None
        return float(val)
    except Exception:
        return None


def _calculate_bmi(weight_kg: float, height_cm: Optional[float]) -> float:
    if not height_cm or height_cm <= 0:
        return 0.0
    h_m = float(height_cm) / 100.0
    return round(float(weight_kg) / (h_m * h_m), 2)


def _age_on(date_of_birth: Optional[date], on_date: Optional[date] = None) -> int:
    from datetime import date as _date
    if not date_of_birth:
        return 0
    if on_date is None:
        on_date = _date.today()
    years = on_date.year - date_of_birth.year - ((on_date.month, on_date.day) < (date_of_birth.month, date_of_birth.day))
    return max(0, years)


def _is_male(sex: Optional[str]) -> bool:
    if not sex:
        return False
    s = str(sex).strip().lower()
    return s.startswith("m")  # 'male' or 'm'


def _estimate_body_fat_percent(bmi: float, age_years: int, sex: Optional[str]) -> Optional[float]:
    # Deurenberg equation; sex: 1 for male, 0 for female
    if bmi <= 0 or age_years <= 0:
        return None
    sex_flag = 1 if _is_male(sex) else 0
    bf = 1.2 * bmi + 0.23 * age_years - 10.8 * sex_flag - 5.4
    bf = max(3.0, min(60.0, bf))  # clamp
    return round(bf, 2)


def _estimate_lean_body_mass(weight_kg: float, height_cm: Optional[float], sex: Optional[str]) -> Optional[float]:
    # Boer formula (lean body mass as a proxy for muscle mass)
    if not height_cm:
        return None
    if _is_male(sex):
        lbm = 0.407 * float(weight_kg) + 0.267 * float(height_cm) - 19.2
    else:
        lbm = 0.252 * float(weight_kg) + 0.473 * float(height_cm) - 48.3
    lbm = max(0.0, min(float(weight_kg), lbm))
    return round(lbm, 2)


def _summarize_schema() -> str:
    """Return a compact schema description for all tables in the DB."""
    insp = inspect(engine)
    lines: List[str] = []
    try:
        tables = insp.get_table_names()
    except Exception:
        tables = []
    for t in tables:
        try:
            cols = insp.get_columns(t)
            col_parts = []
            for c in cols:
                name = c.get("name")
                type_ = str(c.get("type"))
                pk = " pk" if c.get("primary_key") else ""
                col_parts.append(f"{name}:{type_}{pk}")
            lines.append(f"{t}({', '.join(col_parts)})")
        except Exception:
            lines.append(f"{t}(<unavailable>)")
    return "\n".join(lines)


def _fetch_optional_table_for_user(table_name: str, user_id: int, limit: int = 20) -> Optional[List[Dict[str, Any]]]:
    """Reflect a table if present, and fetch recent rows for the user.
    Heuristics: if a `user_id` column exists, filter on it; else return None.
    """
    insp = inspect(engine)
    try:
        if table_name not in insp.get_table_names():
            return None
    except Exception:
        return None
    md = MetaData()
    try:
        table = Table(table_name, md, autoload_with=engine)
    except Exception:
        return None
    if "user_id" not in table.c:
        return None
    stmt = select(table).where(table.c.user_id == user_id).order_by(table.c.__getattr__("id").desc() if "id" in table.c else table.c.user_id).limit(limit)
    try:
        with engine.connect() as conn:
            rows = conn.execute(stmt).mappings().all()
            return [dict(r) for r in rows]
    except Exception:
        return None


def _gather_user_context(db: Session, user: models.User) -> Dict[str, Any]:
    ctx: Dict[str, Any] = {}
    # Profile
    ctx["user_profile"] = {
        "id": user.id,
        "name": user.name,
        "email": user.email,
        "sex": user.sex,
        "height_cm": _safe_float(user.height),
        "activity_level": user.activity_level,
        "date_of_birth": user.date_of_birth.isoformat() if user.date_of_birth else None,
        "is_admin": bool(user.is_admin),
        "created_at": user.created_at.isoformat() if user.created_at else None,
    }

    # Latest weights (last 30)
    weights = (
        db.query(models.Weight)
        .filter(models.Weight.user_id == user.id)
        .order_by(models.Weight.date_of_measurement.desc())
        .limit(30)
        .all()
    )
    weights_data = [
        {
            "date": w.date_of_measurement.isoformat() if w.date_of_measurement else None,
            "weight_kg": _safe_float(w.weight),
            "body_fat_pct": _safe_float(w.body_fat_percentage),
            "muscle_mass": _safe_float(w.muscle_mass),
            "notes": w.notes,
        }
        for w in weights
    ]
    ctx["recent_weights"] = weights_data

    # Simple stats
    if weights_data:
        latest_w = weights_data[0]["weight_kg"]
        # 30-day comparison
        thirty_days_ago = date.today() - timedelta(days=30)
        w_30 = (
            db.query(models.Weight)
            .filter(models.Weight.user_id == user.id, models.Weight.date_of_measurement <= thirty_days_ago)
            .order_by(models.Weight.date_of_measurement.desc())
            .first()
        )
        w_30_val = _safe_float(w_30.weight) if w_30 else None
        height_cm = _safe_float(user.height)
        bmi = None
        if latest_w is not None and height_cm and height_cm > 0:
            h_m = height_cm / 100.0
            bmi = round(latest_w / (h_m * h_m), 2)
        ctx["stats"] = {
            "latest_weight_kg": latest_w,
            "weight_kg_30d_ago": w_30_val,
            "delta_30d_kg": (latest_w - w_30_val) if (latest_w is not None and w_30_val is not None) else None,
            "current_bmi": bmi,
        }

    # Targets (last 10)
    targets = (
        db.query(models.TargetWeight)
        .filter(models.TargetWeight.user_id == user.id)
        .order_by(models.TargetWeight.created_date.desc())
        .limit(10)
        .all()
    )
    ctx["recent_targets"] = [
        {
            "id": t.id,
            "created_date": t.created_date.isoformat() if t.created_date else None,
            "target_date": t.date_of_target.isoformat() if t.date_of_target else None,
            "target_weight_kg": _safe_float(t.target_weight),
            "status": t.status,
        }
        for t in targets
    ]

    # Optional / extra tables if present
    for extra in ["achievements", "streaks", "user_preferences"]:
        rows = _fetch_optional_table_for_user(extra, user.id, limit=20)
        if rows is not None:
            ctx[f"{extra}_sample"] = rows

    return ctx


def _gather_admin_overview(db: Session) -> Dict[str, Any]:
    """Provide an organization-wide overview for admin users without exposing secrets.
    Excludes password hashes and other sensitive fields by design.
    """
    out: Dict[str, Any] = {"users": [], "users_table": "users"}
    # Totals
    try:
        from sqlalchemy import func
        total_users = db.query(func.count(models.User.id)).scalar() or 0
    except Exception:
        total_users = None
    out["users_total"] = total_users

    users: List[models.User] = db.query(models.User).order_by(models.User.id).limit(500).all()
    for u in users:
        # Basic profile sans secrets
        entry: Dict[str, Any] = {
            "id": u.id,
            "name": u.name,
            "email": u.email,
            "is_admin": bool(u.is_admin),
            "sex": u.sex,
            "height_cm": _safe_float(u.height),
            "activity_level": u.activity_level,
            "date_of_birth": u.date_of_birth.isoformat() if u.date_of_birth else None,
            "created_at": u.created_at.isoformat() if u.created_at else None,
        }
        # Latest weight and counts
        latest = (
            db.query(models.Weight)
            .filter(models.Weight.user_id == u.id)
            .order_by(models.Weight.date_of_measurement.desc())
            .first()
        )
        entry["latest_weight_kg"] = _safe_float(latest.weight) if latest else None
        entry["latest_weight_date"] = latest.date_of_measurement.isoformat() if latest and latest.date_of_measurement else None
        # Counts
        tw = db.query(models.Weight).filter(models.Weight.user_id == u.id).count()
        tt = db.query(models.TargetWeight).filter(models.TargetWeight.user_id == u.id).count()
        entry["total_weights"] = tw
        entry["total_targets"] = tt
        out["users"].append(entry)
    return out


def _build_system_prompt() -> str:
    return (
        "You are a helpful health and weight tracking assistant for this app. "
        "Answer using ONLY the provided Context (schema + user data). "
        "If the answer is not in the Context, ask a clarifying question or say you don't have that data. "
        "Be concise and numeric when possible, and cite dates/units. "
        "For any admin action (create/update/delete user/target), you MUST use the provided tools. "
        "Never claim an action succeeded unless a tool call returned ok=true. "
        "Do NOT invent required fields. If required data (e.g., password for creating a user) is missing, ask the user to provide it explicitly."
    )


def _build_policy_summary() -> str:
    """Static summary of access control to help the assistant answer policy questions."""
    return (
        "Access Policy:\n"
        "- Non-admin users: may access only their own profile, weights, and targets via /api/users, /api/weights, /api/targets; they can create, update, and delete their own weights and targets; they can update their own profile and change their own password.\n"
        "- Admin users: access admin-only routes under /api/admin to list users, view user details, view user targets, create users, update users, set user passwords, delete users, and delete targets.\n"
        "- Creating a user (admin): POST /api/admin/users with body: {name (required), password (required), email?, sex?, height?, activity_level?, date_of_birth?} and optional query param is_admin.\n"
        "- Updating a user (admin): PUT /api/admin/users/{user_id} with any subset of name, email, sex, height, activity_level, date_of_birth.\n"
        "- Password hashes are not exposed via APIs or chat. Admins can reset passwords but cannot read password hashes.\n"
    )


def _build_context_blob(schema_text: str, user_ctx: Dict[str, Any]) -> str:
    policy = _build_policy_summary()
    return (
        "Context:\n"
        "- Database Schema:\n" + schema_text + "\n\n"
        "- User Data (scoped to current user):\n" + str(user_ctx) + "\n\n" + policy
    )


# -------------------- Endpoint --------------------
@router.post("", response_model=ChatResponse)
def chat(
    payload: ChatRequest,
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    if OpenAI is None:
        raise HTTPException(status_code=500, detail="OpenAI client not available. Ensure dependency is installed.")
    if not settings.openai_api_key:
        raise HTTPException(status_code=500, detail="OPENAI_API_KEY not configured on server.")

    # Prepare context
    schema_text = _summarize_schema()
    user_ctx = _gather_user_context(db, current_user)
    # Optionally include admin-wide context when requested and authorized
    admin_ctx: Optional[Dict[str, Any]] = None
    # For admins, include an admin overview by default so policy/count questions are answerable.
    if current_user.is_admin:
        admin_ctx = _gather_admin_overview(db)
    system_prompt = _build_system_prompt()
    # Merge context parts
    if admin_ctx:
        context_blob = _build_context_blob(schema_text, {"current_user": user_ctx, "admin_overview": admin_ctx})
    else:
        context_blob = _build_context_blob(schema_text, user_ctx)

    # Clip history to last 12 exchanges to control tokens
    history = payload.messages[-12:]
    messages = [
        {"role": "system", "content": system_prompt},
        {"role": "system", "content": context_blob},
    ]
    for m in history:
        messages.append({"role": m.role, "content": m.content})

    # Tooling: expose user-scoped CRUD tools to all users; admin tools to admins only
    tools: List[Dict[str, Any]] = [
        # User weight tools
        {
            "type": "function",
            "function": {
                "name": "user_create_weight",
                "description": "Create a weight entry for the current user.",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "date_of_measurement": {"type": "string", "description": "YYYY-MM-DD"},
                        "weight": {"type": "number"},
                        "body_fat_percentage": {"type": ["number", "null"]},
                        "muscle_mass": {"type": ["number", "null"]},
                        "notes": {"type": ["string", "null"]},
                    },
                    "required": ["date_of_measurement", "weight"],
                },
            },
        },
        {
            "type": "function",
            "function": {
                "name": "user_update_latest_weight",
                "description": "Update the most recent weight entry for the current user.",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "weight": {"type": "number"},
                    },
                    "required": ["weight"],
                },
            },
        },
        {
            "type": "function",
            "function": {
                "name": "user_update_weight_by_date",
                "description": "Update the weight value for a specific date (YYYY-MM-DD) for the current user.",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "date_of_measurement": {"type": "string", "description": "YYYY-MM-DD"},
                        "weight": {"type": "number"},
                    },
                    "required": ["date_of_measurement", "weight"],
                },
            },
        },
        {
            "type": "function",
            "function": {
                "name": "user_update_weight",
                "description": "Update a weight entry by id for the current user.",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "weight_id": {"type": "integer"},
                        "date_of_measurement": {"type": ["string", "null"], "description": "YYYY-MM-DD"},
                        "weight": {"type": ["number", "null"]},
                        "body_fat_percentage": {"type": ["number", "null"]},
                        "muscle_mass": {"type": ["number", "null"]},
                        "notes": {"type": ["string", "null"]},
                    },
                    "required": ["weight_id"],
                },
            },
        },
        {
            "type": "function",
            "function": {
                "name": "user_delete_weight",
                "description": "Delete a weight entry by id for the current user.",
                "parameters": {
                    "type": "object",
                    "properties": {"weight_id": {"type": "integer"}},
                    "required": ["weight_id"],
                },
            },
        },
        # User target tools
        {
            "type": "function",
            "function": {
                "name": "user_create_target",
                "description": "Create a target for the current user.",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "date_of_target": {"type": "string", "description": "YYYY-MM-DD"},
                        "target_weight": {"type": "number"},
                    },
                    "required": ["date_of_target", "target_weight"],
                },
            },
        },
        {
            "type": "function",
            "function": {
                "name": "user_update_target",
                "description": "Update a target by id for the current user.",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "target_id": {"type": "integer"},
                        "date_of_target": {"type": ["string", "null"], "description": "YYYY-MM-DD"},
                        "target_weight": {"type": ["number", "null"]},
                        "status": {"type": ["string", "null"], "enum": ["active", "completed", "cancelled"]},
                    },
                    "required": ["target_id"],
                },
            },
        },
        {
            "type": "function",
            "function": {
                "name": "user_delete_target",
                "description": "Delete a target by id for the current user.",
                "parameters": {
                    "type": "object",
                    "properties": {"target_id": {"type": "integer"}},
                    "required": ["target_id"],
                },
            },
        },
    ]
    if current_user.is_admin:
        tools += [
            {
                "type": "function",
                "function": {
                    "name": "admin_create_user",
                    "description": "Create a new user account. Admin only.",
                    "parameters": {
                        "type": "object",
                        "properties": {
                            "name": {"type": "string", "description": "Unique username"},
                            "password": {"type": "string", "description": "Initial password (min 8 chars)"},
                            "email": {"type": ["string", "null"]},
                            "sex": {"type": ["string", "null"]},
                            "height": {"type": ["number", "null"]},
                            "activity_level": {"type": ["string", "null"]},
                            "date_of_birth": {"type": ["string", "null"], "description": "YYYY-MM-DD"},
                            "is_admin": {"type": ["boolean", "null"]},
                        },
                        "required": ["name", "password"],
                    },
                },
            },
            {
                "type": "function",
                "function": {
                    "name": "admin_set_user_password",
                    "description": "Set or reset a user's password. Admin only.",
                    "parameters": {
                        "type": "object",
                        "properties": {
                            "user_id": {"type": "integer"},
                            "new_password": {"type": "string"},
                        },
                        "required": ["user_id", "new_password"],
                    },
                },
            },
            {
                "type": "function",
                "function": {
                    "name": "admin_update_user",
                    "description": "Update user profile fields. Admin only.",
                    "parameters": {
                        "type": "object",
                        "properties": {
                            "user_id": {"type": "integer"},
                            "name": {"type": ["string", "null"]},
                            "email": {"type": ["string", "null"]},
                            "sex": {"type": ["string", "null"]},
                            "height": {"type": ["number", "null"]},
                            "activity_level": {"type": ["string", "null"]},
                            "date_of_birth": {"type": ["string", "null"], "description": "YYYY-MM-DD"},
                        },
                        "required": ["user_id"],
                    },
                },
            },
            {
                "type": "function",
                "function": {
                    "name": "admin_delete_user",
                    "description": "Delete a user (cascades to their data). Admin only.",
                    "parameters": {
                        "type": "object",
                        "properties": {"user_id": {"type": "integer"}},
                        "required": ["user_id"],
                    },
                },
            },
            {
                "type": "function",
                "function": {
                    "name": "admin_delete_target",
                    "description": "Delete a target by id. Admin only.",
                    "parameters": {
                        "type": "object",
                        "properties": {"target_id": {"type": "integer"}},
                        "required": ["target_id"],
                    },
                },
            },
        ]

    def _tool_result(name: str, data: Any, ok: bool = True) -> str:
        return str({"tool": name, "ok": ok, "data": data})

    # Capture the last user message text to validate explicit confirmations
    last_user_text = ""
    for m in reversed(history):
        if m.role == "user":
            last_user_text = m.content or ""
            break

    def _exec_tool(name: str, args: Dict[str, Any]) -> str:
        try:
            # ---------- User tools ----------
            if name == "user_create_weight":
                from datetime import date as _date
                dom = args.get("date_of_measurement")
                w = args.get("weight")
                if not dom or w is None:
                    return _tool_result(name, {"error": "Missing required: date_of_measurement, weight"}, ok=False)
                try:
                    dom_d = _date.fromisoformat(str(dom))
                except Exception:
                    return _tool_result(name, {"error": "Invalid date_of_measurement format (use YYYY-MM-DD)"}, ok=False)
                # Check duplicate
                existing = db.query(models.Weight).filter(models.Weight.user_id == current_user.id, models.Weight.date_of_measurement == dom_d).first()
                if existing:
                    return _tool_result(name, {"error": f"Weight entry already exists for {dom}"}, ok=False)
                obj = models.Weight(
                    user_id=current_user.id,
                    date_of_measurement=dom_d,
                    weight=w,
                    body_fat_percentage=args.get("body_fat_percentage"),
                    muscle_mass=args.get("muscle_mass"),
                    notes=args.get("notes"),
                )

                # Auto-estimate missing values if profile allows
                height_cm = float(current_user.height) if current_user.height is not None else None
                age_years = _age_on(current_user.date_of_birth, dom_d)
                bmi = _calculate_bmi(float(w), height_cm)
                if obj.body_fat_percentage is None:
                    est_bf = _estimate_body_fat_percent(bmi, age_years, current_user.sex)
                    if est_bf is not None:
                        obj.body_fat_percentage = est_bf
                if obj.muscle_mass is None:
                    est_lbm = _estimate_lean_body_mass(float(w), height_cm, current_user.sex)
                    if est_lbm is not None:
                        obj.muscle_mass = est_lbm

                db.add(obj)
                db.commit()
                db.refresh(obj)
                return _tool_result(name, {"id": obj.id, "date": obj.date_of_measurement.isoformat(), "weight": float(obj.weight)})

            if name == "user_update_weight":
                from datetime import date as _date
                wid = int(args.get("weight_id"))
                obj = db.query(models.Weight).filter(models.Weight.id == wid, models.Weight.user_id == current_user.id).first()
                if not obj:
                    return _tool_result(name, {"error": "Weight entry not found"}, ok=False)
                if args.get("date_of_measurement") is not None:
                    try:
                        dom_d = _date.fromisoformat(str(args.get("date_of_measurement")))
                    except Exception:
                        return _tool_result(name, {"error": "Invalid date_of_measurement format (use YYYY-MM-DD)"}, ok=False)
                    # check duplicate
                    dup = db.query(models.Weight).filter(models.Weight.user_id == current_user.id, models.Weight.date_of_measurement == dom_d, models.Weight.id != wid).first()
                    if dup:
                        return _tool_result(name, {"error": f"Weight entry already exists for {dom_d}"}, ok=False)
                    obj.date_of_measurement = dom_d
                for fld in ["weight", "body_fat_percentage", "muscle_mass", "notes"]:
                    if fld in args and args[fld] is not None:
                        setattr(obj, fld, args[fld])
                db.commit()
                db.refresh(obj)
                return _tool_result(name, {"id": obj.id, "date": obj.date_of_measurement.isoformat(), "weight": float(obj.weight)})

            if name == "user_delete_weight":
                wid = int(args.get("weight_id"))
                obj = db.query(models.Weight).filter(models.Weight.id == wid, models.Weight.user_id == current_user.id).first()
                if not obj:
                    return _tool_result(name, {"error": "Weight entry not found"}, ok=False)
                db.delete(obj)
                db.commit()
                return _tool_result(name, {"message": "Weight entry deleted"})

            if name == "user_update_latest_weight":
                from sqlalchemy import desc as _desc
                new_w = args.get("weight")
                if new_w is None:
                    return _tool_result(name, {"error": "Missing required: weight"}, ok=False)
                obj = db.query(models.Weight).filter(models.Weight.user_id == current_user.id).order_by(_desc(models.Weight.date_of_measurement)).first()
                if not obj:
                    return _tool_result(name, {"error": "No weight entries found to update. Consider creating one first."}, ok=False)
                obj.weight = new_w
                db.commit()
                db.refresh(obj)
                return _tool_result(name, {"id": obj.id, "date": obj.date_of_measurement.isoformat(), "weight": float(obj.weight)})

            if name == "user_update_weight_by_date":
                from datetime import date as _date
                dom = args.get("date_of_measurement")
                new_w = args.get("weight")
                if not dom or new_w is None:
                    return _tool_result(name, {"error": "Missing required: date_of_measurement, weight"}, ok=False)
                try:
                    dom_d = _date.fromisoformat(str(dom))
                except Exception:
                    return _tool_result(name, {"error": "Invalid date_of_measurement format (use YYYY-MM-DD)"}, ok=False)
                obj = db.query(models.Weight).filter(models.Weight.user_id == current_user.id, models.Weight.date_of_measurement == dom_d).first()
                if not obj:
                    return _tool_result(name, {"error": f"No weight entry found for {dom}"}, ok=False)
                obj.weight = new_w
                db.commit()
                db.refresh(obj)
                return _tool_result(name, {"id": obj.id, "date": obj.date_of_measurement.isoformat(), "weight": float(obj.weight)})

            if name == "user_create_target":
                from datetime import date as _date
                dot = args.get("date_of_target")
                tw = args.get("target_weight")
                if not dot or tw is None:
                    return _tool_result(name, {"error": "Missing required: date_of_target, target_weight"}, ok=False)
                try:
                    dot_d = _date.fromisoformat(str(dot))
                except Exception:
                    return _tool_result(name, {"error": "Invalid date_of_target format (use YYYY-MM-DD)"}, ok=False)
                obj = models.TargetWeight(
                    user_id=current_user.id,
                    date_of_target=dot_d,
                    target_weight=tw,
                    status="active",
                )
                db.add(obj)
                db.commit()
                db.refresh(obj)
                return _tool_result(name, {"id": obj.id, "date_of_target": obj.date_of_target.isoformat(), "target_weight": float(obj.target_weight), "status": obj.status})

            if name == "user_update_target":
                from datetime import date as _date
                tid = int(args.get("target_id"))
                obj = db.query(models.TargetWeight).filter(models.TargetWeight.id == tid, models.TargetWeight.user_id == current_user.id).first()
                if not obj:
                    return _tool_result(name, {"error": "Target not found"}, ok=False)
                if args.get("date_of_target") is not None:
                    try:
                        dot_d = _date.fromisoformat(str(args.get("date_of_target")))
                    except Exception:
                        return _tool_result(name, {"error": "Invalid date_of_target format (use YYYY-MM-DD)"}, ok=False)
                    obj.date_of_target = dot_d
                if args.get("target_weight") is not None:
                    obj.target_weight = args.get("target_weight")
                if args.get("status") is not None:
                    status_val = str(args.get("status"))
                    if status_val not in ["active", "completed", "cancelled"]:
                        return _tool_result(name, {"error": "Status must be one of: active, completed, cancelled"}, ok=False)
                    obj.status = status_val
                db.commit()
                db.refresh(obj)
                return _tool_result(name, {"id": obj.id, "date_of_target": obj.date_of_target.isoformat(), "target_weight": float(obj.target_weight), "status": obj.status})

            if name == "user_delete_target":
                tid = int(args.get("target_id"))
                obj = db.query(models.TargetWeight).filter(models.TargetWeight.id == tid, models.TargetWeight.user_id == current_user.id).first()
                if not obj:
                    return _tool_result(name, {"error": "Target not found"}, ok=False)
                db.delete(obj)
                db.commit()
                return _tool_result(name, {"message": "Target deleted"})

            # ---------- Admin tools ----------
            if name == "admin_create_user":
                required = ["name", "password"]
                for r in required:
                    if not args.get(r):
                        return _tool_result(name, {"error": f"Missing required: {r}"}, ok=False)
                # Require that the user explicitly provided a password in their last message
                # to avoid the model inventing a password. If the last user text doesn't mention
                # a password, ask for it explicitly.
                if "password" not in (last_user_text or "").lower():
                    return _tool_result(name, {"error": "Password not confirmed by user. Ask the user to provide a password explicitly."}, ok=False)
                from ..auth import get_password_hash
                # Uniqueness checks
                existing_user = db.query(models.User).filter(models.User.name == args["name"]).first()
                if existing_user:
                    return _tool_result(name, {"error": "Username already registered"}, ok=False)
                if args.get("email"):
                    existing_email = db.query(models.User).filter(models.User.email == args.get("email")).first()
                    if existing_email:
                        return _tool_result(name, {"error": "Email already registered"}, ok=False)
                u = models.User(
                    name=args["name"],
                    email=args.get("email"),
                    password_hash=get_password_hash(args["password"]),
                    sex=args.get("sex"),
                    height=args.get("height"),
                    activity_level=args.get("activity_level"),
                    date_of_birth=args.get("date_of_birth"),
                    is_admin=bool(args.get("is_admin") or False),
                )
                db.add(u)
                db.commit()
                db.refresh(u)
                return _tool_result(name, {"id": u.id, "name": u.name, "is_admin": u.is_admin})

            if name == "admin_set_user_password":
                if len(args.get("new_password", "")) < 8:
                    return _tool_result(name, {"error": "Password must be at least 8 characters"}, ok=False)
                u = db.query(models.User).filter(models.User.id == int(args["user_id"])).first()
                if not u:
                    return _tool_result(name, {"error": "User not found"}, ok=False)
                from ..auth import get_password_hash
                u.password_hash = get_password_hash(args["new_password"])
                db.commit()
                return _tool_result(name, {"message": "Password updated"})

            if name == "admin_update_user":
                u = db.query(models.User).filter(models.User.id == int(args["user_id"])) .first()
                if not u:
                    return _tool_result(name, {"error": "User not found"}, ok=False)
                # Name uniqueness
                if args.get("name") is not None:
                    exists = db.query(models.User).filter(models.User.name == args["name"], models.User.id != u.id).first()
                    if exists:
                        return _tool_result(name, {"error": "Username already taken"}, ok=False)
                    u.name = args["name"]
                # Email uniqueness
                if args.get("email") is not None:
                    if args.get("email"):
                        exists_email = db.query(models.User).filter(models.User.email == args["email"], models.User.id != u.id).first()
                        if exists_email:
                            return _tool_result(name, {"error": "Email already in use"}, ok=False)
                        u.email = args["email"]
                    else:
                        u.email = None
                for field in ["sex", "height", "activity_level", "date_of_birth"]:
                    if field in args and args[field] is not None:
                        setattr(u, field, args[field])
                db.commit()
                db.refresh(u)
                return _tool_result(name, {"id": u.id, "name": u.name})

            if name == "admin_delete_user":
                u = db.query(models.User).filter(models.User.id == int(args["user_id"])) .first()
                if not u:
                    return _tool_result(name, {"error": "User not found"}, ok=False)
                db.delete(u)
                db.commit()
                return _tool_result(name, {"message": "User deleted"})

            if name == "admin_delete_target":
                t = db.query(models.TargetWeight).filter(models.TargetWeight.id == int(args["target_id"])) .first()
                if not t:
                    return _tool_result(name, {"error": "Target not found"}, ok=False)
                db.delete(t)
                db.commit()
                return _tool_result(name, {"message": "Target deleted"})

            return _tool_result(name, {"error": "Unknown tool"}, ok=False)
        except Exception as e:
            return _tool_result(name, {"error": str(e)}, ok=False)

    try:
        client = OpenAI(api_key=settings.openai_api_key)
        model_name = settings.model_id or "gpt-4o"
        # First completion with optional tools
        completion = client.chat.completions.create(
            model=model_name,
            messages=messages,
            temperature=0.2,
            tools=tools if tools else None,
            tool_choice="auto" if tools else None,
        )

        msg = completion.choices[0].message
        # Tool loop
        safety_counter = 0
        while getattr(msg, "tool_calls", None) and safety_counter < 3 and current_user.is_admin:
            safety_counter += 1
            messages.append({"role": "assistant", "content": msg.content or "", "tool_calls": [tc.model_dump() for tc in msg.tool_calls]})
            for tc in msg.tool_calls:
                name = tc.function.name
                import json as _json
                try:
                    args = _json.loads(tc.function.arguments or "{}")
                except Exception:
                    args = {}
                result_str = _exec_tool(name, args)
                messages.append({"role": "tool", "tool_call_id": tc.id, "name": name, "content": result_str})
            # Follow-up completion after tool execution
            completion = client.chat.completions.create(
                model=model_name,
                messages=messages,
                temperature=0.2,
            )
            msg = completion.choices[0].message

        reply = msg.content or ""
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"OpenAI error: {e}")

    return ChatResponse(reply=reply)
