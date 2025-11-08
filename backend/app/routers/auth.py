"""
Authentication routes: login, signup, token management.
"""
from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import OAuth2PasswordRequestForm
from sqlalchemy.orm import Session
import logging
import secrets
from datetime import datetime, timedelta, timezone

from ..database import get_db
from .. import models, schemas
from ..auth import (
    authenticate_user,
    create_access_token,
    get_password_hash,
    get_current_user
)
from ..email_utils import (
    send_username_recovery_email,
    send_password_reset_confirmation_email,
    send_password_reset_link_email
)
from ..config import settings

logger = logging.getLogger(__name__)

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
    Initiate password reset by sending a time-limited reset link via email.
    Always returns success to prevent email enumeration attacks.
    """
    user = db.query(models.User).filter(models.User.email == request.email).first()

    # Always return success message to prevent email enumeration
    if not user:
        logger.info(f"Password reset requested for non-existent email: {request.email}")
        return {
            "message": "If an account exists with this email, a password reset link has been sent."
        }

    # Generate secure random token
    reset_token = secrets.token_urlsafe(32)

    # Set expiration time (15 minutes from now)
    expires_at = datetime.now(timezone.utc) + timedelta(minutes=15)

    # Invalidate any existing unused tokens for this user
    db.query(models.PasswordResetToken).filter(
        models.PasswordResetToken.user_id == user.id,
        models.PasswordResetToken.used == False
    ).update({"used": True})

    # Create new reset token
    token_record = models.PasswordResetToken(
        user_id=user.id,
        token=reset_token,
        expires_at=expires_at
    )
    db.add(token_record)
    db.commit()

    # Build reset URL (frontend URL)
    # Get frontend URL from environment or use default
    frontend_url = getattr(settings, 'frontend_url', 'https://agentic-health-tracker.vercel.app')
    reset_url = f"{frontend_url}/reset-password?token={reset_token}"

    # Send reset link email
    email_sent = send_password_reset_link_email(request.email, reset_url)

    if not email_sent:
        logger.warning(f"Failed to send password reset email to {request.email}")
        # Still return success to prevent enumeration

    return {
        "message": "If an account exists with this email, a password reset link has been sent."
    }


@router.post("/verify-reset-token", status_code=status.HTTP_200_OK)
def verify_reset_token(
    request: schemas.VerifyResetTokenRequest,
    db: Session = Depends(get_db)
):
    """
    Verify if a password reset token is valid and not expired.
    Used by frontend to check token before showing password form.
    """
    try:
        token_record = db.query(models.PasswordResetToken).filter(
            models.PasswordResetToken.token == request.token
        ).first()

        if not token_record:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Invalid or expired reset token"
            )

        # Check if token is expired
        now = datetime.now(timezone.utc)
        if now > token_record.expires_at:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Reset token has expired. Please request a new password reset link."
            )

        # Check if token was already used
        if token_record.used:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Reset token has already been used. Please request a new password reset link."
            )

        return {
            "valid": True,
            "message": "Token is valid"
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error verifying reset token: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Database error: {str(e)}"
        )


@router.post("/reset-password", status_code=status.HTTP_200_OK)
def reset_password(
    request: schemas.ResetPasswordRequest,
    db: Session = Depends(get_db)
):
    """
    Reset password using secure token from email link.
    Validates token, checks expiration, and updates password.
    """
    # Validate passwords match
    if request.new_password != request.confirm_password:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Passwords do not match"
        )

    # Validate password length
    if len(request.new_password) < 4:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Password must be at least 4 characters"
        )

    # Find token
    token_record = db.query(models.PasswordResetToken).filter(
        models.PasswordResetToken.token == request.token
    ).first()

    if not token_record:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid or expired reset token"
        )

    # Check if token is expired
    now = datetime.now(timezone.utc)
    if now > token_record.expires_at:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Reset token has expired. Please request a new password reset link."
        )

    # Check if token was already used
    if token_record.used:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Reset token has already been used. Please request a new password reset link."
        )

    # Get user
    user = db.query(models.User).filter(models.User.id == token_record.user_id).first()

    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User not found"
        )

    try:
        # Update password
        user.password_hash = get_password_hash(request.new_password)

        # Mark token as used
        token_record.used = True

        db.commit()

        # Send confirmation email
        if user.email:
            email_sent = send_password_reset_confirmation_email(user.email, user.name)
            if not email_sent:
                logger.warning(f"Failed to send password reset confirmation email to {user.email}")

        return {
            "message": "Password reset successfully. You can now log in with your new password.",
            "username": user.name
        }
    except Exception as e:
        db.rollback()
        logger.error(f"Error resetting password: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to reset password: {str(e)}"
        )


@router.post("/forgot-username", status_code=status.HTTP_200_OK)
def forgot_username(
    request: schemas.ForgotUsernameRequest,
    db: Session = Depends(get_db)
):
    """
    Retrieve username by email and send it via email.
    """
    user = db.query(models.User).filter(models.User.email == request.email).first()

    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="No account found with this email"
        )

    # Send username via email
    email_sent = send_username_recovery_email(request.email, user.name)

    if not email_sent:
        logger.warning(f"Failed to send username recovery email to {request.email}")
        # Still return success but with a note that email wasn't configured
        return {
            "message": "Email service not configured. Your username is: " + user.name,
            "username": user.name  # Fallback to returning username if email fails
        }

    return {
        "message": "Your username has been sent to your email address."
    }
