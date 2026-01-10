-- fix_hod_visibility.sql
-- Usage: Edit the HOD_EMAIL value below to the affected HOD's email, then run in your dev Supabase SQL editor.
-- This script will:
-- 1) Determine the departments of students assigned to the HOD (by students.hod_id)
-- 2) Update the HOD's profiles.department to the first student department if it differs
-- 3) Upsert entries into department_admins for each department the HOD oversees

-- IMPORTANT: Backup your DB before running in production.

-- Replace this with the affected HOD email
\set HOD_EMAIL 'avudaiappant.ai@krct.ac.in'

BEGIN;

WITH hod AS (
  SELECT id AS hod_id, department AS current_profile_dept
  FROM public.profiles
  WHERE email = :'HOD_EMAIL'
  LIMIT 1
), hod_student_depts AS (
  SELECT DISTINCT s.department
  FROM public.students s
  JOIN hod h ON s.hod_id = h.hod_id
), update_profile AS (
  UPDATE public.profiles p
  SET department = (SELECT department FROM hod_student_depts LIMIT 1)
  FROM hod
  WHERE p.id = hod.hod_id
    AND (p.department IS DISTINCT FROM (SELECT department FROM hod_student_depts LIMIT 1))
  RETURNING p.id, p.department
), upsert_mappings AS (
  INSERT INTO public.department_admins (department, staff_id)
  SELECT d.department, (SELECT hod_id FROM hod)
  FROM hod_student_depts d
  ON CONFLICT (department, staff_id) DO NOTHING
  RETURNING department, staff_id
)
SELECT
  (SELECT hod_id FROM hod) AS hod_id,
  (SELECT COUNT(*) FROM hod_student_depts) AS student_departments_count,
  (SELECT COUNT(*) FROM upsert_mappings) AS mappings_created,
  (SELECT COUNT(*) FROM update_profile) AS profiles_updated;

COMMIT;

-- Verification queries (run after script completes):
-- SELECT id, email, role, department FROM public.profiles WHERE email = 'avudaiappant.ai@krct.ac.in';
-- SELECT * FROM public.department_admins WHERE staff_id = (SELECT id FROM public.profiles WHERE email = 'avudaiappant.ai@krct.ac.in');
-- SELECT DISTINCT department, count(*) FROM public.students WHERE hod_id = (SELECT id FROM public.profiles WHERE email = 'avudaiappant.ai@krct.ac.in') GROUP BY department;
