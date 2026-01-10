-- College Permission Management System - Database Setup
-- Run this SQL in your Supabase SQL Editor to set up the database schema

-- Create profiles table
-- NOTE: `id` is a UUID primary key. To allow admin-created profiles from the client
-- (without creating an auth.user first) we generate an id by default using gen_random_uuid().
-- If you want profiles to be tied to Supabase auth users, create auth users first and then
-- set the profile.id to the auth.user id (or remove this default).
CREATE TABLE IF NOT EXISTS profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text UNIQUE NOT NULL,
  role text NOT NULL CHECK (role IN ('student', 'staff', 'ahod', 'hod', 'admin', 'ps', 'principal')),
  name text NOT NULL,
  dob date,
  department text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Create students table
CREATE TABLE IF NOT EXISTS students (
  id uuid PRIMARY KEY REFERENCES profiles ON DELETE CASCADE,
  reg_no text UNIQUE NOT NULL,
  roll_no text UNIQUE NOT NULL,
  year integer NOT NULL CHECK (year BETWEEN 1 AND 4),
  section text NOT NULL,
  mentor_id uuid REFERENCES profiles,
  advisor_id uuid REFERENCES profiles,
  ahod_id uuid REFERENCES profiles,
  hod_id uuid REFERENCES profiles
);

-- Create staff table
CREATE TABLE IF NOT EXISTS staff (
  id uuid PRIMARY KEY REFERENCES profiles ON DELETE CASCADE,
  staff_id text UNIQUE NOT NULL,
  staff_role text NOT NULL CHECK (staff_role IN ('mentor', 'advisor', 'lecturer', 'hod', 'ahod')),
  year integer CHECK (year BETWEEN 1 AND 4),
  section text,
  on_leave boolean DEFAULT false,
  ahod_id uuid REFERENCES profiles,
  hod_id uuid REFERENCES profiles
);

-- Create applications table
CREATE TABLE IF NOT EXISTS applications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id uuid NOT NULL REFERENCES students ON DELETE CASCADE,
  type text NOT NULL CHECK (type IN ('od', 'leave', 'gatepass', 'bonafide')),
  reason text NOT NULL,
  from_date date NOT NULL,
  to_date date NOT NULL,
  attachment_url text,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  current_approver_level text DEFAULT 'mentor' CHECK (current_approver_level IN ('mentor', 'advisor', 'ahod', 'hod', 'ps', 'completed')),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Create approvals table
CREATE TABLE IF NOT EXISTS approvals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  application_id uuid NOT NULL REFERENCES applications ON DELETE CASCADE,
  approver_id uuid NOT NULL REFERENCES profiles,
  approver_role text NOT NULL CHECK (approver_role IN ('mentor', 'advisor', 'ahod', 'hod', 'ps')),
  action text NOT NULL CHECK (action IN ('approved', 'rejected')),
  remarks text,
  created_at timestamptz DEFAULT now()
);

-- Create notices table
CREATE TABLE IF NOT EXISTS notices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  content text NOT NULL,
  created_by uuid REFERENCES profiles,
  created_at timestamptz DEFAULT now(),
  is_active boolean DEFAULT true
);

-- Enable RLS on all tables
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE students ENABLE ROW LEVEL SECURITY;
ALTER TABLE staff ENABLE ROW LEVEL SECURITY;
ALTER TABLE applications ENABLE ROW LEVEL SECURITY;
ALTER TABLE approvals ENABLE ROW LEVEL SECURITY;
ALTER TABLE notices ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist
DROP POLICY IF EXISTS "Users can view all profiles" ON profiles;
DROP POLICY IF EXISTS "Users can update own profile" ON profiles;
DROP POLICY IF EXISTS "Admins can insert profiles" ON profiles;
DROP POLICY IF EXISTS "Admins can update profiles" ON profiles;
DROP POLICY IF EXISTS "Admins can delete profiles" ON profiles;
DROP POLICY IF EXISTS "Students can view own data" ON students;
DROP POLICY IF EXISTS "HOD can update students mentor assignments" ON students;
DROP POLICY IF EXISTS "Staff can view all staff data" ON staff;
DROP POLICY IF EXISTS "Staff can update own data" ON staff;
DROP POLICY IF EXISTS "Students can view own applications" ON applications;
DROP POLICY IF EXISTS "Students can create own applications" ON applications;
DROP POLICY IF EXISTS "Students can update own pending applications" ON applications;
DROP POLICY IF EXISTS "Approvers can update applications" ON applications;
DROP POLICY IF EXISTS "Users can view approvals for their applications" ON approvals;
DROP POLICY IF EXISTS "Approvers can create approval records" ON approvals;
DROP POLICY IF EXISTS "Anyone can view active notices" ON notices;
DROP POLICY IF EXISTS "HOD and AHOD can create notices" ON notices;
DROP POLICY IF EXISTS "HOD and AHOD can update notices" ON notices;

