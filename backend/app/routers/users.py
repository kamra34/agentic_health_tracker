"""
User profile routes: viewing and updating user information.
Enhanced with time-based weight change calculations.
"""
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from sqlalchemy import func, desc
from datetime import date, timedelta
from decimal import Decimal

from ..database import get_db
from .. import models, schemas
from ..auth import get_current_user

router = APIRouter(prefix="/api/users", tags=["Users"])


def calculate_bmi(weight_kg: float, height_cm: float) -> float:
    """Calculate BMI from weight (kg) and height (cm)."""
    if height_cm <= 0:
        return 0
    height_m = height_cm / 100
    return round(weight_kg / (height_m ** 2), 2)


def get_bmi_category(bmi: float) -> str:
    """Get BMI category from BMI value."""
    if bmi < 18.5:
        return "Underweight"
    elif bmi < 25:
        return "Normal weight"
    elif bmi < 30:
        return "Overweight"
    elif bmi < 35:
        return "Obese Class I"
    elif bmi < 40:
        return "Obese Class II"
    else:
        return "Obese Class III"


def get_weight_at_date(db: Session, user_id: int, target_date: date) -> float:
    """Get weight closest to target date."""
    # Try to find weight on exact date
    weight = db.query(models.Weight).filter(
        models.Weight.user_id == user_id,
        models.Weight.date_of_measurement == target_date
    ).first()
    
    if weight:
        return float(weight.weight)
    
    # Find closest weight before target date
    weight = db.query(models.Weight).filter(
        models.Weight.user_id == user_id,
        models.Weight.date_of_measurement <= target_date
    ).order_by(desc(models.Weight.date_of_measurement)).first()
    
    if weight:
        return float(weight.weight)
    
    # Find closest weight after target date if nothing before
    weight = db.query(models.Weight).filter(
        models.Weight.user_id == user_id,
        models.Weight.date_of_measurement > target_date
    ).order_by(models.Weight.date_of_measurement).first()
    
    return float(weight.weight) if weight else None


@router.get("/me", response_model=schemas.UserWithStats)
def get_my_profile(
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Get current user's profile with statistics.
    """
    # Count total weights
    total_weights = db.query(func.count(models.Weight.id)).filter(
        models.Weight.user_id == current_user.id
    ).scalar()
    
    # Get latest weight
    latest_weight = db.query(models.Weight).filter(
        models.Weight.user_id == current_user.id
    ).order_by(desc(models.Weight.date_of_measurement)).first()
    
    current_weight = float(latest_weight.weight) if latest_weight else None
    
    # Calculate BMI
    current_bmi = None
    if current_weight and current_user.height:
        current_bmi = calculate_bmi(current_weight, float(current_user.height))
    
    # Count active targets
    active_targets = db.query(func.count(models.TargetWeight.id)).filter(
        models.TargetWeight.user_id == current_user.id,
        models.TargetWeight.status == "active"
    ).scalar()
    
    # Build response
    user_dict = {
        **current_user.__dict__,
        "total_weights": total_weights,
        "current_weight": current_weight,
        "current_bmi": current_bmi,
        "active_targets": active_targets
    }
    
    return schemas.UserWithStats(**user_dict)


@router.put("/me", response_model=schemas.User)
def update_my_profile(
    user_update: schemas.UserUpdate,
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Update current user's profile.
    """
    # Update fields
    if user_update.name is not None:
        # Check if name is already taken
        existing = db.query(models.User).filter(
            models.User.name == user_update.name,
            models.User.id != current_user.id
        ).first()
        if existing:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Username already taken"
            )
        current_user.name = user_update.name
    
    if user_update.sex is not None:
        current_user.sex = user_update.sex
    if user_update.height is not None:
        current_user.height = user_update.height
    if user_update.activity_level is not None:
        current_user.activity_level = user_update.activity_level
    if user_update.date_of_birth is not None:
        current_user.date_of_birth = user_update.date_of_birth
    
    db.commit()
    db.refresh(current_user)
    
    return current_user


