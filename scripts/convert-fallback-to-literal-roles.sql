-- Convert fallback roles (staff/admin) to literal 'ps' and 'principal'
-- Creates a backup of the affected profiles, updates the role constraint to include 'ps' and 'principal',
-- and updates the two profiles by email.
-- IMPORTANT: Take a DB snapshot before running in production.

BEGIN;

-- Backup affected profiles (timestamped)
CREATE TABLE IF NOT EXISTS public.profiles_backup_ps_principal AS
  SELECT * FROM public.profiles WHERE email IN ('ps@gmail.com','principal@gmail.com');

-- Drop existing constraint if present
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'profiles_role_check' AND conrelid = 'public.profiles'::regclass
  ) THEN
    ALTER TABLE public.profiles DROP CONSTRAINT profiles_role_check;
  END IF;
END $$;

-- Add expanded constraint including 'ps' and 'principal'
ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_role_check CHECK (role IN ('student','staff','ahod','hod','admin','ps','principal'));

-- Update the two profiles to the new literal roles
UPDATE public.profiles SET role = 'ps' WHERE email = 'ps@gmail.com';
UPDATE public.profiles SET role = 'principal' WHERE email = 'principal@gmail.com';

COMMIT;

-- Verification rows
SELECT id, email, role FROM public.profiles WHERE email IN ('ps@gmail.com','principal@gmail.com');
SELECT DISTINCT role FROM public.profiles ORDER BY role;
