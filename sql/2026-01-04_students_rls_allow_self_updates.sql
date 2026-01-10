-- Enable/adjust RLS policies so authenticated users can manage their own student row
-- Run this in Supabase SQL editor or via psql as a privileged user.

BEGIN;

-- Ensure RLS is enabled on students table (it may already be enabled)
ALTER TABLE IF EXISTS public.students ENABLE ROW LEVEL SECURITY;

-- Allow authenticated users to SELECT their own student record
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies p WHERE p.policyname = 'select_own_student' AND p.tablename = 'students'
  ) THEN
    CREATE POLICY select_own_student ON public.students
      FOR SELECT
      TO authenticated
      USING (auth.uid() = id);
  END IF;
END$$;

-- Allow authenticated users to INSERT a row only if the row's id equals auth.uid()
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies p WHERE p.policyname = 'insert_own_student' AND p.tablename = 'students'
  ) THEN
    CREATE POLICY insert_own_student ON public.students
      FOR INSERT
      TO authenticated
      WITH CHECK (auth.uid() = id);
  END IF;
END$$;

-- Allow authenticated users to UPDATE their own student row
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies p WHERE p.policyname = 'update_own_student' AND p.tablename = 'students'
  ) THEN
    CREATE POLICY update_own_student ON public.students
      FOR UPDATE
      TO authenticated
      USING (auth.uid() = id)
      WITH CHECK (auth.uid() = id);
  END IF;
END$$;

COMMIT;

-- Notes:
-- 1) These policies let a logged-in user (role `authenticated`) SELECT/INSERT/UPDATE
--    only rows where the `students.id` equals `auth.uid()` (the currently-authenticated user's id).
-- 2) If your app stores students with a different key (e.g., students.student_id != profiles.id), adjust the WHERE checks accordingly.
-- 3) If staff or admin users should also be allowed to update student rows, add additional policies granting those roles appropriate access.
