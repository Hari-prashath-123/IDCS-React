-- Add `class` column to curriculum_master
ALTER TABLE IF EXISTS public.curriculum_master
  ADD COLUMN IF NOT EXISTS "class" text;

CREATE INDEX IF NOT EXISTS idx_curriculum_master_class ON public.curriculum_master("class");
