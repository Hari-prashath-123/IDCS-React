-- Allow PS users to view all bonafide approvals
-- Run this in your Supabase SQL editor as a project admin.

-- Create a policy that allows authenticated users to select bonafide_approvals when their profile role is 'ps'
CREATE POLICY "Allow PS select bonafide approvals" ON public.bonafide_approvals
  FOR SELECT
  TO public
  USING ((SELECT role FROM public.profiles WHERE id = auth.uid()) = 'ps');

-- Notes:
-- - This policy allows PS users to view all bonafide approval records
-- - It complements the existing policy that allows students to view their own approvals
-- - PS users need to see the complete approval history for all applications they can approve