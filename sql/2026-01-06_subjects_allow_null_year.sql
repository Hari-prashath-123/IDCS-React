-- Make subjects.year nullable and allow NULL in the year check

ALTER TABLE IF EXISTS public.subjects ALTER COLUMN year DROP NOT NULL;

-- Replace the existing subjects_year_check with a NULL-friendly version
ALTER TABLE IF EXISTS public.subjects DROP CONSTRAINT IF EXISTS subjects_year_check;

ALTER TABLE IF EXISTS public.subjects
  ADD CONSTRAINT subjects_year_check CHECK (year IS NULL OR (year >= 1 AND year <= 6));

-- Helpful: show resulting constraints (run manually in SQL editor to verify)
-- SELECT conname, pg_get_constraintdef(oid) AS def
-- FROM pg_constraint
-- WHERE conrelid = 'public.subjects'::regclass AND contype = 'c';
