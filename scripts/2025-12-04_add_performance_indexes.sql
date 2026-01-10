-- Performance optimization: Add indexes for frequently queried columns
-- Run this script to significantly improve query performance across the application

-- Applications tables - student_id and status are frequently queried together
CREATE INDEX IF NOT EXISTS idx_od_applications_student_status 
  ON od_applications(student_id, status);

CREATE INDEX IF NOT EXISTS idx_leave_applications_student_status 
  ON leave_applications(student_id, status);

CREATE INDEX IF NOT EXISTS idx_gatepass_applications_student_status 
  ON gatepass_applications(student_id, status);

CREATE INDEX IF NOT EXISTS idx_bonafide_applications_student_status 
  ON bonafide_applications(student_id, status);

-- Add indexes for current_approver_level for faster filtering
CREATE INDEX IF NOT EXISTS idx_od_applications_approver_level 
  ON od_applications(current_approver_level);

CREATE INDEX IF NOT EXISTS idx_leave_applications_approver_level 
  ON leave_applications(current_approver_level);

CREATE INDEX IF NOT EXISTS idx_gatepass_applications_approver_level 
  ON gatepass_applications(current_approver_level);

CREATE INDEX IF NOT EXISTS idx_bonafide_applications_approver_level 
  ON bonafide_applications(current_approver_level);

-- Attendance tables - frequently queried by student_id and date
CREATE INDEX IF NOT EXISTS idx_daily_attendance_student_date 
  ON daily_attendance(student_id, date);

CREATE INDEX IF NOT EXISTS idx_period_attendance_student_date 
  ON period_attendance(student_id, date);

CREATE INDEX IF NOT EXISTS idx_period_attendance_subject_date 
  ON period_attendance(subject_id, date);

-- Students table - frequently queried by year and section
CREATE INDEX IF NOT EXISTS idx_students_year_section 
  ON students(year, section);

CREATE INDEX IF NOT EXISTS idx_students_mentor 
  ON students(mentor_id);

CREATE INDEX IF NOT EXISTS idx_students_advisor 
  ON students(advisor_id);

CREATE INDEX IF NOT EXISTS idx_students_hod 
  ON students(hod_id);

-- Profiles table - department is stored here
CREATE INDEX IF NOT EXISTS idx_profiles_department 
  ON profiles(department);

CREATE INDEX IF NOT EXISTS idx_profiles_role 
  ON profiles(role);

CREATE INDEX IF NOT EXISTS idx_profiles_role_department 
  ON profiles(role, department);

-- Subjects table - frequently queried combinations
CREATE INDEX IF NOT EXISTS idx_subjects_dept_year_section 
  ON subjects(department, year, section);

CREATE INDEX IF NOT EXISTS idx_subjects_staff 
  ON subjects(staff_id);

-- Timetables - frequently queried by department/year/section combination
CREATE INDEX IF NOT EXISTS idx_timetables_dept_year_section 
  ON timetables(department, year, section);

CREATE INDEX IF NOT EXISTS idx_timetables_subject 
  ON timetables(subject_id);

-- Staff timetables - queried by staff_id and day
CREATE INDEX IF NOT EXISTS idx_staff_timetables_staff_day 
  ON staff_timetables(staff_id, day_of_week);

-- Electives - parent subject lookup
CREATE INDEX IF NOT EXISTS idx_electives_parent 
  ON electives(parent_subject_id);

CREATE INDEX IF NOT EXISTS idx_electives_staff 
  ON electives(staff_id);

-- Student electives - frequently joined
CREATE INDEX IF NOT EXISTS idx_student_electives_student 
  ON student_electives(student_id);

CREATE INDEX IF NOT EXISTS idx_student_electives_elective 
  ON student_electives(elective_id);

-- Approvals tables - application_id lookup
CREATE INDEX IF NOT EXISTS idx_od_approvals_application 
  ON od_approvals(application_id);

CREATE INDEX IF NOT EXISTS idx_leave_approvals_application 
  ON leave_approvals(application_id);

CREATE INDEX IF NOT EXISTS idx_gatepass_approvals_application 
  ON gatepass_approvals(application_id);

CREATE INDEX IF NOT EXISTS idx_bonafide_approvals_application 
  ON bonafide_approvals(application_id);

-- Certificates - student lookup
CREATE INDEX IF NOT EXISTS idx_certificates_student 
  ON certificates(student_id);

CREATE INDEX IF NOT EXISTS idx_certificates_od_application 
  ON certificates(od_application_id);

-- Feedback tables
CREATE INDEX IF NOT EXISTS idx_feedback_responses_form 
  ON feedback_responses(form_id);

CREATE INDEX IF NOT EXISTS idx_feedback_responses_student 
  ON feedback_responses(student_id);

-- Department admins lookup
CREATE INDEX IF NOT EXISTS idx_department_admins_staff 
  ON department_admins(staff_id);

-- Notices - date-based queries
CREATE INDEX IF NOT EXISTS idx_notices_created 
  ON notices(created_at DESC);

-- Add composite index for common join patterns in applications with student info
CREATE INDEX IF NOT EXISTS idx_od_applications_student_created 
  ON od_applications(student_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_leave_applications_student_created 
  ON leave_applications(student_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_gatepass_applications_student_created 
  ON gatepass_applications(student_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_bonafide_applications_student_created 
  ON bonafide_applications(student_id, created_at DESC);

-- Analyze tables to update statistics for query planner
ANALYZE od_applications;
ANALYZE leave_applications;
ANALYZE gatepass_applications;
ANALYZE bonafide_applications;
ANALYZE daily_attendance;
ANALYZE period_attendance;
ANALYZE students;
ANALYZE staff;
ANALYZE subjects;
ANALYZE timetables;
ANALYZE staff_timetables;
ANALYZE electives;
ANALYZE student_electives;

COMMENT ON INDEX idx_od_applications_student_status IS 'Improves dashboard stats queries';
COMMENT ON INDEX idx_daily_attendance_student_date IS 'Improves attendance percentage calculations';
COMMENT ON INDEX idx_students_year_section IS 'Improves class roster queries';
COMMENT ON INDEX idx_timetables_dept_year_section IS 'Improves timetable loading';
COMMENT ON INDEX idx_profiles_role_department IS 'Improves staff/student queries by role and department';
