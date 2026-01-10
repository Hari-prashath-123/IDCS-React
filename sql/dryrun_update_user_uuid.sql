-- Dry-run: list occurrences of an old UUID before performing update
-- Usage: run in psql or Supabase SQL editor. No changes are made.

DO $$
DECLARE
  target_email TEXT := 'shyamalac.cse@krct.ac.in';
  old_id UUID := '781b4ec1-5986-480e-a02f-2c8abb66a05a';
  new_id UUID := 'ea4997c1-c3b1-4228-89e9-fbce04e68b94';
  col RECORD;
  cnt BIGINT;
BEGIN
  RAISE NOTICE 'Dry-run for email=% old_id=% new_id=%', target_email, old_id, new_id;

  -- Check auth.users contains new_id for that email
  BEGIN
    EXECUTE format('SELECT count(*) FROM %s WHERE id = %L AND email = %L', 'auth.users', new_id::text, target_email) INTO cnt;
    RAISE NOTICE 'auth.users has new_id for the email: %', cnt;
  EXCEPTION WHEN others THEN
    RAISE NOTICE 'Could not check auth.users: %', SQLERRM;
  END;

  -- Count occurrences of old_id in all uuid columns (excluding system schemas)
  FOR col IN
    SELECT table_schema, table_name, column_name
    FROM information_schema.columns
    WHERE udt_name = 'uuid'
      AND table_schema NOT IN ('pg_catalog','information_schema')
  LOOP
    BEGIN
      EXECUTE format('SELECT count(*) FROM %I.%I WHERE %I = %L', col.table_schema, col.table_name, col.column_name, old_id::text) INTO cnt;
      IF cnt > 0 THEN
        RAISE NOTICE 'Found % rows in %.% column %', cnt, col.table_schema, col.table_name, col.column_name;
      END IF;
    EXCEPTION WHEN insufficient_privilege THEN
      RAISE NOTICE 'Skipping %.% due to insufficient_privilege', col.table_schema, col.table_name;
    WHEN others THEN
      RAISE NOTICE 'Skipping %.% due to error: %', col.table_schema, col.table_name, SQLERRM;
    END;
  END LOOP;

  RAISE NOTICE 'Dry-run complete.';
END;
$$;
