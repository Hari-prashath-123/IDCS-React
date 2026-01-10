-- Check if trigger and function exist
SELECT 
  t.trigger_name, 
  t.event_manipulation, 
  t.action_timing,
  t.event_object_table
FROM information_schema.triggers t
WHERE t.trigger_name = 'trigger_update_seats_filled';

-- Check function definition
SELECT 
  p.proname as function_name,
  pg_get_functiondef(p.oid) as function_definition
FROM pg_proc p
JOIN pg_namespace n ON p.pronamespace = n.oid
WHERE p.proname = 'update_elective_seats_filled'
AND n.nspname = 'public';
