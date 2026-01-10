-- Storage RLS policies for od-proofs bucket
-- This allows students to upload their own application proofs

-- Enable RLS on storage.objects
ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist
DROP POLICY IF EXISTS "Students can upload own proofs" ON storage.objects;
DROP POLICY IF EXISTS "Anyone can view proofs" ON storage.objects;
DROP POLICY IF EXISTS "Students can update own proofs" ON storage.objects;
DROP POLICY IF EXISTS "Students can delete own proofs" ON storage.objects;

-- Allow authenticated users to upload to their own folder in od-proofs bucket
CREATE POLICY "Students can upload own proofs"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'od-proofs' 
  AND (storage.foldername(name))[1] = auth.uid()::text
);

-- Allow anyone to view files in od-proofs (it's a public bucket)
CREATE POLICY "Anyone can view proofs"
ON storage.objects FOR SELECT
TO public
USING (bucket_id = 'od-proofs');

-- Allow users to update their own files
CREATE POLICY "Students can update own proofs"
ON storage.objects FOR UPDATE
TO authenticated
USING (
  bucket_id = 'od-proofs' 
  AND (storage.foldername(name))[1] = auth.uid()::text
)
WITH CHECK (
  bucket_id = 'od-proofs' 
  AND (storage.foldername(name))[1] = auth.uid()::text
);

-- Allow users to delete their own files
CREATE POLICY "Students can delete own proofs"
ON storage.objects FOR DELETE
TO authenticated
USING (
  bucket_id = 'od-proofs' 
  AND (storage.foldername(name))[1] = auth.uid()::text
);

-- Make sure the bucket exists and is public
INSERT INTO storage.buckets (id, name, public)
VALUES ('od-proofs', 'od-proofs', true)
ON CONFLICT (id) DO UPDATE SET public = true;
