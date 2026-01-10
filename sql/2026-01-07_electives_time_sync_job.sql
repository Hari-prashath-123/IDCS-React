-- Migration: create a DB function to sync electives.is_active from start/stop timestamps
-- and schedule it using pg_cron (runs every minute).

-- Note: pg_cron must be available in the DB. If not available, run the function from an external scheduler or Supabase Scheduled Function.

-- Create function
CREATE OR REPLACE FUNCTION public.sync_electives_active_by_time()
RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  -- Activate electives where start <= now() and stop is null or stop > now()
  UPDATE public.electives
  SET is_active = true
  WHERE (is_active IS DISTINCT FROM true)
    AND start IS NOT NULL
    AND start <= now()
    AND (stop IS NULL OR stop > now());

  -- Deactivate electives where stop <= now()
  UPDATE public.electives
  SET is_active = false
  WHERE (is_active IS DISTINCT FROM false)
    AND stop IS NOT NULL
    AND stop <= now();
END
$$;

-- Try to install pg_cron extension (may fail if not permitted)
DO $$
BEGIN
  BEGIN
    CREATE EXTENSION IF NOT EXISTS pg_cron;
  EXCEPTION WHEN others THEN
    RAISE NOTICE 'pg_cron extension not available: %', SQLERRM;
  END;
END;
$$;

-- Schedule job using pg_cron if available
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    -- remove existing job with same name if present (ignore if it does not exist)
    BEGIN
      PERFORM cron.unschedule('sync_electives_active_by_time')::text;
    EXCEPTION WHEN others THEN
      -- ignore error if job was not present
      NULL;
    END;
    PERFORM cron.schedule('sync_electives_active_by_time', '*/1 * * * *', $cmd$SELECT public.sync_electives_active_by_time();$cmd$);
  ELSE
    RAISE NOTICE 'pg_cron not installed; please schedule public.sync_electives_active_by_time() via external scheduler or Supabase scheduled function.';
  END IF;
END;
$$;
