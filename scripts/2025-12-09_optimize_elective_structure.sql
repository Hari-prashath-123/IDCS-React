-- ============================================================================
-- OPTIMIZE ELECTIVES TABLE STRUCTURE
-- Store one row per elective (not duplicated per department)
-- Use group column to determine applicable departments
-- ============================================================================

-- Step 1: Backup existing data
CREATE TABLE IF NOT EXISTS electives_backup_20251209_restructure AS 
SELECT * FROM electives;

-- Step 2: Make department column nullable (will be NULL for group-based electives)
ALTER TABLE electives 
ALTER COLUMN department DROP NOT NULL;

-- Step 3: Remove duplicate electives, keeping only one row per group/parent/year/course
-- Delete duplicates, keeping the first row for each unique combination
-- ONLY for electives that have a group assigned (CG, EG, MG, ALL)
DELETE FROM electives a
USING electives b
WHERE a.id > b.id
  AND a.parent_subject_id = b.parent_subject_id
  AND a.year = b.year
  AND a."group" = b."group"
  AND a.course_code = b.course_code
  AND a."group" IN ('CG', 'EG', 'MG', 'ALL'); -- Only touch grouped electives

-- Step 4: Set department to NULL for remaining grouped electives
-- Leave non-grouped electives (group IS NULL or NONE) untouched
UPDATE electives
SET department = NULL
WHERE "group" IN ('CG', 'EG', 'MG', 'ALL'); -- Only update grouped electives

-- Step 5: Recalculate seats_filled based on actual locked selections
-- Only for grouped electives
UPDATE electives e
SET seats_filled = (
  SELECT COUNT(*)
  FROM student_electives se
  WHERE se.elective_id = e.id
    AND se.is_locked = true
)
WHERE e."group" IN ('CG', 'EG', 'MG', 'ALL');

-- Step 6: Drop old constraints and indexes
ALTER TABLE electives 
DROP CONSTRAINT IF EXISTS electives_parent_subject_id_course_code_department_year_key;

ALTER TABLE electives 
DROP CONSTRAINT IF EXISTS idx_electives_parent_course_dept;

-- Step 7: Add new unique constraint (one elective per group/parent/year/course)
ALTER TABLE electives 
ADD CONSTRAINT unique_elective_per_group 
UNIQUE (parent_subject_id, course_code, "group", year);

-- Step 8: Update the seats counting trigger for optimized structure
-- Handle both grouped and non-grouped electives
CREATE OR REPLACE FUNCTION update_elective_seats_filled()
RETURNS TRIGGER
SECURITY DEFINER
LANGUAGE plpgsql
AS $$
DECLARE
  v_parent_id UUID;
  v_year INTEGER;
  v_group TEXT;
  v_course_code TEXT;
  v_department TEXT;
