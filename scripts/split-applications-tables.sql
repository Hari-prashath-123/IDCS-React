-- =====================================================
-- SPLIT APPLICATIONS TABLE INTO SEPARATE TABLES
-- =====================================================
-- This script splits the unified 'applications' table into:
--   1. od_applications
--   2. leave_applications
--   3. gatepass_applications
--   4. bonafide_applications
--
-- Each table will have ONLY the columns relevant to that type.
-- Run this script in Supabase SQL Editor.
-- =====================================================

BEGIN;

-- =====================================================
-- 1. CREATE OD_APPLICATIONS TABLE
-- =====================================================
CREATE TABLE IF NOT EXISTS od_applications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id uuid NOT NULL REFERENCES students ON DELETE CASCADE,
  subject text NOT NULL,
  body text NOT NULL,
  reason text NOT NULL, -- Summary text for display
  from_date date NOT NULL,
  to_date date NOT NULL,
  attachment_url text,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  -- Gatepass flow: advisor -> hod -> completed
  current_approver_level text DEFAULT 'advisor' CHECK (current_approver_level IN ('advisor', 'hod', 'completed')),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- =====================================================
-- 2. CREATE LEAVE_APPLICATIONS TABLE
-- =====================================================
CREATE TABLE IF NOT EXISTS leave_applications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id uuid NOT NULL REFERENCES students ON DELETE CASCADE,
  subject text NOT NULL,
  body text NOT NULL,
  reason text NOT NULL, -- Summary text for display
  from_date date NOT NULL,
  to_date date NOT NULL,
  attachment_url text,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  current_approver_level text DEFAULT 'mentor' CHECK (current_approver_level IN ('mentor', 'advisor', 'ahod', 'hod', 'completed')),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- =====================================================
-- 3. CREATE GATEPASS_APPLICATIONS TABLE
-- =====================================================
CREATE TABLE IF NOT EXISTS gatepass_applications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id uuid NOT NULL REFERENCES students ON DELETE CASCADE,
  subject text NOT NULL,
  reason text NOT NULL, -- Summary text for display (derived from subject)
  from_date date NOT NULL,
  to_date date NOT NULL,
  attachment_url text,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  current_approver_level text DEFAULT 'mentor' CHECK (current_approver_level IN ('mentor', 'advisor', 'ahod', 'hod', 'completed')),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- =====================================================
-- 4. CREATE BONAFIDE_APPLICATIONS TABLE
-- =====================================================
CREATE TABLE IF NOT EXISTS bonafide_applications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id uuid NOT NULL REFERENCES students ON DELETE CASCADE,
  purpose text,
  fathers_name text,
  branch text,
  community text,
  study_mode text, -- 'day_scholar' or 'hostel'
  bus_option text, -- 'college' or 'out' (only if day_scholar)
  bus_fare numeric,
  funding text, -- 'Gov' or 'Management'
  first_graduate text, -- 'Yes' or 'No' (only if Gov)
  reason text NOT NULL, -- Summary text for display
  from_date date NOT NULL, -- Same as to_date for bonafide (single date)
  to_date date NOT NULL,
  attachment_url text,
  metadata jsonb, -- For storing additional flexible data (other_purpose, other_community, year, etc.)
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  -- For bonafide flow we intentionally omit 'ahod' and include 'ps' as final approver
  current_approver_level text DEFAULT 'mentor' CHECK (current_approver_level IN ('mentor', 'advisor', 'hod', 'ps', 'completed')),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- =====================================================
-- 5. CREATE SEPARATE APPROVALS TABLES FOR EACH TYPE
-- =====================================================

-- OD Approvals
CREATE TABLE IF NOT EXISTS od_approvals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  application_id uuid NOT NULL REFERENCES od_applications ON DELETE CASCADE,
  approver_id uuid NOT NULL REFERENCES profiles,
  -- Only advisor and hod approve gatepass applications
  approver_role text NOT NULL CHECK (approver_role IN ('advisor', 'hod')),
  action text NOT NULL CHECK (action IN ('approved', 'rejected')),
  remarks text,
  created_at timestamptz DEFAULT now()
);

