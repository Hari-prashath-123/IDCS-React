-- RPC to fetch staff_timetables rows for a given staff (SECURITY DEFINER)
-- Run this in Supabase SQL editor as a DB admin.

create or replace function public.rpc_get_staff_timetables_for_staff(p_staff_id uuid)
returns setof staff_timetables
language sql
security definer
as $$
  select * from staff_timetables where staff_id = p_staff_id;
$$;

grant execute on function public.rpc_get_staff_timetables_for_staff(uuid) to authenticated;
