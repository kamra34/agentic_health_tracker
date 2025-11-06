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
        ]

    def execute(self, tool_name: str, args: Dict[str, Any]) -> Optional[Dict[str, Any]]:
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

