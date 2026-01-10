-- Add principal and ps roles full access to all tables
-- This allows principals to view and manage all data across the system

-- ============================================
-- CREATE HELPER FUNCTION TO CHECK PRINCIPAL ROLE
-- This avoids infinite recursion in policies
-- SECURITY DEFINER makes it run with elevated privileges, bypassing RLS
-- Includes IQAC HOD users who also get full access
-- ============================================
CREATE OR REPLACE FUNCTION is_principal_or_ps()
RETURNS BOOLEAN AS $$
DECLARE
  user_role text;
  user_dept text;
BEGIN
  SELECT role, department INTO user_role, user_dept FROM profiles WHERE id = auth.uid();
  -- Allow principal, ps, or HOD from IQAC department
  RETURN user_role IN ('principal', 'ps') OR (user_role = 'hod' AND user_dept = 'IQAC');
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

-- Grant execute permission to authenticated users
GRANT EXECUTE ON FUNCTION is_principal_or_ps() TO authenticated;

-- ============================================
-- PROFILES TABLE - Use the helper function
-- ============================================
DROP POLICY IF EXISTS "Principals can view all profiles" ON profiles;
CREATE POLICY "Principals can view all profiles"
  ON profiles FOR SELECT
  TO authenticated
  USING (is_principal_or_ps());

DROP POLICY IF EXISTS "Principals can insert profiles" ON profiles;
CREATE POLICY "Principals can insert profiles"
  ON profiles FOR INSERT
  TO authenticated
  WITH CHECK (is_principal_or_ps());

DROP POLICY IF EXISTS "Principals can update profiles" ON profiles;
CREATE POLICY "Principals can update profiles"
  ON profiles FOR UPDATE
  TO authenticated
  USING (is_principal_or_ps())
  WITH CHECK (is_principal_or_ps());

DROP POLICY IF EXISTS "Principals can delete profiles" ON profiles;
CREATE POLICY "Principals can delete profiles"
  ON profiles FOR DELETE
  TO authenticated
  USING (is_principal_or_ps());

-- ============================================
-- STUDENTS TABLE
-- ============================================
DROP POLICY IF EXISTS "Principals can view all students" ON students;
CREATE POLICY "Principals can view all students"
  ON students FOR SELECT
  TO authenticated
  USING (is_principal_or_ps());

DROP POLICY IF EXISTS "Principals can insert students" ON students;
CREATE POLICY "Principals can insert students"
  ON students FOR INSERT
  TO authenticated
  WITH CHECK (is_principal_or_ps());

DROP POLICY IF EXISTS "Principals can update students" ON students;
CREATE POLICY "Principals can update students"
  ON students FOR UPDATE
  TO authenticated
  USING (is_principal_or_ps())
  WITH CHECK (is_principal_or_ps());

DROP POLICY IF EXISTS "Principals can delete students" ON students;
CREATE POLICY "Principals can delete students"
  ON students FOR DELETE
  TO authenticated
  USING (is_principal_or_ps());

-- ============================================
-- STAFF TABLE
-- ============================================
DROP POLICY IF EXISTS "Principals can view all staff" ON staff;
CREATE POLICY "Principals can view all staff"
  ON staff FOR SELECT
  TO authenticated
  USING (is_principal_or_ps());

DROP POLICY IF EXISTS "Principals can insert staff" ON staff;
CREATE POLICY "Principals can insert staff"
  ON staff FOR INSERT
  TO authenticated
  WITH CHECK (is_principal_or_ps());

DROP POLICY IF EXISTS "Principals can update staff" ON staff;
CREATE POLICY "Principals can update staff"
  ON staff FOR UPDATE
  TO authenticated
  USING (is_principal_or_ps())
  WITH CHECK (is_principal_or_ps());

DROP POLICY IF EXISTS "Principals can delete staff" ON staff;
CREATE POLICY "Principals can delete staff"
  ON staff FOR DELETE
  TO authenticated
  USING (is_principal_or_ps());

