-- Add reg_no column to profiles for student reg numbers and staff IDs
ALTER TABLE IF EXISTS profiles
ADD COLUMN IF NOT EXISTS reg_no text;

-- Optionally create an index for faster lookup by reg_no
CREATE INDEX IF NOT EXISTS idx_profiles_reg_no ON profiles (reg_no);
