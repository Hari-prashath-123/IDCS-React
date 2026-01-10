-- Drop `new` column from curriculum_master (made obsolete)
ALTER TABLE IF EXISTS curriculum_master
  DROP COLUMN IF EXISTS "new";

-- Index cleanup (if there was an index on new)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace WHERE c.relname = 'idx_curriculum_master_new') THEN
    EXECUTE 'DROP INDEX IF EXISTS idx_curriculum_master_new';
  END IF;
EXCEPTION WHEN others THEN
  -- ignore
  NULL;
END$$;
