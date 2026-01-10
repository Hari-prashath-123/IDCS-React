-- Atomic move of a student's elective to another elective
-- Locks involved rows, checks seat availability, and updates the student's row.

CREATE OR REPLACE FUNCTION move_student_elective(
  p_student_elective_id UUID,
  p_to_elective_id UUID,
  p_admin_id UUID DEFAULT NULL
)
RETURNS JSON
SECURITY DEFINER
LANGUAGE plpgsql
AS $$
DECLARE
  v_student_id UUID;
  v_old_elective_id UUID;
  v_old_is_locked BOOLEAN;
  v_new_seat_count INTEGER;
  v_new_seats_filled INTEGER;
BEGIN
  -- Lock the student_electives row
  SELECT student_id, elective_id, is_locked
  INTO v_student_id, v_old_elective_id, v_old_is_locked
  FROM student_electives
  WHERE id = p_student_elective_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN json_build_object('success', false, 'error', 'student_elective row not found');
  END IF;

  -- If no change, return
  IF v_old_elective_id = p_to_elective_id THEN
    RETURN json_build_object('success', true, 'message', 'No change');
  END IF;

  -- Lock new elective row to check seats
  SELECT seat_count, seats_filled
  INTO v_new_seat_count, v_new_seats_filled
  FROM electives
  WHERE id = p_to_elective_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN json_build_object('success', false, 'error', 'target elective not found');
  END IF;

  -- Check seat availability if seat_count is set
  IF v_new_seat_count IS NOT NULL THEN
    IF v_new_seats_filled >= v_new_seat_count THEN
      -- Target elective is full; increase seat_count by 1 to accommodate move
      UPDATE electives
      SET seat_count = COALESCE(seat_count, 0) + 1
      WHERE id = p_to_elective_id;

      -- Refresh the seat_count value
      SELECT seat_count, seats_filled
      INTO v_new_seat_count, v_new_seats_filled
      FROM electives
      WHERE id = p_to_elective_id
      FOR UPDATE;
    END IF;
  END IF;

  -- Perform the move: update student_electives row
  UPDATE student_electives
  SET elective_id = p_to_elective_id,
      admin_changed = true,
      admin_changed_at = NOW(),
      admin_changed_by = p_admin_id
  WHERE id = p_student_elective_id;
  -- Recalculate seats_filled for old and new electives to ensure accurate counts
  UPDATE electives
  SET seats_filled = (
    SELECT COUNT(*) FROM student_electives WHERE elective_id = v_old_elective_id AND is_locked = true
  )
  WHERE id = v_old_elective_id;

  UPDATE electives
  SET seats_filled = (
    SELECT COUNT(*) FROM student_electives WHERE elective_id = p_to_elective_id AND is_locked = true
  )
  WHERE id = p_to_elective_id;

  RETURN json_build_object('success', true, 'message', 'Student moved successfully');
END;
$$;

GRANT EXECUTE ON FUNCTION move_student_elective(UUID, UUID, UUID) TO authenticated;
