import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || process.env.SUPABASE_ANON_URL;
const SUPABASE_KEY = process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY || process.env.SUPABASE_KEY;
if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error('Missing Supabase URL or anon key. Ensure .env.local has VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY');
  process.exit(1);
}
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, { auth: { persistSession: false } });

const applicationTables = ['od_applications','leave_applications','gatepass_applications','bonafide_applications'];
const arg = process.argv[2];
if (!arg) { console.log('Usage: node ./scripts/get-application.mjs <application_id>'); process.exit(0); }

(async () => {
  try {
    const appId = arg;
    console.log('Looking up application id:', appId);
    let found = false;
    for (const t of applicationTables) {
      const { data, error } = await supabase.from(t).select('*').eq('id', appId).maybeSingle();
      if (error) {
        console.error('Error querying', t, error.message || error);
        continue;
      }
      if (data) {
        console.log(`Found in table: ${t}`);
        console.log(JSON.stringify(data, null, 2));
        found = true;
      }
    }
    if (!found) console.log('No application found with that id in known application tables');
  } catch (e) {
    console.error('Failed', e);
    process.exit(2);
  }
})();