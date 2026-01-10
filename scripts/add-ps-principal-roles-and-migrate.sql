-- Migration: Add 'ps' and 'principal' to profiles.role CHECK and migrate two users
-- WARNING: Take a DB snapshot before running in production.

DO $$
BEGIN
  -- Drop existing constraint if present
  IF EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'profiles_role_check' AND conrelid = 'public.profiles'::regclass
  ) THEN
    ALTER TABLE public.profiles DROP CONSTRAINT profiles_role_check;
    RAISE NOTICE 'Dropped existing profiles_role_check constraint.';
  ELSE
    RAISE NOTICE 'profiles_role_check not found, will add new constraint.';
  END IF;

  -- Add expanded constraint including 'ps' and 'principal'
  ALTER TABLE public.profiles
    ADD CONSTRAINT profiles_role_check CHECK (role IN ('student','staff','ahod','hod','admin','ps','principal'));
  RAISE NOTICE 'Added new profiles_role_check including ps and principal.';

  -- Migrate existing accounts by email (adjust emails if needed)
  -- Update the two users you created earlier. Change the emails below if different.
  IF EXISTS (SELECT 1 FROM public.profiles WHERE email = 'ps@gmail.com') THEN
    UPDATE public.profiles SET role = 'ps' WHERE email = 'ps@gmail.com';
    RAISE NOTICE 'Updated profile role to ps for email ps@gmail.com';
  ELSE
    RAISE NOTICE 'No profile found for ps@gmail.com; skipping update.';
  END IF;

  IF EXISTS (SELECT 1 FROM public.profiles WHERE email = 'principal@gmail.com') THEN
    UPDATE public.profiles SET role = 'principal' WHERE email = 'principal@gmail.com';
    RAISE NOTICE 'Updated profile role to principal for email principal@gmail.com';
  ELSE
    RAISE NOTICE 'No profile found for principal@gmail.com; skipping update.';
  END IF;

END $$;

-- Verification queries (returned as rows in SQL editors)
SELECT DISTINCT role FROM public.profiles ORDER BY role;
SELECT count(*) AS total_profiles, count(*) FILTER (WHERE role = 'ps') AS ps_count, count(*) FILTER (WHERE role = 'principal') AS principal_count FROM public.profiles;
