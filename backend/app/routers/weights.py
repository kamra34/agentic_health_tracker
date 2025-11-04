"""
Weight entry routes: CRUD operations for weight measurements.
"""
from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy.orm import Session
from sqlalchemy import desc
from typing import List
from datetime import date

from ..database import get_db
from .. import models, schemas
from ..auth import get_current_user

router = APIRouter(prefix="/api/weights", tags=["Weights"])


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
        weight=weight.weight
    )
    
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
    
    db.commit()
    db.refresh(weight)
    
    return weight


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
