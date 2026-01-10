-- Populate profiles.reg_no from students.reg_no and staff.staff_id
-- Create triggers to keep profiles.reg_no in sync when students/staff change

-- 1) Populate from students (where students.id = profiles.id)
UPDATE profiles
SET reg_no = s.reg_no
FROM students s
WHERE profiles.id = s.id
  AND s.reg_no IS NOT NULL;

-- 2) Populate from staff (where staff.id = profiles.id)
-- staff.staff_id will be used for reg_no for staff members
UPDATE profiles
SET reg_no = st.staff_id
FROM staff st
WHERE profiles.id = st.id
  AND st.staff_id IS NOT NULL;

-- 3) Create function to update profiles.reg_no when students table changes
CREATE OR REPLACE FUNCTION sync_profiles_reg_no_from_students() RETURNS trigger AS $$
BEGIN
  IF (TG_OP = 'DELETE') THEN
    UPDATE profiles SET reg_no = NULL WHERE id = OLD.id;
    RETURN OLD;
  ELSE
    -- INSERT or UPDATE
    UPDATE profiles SET reg_no = NEW.reg_no WHERE id = NEW.id;
    RETURN NEW;
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_sync_profiles_reg_no_students ON students;
CREATE TRIGGER trg_sync_profiles_reg_no_students
AFTER INSERT OR UPDATE OR DELETE ON students
FOR EACH ROW EXECUTE FUNCTION sync_profiles_reg_no_from_students();

-- 4) Create function to update profiles.reg_no when staff table changes
CREATE OR REPLACE FUNCTION sync_profiles_reg_no_from_staff() RETURNS trigger AS $$
BEGIN
  IF (TG_OP = 'DELETE') THEN
    UPDATE profiles SET reg_no = NULL WHERE id = OLD.id;
    RETURN OLD;
  ELSE
    -- INSERT or UPDATE
    UPDATE profiles SET reg_no = NEW.staff_id WHERE id = NEW.id;
    RETURN NEW;
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_sync_profiles_reg_no_staff ON staff;
CREATE TRIGGER trg_sync_profiles_reg_no_staff
AFTER INSERT OR UPDATE OR DELETE ON staff
FOR EACH ROW EXECUTE FUNCTION sync_profiles_reg_no_from_staff();

-- Notes:
-- - Run this migration as a privileged user (e.g., in Supabase SQL editor or with a service role) because it creates SECURITY DEFINER functions.
-- - If your `students` or `staff` tables use different PK mappings, adapt the JOIN conditions accordingly.
