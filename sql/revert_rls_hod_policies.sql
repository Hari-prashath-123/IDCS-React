-- revert_rls_hod_policies.sql
-- Run this in dev to remove the HOD-specific RLS policies and helper functions
-- IMPORTANT: Take a DB backup before running in production.

BEGIN;

-- Drop application/approval policies
DROP POLICY IF EXISTS hod_select_students ON public.students;
DROP POLICY IF EXISTS hod_select_od_applications ON public.od_applications;
DROP POLICY IF EXISTS hod_select_od_approvals ON public.od_approvals;
DROP POLICY IF EXISTS hod_select_profiles ON public.profiles;

DROP POLICY IF EXISTS hod_select_leave_applications ON public.leave_applications;
DROP POLICY IF EXISTS hod_select_leave_approvals ON public.leave_approvals;
DROP POLICY IF EXISTS hod_insert_leave_approvals ON public.leave_approvals;
DROP POLICY IF EXISTS hod_update_leave_approvals ON public.leave_approvals;

DROP POLICY IF EXISTS hod_select_gatepass_applications ON public.gatepass_applications;
DROP POLICY IF EXISTS hod_select_gatepass_approvals ON public.gatepass_approvals;
DROP POLICY IF EXISTS hod_insert_gatepass_approvals ON public.gatepass_approvals;
DROP POLICY IF EXISTS hod_update_gatepass_approvals ON public.gatepass_approvals;

DROP POLICY IF EXISTS hod_select_bonafide_applications ON public.bonafide_applications;
DROP POLICY IF EXISTS hod_select_bonafide_approvals ON public.bonafide_approvals;
DROP POLICY IF EXISTS hod_insert_bonafide_approvals ON public.bonafide_approvals;
DROP POLICY IF EXISTS hod_update_bonafide_approvals ON public.bonafide_approvals;

-- If you added any other hod_* policies, drop them as well. Example:
-- DROP POLICY IF EXISTS hod_select_some_table ON public.some_table;

-- Drop helper functions
DROP FUNCTION IF EXISTS public.hod_has_access_to_application(uuid, text);
DROP FUNCTION IF EXISTS public.hod_has_access_to_student(uuid);

COMMIT;

-- Verification queries (run after the script completes):
-- SELECT policyname, tablename FROM pg_policies WHERE policyname LIKE 'hod_%';
-- SELECT * FROM public.department_admins LIMIT 10;

-- NOTE: This script only drops the policies/functions added for the HOD feature.
-- If you need to restore a previous set of policies, restore from your DB backup
-- or re-apply the prior RLS SQL file (if available).
