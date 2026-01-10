-- Add HOD and AHOD users to staff table
-- This script ensures that all HOD and AHOD users have entries in the staff table
-- so they can use the leave status toggle feature

-- First, update the staff_role CHECK constraint to include 'hod' and 'ahod'
ALTER TABLE staff DROP CONSTRAINT IF EXISTS staff_staff_role_check;
ALTER TABLE staff ADD CONSTRAINT staff_staff_role_check 
  CHECK (staff_role IN ('mentor', 'advisor', 'lecturer', 'hod', 'ahod'));

-- Insert HOD users into staff table (if they don't already exist)
INSERT INTO staff (id, staff_id, staff_role, on_leave)
SELECT 
  p.id,
  p.email as staff_id,  -- Using email as staff_id for HODs
  'hod' as staff_role,
  false as on_leave
FROM profiles p
WHERE p.role = 'hod'
AND NOT EXISTS (
  SELECT 1 FROM staff s WHERE s.id = p.id
)
ON CONFLICT (id) DO UPDATE SET staff_role = 'hod';

-- Insert AHOD users into staff table (if they don't already exist)
INSERT INTO staff (id, staff_id, staff_role, on_leave)
SELECT 
  p.id,
  p.email as staff_id,  -- Using email as staff_id for AHODs
  'ahod' as staff_role,
  false as on_leave
FROM profiles p
WHERE p.role = 'ahod'
AND NOT EXISTS (
  SELECT 1 FROM staff s WHERE s.id = p.id
)
ON CONFLICT (id) DO UPDATE SET staff_role = 'ahod';

-- Verify the changes
SELECT 
  p.role,
  p.email,
  s.staff_role,
  s.on_leave
FROM profiles p
LEFT JOIN staff s ON s.id = p.id
WHERE p.role IN ('hod', 'ahod')
ORDER BY p.role, p.email;
