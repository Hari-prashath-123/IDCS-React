    -- Add group column to electives table
-- This allows categorizing electives into Common Group (CG), Engineering Group (EG), or Management Group (MG)

ALTER TABLE electives 
ADD COLUMN IF NOT EXISTS "group" TEXT CHECK ("group" IN ('CG', 'EG', 'MG'));

-- Add index for better query performance
CREATE INDEX IF NOT EXISTS idx_electives_group ON electives("group");

-- Add comment
COMMENT ON COLUMN electives."group" IS 'Elective group classification: CG (Common Group), EG (Engineering Group), MG (Management Group)';

-- Update existing records to NULL (they can be updated later as needed)
-- You can optionally set a default value for existing records:
-- UPDATE electives SET "group" = 'CG' WHERE "group" IS NULL;
