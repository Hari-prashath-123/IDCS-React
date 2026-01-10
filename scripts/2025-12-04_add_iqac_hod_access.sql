-- Grant IQAC HOD users the same access level as principals
-- HOD users from the IQAC department can view and manage all data

-- ============================================
-- UPDATE HELPER FUNCTION TO INCLUDE IQAC HOD
-- ============================================
CREATE OR REPLACE FUNCTION is_principal_or_ps()
RETURNS BOOLEAN AS $$
DECLARE
  user_role text;
  user_dept text;
BEGIN
  SELECT role, department INTO user_role, user_dept FROM profiles WHERE id = auth.uid();
  -- Allow principal, ps, or HOD from IQAC department
  RETURN user_role IN ('principal', 'ps') OR (user_role = 'hod' AND user_dept = 'IQAC');
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

-- Grant execute permission to authenticated users
GRANT EXECUTE ON FUNCTION is_principal_or_ps() TO authenticated;

-- No need to modify existing policies - they already use is_principal_or_ps()
-- The function change automatically applies to all policies that reference it
