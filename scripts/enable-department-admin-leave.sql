-- Migration: allow department admins to toggle staff on_leave status
-- Adds `is_department_admin` to profiles and creates an RPC to set staff leave

-- Add column to profiles (if missing)
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS is_department_admin boolean DEFAULT false;

-- Create RPC function to allow department admins to set on_leave for staff in their department.
-- This function performs its own authorization checks and runs as its owner (SECURITY DEFINER)
-- so that authenticated users cannot bypass checks but authorized department admins can update staff.
CREATE OR REPLACE FUNCTION public.set_staff_on_leave(target_staff uuid, new_status boolean)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  admin_dept text;
  staff_dept text;
BEGIN
  -- Ensure caller is a department admin and fetch their department
  SELECT department INTO admin_dept FROM public.profiles WHERE id = auth.uid();
  IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND is_department_admin = true) THEN
    RAISE EXCEPTION 'not_authorized';
  END IF;
  IF admin_dept IS NULL THEN
    RAISE EXCEPTION 'no_department_on_profile';
  END IF;

  -- Ensure target staff exists and is in same department
  SELECT department INTO staff_dept FROM public.profiles WHERE id = target_staff;
  IF staff_dept IS NULL OR staff_dept <> admin_dept THEN
    RAISE EXCEPTION 'target_not_in_department';
  END IF;

  -- Perform the update
  UPDATE public.staff SET on_leave = new_status WHERE id = target_staff;
END;
$$;

-- Allow authenticated users to call this RPC; the function itself enforces authorization.
GRANT EXECUTE ON FUNCTION public.set_staff_on_leave(uuid, boolean) TO authenticated;
