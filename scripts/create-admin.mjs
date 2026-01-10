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
    const password = 'Password123!';

    // create auth user
    // create auth user
    const res = await supabase.auth.admin.createUser({ email, password, email_confirm: true });
    console.log('createUser response:');
    console.dir(res, { depth: null });
    const data = res?.data || res;
    const error = res?.error || null;
    if (error) {
      console.error('Error creating auth user (detailed):');
      console.dir(error, { depth: null });
      throw error;
    }
    const userId = data?.user?.id || data?.id || (data && data[0] && data[0].id) || null;
    if (!userId) {
      console.error('Unexpected createUser response, no user id:');
      console.dir(res, { depth: null });
      throw new Error('No user id returned from createUser');
    }
    console.log('Created auth user:', email, userId);

    // insert profile — use 'staff' role so it satisfies existing DB constraint
    const { error: pErr } = await supabase.from('profiles').insert({
      id: userId,
      email,
      role: 'staff',
      name: 'Administrator',
      dob: '1970-01-01',
      department: 'Administration',
    });
    if (pErr) throw pErr;
    console.log('Inserted profile for admin user.\nCredentials:');
    console.log(`${email} / ${password}`);

    process.exit(0);
  } catch (err) {
    console.error('Error creating admin user:', err.message || err);
    process.exit(1);
  }
}

main();
