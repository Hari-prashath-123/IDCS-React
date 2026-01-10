-- ============================================
-- DROP OLD APPLICATIONS AND APPROVALS TABLES
-- ============================================
-- Run this ONLY after verifying:
-- 1. All data has been migrated to new tables
-- 2. All code has been updated to use new tables
-- 3. Application workflows are working correctly
-- ============================================

BEGIN;

-- Verification queries before deletion
-- Run these first to confirm everything is migrated:

-- Check if any data exists in old tables:
DO $$
DECLARE
    old_apps_count INTEGER;
    old_approvals_count INTEGER;
    new_total_count INTEGER;
BEGIN
    -- Count old table records
    SELECT COUNT(*) INTO old_apps_count FROM applications;
    SELECT COUNT(*) INTO old_approvals_count FROM approvals;
    
    -- Count new table records
    SELECT 
        (SELECT COUNT(*) FROM od_applications) +
        (SELECT COUNT(*) FROM leave_applications) +
        (SELECT COUNT(*) FROM gatepass_applications) +
        (SELECT COUNT(*) FROM bonafide_applications)
    INTO new_total_count;
    
    RAISE NOTICE 'Old applications table count: %', old_apps_count;
    RAISE NOTICE 'Old approvals table count: %', old_approvals_count;
    RAISE NOTICE 'New tables total count: %', new_total_count;
    
    -- Verify migration
    IF new_total_count < old_apps_count THEN
        RAISE EXCEPTION 'Migration incomplete! New tables have fewer records than old table.';
    END IF;
    
    RAISE NOTICE 'Migration verification passed!';
END $$;

-- Show detailed comparison
SELECT 
    'OD' as type,
    (SELECT COUNT(*) FROM applications WHERE type='od') as old_count,
    (SELECT COUNT(*) FROM od_applications) as new_count
UNION ALL
SELECT 'Leave',
    (SELECT COUNT(*) FROM applications WHERE type='leave'),
    (SELECT COUNT(*) FROM leave_applications)
UNION ALL
SELECT 'Gatepass',
    (SELECT COUNT(*) FROM applications WHERE type='gatepass'),
    (SELECT COUNT(*) FROM gatepass_applications)
UNION ALL
SELECT 'Bonafide',
    (SELECT COUNT(*) FROM applications WHERE type='bonafide'),
    (SELECT COUNT(*) FROM bonafide_applications);

-- If verification looks good, uncomment the following DROP statements:

-- Drop foreign key constraints first (if any exist)
-- Note: Our new tables don't reference the old tables, so this should be safe

-- Drop old tables
-- WARNING: This is permanent and cannot be undone!
-- Make sure you have a backup before running this!

DROP TABLE IF EXISTS approvals CASCADE;
DROP TABLE IF EXISTS applications CASCADE;

-- Verify tables are dropped
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'applications') THEN
        RAISE EXCEPTION 'Failed to drop applications table!';
    END IF;
    
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'approvals') THEN
        RAISE EXCEPTION 'Failed to drop approvals table!';
    END IF;
    
    RAISE NOTICE 'Old tables successfully dropped!';
END $$;

-- List all application-related tables to confirm
SELECT table_name 
FROM information_schema.tables 
WHERE table_schema = 'public' 
  AND table_name LIKE '%application%' 
  OR table_name LIKE '%approval%'
ORDER BY table_name;

COMMIT;

-- ============================================
-- ROLLBACK PLAN (if needed):
-- ============================================
-- If something goes wrong, you can restore from the backup:
-- 1. Re-run the split-applications-tables.sql script
-- 2. The script recreates tables and migrates data
-- ============================================
