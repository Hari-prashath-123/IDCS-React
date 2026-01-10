-- Grant staff (including AHOD/HOD) access to applications and approvals
-- Run in Supabase SQL editor as a privileged user.

-- OD Applications: allow authenticated students, approvers, and any staff to view
DROP POLICY IF EXISTS "Staff can view OD applications" ON od_applications;
CREATE POLICY "Staff can view OD applications" ON od_applications FOR SELECT
  TO authenticated
  USING (
    student_id = auth.uid()
    OR EXISTS (SELECT 1 FROM staff WHERE id = auth.uid())
    OR EXISTS (
      SELECT 1 FROM students s
      WHERE s.id = od_applications.student_id
        AND (
          s.advisor_id = auth.uid()
          OR s.hod_id = auth.uid()
          OR s.ahod_id = auth.uid()
          OR s.mentor_id = auth.uid()
        )
    )
  );

-- Leave Applications
DROP POLICY IF EXISTS "Staff can view leave applications" ON leave_applications;
CREATE POLICY "Staff can view leave applications" ON leave_applications FOR SELECT
  TO authenticated
  USING (
    student_id = auth.uid()
    OR EXISTS (SELECT 1 FROM staff WHERE id = auth.uid())
    OR EXISTS (
      SELECT 1 FROM students s
      WHERE s.id = leave_applications.student_id
        AND (
          s.advisor_id = auth.uid()
          OR s.hod_id = auth.uid()
          OR s.ahod_id = auth.uid()
          OR s.mentor_id = auth.uid()
        )
    )
  );

-- Gatepass Applications
DROP POLICY IF EXISTS "Staff can view gatepass applications" ON gatepass_applications;
CREATE POLICY "Staff can view gatepass applications" ON gatepass_applications FOR SELECT
  TO authenticated
  USING (
    student_id = auth.uid()
    OR EXISTS (SELECT 1 FROM staff WHERE id = auth.uid())
    OR EXISTS (
      SELECT 1 FROM students s
      WHERE s.id = gatepass_applications.student_id
        AND (
          s.advisor_id = auth.uid()
          OR s.hod_id = auth.uid()
          OR s.ahod_id = auth.uid()
          OR s.mentor_id = auth.uid()
        )
    )
  );

-- Bonafide Applications
DROP POLICY IF EXISTS "Staff can view bonafide applications" ON bonafide_applications;
CREATE POLICY "Staff can view bonafide applications" ON bonafide_applications FOR SELECT
  TO authenticated
  USING (
    student_id = auth.uid()
    OR EXISTS (SELECT 1 FROM staff WHERE id = auth.uid())
    OR EXISTS (
      SELECT 1 FROM students s
      WHERE s.id = bonafide_applications.student_id
        AND (
          s.advisor_id = auth.uid()
          OR s.hod_id = auth.uid()
          OR s.ahod_id = auth.uid()
          OR s.mentor_id = auth.uid()
        )
    )
  );

-- Approvals: ensure staff can view approvals for applications they can access
-- OD approvals
DROP POLICY IF EXISTS "Staff can view all od approvals for applications they can access" ON od_approvals;
CREATE POLICY "Staff can view all od approvals for applications they can access"
  ON od_approvals FOR SELECT
  TO authenticated
  USING (
    application_id IN (SELECT id FROM od_applications WHERE student_id = auth.uid())
    OR approver_id = auth.uid()
    OR EXISTS (SELECT 1 FROM staff WHERE id = auth.uid())
    OR application_id IN (
      SELECT oa.id FROM od_applications oa
      JOIN students s ON s.id = oa.student_id
      WHERE s.advisor_id = auth.uid()
         OR s.hod_id = auth.uid()
         OR s.ahod_id = auth.uid()
         OR s.mentor_id = auth.uid()
    )
  );

-- Leave approvals
DROP POLICY IF EXISTS "Staff can view all leave approvals for applications they can access" ON leave_approvals;
CREATE POLICY "Staff can view all leave approvals for applications they can access"
  ON leave_approvals FOR SELECT
  TO authenticated
  USING (
    application_id IN (SELECT id FROM leave_applications WHERE student_id = auth.uid())
    OR approver_id = auth.uid()
    OR EXISTS (SELECT 1 FROM staff WHERE id = auth.uid())
    OR application_id IN (
      SELECT la.id FROM leave_applications la
      JOIN students s ON s.id = la.student_id
      WHERE s.advisor_id = auth.uid()
         OR s.hod_id = auth.uid()
         OR s.ahod_id = auth.uid()
         OR s.mentor_id = auth.uid()
    )
  );

-- Gatepass approvals
DROP POLICY IF EXISTS "Staff can view gatepass approvals for applications they can access" ON gatepass_approvals;
CREATE POLICY "Staff can view gatepass approvals for applications they can access"
  ON gatepass_approvals FOR SELECT
  TO authenticated
  USING (
    application_id IN (SELECT id FROM gatepass_applications WHERE student_id = auth.uid())
    OR approver_id = auth.uid()
    OR EXISTS (SELECT 1 FROM staff WHERE id = auth.uid())
    OR application_id IN (
      SELECT ga.id FROM gatepass_applications ga
      JOIN students s ON s.id = ga.student_id
      WHERE s.advisor_id = auth.uid()
         OR s.hod_id = auth.uid()
         OR s.ahod_id = auth.uid()
         OR s.mentor_id = auth.uid()
    )
  );

-- Bonafide approvals
DROP POLICY IF EXISTS "Staff can view all bonafide approvals for applications they can access" ON bonafide_approvals;
CREATE POLICY "Staff can view all bonafide approvals for applications they can access"
  ON bonafide_approvals FOR SELECT
  TO authenticated
  USING (
    application_id IN (SELECT id FROM bonafide_applications WHERE student_id = auth.uid())
    OR approver_id = auth.uid()
    OR EXISTS (SELECT 1 FROM staff WHERE id = auth.uid())
    OR application_id IN (
      SELECT ba.id FROM bonafide_applications ba
      JOIN students s ON s.id = ba.student_id
      WHERE s.advisor_id = auth.uid()
         OR s.hod_id = auth.uid()
         OR s.ahod_id = auth.uid()
         OR s.mentor_id = auth.uid()
    )
  );

-- End of script
