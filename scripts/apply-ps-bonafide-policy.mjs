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

async function addPSBonafidePolicy() {
  console.log('Adding PS bonafide SELECT policy...\n');

  const policySQL = `
    -- Grant SELECT on bonafide_applications to users whose profile.role = 'ps'
    -- Run this in your Supabase SQL editor as a project admin.

    -- Ensure RLS is enabled (it likely already is):
    -- ALTER TABLE public.bonafide_applications ENABLE ROW LEVEL SECURITY;

    -- Create a policy that allows authenticated users to select rows when their profile role is 'ps'
    CREATE POLICY "Allow PS select bonafide" ON public.bonafide_applications
      FOR SELECT
      TO public
      USING ((SELECT role FROM public.profiles WHERE id = auth.uid()) = 'ps');
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

    console.log('After running the SQL, PS users should be able to see bonafide applications!');
  } catch (error) {
    console.error('❌ Error:', error);
  }
}

addPSBonafidePolicy();