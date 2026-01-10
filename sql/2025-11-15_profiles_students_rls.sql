-- Enable RLS and add policies to allow authenticated users to manage their own profile and student row
-- Run in Supabase SQL editor or psql as a superuser

-- Profiles table
ALTER TABLE IF EXISTS public.profiles ENABLE ROW LEVEL SECURITY;

-- Allow anyone to SELECT profiles (optional, adjust as needed)
DROP POLICY IF EXISTS "Allow select profiles" ON public.profiles;
CREATE POLICY "Allow select profiles" ON public.profiles
  FOR SELECT USING (true);

-- Allow users to insert a profile row only for their own id
DROP POLICY IF EXISTS "Allow insert own profile" ON public.profiles;
CREATE POLICY "Allow insert own profile" ON public.profiles
  FOR INSERT WITH CHECK (auth.uid() = id);

-- Allow users to update their own profile row
DROP POLICY IF EXISTS "Allow update own profile" ON public.profiles;
CREATE POLICY "Allow update own profile" ON public.profiles
  FOR UPDATE USING (auth.uid() = id) WITH CHECK (auth.uid() = id);

-- (Optional) allow users to delete their own profile row
DROP POLICY IF EXISTS "Allow delete own profile" ON public.profiles;
CREATE POLICY "Allow delete own profile" ON public.profiles
  FOR DELETE USING (auth.uid() = id);

-- Students table
ALTER TABLE IF EXISTS public.students ENABLE ROW LEVEL SECURITY;

-- Allow select on students table (adjust as needed)
DROP POLICY IF EXISTS "Allow select students" ON public.students;
CREATE POLICY "Allow select students" ON public.students
  FOR SELECT USING (true);

-- Allow users to insert a students row only for their own id
DROP POLICY IF EXISTS "Allow insert own student" ON public.students;
CREATE POLICY "Allow insert own student" ON public.students
  FOR INSERT WITH CHECK (auth.uid() = id);

-- Allow users to update their own student row
DROP POLICY IF EXISTS "Allow update own student" ON public.students;
CREATE POLICY "Allow update own student" ON public.students
  FOR UPDATE USING (auth.uid() = id) WITH CHECK (auth.uid() = id);

-- (Optional) allow users to delete their own student row
DROP POLICY IF EXISTS "Allow delete own student" ON public.students;
CREATE POLICY "Allow delete own student" ON public.students
  FOR DELETE USING (auth.uid() = id);

-- Notes:
-- 1) These policies assume `profiles.id` and `students.id` match `auth.uid()` (the Supabase user id).
-- 2) If your students table uses a different primary key or mapping, adapt the policies accordingly.
-- 3) Test carefully in Supabase SQL editor. If you prefer to perform writes server-side, use the service_role key on a secure endpoint instead of enabling broad client-side writes.
