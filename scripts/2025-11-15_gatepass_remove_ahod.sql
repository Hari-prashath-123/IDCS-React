-- Migration: remove AHOD from gatepass approval flow
-- 2025-11-15
-- Safe idempotent migration to:
-- 1) Move pending gatepass applications that are currently at 'ahod' level to 'hod'
-- 2) Ensure gatepass_applications.current_approver_level only allows ('advisor','hod','completed')
-- 3) Ensure gatepass_approvals.approver_role only allows ('advisor','hod')
-- Run this in Supabase SQL editor as an admin (make a DB backup before running).


-- This migration updates any gatepass rows that currently have unexpected approver levels
-- (for example 'ahod') and maps them to allowed values, then installs strict CHECK constraints.
-- It is intended to be run by a DB admin (Supabase SQL editor). BACKUP your DB before running.

BEGIN;

-- 0) Inspect unexpected current_approver_level values (for debugging)
-- SELECT current_approver_level, count(*) FROM public.gatepass_applications GROUP BY 1 ORDER BY 1;

-- 1) Normalize gatepass_applications.current_approver_level
-- Map any non-allowed level to 'hod' (for AHOD and other unexpected values)
UPDATE public.gatepass_applications
SET current_approver_level = 'hod', updated_at = now()
WHERE current_approver_level NOT IN ('advisor', 'hod', 'completed')
  AND status = 'pending';

-- For completed or non-pending rows, be conservative and map only explicit 'ahod' -> 'hod'
UPDATE public.gatepass_applications
SET current_approver_level = 'hod', updated_at = now()
WHERE current_approver_level = 'ahod' AND status <> 'pending';

-- 2) Normalize gatepass_approvals.approver_role: map any 'ahod' or unexpected roles to 'hod'
UPDATE public.gatepass_approvals
SET approver_role = 'hod'
WHERE approver_role NOT IN ('advisor','hod');

-- 3) Replace CHECK constraints on gatepass_applications.current_approver_level
DO $$
DECLARE
  r record;
BEGIN
  -- Drop any existing check constraints that reference current_approver_level
  FOR r IN
    SELECT conname
    FROM pg_constraint c
    JOIN pg_class t ON c.conrelid = t.oid
    WHERE t.relname = 'gatepass_applications'
      AND pg_get_constraintdef(c.oid) ILIKE '%current_approver_level%'
  LOOP
    EXECUTE format('ALTER TABLE public.gatepass_applications DROP CONSTRAINT %I', r.conname);
  END LOOP;

  -- Ensure default is advisor
  BEGIN
    ALTER TABLE public.gatepass_applications ALTER COLUMN current_approver_level SET DEFAULT 'advisor';
  EXCEPTION WHEN undefined_column THEN
    RAISE NOTICE 'Column current_approver_level not found on gatepass_applications';
  END;

  -- Add new constraint
  EXECUTE 'ALTER TABLE public.gatepass_applications ADD CONSTRAINT gatepass_current_approver_level_chk CHECK (current_approver_level IN (''advisor'',''hod'',''completed''))';
END$$;

-- 4) Replace CHECK constraints on gatepass_approvals.approver_role
DO $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT conname
    FROM pg_constraint c
    JOIN pg_class t ON c.conrelid = t.oid
    WHERE t.relname = 'gatepass_approvals'
      AND pg_get_constraintdef(c.oid) ILIKE '%approver_role%'
  LOOP
    EXECUTE format('ALTER TABLE public.gatepass_approvals DROP CONSTRAINT %I', r.conname);
  END LOOP;

  EXECUTE 'ALTER TABLE public.gatepass_approvals ADD CONSTRAINT gatepass_approvals_approver_role_chk CHECK (approver_role IN (''advisor'',''hod''))';
END$$;

COMMIT;

-- Notes:
-- - This migration is idempotent for the constraint-replacement logic (drops existing constraints that refer to the named column),
--   and will safely update any pending gatepass rows that currently have level 'ahod' to 'hod'.
-- - Back up your DB before running. If you use RLS/policies that prevent direct updates, run this as a DB/admin user or via Supabase SQL editor.
-- - After running, verify by running:
--   select id, current_approver_level, status from public.gatepass_applications where current_approver_level = 'ahod';
--   -- should return zero rows
--   select conname, pg_get_constraintdef(c.oid) from pg_constraint c join pg_class t on c.conrelid = t.oid where t.relname = 'gatepass_applications' or t.relname = 'gatepass_approvals';
