#!/usr/bin/env node
import dotenv from 'dotenv';
dotenv.config({ path: process.env.DOTENV_CONFIG_PATH || '.env.local' });
import fs from 'fs';
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY;

if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_KEY environment variables.');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });

async function main() {
  const args = process.argv.slice(2);
  if (args.length < 3) {
    console.error('Usage: node scripts/delete_students_by_class.mjs <DEPARTMENT> <YEAR> <SECTION>');
    console.error('Example: node scripts/delete_students_by_class.mjs "AI&DS" 3 B');
    process.exit(1);
  }
  const [departmentRaw, yearRaw, sectionRaw] = args;
  const department = String(departmentRaw || '').trim();
  const year = parseInt(yearRaw, 10);
  const section = String(sectionRaw || '').trim().toUpperCase();

  if (!department || !year || !section) {
    console.error('Invalid args. Department, year and section are required.');
    process.exit(1);
  }

  console.log(`Searching students in Department='${department}', Year=${year}, Section='${section}'`);

  // Step 1: fetch students by year+section
  const { data: studentsByClass, error: studentsErr } = await supabase
    .from('students')
    .select('id, year, section')
    .eq('year', year)
    .eq('section', section);

  if (studentsErr) {
    console.error('Failed to fetch students:', studentsErr);
    process.exit(1);
  }

  const ids = (studentsByClass || []).map(s => s.id);
  if (!ids || ids.length === 0) {
    console.log('No students found for that year/section. Nothing to delete.');
    return;
  }

  // Step 2: filter by profiles.department (case-insensitive trim)
  const { data: profiles, error: profilesErr } = await supabase
    .from('profiles')
    .select('id, email, name, department')
    .in('id', ids);

  if (profilesErr) {
    console.error('Failed to fetch profiles for students:', profilesErr);
    process.exit(1);
  }

  const matched = (profiles || []).filter(p => String(p.department || '').trim().toLowerCase() === String(department).trim().toLowerCase());
  if (matched.length === 0) {
    console.log('No students matched the specified department. Nothing to delete.');
    return;
  }

  console.log(`Found ${matched.length} students to delete.`);

  const logRows = [];

  for (const p of matched) {
    const id = p.id;
    console.log(`Deleting user ${p.name} <${p.email}> (id: ${id})`);
    const entry = { id, email: p.email, name: p.name, deleted: [], errors: [] };
    try {
      // delete students row
      const delStudent = await supabase.from('students').delete().eq('id', id);
      if (delStudent.error) entry.errors.push({ step: 'delete_student', detail: delStudent.error }); else entry.deleted.push('students');

      // delete staff row if present
      const delStaff = await supabase.from('staff').delete().eq('id', id);
      if (delStaff.error) entry.errors.push({ step: 'delete_staff', detail: delStaff.error }); else entry.deleted.push('staff');

      // delete profile
      const delProfile = await supabase.from('profiles').delete().eq('id', id);
      if (delProfile.error) entry.errors.push({ step: 'delete_profile', detail: delProfile.error }); else entry.deleted.push('profiles');

      // delete auth user via admin API
      try {
        if (supabase.auth && supabase.auth.admin && typeof supabase.auth.admin.deleteUser === 'function') {
          await supabase.auth.admin.deleteUser(id);
          entry.deleted.push('auth');
        } else if (supabase.auth && supabase.auth.admin && typeof supabase.auth.admin.deleteUserById === 'function') {
          await supabase.auth.admin.deleteUserById(id);
          entry.deleted.push('auth');
        } else {
          entry.errors.push({ step: 'delete_auth', detail: 'admin delete API not available on client' });
        }
      } catch (e) {
        entry.errors.push({ step: 'delete_auth', detail: e?.message || e });
      }
    } catch (e) {
      entry.errors.push({ step: 'unexpected', detail: String(e) });
    }

    logRows.push(entry);
  }

  const out = {
    deleted_count: logRows.filter(r => r.deleted.length > 0).length,
    details: logRows
  };

  const outPath = './reports/deleted_students_by_class.json';
  try {
    fs.mkdirSync('./reports', { recursive: true });
    fs.writeFileSync(outPath, JSON.stringify(out, null, 2), 'utf8');
    console.log(`Report written to ${outPath}`);
  } catch (e) {
    console.warn('Failed to write report file', e);
  }

  console.log('Done. Summary:');
  console.log(`${out.deleted_count} users processed. See ${outPath} for details.`);
}

main().catch((e) => { console.error('Script failed', e); process.exit(1); });
