-- Migration: Allow HODs to assign/remove department admins
-- Creates RPC functions to handle department admin operations with proper authorization

-- Function to assign a department admin
CREATE OR REPLACE FUNCTION public.assign_department_admin(
  target_staff_id uuid,
  target_department text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  caller_role text;
  caller_dept text;
  existing_admin_id uuid;
BEGIN
  -- Get caller's role and department
  SELECT role, department INTO caller_role, caller_dept
  FROM public.profiles
  WHERE id = auth.uid();

  -- Check authorization: caller must be HOD of the target department
  IF caller_role != 'hod' OR caller_dept != target_department THEN
    RAISE EXCEPTION 'not_authorized: Only HOD of the department can assign department admin';
  END IF;

  -- Find existing department admin for this department
  SELECT staff_id INTO existing_admin_id
  FROM public.department_admins
  WHERE department = target_department;

  -- If there's an existing admin, remove their flag
  IF existing_admin_id IS NOT NULL THEN
    UPDATE public.profiles
    SET is_department_admin = false
    WHERE id = existing_admin_id;
  END IF;

  -- Upsert the department_admins mapping
  INSERT INTO public.department_admins (department, staff_id)
  VALUES (target_department, target_staff_id)
  ON CONFLICT (department)
  DO UPDATE SET staff_id = target_staff_id;

  -- Set the new admin flag
  UPDATE public.profiles
  SET is_department_admin = true
  WHERE id = target_staff_id;
END;
$$;

-- Function to remove department admin
CREATE OR REPLACE FUNCTION public.remove_department_admin(
  target_department text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  caller_role text;
  caller_dept text;
  admin_id uuid;
BEGIN
  -- Get caller's role and department
  SELECT role, department INTO caller_role, caller_dept
  FROM public.profiles
  WHERE id = auth.uid();

  -- Check authorization: caller must be HOD of the target department
  IF caller_role != 'hod' OR caller_dept != target_department THEN
    RAISE EXCEPTION 'not_authorized: Only HOD of the department can remove department admin';
  END IF;

  -- Get the current admin's ID
  SELECT staff_id INTO admin_id
  FROM public.department_admins
  WHERE department = target_department;

  -- Delete the mapping
  DELETE FROM public.department_admins
  WHERE department = target_department;

  -- Remove the admin flag from the user
  IF admin_id IS NOT NULL THEN
    UPDATE public.profiles
    SET is_department_admin = false
    WHERE id = admin_id;
  END IF;
END;
$$;

-- Grant execute permissions
GRANT EXECUTE ON FUNCTION public.assign_department_admin(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.remove_department_admin(text) TO authenticated;

COMMENT ON FUNCTION public.assign_department_admin IS 'Allows HOD to assign a department admin (updates both tables)';
COMMENT ON FUNCTION public.remove_department_admin IS 'Allows HOD to remove department admin (updates both tables)';
