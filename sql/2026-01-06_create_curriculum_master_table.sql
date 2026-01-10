-- Migration: create curriculum_master table
-- Purpose: store curriculum master rows used by IQAC Master view

-- Ensure pgcrypto (gen_random_uuid) is available in your Postgres/Supabase
CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS public.curriculum_master (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sem text,
  group_name text,
  course text,
  "class" text,
  cat text,
  l integer,
  t integer,
  p integer,
  s integer,
  c numeric,
  int_marks integer,
  ext_marks integer,
  ttl integer,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Enable Row Level Security
ALTER TABLE public.curriculum_master ENABLE ROW LEVEL SECURITY;

-- Policies: allow access to admin users OR hod users whose department is IQAC
-- Uses auth.uid() compared to `profiles.id`.

-- SELECT
CREATE POLICY "allow_admins_or_iqac_hod_select" ON public.curriculum_master
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid()
        AND (
          p.role = 'admin'
          OR (p.role = 'hod' AND upper(coalesce(p.department, '')) = 'IQAC')
        )
    )
  );

-- INSERT
CREATE POLICY "allow_admins_or_iqac_hod_insert" ON public.curriculum_master
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid()
        AND (
          p.role = 'admin'
          OR (p.role = 'hod' AND upper(coalesce(p.department, '')) = 'IQAC')
        )
    )
  );

-- UPDATE
CREATE POLICY "allow_admins_or_iqac_hod_update" ON public.curriculum_master
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid()
        AND (
          p.role = 'admin'
          OR (p.role = 'hod' AND upper(coalesce(p.department, '')) = 'IQAC')
        )
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid()
        AND (
          p.role = 'admin'
          OR (p.role = 'hod' AND upper(coalesce(p.department, '')) = 'IQAC')
        )
    )
  );

-- DELETE
CREATE POLICY "allow_admins_or_iqac_hod_delete" ON public.curriculum_master
  FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid()
        AND (
          p.role = 'admin'
          OR (p.role = 'hod' AND upper(coalesce(p.department, '')) = 'IQAC')
        )
    )
  );

-- Helpful indexes
CREATE INDEX IF NOT EXISTS idx_curriculum_master_sem ON public.curriculum_master(sem);
CREATE INDEX IF NOT EXISTS idx_curriculum_master_group ON public.curriculum_master(group_name);

-- Notes:
-- 1) Types chosen as sensible defaults; adjust types (e.g., course -> uuid) as needed.
-- 2) Apply this migration in Supabase SQL editor or your migration runner.
