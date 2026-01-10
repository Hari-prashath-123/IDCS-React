-- Trigger: create certificate after OD application is fully approved
-- Created: 2025-11-19

/*
  This function watches for updates to the od_applications table.
  When an application's status transitions to 'approved' (from any other
  state) and the application has a non-null attachment_url, it inserts
  a row into the certificates table for the student. Duplicate inserts
  are avoided by checking for an existing certificate with the same
  student_id and file_url.

  Note: The function runs as SECURITY DEFINER so it can insert even when
  the calling role is restricted by RLS. Review and adjust ownership
  and RLS policies as appropriate for your environment.
*/

create or replace function public.create_certificate_after_od_approval()
returns trigger
language plpgsql
security definer
as $$
begin
  -- Only act on updates where status became 'approved'
  if (TG_OP = 'UPDATE') then
    if (new.status = 'approved' and (old.status is distinct from 'approved')) then
      -- Ensure this is an OD application and that an attachment exists
      if (new.attachment_url is not null and trim(new.attachment_url) <> '') then
        -- Avoid duplicate certificate for same student + file_url
        if not exists (
          select 1 from public.certificates c
          where c.user_id = new.student_id and c.file_url = new.attachment_url
        ) then
          insert into public.certificates (user_id, role, description, file_url, created_at)
          values (new.student_id, 'student', coalesce(new.subject, new.reason), new.attachment_url, now());
        end if;
      end if;
    end if;
  end if;
  return new;
end;
$$;

-- Create trigger on od_applications
drop trigger if exists trg_create_certificate_on_od_approval on public.od_applications;
create trigger trg_create_certificate_on_od_approval
after update on public.od_applications
for each row
execute function public.create_certificate_after_od_approval();
