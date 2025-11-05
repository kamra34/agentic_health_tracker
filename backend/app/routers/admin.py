"""
Admin routes: user management and cross-user maintenance actions.
"""
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from typing import List

from ..database import get_db
from .. import models, schemas
from ..auth import get_current_admin_user

router = APIRouter(prefix="/api/admin", tags=["Admin"])


@router.get("/users", response_model=List[schemas.User])
def list_users(
    admin_user: models.User = Depends(get_current_admin_user),
    db: Session = Depends(get_db)
):
    """List all users (admin only)."""
    users = db.query(models.User).order_by(models.User.id).all()
    return users


@router.put("/users/{user_id}/admin", response_model=schemas.User)
def set_user_admin(
    user_id: int,
    is_admin: bool,
    admin_user: models.User = Depends(get_current_admin_user),
    db: Session = Depends(get_db)
):
    """Grant or revoke admin status for a user (admin only)."""
    user = db.query(models.User).filter(models.User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")
    user.is_admin = bool(is_admin)
    db.commit()
    db.refresh(user)
    return user


@router.delete("/targets/{target_id}", status_code=status.HTTP_204_NO_CONTENT)
def admin_delete_target(
    target_id: int,
    admin_user: models.User = Depends(get_current_admin_user),
    db: Session = Depends(get_db)
):
    """Delete any target goal by ID (admin only)."""
    target = db.query(models.TargetWeight).filter(models.TargetWeight.id == target_id).first()
    if not target:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Target not found")
    db.delete(target)
    db.commit()
    return None

