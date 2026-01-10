-- Notice content table for home page carousel
-- Run this in Supabase SQL editor

-- Create notice_content table
CREATE TABLE IF NOT EXISTS notice_content (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  image_name text NOT NULL UNIQUE,
  title text NOT NULL,
  description text NOT NULL,
  display_order integer DEFAULT 0,
  is_active boolean DEFAULT true,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Enable RLS
ALTER TABLE notice_content ENABLE ROW LEVEL SECURITY;

-- Policies for notice users to manage content
CREATE POLICY "Notice users can view notice content"
  ON notice_content FOR SELECT
  TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role = 'notice'));

CREATE POLICY "Notice users can insert notice content"
  ON notice_content FOR INSERT
  TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role = 'notice'));

CREATE POLICY "Notice users can update notice content"
  ON notice_content FOR UPDATE
  TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role = 'notice'))
  WITH CHECK (EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role = 'notice'));

CREATE POLICY "Notice users can delete notice content"
  ON notice_content FOR DELETE
  TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role = 'notice'));

-- Public can view active notice content (for home page)
CREATE POLICY "Public can view active notice content"
  ON notice_content FOR SELECT
  TO public
  USING (is_active = true);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_notice_content_image_name ON notice_content(image_name);
CREATE INDEX IF NOT EXISTS idx_notice_content_display_order ON notice_content(display_order);
CREATE INDEX IF NOT EXISTS idx_notice_content_is_active ON notice_content(is_active);

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_notice_content_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to automatically update updated_at
CREATE TRIGGER notice_content_updated_at
  BEFORE UPDATE ON notice_content
  FOR EACH ROW
  EXECUTE FUNCTION update_notice_content_updated_at();