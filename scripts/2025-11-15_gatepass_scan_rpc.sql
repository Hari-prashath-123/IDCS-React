-- Migration: add in_time/out_time to gatepass_applications and create record_gatepass_scan RPC
-- 2025-11-15
-- Run as an admin in Supabase SQL editor. Backup DB before running.

BEGIN;

-- 1) Add columns if not exists
ALTER TABLE public.gatepass_applications
  ADD COLUMN IF NOT EXISTS out_time timestamptz,
  ADD COLUMN IF NOT EXISTS in_time timestamptz;

-- 2) Create SECURITY DEFINER function to record scans atomically
CREATE OR REPLACE FUNCTION public.record_gatepass_scan(
  p_application_id uuid,
  p_action text,
  p_student_id uuid
) RETURNS TABLE(application_id uuid, updated_at timestamptz, out_time timestamptz, in_time timestamptz) AS $$
BEGIN
  -- Basic validation: ensure application exists and student matches
  IF NOT EXISTS (SELECT 1 FROM public.gatepass_applications WHERE id = p_application_id AND student_id = p_student_id) THEN
    RAISE EXCEPTION 'Application not found or student mismatch';
  END IF;

  IF lower(p_action) = 'out' THEN
    UPDATE public.gatepass_applications
    SET out_time = now(), updated_at = now()
    WHERE id = p_application_id;
  ELSIF lower(p_action) = 'in' THEN
    UPDATE public.gatepass_applications
    SET in_time = now(), updated_at = now()
    WHERE id = p_application_id;
  ELSE
    RAISE EXCEPTION 'Unknown action %', p_action;
  END IF;

  RETURN QUERY SELECT g.id, g.updated_at, g.out_time, g.in_time
  FROM public.gatepass_applications g
  WHERE g.id = p_application_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant execute to authenticated role (optional) - run as supabase admin if you want clients to call this RPC
GRANT EXECUTE ON FUNCTION public.record_gatepass_scan(uuid, text, uuid) TO authenticated;

COMMIT;

-- Notes:
-- - This creates `out_time` and `in_time` columns and an RPC to update them atomically.
-- - The RPC checks that the application belongs to the supplied student id. It is SECURITY DEFINER
--   so it can bypass RLS; ensure this is acceptable in your security model.
