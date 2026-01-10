-- Check current constraint
SELECT conname, pg_get_constraintdef(oid) 
FROM pg_constraint 
WHERE conrelid = 'electives'::regclass 
AND conname LIKE '%group%';

-- Drop old constraint and create new one with ALL
ALTER TABLE electives DROP CONSTRAINT IF EXISTS electives_group_check;

-- Add new constraint that includes ALL
ALTER TABLE electives ADD CONSTRAINT electives_group_check 
CHECK ("group" IN ('CG', 'EG', 'MG', 'ALL', 'NONE'));

-- Verify the constraint
SELECT conname, pg_get_constraintdef(oid) 
FROM pg_constraint 
WHERE conrelid = 'electives'::regclass 
AND conname = 'electives_group_check';
