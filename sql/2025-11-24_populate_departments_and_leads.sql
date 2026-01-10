-- Migration: populate departments and department_leads from existing profiles/staff

BEGIN;

-- ensure gen_random_uuid is available
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- 1) Insert distinct departments found in profiles
INSERT INTO public.departments (name)
SELECT DISTINCT trim(p.department) AS name
FROM public.profiles p
WHERE p.department IS NOT NULL
  AND trim(p.department) <> ''
  AND NOT EXISTS (
    SELECT 1 FROM public.departments d WHERE d.name = trim(p.department)
  );

-- 2) For each department, find HOD/AHOD profiles and map to staff.id (if staff row exists)
DO $$
DECLARE
  dep_rec RECORD;
  hod_profile_id uuid;
  ahod_profile_id uuid;
  hod_staff_id uuid;
  ahod_staff_id uuid;
BEGIN
  FOR dep_rec IN SELECT id, name FROM public.departments LOOP
    -- find profile ids for hod / ahod
    hod_profile_id := NULL;
    ahod_profile_id := NULL;
    hod_staff_id := NULL;
    ahod_staff_id := NULL;

    SELECT p.id INTO hod_profile_id FROM public.profiles p
      WHERE p.role = 'hod' AND p.department = dep_rec.name LIMIT 1;

    SELECT p.id INTO ahod_profile_id FROM public.profiles p
      WHERE p.role = 'ahod' AND p.department = dep_rec.name LIMIT 1;

    -- map to staff rows if present (staff.id typically equals profile.id)
    IF hod_profile_id IS NOT NULL THEN
      SELECT s.id INTO hod_staff_id FROM public.staff s WHERE s.id = hod_profile_id LIMIT 1;
    END IF;
    IF ahod_profile_id IS NOT NULL THEN
      SELECT s.id INTO ahod_staff_id FROM public.staff s WHERE s.id = ahod_profile_id LIMIT 1;
    END IF;

    -- upsert into department_leads
    INSERT INTO public.department_leads (department_id, hod_id, ahod_id)
    VALUES (dep_rec.id, hod_staff_id, ahod_staff_id)
    ON CONFLICT (department_id) DO UPDATE
      SET hod_id = EXCLUDED.hod_id,
          ahod_id = EXCLUDED.ahod_id;
  END LOOP;
END$$;

COMMIT;
