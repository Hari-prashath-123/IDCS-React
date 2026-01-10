-- Migration: create departments and department_leads tables

BEGIN;

-- ensure gen_random_uuid is available
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- Departments: simple lookup table for departments
CREATE TABLE IF NOT EXISTS public.departments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text UNIQUE NOT NULL
);

-- Department leads: link a department to its HOD and AHOD (staff.user ids)
CREATE TABLE IF NOT EXISTS public.department_leads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  department_id uuid NOT NULL REFERENCES public.departments(id) ON DELETE CASCADE,
  hod_id uuid REFERENCES public.staff(id) ON DELETE SET NULL,
  ahod_id uuid REFERENCES public.staff(id) ON DELETE SET NULL,
  created_at timestamptz DEFAULT now()
);

-- Ensure one-to-one mapping per department
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.department_leads'::regclass
      AND contype = 'u'
      AND pg_get_constraintdef(oid) LIKE '%department_id%'
  ) THEN
    ALTER TABLE public.department_leads ADD CONSTRAINT uniq_department_leads_department UNIQUE (department_id);
  END IF;
EXCEPTION WHEN duplicate_object THEN
  -- ignore
END$$;

-- Grants: allow authenticated users to read departments; lead management may require elevated rights or RLS rules
GRANT SELECT ON public.departments TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.department_leads TO authenticated;

COMMIT;
