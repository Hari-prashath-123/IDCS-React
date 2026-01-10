-- Make `department` column on subjects nullable so IQAC HOD can insert/update rows with NULL department

ALTER TABLE IF EXISTS public.subjects
  ALTER COLUMN department DROP NOT NULL;

-- No data migration required: existing rows keep their department values.
-- After applying this, client/server can insert rows with department = NULL for non-ALL groups.
