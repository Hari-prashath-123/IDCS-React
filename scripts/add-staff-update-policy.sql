-- Add UPDATE policy for staff to update their own leave status
-- Run this in Supabase SQL Editor

DROP POLICY IF EXISTS "Staff can update own data" ON staff;

CREATE POLICY "Staff can update own data"
  ON staff FOR UPDATE
  TO authenticated
  USING (id = auth.uid())
  WITH CHECK (id = auth.uid());
