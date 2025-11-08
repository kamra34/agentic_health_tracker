"""
Weight Tracker API - Main Application
FastAPI backend for weight tracking with user authentication and analytics.
"""
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from contextlib import asynccontextmanager

from .config import settings
from .database import engine, Base
from .routers import auth, users, weights, targets, admin
from .routers import insights
from .routers import chat_v2
from .routers import chat
# Import models to ensure they're registered with SQLAlchemy before create_all
from . import models  # noqa: F401


# Create database tables on startup
@asynccontextmanager
async def lifespan(app: FastAPI):
    """Application lifespan events."""
    # Startup
    Base.metadata.create_all(bind=engine)
    yield
    # Shutdown (if needed)


# Initialize FastAPI app
app = FastAPI(
    title=settings.app_name,
    version=settings.app_version,
    description="Track your weight, set goals, and monitor your health journey",
    lifespan=lifespan,
    docs_url="/docs",  # Swagger UI
    redoc_url="/redoc",  # ReDoc
)

# CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include routers
app.include_router(auth.router)
app.include_router(users.router)
app.include_router(weights.router)
app.include_router(targets.router)
app.include_router(admin.router)
app.include_router(insights.router)
app.include_router(chat_v2.router)
app.include_router(chat.router)


@app.get("/")
def root():
    """Root endpoint - API status."""
    return {
        "message": "Welcome to Weight Tracker API",
        "version": settings.app_version,
        "status": "healthy",
        "docs": "/docs"
    }


@app.get("/health")
def health_check():
    """Health check endpoint for monitoring."""
    return {"status": "healthy"}


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("app.main:app", host="0.0.0.0", port=8000, reload=True)
