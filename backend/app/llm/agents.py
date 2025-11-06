from __future__ import annotations
from typing import Any, Dict, List, Optional
from datetime import date, timedelta

from sqlalchemy.orm import Session
from sqlalchemy import func, desc, asc

from .. import models
from .tools import (
    parse_date_str,
    safe_float,
    calc_bmi,
    age_on,
    estimate_body_fat_percent,
    estimate_lean_body_mass,
)


class BaseAgent:
    name: str = "agent"

    def tools(self) -> List[Dict[str, Any]]:
        return []

    def execute(self, tool_name: str, args: Dict[str, Any]) -> Optional[Dict[str, Any]]:
        return None


class SQLAgent(BaseAgent):
    name = "sql"

    def __init__(self, db: Session, user: models.User):
        self.db = db
        self.user = user

    def tools(self) -> List[Dict[str, Any]]:
        return [
            {
                "type": "function",
                "function": {
                    "name": "weights_query",
                    "description": "Query weight entries with filters and sorting for the current user (or specific user if admin).",
                    "parameters": {
                        "type": "object",
                        "properties": {
                            "date_from": {"type": ["string", "null"]},
                            "date_to": {"type": ["string", "null"]},
                            "sort_by": {"type": ["string", "null"], "enum": ["date", "weight"]},
                            "order": {"type": ["string", "null"], "enum": ["asc", "desc"]},
                            "limit": {"type": ["integer", "null"], "minimum": 1, "maximum": 1000},
                        },
                        "required": [],
                    },
                },
            },
            {
                "type": "function",
                "function": {
                    "name": "weights_aggregate",
                    "description": "Aggregate over weights: max|min|avg|count, optionally within date range.",
                    "parameters": {
                        "type": "object",
                        "properties": {
                            "op": {"type": "string", "enum": ["max", "min", "avg", "count"]},
                            "date_from": {"type": ["string", "null"]},
                            "date_to": {"type": ["string", "null"]},
                        },
                        "required": ["op"],
                    },
                },
            },
            {
                "type": "function",
                "function": {
                    "name": "targets_query",
                    "description": "Query target entries with filters and sorting for the current user.",
                    "parameters": {
                        "type": "object",
                        "properties": {
                            "status": {"type": ["string", "null"], "enum": ["active", "completed", "cancelled"]},
                            "date_from": {"type": ["string", "null"]},
                            "date_to": {"type": ["string", "null"]},
                            "sort_by": {"type": ["string", "null"], "enum": ["created", "target_date"]},
                            "order": {"type": ["string", "null"], "enum": ["asc", "desc"]},
                            "limit": {"type": ["integer", "null"], "minimum": 1, "maximum": 1000},
                        },
                        "required": [],
                    },
                },
            },
        ]

    def execute(self, tool_name: str, args: Dict[str, Any]) -> Optional[Dict[str, Any]]:
        if tool_name == "weights_query":
            date_from = parse_date_str(args.get("date_from")) if args.get("date_from") else None
            date_to = parse_date_str(args.get("date_to")) if args.get("date_to") else None
            q = self.db.query(models.Weight).filter(models.Weight.user_id == self.user.id)
            if date_from:
                q = q.filter(models.Weight.date_of_measurement >= date_from)
            if date_to:
                q = q.filter(models.Weight.date_of_measurement <= date_to)
            sort_by = args.get("sort_by") or "date"
            order = args.get("order") or "desc"
            if sort_by == "weight":
                q = q.order_by(desc(models.Weight.weight) if order == "desc" else asc(models.Weight.weight))
            else:
                q = q.order_by(desc(models.Weight.date_of_measurement) if order == "desc" else asc(models.Weight.date_of_measurement))
            limit = args.get("limit") or 200
            rows = q.limit(min(int(limit), 1000)).all()
            data = [
                {
                    "id": r.id,
                    "date": r.date_of_measurement.isoformat() if r.date_of_measurement else None,
                    "weight_kg": safe_float(r.weight),
                    "body_fat_pct": safe_float(r.body_fat_percentage),
                    "muscle_mass": safe_float(r.muscle_mass),
                    "notes": r.notes,
                }
                for r in rows
            ]
            return {"rows": data}

        if tool_name == "weights_aggregate":
            op = (args.get("op") or "max").lower()
            date_from = parse_date_str(args.get("date_from")) if args.get("date_from") else None
            date_to = parse_date_str(args.get("date_to")) if args.get("date_to") else None
            q = self.db.query(models.Weight).filter(models.Weight.user_id == self.user.id)
            if date_from:
                q = q.filter(models.Weight.date_of_measurement >= date_from)
            if date_to:
                q = q.filter(models.Weight.date_of_measurement <= date_to)
            if op == "count":
                return {"op": op, "value": int(q.count())}
            if op == "avg":
                val = q.with_entities(func.avg(models.Weight.weight)).scalar()
                return {"op": op, "value": safe_float(val)}
            if op == "max":
                rec = q.order_by(models.Weight.weight.desc(), models.Weight.date_of_measurement.desc()).first()
                if not rec:
                    return {"op": op, "value": None}
                return {"op": op, "value": safe_float(rec.weight), "date": rec.date_of_measurement.isoformat() if rec.date_of_measurement else None, "id": rec.id}
            if op == "min":
                rec = q.order_by(models.Weight.weight.asc(), models.Weight.date_of_measurement.desc()).first()
                if not rec:
                    return {"op": op, "value": None}
                return {"op": op, "value": safe_float(rec.weight), "date": rec.date_of_measurement.isoformat() if rec.date_of_measurement else None, "id": rec.id}
            return {"error": f"Unsupported op: {op}"}

        if tool_name == "targets_query":
            status = args.get("status")
            date_from = parse_date_str(args.get("date_from")) if args.get("date_from") else None
            date_to = parse_date_str(args.get("date_to")) if args.get("date_to") else None
            q = self.db.query(models.TargetWeight).filter(models.TargetWeight.user_id == self.user.id)
            if status:
                q = q.filter(models.TargetWeight.status == status)
            if date_from:
                q = q.filter(models.TargetWeight.date_of_target >= date_from)
            if date_to:
                q = q.filter(models.TargetWeight.date_of_target <= date_to)
            sort_by = args.get("sort_by") or "created"
            order = args.get("order") or "desc"
            if sort_by == "target_date":
                q = q.order_by(desc(models.TargetWeight.date_of_target) if order == "desc" else asc(models.TargetWeight.date_of_target))
            else:
                q = q.order_by(desc(models.TargetWeight.created_date) if order == "desc" else asc(models.TargetWeight.created_date))
            limit = args.get("limit") or 200
            rows = q.limit(min(int(limit), 1000)).all()
            data = [
                {
                    "id": r.id,
                    "created_date": r.created_date.isoformat() if r.created_date else None,
                    "date_of_target": r.date_of_target.isoformat() if r.date_of_target else None,
                    "target_weight": safe_float(r.target_weight),
                    "status": r.status,
                }
                for r in rows
            ]
            return {"rows": data}

        return None


