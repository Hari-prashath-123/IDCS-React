-- 2026-01-03: Add `department` column to `students`, backfill from `profiles`, and keep in sync
-- 1) Add column (if not exists)
ALTER TABLE public.students
  ADD COLUMN IF NOT EXISTS department text;

-- 2) Backfill existing students from profiles
UPDATE public.students AS s
SET department = p.department
FROM public.profiles AS p
WHERE p.id = s.id
  AND (s.department IS NULL OR s.department = '');

-- 3) Create trigger function to populate department on INSERT to students
CREATE OR REPLACE FUNCTION public._populate_student_department()
RETURNS trigger AS $$
BEGIN
  -- If not provided in insert, try to set from profiles table
  IF NEW.department IS NULL THEN
    SELECT department INTO NEW.department FROM public.profiles WHERE id = NEW.id LIMIT 1;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS students_populate_department_before_insert ON public.students;
CREATE TRIGGER students_populate_department_before_insert
BEFORE INSERT ON public.students
FOR EACH ROW
EXECUTE FUNCTION public._populate_student_department();

-- 4) Create trigger to propagate profile.department changes into students
CREATE OR REPLACE FUNCTION public._propagate_profile_department_change()
RETURNS trigger AS $$
BEGIN
  -- Update the corresponding student row if it exists
  UPDATE public.students
  SET department = NEW.department
  WHERE id = NEW.id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS profiles_propagate_department_update ON public.profiles;
CREATE TRIGGER profiles_propagate_department_update
AFTER UPDATE OF department ON public.profiles
FOR EACH ROW
EXECUTE FUNCTION public._propagate_profile_department_change();

-- 5) Optional: create an index for faster queries by department
CREATE INDEX IF NOT EXISTS idx_students_department ON public.students (department);

-- NOTE:
-- Run this migration using psql or Supabase SQL editor. Example (psql):
-- psql "postgresql://<user>:<pass>@<host>:<port>/<db>" -f scripts/2026-01-03_add_department_to_students.sql

-- After applying, verify with:
-- SELECT count(*) FROM students WHERE department IS NULL;
-- SELECT id, department FROM students LIMIT 10;
