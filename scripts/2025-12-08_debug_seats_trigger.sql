-- Debug script to check if trigger is working

-- 1. Check if trigger exists
SELECT 
  trigger_name, 
  event_manipulation, 
  event_object_table,
  action_timing
FROM information_schema.triggers
WHERE trigger_name = 'trigger_update_seats_filled';

-- 2. Check if function exists
SELECT 
  routine_name,
  routine_type,
  data_type
FROM information_schema.routines
WHERE routine_name = 'update_elective_seats_filled';

-- 3. Check current student selections
SELECT 
  se.id,
  se.student_id,
  se.elective_id,
  se.is_locked,
  se.locked_at,
  e.sub_name,
  e.course_code,
  e.seats_filled,
  e.seat_count,
  p.name as student_name,
  p.department
FROM student_electives se
JOIN electives e ON se.elective_id = e.id
JOIN profiles p ON se.student_id = p.id
ORDER BY se.created_at DESC
LIMIT 20;

-- 4. Check if seats_filled matches actual locked count
SELECT 
  e.id,
  e.sub_name,
  e.course_code,
  e.department,
  e.year,
  e."group",
  e.parent_subject_id,
  e.seats_filled as current_seats_filled,
  (SELECT COUNT(*) FROM student_electives se WHERE se.elective_id = e.id AND se.is_locked = true) as actual_locked_count,
  e.seat_count
FROM electives e
WHERE e.seat_count IS NOT NULL
ORDER BY e.sub_name, e.department;

-- 5. Test the trigger manually (will rollback)
DO $$
DECLARE
  test_elective_id UUID;
  test_student_id UUID;
  seats_before INTEGER;
  seats_after INTEGER;
BEGIN
  -- Get a test elective with available seats
  SELECT id INTO test_elective_id 
  FROM electives 
  WHERE seat_count IS NOT NULL 
  AND seats_filled < seat_count
  LIMIT 1;
  
  -- Get a test student who hasn't selected this elective
  SELECT p.id INTO test_student_id 
  FROM profiles p
  WHERE p.role = 'student'
  AND NOT EXISTS (
    SELECT 1 FROM student_electives se 
    WHERE se.student_id = p.id 
    AND se.elective_id = test_elective_id
  )
  LIMIT 1;
  
  IF test_elective_id IS NOT NULL AND test_student_id IS NOT NULL THEN
    -- Get seats before
    SELECT seats_filled INTO seats_before FROM electives WHERE id = test_elective_id;
    RAISE NOTICE 'Testing with elective_id: %, student_id: %', test_elective_id, test_student_id;
    RAISE NOTICE 'Seats filled BEFORE: %', seats_before;
    
    -- Insert a locked selection
    INSERT INTO student_electives (student_id, elective_id, is_locked, locked_at)
    VALUES (test_student_id, test_elective_id, true, NOW());
    
    -- Get seats after
    SELECT seats_filled INTO seats_after FROM electives WHERE id = test_elective_id;
    RAISE NOTICE 'Seats filled AFTER: %', seats_after;
    
    IF seats_after = seats_before + 1 THEN
      RAISE NOTICE '✓ Trigger is working correctly!';
    ELSE
      RAISE NOTICE '✗ Trigger NOT working - seats did not increment';
    END IF;
    
    -- Rollback the test
    RAISE EXCEPTION 'Test complete - rolling back';
  ELSE
    RAISE NOTICE 'No suitable test data found';
  END IF;
EXCEPTION
  WHEN OTHERS THEN
    RAISE NOTICE 'Test completed with message: %', SQLERRM;
END $$;