-- ============================================
-- SUBJECTS TABLE
-- ============================================
DROP POLICY IF EXISTS "Principals can manage subjects" ON subjects;
CREATE POLICY "Principals can manage subjects"
  ON subjects FOR ALL
  TO authenticated
  USING (is_principal_or_ps())
  WITH CHECK (is_principal_or_ps());

-- ============================================
-- TIMETABLES TABLE
-- ============================================
DROP POLICY IF EXISTS "Principals can manage timetables" ON timetables;
CREATE POLICY "Principals can manage timetables"
  ON timetables FOR ALL
  TO authenticated
  USING (is_principal_or_ps())
  WITH CHECK (is_principal_or_ps());

-- ============================================
-- STAFF TIMETABLES TABLE
-- ============================================
DROP POLICY IF EXISTS "Principals can manage staff timetables" ON staff_timetables;
CREATE POLICY "Principals can manage staff timetables"
  ON staff_timetables FOR ALL
  TO authenticated
  USING (is_principal_or_ps())
  WITH CHECK (is_principal_or_ps());

-- ============================================
-- ELECTIVES TABLE
-- ============================================
DROP POLICY IF EXISTS "Principals can manage electives" ON electives;
CREATE POLICY "Principals can manage electives"
  ON electives FOR ALL
  TO authenticated
  USING (is_principal_or_ps())
  WITH CHECK (is_principal_or_ps());

-- ============================================
-- STUDENT ELECTIVES TABLE
-- ============================================
DROP POLICY IF EXISTS "Principals can manage student electives" ON student_electives;
CREATE POLICY "Principals can manage student electives"
  ON student_electives FOR ALL
  TO authenticated
  USING (is_principal_or_ps())
  WITH CHECK (is_principal_or_ps());

-- ============================================
-- APPLICATIONS TABLES (OD, LEAVE, GATEPASS, BONAFIDE)
-- ============================================
DROP POLICY IF EXISTS "Principals can view all od applications" ON od_applications;
CREATE POLICY "Principals can view all od applications"
  ON od_applications FOR SELECT
  TO authenticated
  USING (is_principal_or_ps());

DROP POLICY IF EXISTS "Principals can view all leave applications" ON leave_applications;
CREATE POLICY "Principals can view all leave applications"
  ON leave_applications FOR SELECT
  TO authenticated
  USING (is_principal_or_ps());

DROP POLICY IF EXISTS "Principals can view all gatepass applications" ON gatepass_applications;
CREATE POLICY "Principals can view all gatepass applications"
  ON gatepass_applications FOR SELECT
  TO authenticated
  USING (is_principal_or_ps());

DROP POLICY IF EXISTS "Principals can view all bonafide applications" ON bonafide_applications;
CREATE POLICY "Principals can view all bonafide applications"
  ON bonafide_applications FOR SELECT
  TO authenticated
  USING (is_principal_or_ps());

-- ============================================
-- APPROVALS TABLES
-- ============================================
DROP POLICY IF EXISTS "Principals can view all od approvals" ON od_approvals;
CREATE POLICY "Principals can view all od approvals"
  ON od_approvals FOR SELECT
  TO authenticated
  USING (is_principal_or_ps());

DROP POLICY IF EXISTS "Principals can view all leave approvals" ON leave_approvals;
CREATE POLICY "Principals can view all leave approvals"
  ON leave_approvals FOR SELECT
  TO authenticated
  USING (is_principal_or_ps());

DROP POLICY IF EXISTS "Principals can view all gatepass approvals" ON gatepass_approvals;
CREATE POLICY "Principals can view all gatepass approvals"
  ON gatepass_approvals FOR SELECT
  TO authenticated
  USING (is_principal_or_ps());

DROP POLICY IF EXISTS "Principals can view all bonafide approvals" ON bonafide_approvals;
CREATE POLICY "Principals can view all bonafide approvals"
  ON bonafide_approvals FOR SELECT
  TO authenticated
  USING (is_principal_or_ps());

-- ============================================
-- ATTENDANCE TABLES
-- ============================================
DROP POLICY IF EXISTS "Principals can view all daily attendance" ON daily_attendance;
CREATE POLICY "Principals can view all daily attendance"
  ON daily_attendance FOR SELECT
  TO authenticated
  USING (is_principal_or_ps());

