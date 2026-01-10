#!/usr/bin/env node
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseAnonKey = process.env.SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  console.error('❌ Missing environment variables');
  process.exit(1);
}

console.log('🧪 Testing RLS policy with anon key (simulating client)...\n');

// Skip the client test for now, just check service role
// Test with one of the student accounts
// const testEmail = 'luffy@gmail.com'; // One of your students

const supabase = createClient(supabaseUrl, supabaseAnonKey);

async function testRLS() {
  try {
    // Sign in as student
    console.log(`📝 Signing in as ${testEmail}...`);
    const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
      email: testEmail,
      password: testPassword,
    });

    if (authError) {
      console.error('❌ Auth error:', authError);
      console.log('\n⚠️  Cannot test without valid credentials');
      console.log('Please ensure the student account exists and you have the correct password');
      return;
    }

    const userId = authData.user?.id;
    const userEmail = authData.user?.email;

    console.log('✅ Signed in successfully');
    console.log(`   User ID: ${userId}`);
    console.log(`   Email: ${userEmail}\n`);

    // Check if student record exists
    console.log('🔍 Checking student record...');
    const { data: student, error: studentError } = await supabase
      .from('students')
      .select('*')
      .eq('id', userId)
      .maybeSingle();

    if (studentError) {
      console.error('❌ Error fetching student:', studentError);
      return;
    }

    if (!student) {
      console.error('❌ No student record found for this user!');
      console.log('   This will cause RLS errors.');
      return;
    }

    console.log('✅ Student record found');
    console.log(`   Reg No: ${student.reg_no}`);
    console.log(`   Year: ${student.year}, Section: ${student.section}\n`);

    // Try to insert a test application
    console.log('🧪 Testing application insert...');
    const testPayload = {
      student_id: userId,
      type: 'od',
      reason: 'TEST APPLICATION - Please delete',
      from_date: '2025-11-10',
      to_date: '2025-11-10',
      subject: 'Test Subject',
      body: 'Test body for RLS check',
      status: 'pending',
      current_approver_level: 'mentor',
    };

    console.log('📦 Payload:', JSON.stringify(testPayload, null, 2));

    const { data: inserted, error: insertError } = await supabase
      .from('applications')
      .insert(testPayload)
      .select();

    if (insertError) {
      console.error('\n❌ INSERT FAILED!');
      console.error('Error:', insertError);
      console.error('\nThis is the same RLS error you\'re experiencing.');
      console.error('The issue is with the RLS policy or the authentication state.\n');
    } else {
      console.log('\n✅ INSERT SUCCEEDED!');
      console.log('Data:', inserted);
      console.log('\nRLS is working correctly. The issue might be in the browser.');
      
      // Clean up the test application
      if (inserted && inserted.length > 0) {
        console.log('\n🧹 Cleaning up test application...');
        await supabase.from('applications').delete().eq('id', inserted[0].id);
        console.log('✅ Test application deleted\n');
      }
    }

    // Sign out
    await supabase.auth.signOut();

  } catch (error) {
    console.error('❌ Unexpected error:', error);
  }
}

// Note: Node.js doesn't have a prompt function, so we'll use a hardcoded test
console.log('⚠️  This script requires manual password entry.');
console.log('Instead, let\'s check if we can see the issue from the service role...\n');

// Use service role to check RLS policies
const supabaseService = createClient(
  supabaseUrl,
  process.env.SUPABASE_SERVICE_ROLE_KEY || '',
  { auth: { autoRefreshToken: false, persistSession: false } }
);

async function checkRLSPolicies() {
  console.log('🔒 Checking RLS policies on applications table...\n');

  try {
    // This query bypasses RLS, so it will work with service role
    const { data, error } = await supabaseService
      .from('applications')
      .select('*')
      .limit(1);

    if (error) {
      console.error('❌ Error:', error);
      return;
    }

    console.log('✅ Service role can access applications table');
    console.log(`   Found ${data?.length || 0} application(s)\n`);

    // Check if we can see policy information
    console.log('💡 To debug RLS issues:');
    console.log('1. Check browser console for "=== DEBUG:" messages');
    console.log('2. Verify auth.uid() matches student_id in payload');
    console.log('3. Ensure session is not expired');
    console.log('4. Try signing out and back in\n');

  } catch (error) {
    console.error('❌ Error:', error);
  }
}

checkRLSPolicies();
