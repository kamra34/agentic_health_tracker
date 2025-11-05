"""
Weight entry routes: CRUD operations for weight measurements.
"""
from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy.orm import Session
from sqlalchemy import desc
from typing import List, Optional
from datetime import date, datetime

from ..database import get_db
from .. import models, schemas
from ..auth import get_current_user

router = APIRouter(prefix="/api/weights", tags=["Weights"])


# ---------- Estimation helpers ----------
def _calculate_bmi(weight_kg: float, height_cm: Optional[float]) -> float:
    if not height_cm or height_cm <= 0:
        return 0.0
    h_m = float(height_cm) / 100.0
    return round(float(weight_kg) / (h_m * h_m), 2)


def _age_on(date_of_birth: Optional[date], on_date: Optional[date] = None) -> int:
    if not date_of_birth:
        return 0
    if on_date is None:
        on_date = date.today()
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


@router.post("", response_model=schemas.Weight, status_code=status.HTTP_201_CREATED)
def create_weight(
    weight: schemas.WeightCreate,
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Create a new weight entry for the current user.
    
    - **date_of_measurement**: Date of the measurement
    - **weight**: Weight in kg
    """
    # Check for duplicate entry on same date
    existing = db.query(models.Weight).filter(
        models.Weight.user_id == current_user.id,
        models.Weight.date_of_measurement == weight.date_of_measurement
    ).first()
    
    if existing:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Weight entry already exists for {weight.date_of_measurement}"
        )
    
    db_weight = models.Weight(
        user_id=current_user.id,
        date_of_measurement=weight.date_of_measurement,
        weight=weight.weight,
        body_fat_percentage=weight.body_fat_percentage,
        muscle_mass=weight.muscle_mass,
        notes=weight.notes
    )

    # Auto-estimate missing values if profile allows
    height_cm = float(current_user.height) if current_user.height is not None else None
    age_years = _age_on(current_user.date_of_birth, weight.date_of_measurement)
    bmi = _calculate_bmi(float(weight.weight), height_cm)
    if db_weight.body_fat_percentage is None:
        est_bf = _estimate_body_fat_percent(bmi, age_years, current_user.sex)
        if est_bf is not None:
            db_weight.body_fat_percentage = est_bf
    if db_weight.muscle_mass is None:
        est_lbm = _estimate_lean_body_mass(float(weight.weight), height_cm, current_user.sex)
        if est_lbm is not None:
            db_weight.muscle_mass = est_lbm
    
    db.add(db_weight)
    db.commit()
    db.refresh(db_weight)
    
    return db_weight


@router.get("", response_model=List[schemas.Weight])
def list_weights(
    skip: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=500),
    start_date: date = None,
    end_date: date = None,
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Get all weight entries for the current user.
    
    - **skip**: Number of records to skip (for pagination)
    - **limit**: Maximum number of records to return
    - **start_date**: Filter weights from this date onwards (optional)
    - **end_date**: Filter weights up to this date (optional)
    """
    query = db.query(models.Weight).filter(models.Weight.user_id == current_user.id)
    
    if start_date:
        query = query.filter(models.Weight.date_of_measurement >= start_date)
    if end_date:
        query = query.filter(models.Weight.date_of_measurement <= end_date)
    
    weights = query.order_by(desc(models.Weight.date_of_measurement)).offset(skip).limit(limit).all()
    return weights


@router.get("/latest", response_model=schemas.Weight)
def get_latest_weight(
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Get the most recent weight entry for the current user.
    """
    weight = db.query(models.Weight).filter(
        models.Weight.user_id == current_user.id
    ).order_by(desc(models.Weight.date_of_measurement)).first()
    
    if not weight:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="No weight entries found"
        )
    
    return weight


@router.get("/{weight_id}", response_model=schemas.Weight)
def get_weight(
    weight_id: int,
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Get a specific weight entry by ID.
    """
    weight = db.query(models.Weight).filter(
        models.Weight.id == weight_id,
        models.Weight.user_id == current_user.id
    ).first()
    
    if not weight:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Weight entry not found"
        )
    
    return weight


@router.put("/{weight_id}", response_model=schemas.Weight)
def update_weight(
    weight_id: int,
    weight_update: schemas.WeightUpdate,
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Update a weight entry.
    """
    weight = db.query(models.Weight).filter(
        models.Weight.id == weight_id,
        models.Weight.user_id == current_user.id
    ).first()
    
    if not weight:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Weight entry not found"
        )
    
    # Update fields
    if weight_update.date_of_measurement is not None:
        # Check for duplicate on new date
        existing = db.query(models.Weight).filter(
            models.Weight.user_id == current_user.id,
            models.Weight.date_of_measurement == weight_update.date_of_measurement,
            models.Weight.id != weight_id
        ).first()
        
        if existing:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Weight entry already exists for {weight_update.date_of_measurement}"
            )
        
        weight.date_of_measurement = weight_update.date_of_measurement
    
    if weight_update.weight is not None:
        weight.weight = weight_update.weight
    if weight_update.body_fat_percentage is not None:
        weight.body_fat_percentage = weight_update.body_fat_percentage
    if weight_update.muscle_mass is not None:
        weight.muscle_mass = weight_update.muscle_mass
    if weight_update.notes is not None:
        weight.notes = weight_update.notes

    # Fill missing via estimates (based on possibly updated weight)
    height_cm = float(current_user.height) if current_user.height is not None else None
    age_years = _age_on(current_user.date_of_birth, weight.date_of_measurement)
    bmi = _calculate_bmi(float(weight.weight), height_cm) if weight.weight is not None else 0.0
    if weight.body_fat_percentage is None:
        est_bf = _estimate_body_fat_percent(bmi, age_years, current_user.sex)
        if est_bf is not None:
            weight.body_fat_percentage = est_bf
    if weight.muscle_mass is None:
        est_lbm = _estimate_lean_body_mass(float(weight.weight), height_cm, current_user.sex)
        if est_lbm is not None:
            weight.muscle_mass = est_lbm
    
    db.commit()
    db.refresh(weight)
    
    return weight


@router.post("/backfill-estimates")
def backfill_estimates(
    overwrite: bool = Query(False, description="If true, overwrite existing values"),
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Backfill body fat% and muscle mass (lean mass proxy) for existing entries.
    Uses Deurenberg (body fat%) and Boer (lean mass) based on the user's profile.
    - If overwrite=false: only fills missing values
    - Age is calculated at the date of measurement
    """
    height_cm = float(current_user.height) if current_user.height is not None else None
    if not height_cm:
        raise HTTPException(status_code=400, detail="Cannot estimate without user height")

    weights = db.query(models.Weight).filter(models.Weight.user_id == current_user.id).all()
    updated = 0
    for w in weights:
        changed = False
        age_years = _age_on(current_user.date_of_birth, w.date_of_measurement)
        bmi = _calculate_bmi(float(w.weight), height_cm)
        if overwrite or w.body_fat_percentage is None:
            est_bf = _estimate_body_fat_percent(bmi, age_years, current_user.sex)
            if est_bf is not None:
                w.body_fat_percentage = est_bf
                changed = True
        if overwrite or w.muscle_mass is None:
            est_lbm = _estimate_lean_body_mass(float(w.weight), height_cm, current_user.sex)
            if est_lbm is not None:
                w.muscle_mass = est_lbm
                changed = True
        if changed:
            updated += 1
    if updated:
        db.commit()
    return {"processed": len(weights), "updated": updated}


@router.delete("/{weight_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_weight(
    weight_id: int,
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Delete a weight entry.
    """
    weight = db.query(models.Weight).filter(
        models.Weight.id == weight_id,
        models.Weight.user_id == current_user.id
    ).first()
    
    if not weight:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Weight entry not found"
        )
    
    db.delete(weight)
    db.commit()
    
    return None
