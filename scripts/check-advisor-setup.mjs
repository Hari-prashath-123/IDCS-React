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
  auth: { persistSession: false }
});

async function checkAdvisorSetup() {
  console.log('Checking advisor setup...\n');

  // 1. Get all students with their mentor and advisor
  console.log('1. Checking students table:');
  const { data: students, error: studentsError } = await supabase
    .from('students')
    .select('id, reg_no, mentor_id, advisor_id')
    .limit(10);

  if (studentsError) {
    console.error('❌ Error querying students:', studentsError);
    return;
  }

  console.log(`Found ${students?.length || 0} students\n`);
  students?.forEach((s, i) => {
    console.log(`Student ${i + 1}:`);
    console.log(`  ID: ${s.id}`);
    console.log(`  Reg No: ${s.reg_no}`);
    console.log(`  Mentor ID: ${s.mentor_id || 'NOT SET ❌'}`);
    console.log(`  Advisor ID: ${s.advisor_id || 'NOT SET ❌'}`);
    console.log('');
  });

  // 2. Get staff who are advisors
  console.log('\n2. Checking staff who are advisors:');
  const { data: advisors, error: advisorsError } = await supabase
    .from('staff')
    .select('id, staff_id, staff_role, on_leave')
    .eq('staff_role', 'advisor');

  if (advisorsError) {
    console.error('❌ Error querying advisors:', advisorsError);
  } else {
    console.log(`Found ${advisors?.length || 0} advisors\n`);
    advisors?.forEach((a, i) => {
      console.log(`Advisor ${i + 1}:`);
      console.log(`  ID: ${a.id}`);
      console.log(`  Staff ID: ${a.staff_id}`);
      console.log(`  On Leave: ${a.on_leave ? 'YES' : 'NO'}`);
      console.log('');
    });
  }

  // 3. Check applications at advisor level
  console.log('\n3. Checking applications at advisor level:');
  const { data: apps, error: appsError } = await supabase
    .from('applications')
    .select('id, student_id, type, status, current_approver_level, created_at')
    .eq('current_approver_level', 'advisor')
    .eq('status', 'pending')
    .order('created_at', { ascending: false })
    .limit(5);

  if (appsError) {
    console.error('❌ Error querying applications:', appsError);
  } else {
    console.log(`Found ${apps?.length || 0} pending applications at advisor level\n`);
    if (apps && apps.length > 0) {
      for (const app of apps) {
        const student = students?.find(s => s.id === app.student_id);
        console.log(`Application:`);
        console.log(`  App ID: ${app.id.slice(0, 8)}...`);
        console.log(`  Type: ${app.type}`);
        console.log(`  Student ID: ${app.student_id.slice(0, 8)}...`);
        console.log(`  Student Advisor ID: ${student?.advisor_id?.slice(0, 8) || 'NOT SET ❌'}...`);
        console.log(`  Current Level: ${app.current_approver_level}`);
        console.log(`  Created: ${new Date(app.created_at).toLocaleString()}`);
        console.log('');
      }
    }
  }

  // 4. Check mentor leave status
  console.log('\n4. Checking mentors on leave:');
  const { data: mentorsOnLeave, error: mentorsError } = await supabase
    .from('staff')
    .select('id, staff_id, staff_role, on_leave')
    .eq('staff_role', 'mentor')
    .eq('on_leave', true);

  if (mentorsError) {
    console.error('❌ Error querying mentors on leave:', mentorsError);
  } else {
    console.log(`Found ${mentorsOnLeave?.length || 0} mentors on leave\n`);
    mentorsOnLeave?.forEach((m, i) => {
      console.log(`Mentor ${i + 1}:`);
      console.log(`  ID: ${m.id}`);
      console.log(`  Staff ID: ${m.staff_id}`);
      console.log(`  On Leave: YES ⚠️`);
      
      // Find students with this mentor
      const studentsWithThisMentor = students?.filter(s => s.mentor_id === m.id);
      console.log(`  Students: ${studentsWithThisMentor?.length || 0}`);
      console.log('');
    });
  }

  console.log('\n✅ Diagnostic complete!');
  console.log('\n⚠️  Common issues:');
  console.log('  - If advisor_id is NOT SET, students need to have advisor assigned');
  console.log('  - Advisor must match the advisor_id in students table to see applications');
  console.log('  - Application current_approver_level must be "advisor" for advisor to approve');
}

checkAdvisorSetup().catch(console.error);
