"""
Admin routes: user management and cross-user maintenance actions.
"""
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from typing import List

from ..database import get_db
from .. import models, schemas
from ..auth import get_current_admin_user
from .users import calculate_target_progress

router = APIRouter(prefix="/api/admin", tags=["Admin"])


@router.get("/users", response_model=List[schemas.User])
def list_users(
    admin_user: models.User = Depends(get_current_admin_user),
    db: Session = Depends(get_db)
):
    """List all users (admin only)."""
    users = db.query(models.User).order_by(models.User.id).all()
    return users


@router.post("/users", response_model=schemas.User, status_code=status.HTTP_201_CREATED)
def create_user(
    user: schemas.UserCreate,
    is_admin: bool = False,
    admin_user: models.User = Depends(get_current_admin_user),
    db: Session = Depends(get_db)
):
    """Create a new user (admin only).
    - Required fields: name, password
    - Optional: email, sex, height, activity_level, date_of_birth
    - Optional query param: is_admin (default False)
    """
    from ..auth import get_password_hash
    # Uniqueness checks
    existing_user = db.query(models.User).filter(models.User.name == user.name).first()
    if existing_user:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Username already registered")
    if user.email:
        existing_email = db.query(models.User).filter(models.User.email == user.email).first()
        if existing_email:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Email already registered")

    db_user = models.User(
        name=user.name,
        email=user.email,
        password_hash=get_password_hash(user.password),
        sex=user.sex,
        height=user.height,
        activity_level=user.activity_level,
        date_of_birth=user.date_of_birth,
        is_admin=bool(is_admin),
    )
    db.add(db_user)
    db.commit()
    db.refresh(db_user)
    return db_user


@router.put("/users/{user_id}", response_model=schemas.User)
def update_user(
    user_id: int,
    data: schemas.UserUpdate,
    admin_user: models.User = Depends(get_current_admin_user),
    db: Session = Depends(get_db)
):
    """Update a user's profile fields (admin only)."""
    user = db.query(models.User).filter(models.User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")

    # Name uniqueness
    if data.name is not None:
        existing = db.query(models.User).filter(models.User.name == data.name, models.User.id != user_id).first()
        if existing:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Username already taken")
        user.name = data.name

    # Email uniqueness
    if data.email is not None:
        if data.email:
            existing_email = db.query(models.User).filter(models.User.email == data.email, models.User.id != user_id).first()
            if existing_email:
                raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Email already in use")
            user.email = data.email
        else:
            user.email = None

    if data.sex is not None:
        user.sex = data.sex
    if data.height is not None:
        user.height = data.height
    if data.activity_level is not None:
        user.activity_level = data.activity_level
    if data.date_of_birth is not None:
        user.date_of_birth = data.date_of_birth

    db.commit()
    db.refresh(user)
    return user


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


@router.get("/users/{user_id}", response_model=schemas.User)
def get_user_detail(
    user_id: int,
    admin_user: models.User = Depends(get_current_admin_user),
    db: Session = Depends(get_db)
):
    """Get a user's full profile information (admin only)."""
    user = db.query(models.User).filter(models.User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")
    return user


@router.get("/users/{user_id}/targets", response_model=list[schemas.TargetWithProgress])
def get_user_targets(
    user_id: int,
    admin_user: models.User = Depends(get_current_admin_user),
    db: Session = Depends(get_db)
):
    """List a user's targets with progress (admin only)."""
    targets = db.query(models.TargetWeight).filter(models.TargetWeight.user_id == user_id).order_by(models.TargetWeight.date_of_target.desc()).all()
    # Determine current weight for this user
    latest_weight = db.query(models.Weight).filter(models.Weight.user_id == user_id).order_by(models.Weight.date_of_measurement.desc()).first()
    current_weight = float(latest_weight.weight) if latest_weight else 0.0
    enriched = [
        calculate_target_progress(current_weight=current_weight, target=t, db=db)
        for t in targets
    ]
    return enriched


@router.delete("/users/{user_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_user(
    user_id: int,
    admin_user: models.User = Depends(get_current_admin_user),
    db: Session = Depends(get_db)
):
    """Delete a user account (admin only). Cascades to weights/targets."""
    user = db.query(models.User).filter(models.User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")
    db.delete(user)
    db.commit()
    return None


@router.post("/users/{user_id}/set-password", status_code=status.HTTP_200_OK)
def set_user_password(
    user_id: int,
    new_password: str,
    admin_user: models.User = Depends(get_current_admin_user),
    db: Session = Depends(get_db)
):
    """Set a new password for a user (admin only)."""
    if not new_password or len(new_password) < 8:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Password must be at least 8 characters")
    user = db.query(models.User).filter(models.User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")
    from ..auth import get_password_hash
    user.password_hash = get_password_hash(new_password)
    db.commit()
    return {"message": "Password updated"}

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
