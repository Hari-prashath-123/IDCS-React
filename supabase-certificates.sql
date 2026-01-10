-- Certificates feature setup
-- Run this in Supabase SQL editor after applying supabase-setup.sql

-- 1) Create certificates table
CREATE TABLE IF NOT EXISTS certificates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id uuid NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  description text,
  category text,
  event_college text,
  certificate_type text,
  exam_name text,
  course_name text,
  file_url text NOT NULL,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE certificates ENABLE ROW LEVEL SECURITY;

-- Drop old policies if re-running
DROP POLICY IF EXISTS "Students can insert own certificates" ON certificates;
DROP POLICY IF EXISTS "Students and approvers can view certificates" ON certificates;

-- 2) RLS policies
-- Students can insert their own rows
CREATE POLICY "Students can insert own certificates"
  ON certificates FOR INSERT
  TO authenticated
  WITH CHECK (student_id = auth.uid());

-- Students can view their own certificates; mentor/advisor/hod/admin can view related students' certificates
CREATE POLICY "Students and approvers can view certificates"
  ON certificates FOR SELECT
  TO authenticated
  USING (
    student_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM students s
      WHERE s.id = certificates.student_id
      AND (s.mentor_id = auth.uid() OR s.advisor_id = auth.uid() OR s.hod_id = auth.uid())
    )
    OR EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role = 'admin')
  );

-- Indexes
CREATE INDEX IF NOT EXISTS idx_certificates_student_id ON certificates(student_id);
CREATE INDEX IF NOT EXISTS idx_certificates_created_at ON certificates(created_at);

-- 3) Storage bucket for certificate files (public for MVP)
-- Note: If you prefer private bucket + signed URLs, set public=false and add storage policies.
INSERT INTO storage.buckets (id, name, public)
VALUES ('certificates', 'certificates', true)
ON CONFLICT (id) DO NOTHING;

-- NOTE: Some Supabase projects enable RLS on storage.objects. If RLS is enabled
-- and there are no policies that allow authenticated users to insert into the
-- `certificates` bucket, uploads will fail with a "new row violates row-level
-- security policy" error. The following policies allow authenticated users to
-- upload/view/update/delete files within a folder named after their user id
-- inside the `certificates` bucket. Run this section in the SQL editor with a
-- project role that has permission to alter the storage schema (project owner).
-- If you cannot run these (permission denied), create the same policies from
-- the Supabase UI under Storage > Policies or ask the project owner to run them.

-- Enable RLS on storage.objects (may already be enabled)
ALTER TABLE IF EXISTS storage.objects ENABLE ROW LEVEL SECURITY;

-- Remove any existing certificate-specific policies so re-running is safe
DROP POLICY IF EXISTS "Students can upload own certificates" ON storage.objects;
DROP POLICY IF EXISTS "Anyone can view certificates" ON storage.objects;
DROP POLICY IF EXISTS "Students can update own certificates" ON storage.objects;
DROP POLICY IF EXISTS "Students can delete own certificates" ON storage.objects;

-- Allow authenticated users to upload to their own folder in certificates bucket
CREATE POLICY "Students can upload own certificates"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'certificates'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

-- Allow anyone to view files in certificates (public bucket)
CREATE POLICY "Anyone can view certificates"
  ON storage.objects FOR SELECT
  TO public
  USING (bucket_id = 'certificates');

-- Allow users to update their own certificate files
CREATE POLICY "Students can update own certificates"
  ON storage.objects FOR UPDATE
  TO authenticated
  USING (
    bucket_id = 'certificates'
    AND (storage.foldername(name))[1] = auth.uid()::text
  )
  WITH CHECK (
    bucket_id = 'certificates'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

-- Allow users to delete their own certificate files
CREATE POLICY "Students can delete own certificates"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'certificates'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );
