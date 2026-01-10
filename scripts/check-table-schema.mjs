#!/usr/bin/env node
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('❌ Missing environment variables');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey, {
  auth: { autoRefreshToken: false, persistSession: false }
});

async function checkTableColumns() {
  console.log('🔍 Checking applications table schema...\n');

  try {
    // Try to get the column information
    const { data, error } = await supabase
      .from('applications')
      .select('*')
      .limit(1);

    if (error) {
      console.error('❌ Error querying applications table:', error);
      return;
    }

    if (!data || data.length === 0) {
      console.log('⚠️  No applications in the database yet.');
      console.log('Cannot check schema from data. Checking via metadata...\n');
    } else {
      console.log('✅ Applications table exists');
      console.log('\n📋 Sample record structure:');
      const columns = Object.keys(data[0]);
      columns.forEach(col => {
        const value = data[0][col];
        const type = value === null ? 'null' : typeof value;
        console.log(`  - ${col}: ${type}`);
      });
      console.log('');
    }

    // Check for new columns
    const expectedNewColumns = [
      'subject',
      'body',
      'purpose',
      'fathers_name',
      'branch',
      'community',
      'study_mode',
      'bus_option',
      'bus_fare',
      'funding',
      'first_graduate',
      'metadata'
    ];

    console.log('🔍 Checking for new columns...\n');

    if (data && data.length > 0) {
      const existingColumns = Object.keys(data[0]);
      const missingColumns = expectedNewColumns.filter(col => !existingColumns.includes(col));

      if (missingColumns.length > 0) {
        console.log('❌ MISSING COLUMNS:');
        missingColumns.forEach(col => console.log(`  - ${col}`));
        console.log('\n⚠️  YOU NEED TO RUN THE MIGRATION!');
        console.log('\n📝 Steps to fix:');
        console.log('1. Go to: ' + supabaseUrl + '/project/_/sql');
        console.log('2. Copy SQL from: scripts/add-application-fields.sql');
        console.log('3. Paste and click "Run"');
        console.log('');
      } else {
        console.log('✅ All new columns are present!');
        expectedNewColumns.forEach(col => console.log(`  ✓ ${col}`));
        console.log('');
      }
    }

  } catch (error) {
    console.error('❌ Error:', error);
  }
}

checkTableColumns();
