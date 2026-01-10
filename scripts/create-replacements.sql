-- Create replacements table and RPC to apply a replacement for a target staff on a date

CREATE TABLE IF NOT EXISTS public.replacements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  target_staff uuid NOT NULL,
  replacement_staff uuid NOT NULL,
  for_date date NOT NULL,
  period integer DEFAULT 0,
  created_by uuid DEFAULT auth.uid(),
  created_at timestamptz DEFAULT now()
);

-- If the table existed from an older migration, ensure the `period` column
-- is present. `CREATE TABLE IF NOT EXISTS` won't add new columns to an
-- existing table, so add it explicitly if missing to avoid runtime errors
-- when later statements reference `replacements.period`.
ALTER TABLE public.replacements ADD COLUMN IF NOT EXISTS period integer DEFAULT 0;

-- Ensure a department admin can create a replacement for staff in their department
-- DROP existing function first to allow parameter renames (Postgres won't let
-- you change input parameter names with CREATE OR REPLACE). This avoids the
-- "cannot change name of input parameter" error. We drop by signature (types).
DROP FUNCTION IF EXISTS public.apply_replacement(uuid, uuid, date, integer);

CREATE OR REPLACE FUNCTION public.apply_replacement(p_target_staff uuid, p_replacement_staff uuid, p_for_date date, p_period integer DEFAULT 0)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  caller_profile RECORD;
BEGIN
  SELECT * INTO caller_profile FROM public.profiles WHERE id = auth.uid();
  IF caller_profile IS NULL OR NOT coalesce(caller_profile.is_department_admin, false) THEN
    RAISE EXCEPTION 'not_authorized';
  END IF;

  IF caller_profile.department IS NULL THEN
    RAISE EXCEPTION 'no_department_on_profile';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = p_target_staff AND p.department = caller_profile.department) THEN
    RAISE EXCEPTION 'target_not_in_department';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = p_replacement_staff AND p.department = caller_profile.department) THEN
    RAISE EXCEPTION 'replacement_not_in_department';
  END IF;

  -- Upsert a replacement for this date/target/period to avoid duplicates. We store
  -- period=0 to indicate a full-day replacement, otherwise a specific period.
  INSERT INTO public.replacements (target_staff, replacement_staff, for_date, period, created_by)
  VALUES (p_target_staff, p_replacement_staff, p_for_date, coalesce(p_period, 0), auth.uid())
  ON CONFLICT (target_staff, for_date, period) DO UPDATE SET replacement_staff = EXCLUDED.replacement_staff, created_by = auth.uid(), created_at = now();

END;
$$;

-- Create a unique index to prevent multiple replacements for same target/date
-- Note: PostgreSQL does not support IF NOT EXISTS on ADD CONSTRAINT, so use
-- CREATE UNIQUE INDEX IF NOT EXISTS which is supported and enforces uniqueness
-- Ensure uniqueness per target/date/period. period=0 means whole-day replacement.
-- If an older unique constraint/index exists that enforces uniqueness on
-- (target_staff, for_date) only (pre-period schema), drop it. That legacy
-- constraint will block inserting per-period replacements because it does
-- not include `period` in the uniqueness key and will raise a duplicate
-- key error when attempting to create a period-specific replacement.
ALTER TABLE IF EXISTS public.replacements DROP CONSTRAINT IF EXISTS replacements_target_date_unique_idx;
DROP INDEX IF EXISTS replacements_target_date_unique_idx;

-- Create a period-aware unique index so we can have one replacement per
-- (target_staff, for_date, period). period = 0 indicates a full-day
-- replacement; other values indicate a specific period.
CREATE UNIQUE INDEX IF NOT EXISTS replacements_target_date_period_unique_idx
  ON public.replacements (target_staff, for_date, period);

GRANT INSERT, SELECT ON public.replacements TO authenticated;
GRANT EXECUTE ON FUNCTION public.apply_replacement(uuid, uuid, date, integer) TO authenticated;
