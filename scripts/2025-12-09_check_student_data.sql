-- Check student_electives data
SELECT 
  se.id,
  se.student_id,
  se.elective_id,
  se.is_locked,
  p.name as student_name,
  p.email,
  p.department,
  e.sub_name as elective_name,
  e.course_code
FROM student_electives se
JOIN profiles p ON se.student_id = p.id
JOIN electives e ON se.elective_id = e.id
WHERE se.is_locked = true
LIMIT 20;

-- Check if profiles table has register_number column
SELECT column_name, data_type 
FROM information_schema.columns 
WHERE table_name = 'profiles' 
AND column_name LIKE '%register%';

-- Check students table if it exists
SELECT column_name, data_type 
FROM information_schema.columns 
WHERE table_name = 'students';
