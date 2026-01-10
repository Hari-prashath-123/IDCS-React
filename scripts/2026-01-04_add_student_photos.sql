-- 2026-01-04: Add photo columns to students table and create profile-images bucket
-- This migration adds profile_image, mother_photo, and father_photo columns to store image URLs

-- 1) Add photo columns to students table
ALTER TABLE public.students
  ADD COLUMN IF NOT EXISTS profile_image text,
  ADD COLUMN IF NOT EXISTS mother_photo text,
  ADD COLUMN IF NOT EXISTS father_photo text;

COMMENT ON COLUMN students.profile_image IS 'URL to student profile image stored in profile-images bucket';
COMMENT ON COLUMN students.mother_photo IS 'URL to mother photo stored in profile-images bucket';
COMMENT ON COLUMN students.father_photo IS 'URL to father photo stored in profile-images bucket';

-- 2) Create storage bucket for profile images (public for viewing)
INSERT INTO storage.buckets (id, name, public)
VALUES ('profile-images', 'profile-images', true)
ON CONFLICT (id) DO NOTHING;

-- 3) Enable RLS on storage.objects if not already enabled
ALTER TABLE IF EXISTS storage.objects ENABLE ROW LEVEL SECURITY;

-- 4) Drop existing policies if they exist (for safe re-running)
DROP POLICY IF EXISTS "Students can upload own profile images" ON storage.objects;
DROP POLICY IF EXISTS "Anyone can view profile images" ON storage.objects;
DROP POLICY IF EXISTS "Students can update own profile images" ON storage.objects;
DROP POLICY IF EXISTS "Students can delete own profile images" ON storage.objects;

-- 5) Create storage policies for profile-images bucket

-- Allow authenticated students to upload to their own folder in profile-images bucket
CREATE POLICY "Students can upload own profile images"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'profile-images'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

-- Allow anyone to view files in profile-images (public bucket)
CREATE POLICY "Anyone can view profile images"
  ON storage.objects FOR SELECT
  TO public
  USING (bucket_id = 'profile-images');

-- Allow users to update their own profile image files
CREATE POLICY "Students can update own profile images"
  ON storage.objects FOR UPDATE
  TO authenticated
  USING (
    bucket_id = 'profile-images'
    AND (storage.foldername(name))[1] = auth.uid()::text
  )
  WITH CHECK (
    bucket_id = 'profile-images'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

-- Allow users to delete their own profile image files
CREATE POLICY "Students can delete own profile images"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'profile-images'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

-- 6) Create indexes for better query performance (optional)
CREATE INDEX IF NOT EXISTS idx_students_profile_image ON students(profile_image) WHERE profile_image IS NOT NULL;

-- Migration complete
-- Students can now upload profile_image, mother_photo, and father_photo
-- Files are stored in profile-images bucket with path: {user_id}/profile.jpg, {user_id}/mother.jpg, {user_id}/father.jpg
