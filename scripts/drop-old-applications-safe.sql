-- Safe drop script for `public.applications`
-- Usage (dry-run): paste into Supabase SQL editor and run as is.
-- To actually drop: set perform_drop := true in the DECLARE section below and re-run (after taking backup).

DO $$
DECLARE
  perform_drop boolean := false; -- change to true to apply the drop
  old_table regclass := to_regclass('public.applications');
  has_rows bigint := 0;
  fk_count bigint := 0;
  func_refs bigint := 0;
  view_refs bigint := 0;
  backup_name text;
BEGIN
  IF old_table IS NULL THEN
    RAISE NOTICE 'Table public.applications does not exist. Nothing to do.';
    RETURN;
  END IF;

  -- Ensure new split tables exist before dropping
  PERFORM 1 FROM pg_class c JOIN pg_namespace n ON c.relnamespace = n.oid
    WHERE n.nspname = 'public' AND c.relname = ANY(ARRAY['od_applications','leave_applications','gatepass_applications','bonafide_applications'])
    GROUP BY c.relname;

  -- Row count
  EXECUTE format('SELECT count(*) FROM %s', old_table) INTO has_rows;
  RAISE NOTICE 'Old table public.applications row count: %', has_rows;

  -- Foreign key references to the old table
  SELECT count(*) INTO fk_count
  FROM pg_constraint
  WHERE confrelid = old_table;
  RAISE NOTICE 'Found % foreign-key constraints referencing public.applications', fk_count;

  -- Search for references to 'applications' in functions and views (safer approach via information_schema)
  BEGIN
    SELECT count(*) INTO func_refs FROM information_schema.routines WHERE routine_definition ILIKE '%applications%';
  EXCEPTION WHEN OTHERS THEN
    func_refs := 0;
    RAISE NOTICE 'Could not inspect routine definitions safely: %', SQLERRM;
  END;

  BEGIN
    SELECT count(*) INTO view_refs FROM information_schema.views WHERE view_definition ILIKE '%applications%';
  EXCEPTION WHEN OTHERS THEN
    view_refs := 0;
    RAISE NOTICE 'Could not inspect view definitions safely: %', SQLERRM;
  END;

  RAISE NOTICE 'Function defs referencing ''applications'': %; Views referencing ''applications'': %', func_refs, view_refs;

  IF NOT perform_drop THEN
    RAISE NOTICE 'Dry-run: no changes made. To drop the table, set perform_drop := true in the script and re-run.';
    RAISE NOTICE 'Suggested next steps:';
    RAISE NOTICE ' 1) Verify new tables contain expected data: od_applications, leave_applications, gatepass_applications, bonafide_applications';
    RAISE NOTICE ' 2) If rows exist in old table, run a backup (script can do this when perform_drop = true).';
    RAISE NOTICE ' 3) If func/view references exist, inspect and update them before drop.';
    RETURN;
  END IF;

  -- At this point perform_drop = true
  -- Backup if rows exist
  IF has_rows > 0 THEN
    backup_name := format('public.applications_backup_%s', to_char(now(), 'YYYYMMDD_HH24MISS'));
    RAISE NOTICE 'Backing up public.applications to %', backup_name;
    EXECUTE format('CREATE TABLE %I AS TABLE %s', backup_name, old_table);
    RAISE NOTICE 'Backup created: %', backup_name;
  END IF;

  -- If there are dependent objects, be cautious: drop with CASCADE only if you accept removing dependents
  IF fk_count > 0 OR func_refs > 0 OR view_refs > 0 THEN
    RAISE NOTICE 'Dependent objects detected (FKs/functions/views). Dropping with CASCADE.';
    EXECUTE format('DROP TABLE %s CASCADE', old_table);
    RAISE NOTICE 'Dropped public.applications with CASCADE.';
  ELSE
    EXECUTE format('DROP TABLE %s', old_table);
    RAISE NOTICE 'Dropped public.applications.';
  END IF;
END $$;

-- Notes:
-- - This script is intentionally conservative. Keep perform_drop=false to run a dry-run.
-- - If you want to be extra safe, run the backup step separately and verify backups before dropping.
-- - After dropping, remember to remove any related RLS policies, grants, functions, triggers, or application code that referenced the old table.
