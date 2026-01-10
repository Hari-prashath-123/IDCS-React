-- Allow a department admin (the assigned staff) to SELECT their own mapping so the frontend can detect it
-- Run this in Supabase SQL editor (service role) or via migration tooling.

-- This policy permits authenticated users to SELECT the row where they are the assigned staff
-- It also permits admins to SELECT all rows.

DROP POLICY IF EXISTS "dept admin can view own mapping" ON department_admins;

CREATE POLICY "dept admin can view own mapping"
  ON department_admins
  FOR SELECT
  TO authenticated
  USING (
    staff_id = auth.uid() OR
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
  );
