-- Migration: make subjects.subject_code nullable and update electives schema
-- Run this in Supabase SQL editor (service role) against your project.

-- 1) Allow subjects.subject_code to be NULL (main electives can have no code)
ALTER TABLE public.subjects ALTER COLUMN subject_code DROP NOT NULL;

-- 2) Add new columns to electives to support department/year and course_code
ALTER TABLE public.electives ADD COLUMN IF NOT EXISTS course_code text;
ALTER TABLE public.electives ADD COLUMN IF NOT EXISTS department text;
ALTER TABLE public.electives ADD COLUMN IF NOT EXISTS year integer;

-- 3) Backfill department/year on existing electives from their parent subject when possible
UPDATE public.electives e
SET department = s.department
FROM public.subjects s
WHERE e.department IS NULL AND e.parent_subject_id = s.id;

UPDATE public.electives e
SET year = s.year
FROM public.subjects s
WHERE e.year IS NULL AND e.parent_subject_id = s.id;

-- 4) Drop the old section column (if you relied on it elsewhere, make a backup first)
ALTER TABLE public.electives DROP COLUMN IF EXISTS section;

-- 5) Create an index to prevent duplicate subelective course codes under same parent
CREATE UNIQUE INDEX IF NOT EXISTS idx_electives_parent_course ON public.electives(parent_subject_id, course_code);

-- Note: We do not add NOT NULL constraints for course_code/department/year automatically,
-- since some legacy rows might be missing data. After verifying data, you can
-- add constraints in a follow-up migration.

-- Helpful check: list electives after migration
SELECT id, parent_subject_id, course_code, sub_name, staff_id, department, year FROM public.electives ORDER BY parent_subject_id;
