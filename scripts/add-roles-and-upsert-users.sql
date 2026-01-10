-- Add literal roles 'ps' and 'principal' to profiles.role CHECK and upsert two users
-- NOTE: This file intentionally does not create backups (per request). Take a DB snapshot if needed.

-- 1) Ensure profiles.role constraint accepts the new roles
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

-- 2) Upsert the two profiles (by email). Change emails/names/departments as needed.
INSERT INTO public.profiles (id, email, role, name, dob, department, created_at, updated_at)
VALUES
  (gen_random_uuid(), 'ps@gmail.com', 'ps', 'PS', NULL, 'Administration', now(), now()),
  (gen_random_uuid(), 'principal@gmail.com', 'principal', 'Principal', NULL, 'Administration', now(), now())
ON CONFLICT (email) DO UPDATE
  SET role = EXCLUDED.role,
      name = EXCLUDED.name,
      department = EXCLUDED.department,
      updated_at = now();

-- Optional: If you prefer to update by id (for linking to auth.user ids), use these lines instead (uncomment and set ids):
-- UPDATE public.profiles SET role = 'ps' WHERE id = '<PS-UUID-HERE>';
-- UPDATE public.profiles SET role = 'principal' WHERE id = '<PRINCIPAL-UUID-HERE>';

-- 3) Verification: show the two profiles and distinct roles
SELECT id, email, role, name, department FROM public.profiles WHERE email IN ('ps@gmail.com','principal@gmail.com');
SELECT DISTINCT role FROM public.profiles ORDER BY role;
