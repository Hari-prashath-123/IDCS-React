import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function debugAhodApproval() {
  console.log('=== AHOD Approval Debug ===\n');

  // Get all students with their staff assignments
  const { data: students } = await supabase
    .from('students')
    .select('*, profile:profiles(name)');

  if (!students || students.length === 0) {
    console.log('No students found');
    return;
  }

  const student = students[0];
  console.log('Student:', student.reg_no, student.profile?.name);
  console.log('Mentor ID:', student.mentor_id);
  console.log('Advisor ID:', student.advisor_id);
  console.log('AHOD ID:', student.ahod_id);
  console.log('HOD ID:', student.hod_id);
  console.log('');

  // Get staff leave status
  const { data: staffList } = await supabase
    .from('staff')
    .select('id, staff_id, on_leave, profile:profiles(name)')
    .in('id', [student.mentor_id, student.advisor_id, student.ahod_id].filter(Boolean));

  console.log('Staff Leave Status:');
  staffList?.forEach(staff => {
    const role = 
      staff.id === student.mentor_id ? 'MENTOR' :
      staff.id === student.advisor_id ? 'ADVISOR' :
      staff.id === student.ahod_id ? 'AHOD' : 'UNKNOWN';
    console.log(`  ${role} (${staff.staff_id}):`, staff.on_leave ? '🔴 ON LEAVE' : '✅ ACTIVE', '-', staff.profile?.name);
  });
  console.log('');

  // Get all applications
  const { data: apps } = await supabase
    .from('applications')
    .select('*')
    .eq('student_id', student.id)
    .order('created_at', { ascending: false });

  console.log(`Found ${apps?.length || 0} applications:\n`);

  apps?.forEach(app => {
    console.log(`Application ${app.id.slice(0, 8)}...`);
    console.log(`  Type: ${app.type}`);
    console.log(`  Status: ${app.status}`);
    console.log(`  Current Level: ${app.current_approver_level}`);
    console.log(`  Created: ${new Date(app.created_at).toLocaleString()}`);
    console.log('');
  });

  // Get approvals
  const { data: approvals } = await supabase
    .from('approvals')
    .select('*, application:applications(type)')
    .in('application_id', apps?.map(a => a.id) || [])
    .order('created_at', { ascending: true });

  if (approvals?.length) {
    console.log('Approval History:');
    approvals.forEach(approval => {
      console.log(`  App: ${approval.application_id.slice(0, 8)}... (${approval.application?.type})`);
      console.log(`    Role: ${approval.approver_role}`);
      console.log(`    Action: ${approval.action}`);
      console.log(`    Time: ${new Date(approval.created_at).toLocaleString()}`);
      console.log('');
    });
  }

  // Check what AHOD should see
  console.log('=== AHOD Perspective ===');
  const ahodId = student.ahod_id;
  console.log('AHOD User ID:', ahodId);
  console.log('');

  const advisorOnLeave = staffList?.find(s => s.id === student.advisor_id)?.on_leave || false;
  console.log('Advisor On Leave:', advisorOnLeave);
  console.log('');

  const pendingForAhod = apps?.filter(app => 
    app.status === 'pending' && 
    (app.current_approver_level === 'ahod' || 
     (app.current_approver_level === 'advisor' && advisorOnLeave))
  );

  console.log(`Applications AHOD should be able to approve: ${pendingForAhod?.length || 0}`);
  pendingForAhod?.forEach(app => {
    console.log(`  ${app.id.slice(0, 8)}... - ${app.type} - Level: ${app.current_approver_level}`);
    console.log(`    Advisor on leave: ${advisorOnLeave}`);
    console.log(`    Should show approve button: YES`);
  });
}

debugAhodApproval().catch(console.error);
