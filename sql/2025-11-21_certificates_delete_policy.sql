-- Add delete policy for certificates table so students can delete their own rows
-- Run this in the Supabase SQL editor as a project owner (or include in your migration pipeline)

-- Remove existing policy (safe to run multiple times)
DROP POLICY IF EXISTS "Students can delete own certificates" ON public.certificates;

-- Create policy that allows the student who owns a certificate to delete it
CREATE POLICY "Students can delete own certificates"
  ON public.certificates FOR DELETE
  TO authenticated
  USING (student_id = auth.uid());

-- Notes:
-- - This must be run by a role that can modify policies (project owner or service role).
-- - After this policy is applied, authenticated users can delete rows where `student_id` = their auth.uid().
