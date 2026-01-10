-- Add from_date and to_date columns to leave_applications if they don't exist
ALTER TABLE IF EXISTS leave_applications
  ADD COLUMN IF NOT EXISTS from_date timestamptz;

ALTER TABLE IF EXISTS leave_applications
  ADD COLUMN IF NOT EXISTS to_date timestamptz;

-- Optionally add defaults/NOT NULL after verifying existing data
-- ALTER TABLE leave_applications
--   ALTER COLUMN from_date SET DEFAULT now(),
--   ALTER COLUMN to_date SET DEFAULT now();
-- ALTER TABLE leave_applications
--   ALTER COLUMN from_date SET NOT NULL,
--   ALTER COLUMN to_date SET NOT NULL;
