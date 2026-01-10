-- Create bucket and storage RLS policies for profile-images
-- Run as a project owner (Supabase SQL editor) or via psql with the service_role key

BEGIN;

-- Ensure bucket exists (id and name = 'profile-images')
INSERT INTO storage.buckets (id, name, public)
VALUES ('profile-images', 'profile-images', true)
ON CONFLICT (id) DO NOTHING;

-- Enable RLS on storage.objects (idempotent)
ALTER TABLE IF EXISTS storage.objects ENABLE ROW LEVEL SECURITY;

-- Remove old policies for idempotence
DROP POLICY IF EXISTS "Users can upload own profile images" ON storage.objects;
DROP POLICY IF EXISTS "Anyone can view profile images" ON storage.objects;
DROP POLICY IF EXISTS "Users can update own profile images" ON storage.objects;
DROP POLICY IF EXISTS "Users can delete own profile images" ON storage.objects;

-- Allow authenticated users to insert objects under their user-id folder in profile-images
CREATE POLICY "Users can upload own profile images"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'profile-images'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

-- Allow public SELECT if bucket is public (MVP). If you want private, remove this policy.
CREATE POLICY "Anyone can view profile images"
  ON storage.objects FOR SELECT
  TO public
  USING (bucket_id = 'profile-images');

-- Allow users to update their own files
CREATE POLICY "Users can update own profile images"
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

-- Allow users to delete their own files
CREATE POLICY "Users can delete own profile images"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'profile-images'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

COMMIT;

-- NOTES:
-- 1) This assumes the client uploads objects under the path: `${userId}/...` (e.g. "<uid>/profile.jpg").
-- 2) If your client writes files to a different folder layout, adjust the `storage.foldername(name))[1]` check accordingly.
-- 3) If you prefer private bucket access, set `public=false` in the bucket insert and keep the SELECT policy scoped to authenticated users and appropriate checks.
-- 4) Run this in the Supabase SQL editor as project owner, then retry the client upload.
