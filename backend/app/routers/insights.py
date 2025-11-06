"""
Insights and analytics endpoints.

Quick Wins:
- GET /api/insights/summary: trend slope, R2, volatility, adherence, milestones, plateau
- GET /api/insights/forecast: simple exponential smoothing with band
"""
from datetime import date, timedelta, datetime
from typing import List, Optional, Dict, Tuple
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


def _holt_linear(values: List[float], alpha: float = 0.3, beta: float = 0.1):
    """Holt's linear trend method (double exponential smoothing).
    Returns (levels, trends, fitted, resid_std).
    """
    n = len(values)
    if n == 0:
        return [], [], [], 0.0
    if n == 1:
        return [values[0]], [0.0], [values[0]], 0.0
    # Initialize
    # Initial trend = average of first diffs (up to 5 points)
    diffs = [values[i] - values[i-1] for i in range(1, min(n, 6))]
    b = sum(diffs) / len(diffs) if diffs else values[1] - values[0]
    l = values[0]
    levels = [l]
    trends = [b]
    fitted = [values[0]]  # yhat_0 ~ y0
    # Iterate
    for t in range(1, n):
        y = values[t]
        # one-step-ahead pred using previous components
        yhat = l + b
        fitted.append(yhat)
        # update components
        new_l = alpha * y + (1 - alpha) * (l + b)
        new_b = beta * (new_l - l) + (1 - beta) * b
        l, b = new_l, new_b
        levels.append(l)
        trends.append(b)
    # residuals (skip first where fitted equals y0)
    residuals = [y - yhat for y, yhat in zip(values[1:], fitted[1:])]
    resid_std = pstdev(residuals) if len(residuals) >= 2 else 0.0
    return levels, trends, fitted, resid_std


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


def _polyfit2(xs: List[float], ys: List[float]):
    """Quadratic least-squares fit ys ~ a0 + a1*x + a2*x^2 without NumPy.
    Returns (a0, a1, a2).
    """
    n = len(xs)
    if n < 3:
        # Fallback to linear
        b, a, _ = _linear_regression(xs, ys)
        return a, b, 0.0
    Sx = sum(xs)
    Sx2 = sum(x*x for x in xs)
    Sx3 = sum(x*x*x for x in xs)
    Sx4 = sum((x*x)*(x*x) for x in xs)
    Sy = sum(ys)
    Sxy = sum(x*y for x, y in zip(xs, ys))
    Sx2y = sum((x*x)*y for x, y in zip(xs, ys))

    # Solve 3x3 normal equations using Gaussian elimination
    A = [
        [n, Sx, Sx2, Sy],
        [Sx, Sx2, Sx3, Sxy],
        [Sx2, Sx3, Sx4, Sx2y],
    ]
    # Forward elimination
    for i in range(3):
        # pivot
        piv = A[i][i] if A[i][i] != 0 else 1e-12
        for j in range(i, 4):
            A[i][j] = A[i][j] / piv
        for k in range(i + 1, 3):
            factor = A[k][i]
            for j in range(i, 4):
                A[k][j] -= factor * A[i][j]
    # Back substitution
    a2 = A[2][3]
    a1 = A[1][3] - A[1][2] * a2
    a0 = A[0][3] - A[0][2] * a2 - A[0][1] * a1
    return a0, a1, a2


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


class RegressToMean(BaseModel):
    window_start: Optional[date] = None
    window_end: Optional[date] = None
    extremes: int = 0
    reversions: int = 0
    rate: float = 0.0  # 0..1 fraction
    example_dates: List[date] = []


class SummaryResponse(BaseModel):
    trend_slope_kg_per_day: Optional[float] = None
    trend_slope_kg_per_week: Optional[float] = None
    trend_slope_kg_per_month: Optional[float] = None
    trend_window_start: Optional[date] = None
    trend_window_end: Optional[date] = None
    trend_bmi_slope_per_week: Optional[float] = None
    trend_start_weight: Optional[float] = None
    trend_end_weight: Optional[float] = None
    volatility_kg: Optional[float] = None
    volatility_count: Optional[int] = None
    volatility_window_start: Optional[date] = None
    volatility_window_end: Optional[date] = None
    adherence: Adherence
    adherence_window_start: Optional[date] = None
    adherence_window_end: Optional[date] = None
    plateau_flag: bool
    milestones: Milestones
    rtm: Optional[RegressToMean] = None


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


