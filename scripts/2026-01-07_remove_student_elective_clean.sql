-- Clean creation: drop any conflicting remove_student_elective functions and create a single canonical one

BEGIN;

-- Drop any existing conflicting functions
DROP FUNCTION IF EXISTS public.remove_student_elective(uuid, uuid);
DROP FUNCTION IF EXISTS public.remove_student_elective_impl(uuid, uuid);

-- Create single canonical function with (p_student_elective_id, p_admin_id)
CREATE OR REPLACE FUNCTION public.remove_student_elective(
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
  SELECT role, department INTO v_admin_role, v_admin_dept FROM public.profiles WHERE id = p_admin_id;
  IF NOT FOUND THEN
    RETURN json_build_object('success', false, 'error', 'admin profile not found');
  END IF;

  IF v_admin_role IS NULL OR v_admin_dept IS NULL OR v_admin_role <> 'hod' OR v_admin_dept <> 'IQAC' THEN
    RETURN json_build_object('success', false, 'error', 'unauthorized');
  END IF;

  -- Lock and fetch the student_elective row
  SELECT elective_id INTO v_elective_id
  FROM public.student_electives
  WHERE id = p_student_elective_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN json_build_object('success', false, 'error', 'student_elective row not found');
  END IF;

  -- Delete the student_elective row
  DELETE FROM public.student_electives WHERE id = p_student_elective_id;

  -- Recalculate seats_filled for the elective
  UPDATE public.electives
  SET seats_filled = (
    SELECT COUNT(*) FROM public.student_electives WHERE elective_id = v_elective_id AND is_locked = true
  )
  WHERE id = v_elective_id;

  RETURN json_build_object('success', true, 'message', 'Student removed from elective');
END;
$$;

GRANT EXECUTE ON FUNCTION public.remove_student_elective(UUID, UUID) TO authenticated;

COMMIT;
