#!/usr/bin/env node
// debug-auth.js
// Usage: set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY (or ensure .env.local is present)
// Runs a direct POST to /auth/v1/token and prints status, headers and body.
import fs from 'fs';
import path from 'path';

function loadEnvLocal() {
  const p = path.resolve(process.cwd(), '.env.local');
  if (!fs.existsSync(p)) return;
  const content = fs.readFileSync(p, 'utf8');
  for (const line of content.split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Za-z0-9_]+)\s*=\s*("?)(.*)\2\s*$/);
    if (m) {
      const k = m[1];
      const v = m[3];
      if (!process.env[k]) process.env[k] = v;
    }
  }
}

loadEnvLocal();

const SUP_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const SRK = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_SERVICE_ROLE_KEY;
const ANON = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY;

if (!SUP_URL) {
  console.error('SUPABASE_URL or VITE_SUPABASE_URL is required in env or .env.local');
  process.exit(1);
}
if (!SRK && !ANON) {
  console.error('SUPABASE_SERVICE_ROLE_KEY or VITE_SUPABASE_ANON_KEY is required in env or .env.local');
  process.exit(1);
}

const email = process.argv[2] || 'aswinkumar.ad23@krct.ac.in';
const password = process.argv[3] || '01072005';

async function run() {
  try {
    const url = `${SUP_URL.replace(/\/$/, '')}/auth/v1/token?grant_type=password`;
    console.log('POST', url);
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        apikey: ANON || SRK,
        Authorization: `Bearer ${ANON || SRK}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ email, password }),
    });
    console.log('status', res.status);
    console.log('headers');
    for (const [k, v] of res.headers.entries()) console.log(k + ': ' + v);
    const text = await res.text();
    console.log('body:\n', text);
  } catch (e) {
    console.error('request failed', e);
  }
}

run();
