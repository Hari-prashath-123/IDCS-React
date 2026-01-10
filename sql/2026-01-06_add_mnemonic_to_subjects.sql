-- Add `mnemonic` column to subjects for generated short codes
ALTER TABLE IF EXISTS public.subjects ADD COLUMN IF NOT EXISTS mnemonic text;

-- Optional: index for quick lookup
CREATE INDEX IF NOT EXISTS idx_subjects_mnemonic ON public.subjects(mnemonic);
