-- Trigger: assign_advisor_on_staff_update
-- Purpose: When a staff row is inserted/updated as an advisor with year+section,
-- assign matching class students (by year/section and profile.department) to that advisor.
-- Also clears advisor assignment when a staff stops being an advisor or their class no longer matches.

/*
Usage:
 - Apply this SQL in your Supabase project's SQL editor or via psql against the project's DB.
 - It will create a SECURITY DEFINER function and an AFTER trigger on the `staff` table.

Notes:
 - The trigger joins `students` -> `profiles` to ensure department matches the advisor's profile.department.
 - It updates students where advisor_id IS NULL or advisor_id was previously the old staff id (so reassignments work).
 - When an advisor loses their staff_role/year/section, the trigger clears advisor_id from students that no longer match.
*/

BEGIN;

CREATE OR REPLACE FUNCTION public.assign_advisor_on_staff_update()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  dept text;
BEGIN
  -- For updates where nothing changed relevant, exit early
  IF TG_OP = 'UPDATE' THEN
    IF COALESCE(OLD.staff_role,'') = COALESCE(NEW.staff_role,'')
       AND (OLD.year IS NOT DISTINCT FROM NEW.year)
       AND COALESCE(OLD.section,'') = COALESCE(NEW.section,'') THEN
      RETURN NEW;
    END IF;
  END IF;

  -- fetch department from profiles (normalized to lower-trim for robust comparison)
  SELECT lower(trim(coalesce(department, ''))) INTO dept FROM public.profiles WHERE id = NEW.id;

  -- If staff is now an advisor with year and section, assign matching students
  IF NEW.staff_role = 'advisor' AND NEW.year IS NOT NULL AND NEW.section IS NOT NULL THEN
    UPDATE public.students s
    SET advisor_id = NEW.id
    FROM public.profiles p
    WHERE s.id = p.id
      AND s.year = NEW.year
      AND upper(s.section) = upper(NEW.section)
      AND lower(trim(coalesce(p.department,''))) = dept
      AND (s.advisor_id IS NULL OR s.advisor_id = OLD.id);

  ELSE
    -- If staff is no longer advisor or their class changed/cleared, remove assignments for students
    -- that were assigned to this staff but no longer match the staff's class/department.
    UPDATE public.students s
    SET advisor_id = NULL
    FROM public.profiles p
    WHERE s.id = p.id
      AND s.advisor_id = NEW.id
      AND (
        NEW.staff_role IS DISTINCT FROM 'advisor'
        OR NEW.year IS NULL
        OR NEW.section IS NULL
        OR s.year IS DISTINCT FROM NEW.year
        OR upper(s.section) IS DISTINCT FROM upper(NEW.section)
        OR lower(trim(coalesce(p.department,''))) IS DISTINCT FROM dept
      );
  END IF;

  RETURN NEW;
END;
$$;

-- Create trigger (replace existing if present)
DROP TRIGGER IF EXISTS trg_assign_advisor_on_staff_update ON public.staff;
CREATE TRIGGER trg_assign_advisor_on_staff_update
  AFTER INSERT OR UPDATE OF staff_role, year, section ON public.staff
  FOR EACH ROW
  EXECUTE FUNCTION public.assign_advisor_on_staff_update();

COMMIT;

-- End of trigger SQL
