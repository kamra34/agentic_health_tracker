"""
Configuration settings for the Weight Tracker backend.
Uses pydantic-settings for type-safe environment variable management.
"""
from typing import Optional
from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Application settings loaded from environment variables."""

    # App Info
    app_name: str = "Weight Tracker API"
    app_version: str = "1.0.0"
    git_commit: Optional[str] = None  # Git commit hash from environment
    build_date: Optional[str] = None  # Build timestamp from environment
    debug: bool = False

    # Database
    database_url: str

    # Security
    secret_key: str
    algorithm: str = "HS256"
    access_token_expire_minutes: int = 60 * 24 * 7  # 7 days

    # CORS - comma-separated list in environment variable
    # Example: CORS_ORIGINS="http://localhost:5173,http://localhost:3000,https://agentic-health-tracker.vercel.app"
    cors_origins_str: str = Field(
        default="http://localhost:5173,http://localhost:3000",
        validation_alias="CORS_ORIGINS"
    )

    @property
    def cors_origins(self) -> list[str]:
        """Parse CORS origins from comma-separated string."""
        return [origin.strip() for origin in self.cors_origins_str.split(",") if origin.strip()]

    # OpenAI
    openai_api_key: Optional[str] = None
    # Optional model id from env (e.g., model_id=gpt-4o)
    model_id: Optional[str] = None

    # Email Configuration (using Brevo HTTP API)
    # Sign up at https://www.brevo.com/ and get API key from Settings > API Keys
    brevo_api_key: Optional[str] = None  # Your Brevo API key
    email_from: Optional[str] = None  # Email address to send from (must be verified in Brevo)
    email_from_name: str = "Weight Tracker"

    # Frontend URL (for password reset links)
    frontend_url: str = "https://agentic-health-tracker.vercel.app"

    # Pagination
    default_page_size: int = 20
    max_page_size: int = 100

    # Pydantic v2 settings config
    model_config = SettingsConfigDict(
        env_file=".env",
        case_sensitive=False,
        extra="ignore",  # Ignore extra env vars so unexpected keys don't crash
    )


# Global settings instance
settings = Settings()
