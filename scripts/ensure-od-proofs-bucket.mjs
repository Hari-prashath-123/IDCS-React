#!/usr/bin/env node
import 'dotenv/config';

const ADMIN_API_URL = process.env.ADMIN_API_URL || 'http://localhost:7888';
const ADMIN_API_TOKEN = process.env.ADMIN_API_TOKEN || process.env.ADMIN_TOKEN || '';

async function main() {
  const url = `${ADMIN_API_URL.replace(/\/$/, '')}/ensure-bucket`;
  const body = { bucket: 'od-proofs', public: true };

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...(ADMIN_API_TOKEN ? { 'x-admin-token': ADMIN_API_TOKEN } : {}),
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const text = await res.text();
    console.error('Request failed:', res.status, res.statusText, text);
    process.exit(1);
  }
  const data = await res.json();
  console.log('Result:', data);
}

main().catch((e) => {
  console.error('Unexpected error:', e);
  process.exit(1);
});
