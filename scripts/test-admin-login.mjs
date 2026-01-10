import { createClient } from '@supabase/supabase-js';

const url = process.env.SUPABASE_URL;
const anonKey = process.env.SUPABASE_ANON_KEY;

if (!url || !anonKey) {
  console.error('Please set SUPABASE_URL and SUPABASE_ANON_KEY environment variables');
  process.exit(1);
}

const supabase = createClient(url, anonKey, { auth: { persistSession: false } });

async function main() {
  try {
    const email = 'admin@example.com';
    const password = 'Password123!';

    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) {
      console.error('Sign-in error:', error);
      process.exit(1);
    }
    console.log('Sign-in data:', data);

    const user = data?.user ?? null;
    if (user) {
      const { data: profileData, error: pErr } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', user.id)
        .maybeSingle();
      if (pErr) throw pErr;
      console.log('Profile:', profileData);
    }

    process.exit(0);
  } catch (err) {
    console.error('Error:', err.message || err);
    process.exit(1);
  }
}

main();
