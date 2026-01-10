-- Migration: Add mnemonic column to subjects table
-- Run this SQL in your Supabase SQL Editor or database console

-- Add the mnemonic column
ALTER TABLE subjects
ADD COLUMN IF NOT EXISTS mnemonic TEXT;

-- Add a comment to document the column purpose
COMMENT ON COLUMN subjects.mnemonic IS 'Short mnemonic or abbreviation for the subject';

-- Optional: Add an index for better query performance if needed
-- CREATE INDEX IF NOT EXISTS idx_subjects_mnemonic ON subjects(mnemonic);