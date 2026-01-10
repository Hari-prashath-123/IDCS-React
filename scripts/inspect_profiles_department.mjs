import { createClient } from '@supabase/supabase-js';

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_KEY;
if (!url || !key) {
  console.error('Please set SUPABASE_URL and SUPABASE_SERVICE_KEY in the environment');
  process.exit(1);
}

const supabase = createClient(url, key);

try {
  const { data, error } = await supabase
    .from('profiles')
    .select('department')
    .limit(500);
  if (error) {
    console.error('Supabase error:', error);
    process.exit(1);
  }
  const counts = {};
  (data || []).forEach((d) => {
    const v = d.department === null || d.department === undefined ? 'NULL' : String(d.department);
    counts[v] = (counts[v] || 0) + 1;
  });
  console.log('Distinct department samples and counts (up to 500 rows):');
  Object.entries(counts).sort((a,b)=>b[1]-a[1]).forEach(([k,v])=>console.log(v, k));
} catch (e) {
  console.error('Unexpected error', e);
  process.exit(1);
}
