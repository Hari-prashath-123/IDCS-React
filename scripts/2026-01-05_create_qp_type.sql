-- Migration: create qp_type table and RLS policies for IQAC HOD
-- Created: 2026-01-05

-- 1) Create table
CREATE TABLE IF NOT EXISTS public.qp_type (
  id BIGSERIAL PRIMARY KEY,
  qp_type TEXT NOT NULL,
  part CHAR(1),
  type TEXT,
  marks INTEGER,
  quest INTEGER,
  split TEXT,
  total INTEGER,
  description TEXT,
  max_btl INTEGER,
  existing INTEGER,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- 2) Trigger to update `updated_at`
CREATE OR REPLACE FUNCTION public.update_qp_type_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS qp_type_updated_at ON public.qp_type;
CREATE TRIGGER qp_type_updated_at
  BEFORE UPDATE ON public.qp_type
  FOR EACH ROW
  EXECUTE FUNCTION public.update_qp_type_updated_at();

-- 3) Enable Row Level Security and add policies
ALTER TABLE public.qp_type ENABLE ROW LEVEL SECURITY;

-- Remove any existing policies to make migration idempotent
DROP POLICY IF EXISTS "IQAC HOD full select on qp_type" ON public.qp_type;
DROP POLICY IF EXISTS "IQAC HOD full insert on qp_type" ON public.qp_type;
DROP POLICY IF EXISTS "IQAC HOD full update on qp_type" ON public.qp_type;
DROP POLICY IF EXISTS "IQAC HOD full delete on qp_type" ON public.qp_type;

-- Allow IQAC HOD (profiles.role = 'iqac_hod') to SELECT
CREATE POLICY "IQAC HOD full select on qp_type"
  ON public.qp_type FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid()
      AND p.role = 'hod'
      AND p.department = 'IQAC'
    )
  );

-- Allow IQAC HOD to INSERT
CREATE POLICY "IQAC HOD full insert on qp_type"
  ON public.qp_type FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid()
      AND p.role = 'hod'
      AND p.department = 'IQAC'
    )
  );

-- Allow IQAC HOD to UPDATE
CREATE POLICY "IQAC HOD full update on qp_type"
  ON public.qp_type FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid()
      AND p.role = 'hod'
      AND p.department = 'IQAC'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid()
      AND p.role = 'hod'
      AND p.department = 'IQAC'
    )
  );

-- Allow IQAC HOD to DELETE
CREATE POLICY "IQAC HOD full delete on qp_type"
  ON public.qp_type FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid()
      AND p.role = 'hod'
      AND p.department = 'IQAC'
    )
  );

-- 4) Comments (optional)
COMMENT ON TABLE public.qp_type IS 'Question paper types managed by IQAC HOD';
COMMENT ON COLUMN public.qp_type.qp_type IS 'Identifier / name of QP type';
COMMENT ON COLUMN public.qp_type.part IS 'Single character representing part (A/B/C)';

-- End of migration
