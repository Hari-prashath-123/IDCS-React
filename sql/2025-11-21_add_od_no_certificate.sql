-- Migration: add no_certificate flag to od_applications
-- Created: 2025-11-21

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'od_applications' AND column_name = 'no_certificate'
  ) THEN
    ALTER TABLE public.od_applications ADD COLUMN no_certificate boolean DEFAULT false;
  END IF;
  -- Add index for quick lookup
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes WHERE schemaname = 'public' AND tablename = 'od_applications' AND indexname = 'idx_od_applications_no_certificate'
  ) THEN
    CREATE INDEX IF NOT EXISTS idx_od_applications_no_certificate ON public.od_applications(no_certificate);
  END IF;
END$$;