-- Leave Approvals
CREATE TABLE IF NOT EXISTS leave_approvals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  application_id uuid NOT NULL REFERENCES leave_applications ON DELETE CASCADE,
  approver_id uuid NOT NULL REFERENCES profiles,
  approver_role text NOT NULL CHECK (approver_role IN ('mentor', 'advisor', 'ahod', 'hod')),
  action text NOT NULL CHECK (action IN ('approved', 'rejected')),
  remarks text,
  created_at timestamptz DEFAULT now()
);

-- Gatepass Approvals
CREATE TABLE IF NOT EXISTS gatepass_approvals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  application_id uuid NOT NULL REFERENCES gatepass_applications ON DELETE CASCADE,
  approver_id uuid NOT NULL REFERENCES profiles,
  approver_role text NOT NULL CHECK (approver_role IN ('mentor', 'advisor', 'ahod', 'hod')),
  action text NOT NULL CHECK (action IN ('approved', 'rejected')),
  remarks text,
  created_at timestamptz DEFAULT now()
);

-- Bonafide Approvals
CREATE TABLE IF NOT EXISTS bonafide_approvals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  application_id uuid NOT NULL REFERENCES bonafide_applications ON DELETE CASCADE,
  approver_id uuid NOT NULL REFERENCES profiles,
  -- For bonafide flow we do not include AHOD; include 'ps' as final approver
  approver_role text NOT NULL CHECK (approver_role IN ('mentor', 'advisor', 'hod', 'ps')),
  action text NOT NULL CHECK (action IN ('approved', 'rejected')),
  remarks text,
  created_at timestamptz DEFAULT now()
);

-- =====================================================
-- 6. MIGRATE EXISTING DATA FROM APPLICATIONS TABLE
-- =====================================================

-- Migrate OD applications
INSERT INTO od_applications (
  id, student_id, subject, body, reason, from_date, to_date, 
  attachment_url, status, current_approver_level, created_at, updated_at
)
SELECT 
  id, student_id, 
  COALESCE(subject, 'OD Request') as subject,
  COALESCE(body, reason) as body,
  reason, from_date, to_date, 
  attachment_url, status, current_approver_level, created_at, updated_at
FROM applications
WHERE type = 'od'
ON CONFLICT (id) DO NOTHING;

-- Migrate Leave applications
INSERT INTO leave_applications (
  id, student_id, subject, body, reason, from_date, to_date, 
  attachment_url, status, current_approver_level, created_at, updated_at
)
SELECT 
  id, student_id, 
  COALESCE(subject, 'Leave Request') as subject,
  COALESCE(body, reason) as body,
  reason, from_date, to_date, 
  attachment_url, status, current_approver_level, created_at, updated_at
FROM applications
WHERE type = 'leave'
ON CONFLICT (id) DO NOTHING;

-- Migrate Gatepass applications
INSERT INTO gatepass_applications (
  id, student_id, subject, reason, from_date, to_date, 
  attachment_url, status, current_approver_level, created_at, updated_at
)
SELECT 
  id, student_id, 
  COALESCE(subject, 'Gatepass') as subject,
  COALESCE(reason, subject, 'Gatepass') as reason,
  from_date, to_date, 
  attachment_url, status, current_approver_level, created_at, updated_at
FROM applications
WHERE type = 'gatepass'
ON CONFLICT (id) DO NOTHING;

-- Migrate Bonafide applications
INSERT INTO bonafide_applications (
  id, student_id, purpose, fathers_name, branch, community,
  study_mode, bus_option, bus_fare, funding, first_graduate,
  reason, from_date, to_date, attachment_url, metadata,
  status, current_approver_level, created_at, updated_at
)
SELECT 
  id, student_id, 
  purpose, fathers_name, branch, community,
  study_mode, bus_option, bus_fare, funding, first_graduate,
  reason, from_date, to_date, attachment_url, metadata,
  status, current_approver_level, created_at, updated_at
