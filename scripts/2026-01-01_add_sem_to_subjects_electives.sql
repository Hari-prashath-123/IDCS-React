-- Add sem column to subjects and electives
-- Add nullable integer 'sem' (1..8). Backfill separately as needed.

ALTER TABLE public.subjects
  ADD COLUMN IF NOT EXISTS sem INTEGER CHECK (sem >= 1 AND sem <= 8);

COMMENT ON COLUMN public.subjects.sem IS 'Semester number (1..8). Nullable until backfill.';

ALTER TABLE public.electives
  ADD COLUMN IF NOT EXISTS sem INTEGER CHECK (sem >= 1 AND sem <= 8);

COMMENT ON COLUMN public.electives.sem IS 'Semester number (1..8). Nullable until backfill.';

-- Optional: create index on electives.sem for faster queries
CREATE INDEX IF NOT EXISTS idx_electives_sem ON public.electives(sem);

-- Optional: create index on subjects.sem
CREATE INDEX IF NOT EXISTS idx_subjects_sem ON public.subjects(sem);
