#!/usr/bin/env node
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY;

if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error('❌ Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { persistSession: false },
  db: { schema: 'public' }
});

async function addStaffUpdatePolicy() {
  console.log('Adding staff UPDATE policy...\n');

  const policySQL = `
    DROP POLICY IF EXISTS "Staff can update own data" ON staff;
    
    CREATE POLICY "Staff can update own data"
      ON staff FOR UPDATE
      TO authenticated
      USING (id = auth.uid())
      WITH CHECK (id = auth.uid());
  `;

  try {
    // Note: Supabase JS client doesn't have direct SQL execution
    // We need to use the REST API or run this manually
    console.log('⚠️  Cannot execute SQL directly via Supabase JS client.');
    console.log('\n📋 Please run this SQL in your Supabase SQL Editor:\n');
    console.log('----------------------------------------');
    console.log(policySQL);
    console.log('----------------------------------------\n');
    console.log('Or navigate to: https://supabase.com/dashboard/project/_/sql');
    console.log('And paste the SQL above.\n');
    
    console.log('After running the SQL, test the leave toggle in your app!');
  } catch (error) {
    console.error('❌ Error:', error);
  }
}

addStaffUpdatePolicy();
