"""
Configuration settings for the Weight Tracker backend.
Uses pydantic-settings for type-safe environment variable management.
"""
from pydantic_settings import BaseSettings
from typing import Optional


class Settings(BaseSettings):
    """Application settings loaded from environment variables."""
    
    # App Info
    app_name: str = "Weight Tracker API"
    app_version: str = "1.0.0"
    debug: bool = False
    
    # Database
    database_url: str
    
    # Security
    secret_key: str
    algorithm: str = "HS256"
    access_token_expire_minutes: int = 60 * 24 * 7  # 7 days
    
    # CORS
    cors_origins: list[str] = [
        "http://localhost:5173",  # Vite dev server
        "http://localhost:3000",  # Alternative
    ]
    
    # OpenAI (for Phase 4)
    openai_api_key: Optional[str] = None
    
    # Pagination
    default_page_size: int = 20
    max_page_size: int = 100
    
    class Config:
        env_file = ".env"
        case_sensitive = False


# Global settings instance
settings = Settings()
