#!/usr/bin/env node
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('❌ Missing environment variables');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey, {
  auth: { autoRefreshToken: false, persistSession: false }
});

async function checkStudentSetup() {
  console.log('🔍 Checking your student account setup...\n');

  try {
    // Get all students
    const { data: students, error: studentsError } = await supabase
      .from('students')
      .select('id, reg_no, year, section, mentor_id, advisor_id, ahod_id, hod_id');

    if (studentsError) throw studentsError;

    console.log(`📊 Found ${students?.length || 0} student(s) in the database\n`);

    if (!students || students.length === 0) {
      console.log('⚠️  No students found in the database!');
      console.log('');
      console.log('To fix this:');
      console.log('1. You need to be added as a student by an admin');
      console.log('2. Or run a script to create student records');
      console.log('');
      return;
    }

    // Show all students
    students.forEach((s, i) => {
      console.log(`Student ${i + 1}:`);
      console.log(`  ID: ${s.id}`);
      console.log(`  Reg No: ${s.reg_no}`);
      console.log(`  Year: ${s.year}, Section: ${s.section}`);
      console.log(`  Mentor ID: ${s.mentor_id || 'Not assigned'}`);
      console.log(`  Advisor ID: ${s.advisor_id || 'Not assigned'}`);
      console.log(`  AHOD ID: ${s.ahod_id || 'Not assigned'}`);
      console.log(`  HOD ID: ${s.hod_id || 'Not assigned'}`);
      console.log('');
    });

    // Check profiles
    const { data: profiles, error: profilesError } = await supabase
      .from('profiles')
      .select('id, name, email, role');

    if (profilesError) throw profilesError;

    console.log(`👤 Found ${profiles?.length || 0} profile(s):\n`);
    
    profiles?.forEach((p, i) => {
      const isStudent = students.some(s => s.id === p.id);
      console.log(`Profile ${i + 1}:`);
      console.log(`  ID: ${p.id}`);
      console.log(`  Name: ${p.name}`);
      console.log(`  Email: ${p.email}`);
      console.log(`  Role: ${p.role}`);
      console.log(`  Has student record: ${isStudent ? '✅ Yes' : '❌ No'}`);
      console.log('');
    });

    // Check if there are profiles without student records
    const profilesWithoutStudentRecord = profiles?.filter(
      p => p.role === 'student' && !students.some(s => s.id === p.id)
    );

    if (profilesWithoutStudentRecord && profilesWithoutStudentRecord.length > 0) {
      console.log('⚠️  WARNING: These student profiles have no student record:');
      profilesWithoutStudentRecord.forEach(p => {
        console.log(`  - ${p.name} (${p.email}) - ID: ${p.id}`);
      });
      console.log('');
      console.log('This will cause RLS errors when submitting applications!');
      console.log('Students need a record in the "students" table to submit applications.');
      console.log('');
    }

  } catch (error) {
    console.error('❌ Error:', error);
  }
}

checkStudentSetup();