@router.get("/stats", response_model=schemas.WeightStats)
def get_my_stats(
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Get detailed statistics about user's weight journey with time-based changes.
    """
    # Get all weights ordered by date
    weights = db.query(models.Weight).filter(
        models.Weight.user_id == current_user.id
    ).order_by(models.Weight.date_of_measurement).all()
    
    if not weights:
        return schemas.WeightStats(
            total_entries=0,
            first_entry_date=None,
            last_entry_date=None,
            current_weight=None,
            starting_weight=None,
            total_change=None,
            average_weekly_change=None,
            current_bmi=None,
            bmi_category=None,
            weekly_change=None,
            monthly_change=None,
            six_month_change=None
        )
    
    first_weight = weights[0]
    last_weight = weights[-1]
    
    total_entries = len(weights)
    first_entry_date = first_weight.date_of_measurement
    last_entry_date = last_weight.date_of_measurement
    starting_weight = float(first_weight.weight)
    current_weight = float(last_weight.weight)
    total_change = current_weight - starting_weight
    
    # Calculate average weekly change
    days_diff = (last_entry_date - first_entry_date).days
    if days_diff > 0:
        weeks = days_diff / 7
        average_weekly_change = round(total_change / weeks, 2) if weeks > 0 else 0
    else:
        average_weekly_change = 0
    
    # Calculate BMI
    current_bmi = None
    bmi_category = None
    if current_user.height:
        current_bmi = calculate_bmi(current_weight, float(current_user.height))
        bmi_category = get_bmi_category(current_bmi)
    
    # Calculate time-based changes
    today = date.today()
    
    # Weekly change (7 days ago)
    week_ago = today - timedelta(days=7)
    weight_week_ago = get_weight_at_date(db, current_user.id, week_ago)
    weekly_change = round(current_weight - weight_week_ago, 1) if weight_week_ago else None
    
    # Monthly change (30 days ago)
    month_ago = today - timedelta(days=30)
    weight_month_ago = get_weight_at_date(db, current_user.id, month_ago)
    monthly_change = round(current_weight - weight_month_ago, 1) if weight_month_ago else None
    
    # 6-month change (180 days ago)
    six_months_ago = today - timedelta(days=180)
    weight_six_months_ago = get_weight_at_date(db, current_user.id, six_months_ago)
    six_month_change = round(current_weight - weight_six_months_ago, 1) if weight_six_months_ago else None
    
    return schemas.WeightStats(
        total_entries=total_entries,
        first_entry_date=first_entry_date,
        last_entry_date=last_entry_date,
        current_weight=current_weight,
        starting_weight=starting_weight,
        total_change=round(total_change, 2),
        average_weekly_change=average_weekly_change,
        current_bmi=current_bmi,
        bmi_category=bmi_category,
        weekly_change=weekly_change,
        monthly_change=monthly_change,
        six_month_change=six_month_change
    )


@router.get("/dashboard", response_model=schemas.DashboardData)
def get_dashboard(
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Get complete dashboard data including user info, stats, recent weights, and active targets.
    """
    # Get user with stats
    user_stats = get_my_profile(current_user, db)
    
    # Get stats
    stats = get_my_stats(current_user, db)
    
    # Get recent weights (last 10)
    recent_weights = db.query(models.Weight).filter(
        models.Weight.user_id == current_user.id
    ).order_by(desc(models.Weight.date_of_measurement)).limit(10).all()
    
    # Get active targets with progress
    active_targets = db.query(models.TargetWeight).filter(
        models.TargetWeight.user_id == current_user.id,
        models.TargetWeight.status == "active"
    ).order_by(models.TargetWeight.date_of_target).all()
    
    # Get weight trend (last 180 days for 6-month view)
    six_months_ago = date.today() - timedelta(days=180)
    trend_weights = db.query(models.Weight).filter(
        models.Weight.user_id == current_user.id,
        models.Weight.date_of_measurement >= six_months_ago
    ).order_by(models.Weight.date_of_measurement).all()
    
    weight_trend = [
        schemas.WeightTrend(
            date=w.date_of_measurement,
            weight=w.weight,
            moving_average=None  # Can add moving average calculation later
        ) for w in trend_weights
    ]
    
    return schemas.DashboardData(
        user=user_stats,
        stats=stats,
        recent_weights=recent_weights,
        active_targets=active_targets,
        weight_trend=weight_trend
    )