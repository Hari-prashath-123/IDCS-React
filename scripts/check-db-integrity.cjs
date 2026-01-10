const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

// Load environment variables from .env.local
const envPath = path.resolve(__dirname, '../.env.local');
if (fs.existsSync(envPath)) {
  const envConfig = fs.readFileSync(envPath, 'utf-8');
  envConfig.split('\n').forEach(line => {
    const [key, ...valueParts] = line.split('=');
    if (key && valueParts.length > 0) {
      const value = valueParts.join('=').replace(/"/g, '');
      if (key.startsWith('VITE_')) {
        process.env[key] = value;
      }
    }
  });
}

const SUPABASE_URL = process.env.VITE_SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.VITE_SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error('Error: Make sure VITE_SUPABASE_URL and VITE_SUPABASE_SERVICE_ROLE_KEY are in your .env.local file.');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

async function checkDatabaseIntegrity() {
  console.log('Running database integrity check...\n');

  try {
    // 1. Fetch all relevant data
    const { data: profiles, error: profilesError } = await supabase.from('profiles').select('id, name, email, role, department');
    if (profilesError) throw new Error(`Fetching profiles failed: ${profilesError.message}`);

    const { data: staff, error: staffError } = await supabase.from('staff').select('*');
    if (staffError) throw new Error(`Fetching staff failed: ${staffError.message}`);

    const { data: students, error: studentsError } = await supabase.from('students').select('*');
    if (studentsError) throw new Error(`Fetching students failed: ${studentsError.message}`);

    console.log(`Found ${profiles.length} profiles, ${staff.length} staff records, and ${students.length} student records.\n`);

    const staffIds = new Set(staff.map(s => s.id));
    const studentIds = new Set(students.map(s => s.id));

    let issuesFound = 0;

    // 2. Check for staff profiles missing staff records
    console.log('--- Checking Staff Integrity ---');
    const staffProfiles = profiles.filter(p => p.role === 'staff');
    if (staffProfiles.length === 0) {
        console.log('No profiles with role "staff" found.');
    } else {
        staffProfiles.forEach(profile => {
            if (!staffIds.has(profile.id)) {
              console.error(`[ISSUE] Staff profile found but no matching record in 'staff' table:`);
              console.error(`  - Name: ${profile.name}`);
              console.error(`  - Email: ${profile.email}`);
              console.error(`  - Department: ${profile.department}`);
              console.error(`  - User ID: ${profile.id}\n`);
              issuesFound++;
            }
        });
        if (staffProfiles.every(p => staffIds.has(p.id))) {
            console.log('✅ All staff profiles have a corresponding record in the "staff" table.');
        }
    }
    console.log('\n');


    // 3. Check for student profiles missing student records
    console.log('--- Checking Student Integrity ---');
    const studentProfiles = profiles.filter(p => p.role === 'student');
     if (studentProfiles.length === 0) {
        console.log('No profiles with role "student" found.');
    } else {
        studentProfiles.forEach(profile => {
            if (!studentIds.has(profile.id)) {
              console.error(`[ISSUE] Student profile found but no matching record in 'students' table:`);
              console.error(`  - Name: ${profile.name}`);
              console.error(`  - Email: ${profile.email}`);
              console.error(`  - Department: ${profile.department}`);
              console.error(`  - User ID: ${profile.id}\n`);
              issuesFound++;
            }
        });
        if (studentProfiles.every(p => studentIds.has(p.id))) {
            console.log('✅ All student profiles have a corresponding record in the "students" table.');
        }
    }
    console.log('\n');


    // 4. Final summary
    console.log('--- Summary ---');
    if (issuesFound === 0) {
      console.log('✅ No data integrity issues found. All profiles have their corresponding role-specific records.');
    } else {
      console.error(`Found ${issuesFound} total data integrity issues.`);
      console.error('This confirms that the creation process is failing to insert into the "staff" or "students" table.');
      console.error('RECOMMENDATION: Delete the users listed above from Supabase Authentication and recreate them using the admin UI in your app.');
    }

  } catch (error) {
    console.error('An unexpected error occurred during the check:', error.message);
  }
}

checkDatabaseIntegrity();