class AnalyticsAgent(BaseAgent):
    name = "analytics"

    def __init__(self, db: Session, user: models.User):
        self.db = db
        self.user = user

    def tools(self) -> List[Dict[str, Any]]:
        return [
            {
                "type": "function",
                "function": {
                    "name": "user_weight_change_periods",
                    "description": "Compute weight change over given periods (in days). Includes BMI/body-fat/lean estimates when possible.",
                    "parameters": {
                        "type": "object",
                        "properties": {
                            "periods_days": {
                                "type": "array",
                                "items": {"type": "integer", "minimum": 1},
                            }
                        },
                        "required": ["periods_days"],
                    },
                },
            },
            {
                "type": "function",
                "function": {
                    "name": "user_avg_weight_change",
                    "description": "Compute average weight change per day/week/month over a date range for the current user.",
                    "parameters": {
                        "type": "object",
                        "properties": {
                            "date_from": {"type": "string"},
                            "date_to": {"type": ["string", "null"]},
                        },
                        "required": ["date_from"],
                    },
                },
            },
        ]

    def execute(self, tool_name: str, args: Dict[str, Any]) -> Optional[Dict[str, Any]]:
        if tool_name == "user_avg_weight_change":
            d_from = parse_date_str(args.get("date_from")) if args.get("date_from") else None
            d_to = parse_date_str(args.get("date_to")) if args.get("date_to") else None
            if not d_from:
                return {"error": "Invalid date_from"}
            # end = latest record if date_to not provided
            q = self.db.query(models.Weight).filter(models.Weight.user_id == self.user.id)
            if d_to:
                q = q.filter(models.Weight.date_of_measurement <= d_to)
            latest = q.order_by(models.Weight.date_of_measurement.desc()).first()
            if not latest:
                return {"error": "No weights found in range"}
            end_date = latest.date_of_measurement
            end_w = safe_float(latest.weight)
            # find first at or after d_from; if none, first after
            start_q = self.db.query(models.Weight).filter(
                models.Weight.user_id == self.user.id,
                models.Weight.date_of_measurement >= d_from
            ).order_by(models.Weight.date_of_measurement.asc())
            start_row = start_q.first()
            if not start_row:
                # choose the earliest available after the date_from window (already handled by query)
                return {"error": "No starting weight found on/after date_from"}
            start_date = start_row.date_of_measurement
            start_w = safe_float(start_row.weight)
            days = (end_date - start_date).days or 0
            if days <= 0 or start_w is None or end_w is None:
                return {
                    "start_date": start_date.isoformat() if start_date else None,
                    "end_date": end_date.isoformat() if end_date else None,
                    "delta_kg": None,
                    "days": days,
                    "per_day": None,
                    "per_week": None,
                    "per_month": None,
                }
            delta = round(end_w - start_w, 3)
            per_day = round(delta / days, 4)
            per_week = round(per_day * 7, 4)
            per_month = round(per_day * 30.4375, 4)
            return {
                "start_date": start_date.isoformat(),
                "start_weight_kg": start_w,
                "end_date": end_date.isoformat(),
                "end_weight_kg": end_w,
                "delta_kg": delta,
                "days": days,
                "per_day": per_day,
                "per_week": per_week,
                "per_month": per_month,
            }
        if tool_name != "user_weight_change_periods":
            return None
        periods = args.get("periods_days") or []
        if not isinstance(periods, list) or not periods:
            return {"error": "periods_days must be a non-empty array"}
        latest = self.db.query(models.Weight).filter(models.Weight.user_id == self.user.id).order_by(models.Weight.date_of_measurement.desc()).first()
        if not latest:
            return {"error": "No weights found"}
        today = latest.date_of_measurement or date.today()
        latest_w = safe_float(latest.weight)
        height_cm = safe_float(self.user.height)
        now_bmi = calc_bmi(latest_w, height_cm)
        now_age = age_on(self.user.date_of_birth, today)
        now_bf = estimate_body_fat_percent(now_bmi, now_age, self.user.sex)
        now_lbm = estimate_lean_body_mass(latest_w, height_cm, self.user.sex)

        out = {"latest": {
            "date": today.isoformat(),
            "weight_kg": latest_w,
            "bmi": now_bmi,
            "body_fat_pct": now_bf,
            "lean_mass_kg": now_lbm,
        }, "periods": []}

        for d in periods:
            try:
                d_int = int(d)
            except Exception:
                continue
            target_date = today - timedelta(days=d_int)
            prev = self.db.query(models.Weight).filter(
                models.Weight.user_id == self.user.id,
                models.Weight.date_of_measurement <= target_date
            ).order_by(models.Weight.date_of_measurement.desc()).first()
            if not prev:
                prev = self.db.query(models.Weight).filter(
                    models.Weight.user_id == self.user.id,
                    models.Weight.date_of_measurement > target_date
                ).order_by(models.Weight.date_of_measurement).first()
            if not prev:
                out["periods"].append({
                    "days": d_int, "start_date": None, "start_weight_kg": None,
                    "end_date": today.isoformat(), "end_weight_kg": latest_w,
                    "delta_kg": None, "bmi_start": None, "bmi_end": now_bmi,
                    "body_fat_start": None, "body_fat_end": now_bf,
                    "lean_mass_start": None, "lean_mass_end": now_lbm,
                })
                continue
            start_w = safe_float(prev.weight)
            start_date = prev.date_of_measurement
            start_bmi = calc_bmi(start_w, height_cm)
            start_age = age_on(self.user.date_of_birth, start_date)
            start_bf = estimate_body_fat_percent(start_bmi, start_age, self.user.sex)
            start_lbm = estimate_lean_body_mass(start_w, height_cm, self.user.sex)
            delta = None
            if start_w is not None and latest_w is not None:
                delta = round(latest_w - start_w, 2)
            out["periods"].append({
                "days": d_int,
                "start_date": start_date.isoformat() if start_date else None,
                "start_weight_kg": start_w,
                "end_date": today.isoformat(),
                "end_weight_kg": latest_w,
                "delta_kg": delta,
                "bmi_start": start_bmi,
                "bmi_end": now_bmi,
                "body_fat_start": start_bf,
                "body_fat_end": now_bf,
                "lean_mass_start": start_lbm,
                "lean_mass_end": now_lbm,
            })
        return out

