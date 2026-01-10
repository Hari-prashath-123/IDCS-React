-- Verify staff table structure
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_name = 'staff'
ORDER BY ordinal_position;

-- Check existing staff records
SELECT s.id, s.staff_id, s.staff_role, s.year, s.section, s.on_leave, p.name, p.email
FROM staff s
LEFT JOIN profiles p ON s.id = p.id;

-- If you have staff records without staff_role, update them:
-- UPDATE staff SET staff_role = 'lecturer' WHERE staff_role IS NULL;
