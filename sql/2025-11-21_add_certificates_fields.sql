-- Migration: add missing certificate columns to match frontend form
-- Created: 2025-11-21

/*
  This migration adds optional columns that the frontend may send when
  inserting certificate rows. Columns are added with IF NOT EXISTS so
  re-running is safe.

  Columns added:
  - certificate_type: text (e.g. 'participation'|'award'|'winner')
  - event_college: text
  - exam_name: text
  - course_name: text
  - od_application_id: uuid (optional FK to od_applications.id)

  The od_application_id is nullable and has ON DELETE SET NULL to avoid
  cascade deletes removing certificates if an OD application is removed.
*/

DO $$
BEGIN
  -- certificate_type
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'certificates' AND column_name = 'certificate_type'
  ) THEN
    ALTER TABLE public.certificates ADD COLUMN certificate_type text;
  END IF;

  -- event_college
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'certificates' AND column_name = 'event_college'
  ) THEN
    ALTER TABLE public.certificates ADD COLUMN event_college text;
  END IF;

  -- exam_name
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'certificates' AND column_name = 'exam_name'
  ) THEN
    ALTER TABLE public.certificates ADD COLUMN exam_name text;
  END IF;

  -- course_name
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'certificates' AND column_name = 'course_name'
  ) THEN
    ALTER TABLE public.certificates ADD COLUMN course_name text;
  END IF;

  -- od_application_id (nullable FK)
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'certificates' AND column_name = 'od_application_id'
  ) THEN
    ALTER TABLE public.certificates ADD COLUMN od_application_id uuid;
    -- Add FK constraint if od_applications exists
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'od_applications') THEN
      BEGIN
        ALTER TABLE public.certificates
          ADD CONSTRAINT fk_certificates_od_application FOREIGN KEY (od_application_id)
            REFERENCES public.od_applications(id) ON DELETE SET NULL;
      EXCEPTION WHEN duplicate_object THEN
        -- constraint already exists in concurrent run, ignore
        NULL;
      END;
    END IF;
  END IF;

  -- Indexes to help queries
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes WHERE schemaname = 'public' AND tablename = 'certificates' AND indexname = 'idx_certificates_od_application_id'
  ) THEN
    CREATE INDEX IF NOT EXISTS idx_certificates_od_application_id ON public.certificates(od_application_id);
  END IF;

END$$;