-- Profiles policies
CREATE POLICY "Users can view all profiles"
  ON profiles FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Users can update own profile"
  ON profiles FOR UPDATE
  TO authenticated
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);

-- Allow admins to insert and manage profiles (admins are identified by having role='admin' in their profile)
CREATE POLICY "Admins can insert profiles"
  ON profiles FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
  );

CREATE POLICY "Admins can update profiles"
  ON profiles FOR UPDATE
  TO authenticated
  USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
  );

CREATE POLICY "Admins can delete profiles"
  ON profiles FOR DELETE
  TO authenticated
  USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
  );

-- Students policies
CREATE POLICY "Students can view own data"
  ON students FOR SELECT
  TO authenticated
  USING (
    id = auth.uid() OR
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('staff', 'ahod', 'hod', 'admin'))
  );

CREATE POLICY "HOD can update students mentor assignments"
  ON students FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid() 
      AND role IN ('hod', 'admin')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid() 
      AND role IN ('hod', 'admin')
    )
  );

-- Staff policies
CREATE POLICY "Staff can view all staff data"
  ON staff FOR SELECT
  TO authenticated
  USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('staff', 'ahod', 'hod', 'admin'))
  );

CREATE POLICY "Staff can update own data"
  ON staff FOR UPDATE
  TO authenticated
  USING (id = auth.uid())
  WITH CHECK (id = auth.uid());

-- Applications policies
CREATE POLICY "Students can view own applications"
  ON applications FOR SELECT
  TO authenticated
  USING (
    student_id = auth.uid() OR
    EXISTS (
      SELECT 1 FROM students s
      WHERE s.id = applications.student_id
      AND (s.mentor_id = auth.uid() OR s.advisor_id = auth.uid() OR s.ahod_id = auth.uid() OR s.hod_id = auth.uid())
    ) OR
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
  );

CREATE POLICY "Students can create own applications"
  ON applications FOR INSERT
  TO authenticated
  WITH CHECK (student_id = auth.uid());

CREATE POLICY "Students can update own pending applications"
  ON applications FOR UPDATE
  TO authenticated
  USING (student_id = auth.uid() AND status = 'pending')
  WITH CHECK (student_id = auth.uid());

CREATE POLICY "Approvers can update applications"
  ON applications FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM students s
      WHERE s.id = applications.student_id
      AND (s.mentor_id = auth.uid() OR s.advisor_id = auth.uid() OR s.ahod_id = auth.uid() OR s.hod_id = auth.uid())
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM students s
      WHERE s.id = applications.student_id
      AND (s.mentor_id = auth.uid() OR s.advisor_id = auth.uid() OR s.ahod_id = auth.uid() OR s.hod_id = auth.uid())
    )
  );

-- Approvals policies
CREATE POLICY "Users can view approvals for their applications"
  ON approvals FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM applications a
      WHERE a.id = approvals.application_id
      AND (
        a.student_id = auth.uid() OR
        EXISTS (
          SELECT 1 FROM students s
          WHERE s.id = a.student_id
          AND (s.mentor_id = auth.uid() OR s.advisor_id = auth.uid() OR s.ahod_id = auth.uid() OR s.hod_id = auth.uid())
        ) OR
        EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
      )
    )
  );

CREATE POLICY "Approvers can create approval records"
  ON approvals FOR INSERT
  TO authenticated
  WITH CHECK (approver_id = auth.uid());

-- Notices policies
CREATE POLICY "Anyone can view active notices"
  ON notices FOR SELECT
  USING (is_active = true);

CREATE POLICY "HOD and AHOD can create notices"
  ON notices FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('hod', 'ahod', 'admin'))
  );

CREATE POLICY "HOD and AHOD can update notices"
  ON notices FOR UPDATE
  TO authenticated
  USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('hod', 'ahod', 'admin'))
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('hod', 'ahod', 'admin'))
  );

-- Remove redundant policies added at the end of the file
-- The logic has been merged into the existing policies above.
DROP POLICY IF EXISTS "Allow admin to read all staff" ON staff;
DROP POLICY IF EXISTS "Allow staff to read their own data" ON staff;
DROP POLICY IF EXISTS "Allow admin to read all students" ON students;
DROP POLICY IF EXISTS "Allow students to read their own data" ON students;

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_applications_student_id ON applications(student_id);
CREATE INDEX IF NOT EXISTS idx_applications_status ON applications(status);
CREATE INDEX IF NOT EXISTS idx_applications_type ON applications(type);
CREATE INDEX IF NOT EXISTS idx_approvals_application_id ON approvals(application_id);
CREATE INDEX IF NOT EXISTS idx_students_mentor_id ON students(mentor_id);
CREATE INDEX IF NOT EXISTS idx_students_advisor_id ON students(advisor_id);
CREATE INDEX IF NOT EXISTS idx_students_ahod_id ON students(ahod_id);
CREATE INDEX IF NOT EXISTS idx_students_hod_id ON students(hod_id);

