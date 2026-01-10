-- Migration: add group_name column to subjects
-- Adds a text column to store group name (matches department_groups.name)
BEGIN;

ALTER TABLE IF EXISTS subjects
  ADD COLUMN IF NOT EXISTS group_name text;

-- index to make lookups by group_name faster
CREATE INDEX IF NOT EXISTS idx_subjects_group_name ON subjects (group_name);

COMMIT;

-- Note: If you want to backfill group_name from another table, add UPDATE statements here.
