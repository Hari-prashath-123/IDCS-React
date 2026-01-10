-- Fix RLS policies for staff table to allow INSERT operations
-- This resolves the "new row violates row-level security policy" error

-- Drop existing policies if they exist
DROP POLICY IF EXISTS "Staff can insert own data" ON staff;
DROP POLICY IF EXISTS "Admins can insert staff data" ON staff;

-- Allow staff to insert their own record (for profile completion)
CREATE POLICY "Staff can insert own data"
  ON staff FOR INSERT
  TO authenticated
  WITH CHECK (id = auth.uid());

-- Allow admins to insert staff records (for creating new staff accounts)
CREATE POLICY "Admins can insert staff data"
  ON staff FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
  );

-- Also ensure admins can update any staff record
DROP POLICY IF EXISTS "Admins can update staff data" ON staff;
CREATE POLICY "Admins can update staff data"
  ON staff FOR UPDATE
  TO authenticated
  USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
  );