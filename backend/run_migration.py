#!/usr/bin/env python3
"""
Simple migration runner for Railway database.
Run this script to apply pending migrations.

Usage: python run_migration.py
"""
import os
import psycopg2
from pathlib import Path

# Get database URL from environment
DATABASE_URL = os.getenv('DATABASE_URL')

if not DATABASE_URL:
    print("ERROR: DATABASE_URL environment variable not set")
    exit(1)

# Read the migration file
migration_file = Path(__file__).parent / 'migrations' / '002_add_updated_at_to_users.sql'

if not migration_file.exists():
    print(f"ERROR: Migration file not found: {migration_file}")
    exit(1)

print(f"Reading migration: {migration_file}")
migration_sql = migration_file.read_text()

# Connect and run migration
print(f"Connecting to database...")
conn = psycopg2.connect(DATABASE_URL)
conn.autocommit = True
cursor = conn.cursor()

try:
    print("Running migration...")
    cursor.execute(migration_sql)
    print("✅ Migration completed successfully!")
except Exception as e:
    print(f"❌ Migration failed: {e}")
    exit(1)
finally:
    cursor.close()
    conn.close()

print("Done!")
