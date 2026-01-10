-- Verify attendance tables exist and have correct structure

-- Check if daily_attendance table exists
SELECT 
  table_name,
  column_name,
  data_type,
  is_nullable
FROM information_schema.columns
WHERE table_name = 'daily_attendance'
ORDER BY ordinal_position;

-- Check if period_attendance table exists
SELECT 
  table_name,
  column_name,
  data_type,
  is_nullable
FROM information_schema.columns
WHERE table_name = 'period_attendance'
ORDER BY ordinal_position;

-- Check RLS is enabled
SELECT 
  schemaname,
  tablename,
  rowsecurity
FROM pg_tables
WHERE tablename IN ('daily_attendance', 'period_attendance');

-- Check policies
SELECT 
  schemaname,
  tablename,
  policyname,
  cmd
FROM pg_policies
WHERE tablename IN ('daily_attendance', 'period_attendance');
