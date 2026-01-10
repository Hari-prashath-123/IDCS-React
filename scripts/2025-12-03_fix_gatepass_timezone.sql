-- Fix existing gatepass timestamps that were stored as UTC
-- This converts timestamps from UTC to IST by subtracting 5 hours 30 minutes
-- So that when displayed in browser (which adds +5:30), it shows the correct original time

-- IMPORTANT: This assumes all existing gatepasses were intended to be in Indian Time (IST)
-- and were incorrectly stored as UTC

UPDATE public.gatepass_applications
SET 
  from_date = from_date - INTERVAL '5 hours 30 minutes',
  to_date = to_date - INTERVAL '5 hours 30 minutes'
WHERE 
  -- Only update records where timezone is +00 (UTC)
  from_date::text LIKE '%+00'
  AND to_date::text LIKE '%+00';

-- Example: 
-- Before: 2025-12-03 00:02:00+00 (midnight UTC)
-- After:  2025-12-02 18:32:00+00 (6:32 PM UTC on previous day)
-- When displayed with +5:30 offset: shows as 2025-12-03 00:02 (midnight IST) ✓
