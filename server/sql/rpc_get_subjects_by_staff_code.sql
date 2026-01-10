-- RPC: get subjects assigned to a staff by staff code (text)
-- SECURITY DEFINER function; run this in Supabase SQL Editor with service-role privileges
DROP FUNCTION IF EXISTS public.rpc_get_subjects_by_staff_code(text);
CREATE FUNCTION public.rpc_get_subjects_by_staff_code(p_staff_code text)
RETURNS SETOF public.subjects
LANGUAGE SQL
SECURITY DEFINER
AS $$
  SELECT s.*
  FROM public.subjects s
  WHERE (s.staff_id::text = p_staff_code)
     OR (s.staff_id = (SELECT id FROM public.staff WHERE staff_id = p_staff_code LIMIT 1));
$$;

GRANT EXECUTE ON FUNCTION public.rpc_get_subjects_by_staff_code(text) TO public;
