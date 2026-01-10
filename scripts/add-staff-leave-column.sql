-- Add on_leave column to staff table
-- Run this in Supabase SQL Editor to update existing database

ALTER TABLE staff ADD COLUMN IF NOT EXISTS on_leave boolean DEFAULT false;
