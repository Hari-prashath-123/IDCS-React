-- Add row-level locking to prevent race conditions when students select electives
-- This ensures that when multiple students try to lock the same elective simultaneously,
-- only students up to the seat limit can successfully lock

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
  -- Require authenticated caller and ensure caller matches the student id
  IF auth.uid() IS NULL THEN
    RETURN json_build_object('success', false, 'error', 'Unauthenticated');
  END IF;

  IF auth.uid()::uuid <> p_student_id THEN
    -- Deny if caller is not the student. Admin/staff should use server-side endpoints.
    RETURN json_build_object('success', false, 'error', 'Unauthorized');
  END IF;

  -- Get elective details with row lock to prevent concurrent modifications
  SELECT 
    parent_subject_id, 
    year, 
    "group", 
    course_code, 
    seat_count,
    COALESCE(seats_filled, 0),
    department
  INTO v_parent_id, v_year, v_group, v_course_code, v_seat_count, v_seats_filled, v_department
  FROM electives
  WHERE id = p_elective_id
  FOR UPDATE; -- Row-level lock prevents concurrent access

  IF NOT FOUND THEN
    RETURN json_build_object('success', false, 'error', 'Elective not found');
  END IF;

  -- Lock all related elective rows to avoid race conditions across options
  PERFORM 1
  FROM electives
  WHERE parent_subject_id = v_parent_id 
    AND year = v_year
    AND "group" = v_group
    AND course_code = v_course_code
  FOR UPDATE;

  -- Refresh seat count after locks
  SELECT COALESCE(seats_filled,0) INTO v_seats_filled
  FROM electives
  WHERE id = p_elective_id;

  -- If student already has this selection locked, return success
  IF EXISTS (
    SELECT 1 
    FROM student_electives
    WHERE student_id = p_student_id
      AND elective_id = p_elective_id
      AND is_locked = true
  ) THEN
    RETURN json_build_object('success', true, 'message', 'Selection already locked');
  END IF;

  -- Seat availability: only check for new selections
  IF v_seat_count IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1 FROM student_electives
      WHERE student_id = p_student_id AND elective_id = p_elective_id
    ) THEN
      IF v_seats_filled >= v_seat_count THEN
        RETURN json_build_object('success', false, 'error', 'No seats available');
      END IF;
    END IF;
  END IF;

  -- Prevent locking multiple options for the same parent subject
  IF EXISTS (
    SELECT 1 
    FROM student_electives se
    JOIN electives e ON se.elective_id = e.id
    WHERE se.student_id = p_student_id
      AND e.parent_subject_id = v_parent_id
      AND e.year = v_year
      AND e."group" = v_group
      AND e.department = v_department
      AND se.is_locked = true
      AND se.elective_id != p_elective_id
  ) THEN
    RETURN json_build_object('success', false, 'error', 'Already locked a different elective for this subject');
  END IF;

  -- Insert or update the student's selection atomically
  IF EXISTS (SELECT 1 FROM student_electives WHERE student_id = p_student_id AND elective_id = p_elective_id) THEN
    -- Update existing selection to locked (if not already)
    UPDATE student_electives
    SET is_locked = true, locked_at = NOW()
    WHERE student_id = p_student_id AND elective_id = p_elective_id;
  ELSE
    -- Insert new locked selection
    INSERT INTO student_electives (student_id, elective_id, is_locked, locked_at)
    VALUES (p_student_id, p_elective_id, true, NOW());
  END IF;

  RETURN json_build_object('success', true, 'message', 'Elective locked successfully');
EXCEPTION
  WHEN others THEN
    -- Log error in server logs or monitoring (avoid leaking details to client)
    RETURN json_build_object('success', false, 'error', 'Internal error');
END;
$$;

-- Grant execute permission to authenticated users
GRANT EXECUTE ON FUNCTION lock_student_elective(UUID, UUID) TO authenticated;

-- Create a function to unlock elective (for admin use)
CREATE OR REPLACE FUNCTION unlock_student_elective(
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
  v_was_locked BOOLEAN;
BEGIN
  -- Get elective details
  SELECT 
    parent_subject_id, 
    year, 
    "group", 
    course_code
  INTO v_parent_id, v_year, v_group, v_course_code
  FROM electives
  WHERE id = p_elective_id;
  
  -- Check if selection was locked
  SELECT is_locked INTO v_was_locked
  FROM student_electives
  WHERE student_id = p_student_id
    AND elective_id = p_elective_id;
  
  IF NOT FOUND THEN
    RETURN json_build_object(
      'success', false,
      'error', 'Selection not found.'
    );
  END IF;
  
  -- Delete the selection
  DELETE FROM student_electives
  WHERE student_id = p_student_id
    AND elective_id = p_elective_id;
  
  -- Decrement seats_filled if it was locked
  IF v_was_locked THEN
    UPDATE electives 
    SET seats_filled = GREATEST(COALESCE(seats_filled, 0) - 1, 0)
    WHERE parent_subject_id = v_parent_id 
      AND year = v_year
      AND "group" = v_group
      AND course_code = v_course_code;
  END IF;
  
  RETURN json_build_object(
    'success', true,
    'message', 'Elective unlocked successfully.'
  );
END;
$$;

-- Grant execute permission
GRANT EXECUTE ON FUNCTION unlock_student_elective(UUID, UUID) TO authenticated;