-- Create subjects table
CREATE TABLE IF NOT EXISTS subjects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  subject_code text,
  name text NOT NULL,
  staff_id uuid REFERENCES profiles,
  year integer NOT NULL CHECK (year BETWEEN 1 AND 6),
  section text NOT NULL,
  department text NOT NULL,
  subject_type text NOT NULL CHECK (subject_type IN ('core','elective')) DEFAULT 'core',
  credits integer DEFAULT 3 CHECK (credits >= 0),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE (subject_code, department, year, section)
);

-- Enable RLS and policies for subjects
ALTER TABLE subjects ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view subjects" ON subjects;
CREATE POLICY "Users can view subjects"
  ON subjects FOR SELECT
  TO authenticated
  USING (true);

DROP POLICY IF EXISTS "Admins can manage subjects" ON subjects;
CREATE POLICY "Admins can manage subjects"
  ON subjects FOR ALL
  TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'))
  WITH CHECK (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));

CREATE INDEX IF NOT EXISTS idx_subjects_department_year ON subjects(department, year);

-- If the subjects table existed before we added `section`, ensure the column exists and is populated.
ALTER TABLE subjects ADD COLUMN IF NOT EXISTS section text;
-- Backfill any existing rows to a default section 'A' so downstream UNIQUE/indexes can be created safely.
UPDATE subjects SET section = 'A' WHERE section IS NULL;
ALTER TABLE subjects ALTER COLUMN section SET DEFAULT 'A';
-- Make section NOT NULL now that we've backfilled; this will succeed if no NULLs remain.
ALTER TABLE subjects ALTER COLUMN section SET NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_subjects_unique ON subjects(subject_code, department, year, section);

INSERT INTO subjects (subject_code, name, staff_id, year, section, department, credits)
VALUES
  ('CS101', 'Introduction to Programming', (SELECT id FROM profiles WHERE role = 'staff' LIMIT 1), 1, 'A', 'CSE', 4),
  ('CS102', 'Data Structures', (SELECT id FROM profiles WHERE role = 'staff' OFFSET 1 LIMIT 1), 2, 'A', 'CSE', 4)
ON CONFLICT (subject_code, department, year, section) DO NOTHING;

-- Electives table: holds child elective-subjects that belong to a main elective
-- Electives table: holds sub-elective entries linked to a main elective (parent_subject_id).
-- Each subelective has its own `course_code`, a single assigned `staff_id` (common for that subelective),
-- credits, and is linked to a department and year. We no longer store section here.
CREATE TABLE IF NOT EXISTS electives (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  parent_subject_id uuid NOT NULL REFERENCES public.subjects(id) ON DELETE CASCADE,
  course_code text NOT NULL,
  staff_id uuid REFERENCES public.profiles,
  sub_name text NOT NULL,
  credits integer DEFAULT 0 CHECK (credits >= 0),
  department text NOT NULL,
  year integer NOT NULL CHECK (year BETWEEN 1 AND 6),
  created_at timestamptz DEFAULT now(),
  start timestamptz,
  stop timestamptz
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_electives_parent_course ON electives(parent_subject_id, course_code);

-- Migration shim: If a legacy unique constraint without `section` exists, drop it safely.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'subjects_subject_code_department_year_key'
      AND conrelid = 'public.subjects'::regclass
  ) THEN
    ALTER TABLE public.subjects DROP CONSTRAINT subjects_subject_code_department_year_key;
  END IF;
END
$$;

-- Create a small SECURITY DEFINER RPC function to resolve a staff_id to an email.
-- This allows client-side code to call `supabase.rpc('rpc_resolve_email_by_staff', { p_staff_id })`
-- without requiring the admin API to be running. The function is defined as
-- SECURITY DEFINER so it executes with the privileges of the function owner
-- (create this in Supabase SQL editor using a service-role account).
-- Create RPC to resolve staff_id -> email.
-- We drop any existing function and recreate it. Ensure this is run
-- with sufficient privileges (service role or Supabase SQL editor).
DROP FUNCTION IF EXISTS public.rpc_resolve_email_by_staff(text);

CREATE FUNCTION public.rpc_resolve_email_by_staff(p_staff_id text)
RETURNS text
LANGUAGE SQL
SECURITY DEFINER
AS $$
  SELECT p.email
  FROM public.staff s
  JOIN public.profiles p ON p.id = s.id
  WHERE s.staff_id = p_staff_id
  LIMIT 1;
