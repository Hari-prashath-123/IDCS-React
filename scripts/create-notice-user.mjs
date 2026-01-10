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
});

async function createNoticeUser() {
  try {
    const email = 'notice@krct.ac.in';
    const password = 'Password123!';
    const role = 'notice';

    console.log(`Creating ${role} user: ${email}`);

    // Create auth user
    const { data: authData, error: authError } = await supabase.auth.admin.createUser({
      email,
      password,
      email_confirm: true
    });

    if (authError) {
      console.error('❌ Error creating auth user:', authError);
      throw authError;
    }

    const userId = authData?.user?.id;
    if (!userId) {
      console.error('❌ No user ID returned from auth creation');
      throw new Error('Failed to get user ID');
    }

    console.log('✅ Created auth user:', userId);

    // Create profile with notice role
    const { error: profileError } = await supabase.from('profiles').insert({
      id: userId,
      email,
      role,
      name: 'Notice Board',
      department: 'Administration'
    });

    if (profileError) {
      console.error('❌ Error creating profile:', profileError);
      throw profileError;
    }

    console.log('✅ Created profile with role:', role);
    console.log('\n🎉 Notice user created successfully!');
    console.log('📧 Email:', email);
    console.log('🔑 Password:', password);
    console.log('👤 Role:', role);

  } catch (error) {
    console.error('❌ Error creating notice user:', error);
    process.exit(1);
  }
}

createNoticeUser();