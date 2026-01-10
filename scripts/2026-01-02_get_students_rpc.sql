-- Creates an RPC to return students with embedded profile JSON
-- Accepts an array of UUIDs to avoid very long GET query strings
CREATE OR REPLACE FUNCTION public.get_students_for_frontend(
  p_ids uuid[] DEFAULT NULL,
  p_year integer DEFAULT NULL,
  p_section text DEFAULT NULL
)
RETURNS TABLE (
  id uuid,
  roll_no text,
  reg_no text,
  year integer,
  section text,
  sem integer,
  profile jsonb
)
LANGUAGE sql STABLE
SECURITY DEFINER
AS $$
SELECT
  s.id,
  s.roll_no,
  s.reg_no,
  s.year,
  s.section,
  s.sem,
  CASE WHEN p.id IS NULL THEN NULL
       ELSE jsonb_build_object('id', p.id, 'name', p.name, 'email', p.email, 'department', p.department)
  END AS profile
FROM students s
LEFT JOIN profiles p ON p.id = s.id
WHERE (p_ids IS NULL OR s.id = ANY(p_ids))
  AND (p_year IS NULL OR s.year = p_year)
  AND (p_section IS NULL OR s.section = p_section)
ORDER BY s.year, s.section, s.roll_no;
$$;
