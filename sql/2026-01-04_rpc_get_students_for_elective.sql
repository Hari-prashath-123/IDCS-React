-- RPC to fetch students mapped to an elective with student profile and reg_no
-- Uses SECURITY DEFINER so frontend can call this even if RLS blocks direct SELECTs
create or replace function public.rpc_get_students_for_elective(p_elective_id uuid)
returns table(
  student_elective_id uuid,
  student_id uuid,
  reg_no text,
  student_name text,
  department text
) language sql security definer stable as $$
  select se.id,
         s.id,
         s.reg_no,
         coalesce(p.name, '')::text,
         coalesce(p.department, s.course_name, '')::text
  from public.student_electives se
  join public.students s on s.id = se.student_id
  left join public.profiles p on p.id = se.student_id
  where se.elective_id = p_elective_id;
$$;

grant execute on function public.rpc_get_students_for_elective(uuid) to anon;
