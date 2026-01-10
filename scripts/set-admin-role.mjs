import { createClient } from '@supabase/supabase-js';

const url = process.env.SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_KEY;

if (!url || !serviceKey) {
  console.error('Please set SUPABASE_URL and SUPABASE_SERVICE_KEY as environment variables.');
  process.exit(1);
}

const supabase = createClient(url, serviceKey, {
  auth: { persistSession: false },
});

async function main() {
  try {
    const email = 'admin@example.com';
    const { data, error } = await supabase.from('profiles').select('id, role').eq('email', email).maybeSingle();
    if (error) throw error;
    if (!data) {
      console.error('No profile found for', email);
      process.exit(1);
    }
    console.log('Current profile:', data);

    const { data: updateData, error: updateErr } = await supabase.from('profiles').update({ role: 'admin' }).eq('email', email).select();
    if (updateErr) throw updateErr;
    console.log('Updated profile:', updateData);
    process.exit(0);
  } catch (err) {
    console.error('Error setting admin role:', err.message || err);
    process.exit(1);
  }
}

main();
