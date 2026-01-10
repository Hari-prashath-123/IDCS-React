-- Add columns to track admin-initiated changes on student_electives
ALTER TABLE student_electives
  ADD COLUMN IF NOT EXISTS admin_changed BOOLEAN DEFAULT false;

ALTER TABLE student_electives
  ADD COLUMN IF NOT EXISTS admin_changed_at timestamptz NULL;

ALTER TABLE student_electives
  ADD COLUMN IF NOT EXISTS admin_changed_by uuid NULL REFERENCES profiles(id);

COMMENT ON COLUMN student_electives.admin_changed IS 'True when an admin (IQAC HOD) moved the student to a different elective';
COMMENT ON COLUMN student_electives.admin_changed_at IS 'When an admin moved the student elective';
COMMENT ON COLUMN student_electives.admin_changed_by IS 'Admin profile id that changed the student elective';
