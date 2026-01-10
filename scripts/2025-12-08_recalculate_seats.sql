-- First, verify the trigger exists
SELECT 
  trigger_name, 
  event_manipulation, 
  event_object_table, 
  action_statement
FROM information_schema.triggers
WHERE trigger_name = 'trigger_update_seats_filled';

-- Recalculate seats_filled for ALL electives based on locked selections
UPDATE electives
SET seats_filled = (
  SELECT COUNT(*)
  FROM student_electives
  WHERE student_electives.elective_id = electives.id
    AND student_electives.is_locked = true
);

-- Verify the counts
SELECT 
  e.id,
  e.sub_name,
  e.course_code,
  e.seat_count,
  e.seats_filled,
  (SELECT COUNT(*) FROM student_electives se WHERE se.elective_id = e.id AND se.is_locked = true) as actual_locked_count
FROM electives e
WHERE e.seat_count IS NOT NULL
ORDER BY e.sub_name;
