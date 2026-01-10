-- Add tables for managing years and sections per department

-- Create years table
CREATE TABLE IF NOT EXISTS years (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  department text NOT NULL,
  year_number integer NOT NULL CHECK (year_number BETWEEN 1 AND 4),
  created_at timestamptz DEFAULT now(),
  UNIQUE(department, year_number)
);

-- Create sections table
CREATE TABLE IF NOT EXISTS sections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  department text NOT NULL,
  year_number integer NOT NULL CHECK (year_number BETWEEN 1 AND 4),
  section_name text NOT NULL,
  created_at timestamptz DEFAULT now(),
  UNIQUE(department, year_number, section_name)
);

-- Enable RLS
ALTER TABLE years ENABLE ROW LEVEL SECURITY;
ALTER TABLE sections ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist
DROP POLICY IF EXISTS "Anyone can view years" ON years;
DROP POLICY IF EXISTS "Admins can manage years" ON years;
DROP POLICY IF EXISTS "Anyone can view sections" ON sections;
DROP POLICY IF EXISTS "Admins can manage sections" ON sections;

-- Years policies
CREATE POLICY "Anyone can view years"
  ON years FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Admins can manage years"
  ON years FOR ALL
  TO authenticated
  USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
  );

-- Sections policies
CREATE POLICY "Anyone can view sections"
  ON sections FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Admins can manage sections"
  ON sections FOR ALL
  TO authenticated
  USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
  );

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_years_department ON years(department);
CREATE INDEX IF NOT EXISTS idx_sections_department ON sections(department);
CREATE INDEX IF NOT EXISTS idx_sections_year ON sections(department, year_number);
