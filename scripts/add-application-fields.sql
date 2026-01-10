-- Add new columns to applications table for different application types
-- This supports the enhanced UI with type-specific fields

-- Add subject column (used by OD, Leave, Gatepass)
ALTER TABLE applications
ADD COLUMN IF NOT EXISTS subject text;

-- Add body column (used by OD, Leave for detailed explanation)
ALTER TABLE applications
ADD COLUMN IF NOT EXISTS body text;

-- Bonafide-specific fields
ALTER TABLE applications
ADD COLUMN IF NOT EXISTS purpose text;

ALTER TABLE applications
ADD COLUMN IF NOT EXISTS fathers_name text;

ALTER TABLE applications
ADD COLUMN IF NOT EXISTS branch text;

ALTER TABLE applications
ADD COLUMN IF NOT EXISTS community text;

ALTER TABLE applications
ADD COLUMN IF NOT EXISTS study_mode text CHECK (study_mode IS NULL OR study_mode IN ('day_scholar', 'hostel'));

ALTER TABLE applications
ADD COLUMN IF NOT EXISTS bus_option text CHECK (bus_option IS NULL OR bus_option IN ('college', 'out'));

ALTER TABLE applications
ADD COLUMN IF NOT EXISTS bus_fare numeric;

ALTER TABLE applications
ADD COLUMN IF NOT EXISTS funding text CHECK (funding IS NULL OR funding IN ('Gov', 'Management'));

ALTER TABLE applications
ADD COLUMN IF NOT EXISTS first_graduate text CHECK (first_graduate IS NULL OR first_graduate IN ('Yes', 'No'));

-- Add a flexible JSONB column for any additional metadata
ALTER TABLE applications
ADD COLUMN IF NOT EXISTS metadata jsonb DEFAULT '{}'::jsonb;

-- Add comments to document the purpose of new columns
COMMENT ON COLUMN applications.subject IS 'Subject line for OD, Leave, and Gatepass applications';
COMMENT ON COLUMN applications.body IS 'Detailed explanation/body for OD and Leave applications';
COMMENT ON COLUMN applications.purpose IS 'Purpose for Bonafide applications (e.g., Bank Loan, Scholarship)';
COMMENT ON COLUMN applications.fathers_name IS 'Father''s name for Bonafide applications';
COMMENT ON COLUMN applications.branch IS 'Branch/Department for Bonafide applications';
COMMENT ON COLUMN applications.community IS 'Community category for Bonafide applications';
COMMENT ON COLUMN applications.study_mode IS 'Day Scholar or Hostel for Bonafide applications';
COMMENT ON COLUMN applications.bus_option IS 'College Bus or Out Bus for Day Scholar Bonafide applications';
COMMENT ON COLUMN applications.bus_fare IS 'Bus fare amount if College Bus is selected';
COMMENT ON COLUMN applications.funding IS 'Gov or Management for Bonafide applications';
COMMENT ON COLUMN applications.first_graduate IS 'First Graduate status (Yes/No) for Gov-funded Bonafide applications';
COMMENT ON COLUMN applications.metadata IS 'Flexible JSON field for additional data (e.g., other_purpose, other_community)';
