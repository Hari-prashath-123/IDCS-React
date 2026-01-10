-- RPC: get_elective_students
-- Returns students who selected an elective, only if caller is the staff assigned to that elective
DROP FUNCTION IF EXISTS public.get_elective_students(uuid);

CREATE FUNCTION public.get_elective_students(p_elective_id uuid)
RETURNS TABLE(
  student_id uuid,
  name text,
  reg_no text,
  year integer,
  section text,
  department text
)
LANGUAGE SQL
SECURITY DEFINER
AS $$
  SELECT s.id, p.name, s.reg_no, s.year, s.section, p.department
  FROM public.student_electives se
  JOIN public.electives e ON e.id = se.elective_id
  JOIN public.students s ON s.id = se.student_id
  JOIN public.profiles p ON p.id = s.id
  WHERE se.elective_id = p_elective_id
    AND e.staff_id = auth.uid();
$$;

GRANT EXECUTE ON FUNCTION public.get_elective_students(uuid) TO authenticated;
