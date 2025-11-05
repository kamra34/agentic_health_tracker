"""
Target weight routes: CRUD operations for weight goals.
"""
from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy.orm import Session
from sqlalchemy import desc
from typing import List
from datetime import date

from ..database import get_db
from .. import models, schemas
from .users import calculate_target_progress
from ..auth import get_current_user

router = APIRouter(prefix="/api/targets", tags=["Targets"])


@router.post("", response_model=schemas.TargetWeight, status_code=status.HTTP_201_CREATED)
def create_target(
    target: schemas.TargetWeightCreate,
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Create a new target weight goal.
    
    - **date_of_target**: Target date to achieve the goal
    - **target_weight**: Target weight in kg
    """
    db_target = models.TargetWeight(
        user_id=current_user.id,
        date_of_target=target.date_of_target,
        target_weight=target.target_weight,
        status="active"
    )
    
    db.add(db_target)
    db.commit()
    db.refresh(db_target)
    
    return db_target


@router.get("", response_model=List[schemas.TargetWithProgress])
def list_targets(
    skip: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=500),
    status_filter: str = None,
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Get all target weights for the current user.
    
    - **skip**: Number of records to skip
    - **limit**: Maximum number of records to return
    - **status_filter**: Filter by status (active, completed, cancelled)
    """
    query = db.query(models.TargetWeight).filter(
        models.TargetWeight.user_id == current_user.id
    )
    
    if status_filter:
        query = query.filter(models.TargetWeight.status == status_filter)
    
    targets = query.order_by(desc(models.TargetWeight.created_date)).offset(skip).limit(limit).all()

    # Compute enriched progress details per target
    latest_weight = db.query(models.Weight).filter(
        models.Weight.user_id == current_user.id
    ).order_by(desc(models.Weight.date_of_measurement)).first()
    current_weight = float(latest_weight.weight) if latest_weight else 0

    enriched = [
        calculate_target_progress(current_weight=current_weight, target=t, db=db)
        for t in targets
    ]
    return enriched


@router.get("/active", response_model=List[schemas.TargetWeight])
def get_active_targets(
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Get all active targets for the current user.
    """
    targets = db.query(models.TargetWeight).filter(
        models.TargetWeight.user_id == current_user.id,
        models.TargetWeight.status == "active"
    ).order_by(models.TargetWeight.date_of_target).all()
    
    return targets


@router.get("/{target_id}", response_model=schemas.TargetWeight)
def get_target(
    target_id: int,
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Get a specific target by ID.
    """
    target = db.query(models.TargetWeight).filter(
        models.TargetWeight.id == target_id,
        models.TargetWeight.user_id == current_user.id
    ).first()
    
    if not target:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Target not found"
        )
    
    return target


@router.put("/{target_id}", response_model=schemas.TargetWeight)
def update_target(
    target_id: int,
    target_update: schemas.TargetWeightUpdate,
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Update a target weight.
    """
    target = db.query(models.TargetWeight).filter(
        models.TargetWeight.id == target_id,
        models.TargetWeight.user_id == current_user.id
    ).first()
    
    if not target:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Target not found"
        )
    
    # Update fields
    if target_update.date_of_target is not None:
        target.date_of_target = target_update.date_of_target
    if target_update.target_weight is not None:
        target.target_weight = target_update.target_weight
    if target_update.status is not None:
        if target_update.status not in ["active", "completed", "cancelled"]:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Status must be one of: active, completed, cancelled"
            )
        target.status = target_update.status
    
    db.commit()
    db.refresh(target)
    
    return target


@router.delete("/{target_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_target(
    target_id: int,
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Delete a target.
    """
    target = db.query(models.TargetWeight).filter(
        models.TargetWeight.id == target_id,
        models.TargetWeight.user_id == current_user.id
    ).first()
    
    if not target:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Target not found"
        )
    
    db.delete(target)
    db.commit()
    
    return None


@router.post("/{target_id}/complete", response_model=schemas.TargetWeight)
def complete_target(
    target_id: int,
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Mark a target as completed.
    """
    target = db.query(models.TargetWeight).filter(
        models.TargetWeight.id == target_id,
        models.TargetWeight.user_id == current_user.id
    ).first()
    
    if not target:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Target not found"
        )
    
    target.status = "completed"
    db.commit()
    db.refresh(target)
    
    return target


@router.post("/{target_id}/cancel", response_model=schemas.TargetWeight)
def cancel_target(
    target_id: int,
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Mark a target as cancelled.
    """
    target = db.query(models.TargetWeight).filter(
        models.TargetWeight.id == target_id,
        models.TargetWeight.user_id == current_user.id
    ).first()
    
    if not target:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Target not found"
        )
    
    target.status = "cancelled"
    db.commit()
    db.refresh(target)
    
    return target