# ---------------- Simple Cache ----------------
_CACHE_TTL_SECONDS = 300
_cache: Dict[str, Dict[int, Tuple[float, object]]] = {
    "summary": {},
    "forecast": {},
    "composition": {},
    "distributions": {},
    "seasonality": {},
    "goal_analytics": {},
    "calendar": {},
}


def _cache_get(bucket: str, user_id: int):
    rec = _cache.get(bucket, {}).get(user_id)
    if not rec:
        return None
    ts, data = rec
    if (datetime.utcnow().timestamp() - ts) > _CACHE_TTL_SECONDS:
        return None
    return data


def _cache_set(bucket: str, user_id: int, data: object):
    _cache.setdefault(bucket, {})[user_id] = (datetime.utcnow().timestamp(), data)


# Specialized helpers for forecast cache to include parameter keying
def _forecast_cache_get(user_id: int, key: str):
    rec = _cache.get("forecast", {}).get(user_id)
    if not rec:
        return None
    ts, data = rec
    if (datetime.utcnow().timestamp() - ts) > _CACHE_TTL_SECONDS:
        return None
    if getattr(data, "_cache_key", None) == key:
        return data
    return None


def _forecast_cache_set(user_id: int, key: str, data: object):
    # attach key for validation
    try:
        setattr(data, "_cache_key", key)
    except Exception:
        pass
    _cache.setdefault("forecast", {})[user_id] = (datetime.utcnow().timestamp(), data)


# Generic helpers for parameter-aware cache (similar to forecast cache)
def _param_cache_get(bucket: str, user_id: int, key: str):
    rec = _cache.get(bucket, {}).get(user_id)
    if not rec:
        return None
    ts, data = rec
    if (datetime.utcnow().timestamp() - ts) > _CACHE_TTL_SECONDS:
        return None
    if getattr(data, "_cache_key", None) == key:
        return data
    return None


def _param_cache_set(bucket: str, user_id: int, key: str, data: object):
    try:
        setattr(data, "_cache_key", key)
    except Exception:
        pass
    _cache.setdefault(bucket, {})[user_id] = (datetime.utcnow().timestamp(), data)


