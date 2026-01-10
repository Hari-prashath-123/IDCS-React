#!/usr/bin/env node
import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import dotenv from 'dotenv';

// Load .env.local
dotenv.config({ path: '.env.local' });

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('❌ Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false
  }
});

async function applyMigration() {
  try {
    console.log('📂 Reading SQL migration file...');
    const sqlPath = join(__dirname, 'add-application-fields.sql');
    const sql = readFileSync(sqlPath, 'utf-8');

    console.log('🚀 Applying database migration...');
    
    // Split by semicolon and execute each statement
    const statements = sql
      .split(';')
      .map(s => s.trim())
      .filter(s => s.length > 0 && !s.startsWith('--') && !s.startsWith('COMMENT'));

    for (const statement of statements) {
      const { error } = await supabase.rpc('exec_sql', { sql_query: statement });
      
      // If exec_sql function doesn't exist, try direct query
      if (error && error.message.includes('function') && error.message.includes('does not exist')) {
        console.log('⚠️  exec_sql function not available, using direct query...');
        // For ALTER TABLE statements, we'll need to use the REST API or SQL editor
        console.log('📝 Execute this SQL manually in Supabase SQL Editor:');
        console.log('');
        console.log(sql);
        console.log('');
        console.log('Visit: ' + supabaseUrl.replace('.supabase.co', '.supabase.co') + '/project/_/sql');
        return;
      }
      
      if (error) {
        console.error('❌ Error executing statement:', error);
        console.error('Statement:', statement.substring(0, 100) + '...');
        throw error;
      }
    }

    console.log('✅ Migration applied successfully!');
    console.log('');
    console.log('New columns added to applications table:');
    console.log('  - subject (for OD, Leave, Gatepass)');
    console.log('  - body (for OD, Leave)');
    console.log('  - purpose (for Bonafide)');
    console.log('  - fathers_name (for Bonafide)');
    console.log('  - branch (for Bonafide)');
    console.log('  - community (for Bonafide)');
    console.log('  - study_mode (for Bonafide)');
    console.log('  - bus_option (for Bonafide)');
    console.log('  - bus_fare (for Bonafide)');
    console.log('  - funding (for Bonafide)');
    console.log('  - first_graduate (for Bonafide)');
    console.log('  - metadata (JSONB for additional data)');

  } catch (error) {
    console.error('❌ Migration failed:', error);
    process.exit(1);
  }
}

// Since exec_sql might not be available, let's provide instructions
console.log('');
console.log('='.repeat(60));
console.log('DATABASE MIGRATION: Add Application Fields');
console.log('='.repeat(60));
console.log('');
console.log('To apply this migration, please:');
console.log('');
console.log('1. Go to your Supabase Dashboard SQL Editor:');
console.log('   ' + supabaseUrl + '/project/_/sql');
console.log('');
console.log('2. Copy and paste the SQL from:');
console.log('   scripts/add-application-fields.sql');
console.log('');
console.log('3. Click "Run" to execute the migration');
console.log('');
console.log('Alternatively, you can run the SQL statements manually:');
console.log('');

const sqlPath = join(__dirname, 'add-application-fields.sql');
const sql = readFileSync(sqlPath, 'utf-8');
console.log(sql);
console.log('');
console.log('='.repeat(60));
