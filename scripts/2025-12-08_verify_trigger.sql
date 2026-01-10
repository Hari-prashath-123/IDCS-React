-- Step 1: Check if the trigger exists
SELECT 
  trigger_name, 
  event_manipulation, 
  event_object_table
FROM information_schema.triggers
WHERE trigger_name = 'trigger_update_seats_filled';

-- Step 2: Check if the function exists
SELECT 
  routine_name,
  routine_type
FROM information_schema.routines
WHERE routine_name = 'update_elective_seats_filled';

-- If they don't exist or you want to update them, run the file:
-- scripts/2025-12-08_fix_seats_filled_cross_dept.sql

-- Step 3: After running the trigger file, test it with a manual update
-- This simulates what happens when a student locks a selection
DO $$
DECLARE
  test_elective_id TEXT;
  test_student_id TEXT;
BEGIN
  -- Get a test elective
  SELECT id INTO test_elective_id FROM electives WHERE seat_count IS NOT NULL LIMIT 1;
  
  -- Get a test student
  SELECT id INTO test_student_id FROM profiles WHERE role = 'student' LIMIT 1;
  
  IF test_elective_id IS NOT NULL AND test_student_id IS NOT NULL THEN
    RAISE NOTICE 'Testing with elective_id: %, student_id: %', test_elective_id, test_student_id;
    
    -- Check seats_filled before
    RAISE NOTICE 'Seats filled before: %', (SELECT seats_filled FROM electives WHERE id = test_elective_id);
    
    -- Insert a test locked selection
    INSERT INTO student_electives (student_id, elective_id, is_locked, locked_at)
    VALUES (test_student_id, test_elective_id, true, NOW())
    ON CONFLICT (student_id, elective_id) DO UPDATE SET is_locked = true, locked_at = NOW();
    
    -- Check seats_filled after
    RAISE NOTICE 'Seats filled after: %', (SELECT seats_filled FROM electives WHERE id = test_elective_id);
    
    -- Rollback the test
    RAISE EXCEPTION 'Test complete - rolling back';
  ELSE
    RAISE NOTICE 'No test data available';
  END IF;
END $$;
