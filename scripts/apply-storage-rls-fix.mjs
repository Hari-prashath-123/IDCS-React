#!/usr/bin/env node
import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('❌ Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local');
  process.exit(1);
}

console.log('');
console.log('='.repeat(70));
console.log('FIX STORAGE RLS POLICIES FOR OD-PROOFS BUCKET');
console.log('='.repeat(70));
console.log('');
console.log('🔒 This will set up Row-Level Security policies for the od-proofs bucket');
console.log('   to allow students to upload their application proofs.');
console.log('');
console.log('📝 To apply this fix:');
console.log('');
console.log('1. Go to your Supabase Dashboard SQL Editor:');
console.log('   ' + supabaseUrl + '/project/_/sql/new');
console.log('');
console.log('2. Copy and paste the following SQL:');
console.log('');
console.log('='.repeat(70));
console.log('');

const sqlPath = join(__dirname, 'fix-storage-rls.sql');
const sql = readFileSync(sqlPath, 'utf-8');
console.log(sql);

console.log('');
console.log('='.repeat(70));
console.log('');
console.log('3. Click "Run" to execute');
console.log('');
console.log('✅ After running, students will be able to upload proofs to:');
console.log('   /od-proofs/{their-user-id}/od/filename.ext');
console.log('   /od-proofs/{their-user-id}/leave/filename.ext');
console.log('   /od-proofs/{their-user-id}/bonafide/filename.ext');
console.log('');
console.log('🌐 Files will be publicly accessible via URLs for staff to view');
console.log('');
