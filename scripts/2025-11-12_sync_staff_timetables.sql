-- Migration: sync staff_timetables -> timetables
-- Adds a SECURITY DEFINER trigger function which keeps class timetables in sync
-- when staff_timetables rows are inserted/updated/deleted.
-- Behavior:
--  - On INSERT/UPDATE: if the staff has exactly ONE subject in the given department/year/section,
--    upsert that subject_id into timetables for the day_of_week/period if the cell is empty
--    OR already belongs to a subject that is assigned to the same staff.
--  - On DELETE (or when an UPDATE changes the old slot): if the existing timetables entry's
--    subject is assigned to the deleted staff, set subject_id = NULL (do not touch other staff's subjects).
-- IMPORTANT: Review and run this script with a DB backup. The function is created SECURITY DEFINER
-- so it can run even when RLS is in effect.

BEGIN;

-- Create the function
CREATE OR REPLACE FUNCTION public.sync_staff_timetable_to_class()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_dept text;
  v_year integer;
  v_section text;
  v_day integer;
  v_period integer;
  v_staff uuid;
  v_subject_id uuid;
  v_existing_subject uuid;
  v_existing_subject_staff uuid;
  v_cnt integer;
BEGIN
  -- Handle DELETE or the OLD part of UPDATE
  IF (TG_OP = 'DELETE') OR (TG_OP = 'UPDATE' AND (OLD.staff_id IS DISTINCT FROM NEW.staff_id OR OLD.department IS DISTINCT FROM NEW.department OR OLD.year IS DISTINCT FROM NEW.year OR OLD.section IS DISTINCT FROM NEW.section OR OLD.day_of_week IS DISTINCT FROM NEW.day_of_week OR OLD.period IS DISTINCT FROM NEW.period)) THEN
    v_dept := OLD.department;
    v_year := OLD.year;
    v_section := OLD.section;
    v_day := OLD.day_of_week;
    v_period := OLD.period;
    v_staff := OLD.staff_id;

    -- If a timetables row exists for this slot and its subject belongs to this staff, clear it
    SELECT subject_id INTO v_existing_subject
    FROM timetables
    WHERE department = v_dept
      AND year = v_year
      AND section = v_section
      AND day_of_week = v_day
      AND period = v_period
    LIMIT 1;

    IF v_existing_subject IS NOT NULL THEN
      SELECT staff_id INTO v_existing_subject_staff FROM subjects WHERE id = v_existing_subject LIMIT 1;
      IF v_existing_subject_staff = v_staff THEN
        -- clear the subject for that class slot
        UPDATE timetables
        SET subject_id = NULL, updated_at = now()
        WHERE department = v_dept
          AND year = v_year
          AND section = v_section
          AND day_of_week = v_day
          AND period = v_period;
      END IF;
    END IF;
  END IF;

  -- Handle INSERT or the NEW part of UPDATE
  IF (TG_OP = 'INSERT') OR (TG_OP = 'UPDATE') THEN
    v_dept := NEW.department;
    v_year := NEW.year;
    v_section := NEW.section;
    v_day := NEW.day_of_week;
    v_period := NEW.period;
    v_staff := NEW.staff_id;

    -- Find subjects for this class assigned to this staff
    SELECT COUNT(*) INTO v_cnt FROM subjects
    WHERE department = v_dept
      AND year = v_year
      AND section = v_section
      AND staff_id = v_staff;

    -- If the staff has at least one subject for this class, pick a deterministic subject.
    -- If multiple subjects exist, pick the earliest-created one (tie-breaker: smallest id).
    IF v_cnt >= 1 THEN
      IF v_cnt = 1 THEN
        SELECT id INTO v_subject_id FROM subjects
        WHERE department = v_dept
          AND year = v_year
          AND section = v_section
          AND staff_id = v_staff
        LIMIT 1;
      ELSE
        SELECT id INTO v_subject_id FROM subjects
        WHERE department = v_dept
          AND year = v_year
          AND section = v_section
          AND staff_id = v_staff
        ORDER BY created_at ASC, id ASC
        LIMIT 1;
      END IF;

      -- Get existing subject in the class slot
      SELECT subject_id INTO v_existing_subject
      FROM timetables
      WHERE department = v_dept
        AND year = v_year
        AND section = v_section
        AND day_of_week = v_day
        AND period = v_period
      LIMIT 1;

      IF v_existing_subject IS NULL THEN
        -- create or upsert the timetable row with the subject
        INSERT INTO timetables (department, year, section, day_of_week, period, subject_id, created_at, updated_at)
        VALUES (v_dept, v_year, v_section, v_day, v_period, v_subject_id, now(), now())
        ON CONFLICT (department, year, section, day_of_week, period)
        DO UPDATE SET subject_id = EXCLUDED.subject_id, updated_at = now();
      ELSE
        -- If existing subject is assigned to same staff (or is NULL) then allow update
        SELECT staff_id INTO v_existing_subject_staff FROM subjects WHERE id = v_existing_subject LIMIT 1;
        IF v_existing_subject_staff IS NULL OR v_existing_subject_staff = v_staff THEN
          UPDATE timetables
          SET subject_id = v_subject_id, updated_at = now()
          WHERE department = v_dept
            AND year = v_year
            AND section = v_section
            AND day_of_week = v_day
            AND period = v_period;
        END IF;
      END IF;
    END IF; -- when staff has at least one subject for that class
  END IF;

  RETURN NULL;
END;
$$;

-- Attach the trigger to staff_timetables
DROP TRIGGER IF EXISTS trg_sync_staff_timetable_to_class ON public.staff_timetables;
CREATE TRIGGER trg_sync_staff_timetable_to_class
AFTER INSERT OR UPDATE OR DELETE ON public.staff_timetables
FOR EACH ROW EXECUTE FUNCTION public.sync_staff_timetable_to_class();

COMMIT;

-- Notes:
-- - This function intentionally only writes to the 'timetables' table when it is safe to infer a single subject for the staff/class.
-- - If a staff teaches multiple subjects to the same class, the function will not change the class timetable to avoid overwriting ambiguity.
-- - Because the function is SECURITY DEFINER, ensure the function owner has appropriate privileges and review the function body for security compliance with your RLS policies.