BEGIN
  IF TG_OP = 'INSERT' THEN
    -- Only increment if the selection is locked
    IF NEW.is_locked = true THEN
      -- Get the elective details
      SELECT parent_subject_id, year, "group", course_code, department
      INTO v_parent_id, v_year, v_group, v_course_code, v_department
      FROM electives
      WHERE id = NEW.elective_id;
      
      -- For grouped electives (CG/EG/MG/ALL), update single row (department is NULL)
      -- For non-grouped electives, update by department
      IF v_group IN ('CG', 'EG', 'MG', 'ALL') THEN
        UPDATE electives 
        SET seats_filled = COALESCE(seats_filled, 0) + 1
        WHERE parent_subject_id = v_parent_id 
          AND year = v_year
          AND "group" = v_group
          AND course_code = v_course_code;
      ELSE
        -- Non-grouped elective, update by department
        UPDATE electives 
        SET seats_filled = COALESCE(seats_filled, 0) + 1
        WHERE id = NEW.elective_id;
      END IF;
    END IF;
    RETURN NEW;
    
  ELSIF TG_OP = 'DELETE' THEN
    -- Only decrement if the deleted selection was locked
    IF OLD.is_locked = true THEN
      SELECT parent_subject_id, year, "group", course_code, department
      INTO v_parent_id, v_year, v_group, v_course_code, v_department
      FROM electives
      WHERE id = OLD.elective_id;
      
      IF v_group IN ('CG', 'EG', 'MG', 'ALL') THEN
        UPDATE electives 
        SET seats_filled = GREATEST(COALESCE(seats_filled, 0) - 1, 0)
        WHERE parent_subject_id = v_parent_id 
          AND year = v_year
          AND "group" = v_group
          AND course_code = v_course_code;
      ELSE
        UPDATE electives 
        SET seats_filled = GREATEST(COALESCE(seats_filled, 0) - 1, 0)
        WHERE id = OLD.elective_id;
      END IF;
    END IF;
    RETURN OLD;
    
  ELSIF TG_OP = 'UPDATE' THEN
    -- Case 1: Locking a previously unlocked selection
    IF OLD.is_locked = false AND NEW.is_locked = true THEN
      SELECT parent_subject_id, year, "group", course_code, department
      INTO v_parent_id, v_year, v_group, v_course_code, v_department
      FROM electives
      WHERE id = NEW.elective_id;
      
      IF v_group IN ('CG', 'EG', 'MG', 'ALL') THEN
        UPDATE electives 
        SET seats_filled = COALESCE(seats_filled, 0) + 1
        WHERE parent_subject_id = v_parent_id 
          AND year = v_year
          AND "group" = v_group
          AND course_code = v_course_code;
      ELSE
        UPDATE electives 
        SET seats_filled = COALESCE(seats_filled, 0) + 1
        WHERE id = NEW.elective_id;
      END IF;
    END IF;
    
    -- Case 2: Unlocking a previously locked selection
    IF OLD.is_locked = true AND NEW.is_locked = false THEN
      SELECT parent_subject_id, year, "group", course_code, department
      INTO v_parent_id, v_year, v_group, v_course_code, v_department
      FROM electives
      WHERE id = OLD.elective_id;
      
      IF v_group IN ('CG', 'EG', 'MG', 'ALL') THEN
        UPDATE electives 
        SET seats_filled = GREATEST(COALESCE(seats_filled, 0) - 1, 0)
        WHERE parent_subject_id = v_parent_id 
          AND year = v_year
          AND "group" = v_group
          AND course_code = v_course_code;
      ELSE
        UPDATE electives 
        SET seats_filled = GREATEST(COALESCE(seats_filled, 0) - 1, 0)
        WHERE id = OLD.elective_id;
      END IF;
    END IF;
    
    RETURN NEW;
  END IF;
END;
$$;

-- Recreate trigger
DROP TRIGGER IF EXISTS trigger_update_seats_filled ON student_electives;
CREATE TRIGGER trigger_update_seats_filled
  AFTER INSERT OR UPDATE OR DELETE ON student_electives
  FOR EACH ROW
  EXECUTE FUNCTION update_elective_seats_filled();

-- Step 9: Update the lock_student_elective RPC to work with optimized structure
-- Handle both grouped (department=NULL) and non-grouped (department specific) electives
CREATE OR REPLACE FUNCTION lock_student_elective(
  p_student_id UUID,
  p_elective_id UUID
)
RETURNS JSON
SECURITY DEFINER
LANGUAGE plpgsql
AS $$
DECLARE
  v_parent_id UUID;
  v_year INTEGER;
  v_group TEXT;
  v_course_code TEXT;
  v_seat_count INTEGER;
  v_seats_filled INTEGER;
  v_department TEXT;
