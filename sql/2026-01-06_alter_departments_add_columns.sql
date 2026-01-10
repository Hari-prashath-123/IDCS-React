-- Migration: add columns to departments table

BEGIN;

-- Add optional metadata columns requested by IQAC
ALTER TABLE IF EXISTS public.departments
  ADD COLUMN IF NOT EXISTS full_form text;

ALTER TABLE IF EXISTS public.departments
  ADD COLUMN IF NOT EXISTS code text;

-- keep code unique when provided
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes WHERE schemaname = 'public' AND indexname = 'uniq_departments_code'
  ) THEN
    CREATE UNIQUE INDEX uniq_departments_code ON public.departments (code);
  END IF;
EXCEPTION WHEN others THEN
  -- ignore index creation errors
END$$;

ALTER TABLE IF EXISTS public.departments
  ADD COLUMN IF NOT EXISTS degree text;

ALTER TABLE IF EXISTS public.departments
  ADD COLUMN IF NOT EXISTS year integer;

COMMIT;
