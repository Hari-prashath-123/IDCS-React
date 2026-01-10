import { createClient } from '@supabase/supabase-js';

const url = process.env.SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_KEY;

if (!url || !serviceKey) {
  console.error('Please set SUPABASE_URL and SUPABASE_SERVICE_KEY as environment variables.');
  process.exit(1);
}

const supabase = createClient(url, serviceKey, {
  auth: { persistSession: false },
});

async function main() {
  try {
    const users = [
      { email: 'student1@example.com', password: 'Password123!', role: 'student', name: 'Student One', dob: '2004-01-01', department: 'CSE', reg_no: 'REG2025001', roll_no: 'R001', year: 2, section: 'A' },
      { email: 'mentor1@example.com', password: 'Password123!', role: 'staff', staff_role: 'mentor', name: 'Mentor One', dob: '1985-03-15', department: 'CSE', staff_id: 'STF1001' },
      { email: 'advisor1@example.com', password: 'Password123!', role: 'staff', staff_role: 'advisor', name: 'Advisor One', dob: '1982-07-10', department: 'CSE', staff_id: 'STF1002' },
      { email: 'ahod1@example.com', password: 'Password123!', role: 'ahod', staff_role: 'lecturer', name: 'AHOD One', dob: '1975-05-20', department: 'CSE', staff_id: 'STF1003' },
      { email: 'hod1@example.com', password: 'Password123!', role: 'hod', staff_role: 'lecturer', name: 'HOD One', dob: '1970-11-02', department: 'CSE', staff_id: 'STF1004' },
    ];

    const created = {};

    console.log('Creating auth users...');
    for (const u of users) {
      try {
        const { data, error } = await supabase.auth.admin.createUser({
          email: u.email,
          password: u.password,
          email_confirm: true,
        });
        if (error) {
          console.warn(`Auth createUser error for ${u.email}:`, error.message || error);
          // Try to fall back to existing profile id if present
          const { data: prof } = await supabase.from('profiles').select('id').eq('email', u.email).maybeSingle();
          if (prof && prof.id) {
            console.log(`Found existing profile for ${u.email} -> ${prof.id}`);
            created[u.email] = { ...u, id: prof.id };
            continue;
          }
          throw error;
        }
        console.log(`Created auth user: ${u.email} -> ${data.user.id}`);
        created[u.email] = { ...u, id: data.user.id };
      } catch (e) {
        console.warn(`createUser exception for ${u.email}:`, e.message || e);
        const { data: prof } = await supabase.from('profiles').select('id').eq('email', u.email).maybeSingle();
        if (prof && prof.id) {
          console.log(`Using existing profile id for ${u.email} -> ${prof.id}`);
          created[u.email] = { ...u, id: prof.id };
          continue;
        }
        throw e;
      }
    }

    // Insert or upsert profiles
    console.log('Inserting/upserting profiles...');
    const profiles = users.map((u) => ({
      id: created[u.email].id,
      email: u.email,
      role: u.role,
      name: u.name,
      dob: u.dob,
      department: u.department,
    }));

    // Use upsert on email to avoid duplicate key errors when re-running
    let { error: pErr } = await supabase.from('profiles').upsert(profiles, { onConflict: 'email' });
    if (pErr) throw pErr;
    console.log('Inserted/upserted profiles.');

    // Insert staff rows for staff/ahod/hod
    const staffUsers = users.filter((u) => u.role === 'staff' || u.role === 'ahod' || u.role === 'hod');
    if (staffUsers.length > 0) {
      const staffInserts = staffUsers.map((u) => ({
        id: created[u.email].id,
        staff_id: u.staff_id || `STF-${Math.random().toString(36).slice(2, 8)}`,
        staff_role: u.staff_role || 'lecturer',
        year: u.year ?? null,
        section: u.section ?? null,
        ahod_id: null,
        hod_id: null,
      }));

      // Upsert staff rows by id so re-running script is idempotent
      let { error: sErr } = await supabase.from('staff').upsert(staffInserts, { onConflict: 'id' });
      if (sErr) throw sErr;
      console.log('Inserted/upserted staff rows.');
    }

    // Insert student row and connect to mentor/advisor/ahod/hod
    const student = users.find((u) => u.role === 'student');
    if (student) {
      const mentorId = created['mentor1@example.com'].id;
      const advisorId = created['advisor1@example.com'].id;
      const ahodId = created['ahod1@example.com'].id;
      const hodId = created['hod1@example.com'].id;

      const studentRow = {
        id: created[student.email].id,
        reg_no: student.reg_no,
        roll_no: student.roll_no,
        year: student.year,
        section: student.section,
        mentor_id: mentorId,
        advisor_id: advisorId,
        ahod_id: ahodId,
        hod_id: hodId,
      };

      let { error: stErr } = await supabase.from('students').insert([studentRow]);
      if (stErr) throw stErr;
      console.log('Inserted student row.');
    }

    console.log('\nSample users created successfully. Login credentials:');
    for (const u of users) {
      console.log(`${u.email} / ${u.password} (role: ${u.role})`);
    }

    process.exit(0);
  } catch (e) {
    console.error('Error creating sample users:', e.message || e);
    process.exit(1);
  }
}

main();
