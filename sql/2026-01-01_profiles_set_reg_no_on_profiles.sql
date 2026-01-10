-- Ensure profiles.reg_no is populated automatically when a profile is created/updated
-- Tries to source reg_no from `students.reg_no` (if a student row exists)
-- or from `staff.staff_id` (if a staff row exists).

CREATE OR REPLACE FUNCTION set_profiles_reg_no_from_related() RETURNS trigger AS $$
BEGIN
  -- Only act when reg_no is not explicitly provided
  IF (NEW.reg_no IS NOT NULL AND NEW.reg_no <> '') THEN
    RETURN NEW;
  END IF;

  -- Try students table first
  IF EXISTS (SELECT 1 FROM students s WHERE s.id = NEW.id AND s.reg_no IS NOT NULL) THEN
    UPDATE profiles SET reg_no = (SELECT s.reg_no FROM students s WHERE s.id = NEW.id) WHERE id = NEW.id;
    RETURN NEW;
  END IF;

  -- Next try staff table
  IF EXISTS (SELECT 1 FROM staff st WHERE st.id = NEW.id AND st.staff_id IS NOT NULL) THEN
    UPDATE profiles SET reg_no = (SELECT st.staff_id FROM staff st WHERE st.id = NEW.id) WHERE id = NEW.id;
    RETURN NEW;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create trigger only when reg_no is NULL on insert/update; prevents recursion
DROP TRIGGER IF EXISTS trg_set_profiles_reg_no_on_profiles ON profiles;
CREATE TRIGGER trg_set_profiles_reg_no_on_profiles
AFTER INSERT OR UPDATE ON profiles
FOR EACH ROW
WHEN (NEW.reg_no IS NULL OR NEW.reg_no = '')
EXECUTE FUNCTION set_profiles_reg_no_from_related();

-- Notes:
-- - Run this migration as a privileged user because the function is SECURITY DEFINER and it updates other tables.
-- - This trigger complements the existing sync triggers on `students` and `staff` which update profiles when those tables change.
