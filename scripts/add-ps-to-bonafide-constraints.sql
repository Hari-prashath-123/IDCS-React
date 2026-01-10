-- Migration: safely allow 'ps' as a valid approver level and approver role for bonafide
-- This script is safe to run multiple times. It will:
-- 1. Find and drop any CHECK constraints on the target tables that reference
--    the `current_approver_level` or `approver_role` columns.
-- 2. Add a named CHECK constraint that includes 'ps' where appropriate.
-- 3. (Optional) Create a unique constraint to prevent duplicate approvals per (application_id, approver_role).

-- Run this in Supabase SQL editor as a project admin.

DO $$
DECLARE
  c RECORD;
BEGIN
  -- Drop any check constraint on bonafide_applications that references current_approver_level
  FOR c IN
    SELECT conname
    FROM pg_constraint con
    JOIN pg_class rel ON rel.oid = con.conrelid
    WHERE rel.relname = 'bonafide_applications'
      AND con.contype = 'c'
      AND pg_get_constraintdef(con.oid) ILIKE '%current_approver_level%'
  LOOP
    EXECUTE format('ALTER TABLE public.bonafide_applications DROP CONSTRAINT IF EXISTS %I', c.conname);
  END LOOP;

  -- Add the canonical named constraint (will fail if exists, so use IF NOT EXISTS pattern)
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint con
    JOIN pg_class rel ON rel.oid = con.conrelid
    WHERE rel.relname = 'bonafide_applications'
      AND con.contype = 'c'
      AND pg_get_constraintdef(con.oid) ILIKE '%current_approver_level%'
  ) THEN
    EXECUTE 'ALTER TABLE public.bonafide_applications ADD CONSTRAINT bonafide_applications_current_approver_level_check CHECK (current_approver_level IN (''mentor'', ''advisor'', ''hod'', ''ps'', ''completed''))';
  END IF;

  -- Drop any check constraint on bonafide_approvals that references approver_role
  FOR c IN
    SELECT conname
    FROM pg_constraint con
    JOIN pg_class rel ON rel.oid = con.conrelid
    WHERE rel.relname = 'bonafide_approvals'
      AND con.contype = 'c'
      AND pg_get_constraintdef(con.oid) ILIKE '%approver_role%'
  LOOP
    EXECUTE format('ALTER TABLE public.bonafide_approvals DROP CONSTRAINT IF EXISTS %I', c.conname);
  END LOOP;

  -- Add the canonical named constraint for approver_role
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint con
    JOIN pg_class rel ON rel.oid = con.conrelid
    WHERE rel.relname = 'bonafide_approvals'
      AND con.contype = 'c'
      AND pg_get_constraintdef(con.oid) ILIKE '%approver_role%'
  ) THEN
    EXECUTE 'ALTER TABLE public.bonafide_approvals ADD CONSTRAINT bonafide_approvals_approver_role_check CHECK (approver_role IN (''mentor'', ''advisor'', ''hod'', ''ps''))';
  END IF;

  -- Optional: add unique constraint to prevent duplicate approver_role for same application
  -- Uncomment the following block if you want DB-level enforcement
  /*
  BEGIN
    EXECUTE 'ALTER TABLE public.bonafide_approvals ADD CONSTRAINT unique_bonafide_application_approver UNIQUE (application_id, approver_role)';
  EXCEPTION WHEN duplicate_table THEN
    -- constraint already exists, ignore
    NULL;
  END;
  */
END$$;

-- Note: After running this, updates that set current_approver_level = 'ps' and inserts with approver_role = 'ps' will succeed.
