"""
SQLAlchemy models for Weight Tracker database tables.
"""
from sqlalchemy import Column, Integer, String, Numeric, Date, Boolean, ForeignKey, DateTime
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from .database import Base


class User(Base):
    """User model matching the 'users' table."""
    __tablename__ = "users"
    
    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(50), nullable=False)
    email = Column(String(100), unique=True)  # optional
    sex = Column(String(10))
    height = Column(Numeric(5, 2))  # in cm
    activity_level = Column(String(10))
    password_hash = Column(String(100), nullable=False)
    is_admin = Column(Boolean, default=False)
    date_of_birth = Column(Date)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    
    # Relationships
    weights = relationship("Weight", back_populates="user", cascade="all, delete-orphan")
    targets = relationship("TargetWeight", back_populates="user", cascade="all, delete-orphan")
    
    def __repr__(self):
        return f"<User(id={self.id}, name={self.name})>"


class Weight(Base):
    """Weight model matching the 'weights' table."""
    __tablename__ = "weights"
    
    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    date_of_measurement = Column(Date, nullable=False)
    weight = Column(Numeric, nullable=False)  # in kg
    body_fat_percentage = Column(Numeric(5, 2))  # optional
    muscle_mass = Column(Numeric(5, 2))  # optional
    notes = Column(String)  # optional
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    
    # Relationships
    user = relationship("User", back_populates="weights")
    
    def __repr__(self):
        return f"<Weight(id={self.id}, user_id={self.user_id}, weight={self.weight})>"


class TargetWeight(Base):
    """Target weight model matching the 'target_weights' table."""
    __tablename__ = "target_weights"
    
    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    date_of_target = Column(Date, nullable=False)
    target_weight = Column(Numeric, nullable=False)  # in kg
    created_date = Column(Date, server_default=func.current_date())
    status = Column(String(50), default="active")  # active, completed, cancelled
    
    # Relationships
    user = relationship("User", back_populates="targets")
    
    def __repr__(self):
        return f"<TargetWeight(id={self.id}, user_id={self.user_id}, target={self.target_weight})>"
