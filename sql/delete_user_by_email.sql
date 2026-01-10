-- Safe delete: remove a user and related rows by email
-- WARNING: destructive. Run on a backup or read-replica first.
-- Usage:
-- 1) Inspect the file
-- 2) Run in psql or Supabase SQL editor with a service-role/admin DB user

BEGIN;

DO $$
DECLARE
  target_email TEXT := 'shyamalac.cse@krct.ac.in';
  user_id UUID;
  user_table regclass;
  fk RECORD;
  col RECORD;
  del_sql TEXT;
  rows_deleted BIGINT;
BEGIN
  -- Find user id in common user tables
  BEGIN
    EXECUTE format('SELECT id::uuid FROM %s WHERE email = %L LIMIT 1', 'auth.users', target_email) INTO user_id;
    user_table := 'auth.users'::regclass;
  EXCEPTION WHEN undefined_table OR undefined_column OR insufficient_privilege THEN
    user_id := NULL;
  END;

  IF user_id IS NULL THEN
    BEGIN
      EXECUTE format('SELECT id::uuid FROM %s WHERE email = %L LIMIT 1', 'public.users', target_email) INTO user_id;
      user_table := 'public.users'::regclass;
    EXCEPTION WHEN undefined_table OR undefined_column OR insufficient_privilege THEN
      user_id := NULL;
    END;
  END IF;

  IF user_id IS NULL THEN
    BEGIN
      EXECUTE format('SELECT id::uuid FROM %s WHERE email = %L LIMIT 1', 'users', target_email) INTO user_id;
      user_table := 'users'::regclass;
    EXCEPTION WHEN undefined_table OR undefined_column OR insufficient_privilege THEN
      user_id := NULL;
    END;
  END IF;

  IF user_id IS NULL THEN
    BEGIN
      EXECUTE format('SELECT id::uuid FROM %s WHERE email = %L LIMIT 1', 'profiles', target_email) INTO user_id;
      user_table := 'profiles'::regclass;
    EXCEPTION WHEN undefined_table OR undefined_column OR insufficient_privilege THEN
      user_id := NULL;
    END;
  END IF;

  IF user_id IS NULL THEN
    RAISE EXCEPTION 'User with email % not found in auth.users / public.users / users / profiles', target_email;
  END IF;

  RAISE NOTICE 'Deleting data for email=% id=% from discovered user table %', target_email, user_id, user_table;

  -- 1) Delete from all child tables that have FK constraints referencing the user's table
  FOR fk IN
    SELECT con.conrelid::regclass::text AS table_name,
           att.attname AS column_name
    FROM pg_constraint con
    JOIN LATERAL unnest(con.conkey) WITH ORDINALITY AS cols(attnum, ord) ON true
    JOIN pg_attribute att ON att.attrelid = con.conrelid AND att.attnum = cols.attnum
    WHERE con.contype = 'f'
      AND con.confrelid = user_table
  LOOP
    del_sql := format('DELETE FROM %s WHERE %I = %L', fk.table_name, fk.column_name, user_id::text);
    BEGIN
      EXECUTE del_sql;
      GET DIAGNOSTICS rows_deleted = ROW_COUNT;
      RAISE NOTICE 'Deleted % rows from % (FK %)', rows_deleted, fk.table_name, fk.column_name;
    EXCEPTION WHEN insufficient_privilege THEN
      RAISE NOTICE 'Skipping DELETE on % due to insufficient_privilege', fk.table_name;
    WHEN others THEN
      RAISE NOTICE 'Skipping DELETE on % due to error: %', fk.table_name, SQLERRM;
    END;
  END LOOP;

  -- 2) Optionally delete rows in any table with uuid columns equal to user_id
  -- This may be broad; it deletes rows where any uuid column equals the user id.
  FOR col IN
    SELECT table_schema, table_name, column_name
    FROM information_schema.columns
    WHERE udt_name = 'uuid'
      AND table_schema NOT IN ('pg_catalog','information_schema')
  LOOP
    del_sql := format('DELETE FROM %I.%I WHERE %I = %L', col.table_schema, col.table_name, col.column_name, user_id::text);
    BEGIN
      EXECUTE del_sql;
      GET DIAGNOSTICS rows_deleted = ROW_COUNT;
      IF rows_deleted > 0 THEN
        RAISE NOTICE 'Deleted % rows from %.% (column %)', rows_deleted, col.table_schema, col.table_name, col.column_name;
      END IF;
    EXCEPTION WHEN insufficient_privilege THEN
      RAISE NOTICE 'Skipping DELETE on %.% due to insufficient_privilege', col.table_schema, col.table_name;
    WHEN others THEN
      RAISE NOTICE 'Skipping DELETE on %.% due to error: %', col.table_schema, col.table_name, SQLERRM;
    END;
  END LOOP;

  -- 3) Finally delete the user row from the discovered user table
  del_sql := format('DELETE FROM %s WHERE id = %L', user_table::text, user_id::text);
  BEGIN
    EXECUTE del_sql;
    GET DIAGNOSTICS rows_deleted = ROW_COUNT;
    RAISE NOTICE 'Deleted % user rows from %', rows_deleted, user_table;
  EXCEPTION WHEN insufficient_privilege THEN
    RAISE NOTICE 'Skipping user DELETE on % due to insufficient_privilege', user_table;
  WHEN others THEN
    RAISE NOTICE 'Skipping user DELETE on % due to error: %', user_table, SQLERRM;
  END;

  -- 4) Also attempt to remove any auth.users entry with matching email or id
  BEGIN
    EXECUTE format('DELETE FROM auth.users WHERE id = %L OR email = %L', user_id::text, target_email);
    GET DIAGNOSTICS rows_deleted = ROW_COUNT;
    RAISE NOTICE 'Deleted % rows from auth.users (if accessible)', rows_deleted;
  EXCEPTION WHEN insufficient_privilege THEN
    RAISE NOTICE 'Skipping DELETE on auth.users due to insufficient_privilege';
  WHEN others THEN
    RAISE NOTICE 'Skipping DELETE on auth.users due to error: %', SQLERRM;
  END;

  RAISE NOTICE 'Delete operation complete for email=% id=%', target_email, user_id;
END;
$$;

COMMIT;

-- Notes:
-- - This script deletes rows, not just nulls or updates. Be sure you want to fully remove user data.
-- - The second loop deletes any row whose uuid column equals the user id; this is broad and may remove unrelated rows if your schema stores user ids in non-FK columns.
-- - Run on a backup or run the dry-run `sql/dryrun_update_user_uuid.sql` to inspect occurrences first.