class ActionAgent(BaseAgent):
    name = "action"

    def __init__(self, db: Session, user: models.User):
        self.db = db
        self.user = user

    def tools(self) -> List[Dict[str, Any]]:
        return [
            {
                "type": "function",
                "function": {
                    "name": "user_create_weight",
                    "description": "Create weight entry (no future dates).",
                    "parameters": {
                        "type": "object",
                        "properties": {
                            "date_of_measurement": {"type": "string"},
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
                    "description": "Update most recent weight value.",
                    "parameters": {
                        "type": "object",
                        "properties": {"weight": {"type": "number"}},
                        "required": ["weight"],
                    },
                },
            },
            {
                "type": "function",
                "function": {
                    "name": "user_update_weight_by_date",
                    "description": "Update weight for a specific date (no future dates).",
                    "parameters": {
                        "type": "object",
                        "properties": {
                            "date_of_measurement": {"type": "string"},
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
                    "description": "Update a weight entry by id.",
                    "parameters": {
                        "type": "object",
                        "properties": {
                            "weight_id": {"type": "integer"},
                            "date_of_measurement": {"type": ["string", "null"]},
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
                    "description": "Delete a weight entry by id.",
                    "parameters": {
                        "type": "object",
                        "properties": {"weight_id": {"type": "integer"}},
                        "required": ["weight_id"],
                    },
                },
            },
            {
                "type": "function",
                "function": {
                    "name": "user_create_target",
                    "description": "Create a target (no past date).",
                    "parameters": {
                        "type": "object",
                        "properties": {
                            "date_of_target": {"type": "string"},
                            "target_weight": {"type": "number"},
                        },
                        "required": ["date_of_target", "target_weight"],
                    },
                },
            },
            {
                "type": "function",
                "function": {
                    "name": "user_update_active_target",
                    "description": "Update single active target (no past date).",
                    "parameters": {
                        "type": "object",
                        "properties": {
                            "date_of_target": {"type": ["string", "null"]},
                            "target_weight": {"type": ["number", "null"]},
                            "status": {"type": ["string", "null"], "enum": ["active", "completed", "cancelled"]},
                        },
                        "required": [],
                    },
                },
            },
            {
                "type": "function",
                "function": {
                    "name": "user_update_target",
                    "description": "Update a target by id (no past date for active).",
                    "parameters": {
                        "type": "object",
                        "properties": {
                            "target_id": {"type": "integer"},
                            "date_of_target": {"type": ["string", "null"]},
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
                    "description": "Delete a target by id.",
                    "parameters": {
                        "type": "object",
                        "properties": {"target_id": {"type": "integer"}},
                        "required": ["target_id"],
                    },
                },
            },
        ]

    def execute(self, tool_name: str, args: Dict[str, Any]) -> Optional[Dict[str, Any]]:
        from datetime import date as _date
        # Weights
        if tool_name == "user_create_weight":
            dom = args.get("date_of_measurement")
            w = args.get("weight")
            dom_d = parse_date_str(dom)
            if not dom_d or w is None:
                return {"error": "Missing/invalid date_of_measurement or weight"}
            if dom_d > _date.today():
                return {"error": "Cannot set a weight entry in the future"}
            existing = self.db.query(models.Weight).filter(models.Weight.user_id == self.user.id, models.Weight.date_of_measurement == dom_d).first()
            if existing:
                return {"error": f"Weight entry already exists for {dom}"}
            obj = models.Weight(
                user_id=self.user.id,
                date_of_measurement=dom_d,
                weight=w,
                body_fat_percentage=args.get("body_fat_percentage"),
                muscle_mass=args.get("muscle_mass"),
                notes=args.get("notes"),
            )
            self.db.add(obj)
            self.db.commit()
            self.db.refresh(obj)
            return {"id": obj.id, "date": obj.date_of_measurement.isoformat(), "weight": safe_float(obj.weight)}

        if tool_name == "user_update_latest_weight":
            from sqlalchemy import desc as _desc
            new_w = args.get("weight")
            if new_w is None:
                return {"error": "Missing weight"}
            obj = self.db.query(models.Weight).filter(models.Weight.user_id == self.user.id).order_by(_desc(models.Weight.date_of_measurement)).first()
            if not obj:
                return {"error": "No weight entries found"}
            obj.weight = new_w
            self.db.commit()
            self.db.refresh(obj)
            return {"id": obj.id, "date": obj.date_of_measurement.isoformat(), "weight": safe_float(obj.weight)}

        if tool_name == "user_update_weight_by_date":
            dom = args.get("date_of_measurement")
            new_w = args.get("weight")
            dom_d = parse_date_str(dom)
            if not dom_d or new_w is None:
                return {"error": "Missing/invalid date_of_measurement or weight"}
            if dom_d > _date.today():
                return {"error": "Cannot set a weight entry in the future"}
            obj = self.db.query(models.Weight).filter(models.Weight.user_id == self.user.id, models.Weight.date_of_measurement == dom_d).first()
            if not obj:
                return {"error": f"No weight entry found for {dom}"}
            obj.weight = new_w
            self.db.commit()
            self.db.refresh(obj)
            return {"id": obj.id, "date": obj.date_of_measurement.isoformat(), "weight": safe_float(obj.weight)}

        if tool_name == "user_update_weight":
            wid = int(args.get("weight_id"))
            obj = self.db.query(models.Weight).filter(models.Weight.id == wid, models.Weight.user_id == self.user.id).first()
            if not obj:
                return {"error": "Weight entry not found"}
            if args.get("date_of_measurement") is not None:
                dom_d = parse_date_str(args.get("date_of_measurement"))
                if not dom_d:
                    return {"error": "Invalid date_of_measurement"}
                if dom_d > _date.today():
                    return {"error": "Cannot set a weight entry in the future"}
                dup = self.db.query(models.Weight).filter(models.Weight.user_id == self.user.id, models.Weight.date_of_measurement == dom_d, models.Weight.id != wid).first()
                if dup:
                    return {"error": f"Weight entry already exists for {dom_d}"}
                obj.date_of_measurement = dom_d
            for fld in ["weight", "body_fat_percentage", "muscle_mass", "notes"]:
                if fld in args and args[fld] is not None:
                    setattr(obj, fld, args[fld])
            self.db.commit()
            self.db.refresh(obj)
            return {"id": obj.id, "date": obj.date_of_measurement.isoformat(), "weight": safe_float(obj.weight)}

        if tool_name == "user_delete_weight":
            wid = int(args.get("weight_id"))
            obj = self.db.query(models.Weight).filter(models.Weight.id == wid, models.Weight.user_id == self.user.id).first()
            if not obj:
                return {"error": "Weight entry not found"}
            self.db.delete(obj)
            self.db.commit()
            return {"message": "Weight entry deleted"}

        if tool_name == "user_create_target":
            dot = args.get("date_of_target")
            tw = args.get("target_weight")
            dot_d = parse_date_str(dot)
            if not dot_d or tw is None:
                return {"error": "Missing/invalid date_of_target or target_weight"}
            if dot_d < _date.today():
                return {"error": "Cannot create a target in the past"}
            obj = models.TargetWeight(
                user_id=self.user.id,
                date_of_target=dot_d,
                target_weight=tw,
                status="active",
            )
            self.db.add(obj)
            self.db.commit()
            self.db.refresh(obj)
            return {"id": obj.id, "date_of_target": obj.date_of_target.isoformat(), "target_weight": safe_float(obj.target_weight), "status": obj.status}

        if tool_name == "user_update_active_target":
            active = self.db.query(models.TargetWeight).filter(models.TargetWeight.user_id == self.user.id, models.TargetWeight.status == "active").order_by(models.TargetWeight.created_date.desc()).all()
            if not active:
                return {"error": "No active target to update"}
            if len(active) > 1:
                return {"error": "Multiple active targets; specify target_id"}
            obj = active[0]
            if args.get("date_of_target") is not None:
                dot_d = parse_date_str(args.get("date_of_target"))
                if not dot_d:
                    return {"error": "Invalid date_of_target"}
                if dot_d < _date.today():
                    return {"error": "Cannot set an active target's date to the past"}
                obj.date_of_target = dot_d
            if args.get("target_weight") is not None:
                obj.target_weight = args.get("target_weight")
            if args.get("status") is not None:
                status_val = str(args.get("status"))
                if status_val not in ["active", "completed", "cancelled"]:
                    return {"error": "Status must be one of: active, completed, cancelled"}
                obj.status = status_val
            self.db.commit()
            self.db.refresh(obj)
            return {"id": obj.id, "date_of_target": obj.date_of_target.isoformat(), "target_weight": safe_float(obj.target_weight), "status": obj.status}

        if tool_name == "user_update_target":
            tid = int(args.get("target_id"))
            obj = self.db.query(models.TargetWeight).filter(models.TargetWeight.id == tid, models.TargetWeight.user_id == self.user.id).first()
            if not obj:
                return {"error": "Target not found"}
            if args.get("date_of_target") is not None:
                dot_d = parse_date_str(args.get("date_of_target"))
                if not dot_d:
                    return {"error": "Invalid date_of_target"}
                if (obj.status or "active") == "active" and dot_d < _date.today():
                    return {"error": "Cannot set an active target's date to the past"}
                obj.date_of_target = dot_d
            if args.get("target_weight") is not None:
                obj.target_weight = args.get("target_weight")
            if args.get("status") is not None:
                status_val = str(args.get("status"))
                if status_val not in ["active", "completed", "cancelled"]:
                    return {"error": "Status must be one of: active, completed, cancelled"}
                obj.status = status_val
            self.db.commit()
            self.db.refresh(obj)
            return {"id": obj.id, "date_of_target": obj.date_of_target.isoformat(), "target_weight": safe_float(obj.target_weight), "status": obj.status}

        if tool_name == "user_delete_target":
            tid = int(args.get("target_id"))
            obj = self.db.query(models.TargetWeight).filter(models.TargetWeight.id == tid, models.TargetWeight.user_id == self.user.id).first()
            if not obj:
                return {"error": "Target not found"}
            self.db.delete(obj)
            self.db.commit()
            return {"message": "Target deleted"}

        return None

class AdminAgent(BaseAgent):
    name = "admin"

    def __init__(self, db: Session, user: models.User):
        self.db = db
        self.user = user

    def tools(self) -> List[Dict[str, Any]]:
        if not self.user.is_admin:
            return []
        return [
            # Read-only admin/meta tools
            {
                "type": "function",
                "function": {
                    "name": "admin_users_count",
                    "description": "Count rows in users table (admin)",
                    "parameters": {"type": "object", "properties": {}, "required": []},
                },
            },
            {
                "type": "function",
                "function": {
                    "name": "admin_list_users",
                    "description": "List users with safe fields only (admin)",
                    "parameters": {
                        "type": "object",
                        "properties": {
                            "limit": {"type": ["integer", "null"], "minimum": 1, "maximum": 1000},
                            "offset": {"type": ["integer", "null"], "minimum": 0},
                        },
                        "required": [],
                    },
                },
            },
            {
                "type": "function",
                "function": {
                    "name": "admin_list_tables",
                    "description": "List all tables in the database (admin)",
                    "parameters": {"type": "object", "properties": {}, "required": []},
                },
            },
            {
                "type": "function",
                "function": {
                    "name": "admin_table_schema",
                    "description": "Get table schema (columns/types) (admin)",
                    "parameters": {
                        "type": "object",
                        "properties": {"table": {"type": "string"}},
                        "required": ["table"],
                    },
                },
            },
            {
                "type": "function",
                "function": {
                    "name": "admin_create_user",
                    "description": "Create a new user (admin). Requires name and password; email is optional.",
                    "parameters": {
                        "type": "object",
                        "properties": {
                            "name": {"type": "string"},
                            "password": {"type": "string"},
                            "email": {"type": ["string", "null"]},
                            "sex": {"type": ["string", "null"]},
                            "height": {"type": ["number", "null"]},
                            "activity_level": {"type": ["string", "null"]},
                            "date_of_birth": {"type": ["string", "null"]},
                            "is_admin": {"type": ["boolean", "null"]},
                        },
                        "required": ["name", "password"],
                    },
                },
            },
            {
                "type": "function",
                "function": {
                    "name": "admin_get_user_by_name",
                    "description": "Lookup a user by exact name. Returns id and safe fields (admin)",
                    "parameters": {
                        "type": "object",
                        "properties": {"name": {"type": "string"}},
                        "required": ["name"],
                    },
                },
            },
            {
                "type": "function",
                "function": {
                    "name": "admin_update_user",
                    "description": "Update user profile (admin). Supports name, email, sex, height, activity_level, date_of_birth, and is_admin.",
                    "parameters": {
                        "type": "object",
                        "properties": {
                            "user_id": {"type": "integer"},
                            "name": {"type": ["string", "null"]},
                            "email": {"type": ["string", "null"]},
                            "sex": {"type": ["string", "null"]},
                            "height": {"type": ["number", "null"]},
                            "activity_level": {"type": ["string", "null"]},
                            "date_of_birth": {"type": ["string", "null"]},
                            "is_admin": {"type": ["boolean", "null"]},
                        },
                        "required": ["user_id"],
                    },
                },
            },
            {
                "type": "function",
                "function": {
                    "name": "admin_set_user_password",
                    "description": "Set user password (admin)",
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
                    "name": "admin_delete_user",
                    "description": "Delete a user by id (admin)",
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
                    "name": "admin_delete_user_by_name",
                    "description": "Delete user by exact name (admin)",
                    "parameters": {
                        "type": "object",
                        "properties": {"name": {"type": "string"}},
                        "required": ["name"],
                    },
                },
            },
            {
                "type": "function",
                "function": {
                    "name": "admin_delete_target",
                    "description": "Delete target by id (admin)",
                    "parameters": {
                        "type": "object",
                        "properties": {"target_id": {"type": "integer"}},
                        "required": ["target_id"],
                    },
                },
            },
            {
                "type": "function",
                "function": {
                    "name": "admin_promote_all_non_admins",
                    "description": "Promote all non-admin users to admin (admin)",
                    "parameters": {"type": "object", "properties": {}, "required": []},
                },
            },
        ]

    def execute(self, tool_name: str, args: Dict[str, Any]) -> Optional[Dict[str, Any]]:
        if not self.user.is_admin:
            return None
        if tool_name == "admin_users_count":
            from sqlalchemy import func
            total = self.db.query(func.count(models.User.id)).scalar() or 0
            return {"total": int(total)}
        if tool_name == "admin_list_users":
            lim = min(int(args.get("limit") or 50), 500)
            off = int(args.get("offset") or 0)
            rows = self.db.query(models.User).order_by(models.User.id).offset(off).limit(lim).all()
            data = [
                {
                    "id": u.id,
                    "name": u.name,
                    "email": u.email,
                    "is_admin": bool(u.is_admin),
                    "created_at": u.created_at.isoformat() if u.created_at else None,
                }
                for u in rows
            ]
            return {"count": len(data), "users": data}
        if tool_name == "admin_list_tables":
            from sqlalchemy import inspect
            insp = inspect(self.db.bind)
            try:
                tables = insp.get_table_names()
            except Exception:
                tables = []
            return {"tables": tables}
        if tool_name == "admin_table_schema":
            from sqlalchemy import inspect
            table = (args.get("table") or "").strip()
            if not table:
                return {"error": "Missing table"}
            insp = inspect(self.db.bind)
            try:
                cols = insp.get_columns(table)
                schema = [
                    {
                        "name": c.get("name"),
                        "type": str(c.get("type")),
                        "nullable": bool(c.get("nullable", True)),
                        "primary_key": bool(c.get("primary_key", False)),
                    }
                    for c in cols
                ]
                return {"table": table, "columns": schema}
            except Exception:
                return {"error": f"Unknown table: {table}"}
        if tool_name == "admin_get_user_by_name":
            name = (args.get("name") or "").strip()
            if not name:
                return {"error": "Missing name"}
            u = self.db.query(models.User).filter(models.User.name == name).first()
            if not u:
                return {"error": "User not found"}
            return {
                "id": u.id,
                "name": u.name,
                "email": u.email,
                "is_admin": bool(u.is_admin),
                "created_at": u.created_at.isoformat() if u.created_at else None,
            }
        if tool_name == "admin_create_user":
            from ..auth import get_password_hash  # type: ignore
            name = args.get("name")
            password = args.get("password")
            if not name or not password:
                return {"error": "Missing name or password"}
            existing = self.db.query(models.User).filter(models.User.name == name).first()
            if existing:
                return {"error": "Username already registered"}
            email = args.get("email")
            if email:
                existing_email = self.db.query(models.User).filter(models.User.email == email).first()
                if existing_email:
                    return {"error": "Email already registered"}
            u = models.User(
                name=name,
                email=email,
                password_hash=get_password_hash(password),
                sex=args.get("sex"),
                height=args.get("height"),
                activity_level=args.get("activity_level"),
                date_of_birth=args.get("date_of_birth"),
                is_admin=bool(args.get("is_admin") or False),
            )
            self.db.add(u)
            self.db.commit()
            self.db.refresh(u)
            return {"id": u.id, "name": u.name, "is_admin": u.is_admin}
        if tool_name == "admin_update_user":
            uid = int(args.get("user_id"))
            u = self.db.query(models.User).filter(models.User.id == uid).first()
            if not u:
                return {"error": "User not found"}
            if args.get("name") is not None:
                exists = self.db.query(models.User).filter(models.User.name == args["name"], models.User.id != uid).first()
                if exists:
                    return {"error": "Username already taken"}
                u.name = args["name"]
            if args.get("email") is not None:
                if args.get("email"):
                    exists_email = self.db.query(models.User).filter(models.User.email == args["email"], models.User.id != uid).first()
                    if exists_email:
                        return {"error": "Email already in use"}
                    u.email = args["email"]
                else:
                    u.email = None
            for fld in ["sex", "height", "activity_level", "date_of_birth"]:
                if fld in args and args[fld] is not None:
                    setattr(u, fld, args[fld])
            if "is_admin" in args and args["is_admin"] is not None:
                u.is_admin = bool(args["is_admin"])  # promote/demote admin
            self.db.commit()
            self.db.refresh(u)
            return {"id": u.id, "name": u.name, "is_admin": bool(u.is_admin)}
        if tool_name == "admin_set_user_password":
            uid = int(args.get("user_id"))
            new_pw = args.get("new_password") or ""
            if len(new_pw) < 8:
                return {"error": "Password must be at least 8 characters"}
            from ..auth import get_password_hash  # type: ignore
            u = self.db.query(models.User).filter(models.User.id == uid).first()
            if not u:
                return {"error": "User not found"}
            u.password_hash = get_password_hash(new_pw)
            self.db.commit()
            return {"message": "Password updated"}
        if tool_name == "admin_delete_user":
            uid = int(args.get("user_id"))
            u = self.db.query(models.User).filter(models.User.id == uid).first()
            if not u:
                return {"error": "User not found"}
            self.db.delete(u)
            self.db.commit()
            return {"message": "User deleted"}
        if tool_name == "admin_delete_user_by_name":
            name = (args.get("name") or "").strip()
            if not name:
                return {"error": "Missing name"}
            u = self.db.query(models.User).filter(models.User.name == name).first()
            if not u:
                return {"error": "User not found"}
            self.db.delete(u)
            self.db.commit()
            return {"message": "User deleted"}
        if tool_name == "admin_delete_target":
            tid = int(args.get("target_id"))
            t = self.db.query(models.TargetWeight).filter(models.TargetWeight.id == tid).first()
            if not t:
                return {"error": "Target not found"}
            self.db.delete(t)
            self.db.commit()
            return {"message": "Target deleted"}
        if tool_name == "admin_promote_all_non_admins":
            rows = self.db.query(models.User).filter(models.User.is_admin != True).all()
            count = 0
            for u in rows:
                u.is_admin = True
                count += 1
            self.db.commit()
            return {"updated": count}
        return None
