-- Timetables schema and policies (run in Supabase SQL Editor)

CREATE TABLE IF NOT EXISTS timetables (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  department text NOT NULL,
  year integer NOT NULL CHECK (year BETWEEN 1 AND 6),
  section text NOT NULL,
  day_of_week integer NOT NULL CHECK (day_of_week BETWEEN 1 AND 5),
  period integer NOT NULL CHECK (period BETWEEN 1 AND 7),
  subject_id uuid REFERENCES subjects(id) ON DELETE SET NULL,
  semester integer DEFAULT 1,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE (department, year, section, day_of_week, period)
);

ALTER TABLE timetables ENABLE ROW LEVEL SECURITY;

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

CREATE INDEX IF NOT EXISTS idx_timetables_key ON timetables(department, year, section, semester, day_of_week, period);
