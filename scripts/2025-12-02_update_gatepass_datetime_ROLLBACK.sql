-- ROLLBACK SCRIPT for 2025-12-02_update_gatepass_datetime.sql
-- Use this if you need to revert the migration

-- Step 1: Add back the old columns
ALTER TABLE public.gatepass_applications
ADD COLUMN IF NOT EXISTS from_date_old date,
ADD COLUMN IF NOT EXISTS to_date_old date,
ADD COLUMN IF NOT EXISTS subject text;

-- Step 2: Migrate data back from timestamptz to date
UPDATE public.gatepass_applications
SET 
  from_date_old = from_date::date,
  to_date_old = to_date::date,
  subject = reason
WHERE from_date_old IS NULL OR to_date_old IS NULL;

-- Step 3: Drop the timestamptz columns
ALTER TABLE public.gatepass_applications
DROP COLUMN IF EXISTS from_date,
DROP COLUMN IF EXISTS to_date,
DROP COLUMN IF EXISTS from_time,
DROP COLUMN IF EXISTS to_time;

-- Step 4: Rename old columns back
ALTER TABLE public.gatepass_applications
RENAME COLUMN from_date_old TO from_date;

ALTER TABLE public.gatepass_applications
RENAME COLUMN to_date_old TO to_date;

-- Step 5: Restore NOT NULL constraints
ALTER TABLE public.gatepass_applications
ALTER COLUMN from_date SET NOT NULL,
ALTER COLUMN to_date SET NOT NULL,
ALTER COLUMN subject SET NOT NULL;
