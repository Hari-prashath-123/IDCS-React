// scripts/fix-db-constraint.mjs
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

// Load environment variables from .env.local
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.resolve(__dirname, '../.env.local') });

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('Error: SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set in your .env.local file.');
  process.exit(1);
}

// Initialize Supabase client with service_role key for admin privileges
const supabase = createClient(supabaseUrl, supabaseServiceKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false
  }
});

async function fixDatabaseConstraint() {
  console.log('Connecting to Supabase to fix database constraints...');

  // Step 1: Drop the old, incorrect unique constraint.
  // The name is taken from the error message you provided.
  console.log('Step 1: Dropping legacy unique constraint `subjects_subject_code_department_year_key`...');
  const { error: dropError } = await supabase.rpc('execute_sql', {
    sql: `ALTER TABLE public.subjects DROP CONSTRAINT IF EXISTS subjects_subject_code_department_year_key;`
  });

  if (dropError) {
    // Log the error but attempt to continue, as the constraint might not exist, which is okay.
    console.warn(`Warning during drop (this may be safe if constraint did not exist):`, dropError.message);
  } else {
    console.log('Legacy constraint dropped successfully or did not exist.');
  }

  // Step 2: Create the new, correct unique index that includes the 'section' column.
  console.log('Step 2: Creating new unique index `idx_subjects_unique` on (subject_code, department, year, section)...');
  const { error: createIndexError } = await supabase.rpc('execute_sql', {
    sql: `CREATE UNIQUE INDEX IF NOT EXISTS idx_subjects_unique ON public.subjects(subject_code, department, year, section);`
  });

  if (createIndexError) {
    console.error('FATAL: Failed to create the new unique index.', createIndexError.message);
    console.error('This can happen if you have existing duplicate data in your `subjects` table that violates the new rule.');
    console.error('Please inspect your `subjects` table for rows with the same subject_code, department, year, and section, and remove duplicates before re-running this script.');
    process.exit(1);
  } else {
    console.log('New unique index `idx_subjects_unique` created successfully.');
  }
  
  // Step 3: We need a helper function in the DB to execute raw SQL.
  console.log('Step 3: Creating helper function `execute_sql` if it does not exist...');
  const { error: createFuncError } = await supabase.rpc('execute_sql', {
      sql: `
      CREATE OR REPLACE FUNCTION execute_sql(sql TEXT)
      RETURNS void AS $$
      BEGIN
        EXECUTE sql;
      END;
      $$ LANGUAGE plpgsql;
    `
  });

  if (createFuncError) {
      console.error('Error creating helper function:', createFuncError.message);
  } else {
      console.log('Helper function is ready.');
  }

  console.log('\nDatabase migration complete! Your `subjects` table should now correctly handle per-section entries.');
}

fixDatabaseConstraint();