FROM applications
WHERE type = 'bonafide'
ON CONFLICT (id) DO NOTHING;

-- =====================================================
-- 7. MIGRATE APPROVALS DATA
-- =====================================================

-- Migrate OD approvals
INSERT INTO od_approvals (id, application_id, approver_id, approver_role, action, remarks, created_at)
SELECT a.id, a.application_id, a.approver_id, a.approver_role, a.action, a.remarks, a.created_at
FROM approvals a
INNER JOIN applications ap ON a.application_id = ap.id
WHERE ap.type = 'od'
ON CONFLICT (id) DO NOTHING;

-- Migrate Leave approvals
INSERT INTO leave_approvals (id, application_id, approver_id, approver_role, action, remarks, created_at)
SELECT a.id, a.application_id, a.approver_id, a.approver_role, a.action, a.remarks, a.created_at
FROM approvals a
INNER JOIN applications ap ON a.application_id = ap.id
WHERE ap.type = 'leave'
ON CONFLICT (id) DO NOTHING;

-- Migrate Gatepass approvals
INSERT INTO gatepass_approvals (id, application_id, approver_id, approver_role, action, remarks, created_at)
SELECT a.id, a.application_id, a.approver_id, a.approver_role, a.action, a.remarks, a.created_at
FROM approvals a
INNER JOIN applications ap ON a.application_id = ap.id
WHERE ap.type = 'gatepass'
ON CONFLICT (id) DO NOTHING;

-- Migrate Bonafide approvals
INSERT INTO bonafide_approvals (id, application_id, approver_id, approver_role, action, remarks, created_at)
SELECT a.id, a.application_id, a.approver_id, a.approver_role, a.action, a.remarks, a.created_at
FROM approvals a
INNER JOIN applications ap ON a.application_id = ap.id
WHERE ap.type = 'bonafide'
ON CONFLICT (id) DO NOTHING;

-- =====================================================
-- 8. ENABLE ROW LEVEL SECURITY ON NEW TABLES
-- =====================================================

ALTER TABLE od_applications ENABLE ROW LEVEL SECURITY;
ALTER TABLE leave_applications ENABLE ROW LEVEL SECURITY;
ALTER TABLE gatepass_applications ENABLE ROW LEVEL SECURITY;
ALTER TABLE bonafide_applications ENABLE ROW LEVEL SECURITY;

ALTER TABLE od_approvals ENABLE ROW LEVEL SECURITY;
ALTER TABLE leave_approvals ENABLE ROW LEVEL SECURITY;
ALTER TABLE gatepass_approvals ENABLE ROW LEVEL SECURITY;
ALTER TABLE bonafide_approvals ENABLE ROW LEVEL SECURITY;

-- =====================================================
-- 9. CREATE RLS POLICIES FOR OD APPLICATIONS
-- =====================================================

-- Students can view own OD applications
CREATE POLICY "Students can view own OD applications"
  ON od_applications FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM students s
      WHERE s.id = od_applications.student_id
      AND s.id = auth.uid()
    )
  );

-- Students can create own OD applications
CREATE POLICY "Students can create own OD applications"
  ON od_applications FOR INSERT
  TO authenticated
  WITH CHECK (student_id = auth.uid());

-- Students can update own pending OD applications
CREATE POLICY "Students can update own pending OD applications"
  ON od_applications FOR UPDATE
  TO authenticated
  USING (student_id = auth.uid() AND status = 'pending')
  WITH CHECK (student_id = auth.uid() AND status = 'pending');

-- Staff can view OD applications for their students
CREATE POLICY "Staff can view OD applications"
  ON od_applications FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM students s
      INNER JOIN staff st ON (
        st.id = s.mentor_id OR 
        st.id = s.advisor_id OR 
        st.id = s.ahod_id OR 
        st.id = s.hod_id
      )
      WHERE s.id = od_applications.student_id
      AND st.id = auth.uid()
    )
  );