BEGIN
  -- Get elective details with row lock to prevent concurrent modifications
  SELECT 
    parent_subject_id, 
    year, 
    "group", 
    course_code, 
    seat_count,
    seats_filled,
    department
  INTO v_parent_id, v_year, v_group, v_course_code, v_seat_count, v_seats_filled, v_department
  FROM electives
  WHERE id = p_elective_id
  FOR UPDATE; -- Row-level lock prevents concurrent access
  
  -- Lock related elective rows based on whether it's grouped or not
  IF v_group IN ('CG', 'EG', 'MG', 'ALL') THEN
    -- For grouped electives, lock by group
    PERFORM 1
    FROM electives
    WHERE parent_subject_id = v_parent_id 
      AND year = v_year
      AND "group" = v_group
      AND course_code = v_course_code
    FOR UPDATE;
  ELSE
    -- For non-grouped electives, already locked by the first SELECT
    NULL;
  END IF;
  
  -- Re-fetch the current seats_filled after acquiring lock
  SELECT seats_filled INTO v_seats_filled
  FROM electives
  WHERE id = p_elective_id;
  
  -- Check if student already has this selection locked
  IF EXISTS (
    SELECT 1 
    FROM student_electives
    WHERE student_id = p_student_id
      AND elective_id = p_elective_id
      AND is_locked = true
  ) THEN
    RETURN json_build_object(
      'success', true,
      'message', 'Selection is already locked.'
    );
  END IF;
  
  -- Check if seats are available (if seat_count is set)
  IF v_seat_count IS NOT NULL THEN
    -- Check if this is a new selection
    IF NOT EXISTS (
      SELECT 1 
      FROM student_electives
      WHERE student_id = p_student_id
        AND elective_id = p_elective_id
    ) THEN
      -- This is a new selection, check seat availability with latest count
      IF v_seats_filled >= v_seat_count THEN
        RETURN json_build_object(
          'success', false,
          'error', 'No seats available. This elective is full.'
        );
      END IF;
    END IF;
  END IF;
  
  -- Check if student already has a locked selection for this parent elective
  -- For grouped electives, check across the group; for non-grouped, check by department
  IF v_group IN ('CG', 'EG', 'MG', 'ALL') THEN
    IF EXISTS (
      SELECT 1 
      FROM student_electives se
      JOIN electives e ON se.elective_id = e.id
      WHERE se.student_id = p_student_id
        AND e.parent_subject_id = v_parent_id
        AND e.year = v_year
        AND e."group" = v_group
        AND se.is_locked = true
        AND se.elective_id != p_elective_id
    ) THEN
      RETURN json_build_object(
        'success', false,
        'error', 'You have already locked a different elective for this subject.'
      );
    END IF;
  ELSE
    -- For non-grouped, check by department
    IF EXISTS (
      SELECT 1 
      FROM student_electives se
      JOIN electives e ON se.elective_id = e.id
      WHERE se.student_id = p_student_id
        AND e.parent_subject_id = v_parent_id
        AND e.year = v_year
        AND e.department = v_department
        AND se.is_locked = true
        AND se.elective_id != p_elective_id
    ) THEN
      RETURN json_build_object(
        'success', false,
        'error', 'You have already locked a different elective for this subject.'
      );
    END IF;
  END IF;
  
  -- Insert or update the student's selection
  DECLARE
    v_already_exists BOOLEAN;
    v_already_locked BOOLEAN;
  BEGIN
    SELECT EXISTS(
      SELECT 1 FROM student_electives 
      WHERE student_id = p_student_id AND elective_id = p_elective_id
    ), COALESCE(
      (SELECT is_locked FROM student_electives 
       WHERE student_id = p_student_id AND elective_id = p_elective_id), 
      false
    ) INTO v_already_exists, v_already_locked;
    
    IF v_already_exists THEN
      -- Update existing selection to locked
      IF NOT v_already_locked THEN
        UPDATE student_electives
        SET is_locked = true, locked_at = NOW()
        WHERE student_id = p_student_id AND elective_id = p_elective_id;
        -- Trigger will handle seats_filled increment
      END IF;
    ELSE
      -- Insert new locked selection
      INSERT INTO student_electives (student_id, elective_id, is_locked, locked_at)
      VALUES (p_student_id, p_elective_id, true, NOW());
      -- Trigger will handle seats_filled increment
    END IF;
  END;
  
  RETURN json_build_object(
    'success', true,
    'message', 'Elective locked successfully.'
  );
END;
$$;

-- Grant permissions
GRANT EXECUTE ON FUNCTION lock_student_elective(UUID, UUID) TO authenticated;

-- Step 10: Add helpful comment
COMMENT ON COLUMN electives.department IS 'NULL for optimized storage - one row per group. Use group column to determine applicable departments via mapping: CG=[AI&DS,CSE,IT], EG=[ECE,EEE], MG=[ME,CIVIL], ALL=[all 7 depts]';

-- Step 11: Verification queries
SELECT 
  'Database optimization completed!' as status,
  'Before' as stage,
  COUNT(*) as elective_count
FROM electives_backup_20251209_restructure

UNION ALL

SELECT 
  'Database optimization completed!' as status,
  'After' as stage,
  COUNT(*) as elective_count
FROM electives;

-- Show current structure
SELECT 
  "group",
  year,
  COUNT(*) as elective_count,
  SUM(seats_filled) as total_filled,
  SUM(seat_count) as total_seats
FROM electives
GROUP BY "group", year
ORDER BY "group", year;

-- Show sample data
SELECT 
  sub_name,
  course_code,
  "group",
  department,
  year,
  seats_filled,
  seat_count,
  is_active
FROM electives
ORDER BY "group", year, sub_name
LIMIT 20;
