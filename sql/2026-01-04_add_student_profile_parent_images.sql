-- Migration: add profile and parent photo columns to students
-- Run this in your Supabase SQL editor or via psql/supabase CLI

BEGIN;

ALTER TABLE IF EXISTS public.students
  ADD COLUMN IF NOT EXISTS profile_image text,
  ADD COLUMN IF NOT EXISTS mother_photo text,
  ADD COLUMN IF NOT EXISTS father_photo text;

-- Optionally: if you want public URLs stored for direct access, ensure
-- the storage bucket `profile-images` is created and set with appropriate
-- permissions. The application expects a bucket named `profile-images`.

COMMIT;

-- Notes:
-- 1) This migration only adds nullable text columns used to store
--    public URLs (or storage paths) for images. No data is modified.
-- 2) Create the storage bucket `profile-images` in Supabase UI or with
--    the Supabase CLI. Example (supabase CLI must be configured):
--      supabase storage bucket create profile-images --public
--    Or create it in the Supabase dashboard and set it public if you
--    rely on `getPublicUrl()` for direct image links.
-- 3) After running the migration, test uploading via the app to ensure
--    `profile_image`, `mother_photo`, and `father_photo` are set correctly.
