"""
Test database connection before starting the app.
Run this to verify your PostgreSQL connection works.
"""
import os
from sqlalchemy import create_engine, text
from dotenv import load_dotenv

# Load environment variables
load_dotenv()

DATABASE_URL = os.getenv("DATABASE_URL")

print("🔍 Testing Database Connection...")
print()

try:
    # Create engine
    engine = create_engine(DATABASE_URL, echo=False)
    
    # Test connection
    with engine.connect() as connection:
        result = connection.execute(text("SELECT 1"))
        print("✅ Database connection successful!")
        print()
        
        # Check if tables exist
        result = connection.execute(text("""
            SELECT table_name 
            FROM information_schema.tables 
            WHERE table_schema = 'public'
            ORDER BY table_name;
        """))
        
        tables = [row[0] for row in result]
        
        if tables:
            print(f"📊 Found {len(tables)} existing tables:")
            for table in tables:
                print(f"   - {table}")
        else:
            print("📊 No tables found yet (will be created on first run)")
        
        print()
        print("✨ Your database is ready to use!")
        print("🚀 You can now start the backend: uvicorn app.main:app --reload")
        
except Exception as e:
    print("❌ Database connection failed!")
    print(f"Error: {str(e)}")
    print()
    print("📝 Troubleshooting:")
    print("   1. Check if your PostgreSQL server is running")
    print("   2. Verify the credentials in .env file")
    print("   3. Make sure database 'wtracker' exists")
    print("   4. Check firewall/network settings")
    print()
    print(f"Connection string: {DATABASE_URL}")
