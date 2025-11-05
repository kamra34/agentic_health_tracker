"""
Insights and analytics endpoints.

Quick Wins:
- GET /api/insights/summary: trend slope, R2, volatility, adherence, milestones, plateau
- GET /api/insights/forecast: simple exponential smoothing with band
"""
from datetime import date, timedelta
from typing import List, Optional
from statistics import mean, pstdev

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from ..database import get_db
from .. import models
from ..auth import get_current_user


router = APIRouter(prefix="/api/insights", tags=["Insights"])


# ---------------- Utilities ----------------
def _to_series(weights: List[models.Weight]):
    points = [
        (w.date_of_measurement, float(w.weight)) for w in weights
        if w.date_of_measurement is not None and w.weight is not None
    ]
    points.sort(key=lambda x: x[0])
    return points


def _linear_regression(xs: List[float], ys: List[float]):
    n = len(xs)
    if n < 2:
        return 0.0, 0.0, 0.0  # slope, intercept, r2
    mean_x = mean(xs)
    mean_y = mean(ys)
    num = sum((x - mean_x) * (y - mean_y) for x, y in zip(xs, ys))
    den = sum((x - mean_x) ** 2 for x in xs)
    if den == 0:
        return 0.0, mean_y, 0.0
    slope = num / den
    intercept = mean_y - slope * mean_x
    # R^2
    ss_tot = sum((y - mean_y) ** 2 for y in ys)
    ss_res = sum((y - (slope * x + intercept)) ** 2 for x, y in zip(xs, ys))
    r2 = 1 - (ss_res / ss_tot) if ss_tot > 0 else 0.0
    return slope, intercept, r2


def _exp_smooth(values: List[float], alpha: float = 0.3) -> List[float]:
    if not values:
        return []
    s = values[0]
    smoothed = [s]
    for v in values[1:]:
        s = alpha * v + (1 - alpha) * s
        smoothed.append(s)
    return smoothed


def _daily_x_axis(dates: List[date]) -> List[float]:
    if not dates:
        return []
    base = dates[0]
    return [(d - base).days for d in dates]


def _differences(values: List[float]) -> List[float]:
    return [b - a for a, b in zip(values[:-1], values[1:])]


def _moving_average(values: List[float], window: int) -> List[Optional[float]]:
    if window <= 1:
        return [float(v) for v in values]
    out: List[Optional[float]] = []
    acc: List[float] = []
    for v in values:
        acc.append(float(v))
        if len(acc) > window:
            acc.pop(0)
        out.append(mean(acc) if len(acc) == window else None)
    return out


# ---------------- Schemas ----------------
class Milestones(BaseModel):
    min_weight: Optional[float] = None
    min_date: Optional[date] = None
    max_weight: Optional[float] = None
    max_date: Optional[date] = None
    biggest_7d_drop_kg: Optional[float] = None
    drop_start: Optional[date] = None
    drop_end: Optional[date] = None
    last_new_low: Optional[date] = None
    last_new_high: Optional[date] = None


class Adherence(BaseModel):
    entries_per_week: float
    avg_days_between: Optional[float] = None
    current_streak: int = 0
    longest_gap_days: int = 0


class SummaryResponse(BaseModel):
    trend_slope_kg_per_week: float
    r2: float
    volatility_kg: Optional[float] = None
    adherence: Adherence
    plateau_flag: bool
    milestones: Milestones


class ForecastPoint(BaseModel):
    date: date
    forecast: float
    lower: Optional[float] = None
    upper: Optional[float] = None


class ForecastResponse(BaseModel):
    metric: str = Field(default="weight")
    horizon_days: int
    last_observation_date: Optional[date] = None
    points: List[ForecastPoint]


