-- Fix RLS policies for unrestricted tables
-- Enable RLS and add proper policies for departments, department_leads, electives, and replacements tables

BEGIN;

-- Enable RLS on departments table
ALTER TABLE public.departments ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if any
DROP POLICY IF EXISTS "Users can view departments" ON public.departments;
DROP POLICY IF EXISTS "Admins can manage departments" ON public.departments;

-- Departments policies
CREATE POLICY "Users can view departments"
  ON public.departments FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Admins can manage departments"
  ON public.departments FOR ALL
  TO authenticated
  USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin'))
  WITH CHECK (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin'));

-- Enable RLS on department_leads table
ALTER TABLE public.department_leads ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if any
DROP POLICY IF EXISTS "Users can view department leads" ON public.department_leads;
DROP POLICY IF EXISTS "Admins can manage department leads" ON public.department_leads;

-- Department leads policies
CREATE POLICY "Users can view department leads"
  ON public.department_leads FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Admins can manage department leads"
  ON public.department_leads FOR ALL
  TO authenticated
  USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin'))
  WITH CHECK (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin'));

-- Enable RLS on electives table
ALTER TABLE public.electives ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if any
DROP POLICY IF EXISTS "Users can view electives" ON public.electives;
DROP POLICY IF EXISTS "Admins can manage electives" ON public.electives;

-- Electives policies
CREATE POLICY "Users can view electives"
  ON public.electives FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Admins can manage electives"
  ON public.electives FOR ALL
  TO authenticated
  USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin'))
  WITH CHECK (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin'));

-- Enable RLS on replacements table
ALTER TABLE public.replacements ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if any
DROP POLICY IF EXISTS "Users can view replacements" ON public.replacements;
DROP POLICY IF EXISTS "Department admins can manage replacements" ON public.replacements;

-- Replacements policies
CREATE POLICY "Users can view replacements"
  ON public.replacements FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Department admins can manage replacements"
  ON public.replacements FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid()
      AND (role = 'admin' OR is_department_admin = true)
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid()
      AND (role = 'admin' OR is_department_admin = true)
    )
  );

COMMIT;