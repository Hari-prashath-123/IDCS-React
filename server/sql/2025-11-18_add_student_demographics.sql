-- Add demographic/contact fields to students table
ALTER TABLE students
  ADD COLUMN IF NOT EXISTS father_number TEXT,
  ADD COLUMN IF NOT EXISTS mother_number TEXT,
  ADD COLUMN IF NOT EXISTS community TEXT,
  -- Residence should be either 'Hosteler' or 'Dayscholler' (string stored).
  -- `college_bus` is a yes/no option stored as a boolean.
  ADD COLUMN IF NOT EXISTS residence TEXT,
  ADD COLUMN IF NOT EXISTS phone_number TEXT,
  ADD COLUMN IF NOT EXISTS college_bus BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS management BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS first_graduate BOOLEAN DEFAULT FALSE;

-- Optional: add a check constraint for residence values (silently ignored if already exists)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints tc
    JOIN information_schema.check_constraints cc ON cc.constraint_name = tc.constraint_name
    WHERE tc.table_name = 'students' AND cc.constraint_name = 'students_residence_check'
  ) THEN
    ALTER TABLE students
      ADD CONSTRAINT students_residence_check CHECK (residence IS NULL OR residence IN ('Hosteler', 'Dayscholler'));
  END IF;
EXCEPTION WHEN duplicate_object THEN
  -- constraint already exists, ignore
  NULL;
END$$;
