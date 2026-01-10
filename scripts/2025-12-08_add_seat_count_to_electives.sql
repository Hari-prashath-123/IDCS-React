-- Add seat_count column to electives table
-- This allows IQAC HOD to set maximum number of students for each elective

-- Add seat_count column with default null (unlimited seats)
ALTER TABLE electives 
ADD COLUMN IF NOT EXISTS seat_count INTEGER;

-- Add constraint to ensure seat_count is positive
ALTER TABLE electives
ADD CONSTRAINT seat_count_positive CHECK (seat_count IS NULL OR seat_count > 0);

-- Create index for better query performance
CREATE INDEX IF NOT EXISTS idx_electives_seat_count ON electives(seat_count);

-- Add comment for documentation
COMMENT ON COLUMN electives.seat_count IS 'Maximum number of students allowed to enroll in this elective. NULL means unlimited seats.';
