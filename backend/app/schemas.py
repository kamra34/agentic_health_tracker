"""
Pydantic schemas for request/response validation.
"""
from pydantic import BaseModel, Field, ConfigDict
from typing import Optional
from datetime import date, datetime
from decimal import Decimal


# ============ User Schemas ============

class UserBase(BaseModel):
    """Base user schema with common fields."""
    name: str = Field(..., min_length=1, max_length=50)
    sex: Optional[str] = Field(None, max_length=10)
    height: Optional[Decimal] = Field(None, ge=0, le=300)
    activity_level: Optional[str] = Field(None, max_length=10)
    date_of_birth: Optional[date] = None
    email: Optional[str] = None


class UserCreate(UserBase):
    """Schema for user registration."""
    password: str = Field(..., min_length=4, max_length=100)
    email: str = Field(..., min_length=3, max_length=100)  # Make email required for new users


class ForgotPasswordRequest(BaseModel):
    """Schema for forgot password request."""
    email: str = Field(..., min_length=3, max_length=100)


class ResetPasswordRequest(BaseModel):
    """Schema for password reset."""
    email: str = Field(..., min_length=3, max_length=100)
    new_password: str = Field(..., min_length=4, max_length=100)


class ForgotUsernameRequest(BaseModel):
    """Schema for forgot username request."""
    email: str = Field(..., min_length=3, max_length=100)


class UserUpdate(BaseModel):
    """Schema for user updates (all fields optional)."""
    name: Optional[str] = Field(None, min_length=1, max_length=50)
    email: Optional[str] = None
    sex: Optional[str] = Field(None, max_length=10)
    height: Optional[Decimal] = Field(None, ge=0, le=300)
    activity_level: Optional[str] = Field(None, max_length=10)
    date_of_birth: Optional[date] = None


class User(UserBase):
    """Schema for user response."""
    id: int
    is_admin: bool
    created_at: datetime
    
    model_config = ConfigDict(from_attributes=True)


class UserWithStats(User):
    """User with additional statistics."""
    total_weights: int = 0
    current_weight: Optional[Decimal] = None
    current_bmi: Optional[float] = None
    active_targets: int = 0
    total_targets: int = 0
    completed_targets: int = 0
    failed_targets: int = 0


# ============ Weight Schemas ============

class WeightBase(BaseModel):
    """Base weight schema."""
    date_of_measurement: date
    weight: Decimal = Field(..., gt=0, le=500)  # kg
    body_fat_percentage: Optional[Decimal] = Field(None, ge=0, le=100)
    muscle_mass: Optional[Decimal] = Field(None, ge=0, le=500)
    notes: Optional[str] = None


class WeightCreate(WeightBase):
    """Schema for creating a weight entry."""
    pass


class WeightUpdate(BaseModel):
    """Schema for updating a weight entry."""
    date_of_measurement: Optional[date] = None
    weight: Optional[Decimal] = Field(None, gt=0, le=500)
    body_fat_percentage: Optional[Decimal] = Field(None, ge=0, le=100)
    muscle_mass: Optional[Decimal] = Field(None, ge=0, le=500)
    notes: Optional[str] = None


class Weight(WeightBase):
    """Schema for weight response."""
    id: int
    user_id: int
    created_at: datetime
    
    model_config = ConfigDict(from_attributes=True)


# ============ Target Weight Schemas ============

class TargetWeightBase(BaseModel):
    """Base target weight schema."""
    date_of_target: date
    target_weight: Decimal = Field(..., gt=0, le=500)  # kg


class TargetWeightCreate(TargetWeightBase):
    """Schema for creating a target."""
    pass


class TargetWeightUpdate(BaseModel):
    """Schema for updating a target."""
    date_of_target: Optional[date] = None
    target_weight: Optional[Decimal] = Field(None, gt=0, le=500)
    status: Optional[str] = Field(None, max_length=50)


class TargetWeight(TargetWeightBase):
    """Schema for target weight response."""
    id: int
    user_id: int
    created_date: date
    status: str
    
    model_config = ConfigDict(from_attributes=True)


class TargetWithProgress(TargetWeight):
    """Target with detailed progress information."""
    starting_weight: Optional[Decimal] = None
    current_weight: Optional[Decimal] = None
    # For UI clarity: the weight considered as the "final" point
    # - active target: latest/current weight
    # - completed/cancelled: weight closest to target date
    final_weight: Optional[Decimal] = None
    weight_to_lose: Optional[Decimal] = None
    progress_percentage: Optional[float] = None
    days_remaining: Optional[int] = None
    estimated_completion: Optional[date] = None


# ============ Auth Schemas ============

class Token(BaseModel):
    """Schema for JWT token response."""
    access_token: str
    token_type: str = "bearer"


class TokenData(BaseModel):
    """Schema for token payload data."""
    user_id: Optional[int] = None


class Login(BaseModel):
    """Schema for login request."""
    name: str
    password: str


# ============ Analytics Schemas ============

class WeightStats(BaseModel):
    """Statistics about weight entries with time-based changes."""
    total_entries: int
    first_entry_date: Optional[date] = None
    last_entry_date: Optional[date] = None
    current_weight: Optional[Decimal] = None
    starting_weight: Optional[Decimal] = None
    total_change: Optional[Decimal] = None
    average_weekly_change: Optional[Decimal] = None
    current_bmi: Optional[float] = None
    bmi_category: Optional[str] = None
    # Time-based changes
    weekly_change: Optional[float] = None
    monthly_change: Optional[float] = None
    six_month_change: Optional[float] = None
    # Consistency streaks
    current_streak: Optional[int] = None
    longest_streak: Optional[int] = None


class WeightTrend(BaseModel):
    """Weight trend data point."""
    date: date
    weight: Decimal
    moving_average: Optional[Decimal] = None
    body_fat_percentage: Optional[Decimal] = None
    muscle_mass: Optional[Decimal] = None


# ============ Dashboard Schema ============

class DashboardData(BaseModel):
    """Complete dashboard data."""
    user: UserWithStats
    stats: WeightStats
    recent_weights: list[Weight]
    active_targets: list[TargetWithProgress]
    weight_trend: list[WeightTrend]
