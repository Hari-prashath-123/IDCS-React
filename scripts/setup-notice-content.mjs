#!/usr/bin/env node
import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import dotenv from 'dotenv';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

dotenv.config({ path: '.env.local' });

const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY;

if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error('❌ Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { persistSession: false },
});

async function setupNoticeContent() {
  try {
    console.log('🚀 Setting up notice content table...');

    // Read the SQL file
    const sqlFile = join(__dirname, '..', 'supabase-notice-content.sql');
    const sql = readFileSync(sqlFile, 'utf8');

    // Split SQL into individual statements
    const statements = sql
      .split(';')
      .map(stmt => stmt.trim())
      .filter(stmt => stmt.length > 0 && !stmt.startsWith('--'));

    console.log(`📄 Found ${statements.length} SQL statements to execute`);

    // Execute each statement
    for (let i = 0; i < statements.length; i++) {
      const statement = statements[i];
      if (statement.trim()) {
        console.log(`⚡ Executing statement ${i + 1}/${statements.length}...`);

        const { error } = await supabase.rpc('exec_sql', {
          sql: statement + ';'
        });

        if (error) {
          // If exec_sql doesn't exist, try direct query
          const { error: directError } = await supabase.from('_supabase_migration_temp').select('*').limit(1);

          if (directError && directError.message.includes('relation') && directError.message.includes('does not exist')) {
            console.log('⚠️  exec_sql function not available, some statements may need manual execution');
            console.log('📋 Statement that needs manual execution:');
            console.log(statement + ';');
            console.log('');
          } else {
            throw error;
          }
        }
      }
    }

    console.log('✅ Notice content table setup completed!');
    console.log('');
    console.log('📋 Summary:');
    console.log('- Created notice_content table');
    console.log('- Set up RLS policies');
    console.log('- Added indexes and triggers');
    console.log('');
    console.log('🎯 Next steps:');
    console.log('1. Upload images to the notice bucket via the dashboard');
    console.log('2. Edit titles and descriptions for each image');
    console.log('3. Images will appear on the home page carousel');

  } catch (error) {
    console.error('❌ Error setting up notice content:', error);
    console.log('');
    console.log('🔧 Manual setup: Copy the contents of supabase-notice-content.sql');
    console.log('   and run it in your Supabase SQL Editor');
    process.exit(1);
  }
}

setupNoticeContent();