# ---------------- Endpoints ----------------
@router.get("/summary", response_model=SummaryResponse)
def get_summary(
    window_days: Optional[int] = Query(None, ge=7, le=2000, description="Use last N days for trend/diagnostics (default 90)"),
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    cache_key = f"wd:{window_days or 90}"
    cached = _param_cache_get("summary", current_user.id, cache_key)
    if cached:
        return cached
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
            trend_slope_kg_per_day=None,
            trend_slope_kg_per_week=None,
            trend_slope_kg_per_month=None,
            volatility_kg=None,
            adherence=Adherence(entries_per_week=0.0, avg_days_between=None, current_streak=0, longest_gap_days=0),
            adherence_window_start=None,
            adherence_window_end=None,
            plateau_flag=False,
            milestones=Milestones(),
        )

    dates, values = zip(*series)
    xs = _daily_x_axis(list(dates))
    ys = list(values)

    # Compute trend limited to recent window: at most last N days and at least 14 days
    max_window_days = window_days or 90
    min_span_days = 14
    cutoff = dates[-1] - timedelta(days=max_window_days - 1)
    recent_points = [(d, v) for d, v in zip(dates, ys) if d >= cutoff]
    slope_per_day = None
    trend_start = None
    trend_end = None
    start_weight = None
    end_weight = None
    if len(recent_points) >= 2:
        span_days = (recent_points[-1][0] - recent_points[0][0]).days
        if span_days >= min_span_days:
            r_dates, r_vals = zip(*recent_points)
            r_xs = _daily_x_axis(list(r_dates))
            s, _, _ = _linear_regression(r_xs, list(r_vals))
            slope_per_day = s
            trend_start, trend_end = r_dates[0], r_dates[-1]
            start_weight, end_weight = float(r_vals[0]), float(r_vals[-1])
    if slope_per_day is None:
        # Fallback to full series; if still not enough span, leave slopes None
        if len(xs) >= 2 and (dates[-1] - dates[0]).days >= min_span_days:
            s, _, _ = _linear_regression(xs, ys)
            slope_per_day = s
            trend_start, trend_end = dates[0], dates[-1]
            start_weight, end_weight = float(ys[0]), float(ys[-1])
    slope_per_week = slope_per_day * 7.0 if slope_per_day is not None else None
    slope_per_month = slope_per_day * 30.0 if slope_per_day is not None else None

    # Volatility over the same trend window
    if trend_start and trend_end:
        # Volatility over the same trend window; compute daily change std
        # by normalizing adjacent differences by day gaps.
        window_series = [(d, v) for (d, v) in series if trend_start <= d <= trend_end]
        daily_changes: List[float] = []
        for (d1, v1), (d2, v2) in zip(window_series[:-1], window_series[1:]):
            gap = (d2 - d1).days
            if gap > 0:
                daily_changes.append((v2 - v1) / gap)
        vol = round(pstdev(daily_changes), 3) if len(daily_changes) >= 2 else 0.0
        vol_count = len(daily_changes)
        vol_start, vol_end = trend_start, trend_end
    else:
        vol = 0.0
        vol_count = None
        vol_start, vol_end = None, None

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
    adherence_window_start = unique_dates[0]
    adherence_window_end = unique_dates[-1]

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

    # Regress-to-mean diagnostics over the same trend window
    rtm_obj: Optional[RegressToMean] = None
    if trend_start and trend_end:
        window_series = [(d, v) for (d, v) in series if trend_start <= d <= trend_end]
        # daily normalized changes between consecutive observed days
        deltas: List[float] = []
        delta_dates: List[date] = []
        for (d1, v1), (d2, v2) in zip(window_series[:-1], window_series[1:]):
            gap = (d2 - d1).days
            if gap > 0:
                deltas.append((v2 - v1) / gap)
                delta_dates.append(d2)
        if len(deltas) >= 3:
            mu = mean(deltas)
            sd = pstdev(deltas) if len(deltas) >= 2 else 0.0
            extremes_idx: List[int] = []
            if sd > 0:
                for i, dv in enumerate(deltas):
                    if abs(dv - mu) > 2 * sd:
                        extremes_idx.append(i)
            # Evaluate immediate reversion: next change opposite sign and at least 30% magnitude
            reversions = 0
            examples: List[date] = []
            for i in extremes_idx:
                if i + 1 < len(deltas):
                    dv = deltas[i]
                    nxt = deltas[i + 1]
                    if (dv > 0 and nxt < 0) or (dv < 0 and nxt > 0):
                        if abs(nxt) >= 0.3 * abs(dv):
                            reversions += 1
                            if len(examples) < 3:
                                examples.append(delta_dates[i])
            rate = reversions / len(extremes_idx) if extremes_idx else 0.0
            rtm_obj = RegressToMean(
                window_start=trend_start,
                window_end=trend_end,
                extremes=len(extremes_idx),
                reversions=reversions,
                rate=round(rate, 3),
                example_dates=examples,
            )

    # BMI slope over same trend window if height available
    bmi_slope_week: Optional[float] = None
    if current_user.height:
        h_m = float(current_user.height) / 100.0
        if h_m > 0:
            if trend_start and trend_end:
                # pick window matching trend
                idx_start = next((i for i,(d,_) in enumerate(series) if d == trend_start), 0)
                idx_end = next((i for i,(d,_) in enumerate(series) if d == trend_end), len(series)-1)
                win_dates = [d for d,_ in series[idx_start:idx_end+1]]
                win_vals = [v for _,v in series[idx_start:idx_end+1]]
                xb = _daily_x_axis(win_dates)
                yb = [v / (h_m * h_m) for v in win_vals]
                b_slope_day, _, _ = _linear_regression(xb, yb)
                bmi_slope_week = round(b_slope_day * 7.0, 3)

    resp = SummaryResponse(
        trend_slope_kg_per_day=round(slope_per_day, 3) if slope_per_day is not None else None,
        trend_slope_kg_per_week=round(slope_per_week, 3) if slope_per_week is not None else None,
        trend_slope_kg_per_month=round(slope_per_month, 3) if slope_per_month is not None else None,
        trend_window_start=trend_start,
        trend_window_end=trend_end,
        trend_bmi_slope_per_week=bmi_slope_week,
        trend_start_weight=round(start_weight, 2) if start_weight is not None else None,
        trend_end_weight=round(end_weight, 2) if end_weight is not None else None,
        volatility_kg=vol,
        volatility_count=vol_count,
        volatility_window_start=vol_start,
        volatility_window_end=vol_end,
        adherence=adherence,
        adherence_window_start=adherence_window_start,
        adherence_window_end=adherence_window_end,
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
        rtm=rtm_obj,
    )
    _param_cache_set("summary", current_user.id, cache_key, resp)
    return resp


