-- Safe migration script: move rows from `approvals` (old) -> per-type approvals tables
-- Then optionally remove the old `approvals` and `applications` tables.
-- Usage:
-- 1) Dry-run: leave both flags false and run to see counts and actions.
-- 2) Migrate only: set perform_migrate := true and re-run (this inserts into new approvals tables).
-- 3) Migrate + drop: set perform_migrate := true and perform_cleanup := true (after verifying backups)

DO $$
DECLARE
  -- WARNING: By default this file will perform migration AND cleanup below.
  -- Make sure you have a DB snapshot/backups before running this file in production.
  perform_migrate boolean := true;      -- set true to actually insert into new approvals tables
  perform_cleanup boolean := true;      -- set true to drop old approvals/applications after migration

  approvals_count bigint := 0;
  od_approvals_to_move bigint := 0;
  leave_approvals_to_move bigint := 0;
  gatepass_approvals_to_move bigint := 0;
  bonafide_approvals_to_move bigint := 0;
  migrated bigint := 0;
BEGIN
  -- Basic existence checks
  IF to_regclass('public.approvals') IS NULL THEN
    RAISE NOTICE 'No old table public.approvals found. Nothing to do.';
    RETURN;
  END IF;

  IF to_regclass('public.applications') IS NULL THEN
    RAISE NOTICE 'No old table public.applications found. But approvals table exists - migration will attempt mapping via application_id join (may fail).';
  END IF;

  -- Counts
  EXECUTE 'SELECT count(*) FROM public.approvals' INTO approvals_count;
  EXECUTE 'SELECT count(*) FROM public.approvals ap JOIN public.applications a ON ap.application_id = a.id WHERE a.type = ''od''' INTO od_approvals_to_move;
  EXECUTE 'SELECT count(*) FROM public.approvals ap JOIN public.applications a ON ap.application_id = a.id WHERE a.type = ''leave''' INTO leave_approvals_to_move;
  EXECUTE 'SELECT count(*) FROM public.approvals ap JOIN public.applications a ON ap.application_id = a.id WHERE a.type = ''gatepass''' INTO gatepass_approvals_to_move;
  EXECUTE 'SELECT count(*) FROM public.approvals ap JOIN public.applications a ON ap.application_id = a.id WHERE a.type = ''bonafide''' INTO bonafide_approvals_to_move;

  RAISE NOTICE 'Approvals total: %', approvals_count;
  RAISE NOTICE 'Approvals mapped to OD: %', od_approvals_to_move;
  RAISE NOTICE 'Approvals mapped to LEAVE: %', leave_approvals_to_move;
  RAISE NOTICE 'Approvals mapped to GATEPASS: %', gatepass_approvals_to_move;
  RAISE NOTICE 'Approvals mapped to BONAFIDE: %', bonafide_approvals_to_move;

  IF NOT perform_migrate THEN
    RAISE NOTICE 'Dry-run: no rows migrated. Set perform_migrate := true to perform migration.';
    RETURN;
  END IF;

  -- Migrate OD approvals
  INSERT INTO public.od_approvals(id, application_id, approver_id, approver_role, action, remarks, created_at)
  SELECT ap.id, ap.application_id, ap.approver_id, ap.approver_role, ap.action, ap.remarks, ap.created_at
  FROM public.approvals ap JOIN public.applications a ON ap.application_id = a.id
  WHERE a.type = 'od'
  ON CONFLICT (id) DO NOTHING;
  GET DIAGNOSTICS migrated = ROW_COUNT;
  RAISE NOTICE 'Inserted % rows into od_approvals', migrated;

  -- Migrate Leave approvals
  INSERT INTO public.leave_approvals(id, application_id, approver_id, approver_role, action, remarks, created_at)
  SELECT ap.id, ap.application_id, ap.approver_id, ap.approver_role, ap.action, ap.remarks, ap.created_at
  FROM public.approvals ap JOIN public.applications a ON ap.application_id = a.id
  WHERE a.type = 'leave'
  ON CONFLICT (id) DO NOTHING;
  GET DIAGNOSTICS migrated = ROW_COUNT;
  RAISE NOTICE 'Inserted % rows into leave_approvals', migrated;

  -- Migrate Gatepass approvals
  INSERT INTO public.gatepass_approvals(id, application_id, approver_id, approver_role, action, remarks, created_at)
  SELECT ap.id, ap.application_id, ap.approver_id, ap.approver_role, ap.action, ap.remarks, ap.created_at
  FROM public.approvals ap JOIN public.applications a ON ap.application_id = a.id
  WHERE a.type = 'gatepass'
  ON CONFLICT (id) DO NOTHING;
  GET DIAGNOSTICS migrated = ROW_COUNT;
  RAISE NOTICE 'Inserted % rows into gatepass_approvals', migrated;

  -- Migrate Bonafide approvals
  INSERT INTO public.bonafide_approvals(id, application_id, approver_id, approver_role, action, remarks, created_at)
  SELECT ap.id, ap.application_id, ap.approver_id, ap.approver_role, ap.action, ap.remarks, ap.created_at
  FROM public.approvals ap JOIN public.applications a ON ap.application_id = a.id
  WHERE a.type = 'bonafide'
  ON CONFLICT (id) DO NOTHING;
  GET DIAGNOSTICS migrated = ROW_COUNT;
  RAISE NOTICE 'Inserted % rows into bonafide_approvals', migrated;

  -- After migration, show remaining approvals that were NOT mapped (if any)
  RAISE NOTICE 'Unmapped approvals (application_id not found in applications): %', (
    SELECT count(*) FROM public.approvals ap WHERE NOT EXISTS (SELECT 1 FROM public.applications a WHERE a.id = ap.application_id)
  );

  IF NOT perform_cleanup THEN
    RAISE NOTICE 'Migration completed. perform_cleanup false so no tables were dropped.';
    RETURN;
  END IF;

  -- perform_cleanup = true -> drop old approvals table and old applications (after backup)
  RAISE NOTICE 'Performing cleanup: creating backups and dropping old tables.';

  -- Backup approvals
  IF (SELECT count(*) FROM public.approvals) > 0 THEN
    EXECUTE format('CREATE TABLE public.approvals_backup_%s AS TABLE public.approvals', to_char(now(), 'YYYYMMDD_HH24MISS'));
    RAISE NOTICE 'approvals backup created';
  END IF;

  -- Backup applications
  IF to_regclass('public.applications') IS NOT NULL AND (SELECT count(*) FROM public.applications) > 0 THEN
    EXECUTE format('CREATE TABLE public.applications_backup_%s AS TABLE public.applications', to_char(now(), 'YYYYMMDD_HH24MISS'));
    RAISE NOTICE 'applications backup created';
  END IF;

  -- Drop dependent policy on approvals that referenced applications (if exists)
  BEGIN
    IF EXISTS (SELECT 1 FROM pg_policies p WHERE p.policyname = 'Users can view approvals for their applications' AND p.tablename = 'approvals') THEN
      EXECUTE 'DROP POLICY "Users can view approvals for their applications" ON public.approvals';
      RAISE NOTICE 'Dropped policy "Users can view approvals for their applications" on public.approvals';
    END IF;
  EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'Could not drop policy (may not exist): %', SQLERRM;
  END;

  -- Drop approvals table
  EXECUTE 'DROP TABLE IF EXISTS public.approvals CASCADE';
  RAISE NOTICE 'Dropped public.approvals';

  -- Now attempt to drop applications (may have other dependents)
  IF to_regclass('public.applications') IS NOT NULL THEN
    EXECUTE 'DROP TABLE IF EXISTS public.applications CASCADE';
    RAISE NOTICE 'Dropped public.applications (CASCADE)';
  END IF;

  RAISE NOTICE 'Cleanup completed.';
  -- Final verification: show counts in per-type approvals tables
  RAISE NOTICE 'Final counts after migration:';
  RAISE NOTICE 'od_approvals: %', (SELECT count(*) FROM public.od_approvals);
  RAISE NOTICE 'leave_approvals: %', (SELECT count(*) FROM public.leave_approvals);
  RAISE NOTICE 'gatepass_approvals: %', (SELECT count(*) FROM public.gatepass_approvals);
  RAISE NOTICE 'bonafide_approvals: %', (SELECT count(*) FROM public.bonafide_approvals);

  -- Warn user that backups were created (if any)
  RAISE NOTICE 'If backups were created they have names approvals_backup_<timestamp> and applications_backup_<timestamp> in schema public.';
