"""
Test script to verify CORS configuration is working correctly.
Run this locally to test that the config parsing works.
"""
import os
import sys

# Set test environment variable
os.environ["CORS_ORIGINS"] = "http://localhost:5173,http://localhost:3000,https://agentic-health-tracker.vercel.app"

# Add app directory to path
sys.path.insert(0, os.path.join(os.path.dirname(__file__), 'app'))

from app.config import settings

print("=" * 60)
print("CORS Configuration Test")
print("=" * 60)
print(f"\n📋 Environment Variable (CORS_ORIGINS):")
print(f"   {os.getenv('CORS_ORIGINS', 'NOT SET')}")
print(f"\n📦 Parsed CORS Origins List:")
for i, origin in enumerate(settings.cors_origins, 1):
    print(f"   {i}. {origin}")
print(f"\n✅ Total origins configured: {len(settings.cors_origins)}")
print("\n" + "=" * 60)

# Verify Vercel domain is included
if "https://agentic-health-tracker.vercel.app" in settings.cors_origins:
    print("✅ Vercel domain is included in CORS origins")
else:
    print("❌ WARNING: Vercel domain NOT found in CORS origins")
    print("   This will cause CORS errors!")

print("=" * 60)
