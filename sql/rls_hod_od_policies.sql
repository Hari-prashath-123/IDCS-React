-- RLS policies to allow HODs (and admins) to SELECT and manage department-scoped application data
-- Review before applying. Run via psql or Supabase SQL editor in a dev environment first.

-- NOTE: only create these policies if your project already uses RLS. Enabling RLS
-- on a table without careful policies may break other clients.

-- Helper: single entrypoint to determine whether the current authenticated
-- user can access data for a given student. This centralises logic so policies
-- remain small and consistent.
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
    -- department_admins mapping for student's department
    OR EXISTS (
      SELECT 1 FROM public.department_admins da, public.students s
      WHERE da.staff_id = auth.uid() AND s.id = student_uuid AND da.department = s.department
    )
    -- IQAC mapping grants global access
    OR EXISTS (
      SELECT 1 FROM public.department_admins da_iqac WHERE da_iqac.staff_id = auth.uid() AND da_iqac.department = 'IQAC'
    )
  );
$$;

-- Helper wrapper for approvals: resolve application -> student then reuse the
-- student-level check. The `app_table` parameter chooses which application table
-- to query for the student_id.
CREATE OR REPLACE FUNCTION public.hod_has_access_to_application(app_uuid uuid, app_table text)
RETURNS boolean
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  student_uuid uuid;
BEGIN
  IF app_table = 'od_applications' THEN
    SELECT student_id INTO student_uuid FROM public.od_applications WHERE id = app_uuid;
  ELSIF app_table = 'leave_applications' THEN
    SELECT student_id INTO student_uuid FROM public.leave_applications WHERE id = app_uuid;
  ELSIF app_table = 'gatepass_applications' THEN
    SELECT student_id INTO student_uuid FROM public.gatepass_applications WHERE id = app_uuid;
  ELSIF app_table = 'bonafide_applications' THEN
    SELECT student_id INTO student_uuid FROM public.bonafide_applications WHERE id = app_uuid;
  ELSE
    RETURN FALSE;
  END IF;
  IF student_uuid IS NULL THEN
    RETURN FALSE;
  END IF;
  RETURN public.hod_has_access_to_student(student_uuid);
END;
$$;

-- Students: allow HODs to select students in their department
ALTER TABLE IF EXISTS public.students ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS hod_select_students ON public.students;
CREATE POLICY hod_select_students
  ON public.students
  FOR SELECT
  USING (
    public.hod_has_access_to_student(public.students.id)
  );

-- OD Applications: allow HODs to select applications whose student belongs to HOD's department
ALTER TABLE IF EXISTS public.od_applications ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS hod_select_od_applications ON public.od_applications;
CREATE POLICY hod_select_od_applications
  ON public.od_applications
  FOR SELECT
  USING (
    public.hod_has_access_to_student(public.od_applications.student_id)
  );

-- OD Approvals: allow HODs to select approvals for applications in their department
ALTER TABLE IF EXISTS public.od_approvals ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS hod_select_od_approvals ON public.od_approvals;
CREATE POLICY hod_select_od_approvals
  ON public.od_approvals
  FOR SELECT
  USING (
    public.hod_has_access_to_application(public.od_approvals.application_id, 'od_applications')
  );

-- Profiles: allow HODs to select profiles for users in their department
ALTER TABLE IF EXISTS public.profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS hod_select_profiles ON public.profiles;
CREATE POLICY hod_select_profiles
  ON public.profiles
  FOR SELECT
  USING (
    id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.department_admins da
      WHERE da.staff_id = auth.uid()
        AND da.department = public.profiles.department
    )
    OR EXISTS (
      -- IQAC HODs (mapped in department_admins with department='IQAC') can view all profiles
      SELECT 1 FROM public.department_admins da_iqac
      WHERE da_iqac.staff_id = auth.uid() AND da_iqac.department = 'IQAC'
    )
  );

-- === Additional application policies for HODs across departments ===
-- These policies allow HODs (by profile.role='hod' and matching department)
-- or staff mapped in `department_admins` to SELECT applications and approvals
-- and to INSERT/UPDATE approval records when the approver is the authenticated user.

-- Leave applications: SELECT
ALTER TABLE IF EXISTS public.leave_applications ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS hod_select_leave_applications ON public.leave_applications;
CREATE POLICY hod_select_leave_applications
  ON public.leave_applications
  FOR SELECT
  USING (
    public.hod_has_access_to_student(public.leave_applications.student_id)
  );

