"""
Target weight routes: CRUD operations for weight goals.
"""
from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy.orm import Session
from sqlalchemy import desc, func
from typing import List
from datetime import date

from ..database import get_db
from .. import models, schemas
from .users import calculate_target_progress
from ..auth import get_current_user

router = APIRouter(prefix="/api/targets", tags=["Targets"])


def auto_close_expired_targets(db: Session, user_id: int) -> int:
    """
    Automatically close targets that have passed their due date.
    Determines success/failure based on whether target weight was achieved.
    Returns number of targets closed.
    """
    today = date.today()

    # Find all active targets that are past due
    expired_targets = db.query(models.TargetWeight).filter(
        models.TargetWeight.user_id == user_id,
        models.TargetWeight.status == "active",
        models.TargetWeight.date_of_target < today
    ).all()

    if not expired_targets:
        return 0

    # Get user's latest weight
    latest_weight = db.query(models.Weight).filter(
        models.Weight.user_id == user_id
    ).order_by(desc(models.Weight.date_of_measurement)).first()

    closed_count = 0
    for target in expired_targets:
        if latest_weight:
            current_weight = float(latest_weight.weight)
            target_weight = float(target.target_weight)

            # Target is successful if current weight is at or below target weight
            target.status = "completed" if current_weight <= target_weight else "failed"
        else:
            # No weight data, mark as failed
            target.status = "failed"

        closed_count += 1

    if closed_count > 0:
        db.commit()

    return closed_count


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
async def list_targets(
    skip: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=500),
    status_filter: str = None,
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Get all target weights for the current user.
    Automatically closes expired targets before returning results.

    - **skip**: Number of records to skip
    - **limit**: Maximum number of records to return
    - **status_filter**: Filter by status (active, completed, failed, cancelled)
    """
    # Auto-close expired targets
    auto_close_expired_targets(db, current_user.id)

    query = db.query(models.TargetWeight).filter(
        models.TargetWeight.user_id == current_user.id
    )
    
    if status_filter:
        # Normalize and support legacy synonyms/casing
        normalized = status_filter.lower()
        synonyms = {
            "active": ["active"],
            "completed": ["completed", "success"],
            "failed": ["failed"],
            "cancelled": ["cancelled"],
        }
        if normalized in synonyms:
            query = query.filter(func.lower(models.TargetWeight.status).in_(synonyms[normalized]))
        else:
            # Fallback to case-insensitive exact match
            query = query.filter(func.lower(models.TargetWeight.status) == normalized)
    
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
async def get_active_targets(
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Get all active targets for the current user.
    Automatically closes expired targets before returning results.
    """
    # Auto-close expired targets
    auto_close_expired_targets(db, current_user.id)

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
async def complete_target(
    target_id: int,
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Mark a target as completed or failed based on whether the goal was achieved.
    Automatically determines success/failure by comparing current weight to target weight.
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

    # Get current weight to determine success/failure
    latest_weight = db.query(models.Weight).filter(
        models.Weight.user_id == current_user.id
    ).order_by(desc(models.Weight.date_of_measurement)).first()

    if latest_weight:
        current_weight = float(latest_weight.weight)
        target_weight = float(target.target_weight)

        # Target is successful if current weight is at or below target weight
        if current_weight <= target_weight:
            target.status = "completed"
        else:
            target.status = "failed"
    else:
        # No weight data, mark as failed
        target.status = "failed"

    db.commit()
    db.refresh(target)

    return target


@router.post("/{target_id}/cancel", response_model=schemas.TargetWeight)
async def cancel_target(
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
