-- Check RLS policies on electives table that might block trigger updates
SELECT 
  schemaname,
  tablename,
  policyname,
  permissive,
  roles,
  cmd,
  qual,
  with_check
FROM pg_policies
WHERE tablename = 'electives';

-- Check if RLS is enabled
SELECT 
  schemaname,
  tablename,
  rowsecurity
FROM pg_tables
WHERE tablename = 'electives';

-- The trigger runs as the definer (postgres role), so it should bypass RLS
-- But let's check if there's a policy blocking UPDATE operations

-- Add SECURITY DEFINER to the trigger function to ensure it runs with superuser privileges
CREATE OR REPLACE FUNCTION update_elective_seats_filled()
RETURNS TRIGGER 
SECURITY DEFINER  -- This makes the function run with the privileges of the user who defined it
LANGUAGE plpgsql
AS $$
DECLARE
  v_parent_id UUID;
  v_year INTEGER;
  v_group TEXT;
  v_course_code TEXT;
BEGIN
  IF TG_OP = 'INSERT' THEN
    -- Only increment if the selection is locked
    IF NEW.is_locked = true THEN
      -- Get the parent_subject_id, year, group, and course_code from the locked elective
      SELECT parent_subject_id, year, "group", course_code INTO v_parent_id, v_year, v_group, v_course_code
      FROM electives
      WHERE id = NEW.elective_id;
      
      -- Update seats_filled for ALL electives with same parent, year, group, AND course_code
      UPDATE electives 
      SET seats_filled = COALESCE(seats_filled, 0) + 1
      WHERE parent_subject_id = v_parent_id 
        AND year = v_year
        AND "group" = v_group
        AND course_code = v_course_code;
    END IF;
    RETURN NEW;
    
  ELSIF TG_OP = 'DELETE' THEN
    -- Only decrement if the deleted selection was locked
    IF OLD.is_locked = true THEN
      -- Get the parent_subject_id, year, group, and course_code from the deleted elective
      SELECT parent_subject_id, year, "group", course_code INTO v_parent_id, v_year, v_group, v_course_code
      FROM electives
      WHERE id = OLD.elective_id;
      
      -- Update seats_filled for ALL electives with same parent, year, group, AND course_code
      UPDATE electives 
      SET seats_filled = GREATEST(COALESCE(seats_filled, 0) - 1, 0)
      WHERE parent_subject_id = v_parent_id 
        AND year = v_year
        AND "group" = v_group
        AND course_code = v_course_code;
    END IF;
    RETURN OLD;
    
  ELSIF TG_OP = 'UPDATE' THEN
    -- Handle various update scenarios
    
    -- Case 1: Locking a previously unlocked selection
    IF OLD.is_locked = false AND NEW.is_locked = true THEN
      -- Get the parent_subject_id, year, group, and course_code
      SELECT parent_subject_id, year, "group", course_code INTO v_parent_id, v_year, v_group, v_course_code
      FROM electives
      WHERE id = NEW.elective_id;
      
      -- Increment for ALL departments in same group with same course_code
      UPDATE electives 
      SET seats_filled = COALESCE(seats_filled, 0) + 1
      WHERE parent_subject_id = v_parent_id 
        AND year = v_year
        AND "group" = v_group
        AND course_code = v_course_code;
    END IF;
    
    -- Case 2: Unlocking a previously locked selection
    IF OLD.is_locked = true AND NEW.is_locked = false THEN
      -- Get the parent_subject_id, year, group, and course_code
      SELECT parent_subject_id, year, "group", course_code INTO v_parent_id, v_year, v_group, v_course_code
      FROM electives
      WHERE id = OLD.elective_id;
      
      -- Decrement for ALL departments in same group with same course_code
      UPDATE electives 
      SET seats_filled = GREATEST(COALESCE(seats_filled, 0) - 1, 0)
      WHERE parent_subject_id = v_parent_id 
        AND year = v_year
        AND "group" = v_group
        AND course_code = v_course_code;
    END IF;
    
    -- Case 3: Changing elective while locked
    IF OLD.elective_id != NEW.elective_id AND NEW.is_locked = true THEN
      -- Handle old elective
      IF OLD.is_locked = true THEN
        SELECT parent_subject_id, year, "group", course_code INTO v_parent_id, v_year, v_group, v_course_code
        FROM electives
        WHERE id = OLD.elective_id;
        
        UPDATE electives 
        SET seats_filled = GREATEST(COALESCE(seats_filled, 0) - 1, 0)
        WHERE parent_subject_id = v_parent_id 
          AND year = v_year
          AND "group" = v_group
          AND course_code = v_course_code;
      END IF;
      
      -- Handle new elective
      SELECT parent_subject_id, year, "group", course_code INTO v_parent_id, v_year, v_group, v_course_code
      FROM electives
      WHERE id = NEW.elective_id;
      
      UPDATE electives 
      SET seats_filled = COALESCE(seats_filled, 0) + 1
      WHERE parent_subject_id = v_parent_id 
        AND year = v_year
        AND "group" = v_group
        AND course_code = v_course_code;
    END IF;
    
    -- Case 4: Changing elective and unlocking
    IF OLD.elective_id != NEW.elective_id AND OLD.is_locked = true AND NEW.is_locked = false THEN
      SELECT parent_subject_id, year, "group", course_code INTO v_parent_id, v_year, v_group, v_course_code
      FROM electives
      WHERE id = OLD.elective_id;
      
      UPDATE electives 
      SET seats_filled = GREATEST(COALESCE(seats_filled, 0) - 1, 0)
      WHERE parent_subject_id = v_parent_id 
        AND year = v_year
        AND "group" = v_group
        AND course_code = v_course_code;
    END IF;
    
    RETURN NEW;
  END IF;
END;
$$;

COMMENT ON FUNCTION update_elective_seats_filled() IS 'Updates seats_filled across ALL departments in same group (CG/EG/MG) for the SAME sub-elective (course_code) when student locks selection. Runs with SECURITY DEFINER to bypass RLS.';
