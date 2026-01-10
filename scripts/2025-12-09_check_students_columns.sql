-- Check actual column names in students table
SELECT column_name, data_type 
FROM information_schema.columns 
WHERE table_name = 'students'
ORDER BY ordinal_position;

-- Check a sample student row to see actual data
SELECT * FROM students LIMIT 3;
