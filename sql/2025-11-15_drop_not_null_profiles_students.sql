-- Migration: drop NOT NULL constraints to allow client-side saves
-- CAUTION: Relaxing NOT NULL constraints can hide data-quality issues. Review before running in production.

-- Profiles: make non-critical columns nullable so upserts from the client won't fail
ALTER TABLE public.profiles
  ALTER COLUMN email DROP NOT NULL,
  ALTER COLUMN role DROP NOT NULL,
  ALTER COLUMN department DROP NOT NULL;

-- Students: allow register/roll numbers to be nullable to avoid insert failures
ALTER TABLE public.students
  ALTER COLUMN reg_no DROP NOT NULL,
  ALTER COLUMN roll_no DROP NOT NULL;

-- Notes:
-- 1) Do NOT run this if your application or downstream logic requires these fields to be present.
-- 2) It's safer to add client-side validation and correct RLS policies; this migration is a pragmatic quick-fix.
-- 3) Run in Supabase SQL editor or with psql as a privileged user.
