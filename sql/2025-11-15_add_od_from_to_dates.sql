-- Add from_date and to_date columns to od_applications if they don't exist
ALTER TABLE IF EXISTS od_applications
  ADD COLUMN IF NOT EXISTS from_date timestamptz;

ALTER TABLE IF EXISTS od_applications
  ADD COLUMN IF NOT EXISTS to_date timestamptz;

-- Optionally, you can add a NOT NULL constraint with a default value after verifying existing data.
-- Example (uncomment when ready):
-- ALTER TABLE od_applications
--   ALTER COLUMN from_date SET DEFAULT now(),
--   ALTER COLUMN to_date SET DEFAULT now();
-- ALTER TABLE od_applications
--   ALTER COLUMN from_date SET NOT NULL,
--   ALTER COLUMN to_date SET NOT NULL;
