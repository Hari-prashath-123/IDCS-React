-- Migration: Add subject_id to staff_timetables so we record which subject
-- a staff is teaching for a given class slot. This helps when a staff has
-- multiple different subjects in the same class.

ALTER TABLE IF EXISTS public.staff_timetables
  ADD COLUMN IF NOT EXISTS subject_id uuid REFERENCES public.subjects(id) ON DELETE SET NULL;

-- Optional index to speed lookups by subject
CREATE INDEX IF NOT EXISTS idx_staff_timetables_subject_id ON public.staff_timetables(subject_id);

-- Ensure RLS continues to work; admins can manage as before.
-- No policy changes required if staff_timetables already had admin policies.

-- NOTE: Run this migration in your Supabase SQL editor (requires admin/service role).
