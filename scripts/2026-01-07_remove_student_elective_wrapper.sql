-- Wrapper to provide alternate parameter order for remove_student_elective
-- Some clients / schema caches expect (p_admin_id, p_student_elective_id)

CREATE OR REPLACE FUNCTION remove_student_elective(
  p_admin_id UUID,
  p_student_elective_id UUID
)
RETURNS JSON
SECURITY DEFINER
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN remove_student_elective_impl(p_student_elective_id, p_admin_id);
END;
$$;

GRANT EXECUTE ON FUNCTION remove_student_elective(UUID, UUID) TO authenticated;
