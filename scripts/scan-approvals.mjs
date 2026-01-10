import dotenv from 'dotenv';
// Prefer loading .env.local for this workspace so dev variables are available to scripts
dotenv.config({ path: '.env.local' });
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || process.env.SUPABASE_ANON_URL;
const SUPABASE_KEY = process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY || process.env.SUPABASE_KEY;

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error('Missing Supabase URL or anon key. Ensure .env.local has VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, { auth: { persistSession: false } });

const approvalsTables = ['od_approvals','leave_approvals','gatepass_approvals','bonafide_approvals'];
const applicationTables = ['od_applications','leave_applications','gatepass_applications','bonafide_applications'];

const arg = process.argv[2];
if (!arg) {
  console.log('Usage: node ./scripts/scan-approvals.mjs <reg_no|app_id|approver_id>');
  process.exit(0);
}

const isUUID = (s) => /^[0-9a-fA-F-]{36,36}$/.test(s);
const isRegNo = (s) => /^[0-9]{10,}$/.test(s) || /^[0-9]{4,}$/.test(s);

(async () => {
  try {
    console.log('Scanning approvals for:', arg);

    let student = null;
    if (isRegNo(arg)) {
      console.log('Detected reg_no, looking up student...');
      const { data: students, error } = await supabase.from('students').select('*').eq('reg_no', arg).limit(1).maybeSingle();
      if (error) throw error;
      student = students || null;
      if (!student) console.log('No student found with reg_no', arg);
      else console.log('Found student', { id: student.id, reg_no: student.reg_no });
    }

    // If we have student, collect application ids across app tables
    let appIds = [];
    if (student) {
      for (const t of applicationTables) {
        const { data, error } = await supabase.from(t).select('id, student_id, created_at').eq('student_id', student.id).order('created_at', { ascending: false }).limit(50);
        if (error) {
          console.error('Error querying', t, error.message || error);
          continue;
        }
        if (data && data.length) {
          console.log(`Found ${data.length} apps in ${t}`);
          appIds.push(...data.map(r => ({ id: r.id, table: t, created_at: r.created_at })));
        }
      }
    }

    // Search approvals tables for matches by approver_id, application_id, approver_role ILIKE '%ahod%'
    const results = [];
    for (const t of approvalsTables) {
      let q = supabase.from(t).select('*').limit(200).order('created_at', { ascending: false });

      if (isUUID(arg)) {
        q = q.or(`approver_id.eq.${arg},application_id.eq.${arg}`);
      } else if (student && appIds.length > 0) {
        const ids = appIds.map(a => a.id);
        q = q.in('application_id', ids);
      } else {
        // fallback: search by role contains 'ahod'
        q = q.ilike('approver_role', '%ahod%');
      }

      const { data, error } = await q;
      if (error) {
        console.error('Error querying', t, error.message || error);
        continue;
      }
      if (data && data.length) {
        results.push({ table: t, rows: data });
      }
    }

    // Also run a global fuzzy search for approver_role ILIKE '%ahod%'
    const fuzzy = [];
    for (const t of approvalsTables) {
      const { data, error } = await supabase.from(t).select('*').ilike('approver_role', '%ahod%').order('created_at', { ascending: false }).limit(200);
      if (!error && data && data.length) fuzzy.push({ table: t, rows: data });
    }

    console.log('=== Direct matches by approver_id/application_id or student apps ===');
    if (results.length === 0) console.log('No direct matches found');
    for (const r of results) {
      console.log(`Table: ${r.table} (${r.rows.length} rows)`);
      console.log(JSON.stringify(r.rows.slice(0, 20), null, 2));
    }

    console.log('\n=== Fuzzy approver_role contains "ahod" (recent) ===');
    if (fuzzy.length === 0) console.log('No fuzzy ahod rows found');
    for (const r of fuzzy) {
      console.log(`Table: ${r.table} (${r.rows.length} rows)`);
      console.log(JSON.stringify(r.rows.slice(0, 20), null, 2));
    }

    // If we found appIds, show them
    if (appIds.length) {
      console.log('\nApplications for student:');
      console.log(JSON.stringify(appIds.slice(0, 50), null, 2));
    }

    console.log('\nDone.');
  } catch (e) {
    console.error('Scan failed', e);
    process.exit(2);
  }
})();
