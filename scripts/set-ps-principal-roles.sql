-- Set literal roles 'ps' and 'principal' and assign them to the two users
-- WARNING: This file does NOT create backups. You asked to skip backups.
-- Run this in Supabase SQL editor or psql connected to your DB.

-- 1) Ensure the role constraint accepts the new values
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'profiles_role_check' AND conrelid = 'public.profiles'::regclass
  ) THEN
    ALTER TABLE public.profiles DROP CONSTRAINT profiles_role_check;
  END IF;

  ALTER TABLE public.profiles
    ADD CONSTRAINT profiles_role_check CHECK (
      role IN ('student','staff','ahod','hod','admin','ps','principal')
    );
END $$;

-- 2) Update the two users to the literal roles
-- Change the emails below if your accounts use different addresses.
UPDATE public.profiles SET role = 'ps' WHERE email = 'ps@gmail.com';
UPDATE public.profiles SET role = 'principal' WHERE email = 'principal@gmail.com';

-- Optional: if you prefer to reference by id instead of email, uncomment and set the IDs
-- UPDATE public.profiles SET role = 'ps' WHERE id = 'e664c5bb-ca4c-487e-9aa1-401da1f40872';
-- UPDATE public.profiles SET role = 'principal' WHERE id = 'b36d3ec3-0dfb-4566-9f5f-d3cc538f94d5';

-- 3) Verify results
SELECT id, email, role FROM public.profiles WHERE email IN ('ps@gmail.com','principal@gmail.com');
SELECT DISTINCT role FROM public.profiles ORDER BY role;
