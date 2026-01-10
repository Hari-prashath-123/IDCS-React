-- Test helper: run get_staff_leave_attendance as if called by a given caller id
-- This is for debugging only. Do NOT grant to unauthenticated roles in production.

DROP FUNCTION IF EXISTS public.get_staff_leave_attendance_as_v2(uuid, uuid, date);

CREATE OR REPLACE FUNCTION public.get_staff_leave_attendance_as_v2(
  p_caller uuid,
  p_target_staff uuid,
  p_for_date date
)
RETURNS TABLE(
  subject_id uuid,
  subject_code text,
  subject_name text,
  period integer,
  year integer,
  section text,
  student_count integer,
  attendance jsonb,
  assigned_replacement uuid,
  assigned_period integer
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

  -- If caller is not a department admin, allow only when they are a replacement
  -- for the provided target_staff on the given date.
  IF NOT coalesce(caller_profile.is_department_admin, false) THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.replacements r
      WHERE r.target_staff = p_target_staff AND r.replacement_staff = p_caller AND r.for_date = p_for_date
    ) THEN
      RAISE EXCEPTION 'not_authorized';
    END IF;
  ELSE
    IF caller_profile.department IS NULL THEN
      RAISE EXCEPTION 'no_department_on_profile';
    END IF;

    IF NOT EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = p_target_staff AND p.department = caller_profile.department) THEN
      RAISE EXCEPTION 'target_not_in_department';
    END IF;
  END IF;

  db_day := extract(dow FROM p_for_date)::int; -- 0=Sunday,6=Saturday
  IF db_day = 0 OR db_day = 6 THEN
    RETURN;
  END IF;

  -- staff-specific timetable entries
  FOR tt IN
    SELECT t.subject_id, st.period, st.year, st.section
    FROM public.staff_timetables st
    JOIN public.timetables t
      ON t.department = st.department
     AND t.year = st.year
     AND t.section = st.section
     AND t.period = st.period
     AND t.day_of_week = st.day_of_week
    WHERE st.staff_id = p_target_staff
      AND st.day_of_week = db_day
  LOOP
    RETURN QUERY
    SELECT q.subject_id, q.subject_code, q.subject_name, q.period, q.year, q.section, q.student_count, q.attendance, q.assigned_replacement, q.assigned_period
    FROM (
      SELECT
        tt.subject_id,
        sub.subject_code,
        sub.name AS subject_name,
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
            WHERE pa.date = p_for_date AND pa.subject_id = tt.subject_id AND pa.period = tt.period AND pa.student_id = s.id
            LIMIT 1
          ) patt_exact ON TRUE
          LEFT JOIN LATERAL (
            SELECT pa.status FROM public.period_attendance pa
            WHERE pa.date = p_for_date AND pa.period = tt.period AND pa.student_id = s.id
            LIMIT 1
          ) patt_period ON TRUE
          LEFT JOIN LATERAL (
            SELECT da.status FROM public.daily_attendance da
            WHERE da.date = p_for_date AND da.student_id = s.id
            LIMIT 1
          ) datt ON TRUE
          WHERE s.year = tt.year AND s.section = tt.section
        )::jsonb AS attendance,
        (
          SELECT r.replacement_staff FROM public.replacements r
          WHERE r.target_staff = p_target_staff AND r.for_date = p_for_date AND r.period = tt.period
          ORDER BY r.created_at DESC
          LIMIT 1
        )::uuid AS assigned_replacement,
        (
          SELECT r.period FROM public.replacements r
          WHERE r.target_staff = p_target_staff AND r.for_date = p_for_date AND r.period = tt.period
          ORDER BY r.created_at DESC
          LIMIT 1
        )::integer AS assigned_period
      FROM public.subjects sub WHERE sub.id = tt.subject_id
    ) q
    WHERE coalesce(caller_profile.is_department_admin, false) OR q.assigned_replacement = p_caller;
  END LOOP;

  -- fallback timetable
  FOR tt IN
    SELECT t.subject_id, t.period, t.year, t.section
    FROM public.timetables t
    JOIN public.subjects sub ON sub.id = t.subject_id
    WHERE sub.staff_id = p_target_staff
      AND t.day_of_week = db_day
      AND NOT EXISTS (
        SELECT 1 FROM public.staff_timetables st
        WHERE st.staff_id = p_target_staff
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
          'period_status', coalesce(patt_exact.status, patt_period.status),
          'daily_status', coalesce(datt.status, NULL),
          'status', coalesce(patt_exact.status, patt_period.status, datt.status, 'present')
        ) ORDER BY s.roll_no)
        FROM public.students s
        LEFT JOIN public.profiles p ON p.id = s.id
        LEFT JOIN LATERAL (
          SELECT pa.status FROM public.period_attendance pa
          WHERE pa.date = p_for_date AND pa.subject_id = tt.subject_id AND pa.period = tt.period AND pa.student_id = s.id
          LIMIT 1
        ) patt_exact ON TRUE
        LEFT JOIN LATERAL (
          SELECT pa.status FROM public.period_attendance pa
          WHERE pa.date = p_for_date AND pa.period = tt.period AND pa.student_id = s.id
          LIMIT 1
        ) patt_period ON TRUE
        LEFT JOIN LATERAL (
          SELECT da.status FROM public.daily_attendance da
          WHERE da.date = p_for_date AND da.student_id = s.id
          LIMIT 1
        ) datt ON TRUE
        WHERE s.year = tt.year AND s.section = tt.section
      )::jsonb AS attendance,
      (
        SELECT r.replacement_staff FROM public.replacements r
        WHERE r.target_staff = p_target_staff AND r.for_date = p_for_date AND r.period = tt.period
          ORDER BY r.created_at DESC
        LIMIT 1
      )::uuid,
      (
        SELECT r.period FROM public.replacements r
        WHERE r.target_staff = p_target_staff AND r.for_date = p_for_date AND r.period = tt.period
          ORDER BY r.created_at DESC
        LIMIT 1
      )::integer
    FROM public.subjects sub WHERE sub.id = tt.subject_id;
  END LOOP;

  RETURN;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_staff_leave_attendance_as_v2(uuid, uuid, date) TO authenticated;
