-- Diagnose HOD -> department mismatches and upsert department_admins mappings
-- Review results first (SELECTs). Remove the final INSERT if you only want diagnostics.

-- 1) List all HOD profiles with counts of students in their declared department
WITH hods AS (
  SELECT id, email, department FROM public.profiles WHERE role = 'hod' AND department IS NOT NULL
), students_by_dept AS (
  SELECT department, count(*) AS student_count FROM public.students GROUP BY department
)
SELECT h.id AS hod_id, h.email, h.department AS profile_department, coalesce(s.student_count,0) AS students_in_profile_department
FROM hods h
LEFT JOIN students_by_dept s ON s.department = h.department
ORDER BY students_in_profile_department ASC;

-- 2) For HODs with zero students in their profile department, suggest a candidate department
-- using a case-insensitive substring match against existing student departments.
WITH hods AS (
  SELECT id, email, department FROM public.profiles WHERE role = 'hod' AND department IS NOT NULL
), candidate AS (
  SELECT
    h.id AS hod_id,
    h.email,
    h.department AS profile_department,
    sd.department AS candidate_department,
    sd.student_count AS candidate_student_count
  FROM hods h
  CROSS JOIN LATERAL (
    SELECT s.department, count(*) AS student_count
    FROM public.students s
    WHERE s.department ILIKE ('%' || h.department || '%')
    GROUP BY s.department
    ORDER BY student_count DESC
    LIMIT 1
  ) sd
)
SELECT * FROM candidate ORDER BY candidate_student_count DESC;

-- 3) SHOW which HODs currently lack a department_admins mapping
SELECT p.id AS hod_id, p.email, p.department
FROM public.profiles p
WHERE p.role = 'hod' AND p.department IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM public.department_admins da WHERE da.staff_id = p.id);

-- 4) SAFELY upsert mappings for HODs where either:
--    - there are students in the HOD's declared department OR
--    - we found a candidate department via substring match
-- NOTE: this makes a best-effort mapping. Inspect results above before running in production.
WITH hods AS (
  SELECT id, email, department FROM public.profiles WHERE role = 'hod' AND department IS NOT NULL
), students_by_dept AS (
  SELECT department, count(*) AS student_count FROM public.students GROUP BY department
), candidate AS (
  SELECT
    h.id AS hod_id,
    h.department AS profile_department,
    sd.department AS candidate_department,
    sd.student_count AS candidate_student_count
  FROM hods h
  LEFT JOIN students_by_dept sbd ON sbd.department = h.department
  LEFT JOIN LATERAL (
    SELECT s.department, count(*) AS student_count
    FROM public.students s
    WHERE s.department ILIKE ('%' || h.department || '%')
    GROUP BY s.department
    ORDER BY student_count DESC
    LIMIT 1
  ) sd ON true
  WHERE (coalesce(sbd.student_count,0) > 0) OR sd.department IS NOT NULL
)
INSERT INTO public.department_admins (department, staff_id)
SELECT
  COALESCE(sbd.department, c.candidate_department) AS department_to_assign,
  h.id
FROM (
  SELECT id, email, department FROM public.profiles WHERE role = 'hod' AND department IS NOT NULL
  ) h
LEFT JOIN (
  SELECT department, count(*) AS student_count FROM public.students GROUP BY department
  ) sbd ON sbd.department = h.department
LEFT JOIN LATERAL (
  SELECT s.department AS candidate_department
  FROM public.students s
  WHERE s.department ILIKE ('%' || h.department || '%')
  GROUP BY s.department
  ORDER BY count(*) DESC
  LIMIT 1
 ) c ON true
WHERE NOT EXISTS (SELECT 1 FROM public.department_admins da WHERE da.staff_id = h.id)
  AND (coalesce(sbd.student_count,0) > 0 OR c.candidate_department IS NOT NULL)
ON CONFLICT (department) DO UPDATE SET staff_id = EXCLUDED.staff_id;

-- 5) Verify inserts
SELECT * FROM public.department_admins ORDER BY department;
