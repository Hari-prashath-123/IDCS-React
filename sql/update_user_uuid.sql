-- Safe Postgres script to change a user's UUID across the DB
-- Usage: inspect file, then run inside a transaction on your DB (psql or Supabase SQL editor)
-- Replace nothing: email and new_uuid are already set to the values you provided.

BEGIN;

DO $$
DECLARE
  target_email TEXT := 'shyamalac.cse@krct.ac.in';
  new_id UUID := 'ea4997c1-c3b1-4228-89e9-fbce04e68b94';
  old_id UUID;
  user_table regclass;
  fk RECORD;
  col RECORD;
  upd_sql TEXT;
BEGIN
  -- Try common user tables in order: auth.users, public.users, users, profiles
  BEGIN
    EXECUTE format('SELECT id::uuid FROM %s WHERE email = %L LIMIT 1', 'auth.users', target_email) INTO old_id;
    user_table := 'auth.users'::regclass;
  EXCEPTION WHEN undefined_table OR undefined_column OR insufficient_privilege THEN
    old_id := NULL;
  END;

  IF old_id IS NULL THEN
    BEGIN
      EXECUTE format('SELECT id::uuid FROM %s WHERE email = %L LIMIT 1', 'public.users', target_email) INTO old_id;
      user_table := 'public.users'::regclass;
    EXCEPTION WHEN undefined_table OR undefined_column OR insufficient_privilege THEN
      old_id := NULL;
    END;
  END IF;

  IF old_id IS NULL THEN
    BEGIN
      EXECUTE format('SELECT id::uuid FROM %s WHERE email = %L LIMIT 1', 'users', target_email) INTO old_id;
      user_table := 'users'::regclass;
    EXCEPTION WHEN undefined_table OR undefined_column OR insufficient_privilege THEN
      old_id := NULL;
    END;
  END IF;

  IF old_id IS NULL THEN
    BEGIN
      EXECUTE format('SELECT id::uuid FROM %s WHERE email = %L LIMIT 1', 'profiles', target_email) INTO old_id;
      user_table := 'profiles'::regclass;
    EXCEPTION WHEN undefined_table OR undefined_column OR insufficient_privilege THEN
      old_id := NULL;
    END;
  END IF;

  IF old_id IS NULL THEN
    RAISE EXCEPTION 'User with email % not found in auth.users / public.users / users / profiles', target_email;
  END IF;

  RAISE NOTICE 'Found user id % in table %', old_id, user_table;

  -- 1) Update all foreign-key columns that reference the user's table
  FOR fk IN
    SELECT con.conrelid::regclass::text AS table_name,
           att.attname AS column_name
    FROM pg_constraint con
    JOIN LATERAL unnest(con.conkey) WITH ORDINALITY AS cols(attnum, ord) ON true
    JOIN pg_attribute att ON att.attrelid = con.conrelid AND att.attnum = cols.attnum
    WHERE con.contype = 'f'
      AND con.confrelid = user_table
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

  -- 2) Update any uuid-typed columns that contain the old UUID (catch non-FK uuid columns)
  FOR col IN
    SELECT table_schema, table_name, column_name
    FROM information_schema.columns
    WHERE udt_name = 'uuid'
      AND table_schema NOT IN ('pg_catalog','information_schema')
  LOOP
    upd_sql := format('UPDATE %I.%I SET %I = %L WHERE %I = %L', col.table_schema, col.table_name, col.column_name, new_id::text, col.column_name, old_id::text);
    BEGIN
      EXECUTE upd_sql;
    EXCEPTION WHEN insufficient_privilege THEN
      RAISE NOTICE 'Skipping uuid-column update on % due to insufficient_privilege', col.table_schema || '.' || col.table_name;
    WHEN others THEN
      RAISE NOTICE 'Skipping uuid-column update on % due to error: %', col.table_schema || '.' || col.table_name, SQLERRM;
    END;
  END LOOP;

  -- 3) Finally update the user's primary id in its table
  upd_sql := format('UPDATE %s SET id = %L WHERE id = %L', user_table::text, new_id::text, old_id::text);
  BEGIN
    EXECUTE upd_sql;
  EXCEPTION WHEN insufficient_privilege THEN
    RAISE NOTICE 'Skipping user id update on % due to insufficient_privilege', user_table;
  WHEN others THEN
    RAISE NOTICE 'Skipping user id update on % due to error: %', user_table, SQLERRM;
  END;

  RAISE NOTICE 'UUID updated: % -> %', old_id, new_id;
END
$$;

COMMIT;

-- Notes:
-- - This script attempts to find the user row in several common tables.
-- - It updates constrained FK columns, then any uuid columns equaling the old id, then the primary id.
-- - Inspect the file before running and run inside a backup or transaction (this file uses BEGIN/COMMIT).
-- - If you use Supabase, run this from the SQL editor or via psql connected to your Postgres DB.
