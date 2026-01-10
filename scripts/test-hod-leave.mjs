import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function testHODLeave() {
  console.log('=== Testing HOD Leave → AHOD Acting as HOD ===\n');

  // Get student
  const { data: students } = await supabase
    .from('students')
    .select('*, profile:profiles!students_id_fkey(name)')
    .single();

  if (!students) {
    console.log('No students found');
    return;
  }

  console.log('Student:', students.reg_no, students.profile?.name);
  console.log('AHOD ID:', students.ahod_id);
  console.log('HOD ID:', students.hod_id);
  console.log('');

  // Get HOD staff info
  if (students.hod_id) {
    const { data: hodStaff } = await supabase
      .from('staff')
      .select('id, staff_id, on_leave, profile:profiles!staff_id_fkey(name)')
      .eq('id', students.hod_id)
      .single();

    console.log('HOD Status:');
    console.log(`  ${hodStaff.staff_id} - ${hodStaff.profile?.name}`);
    console.log(`  On Leave: ${hodStaff.on_leave ? '🔴 YES' : '✅ NO'}`);
    console.log('');
  }

  // Get AHOD staff info
  if (students.ahod_id) {
    const { data: ahodStaff } = await supabase
      .from('staff')
      .select('id, staff_id, on_leave, profile:profiles!staff_id_fkey(name)')
      .eq('id', students.ahod_id)
      .single();

    console.log('AHOD Status:');
    console.log(`  ${ahodStaff.staff_id} - ${ahodStaff.profile?.name}`);
    console.log(`  On Leave: ${ahodStaff.on_leave ? '🔴 YES' : '✅ NO'}`);
    console.log('');
  }

  // Get applications at hod level
  const { data: apps } = await supabase
    .from('applications')
    .select('*')
    .eq('student_id', students.id)
    .eq('current_approver_level', 'hod')
    .eq('status', 'pending');

  console.log(`Applications at HOD level: ${apps?.length || 0}`);
  apps?.forEach(app => {
    console.log(`  - ${app.type} (${app.id.slice(0, 8)}...)`);
  });
  console.log('');

  console.log('=== Test Instructions ===');
  console.log('1. Mark HOD as on leave in HOD dashboard');
  console.log('2. Ensure there\'s a pending application at HOD level');
  console.log('3. Login as AHOD');
  console.log('4. Navigate to the application page (e.g., /ahod/leave)');
  console.log('5. You should see:');
  console.log('   - Blue banner: "HOD is on leave - You are acting as HOD for final approval"');
  console.log('   - Approve/Reject buttons enabled');
  console.log('6. Approve the application');
  console.log('7. Check approval record - should show approver_role as "hod"');
  console.log('8. Check remarks - should include "[Note: Approved by AHOD acting as HOD (HOD on leave)]"');
}

testHODLeave().catch(console.error);
