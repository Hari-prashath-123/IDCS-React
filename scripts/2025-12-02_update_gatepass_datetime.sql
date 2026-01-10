-- Migration: Update gatepass_applications to use datetime columns and remove subject
-- Date: 2025-12-02
-- Description: 
--   1. Change from_date and to_date from date to timestamptz
--   2. Remove subject column (reason column already stores the subject)
--   3. Add from_time and to_time columns for time tracking

-- Step 1: Add new timestamptz columns temporarily
ALTER TABLE public.gatepass_applications
ADD COLUMN IF NOT EXISTS from_datetime timestamptz,
ADD COLUMN IF NOT EXISTS to_datetime timestamptz,
ADD COLUMN IF NOT EXISTS from_time time,
ADD COLUMN IF NOT EXISTS to_time time;

-- Step 2: Migrate existing data from date columns to timestamptz columns
-- Combine date with a default time (00:00:00) for existing records
UPDATE public.gatepass_applications
SET 
  from_datetime = from_date::timestamptz,
  to_datetime = to_date::timestamptz
WHERE from_datetime IS NULL OR to_datetime IS NULL;

-- Step 3: Drop the old date columns
ALTER TABLE public.gatepass_applications
DROP COLUMN IF EXISTS from_date,
DROP COLUMN IF EXISTS to_date;

-- Step 4: Rename the new datetime columns to from_date and to_date
ALTER TABLE public.gatepass_applications
RENAME COLUMN from_datetime TO from_date;

ALTER TABLE public.gatepass_applications
RENAME COLUMN to_datetime TO to_date;

-- Step 5: Make the datetime columns NOT NULL (now that data is migrated)
ALTER TABLE public.gatepass_applications
ALTER COLUMN from_date SET NOT NULL,
ALTER COLUMN to_date SET NOT NULL;

-- Step 6: Remove the subject column as it's redundant with reason
ALTER TABLE public.gatepass_applications
DROP COLUMN IF EXISTS subject;

-- Step 7: Update the reason column to be more flexible if it was NOT NULL
-- (Keep it as is - the application code handles this)

COMMENT ON COLUMN public.gatepass_applications.from_date IS 'From date and time for the gatepass period';
COMMENT ON COLUMN public.gatepass_applications.to_date IS 'To date and time for the gatepass period';
COMMENT ON COLUMN public.gatepass_applications.from_time IS 'Optional: Separate from time component';
COMMENT ON COLUMN public.gatepass_applications.to_time IS 'Optional: Separate to time component';
COMMENT ON COLUMN public.gatepass_applications.out_time IS 'Actual gate out scan time';
COMMENT ON COLUMN public.gatepass_applications.in_time IS 'Actual gate in scan time';
