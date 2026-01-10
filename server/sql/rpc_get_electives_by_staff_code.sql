-- RPC: get electives assigned to a staff by staff code (text)
-- SECURITY DEFINER function; run this in Supabase SQL Editor with service-role privileges
DROP FUNCTION IF EXISTS public.rpc_get_electives_by_staff_code(text);
CREATE FUNCTION public.rpc_get_electives_by_staff_code(p_staff_code text)
RETURNS SETOF public.electives
LANGUAGE SQL
SECURITY DEFINER
AS $$
  SELECT e.*
  FROM public.electives e
  WHERE (e.staff_id::text = p_staff_code)
     OR (e.staff_id = (SELECT id FROM public.staff WHERE staff_id = p_staff_code LIMIT 1));
$$;

GRANT EXECUTE ON FUNCTION public.rpc_get_electives_by_staff_code(text) TO public;
