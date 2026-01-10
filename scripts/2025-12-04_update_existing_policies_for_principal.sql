-- Update existing RLS policies to include principal and ps roles
-- This ensures principals have access through existing policies as well

-- ============================================
-- UPDATE STUDENTS TABLE POLICIES
-- ============================================
DROP POLICY IF EXISTS "Students can view own data" ON students;
CREATE POLICY "Students can view own data"
  ON students FOR SELECT
  TO authenticated
  USING (
    id = auth.uid() OR
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('staff', 'ahod', 'hod', 'admin', 'principal', 'ps'))
  );

DROP POLICY IF EXISTS "HOD can update students mentor assignments" ON students;
CREATE POLICY "HOD can update students mentor assignments"
  ON students FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid() 
      AND role IN ('hod', 'admin', 'principal', 'ps')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid() 
      AND role IN ('hod', 'admin', 'principal', 'ps')
    )
  );

-- ============================================
-- UPDATE STAFF TABLE POLICIES
-- ============================================
DROP POLICY IF EXISTS "Staff can view all staff data" ON staff;
CREATE POLICY "Staff can view all staff data"
  ON staff FOR SELECT
  TO authenticated
  USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('staff', 'ahod', 'hod', 'admin', 'principal', 'ps'))
  );

-- ============================================
-- UPDATE NOTICES POLICIES
-- ============================================
DROP POLICY IF EXISTS "HOD and AHOD can create notices" ON notices;
CREATE POLICY "HOD and AHOD can create notices"
  ON notices FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('hod', 'ahod', 'admin', 'principal', 'ps'))
  );

DROP POLICY IF EXISTS "HOD and AHOD can update notices" ON notices;
CREATE POLICY "HOD and AHOD can update notices"
  ON notices FOR UPDATE
  TO authenticated
  USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('hod', 'ahod', 'admin', 'principal', 'ps'))
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('hod', 'ahod', 'admin', 'principal', 'ps'))
  );

COMMENT ON POLICY "Students can view own data" ON students IS 'Students can view own data, staff/hod/admin/principal can view all';
COMMENT ON POLICY "Staff can view all staff data" ON staff IS 'All staff roles including principal can view staff data';
