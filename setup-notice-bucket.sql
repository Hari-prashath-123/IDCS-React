-- Notice bucket setup for home page scrolling images
-- Run this in Supabase SQL editor

-- 1) Create notice storage bucket (public for home page images)
INSERT INTO storage.buckets (id, name, public)
VALUES ('notice', 'notice', true)
ON CONFLICT (id) DO NOTHING;

-- NOTE: Storage policies need to be set up by a project owner/admin
-- through the Supabase Dashboard under Storage > Policies
-- or by running the policy commands with proper permissions

-- Required Policies (set these up manually in Supabase Dashboard):
-- 1. "Anyone can view notice images" - SELECT policy for public access
-- 2. "Notice users can upload images" - INSERT policy for authenticated notice users
-- 3. "Notice users can update images" - UPDATE policy for authenticated notice users
-- 4. "Notice users can delete images" - DELETE policy for authenticated notice users