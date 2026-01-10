-- Notice bucket setup for home page scrolling images
-- Run this in Supabase SQL editor

-- 1) Create notice storage bucket (public for home page images)
INSERT INTO storage.buckets (id, name, public)
VALUES ('notice', 'notice', true)
ON CONFLICT (id) DO NOTHING;

-- 2) Storage policies for notice bucket
-- Enable RLS on storage.objects (may already be enabled)
ALTER TABLE IF EXISTS storage.objects ENABLE ROW LEVEL SECURITY;

-- Remove any existing notice-specific policies so re-running is safe
DROP POLICY IF EXISTS "Notice users can upload images" ON storage.objects;
DROP POLICY IF EXISTS "Anyone can view notice images" ON storage.objects;
DROP POLICY IF EXISTS "Notice users can update images" ON storage.objects;
DROP POLICY IF EXISTS "Notice users can delete images" ON storage.objects;

-- Allow notice role users to upload images
CREATE POLICY "Notice users can upload images"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'notice'
    AND EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role = 'notice')
  );

-- Allow notice role users to list images in bucket
CREATE POLICY "Notice users can list images"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'notice'
    AND EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role = 'notice')
  );

-- Allow notice role users to update images
CREATE POLICY "Notice users can update images"
  ON storage.objects FOR UPDATE
  TO authenticated
  USING (
    bucket_id = 'notice'
    AND EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role = 'notice')
  )
  WITH CHECK (
    bucket_id = 'notice'
    AND EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role = 'notice')
  );

-- Allow notice role users to delete images
CREATE POLICY "Notice users can delete images"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'notice'
    AND EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role = 'notice')
  );