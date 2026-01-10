-- Migration: add claimed_at to bonafide_applications
-- Run in Supabase SQL editor as a DB owner.

ALTER TABLE IF EXISTS public.bonafide_applications
  ADD COLUMN IF NOT EXISTS claimed_at timestamptz DEFAULT NULL;

-- Optionally create an index for queries filtering on claimed_at
CREATE INDEX IF NOT EXISTS idx_bonafide_claimed_at ON public.bonafide_applications(claimed_at);

-- Note: no backfill required; existing rows will have NULL claimed_at (unclaimed).
