-- Add is_active column to electives table
-- This allows IQAC HOD to activate/deactivate electives

-- Add is_active column with default true
ALTER TABLE electives 
ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT true;

-- Create index for better query performance
CREATE INDEX IF NOT EXISTS idx_electives_is_active ON electives(is_active);

-- Set all existing electives to active
UPDATE electives 
SET is_active = true 
WHERE is_active IS NULL;

-- Add comment for documentation
COMMENT ON COLUMN electives.is_active IS 'Whether the elective is currently active and available for student selection';