# ---------------- Endpoints ----------------
@router.get("/summary", response_model=SummaryResponse)
def get_summary(
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    weights = (
        db.query(models.Weight)
        .filter(models.Weight.user_id == current_user.id)
        .order_by(models.Weight.date_of_measurement)
        .all()
    )
    series = _to_series(weights)
    if len(series) < 2:
        # Minimal structure for empty/insufficient data
        return SummaryResponse(
            trend_slope_kg_per_week=0.0,
            r2=0.0,
            volatility_kg=None,
            adherence=Adherence(entries_per_week=0.0, avg_days_between=None, current_streak=0, longest_gap_days=0),
            plateau_flag=False,
            milestones=Milestones(),
        )

    dates, values = zip(*series)
    xs = _daily_x_axis(list(dates))
    ys = list(values)

    slope_per_day, _, r2 = _linear_regression(xs, ys)
    slope_per_week = slope_per_day * 7.0

    diffs = _differences(ys)
    vol = round(pstdev(diffs), 3) if len(diffs) >= 2 else 0.0

    # Adherence metrics
    unique_dates = sorted(set(dates))
    total_days = (unique_dates[-1] - unique_dates[0]).days + 1
    weeks = max(1.0, total_days / 7.0)
    entries_per_week = round(len(unique_dates) / weeks, 2)
    gaps = [(b - a).days for a, b in zip(unique_dates[:-1], unique_dates[1:])]
    avg_days_between = round(mean(gaps), 2) if gaps else None
    longest_gap = max(gaps) if gaps else 0

    # Current streak ending at last entry
    dates_set = set(unique_dates)
    cur = unique_dates[-1]
    current_streak = 0
    while cur in dates_set:
        current_streak += 1
        cur = cur - timedelta(days=1)

    adherence = Adherence(
        entries_per_week=entries_per_week,
        avg_days_between=avg_days_between,
        current_streak=current_streak,
        longest_gap_days=longest_gap,
    )

    # Milestones
    min_w = min(series, key=lambda p: p[1])
    max_w = max(series, key=lambda p: p[1])

    # Biggest 7-day drop
    biggest_drop = 0.0
    drop_start = drop_end = None
    date_to_val = {d: v for d, v in series}
    for d in unique_dates:
        d2 = d + timedelta(days=7)
        if d2 in date_to_val:
            drop = date_to_val[d] - date_to_val[d2]
            if drop > biggest_drop:
                biggest_drop = drop
                drop_start, drop_end = d, d2

    # Last new low/high
    running_min = float("inf")
    running_max = float("-inf")
    last_new_low = None
    last_new_high = None
    for d, v in series:
        if v < running_min:
            running_min = v
            last_new_low = d
        if v > running_max:
            running_max = v
            last_new_high = d

    # Plateau: last N days within +/- 0.2 kg and low slope
    N = 5
    plateau_flag = False
    if len(series) >= N:
        recent_vals = [v for _, v in series[-N:]]
        rng = max(recent_vals) - min(recent_vals)
        plateau_flag = (rng <= 0.2) and (abs(slope_per_day) <= 0.005)

    return SummaryResponse(
        trend_slope_kg_per_week=round(slope_per_week, 3),
        r2=round(float(r2), 3),
        volatility_kg=vol,
        adherence=adherence,
        plateau_flag=plateau_flag,
        milestones=Milestones(
            min_weight=round(float(min_w[1]), 2),
            min_date=min_w[0],
            max_weight=round(float(max_w[1]), 2),
            max_date=max_w[0],
            biggest_7d_drop_kg=round(biggest_drop, 2) if biggest_drop > 0 else None,
            drop_start=drop_start,
            drop_end=drop_end,
            last_new_low=last_new_low,
            last_new_high=last_new_high,
        ),
    )


@router.get("/forecast", response_model=ForecastResponse)
def get_forecast(
    metric: str = Query("weight", pattern="^(weight)$"),
    horizon: int = Query(60, ge=1, le=180),
    alpha: float = Query(0.3, ge=0.05, le=0.9),
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    weights = (
        db.query(models.Weight)
        .filter(models.Weight.user_id == current_user.id)
        .order_by(models.Weight.date_of_measurement)
        .all()
    )
    series = _to_series(weights)
    if len(series) < 2:
        return ForecastResponse(metric=metric, horizon_days=horizon, last_observation_date=None, points=[])

    dates, values = zip(*series)
    values = list(values)
    smoothed = _exp_smooth(values, alpha=alpha)

    # Residuals std for band
    residuals = [v - s for v, s in zip(values, smoothed)]
    resid_std = pstdev(residuals) if len(residuals) >= 2 else 0.0

    last_date = dates[-1]
    last_s = smoothed[-1]
    z80 = 1.28  # ~80% interval

    points: List[ForecastPoint] = []
    for i in range(1, horizon + 1):
        d = last_date + timedelta(days=i)
        f = last_s  # SES flat forecast
        band = z80 * resid_std
        points.append(
            ForecastPoint(date=d, forecast=round(float(f), 2), lower=round(float(f - band), 2), upper=round(float(f + band), 2))
        )

    return ForecastResponse(
        metric=metric,
        horizon_days=horizon,
        last_observation_date=last_date,
        points=points,
    )

