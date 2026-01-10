-- Resolve ambiguous staff→subject mappings by choosing the earliest-created subject for that staff/class
-- WARNING: This will pick a subject when a staff has multiple subjects for the same department/year/section.
-- Usage:
-- 1) Dry-run (default): perform_apply := false; run in Supabase SQL editor to see what would be changed.
-- 2) Apply: set perform_apply := true after taking a DB backup and run again.

DO $$
DECLARE
  perform_apply boolean := false; -- set to true to perform updates
  st_row RECORD;
  chosen_subject uuid;
  existing_subject uuid;
  existing_subject_staff uuid;
  applied_count integer := 0;
BEGIN
  RAISE NOTICE 'Resolve ambiguous timetables dry-run: perform_apply = %', perform_apply;

  FOR st_row IN
    SELECT st.staff_id, st.department, st.year, st.section, st.day_of_week, st.period
    FROM staff_timetables st
    JOIN (
      SELECT department, year, section, staff_id, COUNT(*) AS cnt
      FROM subjects
      GROUP BY department, year, section, staff_id
      HAVING COUNT(*) > 1
    ) s ON s.department = st.department AND s.year = st.year AND s.section = st.section AND s.staff_id = st.staff_id
  LOOP
    -- choose the subject with earliest created_at (tie-breaker: smallest id)
    SELECT id INTO chosen_subject
    FROM subjects
    WHERE department = st_row.department
      AND year = st_row.year
      AND section = st_row.section
      AND staff_id = st_row.staff_id
    ORDER BY created_at ASC, id ASC
    LIMIT 1;

    RAISE NOTICE 'Ambiguous slot: staff=% class=%-%-% day=% period=% -> chosen_subject=%', st_row.staff_id, st_row.department, st_row.year, st_row.section, st_row.day_of_week, st_row.period, chosen_subject;

    -- inspect existing timetable for this slot
    SELECT subject_id INTO existing_subject
    FROM timetables
    WHERE department = st_row.department
      AND year = st_row.year
      AND section = st_row.section
      AND day_of_week = st_row.day_of_week
      AND period = st_row.period
    LIMIT 1;

    IF existing_subject IS NULL THEN
      IF perform_apply THEN
        INSERT INTO timetables (department, year, section, day_of_week, period, subject_id, created_at, updated_at)
        VALUES (st_row.department, st_row.year, st_row.section, st_row.day_of_week, st_row.period, chosen_subject, now(), now())
        ON CONFLICT (department, year, section, day_of_week, period)
        DO UPDATE SET subject_id = EXCLUDED.subject_id, updated_at = now();
        applied_count := applied_count + 1;
        RAISE NOTICE 'Inserted/Upserted timetable for %-%-% day=% period=% -> subject=%', st_row.department, st_row.year, st_row.section, st_row.day_of_week, st_row.period, chosen_subject;
      END IF;
    ELSE
      -- if existing subject belongs to same staff or is NULL, we may update
      SELECT staff_id INTO existing_subject_staff FROM subjects WHERE id = existing_subject LIMIT 1;
      IF existing_subject_staff IS NULL OR existing_subject_staff = st_row.staff_id THEN
        IF perform_apply THEN
          UPDATE timetables
          SET subject_id = chosen_subject, updated_at = now()
          WHERE department = st_row.department
            AND year = st_row.year
            AND section = st_row.section
            AND day_of_week = st_row.day_of_week
            AND period = st_row.period;
          applied_count := applied_count + 1;
          RAISE NOTICE 'Updated timetable for %-%-% day=% period=% -> subject=%', st_row.department, st_row.year, st_row.section, st_row.day_of_week, st_row.period, chosen_subject;
        ELSE
          RAISE NOTICE 'Would update timetable for %-%-% day=% period=% -> subject=%', st_row.department, st_row.year, st_row.section, st_row.day_of_week, st_row.period, chosen_subject;
        END IF;
      ELSE
        RAISE NOTICE 'Skipping slot %-%-% day=% period=% because existing subject belongs to different staff', st_row.department, st_row.year, st_row.section, st_row.day_of_week, st_row.period;
      END IF;
    END IF;
  END LOOP;

  RAISE NOTICE 'Dry-run complete. Would apply % changes. Set perform_apply := true to apply.', applied_count;
END$$;
