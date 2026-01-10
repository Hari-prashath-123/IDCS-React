-- Remove a student from an elective (only IQAC HOD allowed)

CREATE OR REPLACE FUNCTION remove_student_elective_impl(
  p_student_elective_id UUID,
  p_admin_id UUID
)
RETURNS JSON
SECURITY DEFINER
LANGUAGE plpgsql
AS $$
DECLARE
  v_admin_role TEXT;
  v_admin_dept TEXT;
  v_elective_id UUID;
BEGIN
  -- Verify admin is IQAC HOD
  SELECT role, department INTO v_admin_role, v_admin_dept FROM profiles WHERE id = p_admin_id;
  IF NOT FOUND THEN
    RETURN json_build_object('success', false, 'error', 'admin profile not found');
  END IF;

  IF v_admin_role IS NULL OR v_admin_dept IS NULL OR v_admin_role <> 'hod' OR v_admin_dept <> 'IQAC' THEN
    RETURN json_build_object('success', false, 'error', 'unauthorized');
  END IF;

  -- Lock and fetch the student_elective row
  SELECT elective_id INTO v_elective_id
  FROM student_electives
  WHERE id = p_student_elective_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN json_build_object('success', false, 'error', 'student_elective row not found');
  END IF;

  -- Delete the student_elective row
  DELETE FROM student_electives WHERE id = p_student_elective_id;

  -- Recalculate seats_filled for the elective
  UPDATE electives
  SET seats_filled = (
    SELECT COUNT(*) FROM student_electives WHERE elective_id = v_elective_id AND is_locked = true
  )
  WHERE id = v_elective_id;

  RETURN json_build_object('success', true, 'message', 'Student removed from elective');
END;
$$;

-- Public wrapper matching canonical param order (student_elective_id, admin_id)
CREATE OR REPLACE FUNCTION remove_student_elective(
  p_student_elective_id UUID,
  p_admin_id UUID
)
RETURNS JSON
SECURITY DEFINER
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN remove_student_elective_impl(p_student_elective_id, p_admin_id);
END;
$$;

-- Wrapper accepting reversed param order (admin_id, student_elective_id) for some clients
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
GRANT EXECUTE ON FUNCTION remove_student_elective(UUID, UUID) TO authenticated;
