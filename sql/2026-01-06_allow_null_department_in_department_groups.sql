-- Migration: allow department_id to be NULL in department_groups
BEGIN;

ALTER TABLE IF EXISTS public.department_groups
  ALTER COLUMN department_id DROP NOT NULL;

-- department_id remains a FK but can be NULL for groups without departments
COMMIT;
