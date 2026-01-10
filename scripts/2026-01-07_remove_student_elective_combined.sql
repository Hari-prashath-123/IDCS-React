-- Combined: create implementation and wrappers for remove_student_elective
-- Run this once to ensure all functions exist with correct signatures

BEGIN;

-- Ensure no conflicting signatures exist
DROP FUNCTION IF EXISTS public.remove_student_elective(uuid, uuid);
DROP FUNCTION IF EXISTS public.remove_student_elective_impl(uuid, uuid);

-- Implementation
CREATE OR REPLACE FUNCTION public.remove_student_elective_impl(
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
  SELECT role, department INTO v_admin_role, v_admin_dept FROM public.profiles WHERE id = p_admin_id;
  IF NOT FOUND THEN
    RETURN json_build_object('success', false, 'error', 'admin profile not found');
  END IF;

  IF v_admin_role IS NULL OR v_admin_dept IS NULL OR v_admin_role <> 'hod' OR v_admin_dept <> 'IQAC' THEN
    RETURN json_build_object('success', false, 'error', 'unauthorized');
  END IF;

  SELECT elective_id INTO v_elective_id
  FROM public.student_electives
  WHERE id = p_student_elective_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN json_build_object('success', false, 'error', 'student_elective row not found');
  END IF;

  DELETE FROM public.student_electives WHERE id = p_student_elective_id;

  UPDATE public.electives
  SET seats_filled = (
    SELECT COUNT(*) FROM public.student_electives WHERE elective_id = v_elective_id AND is_locked = true
  )
  WHERE id = v_elective_id;

  RETURN json_build_object('success', true, 'message', 'Student removed from elective');
END;
$$;

-- Wrapper 1: (student_elective_id, admin_id)
CREATE OR REPLACE FUNCTION public.remove_student_elective(
  p_student_elective_id UUID,
  p_admin_id UUID
)
RETURNS JSON
SECURITY DEFINER
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN public.remove_student_elective_impl(p_student_elective_id, p_admin_id);
END;
$$;

-- Wrapper 2: (admin_id, student_elective_id)
CREATE OR REPLACE FUNCTION public.remove_student_elective(
  p_admin_id UUID,
  p_student_elective_id UUID
)
RETURNS JSON
SECURITY DEFINER
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN public.remove_student_elective_impl(p_student_elective_id, p_admin_id);
END;
$$;

GRANT EXECUTE ON FUNCTION public.remove_student_elective(UUID, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.remove_student_elective_impl(UUID, UUID) TO authenticated;

COMMIT;
