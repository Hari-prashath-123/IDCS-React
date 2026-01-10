import dotenv from 'dotenv';
dotenv.config({ path: process.env.DOTENV_CONFIG_PATH || '.env.local' });
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error('Missing SUPABASE_URL or SERVICE_KEY in environment');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });

async function main() {
  try {
    const classYear = 1;
    const classSection = 'A';
    const department = 'AI&DS';

    const studentIds = [
      '0950445b-2e9b-4399-9201-7774a91c4937',
      '49ee5570-338a-4779-b8eb-0f0af932ebf4'
    ];

    console.log('\n1) Students in class year=' + classYear + " section='" + classSection + "'\n");
    const { data: classStudents, error: classStudentsErr } = await supabase
      .from('students')
      .select('id, reg_no, roll_no, year, section, mentor_id, advisor_id, ahod_id, hod_id')
      .eq('year', classYear)
      .eq('section', classSection)
      .order('id');
    if (classStudentsErr) console.error('Error fetching class students:', classStudentsErr);
    console.log(JSON.stringify(classStudents, null, 2));

    console.log('\n2) Profiles for those class students\n');
    const classIds = (classStudents || []).map(s => s.id);
    const { data: classProfiles, error: classProfilesErr } = await supabase
      .from('profiles')
      .select('id, email, name, department')
      .in('id', classIds);
    if (classProfilesErr) console.error('Error fetching class profiles:', classProfilesErr);
    console.log(JSON.stringify(classProfiles, null, 2));

    console.log('\n3) Applications for those class students\n');
    const { data: classApps, error: classAppsErr } = await supabase
      .from('applications')
      .select('id, student_id, type, status, created_at')
      .in('student_id', classIds)
      .order('created_at', { ascending: false });
    if (classAppsErr) console.error('Error fetching class applications:', classAppsErr);
    console.log(JSON.stringify(classApps, null, 2));

    console.log('\n4) Counts per class student\n');
    // supabase-js doesn't support a .group() helper; compute counts locally from the fetched applications
    const cnts = {};
    (classApps || []).forEach(a => { cnts[a.student_id] = (cnts[a.student_id] || 0) + 1; });
    // Ensure we show zero for any student with no apps
    classIds.forEach(id => { if (!cnts[id]) cnts[id] = 0; });
    console.log(JSON.stringify(cnts, null, 2));

    console.log('\n5) Inspect the two specific student IDs you asked about\n');
    const { data: studentsTwo, error: studentsTwoErr } = await supabase
      .from('students')
      .select('id, reg_no, roll_no, year, section, mentor_id, advisor_id')
      .in('id', studentIds);
    if (studentsTwoErr) console.error('Error fetching provided students:', studentsTwoErr);
    console.log(JSON.stringify(studentsTwo, null, 2));

    console.log('\n6) Profiles for those two students\n');
    const { data: profilesTwo, error: profilesTwoErr } = await supabase
      .from('profiles')
      .select('id, email, name, department')
      .in('id', studentIds);
    if (profilesTwoErr) console.error('Error fetching profiles for provided students:', profilesTwoErr);
    console.log(JSON.stringify(profilesTwo, null, 2));

    console.log('\n7) Applications for those two students\n');
    const { data: appsTwo, error: appsTwoErr } = await supabase
      .from('applications')
      .select('id, student_id, type, status, created_at')
      .in('student_id', studentIds)
      .order('created_at', { ascending: false });
    if (appsTwoErr) console.error('Error fetching applications for provided students:', appsTwoErr);
    console.log(JSON.stringify(appsTwo, null, 2));

    console.log('\n8) Recent applications with joined profile/student info (limit 200)\n');
    // PostgREST relationship shorthand (profiles!inner / students!left) can fail if FKs aren't in the schema cache.
    // Instead, fetch recent apps and then fetch profiles/students by ID and merge locally.
    const { data: recentApps, error: recentAppsErr } = await supabase
      .from('applications')
      .select('id, student_id, type, status, created_at')
      .order('created_at', { ascending: false })
      .limit(200);
    if (recentAppsErr) console.error('Error fetching recentApps:', recentAppsErr);

    const recentStudentIds = [...new Set((recentApps || []).map(a => a.student_id))];
    let recentStudents = [];
    let recentProfiles = [];
    if (recentStudentIds.length) {
      const { data: recentStudentsData, error: recentStudentsErr } = await supabase
        .from('students')
        .select('id, year, section')
        .in('id', recentStudentIds);
      if (recentStudentsErr) console.error('Error fetching recentStudents:', recentStudentsErr);
      else recentStudents = recentStudentsData || [];

      const { data: recentProfilesData, error: recentProfilesErr } = await supabase
        .from('profiles')
        .select('id, email, name, department')
        .in('id', recentStudentIds);
      if (recentProfilesErr) console.error('Error fetching recentProfiles:', recentProfilesErr);
      else recentProfiles = recentProfilesData || [];
    }

    const studentsById = {};
    recentStudents.forEach(s => { studentsById[s.id] = s; });
    const profilesById = {};
    recentProfiles.forEach(p => { profilesById[p.id] = p; });

    const mergedRecent = (recentApps || []).map(a => ({
      app_id: a.id,
      student_id: a.student_id,
      type: a.type,
      status: a.status,
      created_at: a.created_at,
      student: studentsById[a.student_id] || null,
      profile: profilesById[a.student_id] || null
    }));
    console.log(JSON.stringify(mergedRecent, null, 2));

    console.log('\n9) Orphaned applications (student_id missing in students table)\n');
    // Fetch all student ids and then check applications whose student_id is missing
    const { data: allStudents, error: allStudentsErr } = await supabase
      .from('students')
      .select('id');
    if (allStudentsErr) console.error('Error fetching all students ids:', allStudentsErr);
    const studentIdSet = new Set((allStudents || []).map(s => s.id));

    const { data: allApps, error: allAppsErr } = await supabase
      .from('applications')
      .select('id, student_id, type, status, created_at')
      .order('created_at', { ascending: false })
      .limit(2000);
    if (allAppsErr) console.error('Error fetching all applications for orphan check:', allAppsErr);

    const orphanFiltered = (allApps || []).filter(a => !studentIdSet.has(a.student_id));
    console.log(JSON.stringify(orphanFiltered.slice(0, 50), null, 2));

    console.log('\nDone');
  } catch (err) {
    console.error('Unexpected error', err);
  } finally {
    process.exit(0);
  }
}

main();
