-- Migration: rename is_new boolean to new text in curriculum_master
DO $$
BEGIN
  -- Only run if table exists and column is present
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='curriculum_master' AND column_name='is_new') THEN
    -- rename column
    ALTER TABLE public.curriculum_master RENAME COLUMN is_new TO "new";
    -- convert boolean->text using Y/N
    ALTER TABLE public.curriculum_master ALTER COLUMN "new" TYPE text USING (CASE WHEN "new" = true THEN 'Y' ELSE 'N' END);
  END IF;
END$$;

-- Note: If your DB already has a `new` column or different data shape, inspect before running.
