"""
Authentication routes: login, signup, token management.
"""
from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import OAuth2PasswordRequestForm
from sqlalchemy.orm import Session

from ..database import get_db
from .. import models, schemas
from ..auth import (
    authenticate_user,
    create_access_token,
    get_password_hash,
    get_current_user
)

router = APIRouter(prefix="/api/auth", tags=["Authentication"])

@router.post("/signup", response_model=schemas.User, status_code=status.HTTP_201_CREATED)
def signup(user: schemas.UserCreate, db: Session = Depends(get_db)):
    """
    Register a new user.
    """
    try:
        # Check if user already exists
        existing_user = db.query(models.User).filter(models.User.name == user.name).first()
        if existing_user:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Username already registered"
            )
        
        # Create new user
        hashed_password = get_password_hash(user.password)
        # Check email uniqueness if provided
        if user.email:
            existing_email = db.query(models.User).filter(models.User.email == user.email).first()
            if existing_email:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="Email already registered"
                )

        db_user = models.User(
            name=user.name,
            email=user.email,
            password_hash=hashed_password,
            sex=user.sex,
            height=user.height,
            activity_level=user.activity_level,
            date_of_birth=user.date_of_birth,
            is_admin=False
        )
        
        db.add(db_user)
        db.commit()
        db.refresh(db_user)
        
        return db_user
        
    except HTTPException:
        raise
    except Exception as e:
        print(f"Signup error: {str(e)}")  # This will show in terminal
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Error creating user: {str(e)}"
        )

@router.post("/login", response_model=schemas.Token)
def login(
    form_data: OAuth2PasswordRequestForm = Depends(),
    db: Session = Depends(get_db)
):
    """
    Login with username and password to get access token.
    
    - **username**: User's name
    - **password**: User's password
    
    Returns JWT access token for subsequent authenticated requests.
    """
    user = authenticate_user(db, form_data.username, form_data.password)
    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect username or password",
            headers={"WWW-Authenticate": "Bearer"},
        )
    
    access_token = create_access_token(data={"sub": str(user.id)})  # Convert to string
    return {"access_token": access_token, "token_type": "bearer"}


@router.get("/me", response_model=schemas.User)
def get_current_user_info(current_user: models.User = Depends(get_current_user)):
    """
    Get current authenticated user's information.
    """
    return current_user


@router.post("/change-password", status_code=status.HTTP_200_OK)
def change_password(
    old_password: str,
    new_password: str,
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Change current user's password.
    """
    from ..auth import verify_password
    
    # Verify old password
    if not verify_password(old_password, current_user.password_hash):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Incorrect password"
        )
    
    # Validate new password
    if len(new_password) < 8:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="New password must be at least 8 characters"
        )
    
    # Update password
    current_user.password_hash = get_password_hash(new_password)
    db.commit()

    return {"message": "Password changed successfully"}


@router.post("/forgot-password", status_code=status.HTTP_200_OK)
def forgot_password(
    request: schemas.ForgotPasswordRequest,
    db: Session = Depends(get_db)
):
    """
    Initiate password reset for a user by email.

    Note: In production, this should send a reset link via email.
    For now, it returns a success message if the email exists.
    """
    user = db.query(models.User).filter(models.User.email == request.email).first()

    # Always return success to prevent email enumeration
    # In production, send email with reset token here
    return {
        "message": "If an account exists with this email, a password reset link will be sent.",
        "email_exists": bool(user)  # Remove this in production
    }


@router.post("/reset-password", status_code=status.HTTP_200_OK)
def reset_password(
    request: schemas.ResetPasswordRequest,
    db: Session = Depends(get_db)
):
    """
    Reset password using email verification.

    Note: In production, this should require a reset token from email.
    For now, it allows direct password reset with email (simplified for MVP).
    """
    user = db.query(models.User).filter(models.User.email == request.email).first()

    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="No account found with this email"
        )

    # Validate new password
    if len(request.new_password) < 4:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Password must be at least 4 characters"
        )

    # Update password
    user.password_hash = get_password_hash(request.new_password)
    db.commit()

    return {"message": "Password reset successfully. You can now log in with your new password."}


@router.post("/forgot-username", status_code=status.HTTP_200_OK)
def forgot_username(
    request: schemas.ForgotUsernameRequest,
    db: Session = Depends(get_db)
):
    """
    Retrieve username by email.

    Note: In production, this should send the username via email.
    For now, it returns the username directly (simplified for MVP).
    """
    user = db.query(models.User).filter(models.User.email == request.email).first()

    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="No account found with this email"
        )

    # In production, send email with username
    return {
        "message": "Your username has been sent to your email.",
        "username": user.name  # Remove this in production, send via email instead
    }
