-- Update profiles SELECT policy to allow HODs recorded in department_leads
-- to select profiles in their department (useful when HOD profile.department differs)

BEGIN;

ALTER TABLE IF EXISTS public.profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS hod_select_profiles ON public.profiles;
CREATE POLICY hod_select_profiles
  ON public.profiles
  FOR SELECT
  USING (
    id = auth.uid()
    OR (
      -- allow HOD/AHOD recorded in department_leads to view profiles for that department
      SELECT EXISTS (
        SELECT 1 FROM public.department_leads dl
        JOIN public.departments d ON dl.department_id = d.id
        WHERE (dl.hod_id = auth.uid() OR dl.ahod_id = auth.uid())
          AND UPPER(TRIM(d.name)) = UPPER(TRIM(public.profiles.department))
      )
    )
  );

COMMIT;

-- Quick test:
-- try selecting profiles as the HOD user (via Supabase SQL editor after logging in as that user)
