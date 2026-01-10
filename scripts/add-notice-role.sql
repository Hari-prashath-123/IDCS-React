-- Add 'notice' role to the allowed roles in profiles table
-- Run this in Supabase SQL Editor

-- First, drop the existing check constraint
ALTER TABLE profiles DROP CONSTRAINT profiles_role_check;

-- Then add the new check constraint with 'notice' included
ALTER TABLE profiles ADD CONSTRAINT profiles_role_check
  CHECK (role IN ('student', 'staff', 'ahod', 'hod', 'admin', 'ps', 'principal', 'notice'));