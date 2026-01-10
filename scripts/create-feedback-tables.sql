-- Create tables for feedback forms and responses
-- Run this in your Supabase SQL editor

CREATE TABLE IF NOT EXISTS feedback_forms (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  description text,
  created_by uuid NOT NULL,
  created_at timestamptz DEFAULT now(),
  active boolean DEFAULT true,
  closes_at timestamptz,
  -- staff options stored as array of objects: [{id: uuid|null, name: text}]
  staff_options jsonb DEFAULT '[]'::jsonb
);

-- Optional default staff selected by HOD for this form (single object {id, name})
ALTER TABLE feedback_forms
  ADD COLUMN IF NOT EXISTS default_staff jsonb DEFAULT null;

-- Track which students have submitted (array of uuid)
ALTER TABLE feedback_forms
  ADD COLUMN IF NOT EXISTS submitted_by jsonb DEFAULT '[]'::jsonb;
-- Targeting columns to limit which students a form is sent to
ALTER TABLE feedback_forms
  ADD COLUMN IF NOT EXISTS target_year int;
ALTER TABLE feedback_forms
  ADD COLUMN IF NOT EXISTS target_section text;
-- Optional: store selected subject as json {id, name}
ALTER TABLE feedback_forms
  ADD COLUMN IF NOT EXISTS target_subject jsonb DEFAULT null;

CREATE TABLE IF NOT EXISTS feedback_questions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  form_id uuid REFERENCES feedback_forms(id) ON DELETE CASCADE,
  question_text text NOT NULL,
  "order" int DEFAULT 0
);

CREATE TABLE IF NOT EXISTS feedback_responses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  form_id uuid REFERENCES feedback_forms(id) ON DELETE CASCADE,
  student_id uuid NOT NULL,
  staff_selected jsonb,
  rating int,
  comments text,
  answers jsonb DEFAULT '[]'::jsonb,
  created_at timestamptz DEFAULT now()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_feedback_forms_created_by ON feedback_forms(created_by);
CREATE INDEX IF NOT EXISTS idx_feedback_responses_form_id ON feedback_responses(form_id);
CREATE INDEX IF NOT EXISTS idx_feedback_responses_student_id ON feedback_responses(student_id);

-- Enable Row Level Security
ALTER TABLE feedback_forms ENABLE ROW LEVEL SECURITY;
ALTER TABLE feedback_questions ENABLE ROW LEVEL SECURITY;
ALTER TABLE feedback_responses ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if any
DROP POLICY IF EXISTS "HOD can create feedback forms" ON feedback_forms;
DROP POLICY IF EXISTS "HOD can view own feedback forms" ON feedback_forms;
DROP POLICY IF EXISTS "HOD can update own feedback forms" ON feedback_forms;
DROP POLICY IF EXISTS "HOD can delete own feedback forms" ON feedback_forms;
DROP POLICY IF EXISTS "Students can view active feedback forms" ON feedback_forms;
DROP POLICY IF EXISTS "HOD can manage feedback questions" ON feedback_questions;
DROP POLICY IF EXISTS "Students can view feedback questions" ON feedback_questions;
DROP POLICY IF EXISTS "Students can create feedback responses" ON feedback_responses;
DROP POLICY IF EXISTS "Students can view own feedback responses" ON feedback_responses;
DROP POLICY IF EXISTS "HOD can view feedback responses" ON feedback_responses;
DROP POLICY IF EXISTS "Students can update own feedback responses" ON feedback_responses;

-- RLS Policies for feedback_forms
-- HOD/AHOD/Admin can insert feedback forms (they must set created_by to their own auth.uid())
CREATE POLICY "HOD can create feedback forms" ON feedback_forms
  FOR INSERT TO authenticated
  WITH CHECK (created_by = auth.uid());

-- Users can view feedback forms they created
CREATE POLICY "Users can view own feedback forms" ON feedback_forms
  FOR SELECT TO authenticated
  USING (created_by = auth.uid());

-- Students can view active feedback forms
CREATE POLICY "Students can view active feedback forms" ON feedback_forms
  FOR SELECT TO authenticated
  USING (
    active = true AND
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'student')
  );

-- Users can update their own feedback forms
CREATE POLICY "Users can update own feedback forms" ON feedback_forms
  FOR UPDATE TO authenticated
  USING (created_by = auth.uid())
  WITH CHECK (created_by = auth.uid());

-- Users can delete their own feedback forms
CREATE POLICY "Users can delete own feedback forms" ON feedback_forms
  FOR DELETE TO authenticated
  USING (created_by = auth.uid());

-- Admins can do everything with feedback forms
CREATE POLICY "Admins can manage all feedback forms" ON feedback_forms
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'))
  WITH CHECK (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));

-- RLS Policies for feedback_questions
-- Users who own the form can manage its questions
CREATE POLICY "Form owners can manage questions" ON feedback_questions
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM feedback_forms
      WHERE feedback_forms.id = feedback_questions.form_id
      AND feedback_forms.created_by = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM feedback_forms
      WHERE feedback_forms.id = feedback_questions.form_id
      AND feedback_forms.created_by = auth.uid()
    )
  );

-- Students can view questions for active forms
CREATE POLICY "Students can view feedback questions" ON feedback_questions
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM feedback_forms
      WHERE feedback_forms.id = feedback_questions.form_id
      AND feedback_forms.active = true
      AND EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'student')
    )
  );

-- Admins can manage all questions
CREATE POLICY "Admins can manage all questions" ON feedback_questions
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'))
  WITH CHECK (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));

-- RLS Policies for feedback_responses
-- Students can create their own responses
CREATE POLICY "Students can create feedback responses" ON feedback_responses
  FOR INSERT TO authenticated
  WITH CHECK (
    student_id = auth.uid() AND
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'student')
  );

-- Students can view their own responses
CREATE POLICY "Students can view own responses" ON feedback_responses
  FOR SELECT TO authenticated
  USING (student_id = auth.uid());

-- Form owners can view all responses to their forms
CREATE POLICY "Form owners can view responses" ON feedback_responses
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM feedback_forms
      WHERE feedback_forms.id = feedback_responses.form_id
      AND feedback_forms.created_by = auth.uid()
    )
  );

-- Students can update their own responses
CREATE POLICY "Students can update own responses" ON feedback_responses
  FOR UPDATE TO authenticated
  USING (student_id = auth.uid())
  WITH CHECK (student_id = auth.uid());

-- Admins can manage all responses
CREATE POLICY "Admins can manage all responses" ON feedback_responses
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'))
  WITH CHECK (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));
