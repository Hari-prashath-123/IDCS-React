-- Fix electives unique constraint to allow same course code across departments
-- This is needed for IQAC HOD to create electives for multiple departments

-- Drop the old constraint that only considers parent_subject_id and course_code
DROP INDEX IF EXISTS idx_electives_parent_course;

-- Create a new unique constraint that includes department
-- This allows same elective code to exist in different departments
CREATE UNIQUE INDEX IF NOT EXISTS idx_electives_parent_course_dept 
ON electives(parent_subject_id, course_code, department);

-- Add comment for documentation
COMMENT ON INDEX idx_electives_parent_course_dept IS 'Ensures unique elective codes per parent subject per department. Allows IQAC to create same elective across multiple departments.';