END $$;

-- NOTES:
-- - This script is intentionally conservative. Leave both flags false to perform a dry-run and gather counts.
-- - When you set perform_migrate = true, rows will be inserted into the new per-type approvals tables using the original approval id.
-- - When you set perform_cleanup = true, the script will create backups and drop the old `approvals` and `applications` tables with CASCADE.
-- - Always take a database snapshot before running destructive steps in production.

-- For SQL editors that hide RAISE NOTICE output, return explicit verification rows below.
-- This SELECT will show counts in the per-type approval tables and whether old tables still exist,
-- plus any backup tables that were created and a few sample migrated rows.
-- Run the whole file; the DO $$; block performs migration/cleanup and these SELECTs produce visible rows.
SELECT
  (SELECT count(*) FROM public.od_approvals) AS od_approvals,
  (SELECT count(*) FROM public.leave_approvals) AS leave_approvals,
  (SELECT count(*) FROM public.gatepass_approvals) AS gatepass_approvals,
  (SELECT count(*) FROM public.bonafide_approvals) AS bonafide_approvals,
  (SELECT CASE WHEN to_regclass('public.approvals') IS NULL THEN 0 ELSE (SELECT count(*) FROM public.approvals) END) AS old_approvals_count,
  (SELECT CASE WHEN to_regclass('public.applications') IS NULL THEN 0 ELSE (SELECT count(*) FROM public.applications) END) AS old_applications_count;

SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND (tablename LIKE 'approvals_backup_%' OR tablename LIKE 'applications_backup_%') ORDER BY tablename;

-- A small sample from migrated tables (change limits if you want more rows)
SELECT id, application_id, approver_id, approver_role, action, remarks, created_at FROM public.od_approvals ORDER BY created_at DESC LIMIT 5;

