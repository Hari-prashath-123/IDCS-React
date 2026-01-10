#!/usr/bin/env node
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY;

if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error('❌ Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { persistSession: false }
});

async function testLeaveColumn() {
  console.log('Testing on_leave column...\n');

  // 1. Check if staff table exists and query structure
  console.log('1. Checking staff table structure...');
  const { data: staffRecords, error: queryError } = await supabase
    .from('staff')
    .select('id, staff_id, on_leave')
    .limit(5);

  if (queryError) {
    console.error('❌ Error querying staff table:', queryError);
    if (queryError.message.includes('column') && queryError.message.includes('on_leave')) {
      console.error('\n⚠️  THE on_leave COLUMN DOES NOT EXIST!');
      console.error('Please run this SQL in Supabase SQL Editor:');
      console.error('ALTER TABLE staff ADD COLUMN IF NOT EXISTS on_leave boolean DEFAULT false;');
    }
    return;
  }

  console.log('✅ Staff table query successful');
  console.log('Sample records:', JSON.stringify(staffRecords, null, 2));

  // 2. Try to update a record (if any exist)
  if (staffRecords && staffRecords.length > 0) {
    const testId = staffRecords[0].id;
    console.log(`\n2. Testing update on staff id: ${testId}`);
    
    const { data: updateData, error: updateError } = await supabase
      .from('staff')
      .update({ on_leave: true })
      .eq('id', testId)
      .select();

    if (updateError) {
      console.error('❌ Error updating staff record:', updateError);
    } else {
      console.log('✅ Update successful:', JSON.stringify(updateData, null, 2));
      
      // Revert the change
      await supabase
        .from('staff')
        .update({ on_leave: false })
        .eq('id', testId);
      console.log('✅ Reverted test change');
    }
  } else {
    console.log('\n⚠️  No staff records found to test update');
  }

  console.log('\n✅ All tests complete!');
}

testLeaveColumn().catch(console.error);
