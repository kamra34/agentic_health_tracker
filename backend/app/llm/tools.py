from __future__ import annotations
from typing import Optional, Dict, Any, List
from datetime import date, datetime, timedelta

from sqlalchemy.orm import Session
from sqlalchemy import inspect

from .. import models
from ..database import engine


def safe_float(val: Any) -> Optional[float]:
    try:
        if val is None:
            return None
        return float(val)
    except Exception:
        return None


def parse_date_str(s: str) -> Optional[date]:
    if s is None:
        return None
    try:
        return date.fromisoformat(str(s))
    except Exception:
        pass
    try:
        from dateutil import parser as _parser
        dt = _parser.parse(str(s))
        return dt.date()
    except Exception:
        return None


def summarize_schema() -> str:
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


def gather_user_context(db: Session, user: models.User) -> Dict[str, Any]:
    ctx: Dict[str, Any] = {}
    ctx["user_profile"] = {
        "id": user.id,
        "name": user.name,
        "email": user.email,
        "sex": user.sex,
        "height_cm": safe_float(user.height),
        "activity_level": user.activity_level,
        "date_of_birth": user.date_of_birth.isoformat() if user.date_of_birth else None,
        "is_admin": bool(user.is_admin),
        "created_at": user.created_at.isoformat() if user.created_at else None,
    }
    # latest 30 weights (quick context only)
    weights = (
        db.query(models.Weight)
        .filter(models.Weight.user_id == user.id)
        .order_by(models.Weight.date_of_measurement.desc())
        .limit(30)
        .all()
    )
    ctx["recent_weights"] = [
        {
            "date": w.date_of_measurement.isoformat() if w.date_of_measurement else None,
            "weight_kg": safe_float(w.weight),
            "body_fat_pct": safe_float(w.body_fat_percentage),
            "muscle_mass": safe_float(w.muscle_mass),
            "notes": w.notes,
        }
        for w in weights
    ]
    return ctx


# Analytics helpers
def calc_bmi(weight_kg: Optional[float], height_cm: Optional[float]) -> Optional[float]:
    if weight_kg is None or not height_cm or height_cm <= 0:
        return None
    h_m = float(height_cm) / 100.0
    try:
        return round(float(weight_kg) / (h_m * h_m), 2)
    except Exception:
        return None


def age_on(dob: Optional[date], on_date: Optional[date]) -> int:
    if not dob or not on_date:
        return 0
    years = on_date.year - dob.year - ((on_date.month, on_date.day) < (dob.month, dob.day))
    return max(0, years)


def is_male(sex: Optional[str]) -> bool:
    if not sex:
        return False
    s = str(sex).strip().lower()
    return s.startswith("m")


def estimate_body_fat_percent(bmi: Optional[float], age_years: int, sex: Optional[str]) -> Optional[float]:
    if bmi is None or bmi <= 0 or age_years <= 0:
        return None
    sex_flag = 1 if is_male(sex) else 0
    bf = 1.2 * bmi + 0.23 * age_years - 10.8 * sex_flag - 5.4
    bf = max(3.0, min(60.0, bf))
    return round(bf, 2)


def estimate_lean_body_mass(weight_kg: Optional[float], height_cm: Optional[float], sex: Optional[str]) -> Optional[float]:
    if weight_kg is None or not height_cm:
        return None
    if is_male(sex):
        lbm = 0.407 * float(weight_kg) + 0.267 * float(height_cm) - 19.2
    else:
        lbm = 0.252 * float(weight_kg) + 0.473 * float(height_cm) - 48.3
    lbm = max(0.0, min(float(weight_kg), lbm))
    return round(lbm, 2)

