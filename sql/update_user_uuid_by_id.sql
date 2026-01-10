-- Safe update: replace occurrences of an old UUID with a new UUID across accessible tables
-- IMPORTANT: Inspect and run in a backup or read-replica first.

BEGIN;

DO $$
DECLARE
  old_id UUID := '781b4ec1-5986-480e-a02f-2c8abb66a05a';
  new_id UUID := 'ea4997c1-c3b1-4228-89e9-fbce04e68b94';
  fk RECORD;
  col RECORD;
  upd_sql TEXT;
BEGIN
  RAISE NOTICE 'Starting UUID replacement: % -> %', old_id, new_id;

  -- 1) Update all foreign-key columns (child tables) where value = old_id
  FOR fk IN
    SELECT con.conrelid::regclass::text AS table_name,
           att.attname AS column_name
    FROM pg_constraint con
    JOIN LATERAL unnest(con.conkey) WITH ORDINALITY AS cols(attnum, ord) ON true
    JOIN pg_attribute att ON att.attrelid = con.conrelid AND att.attnum = cols.attnum
    WHERE con.contype = 'f'
  LOOP
    upd_sql := format('UPDATE %s SET %I = %L WHERE %I = %L', fk.table_name, fk.column_name, new_id::text, fk.column_name, old_id::text);
    BEGIN
      EXECUTE upd_sql;
      RAISE NOTICE 'Updated FK column % in table %', fk.column_name, fk.table_name;
    EXCEPTION WHEN insufficient_privilege THEN
      RAISE NOTICE 'Skipping FK update on % due to insufficient_privilege', fk.table_name;
    WHEN others THEN
      RAISE NOTICE 'Skipping FK update on % due to error: %', fk.table_name, SQLERRM;
    END;
  END LOOP;

  -- 2) Update any uuid-typed columns that contain the old UUID (non-FK columns)
  FOR col IN
    SELECT table_schema, table_name, column_name
    FROM information_schema.columns
    WHERE udt_name = 'uuid'
      AND table_schema NOT IN ('pg_catalog','information_schema')
  LOOP
    upd_sql := format('UPDATE %I.%I SET %I = %L WHERE %I = %L', col.table_schema, col.table_name, col.column_name, new_id::text, col.column_name, old_id::text);
    BEGIN
      EXECUTE upd_sql;
      RAISE NOTICE 'Updated %.% column %', col.table_schema, col.table_name, col.column_name;
    EXCEPTION WHEN insufficient_privilege THEN
      RAISE NOTICE 'Skipping update on %.% due to insufficient_privilege', col.table_schema, col.table_name;
    WHEN others THEN
      RAISE NOTICE 'Skipping update on %.% due to error: %', col.table_schema, col.table_name, SQLERRM;
    END;
  END LOOP;

  RAISE NOTICE 'UUID replacement completed.';
END;
$$;

COMMIT;

-- Notes:
-- - This replaces all occurrences of the old UUID value with the new one across accessible tables.
-- - It wraps updates in exception handlers to skip tables where you lack privileges.
-- - Run the `dryrun_update_user_uuid.sql` first to review affected rows.
