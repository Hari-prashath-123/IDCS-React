-- Add is_manually_marked column to period_attendance table
ALTER TABLE period_attendance 
ADD COLUMN IF NOT EXISTS is_manually_marked boolean DEFAULT false;

-- Set existing records as not manually marked (they'll get updated from daily)
UPDATE period_attendance 
SET is_manually_marked = false 
WHERE is_manually_marked IS NULL;

-- Function to auto-populate period attendance from daily attendance
CREATE OR REPLACE FUNCTION sync_daily_to_period_attendance()
RETURNS TRIGGER AS $$
BEGIN
  -- When daily attendance is inserted or updated
  -- Update all period attendance records for that student on that date
  -- BUT only update those that were NOT manually marked
  
  UPDATE period_attendance
  SET 
    status = NEW.status,
    updated_at = now()
  WHERE 
    student_id = NEW.student_id 
    AND date = NEW.date
    AND (is_manually_marked = false OR is_manually_marked IS NULL); -- Only update auto-populated records
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Drop existing trigger if it exists
DROP TRIGGER IF EXISTS sync_daily_attendance_trigger ON daily_attendance;

-- Create trigger to sync daily attendance to period attendance
CREATE TRIGGER sync_daily_attendance_trigger
  AFTER INSERT OR UPDATE ON daily_attendance
  FOR EACH ROW
  EXECUTE FUNCTION sync_daily_to_period_attendance();
