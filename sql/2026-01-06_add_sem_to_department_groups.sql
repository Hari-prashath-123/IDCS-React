-- Migration: add sem column to department_groups
BEGIN;

ALTER TABLE IF EXISTS public.department_groups
  ADD COLUMN IF NOT EXISTS sem text;

CREATE INDEX IF NOT EXISTS idx_department_groups_sem ON public.department_groups (sem);

COMMIT;

-- Note: backfill logic can be added here if you have a source for sem values.
