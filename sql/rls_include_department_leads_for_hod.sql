-- Add department_leads mapping to HOD access helper
-- Run this in Supabase SQL editor (dev) to allow HODs listed in
-- `department_leads` to access students/applications for that department.

BEGIN;

-- Replace the existing helper to include department_leads mapping
CREATE OR REPLACE FUNCTION public.hod_has_access_to_student(student_uuid uuid)
RETURNS boolean
LANGUAGE sql
STABLE
AS $$
  SELECT (
    -- admin bypass
    EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role = 'admin')
    -- HOD where profile.department matches student.department
    OR EXISTS (
      SELECT 1 FROM public.profiles p, public.students s
      WHERE p.id = auth.uid() AND p.role = 'hod' AND s.id = student_uuid AND p.department = s.department
    )
    -- department_leads mapping: allow HODs recorded in department_leads to access
    OR EXISTS (
      SELECT 1
      FROM public.department_leads dl
      JOIN public.departments d ON dl.department_id = d.id
      JOIN public.students s ON s.id = student_uuid
      WHERE dl.hod_id = auth.uid()
        AND UPPER(TRIM(d.name)) = UPPER(TRIM(s.department))
    )
  );
$$;

COMMIT;

-- Quick checks (run after applying):
-- SELECT public.hod_has_access_to_student('<some-student-uuid>');
-- SELECT public.hod_has_access_to_application('<some-app-uuid>', 'od_applications');
