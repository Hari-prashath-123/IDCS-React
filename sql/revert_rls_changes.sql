-- Revert RLS policy changes introduced during recent edits
-- Run this in your Supabase SQL editor (dev) to remove the policies we added.

-- Drop policies added for leave/gatepass/bonafide application tables and approvals
DROP POLICY IF EXISTS hod_select_leave_applications ON public.leave_applications;
DROP POLICY IF EXISTS hod_select_leave_approvals ON public.leave_approvals;

DROP POLICY IF EXISTS hod_select_gatepass_applications ON public.gatepass_applications;
DROP POLICY IF EXISTS hod_select_gatepass_approvals ON public.gatepass_approvals;

DROP POLICY IF EXISTS hod_select_bonafide_applications ON public.bonafide_applications;
DROP POLICY IF EXISTS hod_select_bonafide_approvals ON public.bonafide_approvals;

-- If you also applied any other temporary policies, drop them here.
-- Example: DROP POLICY IF EXISTS hod_select_some_table ON public.some_table;

-- Optional: disable RLS on these tables if they had RLS enabled only by the recent changes
-- ALTER TABLE public.leave_applications DISABLE ROW LEVEL SECURITY;
-- ALTER TABLE public.leave_approvals DISABLE ROW LEVEL SECURITY;
-- ALTER TABLE public.gatepass_applications DISABLE ROW LEVEL SECURITY;
-- ALTER TABLE public.gatepass_approvals DISABLE ROW LEVEL SECURITY;
-- ALTER TABLE public.bonafide_applications DISABLE ROW LEVEL SECURITY;
-- ALTER TABLE public.bonafide_approvals DISABLE ROW LEVEL SECURITY;

-- After running, verify with:
-- SELECT policyname, tablename FROM pg_policies WHERE tablename IN (
--   'leave_applications','leave_approvals','gatepass_applications','gatepass_approvals','bonafide_applications','bonafide_approvals'
-- );
