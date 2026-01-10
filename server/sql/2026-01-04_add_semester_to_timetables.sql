-- Migration: remove `room` from `timetables` and add `semester` to timetables and staff_timetables
-- Run this in Supabase SQL editor as DB admin

-- Drop room column if present
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns WHERE table_name = 'timetables' AND column_name = 'room'
  ) THEN
    ALTER TABLE public.timetables DROP COLUMN room;
  END IF;
END$$;

-- Add semester column to timetables (default 1)
ALTER TABLE IF EXISTS public.timetables
  ADD COLUMN IF NOT EXISTS semester integer DEFAULT 1;

-- Add semester column to staff_timetables (default 1)
ALTER TABLE IF EXISTS public.staff_timetables
  ADD COLUMN IF NOT EXISTS semester integer DEFAULT 1;

-- Add indexes to help queries by semester if needed
CREATE INDEX IF NOT EXISTS idx_timetables_semester ON public.timetables(department, year, section, semester, day_of_week, period);
CREATE INDEX IF NOT EXISTS idx_staff_timetables_semester ON public.staff_timetables(staff_id, semester, day_of_week, period);
