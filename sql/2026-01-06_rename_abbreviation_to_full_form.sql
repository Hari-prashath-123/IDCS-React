-- Migration: rename departments.abbreviation -> departments.full_form

BEGIN;

-- Conditionally rename `abbreviation` -> `full_form` when present.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'departments' AND column_name = 'abbreviation'
  ) AND NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'departments' AND column_name = 'full_form'
  ) THEN
    EXECUTE 'ALTER TABLE public.departments RENAME COLUMN abbreviation TO full_form';
  END IF;
END$$;

-- Ensure `full_form` exists (idempotent)
ALTER TABLE IF EXISTS public.departments
  ADD COLUMN IF NOT EXISTS full_form text;

COMMIT;
