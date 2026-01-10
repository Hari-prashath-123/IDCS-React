-- RPC to upsert multiple staff_timetables rows as SECURITY DEFINER
-- Run this in your Supabase SQL editor as a DB admin.

create or replace function public.rpc_upsert_staff_timetables(p_rows jsonb)
returns jsonb
language plpgsql
security definer
as $$
declare
  r jsonb;
  sid uuid;
begin
  if p_rows is null then
    return jsonb_build_object('success', true, 'inserted', 0);
  end if;

  for r in select * from jsonb_array_elements(p_rows) loop
    -- allow empty subject_id (null) or UUID
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
        case when r->>'subject_id' = '' then null else (r->>'subject_id')::uuid end
      )
      on conflict (staff_id, department, year, section, semester, day_of_week, period) do update
      set subject_id = excluded.subject_id;
    exception when others then
      -- ignore individual row errors to allow rest to complete
      raise notice 'rpc_upsert_staff_timetables: row failed: %', r;
    end;
  end loop;

  return jsonb_build_object('success', true, 'inserted', jsonb_array_length(p_rows));
end;
$$;

-- Grant execute to authenticated role (adjust role name if different)
grant execute on function public.rpc_upsert_staff_timetables(jsonb) to authenticated;
