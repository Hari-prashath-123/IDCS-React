-- Drop existing policy if it exists
DROP POLICY IF EXISTS "HOD can update students mentor assignments" ON students;

-- Create policy to allow HOD and admin to update students table (for mentor assignments)
CREATE POLICY "HOD can update students mentor assignments"
  ON students FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid() 
      AND role IN ('hod', 'admin')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid() 
      AND role IN ('hod', 'admin')
    )
  );
