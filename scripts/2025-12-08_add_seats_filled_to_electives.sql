-- Add seats_filled column to track current enrollment
ALTER TABLE electives 
ADD COLUMN IF NOT EXISTS seats_filled INTEGER DEFAULT 0 CHECK (seats_filled >= 0);

-- Add comment
COMMENT ON COLUMN electives.seats_filled IS 'Number of students currently enrolled in this elective';

-- Create function to update seats_filled count
CREATE OR REPLACE FUNCTION update_elective_seats_filled()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    -- Increment seats_filled
    UPDATE electives 
    SET seats_filled = COALESCE(seats_filled, 0) + 1
    WHERE id = NEW.elective_id;
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    -- Decrement seats_filled
    UPDATE electives 
    SET seats_filled = GREATEST(COALESCE(seats_filled, 0) - 1, 0)
    WHERE id = OLD.elective_id;
    RETURN OLD;
  ELSIF TG_OP = 'UPDATE' THEN
    -- Handle change from one elective to another
    IF OLD.elective_id != NEW.elective_id THEN
      -- Decrement old elective
      UPDATE electives 
      SET seats_filled = GREATEST(COALESCE(seats_filled, 0) - 1, 0)
      WHERE id = OLD.elective_id;
      -- Increment new elective
      UPDATE electives 
      SET seats_filled = COALESCE(seats_filled, 0) + 1
      WHERE id = NEW.elective_id;
    END IF;
    RETURN NEW;
  END IF;
END;
$$ LANGUAGE plpgsql;

-- Create trigger
DROP TRIGGER IF EXISTS trigger_update_seats_filled ON student_electives;
CREATE TRIGGER trigger_update_seats_filled
  AFTER INSERT OR UPDATE OR DELETE ON student_electives
  FOR EACH ROW
  EXECUTE FUNCTION update_elective_seats_filled();

COMMENT ON FUNCTION update_elective_seats_filled() IS 'Automatically updates seats_filled count when students select/change/remove electives';