$$;

GRANT EXECUTE ON FUNCTION public.rpc_resolve_email_by_staff(text) TO public;

-- Re-affirm the correct unique rule including section
CREATE UNIQUE INDEX IF NOT EXISTS idx_subjects_unique ON public.subjects(subject_code, department, year, section);

-- Insert sample notice (optional)
INSERT INTO notices (title, content, is_active)
VALUES
  ('Welcome to College Permission Management System', 'This is your central hub for managing all your permission applications including OD, Leave, Gatepass, and Bonafide certificates. Please login to access your dashboard.', true)
ON CONFLICT DO NOTHING;

-- Timetables: department/year/section grid for Mon–Fri and 7 periods
CREATE TABLE IF NOT EXISTS timetables (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  department text NOT NULL,
  year integer NOT NULL CHECK (year BETWEEN 1 AND 6),
  section text NOT NULL,
  day_of_week integer NOT NULL CHECK (day_of_week BETWEEN 1 AND 5),
  period integer NOT NULL CHECK (period BETWEEN 1 AND 7),
  subject_id uuid REFERENCES subjects(id) ON DELETE SET NULL,
  room text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE (department, year, section, day_of_week, period)
);

ALTER TABLE timetables ENABLE ROW LEVEL SECURITY;

-- ------------------------------
-- Schema changes requested by user:
-- 1) Remove `roll_number` from `staff` (if present)
-- 2) Add `designation` column to `staff`
-- 3) Backfill `hod_id` and `ahod_id` on `staff` based on the staff member's department
-- ------------------------------

-- 1) Drop roll_number if it exists (safe no-op if column absent)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'staff' AND column_name = 'roll_number'
  ) THEN
    ALTER TABLE public.staff DROP COLUMN roll_number;
  END IF;
END$$;

-- 2) Add designation column if missing
ALTER TABLE public.staff ADD COLUMN IF NOT EXISTS designation text;

-- 3) Backfill hod_id and ahod_id for each staff row using the profiles table.
--    This finds one profile with role='hod' (and role='ahod') that matches the
--    staff member's department and sets the staff.hod_id / staff.ahod_id accordingly.
--    If no matching HOD/AHOD exists for a department the columns will remain NULL.
DO $$
BEGIN
  -- Perform update in a single statement using a derived table to avoid
  -- repeated subselects per row.
  UPDATE public.staff s
  SET
    hod_id = vals.hod_id,
    ahod_id = vals.ahod_id
  FROM (
    SELECT st.id AS staff_id,
      (SELECT p.id FROM public.profiles p WHERE p.role = 'hod' AND p.department = prof.department LIMIT 1) AS hod_id,
      (SELECT p.id FROM public.profiles p WHERE p.role = 'ahod' AND p.department = prof.department LIMIT 1) AS ahod_id
    FROM public.staff st
    JOIN public.profiles prof ON prof.id = st.id
  ) AS vals
  WHERE s.id = vals.staff_id;
EXCEPTION WHEN others THEN
  RAISE NOTICE 'Failed to backfill staff hod/ahod mapping: %', SQLERRM;
END
$$;


DROP POLICY IF EXISTS "Users can view timetables" ON timetables;
CREATE POLICY "Users can view timetables"
  ON timetables FOR SELECT
  TO authenticated
  USING (true);

DROP POLICY IF EXISTS "Admins can manage timetables" ON timetables;
CREATE POLICY "Admins can manage timetables"
  ON timetables FOR ALL
  TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'))
  WITH CHECK (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));

CREATE INDEX IF NOT EXISTS idx_timetables_key ON timetables(department, year, section, day_of_week, period);

-- Staff timetables: per-staff schedule pointing to a class (year/section) within a department
CREATE TABLE IF NOT EXISTS staff_timetables (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  staff_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  department text NOT NULL,
  year integer NOT NULL CHECK (year BETWEEN 1 AND 6),
  section text NOT NULL,
  day_of_week integer NOT NULL CHECK (day_of_week BETWEEN 1 AND 5),
  period integer NOT NULL CHECK (period BETWEEN 1 AND 7),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE (staff_id, day_of_week, period)
);

ALTER TABLE staff_timetables ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view staff timetables" ON staff_timetables;
CREATE POLICY "Users can view staff timetables"
  ON staff_timetables FOR SELECT
  TO authenticated
  USING (true);

DROP POLICY IF EXISTS "Admins can manage staff timetables" ON staff_timetables;
CREATE POLICY "Admins can manage staff timetables"
  ON staff_timetables FOR ALL
  TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'))
  WITH CHECK (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));

CREATE INDEX IF NOT EXISTS idx_staff_timetables_key ON staff_timetables(staff_id, day_of_week, period);
