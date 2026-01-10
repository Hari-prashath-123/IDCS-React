-- Test helper: run get_staff_leave_attendance as if called by a given caller id
-- WARNING: This is a test helper for use in the Supabase SQL editor only.
-- It bypasses auth.uid() by accepting an explicit caller id. Do NOT grant
-- execute to non-admin roles in production. Remove after testing.

DROP FUNCTION IF EXISTS public.get_staff_leave_attendance_as(uuid, uuid, date);

CREATE OR REPLACE FUNCTION public.get_staff_leave_attendance_as(
  p_caller uuid,
  target_staff uuid,
  for_date date
)
RETURNS TABLE(
  subject_id uuid,
  subject_code text,
  subject_name text,
  period integer,
  year integer,
  section text,
  student_count integer,
  attendance jsonb
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  caller_profile RECORD;
  db_day int;
  tt RECORD;
BEGIN
  -- Load the supplied caller profile (for testing in SQL editor)
  SELECT * INTO caller_profile FROM public.profiles WHERE id = p_caller;
  IF caller_profile IS NULL THEN
    RAISE EXCEPTION 'caller_profile_not_found';
  END IF;

  IF NOT coalesce(caller_profile.is_department_admin, false) THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.replacements r
      WHERE r.target_staff = target_staff AND r.replacement_staff = p_caller AND r.for_date = for_date
    ) THEN
      RAISE EXCEPTION 'not_authorized';
    END IF;
  ELSE
    IF caller_profile.department IS NULL THEN
      RAISE EXCEPTION 'no_department_on_profile';
    END IF;

    IF NOT EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = target_staff AND p.department = caller_profile.department) THEN
      RAISE EXCEPTION 'target_not_in_department';
    END IF;
  END IF;

  db_day := extract(dow FROM for_date)::int; -- 0=Sunday,6=Saturday
  IF db_day = 0 OR db_day = 6 THEN
    RETURN;
  END IF;

  FOR tt IN
    -- staff_timetables does not include subject_id. Use the main timetables
    -- table to find the subject for the given department/year/section/period/day.
    SELECT t.subject_id, st.period, st.year, st.section
    FROM public.staff_timetables st
    JOIN public.timetables t
      ON t.department = st.department
     AND t.year = st.year
     AND t.section = st.section
     AND t.period = st.period
     AND t.day_of_week = st.day_of_week
    WHERE st.staff_id = target_staff
      AND st.day_of_week = db_day
  LOOP
    RETURN QUERY
    SELECT
      tt.subject_id,
      sub.subject_code,
      sub.name,
      tt.period,
      tt.year,
      tt.section,
      (SELECT count(*) FROM public.students s WHERE s.year = tt.year AND s.section = tt.section)::int as student_count,
      (
        SELECT jsonb_agg(jsonb_build_object(
          'student_id', s.id,
          'reg_no', s.reg_no,
          'roll_no', s.roll_no,
          'name', p.name,
          'period_status', coalesce(patt_exact.status, patt_period.status),
          'daily_status', coalesce(datt.status, NULL),
          'status', coalesce(patt_exact.status, patt_period.status, datt.status, 'present')
        ) ORDER BY s.roll_no)
        FROM public.students s
        LEFT JOIN public.profiles p ON p.id = s.id
        LEFT JOIN LATERAL (
          SELECT pa.status FROM public.period_attendance pa
          WHERE pa.date = for_date AND pa.subject_id = tt.subject_id AND pa.period = tt.period AND pa.student_id = s.id
          LIMIT 1
        ) patt_exact ON TRUE
        LEFT JOIN LATERAL (
          SELECT pa.status FROM public.period_attendance pa
          WHERE pa.date = for_date AND pa.period = tt.period AND pa.student_id = s.id
          LIMIT 1
        ) patt_period ON TRUE
        LEFT JOIN LATERAL (
          SELECT da.status FROM public.daily_attendance da
          WHERE da.date = for_date AND da.student_id = s.id
          LIMIT 1
        ) datt ON TRUE
        WHERE s.year = tt.year AND s.section = tt.section
      )::jsonb
    FROM public.subjects sub WHERE sub.id = tt.subject_id;
  END LOOP;

  FOR tt IN
    -- Exclude timetable slots that are already represented in staff_timetables
    -- to avoid returning duplicates when a staff has an explicit staff_timetables entry
    SELECT t.subject_id, t.period, t.year, t.section
    FROM public.timetables t
    JOIN public.subjects sub ON sub.id = t.subject_id
    WHERE sub.staff_id = target_staff
      AND t.day_of_week = db_day
      AND NOT EXISTS (
        SELECT 1 FROM public.staff_timetables st
        WHERE st.staff_id = target_staff
          AND st.department = t.department
          AND st.year = t.year
          AND st.section = t.section
          AND st.period = t.period
          AND st.day_of_week = t.day_of_week
      )
  LOOP
    RETURN QUERY
    SELECT
      tt.subject_id,
      sub.subject_code,
      sub.name,
      tt.period,
      tt.year,
      tt.section,
      (SELECT count(*) FROM public.students s WHERE s.year = tt.year AND s.section = tt.section)::int as student_count,
      (
        SELECT jsonb_agg(jsonb_build_object(
          'student_id', s.id,
          'reg_no', s.reg_no,
          'roll_no', s.roll_no,
          'name', p.name,
          'status', coalesce(patt.status, datt.status, 'present')
        ) ORDER BY s.roll_no)
        FROM public.students s
        LEFT JOIN public.profiles p ON p.id = s.id
        LEFT JOIN LATERAL (
          SELECT pa.status FROM public.period_attendance pa
          WHERE pa.date = for_date AND pa.subject_id = tt.subject_id AND pa.period = tt.period AND pa.student_id = s.id
          LIMIT 1
        ) patt ON TRUE
        LEFT JOIN LATERAL (
          SELECT da.status FROM public.daily_attendance da
          WHERE da.date = for_date AND da.student_id = s.id
          LIMIT 1
        ) datt ON TRUE
        WHERE s.year = tt.year AND s.section = tt.section
      )::jsonb
    FROM public.subjects sub WHERE sub.id = tt.subject_id;
  END LOOP;

  RETURN;
END;
$$;

-- Grant execute to the 'service_role' only for testing purposes if desired.
-- Be cautious: do NOT leave this granted to 'authenticated' in production.
-- Example (admin run in SQL editor):
-- GRANT EXECUTE ON FUNCTION public.get_staff_leave_attendance_as(uuid, uuid, date) TO service_role;