-- Staff can update OD applications
CREATE POLICY "Staff can update OD applications"
  ON od_applications FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM students s
      INNER JOIN staff st ON (
        st.id = s.mentor_id OR 
        st.id = s.advisor_id OR 
        st.id = s.ahod_id OR 
        st.id = s.hod_id
      )
      WHERE s.id = od_applications.student_id
      AND st.id = auth.uid()
    )
  );

-- OD Approvals policies
CREATE POLICY "Users can view OD approvals for their applications"
  ON od_approvals FOR SELECT
  TO authenticated
  USING (
    application_id IN (SELECT id FROM od_applications WHERE student_id = auth.uid())
    OR approver_id = auth.uid()
  );

CREATE POLICY "Approvers can create OD approval records"
  ON od_approvals FOR INSERT
  TO authenticated
  WITH CHECK (approver_id = auth.uid());

-- =====================================================
-- 10. CREATE RLS POLICIES FOR LEAVE APPLICATIONS
-- =====================================================

CREATE POLICY "Students can view own leave applications"
  ON leave_applications FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM students s
      WHERE s.id = leave_applications.student_id
      AND s.id = auth.uid()
    )
  );

CREATE POLICY "Students can create own leave applications"
  ON leave_applications FOR INSERT
  TO authenticated
  WITH CHECK (student_id = auth.uid());

CREATE POLICY "Students can update own pending leave applications"
  ON leave_applications FOR UPDATE
  TO authenticated
  USING (student_id = auth.uid() AND status = 'pending')
  WITH CHECK (student_id = auth.uid() AND status = 'pending');

CREATE POLICY "Staff can view leave applications"
  ON leave_applications FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM students s
      INNER JOIN staff st ON (
        st.id = s.mentor_id OR 
        st.id = s.advisor_id OR 
        st.id = s.ahod_id OR 
        st.id = s.hod_id
      )
      WHERE s.id = leave_applications.student_id
      AND st.id = auth.uid()
    )
  );

CREATE POLICY "Staff can update leave applications"
  ON leave_applications FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM students s
      INNER JOIN staff st ON (
        st.id = s.mentor_id OR 
        st.id = s.advisor_id OR 
        st.id = s.ahod_id OR 
        st.id = s.hod_id
      )
      WHERE s.id = leave_applications.student_id
      AND st.id = auth.uid()
    )
  );

CREATE POLICY "Users can view leave approvals for their applications"
  ON leave_approvals FOR SELECT
  TO authenticated
  USING (
    application_id IN (SELECT id FROM leave_applications WHERE student_id = auth.uid())
    OR approver_id = auth.uid()
  );

CREATE POLICY "Approvers can create leave approval records"
  ON leave_approvals FOR INSERT
  TO authenticated
  WITH CHECK (approver_id = auth.uid());

-- =====================================================
-- 11. CREATE RLS POLICIES FOR GATEPASS APPLICATIONS
-- =====================================================

CREATE POLICY "Students can view own gatepass applications"
  ON gatepass_applications FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM students s
      WHERE s.id = gatepass_applications.student_id
      AND s.id = auth.uid()
    )
  );

CREATE POLICY "Students can create own gatepass applications"
  ON gatepass_applications FOR INSERT
  TO authenticated
  WITH CHECK (student_id = auth.uid());

CREATE POLICY "Students can update own pending gatepass applications"
  ON gatepass_applications FOR UPDATE
  TO authenticated
  USING (student_id = auth.uid() AND status = 'pending')
  WITH CHECK (student_id = auth.uid() AND status = 'pending');

