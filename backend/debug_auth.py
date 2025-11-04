"""
Debug Authentication Issues
Check user data and test password hashing
"""
import psycopg2
from passlib.context import CryptContext

# Database connection
DB_CONFIG = {
    'host': 'eu1.pitunnel.com',
    'port': 20877,
    'user': 'kami',
    'password': '4444',
    'database': 'wtracker_dev'
}

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

def check_users():
    """Check what users exist in the database"""
    print("🔍 Checking users in database...")
    
    conn = psycopg2.connect(**DB_CONFIG)
    cursor = conn.cursor()
    
    cursor.execute("""
        SELECT id, name, email, password_hash, is_admin, created_at
        FROM users;
    """)
    
    users = cursor.fetchall()
    
    if not users:
        print("❌ No users found in database!")
    else:
        print(f"\n✅ Found {len(users)} user(s):\n")
        for user in users:
            print(f"ID: {user[0]}")
            print(f"Name: {user[1]}")
            print(f"Email: {user[2]}")
            print(f"Password Hash: {user[3][:50]}...")
            print(f"Is Admin: {user[4]}")
            print(f"Created: {user[5]}")
            print("-" * 60)
    
    cursor.close()
    conn.close()
    
    return users


def test_password(username, password):
    """Test if a password works for a user"""
    print(f"\n🔐 Testing login for: {username}")
    
    conn = psycopg2.connect(**DB_CONFIG)
    cursor = conn.cursor()
    
    cursor.execute("""
        SELECT id, name, password_hash
        FROM users
        WHERE name = %s;
    """, (username,))
    
    user = cursor.fetchone()
    
    if not user:
        print(f"❌ User '{username}' not found in database")
        cursor.close()
        conn.close()
        return False
    
    user_id, name, password_hash = user
    print(f"✅ User found: ID={user_id}, Name={name}")
    print(f"Password hash in DB: {password_hash[:50]}...")
    
    # Test password verification
    try:
        is_valid = pwd_context.verify(password, password_hash)
        
        if is_valid:
            print("✅ Password is CORRECT!")
        else:
            print("❌ Password is INCORRECT!")
            print("\nℹ️  The password hash in the database doesn't match the password you provided.")
    except Exception as e:
        print(f"❌ Error verifying password: {str(e)}")
        print("ℹ️  The password hash might be invalid or in wrong format.")
    
    cursor.close()
    conn.close()
    
    return is_valid if 'is_valid' in locals() else False


def reset_password(username, new_password):
    """Reset a user's password"""
    print(f"\n🔄 Resetting password for: {username}")
    
    conn = psycopg2.connect(**DB_CONFIG)
    cursor = conn.cursor()
    
    # Generate new hash
    new_hash = pwd_context.hash(new_password)
    print(f"New password hash: {new_hash[:50]}...")
    
    # Update database
    cursor.execute("""
        UPDATE users
        SET password_hash = %s
        WHERE name = %s;
    """, (new_hash, username))
    
    rows_updated = cursor.rowcount
    conn.commit()
    
    if rows_updated > 0:
        print(f"✅ Password updated successfully!")
    else:
        print(f"❌ No user found with name '{username}'")
    
    cursor.close()
    conn.close()


def check_database_connection():
    """Test database connection"""
    print("🔍 Testing database connection...")
    
    try:
        conn = psycopg2.connect(**DB_CONFIG)
        cursor = conn.cursor()
        
        cursor.execute("SELECT version();")
        version = cursor.fetchone()
        
        print(f"✅ Connected to PostgreSQL")
        print(f"Version: {version[0][:50]}...")
        
        cursor.execute("SELECT current_database();")
        db_name = cursor.fetchone()[0]
        print(f"Database: {db_name}")
        
        cursor.close()
        conn.close()
        return True
        
    except Exception as e:
        print(f"❌ Connection failed: {str(e)}")
        return False


def main():
    print("=" * 60)
    print("   🔐 Authentication Debug Tool")
    print("=" * 60)
    print()
    
    # Test connection
    if not check_database_connection():
        return
    
    print("\n" + "=" * 60)
    
    # Check users
    users = check_users()
    
    if not users:
        print("\n⚠️  No users in database. Try signing up first.")
        return
    
    print("\n" + "=" * 60)
    
    # Interactive menu
    while True:
        print("\nWhat would you like to do?")
        print("1. Test login (check password)")
        print("2. Reset password for user")
        print("3. Check users again")
        print("4. Exit")
        
        choice = input("\nEnter choice (1-4): ").strip()
        
        if choice == "1":
            username = input("Username: ").strip()
            password = input("Password: ").strip()
            test_password(username, password)
            
        elif choice == "2":
            username = input("Username: ").strip()
            new_password = input("New password: ").strip()
            reset_password(username, new_password)
            
        elif choice == "3":
            check_users()
            
        elif choice == "4":
            break
        
        else:
            print("❌ Invalid choice")


if __name__ == "__main__":
    main()
