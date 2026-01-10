-- Migration: add date_of_join column to staff table

BEGIN;

-- Add optional date_of_join column to track staff joining date
ALTER TABLE IF EXISTS public.staff
  ADD COLUMN IF NOT EXISTS date_of_join date;

COMMIT;
