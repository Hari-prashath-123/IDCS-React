import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function main() {
  try {
    const envPath = path.resolve(__dirname, '..', '.env.local');
    let text;
    try {
      text = await fs.readFile(envPath, 'utf8');
    } catch (e) {
      console.error('.env.local not found at', envPath);
      process.exit(2);
    }

    const get = (name) => {
      const m = text.match(new RegExp(`^${name}="?([^\"]+)"?`, 'm'));
      return m ? m[1] : null;
    };

    const SUPABASE_URL = get('SUPABASE_URL') || get('VITE_SUPABASE_URL');
    const SUPABASE_ANON_KEY = get('SUPABASE_ANON_KEY') || get('VITE_SUPABASE_ANON_KEY');

    if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
      console.error('SUPABASE_URL or SUPABASE_ANON_KEY not found in .env.local');
      process.exit(3);
    }

    const url = `${SUPABASE_URL.replace(/\/+$/, '')}/rest/v1/electives?select=id,sub_name,course_code,is_active,seat_count,seats_filled&limit=200`;

    console.log('Fetching electives from', url);

    const res = await fetch(url, {
      headers: {
        apikey: SUPABASE_ANON_KEY,
        Authorization: `Bearer ${SUPABASE_ANON_KEY}`
      }
    });

    if (!res.ok) {
      const body = await res.text();
      console.error('Request failed:', res.status, res.statusText, body);
      process.exit(4);
    }

    const data = await res.json();
    if (!Array.isArray(data)) {
      console.error('Unexpected response:', data);
      process.exit(5);
    }

    console.table(data.map(d => ({ id: d.id, name: d.sub_name, code: d.course_code, active: d.is_active, seats: d.seat_count, filled: d.seats_filled })));
    process.exit(0);
  } catch (err) {
    console.error('Error:', err);
    process.exit(1);
  }
}

main();
