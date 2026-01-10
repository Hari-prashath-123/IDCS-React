-- Create table to store student -> subelective assignments
CREATE TABLE IF NOT EXISTS student_electives (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id uuid NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
  elective_id uuid NOT NULL REFERENCES public.electives(id) ON DELETE CASCADE,
  created_at timestamptz DEFAULT now(),
  UNIQUE(student_id, elective_id)
);

-- RLS: allow students to view their own assignments and admins to manage
ALTER TABLE student_electives ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Students can view own student_electives" ON student_electives;
CREATE POLICY "Students can view own student_electives"
  ON student_electives FOR SELECT
  TO authenticated
  USING (student_id = auth.uid() OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));

DROP POLICY IF EXISTS "Admins can manage student_electives" ON student_electives;
CREATE POLICY "Admins can manage student_electives"
  ON student_electives FOR ALL
  TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'))
  WITH CHECK (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));

CREATE INDEX IF NOT EXISTS idx_student_electives_student ON student_electives(student_id);
CREATE INDEX IF NOT EXISTS idx_student_electives_elective ON student_electives(elective_id);

-- Allow staff assigned to an elective to view student selections for that elective
DROP POLICY IF EXISTS "Staff can view student_electives for assigned elective" ON student_electives;
CREATE POLICY "Staff can view student_electives for assigned elective"
  ON student_electives FOR SELECT
  TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.electives e WHERE e.id = student_electives.elective_id AND e.staff_id = auth.uid()
  ));
