#!/usr/bin/env node
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY;

const supabase = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { persistSession: false }
});

async function checkAllApps() {
  const { data: apps } = await supabase
    .from('applications')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(10);

  console.log(`Total applications: ${apps?.length || 0}\n`);
  apps?.forEach((app, i) => {
    console.log(`App ${i + 1}:`);
    console.log(`  ID: ${app.id.slice(0, 8)}...`);
    console.log(`  Type: ${app.type}`);
    console.log(`  Status: ${app.status}`);
    console.log(`  Current Level: ${app.current_approver_level}`);
    console.log(`  Created: ${new Date(app.created_at).toLocaleString()}`);
    console.log('');
  });
}

checkAllApps().catch(console.error);
