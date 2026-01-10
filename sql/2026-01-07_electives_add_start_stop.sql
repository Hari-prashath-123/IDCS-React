-- Migration: add start and stop timestamps to electives table
ALTER TABLE public.electives
  ADD COLUMN IF NOT EXISTS start timestamptz,
  ADD COLUMN IF NOT EXISTS stop timestamptz;

-- Optional: index for queries by start/stop
CREATE INDEX IF NOT EXISTS idx_electives_start ON public.electives(start);
CREATE INDEX IF NOT EXISTS idx_electives_stop ON public.electives(stop);
