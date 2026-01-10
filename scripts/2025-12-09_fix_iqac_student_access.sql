-- Check existing RLS policies on students and student_electives tables
SELECT 
  schemaname,
  tablename,
  policyname,
  permissive,
  roles,
  cmd,
  qual
FROM pg_policies
WHERE tablename IN ('students', 'student_electives')
ORDER BY tablename, policyname;

-- Check if RLS is enabled
SELECT 
  schemaname,
  tablename,
  rowsecurity
FROM pg_tables
WHERE tablename IN ('students', 'student_electives');

-- Add policy for IQAC HOD to read students table
DROP POLICY IF EXISTS "IQAC HOD can view all students" ON students;
CREATE POLICY "IQAC HOD can view all students"
ON students
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM profiles
    WHERE profiles.id = auth.uid()
    AND profiles.role = 'iqac_hod'
  )
);

-- Add policy for IQAC HOD to read student_electives table
DROP POLICY IF EXISTS "IQAC HOD can view all student electives" ON student_electives;
CREATE POLICY "IQAC HOD can view all student electives"
ON student_electives
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM profiles
    WHERE profiles.id = auth.uid()
    AND profiles.role = 'iqac_hod'
  )
);

-- Verify the policies were created
SELECT 
  tablename,
  policyname,
  cmd
FROM pg_policies
WHERE tablename IN ('students', 'student_electives')
AND policyname LIKE '%IQAC HOD%';
