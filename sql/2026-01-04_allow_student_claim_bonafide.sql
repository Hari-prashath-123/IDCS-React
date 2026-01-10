-- Migration: allow students to update their own bonafide_applications (for claiming)
-- Run as DB owner in Supabase SQL editor (dev) first.

BEGIN;

-- Ensure RLS is enabled
ALTER TABLE IF EXISTS public.bonafide_applications ENABLE ROW LEVEL SECURITY;

-- Allow students to UPDATE their own bonafide application rows
DROP POLICY IF EXISTS student_update_bonafide_applications ON public.bonafide_applications;
CREATE POLICY student_update_bonafide_applications
  ON public.bonafide_applications
  FOR UPDATE
  USING (student_id = auth.uid())
  WITH CHECK (student_id = auth.uid());

COMMIT;

-- Notes:
-- 1) This policy permits authenticated users to update rows where they are the student.
-- 2) The frontend should only set `claimed_at` when calling UPDATE. If you prefer a narrower policy
--    (restricting which columns can be changed) consider exposing a SECURITY DEFINER RPC that
--    sets `claimed_at` atomically instead of granting a general UPDATE policy.
