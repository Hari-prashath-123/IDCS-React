-- Migration for Group OD functionality
-- Date: 2026-01-08

-- Create group_od_applications table
CREATE TABLE IF NOT EXISTS group_od_applications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_by UUID REFERENCES auth.users(id) NOT NULL,
  reason TEXT NOT NULL,
  from_date DATE NOT NULL,
  to_date DATE NOT NULL,
  proof_url TEXT,
  status TEXT DEFAULT 'pending',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Add group_od_id column to od_applications table
ALTER TABLE od_applications 
ADD COLUMN IF NOT EXISTS group_od_id UUID REFERENCES group_od_applications(id) ON DELETE CASCADE;

-- Add index for faster queries
CREATE INDEX IF NOT EXISTS idx_od_applications_group_od_id ON od_applications(group_od_id);
CREATE INDEX IF NOT EXISTS idx_group_od_applications_created_by ON group_od_applications(created_by);
CREATE INDEX IF NOT EXISTS idx_group_od_applications_status ON group_od_applications(status);

-- Enable RLS
ALTER TABLE group_od_applications ENABLE ROW LEVEL SECURITY;

-- RLS Policies for group_od_applications
-- PE HOD/AHOD can create and view their own group OD applications
CREATE POLICY "PE staff can create group OD applications"
  ON group_od_applications
  FOR INSERT
  TO authenticated
  WITH CHECK (
    auth.uid() = created_by AND
    EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.id = auth.uid()
      AND p.department = 'Physical Education'
      AND p.role IN ('hod', 'ahod')
    )
  );

CREATE POLICY "PE staff can view their own group OD applications"
  ON group_od_applications
  FOR SELECT
  TO authenticated
  USING (
    auth.uid() = created_by OR
    EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.id = auth.uid()
      AND p.department = 'Physical Education'
      AND p.role IN ('hod', 'ahod')
    )
  );

CREATE POLICY "PE staff can update their own group OD applications"
  ON group_od_applications
  FOR UPDATE
  TO authenticated
  USING (
    auth.uid() = created_by AND
    EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.id = auth.uid()
      AND p.department = 'Physical Education'
      AND p.role IN ('hod', 'ahod')
    )
  )
  WITH CHECK (
    auth.uid() = created_by AND
    EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.id = auth.uid()
      AND p.department = 'Physical Education'
      AND p.role IN ('hod', 'ahod')
    )
  );

-- Update existing od_applications RLS to allow HODs to see group OD applications for their department students
-- This will be handled by existing policies that check student's HOD

-- Create a function to get group OD summary for HODs
CREATE OR REPLACE FUNCTION get_group_od_summary(application_id UUID)
RETURNS TABLE (
  group_od_id UUID,
  total_students INT,
  approved_count INT,
  rejected_count INT,
  pending_count INT
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    oa.group_od_id,
    COUNT(*)::INT as total_students,
    COUNT(CASE WHEN oa.status = 'approved' THEN 1 END)::INT as approved_count,
    COUNT(CASE WHEN oa.status = 'rejected' THEN 1 END)::INT as rejected_count,
    COUNT(CASE WHEN oa.status = 'pending' THEN 1 END)::INT as pending_count
  FROM od_applications oa
  WHERE oa.group_od_id = (
    SELECT group_od_id FROM od_applications WHERE id = application_id
  )
  GROUP BY oa.group_od_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON TABLE group_od_applications IS 'Stores group OD applications created by PE department HOD/AHOD';
COMMENT ON COLUMN od_applications.group_od_id IS 'Links individual OD applications to a group OD application';