CREATE POLICY "Staff can view gatepass applications"
  ON gatepass_applications FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM students s
      INNER JOIN staff st ON (
        st.id = s.mentor_id OR 
        st.id = s.advisor_id OR 
        st.id = s.ahod_id OR 
        st.id = s.hod_id
      )
      WHERE s.id = gatepass_applications.student_id
      AND st.id = auth.uid()
    )
  );

CREATE POLICY "Staff can update gatepass applications"
  ON gatepass_applications FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM students s
      INNER JOIN staff st ON (
        st.id = s.mentor_id OR 
        st.id = s.advisor_id OR 
        st.id = s.ahod_id OR 
        st.id = s.hod_id
      )
      WHERE s.id = gatepass_applications.student_id
      AND st.id = auth.uid()
    )
  );

CREATE POLICY "Users can view gatepass approvals for their applications"
  ON gatepass_approvals FOR SELECT
  TO authenticated
  USING (
    application_id IN (SELECT id FROM gatepass_applications WHERE student_id = auth.uid())
    OR approver_id = auth.uid()
  );

CREATE POLICY "Approvers can create gatepass approval records"
  ON gatepass_approvals FOR INSERT
  TO authenticated
  WITH CHECK (approver_id = auth.uid());

-- =====================================================
-- 12. CREATE RLS POLICIES FOR BONAFIDE APPLICATIONS
-- =====================================================

CREATE POLICY "Students can view own bonafide applications"
  ON bonafide_applications FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM students s
      WHERE s.id = bonafide_applications.student_id
      AND s.id = auth.uid()
    )
  );

CREATE POLICY "Students can create own bonafide applications"
  ON bonafide_applications FOR INSERT
  TO authenticated
  WITH CHECK (student_id = auth.uid());

CREATE POLICY "Students can update own pending bonafide applications"
  ON bonafide_applications FOR UPDATE
  TO authenticated
  USING (student_id = auth.uid() AND status = 'pending')
  WITH CHECK (student_id = auth.uid() AND status = 'pending');

CREATE POLICY "Staff can view bonafide applications"
  ON bonafide_applications FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM students s
      INNER JOIN staff st ON (
        st.id = s.mentor_id OR 
        st.id = s.advisor_id OR 
        st.id = s.ahod_id OR 
        st.id = s.hod_id
      )
      WHERE s.id = bonafide_applications.student_id
      AND st.id = auth.uid()
    )
  );

CREATE POLICY "Staff can update bonafide applications"
  ON bonafide_applications FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM students s
      INNER JOIN staff st ON (
        st.id = s.mentor_id OR 
        st.id = s.advisor_id OR 
        st.id = s.ahod_id OR 
        st.id = s.hod_id
      )
      WHERE s.id = bonafide_applications.student_id
      AND st.id = auth.uid()
    )
  );

CREATE POLICY "Users can view bonafide approvals for their applications"
  ON bonafide_approvals FOR SELECT
  TO authenticated
  USING (
    application_id IN (SELECT id FROM bonafide_applications WHERE student_id = auth.uid())
    OR approver_id = auth.uid()
  );

CREATE POLICY "Approvers can create bonafide approval records"
  ON bonafide_approvals FOR INSERT
  TO authenticated
  WITH CHECK (approver_id = auth.uid());

-- =====================================================
-- 13. CREATE INDEXES FOR PERFORMANCE
-- =====================================================

