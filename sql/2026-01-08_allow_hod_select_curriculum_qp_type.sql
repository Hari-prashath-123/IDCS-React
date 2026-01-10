-- Migration: allow any HOD or admin to SELECT qp_type and curriculum_master
-- Created: 2026-01-08

-- Update qp_type policies: allow admins or any hod to SELECT
ALTER TABLE public.qp_type ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "IQAC HOD full select on qp_type" ON public.qp_type;
DROP POLICY IF EXISTS "allow_admins_or_hod_select_qp_type" ON public.qp_type;

CREATE POLICY "allow_admins_or_hod_select_qp_type" ON public.qp_type
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid()
        AND (
          p.role = 'admin'
          OR p.role = 'hod'
        )
    )
  );

-- Keep existing INSERT/UPDATE/DELETE policies unchanged (they remain restricted to IQAC as before).

-- Update curriculum_master policies: allow admins or any hod to SELECT
ALTER TABLE public.curriculum_master ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "allow_admins_or_iqac_hod_select" ON public.curriculum_master;
DROP POLICY IF EXISTS "allow_admins_or_hod_select" ON public.curriculum_master;

CREATE POLICY "allow_admins_or_hod_select" ON public.curriculum_master
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid()
        AND (
          p.role = 'admin'
          OR p.role = 'hod'
        )
    )
  );

-- Note: Run this migration in Supabase SQL editor or via your migration tool to apply the policy changes.
