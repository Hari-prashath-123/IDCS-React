-- Complete Elective System Setup
-- Run this file to set up the entire elective selection system with seat management and locking

-- ==============================================
-- 1. Add group column to electives
-- ==============================================
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'electives' AND column_name = 'group'
  ) THEN
    ALTER TABLE electives ADD COLUMN "group" TEXT NOT NULL DEFAULT 'NONE';
    ALTER TABLE electives ADD CONSTRAINT electives_group_check 
      CHECK ("group" IN ('CG', 'EG', 'MG', 'NONE'));
    COMMENT ON COLUMN electives."group" IS 'CG=AI&DS/CSE/IT, EG=ECE/EEE, MG=ME/CIVIL';
  END IF;
END $$;

-- ==============================================
-- 2. Add is_active column to electives
-- ==============================================
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'electives' AND column_name = 'is_active'
  ) THEN
    ALTER TABLE electives ADD COLUMN is_active BOOLEAN DEFAULT true;
    COMMENT ON COLUMN electives.is_active IS 'Whether this elective is currently available for student selection';
  END IF;
END $$;

-- ==============================================
-- 3. Add seat_count column to electives
-- ==============================================
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'electives' AND column_name = 'seat_count'
  ) THEN
    ALTER TABLE electives ADD COLUMN seat_count INTEGER CHECK (seat_count IS NULL OR seat_count > 0);
    COMMENT ON COLUMN electives.seat_count IS 'Maximum number of students allowed (NULL = unlimited)';
  END IF;
END $$;

-- ==============================================
-- 4. Add seats_filled column to track enrollment
-- ==============================================
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'electives' AND column_name = 'seats_filled'
  ) THEN
    ALTER TABLE electives ADD COLUMN seats_filled INTEGER DEFAULT 0 CHECK (seats_filled >= 0);
    COMMENT ON COLUMN electives.seats_filled IS 'Number of students currently enrolled in this elective';
  END IF;
END $$;

-- ==============================================
-- 5. Fix unique constraint to allow same code across departments
-- ==============================================
-- Skip this section if constraint already exists
DO $$
BEGIN
  -- Drop old constraint if exists
  BEGIN
    ALTER TABLE electives DROP CONSTRAINT IF EXISTS idx_electives_parent_course;
  EXCEPTION
    WHEN undefined_object THEN NULL;
  END;
  
  -- Add new constraint including department (skip if already exists)
  BEGIN
    ALTER TABLE electives 
    ADD CONSTRAINT idx_electives_parent_course_dept 
    UNIQUE (parent_subject_id, course_code, department);
  EXCEPTION
    WHEN duplicate_table THEN 
      RAISE NOTICE 'Constraint idx_electives_parent_course_dept already exists, skipping...';
  END;
END $$;

-- ==============================================
-- 6. Add lock columns to student_electives
-- ==============================================
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'student_electives' AND column_name = 'is_locked'
  ) THEN
    ALTER TABLE student_electives ADD COLUMN is_locked BOOLEAN DEFAULT false;
    COMMENT ON COLUMN student_electives.is_locked IS 'Prevents student from changing selection after final submission';
  END IF;
  
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'student_electives' AND column_name = 'locked_at'
  ) THEN
    ALTER TABLE student_electives ADD COLUMN locked_at TIMESTAMPTZ;
    COMMENT ON COLUMN student_electives.locked_at IS 'Timestamp when selection was locked';
  END IF;
END $$;

-- ==============================================
-- 7. Student elective policies
-- ==============================================

-- Allow students to insert their own elective selections
DROP POLICY IF EXISTS "Students can insert own elective selection" ON student_electives;
CREATE POLICY "Students can insert own elective selection"
  ON student_electives FOR INSERT
  TO authenticated
  WITH CHECK (student_id = auth.uid());

-- Allow students to update ONLY if not locked
DROP POLICY IF EXISTS "Students can update own elective selection" ON student_electives;
CREATE POLICY "Students can update own elective selection"
  ON student_electives FOR UPDATE
  TO authenticated
  USING (student_id = auth.uid() AND is_locked = false)
  WITH CHECK (student_id = auth.uid());

-- ==============================================
-- 8. Create function to auto-update seats_filled
-- ==============================================

CREATE OR REPLACE FUNCTION update_elective_seats_filled()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    -- Increment seats_filled
    UPDATE electives 
    SET seats_filled = COALESCE(seats_filled, 0) + 1
    WHERE id = NEW.elective_id;
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    -- Decrement seats_filled
    UPDATE electives 
    SET seats_filled = GREATEST(COALESCE(seats_filled, 0) - 1, 0)
    WHERE id = OLD.elective_id;
    RETURN OLD;
  ELSIF TG_OP = 'UPDATE' THEN
    -- Handle change from one elective to another
    IF OLD.elective_id != NEW.elective_id THEN
      -- Decrement old elective
      UPDATE electives 
      SET seats_filled = GREATEST(COALESCE(seats_filled, 0) - 1, 0)
      WHERE id = OLD.elective_id;
      -- Increment new elective
      UPDATE electives 
      SET seats_filled = COALESCE(seats_filled, 0) + 1
      WHERE id = NEW.elective_id;
    END IF;
    RETURN NEW;
  END IF;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION update_elective_seats_filled() IS 'Automatically updates seats_filled count when students select/change/remove electives';

-- ==============================================
-- 9. Create trigger for automatic seat counting
-- ==============================================

DROP TRIGGER IF EXISTS trigger_update_seats_filled ON student_electives;
CREATE TRIGGER trigger_update_seats_filled
  AFTER INSERT OR UPDATE OR DELETE ON student_electives
  FOR EACH ROW
  EXECUTE FUNCTION update_elective_seats_filled();

-- ==============================================
-- 10. Initialize seats_filled for existing data
-- ==============================================

-- Calculate and set seats_filled for all electives based on existing student_electives
UPDATE electives e
SET seats_filled = (
  SELECT COUNT(*)
  FROM student_electives se
  WHERE se.elective_id = e.id
);

-- ==============================================
-- VERIFICATION QUERIES
-- ==============================================

-- Check electives table structure
SELECT column_name, data_type, is_nullable, column_default
FROM information_schema.columns
WHERE table_name = 'electives'
ORDER BY ordinal_position;

-- Check student_electives table structure
SELECT column_name, data_type, is_nullable, column_default
FROM information_schema.columns
WHERE table_name = 'student_electives'
ORDER BY ordinal_position;

-- Check policies
SELECT schemaname, tablename, policyname, permissive, roles, cmd, qual, with_check
FROM pg_policies
WHERE tablename IN ('electives', 'student_electives')
ORDER BY tablename, policyname;

COMMENT ON TABLE electives IS 'Stores elective subjects with group-based access, seat limits, and activation status';
COMMENT ON TABLE student_electives IS 'Stores student elective selections with lock capability to prevent changes';

-- Success message
DO $$
BEGIN
  RAISE NOTICE '✅ Elective system setup complete!';
  RAISE NOTICE '   - Group-based electives (CG/EG/MG)';
  RAISE NOTICE '   - Seat management with auto-counting';
  RAISE NOTICE '   - Student selection locking';
  RAISE NOTICE '   - Activation/deactivation control';
END $$;
