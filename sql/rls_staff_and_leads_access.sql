-- Grant staff and department_leads-based HOD/AHOD access to students and applications
-- This file adds helper functions and RLS policies so:
--  - HOD/AHOD listed in department_leads can access students/applications for that department
--  - Staff (mentor/advisor/lecturer) can access students/applications when their profile.department matches student.department
-- Run in Supabase SQL editor (dev) first.

BEGIN;

-- 1) Helper: staff access to student by department
CREATE OR REPLACE FUNCTION public.staff_has_access_to_student(student_uuid uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.profiles p
    JOIN public.students s ON s.id = student_uuid
    WHERE p.id = auth.uid()
      AND UPPER(TRIM(p.department)) = UPPER(TRIM(s.department))
      AND p.role IN ('staff','mentor','advisor','lecturer')
  );
$$;

-- 2) Wrapper: staff access to application (resolve student_id then reuse student check)
CREATE OR REPLACE FUNCTION public.staff_has_access_to_application(app_uuid uuid, app_table text)
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
  RETURN public.staff_has_access_to_student(student_uuid);
END;
$$;

-- 0b) Helper: check if a user is department lead (HOD/AHOD) for a given student
CREATE OR REPLACE FUNCTION public.is_dept_lead_for_student(student_uuid uuid, user_uuid uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.students s
    JOIN public.departments d ON UPPER(TRIM(d.name)) = UPPER(TRIM(s.department))
    JOIN public.department_leads dl ON dl.department_id = d.id
    WHERE s.id = $1
      AND (dl.hod_id = $2 OR dl.ahod_id = $2)
  );
$$;

-- 0c) Safe HOD check for student (only uses students + department_leads)
CREATE OR REPLACE FUNCTION public.hod_has_access_to_student(student_uuid uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY INVOKER
AS $$
  SELECT public.is_dept_lead_for_student($1, auth.uid()::uuid);
$$;

-- 3) Application SELECT policies: allow staff or department leads (HOD/AHOD) or existing approvers

-- OD applications
ALTER TABLE IF EXISTS public.od_applications ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS staff_select_od_applications ON public.od_applications;
CREATE POLICY staff_select_od_applications
  ON public.od_applications
  FOR SELECT
  USING (
    public.staff_has_access_to_student(public.od_applications.student_id)
    OR public.hod_has_access_to_student(public.od_applications.student_id)
  );

-- Leave applications
ALTER TABLE IF EXISTS public.leave_applications ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS staff_select_leave_applications ON public.leave_applications;
CREATE POLICY staff_select_leave_applications
  ON public.leave_applications
  FOR SELECT
  USING (
    public.staff_has_access_to_student(public.leave_applications.student_id)
    OR public.hod_has_access_to_student(public.leave_applications.student_id)
  );

-- Gatepass applications
ALTER TABLE IF EXISTS public.gatepass_applications ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS staff_select_gatepass_applications ON public.gatepass_applications;
CREATE POLICY staff_select_gatepass_applications
  ON public.gatepass_applications
  FOR SELECT
  USING (
    public.staff_has_access_to_student(public.gatepass_applications.student_id)
    OR public.hod_has_access_to_student(public.gatepass_applications.student_id)
  );

-- Bonafide applications
ALTER TABLE IF EXISTS public.bonafide_applications ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS staff_select_bonafide_applications ON public.bonafide_applications;
CREATE POLICY staff_select_bonafide_applications
  ON public.bonafide_applications
  FOR SELECT
  USING (
    public.staff_has_access_to_student(public.bonafide_applications.student_id)
    OR public.hod_has_access_to_student(public.bonafide_applications.student_id)
  );

-- 4) Approvals: allow staff to view/insert/update approvals for applications they have access to

-- OD approvals
ALTER TABLE IF EXISTS public.od_approvals ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS staff_select_od_approvals ON public.od_approvals;
CREATE POLICY staff_select_od_approvals
  ON public.od_approvals
  FOR SELECT
  USING (
    approver_id = auth.uid()
  );

DROP POLICY IF EXISTS staff_insert_od_approvals ON public.od_approvals;
CREATE POLICY staff_insert_od_approvals
  ON public.od_approvals
  FOR INSERT
  WITH CHECK (
    approver_id = auth.uid()
  );

DROP POLICY IF EXISTS staff_update_od_approvals ON public.od_approvals;
CREATE POLICY staff_update_od_approvals
  ON public.od_approvals
  FOR UPDATE
  USING (approver_id = auth.uid())
  WITH CHECK (approver_id = auth.uid());

-- Leave approvals
ALTER TABLE IF EXISTS public.leave_approvals ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS staff_select_leave_approvals ON public.leave_approvals;
CREATE POLICY staff_select_leave_approvals
  ON public.leave_approvals
  FOR SELECT
  USING (
    approver_id = auth.uid()
  );

DROP POLICY IF EXISTS staff_insert_leave_approvals ON public.leave_approvals;
CREATE POLICY staff_insert_leave_approvals
  ON public.leave_approvals
  FOR INSERT
  WITH CHECK (
    approver_id = auth.uid()
  );

DROP POLICY IF EXISTS staff_update_leave_approvals ON public.leave_approvals;
CREATE POLICY staff_update_leave_approvals
  ON public.leave_approvals
  FOR UPDATE
  USING (approver_id = auth.uid())
  WITH CHECK (approver_id = auth.uid());

-- Gatepass approvals
ALTER TABLE IF EXISTS public.gatepass_approvals ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS staff_select_gatepass_approvals ON public.gatepass_approvals;
CREATE POLICY staff_select_gatepass_approvals
  ON public.gatepass_approvals
  FOR SELECT
  USING (
    approver_id = auth.uid()
  );

DROP POLICY IF EXISTS staff_insert_gatepass_approvals ON public.gatepass_approvals;
CREATE POLICY staff_insert_gatepass_approvals
  ON public.gatepass_approvals
  FOR INSERT
  WITH CHECK (
    approver_id = auth.uid()
  );

DROP POLICY IF EXISTS staff_update_gatepass_approvals ON public.gatepass_approvals;
CREATE POLICY staff_update_gatepass_approvals
  ON public.gatepass_approvals
  FOR UPDATE
  USING (approver_id = auth.uid())
  WITH CHECK (approver_id = auth.uid());

-- Bonafide approvals
ALTER TABLE IF EXISTS public.bonafide_approvals ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS staff_select_bonafide_approvals ON public.bonafide_approvals;
CREATE POLICY staff_select_bonafide_approvals
  ON public.bonafide_approvals
  FOR SELECT
  USING (
    approver_id = auth.uid()
  );

DROP POLICY IF EXISTS staff_insert_bonafide_approvals ON public.bonafide_approvals;
CREATE POLICY staff_insert_bonafide_approvals
  ON public.bonafide_approvals
  FOR INSERT
  WITH CHECK (
    approver_id = auth.uid()
  );

DROP POLICY IF EXISTS staff_update_bonafide_approvals ON public.bonafide_approvals;
CREATE POLICY staff_update_bonafide_approvals
  ON public.bonafide_approvals
  FOR UPDATE
  USING (approver_id = auth.uid())
  WITH CHECK (approver_id = auth.uid());

COMMIT;

-- Quick tests:
-- SELECT public.staff_has_access_to_student('<student_uuid>');
-- SELECT public.staff_has_access_to_application('<app_uuid>', 'od_applications');
