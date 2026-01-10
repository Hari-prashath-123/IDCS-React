import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function checkDatabase() {
  console.log('=== Database Check ===\n');

  // Check students
  const { data: students, error: studError } = await supabase
    .from('students')
    .select('*');

  console.log('Students found:', students?.length || 0);
  if (studError) console.error('Student error:', studError);

  // Check staff
  const { data: staff, error: staffError } = await supabase
    .from('staff')
    .select('*, profile:profiles!staff_id_fkey(name)');

  console.log('\nStaff found:', staff?.length || 0);
  if (staffError) console.error('Staff error:', staffError);
  
  staff?.forEach(s => {
    console.log(`  ${s.staff_id}: ${s.profile?.name} - Leave: ${s.on_leave}`);
  });

  // Check applications
  const { data: apps, error: appError } = await supabase
    .from('applications')
    .select('*');

  console.log('\nApplications found:', apps?.length || 0);
  if (appError) console.error('App error:', appError);

  apps?.forEach(app => {
    console.log(`  ${app.id.slice(0, 8)}... - ${app.type} - Status: ${app.status} - Level: ${app.current_approver_level}`);
  });
}

checkDatabase().catch(console.error);
