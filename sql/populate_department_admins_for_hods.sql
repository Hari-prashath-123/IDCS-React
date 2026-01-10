-- Populate `department_admins` mapping for existing HODs
-- Run this in your Supabase SQL editor (dev) to grant HODs department-scoped access

-- Preview which HOD profiles will be inserted
SELECT id AS profile_id, email, department
FROM public.profiles
WHERE role = 'hod' AND department IS NOT NULL;

-- Insert mappings for HODs that are not yet present in department_admins
INSERT INTO public.department_admins (staff_id, department)
SELECT p.id, p.department
FROM public.profiles p
WHERE p.role = 'hod'
  AND p.department IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM public.department_admins da
    WHERE da.staff_id = p.id AND da.department = p.department
  );

-- Verify inserts
SELECT * FROM public.department_admins WHERE staff_id IN (
  SELECT id FROM public.profiles WHERE role = 'hod'
);
