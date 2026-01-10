-- Verify trigger is attached and enabled
SELECT 
  t.tgname as trigger_name,
  t.tgenabled as is_enabled,
  t.tgtype,
  c.relname as table_name,
  p.proname as function_name
FROM pg_trigger t
JOIN pg_class c ON t.tgrelid = c.oid
JOIN pg_proc p ON t.tgfoid = p.oid
WHERE t.tgname = 'trigger_update_seats_filled';

-- Test: Insert a new locked selection and see if seats_filled updates
DO $$
DECLARE
  test_student_id UUID;
  test_elective_id UUID;
  seats_before INTEGER;
  seats_after INTEGER;
BEGIN
  -- Get Free elective in CSE
  SELECT id INTO test_elective_id FROM electives WHERE course_code = 'F101' AND department = 'CSE' LIMIT 1;
  
  -- Get a student who hasn't selected this
  SELECT p.id INTO test_student_id 
  FROM profiles p
  WHERE p.role = 'student'
  AND p.department = 'CSE'
  AND NOT EXISTS (SELECT 1 FROM student_electives se WHERE se.student_id = p.id AND se.elective_id = test_elective_id)
  LIMIT 1;
  
  IF test_student_id IS NOT NULL AND test_elective_id IS NOT NULL THEN
    -- Check all Free F101 electives before
    RAISE NOTICE 'Before insert:';
    FOR seats_before IN 
      SELECT seats_filled FROM electives WHERE course_code = 'F101'
    LOOP
      RAISE NOTICE '  seats_filled: %', seats_before;
    END LOOP;
    
    -- Insert locked selection
    INSERT INTO student_electives (student_id, elective_id, is_locked, locked_at)
    VALUES (test_student_id, test_elective_id, true, NOW());
    
    RAISE NOTICE 'After insert:';
    FOR seats_after IN 
      SELECT seats_filled FROM electives WHERE course_code = 'F101'
    LOOP
      RAISE NOTICE '  seats_filled: %', seats_after;
    END LOOP;
    
    -- Rollback
    RAISE EXCEPTION 'Test complete - rolling back';
  ELSE
    RAISE NOTICE 'No test data available';
  END IF;
END $$;
