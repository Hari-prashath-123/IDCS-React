import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import path from 'path';

// Load .env.local if present to populate process.env for convenience
const loadLocalEnv = () => {
  try {
    const p = path.join(process.cwd(), '.env.local');
    if (!fs.existsSync(p)) return;
    const raw = fs.readFileSync(p, 'utf8');
    raw.split(/\r?\n/).forEach(line => {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*("?)(.*)\2\s*$/i);
      if (m) {
        const key = m[1];
        const val = m[3];
        if (!process.env[key]) process.env[key] = val;
      }
    });
  } catch (e) {
    /* ignore */
  }
};

loadLocalEnv();

// Usage:
// node ./scripts/debug-find-app.mjs <app_id|reg_no>
// Examples:
// node ./scripts/debug-find-app.mjs 29b1a545-6c6b-4683-85a4-a06559657b4d
// node ./scripts/debug-find-app.mjs 2303811724321005

const args = process.argv.slice(2);
if (args.length < 1) {
  console.error('Usage: node ./scripts/debug-find-app.mjs <app_id|reg_no>');
  process.exit(2);
}

const query = args[0];
const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const key = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY;
if (!url || !key) {
  console.error('Missing SUPABASE_URL and SUPABASE_ANON_KEY in environment.');
  process.exit(2);
}

const supabase = createClient(url, key);

const appTables = {
  od: 'od_applications',
  leave: 'leave_applications',
  gatepass: 'gatepass_applications',
  bonafide: 'bonafide_applications',
};
const approvalsTables = {
  od: 'od_approvals',
  leave: 'leave_approvals',
  gatepass: 'gatepass_approvals',
  bonafide: 'bonafide_approvals',
};

(async () => {
  try {
    let student = null;
    // if query looks like uuid (contains '-') treat as app id search
    const isUuid = query.includes('-');
    if (!isUuid) {
      // treat as reg_no -> find student by reg_no (don't compare against UUID id)
      console.log('Searching student by reg_no:', query);
      const { data: studentRow, error: stErr } = await supabase.from('students').select('*').eq('reg_no', query).maybeSingle();
      if (stErr) throw stErr;
      if (!studentRow) {
        console.log('No student found with reg_no:', query);
      } else {
        student = studentRow;
        console.log('Found student:', JSON.stringify(student, null, 2));
      }
    }

    let foundAny = false;
    for (const [type, table] of Object.entries(appTables)) {
      if (isUuid) {
        const { data, error } = await supabase.from(table).select('*').eq('id', query).maybeSingle();
        if (error) throw error;
        if (data) {
          foundAny = true;
          console.log(`\nFound in table ${table} (type=${type}):`);
          console.log(JSON.stringify(data, null, 2));

          const approvalsTable = approvalsTables[type];
          const { data: approvals } = await supabase.from(approvalsTable).select('*').eq('application_id', query).order('created_at', { ascending: true });
          console.log('Approvals:', JSON.stringify(approvals || [], null, 2));

          const studentId = data.student_id;
          if (studentId) {
            const [{ data: studentRow }, { data: profileRow }] = await Promise.all([
              supabase.from('students').select('*').eq('id', studentId).maybeSingle(),
              supabase.from('profiles').select('*').eq('id', studentId).maybeSingle(),
            ]);
            console.log('Student:', JSON.stringify(studentRow, null, 2));
            console.log('Profile:', JSON.stringify(profileRow, null, 2));

            const staffIds = [];
            if (studentRow?.mentor_id) staffIds.push(studentRow.mentor_id);
            if (studentRow?.advisor_id) staffIds.push(studentRow.advisor_id);
            if (studentRow?.ahod_id) staffIds.push(studentRow.ahod_id);
            if (studentRow?.hod_id) staffIds.push(studentRow.hod_id);
            if (staffIds.length > 0) {
              const { data: staffLeave } = await supabase.from('staff').select('id, staff_id, on_leave').in('id', staffIds);
              console.log('Staff leave:', JSON.stringify(staffLeave || [], null, 2));
            }
          }
        }
      } else {
        // search by student id
        if (!student) continue;
        const { data, error } = await supabase.from(table).select('*').eq('student_id', student.id).order('created_at', { ascending: false }).limit(50);
        if (error) throw error;
        if (data && data.length > 0) {
          foundAny = true;
          console.log(`\nFound ${data.length} rows in ${table} for student ${student.id} (type=${type}):`);
          console.log(JSON.stringify(data.map(d => ({ id: d.id, status: d.status, current_approver_level: d.current_approver_level, created_at: d.created_at })), null, 2));

          // print approvals for each
          for (const d of data) {
            const approvalsTable = approvalsTables[type];
            const { data: approvals } = await supabase.from(approvalsTable).select('*').eq('application_id', d.id).order('created_at', { ascending: true });
            console.log(`Approvals for ${d.id}:`, JSON.stringify(approvals || [], null, 2));
          }
        }
      }
    }

    if (!foundAny) console.log('\nNo matching applications found in any table.');
    console.log('\nDone.');
    process.exit(0);
  } catch (err) {
    console.error('Error:', err);
    process.exit(1);
  }
})();
