import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import crypto from 'crypto';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function main() {
  try {
    const electiveId = process.argv[2];
    if (!electiveId) {
      console.error('Usage: node lock_via_proxy.js <elective-id> [student-id]');
      process.exit(2);
    }

    const studentId = process.argv[3] || crypto.randomUUID();

    const envPath = path.resolve(__dirname, '..', '.env.local');
    let text;
    try {
      text = await fs.readFile(envPath, 'utf8');
    } catch (e) {
      console.error('.env.local not found at', envPath);
      process.exit(3);
    }

    const get = (name) => {
      const m = text.match(new RegExp(`^${name}="?([^\"]+)"?`, 'm'));
      return m ? m[1] : null;
    };

    const PROXY_URL = (get('PROXY_URL') || 'http://localhost:4000').replace(/\/+$/, '');
    const PROXY_API_KEY = get('PROXY_API_KEY') || process.env.PROXY_API_KEY || '';

    const url = `${PROXY_URL}/lock`;
    console.log(`Calling proxy ${url} with student=${studentId} elective=${electiveId}`);

    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(PROXY_API_KEY ? { 'x-api-key': PROXY_API_KEY } : {})
      },
      body: JSON.stringify({ student_id: studentId, elective_id: electiveId })
    });

    const textBody = await res.text();
    let body;
    try { body = JSON.parse(textBody); } catch (e) { body = textBody; }

    console.log('Status:', res.status);
    console.log('Response:', body);
    process.exit(res.ok ? 0 : 1);
  } catch (err) {
    console.error('Error:', err);
    process.exit(1);
  }
}

main();