-- OD Applications indexes
CREATE INDEX IF NOT EXISTS idx_od_applications_student_id ON od_applications(student_id);
CREATE INDEX IF NOT EXISTS idx_od_applications_status ON od_applications(status);
CREATE INDEX IF NOT EXISTS idx_od_applications_created_at ON od_applications(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_od_approvals_application_id ON od_approvals(application_id);

-- Leave Applications indexes
CREATE INDEX IF NOT EXISTS idx_leave_applications_student_id ON leave_applications(student_id);
CREATE INDEX IF NOT EXISTS idx_leave_applications_status ON leave_applications(status);
CREATE INDEX IF NOT EXISTS idx_leave_applications_created_at ON leave_applications(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_leave_approvals_application_id ON leave_approvals(application_id);

-- Gatepass Applications indexes
CREATE INDEX IF NOT EXISTS idx_gatepass_applications_student_id ON gatepass_applications(student_id);
CREATE INDEX IF NOT EXISTS idx_gatepass_applications_status ON gatepass_applications(status);
CREATE INDEX IF NOT EXISTS idx_gatepass_applications_created_at ON gatepass_applications(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_gatepass_approvals_application_id ON gatepass_approvals(application_id);

-- Bonafide Applications indexes
CREATE INDEX IF NOT EXISTS idx_bonafide_applications_student_id ON bonafide_applications(student_id);
CREATE INDEX IF NOT EXISTS idx_bonafide_applications_status ON bonafide_applications(status);
CREATE INDEX IF NOT EXISTS idx_bonafide_applications_created_at ON bonafide_applications(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_bonafide_approvals_application_id ON bonafide_approvals(application_id);

-- =====================================================
-- 14. CREATE UPDATED_AT TRIGGERS
-- =====================================================

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- OD Applications trigger
DROP TRIGGER IF EXISTS update_od_applications_updated_at ON od_applications;
CREATE TRIGGER update_od_applications_updated_at
    BEFORE UPDATE ON od_applications
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Leave Applications trigger
DROP TRIGGER IF EXISTS update_leave_applications_updated_at ON leave_applications;
CREATE TRIGGER update_leave_applications_updated_at
    BEFORE UPDATE ON leave_applications
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Gatepass Applications trigger
DROP TRIGGER IF EXISTS update_gatepass_applications_updated_at ON gatepass_applications;
CREATE TRIGGER update_gatepass_applications_updated_at
    BEFORE UPDATE ON gatepass_applications
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Bonafide Applications trigger
DROP TRIGGER IF EXISTS update_bonafide_applications_updated_at ON bonafide_applications;
CREATE TRIGGER update_bonafide_applications_updated_at
    BEFORE UPDATE ON bonafide_applications
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- =====================================================
-- 15. VERIFICATION QUERIES
-- =====================================================

-- Uncomment the following to verify migration:
/*
SELECT 'OD Applications' as type, COUNT(*) as count FROM od_applications
UNION ALL
SELECT 'Leave Applications', COUNT(*) FROM leave_applications
UNION ALL
SELECT 'Gatepass Applications', COUNT(*) FROM gatepass_applications
UNION ALL
SELECT 'Bonafide Applications', COUNT(*) FROM bonafide_applications
UNION ALL
SELECT 'Original Applications', COUNT(*) FROM applications;

SELECT 'OD Approvals' as type, COUNT(*) as count FROM od_approvals
UNION ALL
SELECT 'Leave Approvals', COUNT(*) FROM leave_approvals
UNION ALL
SELECT 'Gatepass Approvals', COUNT(*) FROM gatepass_approvals
UNION ALL
SELECT 'Bonafide Approvals', COUNT(*) FROM bonafide_approvals
UNION ALL
SELECT 'Original Approvals', COUNT(*) FROM approvals;
*/

COMMIT;

-- =====================================================
-- OPTIONAL: DROP OLD TABLES (Run separately after verification)
-- =====================================================
-- CAUTION: Only run these commands after verifying the migration was successful
-- and updating all application code to use the new tables!

/*
-- Drop old approvals table first (has foreign key to applications)
DROP TABLE IF EXISTS approvals CASCADE;

-- Drop old applications table
DROP TABLE IF EXISTS applications CASCADE;
*/

-- =====================================================
-- END OF MIGRATION SCRIPT
-- =====================================================
-- Next steps:
-- 1. Run this script in Supabase SQL Editor
-- 2. Verify data migration with the verification queries above
-- 3. Update TypeScript types in lib/supabase.ts
-- 4. Update all application pages to use new table names
-- 5. Test thoroughly before dropping old tables
-- =====================================================
