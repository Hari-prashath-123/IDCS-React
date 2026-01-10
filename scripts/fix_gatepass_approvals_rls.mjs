import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY;

if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in environment. Set them and re-run.');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });

async function fixGatepassApprovalsRLS() {
  console.log('Fixing RLS policy for gatepass_approvals...');

  try {
    // First, let's test if we can access the table
    console.log('Testing access to gatepass_approvals table...');
    const { data: testData, error: testError } = await supabase
      .from('gatepass_approvals')
      .select('*')
      .limit(1);

    if (testError) {
      console.error('Cannot access gatepass_approvals table:', testError);
      return;
    }

    console.log('Successfully accessed gatepass_approvals table');

    // Since we can't use RPC to execute DDL, let's try a different approach
    // We'll create a simple test to verify the current policy behavior
    console.log('Testing current policy behavior...');

    // Try to fetch approvals for a known application
    const testAppId = 'a8fc83c6-3b61-4c9b-b83f-9f5da9ad5980'; // From the debug output
    const { data: approvals, error: fetchError } = await supabase
      .from('gatepass_approvals')
      .select('*')
      .eq('application_id', testAppId);

    if (fetchError) {
      console.error('Error fetching approvals:', fetchError);
      return;
    }

    console.log(`Found ${approvals?.length || 0} approvals for application ${testAppId}:`);
    console.log(JSON.stringify(approvals, null, 2));

    if ((approvals?.length || 0) < 2) {
      console.log('❌ ISSUE CONFIRMED: Not all approvals are visible due to RLS policy');
      console.log('The RLS policy is restricting access to only approvals created by the current user.');
      console.log('Manual SQL execution needed to fix this.');
      console.log('');
      console.log('Please run the following SQL in your Supabase SQL editor:');
      console.log('');
      console.log(`-- Drop the existing restrictive policy
DROP POLICY IF EXISTS "Users can view gatepass approvals for their applications" ON gatepass_approvals;

-- Create new policy that allows staff to see all approvals for applications they can access
CREATE POLICY "Staff can view all gatepass approvals for applications they can access"
  ON gatepass_approvals FOR SELECT
  TO authenticated
  USING (
    -- Students can see approvals for their own applications
    application_id IN (SELECT id FROM gatepass_applications WHERE student_id = auth.uid())
    OR
    -- Staff can see all approvals for applications where they are assigned as advisor, HOD, AHOD, or mentor
    application_id IN (
      SELECT ga.id FROM gatepass_applications ga
      JOIN students s ON s.id = ga.student_id
      WHERE s.advisor_id = auth.uid()
         OR s.hod_id = auth.uid()
         OR s.ahod_id = auth.uid()
         OR s.mentor_id = auth.uid()
    )
  );`);
    } else {
      console.log('✅ All approvals are visible - RLS policy seems to be working correctly');
    }

  } catch (error) {
    console.error('Unexpected error:', error);
  }
}

fixGatepassApprovalsRLS();