-- Migration: Add updated_at column to users table
-- Description: Adds updated_at column to match the database trigger expectations
-- Date: 2025-11-08

-- Add updated_at column to users table
ALTER TABLE users ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP;

-- Update existing rows to have the same value as created_at
UPDATE users SET updated_at = created_at WHERE updated_at IS NULL;

-- Make the column NOT NULL after populating
ALTER TABLE users ALTER COLUMN updated_at SET NOT NULL;

-- Add comment
COMMENT ON COLUMN users.updated_at IS 'Timestamp of last update, automatically maintained by trigger';
