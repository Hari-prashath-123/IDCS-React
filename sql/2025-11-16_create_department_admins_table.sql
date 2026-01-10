-- Create a mapping table for department admins
CREATE TABLE IF NOT EXISTS department_admins (
  department text PRIMARY KEY,
  staff_id uuid REFERENCES profiles(id) ON DELETE CASCADE,
  created_at timestamptz DEFAULT now()
);

-- Enable RLS and create policy so that HODs for a department can manage the mapping for their department
ALTER TABLE department_admins ENABLE ROW LEVEL SECURITY;

-- Allow HODs to insert/update/delete rows for their own department
DROP POLICY IF EXISTS "hod manage dept admins" ON department_admins;
CREATE POLICY "hod manage dept admins" ON department_admins
  FOR ALL
  USING (
    -- allow the mapped staff member to manage their own mapping
    staff_id = auth.uid()
  )
  WITH CHECK (
    staff_id = auth.uid()
  );

-- Grant select/insert/update/delete to authenticated users (RLS will further limit actions)
GRANT SELECT, INSERT, UPDATE, DELETE ON department_admins TO authenticated;