@router.get("/forecast", response_model=ForecastResponse)
def get_forecast(
    metric: str = Query("weight", pattern="^(weight|bmi)$"),
    horizon: int = Query(60, ge=1, le=365),
    alpha: float = Query(0.3, ge=0.05, le=0.95),
    beta: float = Query(0.1, ge=0.01, le=0.95),
    method: str = Query("holt", pattern="^(holt|ses|ols|poly2)$"),
    train_window_days: Optional[int] = Query(60, ge=7, le=2000, description="Use last N days of data for training"),
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    cache_key = f"{metric}:{method}:{horizon}:{train_window_days}"
    cached = _forecast_cache_get(current_user.id, cache_key)
    if cached:
        return cached
    weights = (
        db.query(models.Weight)
        .filter(models.Weight.user_id == current_user.id)
        .order_by(models.Weight.date_of_measurement)
        .all()
    )
    series = _to_series(weights)
    if len(series) < 2:
        return ForecastResponse(metric=metric, horizon_days=horizon, last_observation_date=None, points=[])

    # Optional training window subset
    if train_window_days is not None and train_window_days > 0:
        cutoff = series[-1][0] - timedelta(days=train_window_days - 1)
        series = [(d, v) for (d, v) in series if d >= cutoff]
        if len(series) < 2:  # ensure at least two points
            series = _to_series(weights)[-2:]

    dates, values = zip(*series)
    values = list(values)

    # Metric transform
    if metric == "bmi":
        h_cm = float(current_user.height) if getattr(current_user, 'height', None) else None
        if h_cm and h_cm > 0:
            h_m = h_cm / 100.0
            values = [v / (h_m * h_m) for v in values]
        else:
            # No height -> cannot compute BMI; return empty forecast
            return ForecastResponse(metric=metric, horizon_days=horizon, last_observation_date=dates[-1], points=[])
    last_date = dates[-1]
    z80 = 1.28  # ~80% interval

    points: List[ForecastPoint] = []

    if method == "ses":
        smoothed = _exp_smooth(values, alpha=alpha)
        residuals = [v - s for v, s in zip(values, smoothed)]
        resid_std = pstdev(residuals) if len(residuals) >= 2 else 0.0
        last_s = smoothed[-1]
        for i in range(1, horizon + 1):
            d = last_date + timedelta(days=i)
            f = last_s
            band = z80 * resid_std  # simple constant band
            points.append(ForecastPoint(date=d, forecast=round(float(f), 2), lower=round(float(f - band), 2), upper=round(float(f + band), 2)))
    elif method == "holt":
        # Holt's linear trend forecast
        levels, trends, fitted, resid_std = _holt_linear(values, alpha=alpha, beta=beta)
        lT, bT = levels[-1], trends[-1]
        for h in range(1, horizon + 1):
            d = last_date + timedelta(days=h)
            f = lT + h * bT
            band = z80 * resid_std * (h ** 0.5)  # widen with horizon
            points.append(ForecastPoint(date=d, forecast=round(float(f), 2), lower=round(float(f - band), 2), upper=round(float(f + band), 2)))
    elif method == "ols":
        # Linear regression y ~ a + b*x
        xs = _daily_x_axis(list(dates))
        b, a, _ = _linear_regression(xs, values)  # returns slope, intercept, r2
        fitted = [a + b * x for x in xs]
        residuals = [y - yhat for y, yhat in zip(values, fitted)]
        resid_std = pstdev(residuals) if len(residuals) >= 2 else 0.0
        last_x = xs[-1]
        for h in range(1, horizon + 1):
            x = last_x + h
            f = a + b * x
            band = z80 * resid_std * (h ** 0.5)
            points.append(ForecastPoint(date=last_date + timedelta(days=h), forecast=round(float(f), 2), lower=round(float(f - band), 2), upper=round(float(f + band), 2)))
    else:  # poly2 quadratic regression
        xs = _daily_x_axis(list(dates))
        a0, a1, a2 = _polyfit2(xs, values)
        fitted = [a0 + a1 * x + a2 * x * x for x in xs]
        residuals = [y - yhat for y, yhat in zip(values, fitted)]
        resid_std = pstdev(residuals) if len(residuals) >= 2 else 0.0
        last_x = xs[-1]
        for h in range(1, horizon + 1):
            x = last_x + h
            f = a0 + a1 * x + a2 * x * x
            band = z80 * resid_std * (h ** 0.5)
            points.append(ForecastPoint(date=last_date + timedelta(days=h), forecast=round(float(f), 2), lower=round(float(f - band), 2), upper=round(float(f + band), 2)))

    resp = ForecastResponse(
        metric=metric,
        horizon_days=horizon,
        last_observation_date=last_date,
        points=points,
    )
    _forecast_cache_set(current_user.id, cache_key, resp)
    return resp


# ---------------- Additional Endpoints ----------------
class CompositionPoint(BaseModel):
    date: date
    weight: float
    fat_mass_est: Optional[float] = None
    lean_mass_est: Optional[float] = None


class CompositionResponse(BaseModel):
    points: List[CompositionPoint]


@router.get("/composition", response_model=CompositionResponse)
def get_composition(
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    cached = _cache_get("composition", current_user.id)
    if cached:
        return cached
    weights = (
        db.query(models.Weight)
        .filter(models.Weight.user_id == current_user.id)
        .order_by(models.Weight.date_of_measurement)
        .all()
    )
    out: List[CompositionPoint] = []
    for w in weights:
        weight = float(w.weight)
        bf = float(w.body_fat_percentage) if getattr(w, 'body_fat_percentage', None) is not None else None
        muscle = float(w.muscle_mass) if getattr(w, 'muscle_mass', None) is not None else None
        fat_mass = (weight * bf / 100.0) if bf is not None else None
        lean_mass = muscle if muscle is not None else (weight - fat_mass if fat_mass is not None else None)
        out.append(CompositionPoint(
            date=w.date_of_measurement,
            weight=round(weight, 2),
            fat_mass_est=round(fat_mass, 2) if fat_mass is not None else None,
            lean_mass_est=round(lean_mass, 2) if lean_mass is not None else None,
        ))
    resp = CompositionResponse(points=out)
    _cache_set("composition", current_user.id, resp)
    return resp


class HistogramBin(BaseModel):
    bin_start: float
    bin_end: float
    count: int


class DistributionsResponse(BaseModel):
    daily_change_hist: List[HistogramBin]
    outliers_last_30d: int
    recent_std: float
    window_outliers: Optional[int] = None
    window_std: Optional[float] = None


@router.get("/distributions", response_model=DistributionsResponse)
def get_distributions(
    bins: int = Query(20, ge=5, le=100),
    window_days: Optional[int] = Query(None, ge=7, le=2000),
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    cache_key = f"bins:{bins}:wd:{window_days or 0}"
    cached = _param_cache_get("distributions", current_user.id, cache_key)
    if cached and len(cached.daily_change_hist) == bins:
        return cached
    weights = (
        db.query(models.Weight)
        .filter(models.Weight.user_id == current_user.id)
        .order_by(models.Weight.date_of_measurement)
        .all()
    )
    series = _to_series(weights)
    # Build per-day normalized deltas
    deltas: List[float] = []
    dates: List[date] = []
    for (d1, v1), (d2, v2) in zip(series[:-1], series[1:]):
        gap = (d2 - d1).days
        if gap > 0:
            deltas.append((v2 - v1) / gap)
            dates.append(d2)
    if not deltas:
        return DistributionsResponse(daily_change_hist=[], outliers_last_30d=0, recent_std=0.0)
    mn, mx = min(deltas), max(deltas)
    if mn == mx:
        hist = [HistogramBin(bin_start=mn, bin_end=mn, count=len(deltas))]
    else:
        width = (mx - mn) / bins
        counts = [0] * bins
        for v in deltas:
            idx = int((v - mn) / width)
            if idx >= bins:
                idx = bins - 1
            counts[idx] += 1
        hist = [HistogramBin(bin_start=mn + i * width, bin_end=mn + (i + 1) * width, count=c) for i, c in enumerate(counts)]
    # Recent outliers (last 30 days, > 3 sigma)
    cutoff = date.today() - timedelta(days=30)
    recent = [v for v, d in zip(deltas, dates) if d >= cutoff]
    mu = mean(recent) if recent else 0.0
    sd = pstdev(recent) if len(recent) >= 2 else 0.0
    outliers = sum(1 for v in recent if sd > 0 and abs(v - mu) > 3 * sd)
    # Window-scoped outliers if requested
    win_out = None
    win_std = None
    if window_days:
        wcut = date.today() - timedelta(days=window_days - 1)
        win_vals = [v for v, d in zip(deltas, dates) if d >= wcut]
        if len(win_vals) >= 2:
            wmu = mean(win_vals)
            wsd = pstdev(win_vals)
            win_std = round(wsd, 4)
            win_out = sum(1 for v in win_vals if wsd > 0 and abs(v - wmu) > 3 * wsd)
    resp = DistributionsResponse(
        daily_change_hist=hist,
        outliers_last_30d=outliers,
        recent_std=round(sd, 4),
        window_outliers=win_out,
        window_std=win_std,
    )
    _param_cache_set("distributions", current_user.id, cache_key, resp)
    return resp


class SeasonalityResponse(BaseModel):
    weekday_avg: List[float]  # len 7, Sun..Sat
    month_avg: List[float]    # len 12, Jan..Dec


@router.get("/seasonality", response_model=SeasonalityResponse)
def get_seasonality(
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    cached = _cache_get("seasonality", current_user.id)
    if cached:
        return cached
    weights = (
        db.query(models.Weight)
        .filter(models.Weight.user_id == current_user.id)
        .order_by(models.Weight.date_of_measurement)
        .all()
    )
    series = _to_series(weights)
    deltas: List[Tuple[date, float]] = []
    for (d1, v1), (d2, v2) in zip(series[:-1], series[1:]):
        gap = (d2 - d1).days
        if gap > 0:
            deltas.append((d2, (v2 - v1) / gap))
    accW = [(0.0, 0) for _ in range(7)]  # sum, n
    accW = [list(x) for x in accW]
    for d, ch in deltas:
        wd = d.weekday()  # 0 Mon..6 Sun
        # We want Sun..Sat ordering; convert
        sun_first = (wd + 1) % 7
        accW[sun_first][0] += ch
        accW[sun_first][1] += 1
    weekday_avg = [round((s / n), 4) if n else 0.0 for s, n in accW]
    accM = [(0.0, 0) for _ in range(12)]
    accM = [list(x) for x in accM]
    for d, ch in deltas:
        m = d.month - 1
        accM[m][0] += ch
        accM[m][1] += 1
    month_avg = [round((s / n), 4) if n else 0.0 for s, n in accM]
    resp = SeasonalityResponse(weekday_avg=weekday_avg, month_avg=month_avg)
    _cache_set("seasonality", current_user.id, resp)
    return resp


class GoalRow(BaseModel):
    id: int
    goal_label: str
    required_slope_kg_per_week: float
    recent_slope_kg_per_week: float
    probability_score: int
    eta_conservative: Optional[date] = None
    eta_optimistic: Optional[date] = None


class GoalAnalyticsResponse(BaseModel):
    rows: List[GoalRow]


@router.get("/goal-analytics", response_model=GoalAnalyticsResponse)
def get_goal_analytics(
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    cached = _cache_get("goal_analytics", current_user.id)
    if cached:
        return cached
    # Collect data
    weights = (
        db.query(models.Weight)
        .filter(models.Weight.user_id == current_user.id)
        .order_by(models.Weight.date_of_measurement)
        .all()
    )
    series = _to_series(weights)
    if not series:
        return GoalAnalyticsResponse(rows=[])
    dates, vals = zip(*series)
    # Recent slope: last 8 weeks OLS
    cutoff = date.today() - timedelta(days=56)
    xs = []
    ys = []
    base = None
    for d, v in series:
        if d >= cutoff:
            if base is None:
                base = d
            xs.append((d - base).days)
            ys.append(v)
    if len(xs) < 2:
        xs = list(range(len(vals)))
        ys = list(vals)
    slope_day, _, _ = _linear_regression(xs, ys)
    recent_slope_week = slope_day * 7.0

    current_weight = float(vals[-1])
    active_targets = db.query(models.TargetWeight).filter(
        models.TargetWeight.user_id == current_user.id,
        models.TargetWeight.status == "active"
    ).all()
    rows: List[GoalRow] = []
    for t in active_targets:
        target_w = float(t.target_weight)
        days_remaining = max(1, (t.date_of_target - date.today()).days)
        weeks_remaining = days_remaining / 7.0
        required = (target_w - current_weight) / weeks_remaining
        same_sign = (required == 0) or ((required > 0) == (recent_slope_week > 0))
        ratio = 0.0 if required == 0 else min(1.0, abs(recent_slope_week) / (abs(required) + 1e-6))
        base_score = 0.6 if same_sign else 0.2
        score = int(max(0, min(100, round(100 * (base_score + 0.4 * ratio)))))
        # ETA ranges using conservative/optimistic multipliers
        delta = target_w - current_weight
        eta_cons = eta_opt = None
        if recent_slope_week != 0 and (delta == 0 or (delta > 0) == (recent_slope_week > 0)):
            cons_rate = max(1e-6, abs(recent_slope_week) * 0.75)
            opt_rate = max(1e-6, abs(recent_slope_week) * 1.25)
            weeks_cons = abs(delta) / cons_rate if cons_rate > 0 else None
            weeks_opt = abs(delta) / opt_rate if opt_rate > 0 else None
            if weeks_cons is not None:
                eta_cons = date.today() + timedelta(days=int(round(weeks_cons * 7)))
            if weeks_opt is not None:
                eta_opt = date.today() + timedelta(days=int(round(weeks_opt * 7)))
        rows.append(GoalRow(
            id=t.id,
            goal_label=f"{target_w:.1f} kg by {t.date_of_target}",
            required_slope_kg_per_week=round(required, 3),
            recent_slope_kg_per_week=round(recent_slope_week, 3),
            probability_score=score,
            eta_conservative=eta_cons,
            eta_optimistic=eta_opt,
        ))
    resp = GoalAnalyticsResponse(rows=rows)
    _cache_set("goal_analytics", current_user.id, resp)
    return resp


class CalendarCell(BaseModel):
    date: date
    count: int


class CalendarResponse(BaseModel):
    days: List[CalendarCell]


@router.get("/calendar", response_model=CalendarResponse)
def get_calendar(
    days: int = Query(365, ge=30, le=730),
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    cached = _cache_get("calendar", current_user.id)
    if cached and len(cached.days) == days:
        return cached
    cutoff = date.today() - timedelta(days=days - 1)
    weights = (
        db.query(models.Weight)
        .filter(models.Weight.user_id == current_user.id, models.Weight.date_of_measurement >= cutoff)
        .all()
    )
    counts: Dict[date, int] = {}
    for w in weights:
        d = w.date_of_measurement
        counts[d] = counts.get(d, 0) + 1
    out: List[CalendarCell] = []
    cur = cutoff
    while cur <= date.today():
        out.append(CalendarCell(date=cur, count=counts.get(cur, 0)))
        cur = cur + timedelta(days=1)
    resp = CalendarResponse(days=out)
    _cache_set("calendar", current_user.id, resp)
    return resp
