import { createClient } from '@supabase/supabase-js';

// Usage: node ./scripts/debug-app.mjs <type> <application_id>
// Example: node ./scripts/debug-app.mjs od b1a2c3d4-... 

const args = process.argv.slice(2);
if (args.length < 2) {
  console.error('Usage: node ./scripts/debug-app.mjs <type> <application_id>');
  process.exit(2);
}

const [type, appId] = args;
const tableMap = {
  od: 'od_applications',
  leave: 'leave_applications',
  gatepass: 'gatepass_applications',
  bonafide: 'bonafide_applications',
};
const approvalsMap = {
  od: 'od_approvals',
  leave: 'leave_approvals',
  gatepass: 'gatepass_approvals',
  bonafide: 'bonafide_approvals',
};

const tableName = tableMap[type];
const approvalsTable = approvalsMap[type];
if (!tableName) {
  console.error('Unknown type. Use one of: od, leave, gatepass, bonafide');
  process.exit(2);
}

const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const key = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY;
if (!url || !key) {
  console.error('Missing SUPABASE_URL and SUPABASE_ANON_KEY in environment.');
  process.exit(2);
}

const supabase = createClient(url, key);

(async () => {
  try {
    console.log('Fetching application', appId, 'from', tableName);
    const { data: app, error: appErr } = await supabase.from(tableName).select('*').eq('id', appId).maybeSingle();
    if (appErr) throw appErr;
    if (!app) {
      console.error('No application found with id', appId);
      process.exit(1);
    }

    console.log('\nApplication row:');
    console.log(JSON.stringify(app, null, 2));

    console.log('\nFetching approvals...');
    const { data: approvals, error: approvalsErr } = await supabase.from(approvalsTable).select('*').eq('application_id', appId).order('created_at', { ascending: true });
    if (approvalsErr) throw approvalsErr;
    console.log(JSON.stringify(approvals || [], null, 2));

    const studentId = app.student_id;
    console.log('\nFetching student and profile for', studentId);
    const [{ data: student }, { data: profile }] = await Promise.all([
      supabase.from('students').select('*').eq('id', studentId).maybeSingle(),
      supabase.from('profiles').select('*').eq('id', studentId).maybeSingle(),
    ]);
    console.log('student:', JSON.stringify(student, null, 2));
    console.log('profile:', JSON.stringify(profile, null, 2));

    const staffIds = new Set();
    if (student) {
      if (student.mentor_id) staffIds.add(student.mentor_id);
      if (student.advisor_id) staffIds.add(student.advisor_id);
      if (student.ahod_id) staffIds.add(student.ahod_id);
      if (student.hod_id) staffIds.add(student.hod_id);
    }

    if (staffIds.size > 0) {
      console.log('\nFetching staff leave statuses for:', Array.from(staffIds).join(', '));
      const { data: staffLeave } = await supabase.from('staff').select('id, staff_id, on_leave').in('id', Array.from(staffIds));
      console.log(JSON.stringify(staffLeave || [], null, 2));
    } else {
      console.log('\nNo staff ids on student');
    }

    // Also print recent approvals for the same student across all approval tables (for debugging duplicates)
    console.log('\nRecent approvals for this student across approval tables (last 20):');
    const allApprovals = [];
    for (const k of Object.values(approvalsMap)) {
      const { data } = await supabase.from(k).select('*').eq('application_id', appId).order('created_at', { ascending: true }).limit(100);
      if (data && data.length > 0) {
        allApprovals.push({ table: k, rows: data });
      }
    }
    console.log(JSON.stringify(allApprovals, null, 2));

    console.log('\nDone.');
    process.exit(0);
  } catch (err) {
    console.error('Error while debugging app:', err);
    process.exit(1);
  }
})();
