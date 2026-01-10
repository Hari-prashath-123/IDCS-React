-- Safe fix: populate/repair `timetables` from `staff_timetables` where unambiguous
-- Usage:
-- 1) DRY-RUN: set perform_apply := false; run the file in Supabase SQL editor.
-- 2) APPLY: set perform_apply := true; run again (after DB backup).

DO $$
DECLARE
  perform_apply boolean := false; -- <-- set to true to perform updates
  rec RECORD;
  v_subject_id uuid;
  v_cnt integer;
  applied_count integer := 0;
BEGIN
  RAISE NOTICE 'Running dry-run: perform_apply = %', perform_apply;

  -- Summary counts
  RAISE NOTICE 'Total timetables rows: %', (SELECT count(*) FROM timetables);
  RAISE NOTICE 'Total staff_timetables rows: %', (SELECT count(*) FROM staff_timetables);

  -- Find candidate staff_timetables rows where staff has exactly one subject for that class
  RAISE NOTICE 'Listing candidates (staff_timetables rows where staff has exactly one subject for the class):';
  FOR rec IN
    SELECT st.staff_id, st.department, st.year, st.section, st.day_of_week, st.period
    FROM staff_timetables st
    JOIN (
      SELECT department, year, section, staff_id, count(*) as cnt
      FROM subjects
      GROUP BY department, year, section, staff_id
    ) s ON s.department = st.department AND s.year = st.year AND s.section = st.section AND s.staff_id = st.staff_id
    WHERE s.cnt = 1
  LOOP
    -- See what timetables contains for this slot
    SELECT id, subject_id INTO rec FROM timetables
      WHERE department = rec.department
        AND year = rec.year
        AND section = rec.section
        AND day_of_week = rec.day_of_week
        AND period = rec.period
      LIMIT 1;
    RAISE NOTICE 'Candidate: staff=% department=% year=% section=% day=% period=% existing_subject=%', rec.staff_id, rec.department, rec.year, rec.section, rec.day_of_week, rec.period, rec.subject_id;
  END LOOP;

  -- Count how many of those would lead to an insert/update (i.e. where timetables either missing or has NULL or belongs to same staff)
  RAISE NOTICE 'Computing number of safe apply actions...';
  FOR rec IN
    SELECT st.staff_id, st.department, st.year, st.section, st.day_of_week, st.period
    FROM staff_timetables st
    JOIN (
      SELECT department, year, section, staff_id, count(*) as cnt
      FROM subjects
      GROUP BY department, year, section, staff_id
    ) s ON s.department = st.department AND s.year = st.year AND s.section = st.section AND s.staff_id = st.staff_id
    WHERE s.cnt = 1
  LOOP
    SELECT id, subject_id INTO v_subject_id FROM subjects
      WHERE department = rec.department
        AND year = rec.year
        AND section = rec.section
        AND staff_id = rec.staff_id
      LIMIT 1;

    IF v_subject_id IS NULL THEN
      CONTINUE; -- safety: skip if no subject found
    END IF;

    -- Check existing timetables subject and who owns it
    SELECT subject_id INTO rec FROM timetables
      WHERE department = rec.department
        AND year = rec.year
        AND section = rec.section
        AND day_of_week = rec.day_of_week
        AND period = rec.period
      LIMIT 1;

    IF rec.subject_id IS NULL THEN
      applied_count := applied_count + 1;
    ELSE
      -- If existing subject belongs to same staff, it's safe to overwrite
      SELECT staff_id INTO v_cnt FROM subjects WHERE id = rec.subject_id LIMIT 1;
      IF v_cnt::text = rec.staff_id::text THEN
        applied_count := applied_count + 1;
      END IF;
    END IF;
  END LOOP;

  RAISE NOTICE 'Safe apply would update/insert % timetable cells.', applied_count;

  IF perform_apply THEN
    RAISE NOTICE 'Applying changes (perform_apply = true)';
    applied_count := 0;

    FOR rec IN
      SELECT st.staff_id, st.department, st.year, st.section, st.day_of_week, st.period
      FROM staff_timetables st
      JOIN (
        SELECT department, year, section, staff_id, count(*) as cnt
        FROM subjects
        GROUP BY department, year, section, staff_id
      ) s ON s.department = st.department AND s.year = st.year AND s.section = st.section AND s.staff_id = st.staff_id
      WHERE s.cnt = 1
    LOOP
      SELECT id INTO v_subject_id FROM subjects
        WHERE department = rec.department
          AND year = rec.year
          AND section = rec.section
          AND staff_id = rec.staff_id
        LIMIT 1;
      IF v_subject_id IS NULL THEN
        CONTINUE;
      END IF;

      -- Get existing subject in timetable
      SELECT subject_id INTO v_cnt FROM timetables
        WHERE department = rec.department
          AND year = rec.year
          AND section = rec.section
          AND day_of_week = rec.day_of_week
          AND period = rec.period
        LIMIT 1;

      IF v_cnt IS NULL THEN
        INSERT INTO timetables (department, year, section, day_of_week, period, subject_id, created_at, updated_at)
        VALUES (rec.department, rec.year, rec.section, rec.day_of_week, rec.period, v_subject_id, now(), now())
        ON CONFLICT (department, year, section, day_of_week, period)
        DO UPDATE SET subject_id = EXCLUDED.subject_id, updated_at = now();
        applied_count := applied_count + 1;
      ELSE
        -- If existing subject belongs to same staff, update
        SELECT staff_id INTO v_cnt FROM subjects WHERE id = v_cnt LIMIT 1;
        IF v_cnt::text = rec.staff_id::text THEN
          UPDATE timetables
          SET subject_id = v_subject_id, updated_at = now()
          WHERE department = rec.department
            AND year = rec.year
            AND section = rec.section
            AND day_of_week = rec.day_of_week
            AND period = rec.period;
          applied_count := applied_count + 1;
        END IF;
      END IF;
    END LOOP;

    RAISE NOTICE 'Applied % changes to timetables.', applied_count;
  ELSE
    RAISE NOTICE 'Dry run complete. No changes applied. Set perform_apply := true to apply.';
  END IF;
END$$;
