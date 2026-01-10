-- Migration: fix approvals RLS so staff can view approval history
-- Run this in Supabase SQL editor as a privileged user (or paste into SQL editor).
-- This relaxes restrictive policies that only allowed approver or student to view approvals.
-- It grants authenticated staff the ability to SELECT approvals for applications they can access
-- based on student assignment (mentor/advisor/ahod/hod) similar to gatepass fix.

-- OD approvals
DROP POLICY IF EXISTS "Users can view OD approvals for their applications" ON od_approvals;
CREATE POLICY "Staff can view all od approvals for applications they can access"
  ON od_approvals FOR SELECT
  TO authenticated
  USING (
    -- Students can always see approvals for their own applications
    application_id IN (SELECT id FROM od_applications WHERE student_id = auth.uid())
    OR
    -- Approver themselves can see their approval rows
    approver_id = auth.uid()
    OR
    -- Staff (mentor/advisor/ahod/hod) can see approvals for applications of students they are assigned to
    application_id IN (
      SELECT oa.id FROM od_applications oa
      JOIN students s ON s.id = oa.student_id
      WHERE s.advisor_id = auth.uid()
         OR s.hod_id = auth.uid()
         OR s.ahod_id = auth.uid()
         OR s.mentor_id = auth.uid()
    )
  );

-- Leave approvals
DROP POLICY IF EXISTS "Users can view leave approvals for their applications" ON leave_approvals;
CREATE POLICY "Staff can view all leave approvals for applications they can access"
  ON leave_approvals FOR SELECT
  TO authenticated
  USING (
    application_id IN (SELECT id FROM leave_applications WHERE student_id = auth.uid())
    OR
    approver_id = auth.uid()
    OR
    application_id IN (
      SELECT la.id FROM leave_applications la
      JOIN students s ON s.id = la.student_id
      WHERE s.advisor_id = auth.uid()
         OR s.hod_id = auth.uid()
         OR s.ahod_id = auth.uid()
         OR s.mentor_id = auth.uid()
    )
  );

-- Bonafide approvals
DROP POLICY IF EXISTS "Users can view bonafide approvals for their applications" ON bonafide_approvals;
CREATE POLICY "Staff can view all bonafide approvals for applications they can access"
  ON bonafide_approvals FOR SELECT
  TO authenticated
  USING (
    application_id IN (SELECT id FROM bonafide_applications WHERE student_id = auth.uid())
    OR
    approver_id = auth.uid()
    OR
    application_id IN (
      SELECT ba.id FROM bonafide_applications ba
      JOIN students s ON s.id = ba.student_id
      WHERE s.advisor_id = auth.uid()
         OR s.hod_id = auth.uid()
         OR s.ahod_id = auth.uid()
         OR s.mentor_id = auth.uid()
    )
  );

-- NOTE:
-- After running this, approvals SELECT queries from the client should return all approval rows
-- for applications the staff member can access, enabling the approval history UI to display correctly.
-- If you prefer a narrower scope, modify the WHERE clause to restrict by department/role.

-- End of migration
