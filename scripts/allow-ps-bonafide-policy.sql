-- Grant SELECT on bonafide_applications to users whose profile.role = 'ps'
-- Run this in your Supabase SQL editor as a project admin.

-- Ensure RLS is enabled (it likely already is):
-- ALTER TABLE public.bonafide_applications ENABLE ROW LEVEL SECURITY;

-- Create a policy that allows authenticated users to select rows when their profile role is 'ps'
CREATE POLICY "Allow PS select bonafide" ON public.bonafide_applications
  FOR SELECT
  TO public
  USING ((SELECT role FROM public.profiles WHERE id = auth.uid()) = 'ps');

-- Notes:
-- - This policy uses `auth.uid()` provided by Supabase (the current authenticated user's id).
-- - It checks the `profiles` table to verify the user's role is 'ps'.
-- - If you prefer to allow other roles too, adjust the USING clause accordingly.
