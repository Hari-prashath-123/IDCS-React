-- Add is_locked column to student_electives to prevent changes after confirmation
ALTER TABLE student_electives
ADD COLUMN IF NOT EXISTS is_locked BOOLEAN DEFAULT false;

-- Add locked_at timestamp
ALTER TABLE student_electives
ADD COLUMN IF NOT EXISTS locked_at TIMESTAMPTZ;

COMMENT ON COLUMN student_electives.is_locked IS 'Prevents student from changing selection after final submission';
COMMENT ON COLUMN student_electives.locked_at IS 'Timestamp when selection was locked';

-- Update the student update policy to prevent changes when locked
DROP POLICY IF EXISTS "Students can update own elective selection" ON student_electives;
CREATE POLICY "Students can update own elective selection"
  ON student_electives FOR UPDATE
  TO authenticated
  USING (student_id = auth.uid() AND is_locked = false)
  WITH CHECK (student_id = auth.uid());
