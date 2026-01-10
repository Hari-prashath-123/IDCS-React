-- Daily attendance: Overall attendance for students (advisor marks)
CREATE TABLE IF NOT EXISTS daily_attendance (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  date date NOT NULL,
  status text NOT NULL CHECK (status IN ('present', 'absent', 'late', 'od', 'leave')),
  marked_by uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE (student_id, date)
);

-- Period attendance: Subject-wise attendance (staff marks per period)
CREATE TABLE IF NOT EXISTS period_attendance (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  subject_id uuid NOT NULL REFERENCES subjects(id) ON DELETE CASCADE,
  date date NOT NULL,
  period integer NOT NULL CHECK (period BETWEEN 1 AND 8),
  status text NOT NULL CHECK (status IN ('present', 'absent', 'late', 'od', 'leave')),
  marked_by uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  is_manually_marked boolean DEFAULT false, -- Track if manually marked by staff
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE (student_id, subject_id, date, period)
);

-- Indexes for faster queries
CREATE INDEX IF NOT EXISTS idx_daily_attendance_student ON daily_attendance(student_id, date);
CREATE INDEX IF NOT EXISTS idx_daily_attendance_date ON daily_attendance(date);
CREATE INDEX IF NOT EXISTS idx_period_attendance_student ON period_attendance(student_id, subject_id, date);
CREATE INDEX IF NOT EXISTS idx_period_attendance_date ON period_attendance(date);
CREATE INDEX IF NOT EXISTS idx_period_attendance_subject ON period_attendance(subject_id, date);

-- Enable RLS
ALTER TABLE daily_attendance ENABLE ROW LEVEL SECURITY;
ALTER TABLE period_attendance ENABLE ROW LEVEL SECURITY;

-- Policies for daily_attendance
DROP POLICY IF EXISTS "Users can view their own daily attendance" ON daily_attendance;
CREATE POLICY "Users can view their own daily attendance"
  ON daily_attendance FOR SELECT
  TO authenticated
  USING (
    student_id = auth.uid() OR
    marked_by = auth.uid() OR
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin', 'hod', 'ahod', 'staff'))
  );

DROP POLICY IF EXISTS "Staff can mark daily attendance" ON daily_attendance;
CREATE POLICY "Staff can mark daily attendance"
  ON daily_attendance FOR ALL
  TO authenticated
  USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin', 'staff'))
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin', 'staff'))
  );

-- Policies for period_attendance
DROP POLICY IF EXISTS "Users can view their own period attendance" ON period_attendance;
CREATE POLICY "Users can view their own period attendance"
  ON period_attendance FOR SELECT
  TO authenticated
  USING (
    student_id = auth.uid() OR
    marked_by = auth.uid() OR
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin', 'hod', 'ahod', 'staff'))
  );

DROP POLICY IF EXISTS "Staff can mark period attendance" ON period_attendance;
CREATE POLICY "Staff can mark period attendance"
  ON period_attendance FOR ALL
  TO authenticated
  USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin', 'staff'))
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin', 'staff'))
  );

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_attendance_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Triggers for updated_at
DROP TRIGGER IF EXISTS update_daily_attendance_updated_at ON daily_attendance;
CREATE TRIGGER update_daily_attendance_updated_at
  BEFORE UPDATE ON daily_attendance
  FOR EACH ROW
  EXECUTE FUNCTION update_attendance_updated_at();

DROP TRIGGER IF EXISTS update_period_attendance_updated_at ON period_attendance;
CREATE TRIGGER update_period_attendance_updated_at
  BEFORE UPDATE ON period_attendance
  FOR EACH ROW
  EXECUTE FUNCTION update_attendance_updated_at();

-- Function to auto-populate period attendance from daily attendance
CREATE OR REPLACE FUNCTION sync_daily_to_period_attendance()
RETURNS TRIGGER AS $$
BEGIN
  -- When daily attendance is inserted or updated
  -- Update all period attendance records for that student on that date
  -- BUT only update those that were NOT manually marked
  
  UPDATE period_attendance
  SET 
    status = NEW.status,
    updated_at = now()
  WHERE 
    student_id = NEW.student_id 
    AND date = NEW.date
    AND is_manually_marked = false; -- Only update auto-populated records
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to sync daily attendance to period attendance
DROP TRIGGER IF EXISTS sync_daily_attendance_trigger ON daily_attendance;
CREATE TRIGGER sync_daily_attendance_trigger
  AFTER INSERT OR UPDATE ON daily_attendance
  FOR EACH ROW
  EXECUTE FUNCTION sync_daily_to_period_attendance();

