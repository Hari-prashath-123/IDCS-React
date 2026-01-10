#!/usr/bin/env node
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('❌ Missing environment variables');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey, {
  auth: { autoRefreshToken: false, persistSession: false }
});

console.log('');
console.log('='.repeat(70));
console.log('STORAGE RLS POLICY FIX - MANUAL STEPS');
console.log('='.repeat(70));
console.log('');
console.log('❌ Cannot modify storage.objects table via SQL (requires owner permissions)');
console.log('');
console.log('✅ SOLUTION: Configure RLS policies via Supabase Dashboard');
console.log('');
console.log('📝 Follow these steps:');
console.log('');
console.log('1. Go to Storage in your Supabase Dashboard:');
console.log('   ' + supabaseUrl.replace('/project/_', '') + '/project/_/storage/buckets');
console.log('');
console.log('2. Click on the "od-proofs" bucket');
console.log('');
console.log('3. Click on "Policies" tab');
console.log('');
console.log('4. Click "New Policy" and add these 4 policies:');
console.log('');
console.log('   📤 POLICY 1: Allow Upload');
console.log('   -------------------------');
console.log('   Policy Name: Students can upload own proofs');
console.log('   Allowed Operations: INSERT');
console.log('   Target Roles: authenticated');
console.log('   WITH CHECK expression:');
console.log('   (bucket_id = \'od-proofs\' AND (storage.foldername(name))[1] = auth.uid()::text)');
console.log('');
console.log('   👀 POLICY 2: Allow Read');
console.log('   -------------------------');
console.log('   Policy Name: Anyone can view proofs');
console.log('   Allowed Operations: SELECT');
console.log('   Target Roles: public');
console.log('   USING expression:');
console.log('   (bucket_id = \'od-proofs\')');
console.log('');
console.log('   ✏️  POLICY 3: Allow Update');
console.log('   -------------------------');
console.log('   Policy Name: Students can update own proofs');
console.log('   Allowed Operations: UPDATE');
console.log('   Target Roles: authenticated');
console.log('   USING expression:');
console.log('   (bucket_id = \'od-proofs\' AND (storage.foldername(name))[1] = auth.uid()::text)');
console.log('');
console.log('   🗑️  POLICY 4: Allow Delete');
console.log('   -------------------------');
console.log('   Policy Name: Students can delete own proofs');
console.log('   Allowed Operations: DELETE');
console.log('   Target Roles: authenticated');
console.log('   USING expression:');
console.log('   (bucket_id = \'od-proofs\' AND (storage.foldername(name))[1] = auth.uid()::text)');
console.log('');
console.log('='.repeat(70));
console.log('');
console.log('💡 ALTERNATIVE: Disable RLS on the bucket (less secure but simpler)');
console.log('');
console.log('If the above is too complex, you can:');
console.log('1. Go to Storage > od-proofs bucket > Configuration');
console.log('2. Toggle OFF "Restrict access with RLS"');
console.log('3. Keep "Public bucket" ON');
console.log('');
console.log('⚠️  This allows anyone to upload, but it\'s easier for testing.');
console.log('');
console.log('='.repeat(70));
console.log('');

// Check current bucket configuration
async function checkBucketConfig() {
  try {
    const { data: buckets, error } = await supabase.storage.listBuckets();
    
    if (error) {
      console.error('Error listing buckets:', error);
      return;
    }

    const odProofsBucket = buckets?.find(b => b.id === 'od-proofs');
    
    if (!odProofsBucket) {
      console.log('❌ od-proofs bucket not found!');
      console.log('   Run: npm run ensure-od-bucket');
      return;
    }

    console.log('📊 Current od-proofs bucket configuration:');
    console.log('   Name:', odProofsBucket.name);
    console.log('   Public:', odProofsBucket.public);
    console.log('   Created:', odProofsBucket.created_at);
    console.log('');

  } catch (error) {
    console.error('Error:', error);
  }
}

checkBucketConfig();