-- Leave approvals: SELECT, INSERT, UPDATE (approver must be auth user)
ALTER TABLE IF EXISTS public.leave_approvals ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS hod_select_leave_approvals ON public.leave_approvals;
CREATE POLICY hod_select_leave_approvals
  ON public.leave_approvals
  FOR SELECT
  USING (
    public.hod_has_access_to_application(public.leave_approvals.application_id, 'leave_applications')
  );

DROP POLICY IF EXISTS hod_insert_leave_approvals ON public.leave_approvals;
CREATE POLICY hod_insert_leave_approvals
  ON public.leave_approvals
  FOR INSERT
  WITH CHECK (
    approver_id = auth.uid()
    AND public.hod_has_access_to_application(public.leave_approvals.application_id, 'leave_applications')
  )
  ;

DROP POLICY IF EXISTS hod_update_leave_approvals ON public.leave_approvals;
CREATE POLICY hod_update_leave_approvals
  ON public.leave_approvals
  FOR UPDATE
  USING (approver_id = auth.uid())
  WITH CHECK (approver_id = auth.uid());

-- Gatepass applications: SELECT
ALTER TABLE IF EXISTS public.gatepass_applications ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS hod_select_gatepass_applications ON public.gatepass_applications;
CREATE POLICY hod_select_gatepass_applications
  ON public.gatepass_applications
  FOR SELECT
  USING (
    public.hod_has_access_to_student(public.gatepass_applications.student_id)
  );

-- Gatepass approvals: SELECT, INSERT, UPDATE
ALTER TABLE IF EXISTS public.gatepass_approvals ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS hod_select_gatepass_approvals ON public.gatepass_approvals;
CREATE POLICY hod_select_gatepass_approvals
  ON public.gatepass_approvals
  FOR SELECT
  USING (
    public.hod_has_access_to_application(public.gatepass_approvals.application_id, 'gatepass_applications')
  );

DROP POLICY IF EXISTS hod_insert_gatepass_approvals ON public.gatepass_approvals;
CREATE POLICY hod_insert_gatepass_approvals
  ON public.gatepass_approvals
  FOR INSERT
  WITH CHECK (
    approver_id = auth.uid()
    AND public.hod_has_access_to_application(public.gatepass_approvals.application_id, 'gatepass_applications')
  );

DROP POLICY IF EXISTS hod_update_gatepass_approvals ON public.gatepass_approvals;
CREATE POLICY hod_update_gatepass_approvals
  ON public.gatepass_approvals
  FOR UPDATE
  USING (approver_id = auth.uid())
  WITH CHECK (approver_id = auth.uid());

-- Bonafide applications: SELECT
ALTER TABLE IF EXISTS public.bonafide_applications ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS hod_select_bonafide_applications ON public.bonafide_applications;
CREATE POLICY hod_select_bonafide_applications
  ON public.bonafide_applications
  FOR SELECT
  USING (
    public.hod_has_access_to_student(public.bonafide_applications.student_id)
  );

-- Bonafide approvals: SELECT, INSERT, UPDATE
ALTER TABLE IF EXISTS public.bonafide_approvals ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS hod_select_bonafide_approvals ON public.bonafide_approvals;
CREATE POLICY hod_select_bonafide_approvals
  ON public.bonafide_approvals
  FOR SELECT
  USING (
    public.hod_has_access_to_application(public.bonafide_approvals.application_id, 'bonafide_applications')
  );

DROP POLICY IF EXISTS hod_insert_bonafide_approvals ON public.bonafide_approvals;
CREATE POLICY hod_insert_bonafide_approvals
  ON public.bonafide_approvals
  FOR INSERT
  WITH CHECK (
    approver_id = auth.uid()
    AND public.hod_has_access_to_application(public.bonafide_approvals.application_id, 'bonafide_applications')
  );

DROP POLICY IF EXISTS hod_update_bonafide_approvals ON public.bonafide_approvals;
CREATE POLICY hod_update_bonafide_approvals
  ON public.bonafide_approvals
  FOR UPDATE
  USING (approver_id = auth.uid())
  WITH CHECK (approver_id = auth.uid());

-- Testing notes:
-- 1. Open Supabase SQL editor or use psql with your DB URL.
-- 2. Run this file in a dev environment first.
-- 3. Test with a HOD account (login via app, then in browser console run the same queriezs used by the frontend).
-- 4. If you need more fields (e.g., joining profiles), add policies for `profiles` SELECT accordingly.

-- Revert: to remove these policies, DROP POLICY <name> ON <table> or restore from backup.

