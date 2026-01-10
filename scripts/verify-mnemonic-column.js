// Verification script to check if mnemonic column was added
// Run with: node scripts/verify-mnemonic-column.js

require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');

(async () => {
  try {
    const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

    console.log('Verifying mnemonic column in subjects table...');

    const { data: subjects, error } = await supabase
      .from('subjects')
      .select('id, subject_code, name, mnemonic')
      .limit(1);

    if (error) {
      console.error('Error:', error);
      return;
    }

    if (subjects && subjects.length > 0) {
      console.log('✅ Subjects table columns:', Object.keys(subjects[0]));
      console.log('✅ Has mnemonic column:', Object.keys(subjects[0]).includes('mnemonic'));

      if (Object.keys(subjects[0]).includes('mnemonic')) {
        console.log('🎉 SUCCESS: mnemonic column has been added to the subjects table!');
      } else {
        console.log('❌ FAILED: mnemonic column not found. Please run the SQL script in Supabase.');
      }
    } else {
      console.log('No subjects found in table');
    }

  } catch (err) {
    console.error('Error:', err);
  }
})();