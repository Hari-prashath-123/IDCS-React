-- Fix HOD profile and department_admins mapping for avudaiappant.ai@krct.ac.in
-- Run in Supabase SQL editor (dev). This will:
-- 1) show current profile
-- 2) update `profiles.department` to 'AI&DS' and ensure role='hod'
-- 3) upsert a mapping into `department_admins` for that department
-- 4) show verification queries

-- 1) Preview
SELECT id, email, role, department, is_department_admin FROM public.profiles WHERE email = 'avudaiappant.ai@krct.ac.in';

-- 2) Update profile to the expected department and role (idempotent)
UPDATE public.profiles
SET department = 'AI&DS', role = 'hod'
WHERE email = 'avudaiappant.ai@krct.ac.in'
  AND (department IS DISTINCT FROM 'AI&DS' OR role IS DISTINCT FROM 'hod');

-- 3) Upsert department_admins mapping for this HOD
WITH p AS (
  SELECT id, department FROM public.profiles WHERE email = 'avudaiappant.ai@krct.ac.in'
)
INSERT INTO public.department_admins (department, staff_id)
SELECT department, id FROM p
ON CONFLICT (department) DO UPDATE SET staff_id = EXCLUDED.staff_id;

-- 4) Verify mapping and sample student/applications
SELECT p.id AS profile_id, p.email, p.role, p.department, da.staff_id
FROM public.profiles p
LEFT JOIN public.department_admins da ON da.department = p.department
WHERE p.email = 'avudaiappant.ai@krct.ac.in';

SELECT id, reg_no, roll_no, department FROM public.students WHERE department = 'AI&DS' LIMIT 20;

SELECT * FROM public.od_applications WHERE student_id IN (SELECT id FROM public.students WHERE department = 'AI&DS') LIMIT 20;

SELECT * FROM public.leave_applications WHERE student_id IN (SELECT id FROM public.students WHERE department = 'AI&DS') LIMIT 20;
