-- Staff timetables schema and policies (run in Supabase SQL Editor)

CREATE TABLE IF NOT EXISTS staff_timetables (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  staff_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  department text NOT NULL,
  year integer NOT NULL CHECK (year BETWEEN 1 AND 6),
  section text NOT NULL,
  semester integer DEFAULT 1,
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
