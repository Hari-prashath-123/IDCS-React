-- Fix the seats_filled trigger to only count LOCKED selections
-- This ensures seat counts are accurate and only locked selections are counted

CREATE OR REPLACE FUNCTION update_elective_seats_filled()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    -- Only increment if the selection is locked
    IF NEW.is_locked = true THEN
      UPDATE electives 
      SET seats_filled = COALESCE(seats_filled, 0) + 1
      WHERE id = NEW.elective_id;
    END IF;
    RETURN NEW;
    
  ELSIF TG_OP = 'DELETE' THEN
    -- Only decrement if the deleted selection was locked
    IF OLD.is_locked = true THEN
      UPDATE electives 
      SET seats_filled = GREATEST(COALESCE(seats_filled, 0) - 1, 0)
      WHERE id = OLD.elective_id;
    END IF;
    RETURN OLD;
    
  ELSIF TG_OP = 'UPDATE' THEN
    -- Handle various update scenarios
    
    -- Case 1: Locking a previously unlocked selection
    IF OLD.is_locked = false AND NEW.is_locked = true THEN
      UPDATE electives 
      SET seats_filled = COALESCE(seats_filled, 0) + 1
      WHERE id = NEW.elective_id;
    END IF;
    
    -- Case 2: Unlocking a previously locked selection (shouldn't happen but handle it)
    IF OLD.is_locked = true AND NEW.is_locked = false THEN
      UPDATE electives 
      SET seats_filled = GREATEST(COALESCE(seats_filled, 0) - 1, 0)
      WHERE id = OLD.elective_id;
    END IF;
    
    -- Case 3: Changing elective while locked
    IF OLD.elective_id != NEW.elective_id AND NEW.is_locked = true THEN
      -- Decrement old elective if it was locked
      IF OLD.is_locked = true THEN
        UPDATE electives 
        SET seats_filled = GREATEST(COALESCE(seats_filled, 0) - 1, 0)
        WHERE id = OLD.elective_id;
      END IF;
      -- Increment new elective
      UPDATE electives 
      SET seats_filled = COALESCE(seats_filled, 0) + 1
      WHERE id = NEW.elective_id;
    END IF;
    
    -- Case 4: Changing elective while unlocked (just update without counting)
    IF OLD.elective_id != NEW.elective_id AND OLD.is_locked = true AND NEW.is_locked = false THEN
      UPDATE electives 
      SET seats_filled = GREATEST(COALESCE(seats_filled, 0) - 1, 0)
      WHERE id = OLD.elective_id;
    END IF;
    
    RETURN NEW;
  END IF;
END;
$$ LANGUAGE plpgsql;

-- Recreate the trigger
DROP TRIGGER IF EXISTS trigger_update_seats_filled ON student_electives;
CREATE TRIGGER trigger_update_seats_filled
  AFTER INSERT OR UPDATE OR DELETE ON student_electives
  FOR EACH ROW
  EXECUTE FUNCTION update_elective_seats_filled();

-- Recalculate seats_filled for all electives based on current locked selections
UPDATE electives
SET seats_filled = (
  SELECT COUNT(*)
  FROM student_electives
  WHERE student_electives.elective_id = electives.id
    AND student_electives.is_locked = true
);

COMMENT ON FUNCTION update_elective_seats_filled() IS 'Automatically updates seats_filled count ONLY for locked selections';
