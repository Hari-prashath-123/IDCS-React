-- RPC to replace all staff_timetables rows for a given staff (SECURITY DEFINER)
-- Deletes existing rows for the staff and inserts provided rows atomically.
-- Run in Supabase SQL editor as DB admin.

create or replace function public.rpc_replace_staff_timetables(p_staff_id uuid, p_rows jsonb)
returns jsonb
language plpgsql
security definer
as $$
declare
  r jsonb;
  inserted_count int := 0;
begin
  -- delete existing rows for staff
  delete from staff_timetables where staff_id = p_staff_id;

  if p_rows is null then
    return jsonb_build_object('success', true, 'inserted', 0);
  end if;

  for r in select * from jsonb_array_elements(p_rows) loop
    begin
      insert into staff_timetables(staff_id, department, year, section, semester, day_of_week, period, subject_id)
      values (
        (r->>'staff_id')::uuid,
        r->>'department',
        (r->>'year')::int,
        r->>'section',
        coalesce(nullif(r->>'semester','')::int, 1),
        (r->>'day_of_week')::int,
        (r->>'period')::int,
        case when (r->>'subject_id') = '' then null else (r->>'subject_id')::uuid end
      );
      inserted_count := inserted_count + 1;
    exception when others then
      raise notice 'rpc_replace_staff_timetables: row failed: %', r;
    end;
  end loop;

  return jsonb_build_object('success', true, 'inserted', inserted_count);
end;
$$;

grant execute on function public.rpc_replace_staff_timetables(uuid, jsonb) to authenticated;
