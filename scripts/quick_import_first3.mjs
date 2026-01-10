#!/usr/bin/env node
import fs from 'fs';
import dotenv from 'dotenv';
dotenv.config({ path: process.env.DOTENV_CONFIG_PATH || '.env.local' });

const ADMIN_API_URL = process.env.ADMIN_API_URL || process.env.ADMIN_API_BASE || 'http://localhost:7888';
const ADMIN_TOKEN = process.env.ADMIN_API_TOKEN || process.env.ADMIN_TOKEN || process.env.VITE_ADMIN_TOKEN || '';
const CSV_PATH = './students-sample.for_import.cleaned.csv';

function parseCsv(text) {
  const lines = text.split(/\r?\n/).filter(l => l.trim() !== '');
  if (lines.length <= 1) return [];
  const header = lines[0].split(',').map(h => h.trim());
  const rows = [];
  for (let i = 1; i < lines.length; i++) {
    const parts = lines[i].split(',');
    const obj = {};
    header.forEach((h, idx) => { obj[h] = (parts[idx] || '').trim(); });
    rows.push(obj);
  }
  return rows;
}

async function postStudent(row) {
  const payload = {
    name: row.name,
    email: row.email,
    department: row.department,
    dob: row.dob || null,
    password: row.password || undefined,
    reg_no: row.reg_no,
    roll_no: row.roll_no,
    year: parseInt(row.year, 10),
    section: String(row.section || '').toUpperCase()
  };

  if (typeof fetch !== 'function') {
    console.error('No global fetch available in this Node runtime. Node 18+ provides fetch globally.');
    process.exit(1);
  }

  const res = await fetch(`${ADMIN_API_URL.replace(/\/$/, '')}/create-student`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(ADMIN_TOKEN ? { 'x-admin-token': ADMIN_TOKEN } : {}) },
    body: JSON.stringify(payload)
  });
  const body = await res.json().catch(() => ({}));
  return { status: res.status, ok: res.ok, body };
}

async function main() {
  if (!fs.existsSync(CSV_PATH)) {
    console.error('CSV file not found:', CSV_PATH);
    process.exit(1);
  }
  const text = fs.readFileSync(CSV_PATH, 'utf8');
  const rows = parseCsv(text);
  if (rows.length === 0) {
    console.error('No rows found in CSV');
    process.exit(1);
  }
  // Health check: ensure admin API is reachable
  const healthUrl = `${ADMIN_API_URL.replace(/\/$/, '')}/`;
  try {
    console.log('Checking admin API health at', healthUrl);
    if (typeof fetch !== 'function') {
      console.error('No global fetch available in this Node runtime. Node 18+ provides fetch globally.');
      process.exit(1);
    }
    const h = await fetch(healthUrl, { method: 'GET', headers: { ...(ADMIN_TOKEN ? { 'x-admin-token': ADMIN_TOKEN } : {}) } });
    if (!h.ok) {
      console.error('Admin API health check failed:', h.status, await h.text().catch(() => ''));
      process.exit(1);
    }
    const hv = await h.json().catch(() => null);
    console.log('Admin API reachable:', hv || `status ${h.status}`);
  } catch (e) {
    console.error('Failed to reach admin API at', healthUrl, '- error:', e?.message || e);
    process.exit(1);
  }
  const toTest = rows.slice(0, 3);
  console.log(`Testing import of first ${toTest.length} rows to ${ADMIN_API_URL}/create-student`);
  for (let i = 0; i < toTest.length; i++) {
    const r = toTest[i];
    console.log(`\nRow ${i+1}: ${r.name} <${r.email}>`);
    try {
      const res = await postStudent(r);
      console.log('Status:', res.status, 'OK:', res.ok);
      console.log('Response:', JSON.stringify(res.body, null, 2));
    } catch (e) {
      console.error('Request failed:', e?.message || e);
      if (e && e.stack) console.error(e.stack);
    }
  }
}

main().catch(e => { console.error('script failed', e); process.exit(1); });
