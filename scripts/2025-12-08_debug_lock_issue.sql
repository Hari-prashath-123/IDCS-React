-- Check what just happened
-- 1. Check the student's selection
SELECT 
  se.id as selection_id,
  se.student_id,
  se.elective_id,
  se.is_locked,
  se.locked_at,
  se.created_at,
  p.name as student_name,
  p.department as student_dept,
  e.sub_name,
  e.course_code,
  e.department as elective_dept,
  e.seats_filled,
  e.seat_count
FROM student_electives se
JOIN profiles p ON se.student_id = p.id
JOIN electives e ON se.elective_id = e.id
ORDER BY se.created_at DESC
LIMIT 10;

-- 2. Check seats_filled for all electives
SELECT 
  e.id,
  e.sub_name,
  e.course_code,
  e.department,
  e.year,
  e."group",
  e.parent_subject_id,
  e.seats_filled,
  e.seat_count
FROM electives e
WHERE e.seat_count IS NOT NULL
ORDER BY e.sub_name, e.department;

-- 3. Check trigger logs (if trigger fired, this should show the elective details)
SELECT 
  e.parent_subject_id,
  e.year,
  e."group",
  e.course_code,
  COUNT(*) as matching_electives
FROM electives e
WHERE e.seat_count IS NOT NULL
GROUP BY e.parent_subject_id, e.year, e."group", e.course_code;

-- 4. Force recalculate to fix current state
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

-- 5. Verify after recalculation
SELECT 
  e.sub_name,
  e.course_code,
  e.department,
  e.seats_filled as recalculated_seats_filled,
  (SELECT COUNT(*) FROM student_electives se WHERE se.elective_id = e.id AND se.is_locked = true) as direct_count
FROM electives e
WHERE e.seat_count IS NOT NULL
ORDER BY e.sub_name, e.department;
