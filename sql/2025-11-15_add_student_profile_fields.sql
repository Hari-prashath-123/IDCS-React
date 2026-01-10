-- Migration: add student/profile fields for editable profile
-- Add personal fields to profiles table
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS first_name varchar(255),
  ADD COLUMN IF NOT EXISTS last_name varchar(255),
  ADD COLUMN IF NOT EXISTS dob date,
  ADD COLUMN IF NOT EXISTS gender varchar(32),
  ADD COLUMN IF NOT EXISTS address text,
  ADD COLUMN IF NOT EXISTS city varchar(128),
  ADD COLUMN IF NOT EXISTS state varchar(128),
  ADD COLUMN IF NOT EXISTS college varchar(255),
  ADD COLUMN IF NOT EXISTS course_name varchar(255),
  ADD COLUMN IF NOT EXISTS degree varchar(255);

-- Add academic / guardian fields to students table
ALTER TABLE public.students
  ADD COLUMN IF NOT EXISTS admission_year integer,
  ADD COLUMN IF NOT EXISTS sem integer,
  ADD COLUMN IF NOT EXISTS fathers_name varchar(255),
  ADD COLUMN IF NOT EXISTS mothers_name varchar(255),
  ADD COLUMN IF NOT EXISTS address text,
  ADD COLUMN IF NOT EXISTS city varchar(128),
  ADD COLUMN IF NOT EXISTS state varchar(128),
  ADD COLUMN IF NOT EXISTS course_name varchar(255),
  ADD COLUMN IF NOT EXISTS college varchar(255),
  ADD COLUMN IF NOT EXISTS degree varchar(255);

-- Note: Running this migration requires appropriate DB privileges. Review column names/types to match production schema.
