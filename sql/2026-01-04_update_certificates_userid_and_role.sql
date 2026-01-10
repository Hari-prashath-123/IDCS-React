-- Migration: change certificates.student_id -> certificates.user_id, add role column,
-- and update RLS policies to use user_id.
-- Run this in Supabase SQL editor as a project owner (service role) or include in migration pipeline.

DO $$
DECLARE
  rec RECORD;
BEGIN
  -- Rename column student_id to user_id if exists
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'certificates'
      AND column_name = 'student_id'
  ) THEN
    -- Drop foreign key constraint referencing students if present
    PERFORM (
      SELECT 1 FROM pg_constraint c
      JOIN pg_class t ON c.conrelid = t.oid
      WHERE t.relname = 'certificates' AND c.contype = 'f'
      LIMIT 1
    );
    -- Attempt to rename column
    EXECUTE 'ALTER TABLE public.certificates RENAME COLUMN student_id TO user_id';
  END IF;

  -- Add user_id column if neither student_id nor user_id existed
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'certificates'
      AND column_name = 'user_id'
  ) THEN
    EXECUTE 'ALTER TABLE public.certificates ADD COLUMN user_id uuid';
  END IF;

  -- Add role column if it does not exist
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'certificates'
      AND column_name = 'role'
  ) THEN
    EXECUTE 'ALTER TABLE public.certificates ADD COLUMN role text';
  END IF;

  -- If there is an existing FK constraint on user_id referencing students, drop it and add FK to profiles.id
  -- Find constraint name if any
  PERFORM
    (SELECT 1);
  -- Remove FK constraints referencing students (if any) on certificates.user_id
  FOR rec IN
    SELECT con.conname AS constraint_name
    FROM pg_constraint con
    JOIN pg_class rel ON con.conrelid = rel.oid
    JOIN pg_attribute attr ON attr.attrelid = rel.oid
    WHERE rel.relname = 'certificates' AND con.contype = 'f'
      AND con.confrelid = (SELECT oid FROM pg_class WHERE relname = 'students')
  LOOP
    BEGIN
      EXECUTE format('ALTER TABLE public.certificates DROP CONSTRAINT %I', rec.constraint_name);
    EXCEPTION WHEN OTHERS THEN
      RAISE NOTICE 'Could not drop constraint %: %', rec.constraint_name, SQLERRM;
    END;
  END LOOP;

  -- Add foreign key to profiles.id if not already present
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint con
    JOIN pg_class rel ON con.conrelid = rel.oid
    WHERE rel.relname = 'certificates' AND con.contype = 'f'
      AND con.confrelid = (SELECT oid FROM pg_class WHERE relname = 'profiles')
  ) THEN
    -- Only add FK if user_id is not null in existing rows or if desired; adding constraint may fail if values not matching profiles.
    BEGIN
      EXECUTE 'ALTER TABLE public.certificates ADD CONSTRAINT fk_certificates_user FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE SET NULL';
    EXCEPTION WHEN others THEN
      -- Ignore if add constraint fails (e.g., existing user_id values don't match profiles)
      RAISE NOTICE 'Could not add FK fk_certificates_user: %', SQLERRM;
    END;
  END IF;

  -- Create index on user_id for performance
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes WHERE schemaname = 'public' AND tablename = 'certificates' AND indexname = 'idx_certificates_user_id'
  ) THEN
    EXECUTE 'CREATE INDEX idx_certificates_user_id ON public.certificates(user_id)';
  END IF;
END$$;

-- Update RLS policies: remove old student-based policies and create user-based ones
-- Drop existing policies that reference student_id (aggressively) and recreate them for user_id.

-- DROP policies if they exist
DROP POLICY IF EXISTS "Students can delete own certificates" ON public.certificates;
DROP POLICY IF EXISTS "Students can insert certificates" ON public.certificates;
DROP POLICY IF EXISTS "Students can select certificates" ON public.certificates;
DROP POLICY IF EXISTS "Users can manage own certificates" ON public.certificates;

-- Backfill existing rows: set role from profiles if available
UPDATE public.certificates c
SET role = p.role
FROM public.profiles p
WHERE c.user_id = p.id
  AND (c.role IS NULL OR c.role = '');

-- Create new policies for authenticated users to manage their own certificates.
-- Note: Postgres does not support `CREATE POLICY IF NOT EXISTS` in many versions,
-- so we create policies directly (we already dropped old ones above).
CREATE POLICY "Users can select own certificates"
  ON public.certificates FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "Users can insert own certificates"
  ON public.certificates FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can update own certificates"
  ON public.certificates FOR UPDATE
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can delete own certificates"
  ON public.certificates FOR DELETE
  TO authenticated
  USING (user_id = auth.uid());

-- Optional: grant full access to an admin role if you have one defined in JWT claims.
-- Example (uncomment and adjust if you have a 'role' claim and admin value):
-- CREATE POLICY "Admins can manage all certificates"
--   ON public.certificates FOR ALL
--   TO authenticated
--   USING (current_setting('jwt.claims.role', true) = 'admin')
--   WITH CHECK (current_setting('jwt.claims.role', true) = 'admin');

-- Add trigger to auto-populate `role` from `profiles` when missing.
CREATE OR REPLACE FUNCTION public.set_certificate_role_from_profiles()
RETURNS trigger AS $$
BEGIN
  IF NEW.role IS NULL OR NEW.role = '' THEN
    SELECT p.role INTO NEW.role FROM public.profiles p WHERE p.id = NEW.user_id LIMIT 1;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_set_cert_role ON public.certificates;
CREATE TRIGGER trg_set_cert_role
  BEFORE INSERT OR UPDATE ON public.certificates
  FOR EACH ROW
  EXECUTE FUNCTION public.set_certificate_role_from_profiles();

-- Notes:
-- 1) Verify that `profiles.id` values match existing `user_id` values after renaming; if not, you'll need a data-migration mapping students -> profiles.
-- 2) Test policies in Supabase SQL editor and adjust `Admins` policy to your admin role logic.
-- 3) The application code should be updated to insert/select using `user_id` and set the `role` column appropriately (e.g., 'student','staff','hod','ahod').
