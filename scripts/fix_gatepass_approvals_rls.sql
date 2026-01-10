-- Fix RLS policy for gatepass_approvals to allow staff to see all approvals for applications they can access
-- This enables proper approval history display in advisor and HOD pages

-- Drop the existing restrictive policy
DROP POLICY IF EXISTS "Users can view gatepass approvals for their applications" ON gatepass_approvals;

-- Create new policy that allows staff to see all approvals for applications they can access
CREATE POLICY "Staff can view all gatepass approvals for applications they can access"
  ON gatepass_approvals FOR SELECT
  TO authenticated
  USING (
    -- Students can see approvals for their own applications
    application_id IN (SELECT id FROM gatepass_applications WHERE student_id = auth.uid())
    OR
    -- Staff can see all approvals for applications where they are assigned as advisor, HOD, AHOD, or mentor
    application_id IN (
      SELECT ga.id FROM gatepass_applications ga
      JOIN students s ON s.id = ga.student_id
      WHERE s.advisor_id = auth.uid()
         OR s.hod_id = auth.uid()
         OR s.ahod_id = auth.uid()
         OR s.mentor_id = auth.uid()
    )
  );

-- Keep the insert policy as is
-- CREATE POLICY "Approvers can create gatepass approval records" ON gatepass_approvals FOR INSERT TO authenticated WITH CHECK (approver_id = auth.uid());