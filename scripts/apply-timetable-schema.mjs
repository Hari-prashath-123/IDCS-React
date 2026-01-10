// Attempts to help apply the Timetables schema. Direct DDL over the Supabase REST API is not officially supported.
// Reliable approach: paste the SQL into Supabase SQL Editor. This script prints the SQL and the direct Studio link.

import fs from 'node:fs';
import path from 'node:path';
import url from 'node:url';
import dotenv from 'dotenv';

// Load .env.local (Vite and server keys are present there)
dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

const __dirname = path.dirname(url.fileURLToPath(import.meta.url));
const files = [
  path.resolve(process.cwd(), 'sql', '2025-11-06_add_timetables.sql'),
  path.resolve(process.cwd(), 'sql', '2025-11-06_add_staff_timetables.sql')
];

const { SUPABASE_URL, VITE_SUPABASE_URL } = process.env;

const existing = files.filter(f => fs.existsSync(f));
if (existing.length === 0) {
  console.error('No SQL files found at paths:', files.join(', '));
  process.exit(1);
}

const urlBase = (SUPABASE_URL || VITE_SUPABASE_URL || '').trim();
if (!urlBase) {
  console.log('Could not determine Supabase URL from .env.local (SUPABASE_URL or VITE_SUPABASE_URL).');
}

// Project ref is the subdomain of the URL: https://<ref>.supabase.co
let projectRef = '';
try {
  const u = new URL(urlBase);
  projectRef = u.hostname.split('.')[0];
} catch {}

for (const f of existing) {
  console.log(`--- SQL: ${path.basename(f)} ---`);
  console.log(fs.readFileSync(f, 'utf8'));
  console.log('--------------------------------');
}

if (projectRef) {
  console.log('\nOpen your Supabase SQL Editor and paste the above SQL:');
  console.log(`https://supabase.com/dashboard/project/${projectRef}/editor/sql`);
} else {
  console.log('\nOpen your Supabase SQL Editor for your project and paste the above SQL.');
}

console.log('\nNote: Executing DDL via supabase-js is not supported. Use the SQL Editor for reliable schema changes.');
