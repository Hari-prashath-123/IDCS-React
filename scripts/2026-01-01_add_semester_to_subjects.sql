-- Migration: add `semester` column to subjects and backfill from existing `year` values
-- Adds `semester` integer (1..8) and updates `year` to academic year (1..6) derived from semester when appropriate.
BEGIN;

-- 1) Add the semester column nullable for safe migration
ALTER TABLE subjects ADD COLUMN IF NOT EXISTS semester integer;

-- 2) Backfill semester from existing year values where semester is NULL
UPDATE subjects
SET semester = year
WHERE semester IS NULL;

-- 3) For rows where semester now has a value, derive the academic year (1..6)
--    Academic year = CEILING(semester / 2)
UPDATE subjects
SET year = LEAST(6, GREATEST(1, CEIL(semester::numeric / 2)))
WHERE semester IS NOT NULL;

-- 4) Add constraints to keep semester in a valid range (1..8)
ALTER TABLE subjects DROP CONSTRAINT IF EXISTS subjects_semester_check;
ALTER TABLE subjects ADD CONSTRAINT subjects_semester_check CHECK (semester BETWEEN 1 AND 8);

-- 5) Ensure existing year constraint still holds (1..6)
ALTER TABLE subjects DROP CONSTRAINT IF EXISTS subjects_year_check;
ALTER TABLE subjects ADD CONSTRAINT subjects_year_check CHECK (year BETWEEN 1 AND 6);

COMMIT;

-- NOTE: Run this migration against your Postgres/Supabase database.
-- After running, restart the admin API if necessary.
