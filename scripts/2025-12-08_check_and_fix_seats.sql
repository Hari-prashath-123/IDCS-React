-- Check recent student selections with full details
SELECT 
  se.id as selection_id,
  p.name as student_name,
  p.department as student_dept,
  e.sub_name as elective_name,
  e.course_code,
  e.department as elective_dept,
  e."group",
  se.is_locked,
  se.locked_at,
  se.created_at,
  e.seats_filled as current_seats_filled,
  e.seat_count
FROM student_electives se
JOIN profiles p ON se.student_id = p.id
JOIN electives e ON se.elective_id = e.id
ORDER BY se.created_at DESC
LIMIT 30;

-- Check if any locked selections exist
SELECT COUNT(*) as total_locked_selections
FROM student_electives
WHERE is_locked = true;

-- If trigger is working, manually update seats_filled for all electives
UPDATE electives e1
SET seats_filled = (
  SELECT COUNT(DISTINCT se.student_id)
  FROM student_electives se
  JOIN electives e2 ON se.elective_id = e2.id
  WHERE e2.parent_subject_id = e1.parent_subject_id
    AND e2.year = e1.year
    AND e2."group" = e1."group"
    AND e2.course_code = e1.course_code
    AND se.is_locked = true
);

-- Verify the update
SELECT 
  e.sub_name,
  e.course_code,
  e.department,
  e.seats_filled,
  (SELECT COUNT(*) FROM student_electives se WHERE se.elective_id = e.id AND se.is_locked = true) as actual_locked_count
FROM electives e
WHERE e.seat_count IS NOT NULL
ORDER BY e.sub_name, e.department;