DROP POLICY IF EXISTS "Principals can manage daily attendance" ON daily_attendance;
CREATE POLICY "Principals can manage daily attendance"
  ON daily_attendance FOR ALL
  TO authenticated
  USING (is_principal_or_ps())
  WITH CHECK (is_principal_or_ps());

DROP POLICY IF EXISTS "Principals can view all period attendance" ON period_attendance;
CREATE POLICY "Principals can view all period attendance"
  ON period_attendance FOR SELECT
  TO authenticated
  USING (is_principal_or_ps());

DROP POLICY IF EXISTS "Principals can manage period attendance" ON period_attendance;
CREATE POLICY "Principals can manage period attendance"
  ON period_attendance FOR ALL
  TO authenticated
  USING (is_principal_or_ps())
  WITH CHECK (is_principal_or_ps());

-- ============================================
-- CERTIFICATES TABLE
-- ============================================
DROP POLICY IF EXISTS "Principals can view all certificates" ON certificates;
CREATE POLICY "Principals can view all certificates"
  ON certificates FOR SELECT
  TO authenticated
  USING (is_principal_or_ps());

DROP POLICY IF EXISTS "Principals can manage certificates" ON certificates;
CREATE POLICY "Principals can manage certificates"
  ON certificates FOR ALL
  TO authenticated
  USING (is_principal_or_ps())
  WITH CHECK (is_principal_or_ps());

-- ============================================
-- NOTICES TABLE
-- ============================================
DROP POLICY IF EXISTS "Principals can manage notices" ON notices;
CREATE POLICY "Principals can manage notices"
  ON notices FOR ALL
  TO authenticated
  USING (is_principal_or_ps())
  WITH CHECK (is_principal_or_ps());

-- ============================================
-- FEEDBACK TABLES
-- ============================================
DROP POLICY IF EXISTS "Principals can manage feedback forms" ON feedback_forms;
CREATE POLICY "Principals can manage feedback forms"
  ON feedback_forms FOR ALL
  TO authenticated
  USING (is_principal_or_ps())
  WITH CHECK (is_principal_or_ps());

DROP POLICY IF EXISTS "Principals can view all feedback responses" ON feedback_responses;
CREATE POLICY "Principals can view all feedback responses"
  ON feedback_responses FOR SELECT
  TO authenticated
  USING (is_principal_or_ps());

-- ============================================
-- YEARS AND SECTIONS TABLES
-- ============================================
DROP POLICY IF EXISTS "Principals can manage years" ON years;
CREATE POLICY "Principals can manage years"
  ON years FOR ALL
  TO authenticated
  USING (is_principal_or_ps())
  WITH CHECK (is_principal_or_ps());

DROP POLICY IF EXISTS "Principals can manage sections" ON sections;
CREATE POLICY "Principals can manage sections"
  ON sections FOR ALL
  TO authenticated
  USING (is_principal_or_ps())
  WITH CHECK (is_principal_or_ps());

-- ============================================
-- DEPARTMENT ADMINS TABLE
-- ============================================
DROP POLICY IF EXISTS "Principals can view department admins" ON department_admins;
CREATE POLICY "Principals can view department admins"
  ON department_admins FOR SELECT
  TO authenticated
  USING (is_principal_or_ps());

DROP POLICY IF EXISTS "Principals can manage department admins" ON department_admins;
CREATE POLICY "Principals can manage department admins"
  ON department_admins FOR ALL
  TO authenticated
  USING (is_principal_or_ps())
  WITH CHECK (is_principal_or_ps());

COMMENT ON POLICY "Principals can view all profiles" ON profiles IS 'Allows principal and ps roles to view all user profiles';
COMMENT ON POLICY "Principals can view all students" ON students IS 'Allows principal and ps roles to view all student records';
COMMENT ON POLICY "Principals can view all staff" ON staff IS 'Allows principal and ps roles to view all staff records';
COMMENT ON POLICY "Principals can manage subjects" ON subjects IS 'Allows principal and ps roles full access to subjects';
COMMENT ON POLICY "Principals can view all daily attendance" ON daily_attendance IS 'Allows principal and ps roles to view all attendance records';
