-- Migration: create department_groups table
-- Purpose: store one row per (group, department) mapping so a group applied
-- to multiple departments creates separate rows for each department.

-- Create table
CREATE TABLE IF NOT EXISTS public.department_groups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  department_id uuid NOT NULL REFERENCES public.departments(id) ON DELETE CASCADE,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Enable Row Level Security
ALTER TABLE public.department_groups ENABLE ROW LEVEL SECURITY;

-- Policy helper: allow only admins or IQAC HODs (case-insensitive) to access
-- Uses `auth.uid()` to correlate with `profiles.id`.

-- SELECT
CREATE POLICY "allow_admins_or_iqac_hod_select" ON public.department_groups
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
CREATE POLICY "allow_admins_or_iqac_hod_insert" ON public.department_groups
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
CREATE POLICY "allow_admins_or_iqac_hod_update" ON public.department_groups
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
CREATE POLICY "allow_admins_or_iqac_hod_delete" ON public.department_groups
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

-- Notes:
-- 1. This migration expects `public.departments` and `public.profiles` tables to exist.
-- 2. `gen_random_uuid()` requires the `pgcrypto` extension (available in Supabase).
-- 3. Apply this migration in Supabase SQL editor or your migration runner.
