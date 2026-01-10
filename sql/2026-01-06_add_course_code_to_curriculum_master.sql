-- Migration: add course_code column to curriculum_master
BEGIN;

ALTER TABLE IF EXISTS public.curriculum_master
  ADD COLUMN IF NOT EXISTS course_code text;

CREATE INDEX IF NOT EXISTS idx_curriculum_master_course_code ON public.curriculum_master (course_code);

COMMIT;
