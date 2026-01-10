-- Allow students to insert their own elective selections (one-time only)
DROP POLICY IF EXISTS "Students can insert own elective selection" ON student_electives;
CREATE POLICY "Students can insert own elective selection"
  ON student_electives FOR INSERT
  TO authenticated
  WITH CHECK (student_id = auth.uid());

-- Allow students to update their own elective selections (for changing choice before lock)
DROP POLICY IF EXISTS "Students can update own elective selection" ON student_electives;
CREATE POLICY "Students can update own elective selection"
  ON student_electives FOR UPDATE
  TO authenticated
  USING (student_id = auth.uid())
  WITH CHECK (student_id = auth.uid());
