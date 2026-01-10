import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import path from 'path';

// Load .env.local if present to populate process.env for convenience
const loadLocalEnv = () => {
  try {
    const p = path.join(process.cwd(), '.env.local');
    if (!fs.existsSync(p)) return;
    const raw = fs.readFileSync(p, 'utf8');
    raw.split(/\r?\n/).forEach(line => {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*("?)(.*)\2\s*$/i);
      if (m) {
        const key = m[1];
        const val = m[3];
        if (!process.env[key]) process.env[key] = val;
      }
    });
  } catch (e) {
    /* ignore */
  }
};

loadLocalEnv();

// Usage: node ./scripts/debug-approver-approvals.mjs <approver_id>
// Example: node ./scripts/debug-approver-approvals.mjs beb08a58-2a00-4006-87a6-d69b175f52ea

const args = process.argv.slice(2);
if (args.length < 1) {
  console.error('Usage: node ./scripts/debug-approver-approvals.mjs <approver_id>');
  process.exit(2);
}

const approverId = args[0];
const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const key = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY;
if (!url || !key) {
  console.error('Missing SUPABASE_URL and SUPABASE_ANON_KEY in environment.');
  process.exit(2);
}

const supabase = createClient(url, key);
const approvalsTables = ['od_approvals','leave_approvals','gatepass_approvals','bonafide_approvals'];

(async () => {
  try {
    let found = false;
    for (const t of approvalsTables) {
      const { data, error } = await supabase.from(t).select('*').eq('approver_id', approverId).order('created_at', { ascending: true });
      if (error) throw error;
      if (data && data.length > 0) {
        found = true;
        console.log(`\nApprovals in ${t}:`);
        console.log(JSON.stringify(data, null, 2));
        // For each approval, try to fetch the application row it refers to
        for (const row of data) {
          const appId = row.application_id;
          // determine which application table it's from by attempting to find it
          const appTables = ['od_applications','leave_applications','gatepass_applications','bonafide_applications'];
          let foundApp = null;
          for (const tab of appTables) {
            const { data: app, error: appErr } = await supabase.from(tab).select('*').eq('id', appId).maybeSingle();
            if (appErr) throw appErr;
            if (app) { foundApp = { table: tab, app }; break; }
          }
          console.log('  linked application:', foundApp ? `${foundApp.table} -> ${JSON.stringify(foundApp.app)}` : 'NOT FOUND');
        }
      }
    }
    if (!found) console.log('No approvals found for approver id', approverId);
    process.exit(0);
  } catch (err) {
    console.error('Error querying approvals:', err);
    process.exit(1);
  }
})();
