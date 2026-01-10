#!/usr/bin/env node
import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';

dotenv.config({ path: process.env.DOTENV_CONFIG_PATH || '.env.local' });

const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY;

if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in environment. Set them and re-run.');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });

function normalizeDobToIso(raw) {
  if (!raw || typeof raw !== 'string') return null;
  const s = raw.trim();
  if (!s) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  const m = s.match(/^(\d{1,2})[\.\/\-](\d{1,2})[\.\/\-](\d{2,4})$/);
  if (m) {
    let day = m[1].padStart(2, '0');
    let month = m[2].padStart(2, '0');
    let year = m[3];
    if (year.length === 2) year = Number(year) > 30 ? '19' + year : '20' + year;
    return `${year}-${month}-${day}`;
  }
  const m2 = s.match(/^(\d{2})(\d{2})(\d{4})$/);
  if (m2) return `${m2[3]}-${m2[2]}-${m2[1]}`;
  return s;
}

function slugifyNameForEmail(name) {
  if (!name) return null;
  return name
    .toLowerCase()
    .replace(/[^a-z0-9\s\.\-]/g, '')
    .trim()
    .replace(/\s+/g, '.')
    .replace(/\.{2,}/g, '.')
    .replace(/^\.|\.$/g, '');
}

async function importCsv(filePath) {
  const abs = path.isAbsolute(filePath) ? filePath : path.join(process.cwd(), filePath);
  if (!fs.existsSync(abs)) {
    console.error('CSV file not found:', abs);
    process.exit(1);
  }

  const text = fs.readFileSync(abs, { encoding: 'utf8' });
  const lines = text.split(/\r?\n/).filter(l => l.trim() !== '');
  if (lines.length <= 1) {
    console.error('CSV appears empty or only header');
    process.exit(1);
  }

  const header = lines[0].split(',').map(h => h.trim().toLowerCase());
  const rows = lines.slice(1).map(l => l.split(',').map(c => c.trim().replace(/^"|"$/g, '')));

  let processed = 0;
  let succeeded = 0;
  const failed = [];

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    if (row.length === 0 || row.join('').trim() === '') continue;
    processed++;
    const obj = {};
    header.forEach((h, idx) => { obj[h] = row[idx] || ''; });

    const name = (obj.name || obj.names || obj['names.'] || '').trim();
    const register_no = (obj.register_no || obj['register no'] || obj['register_no'] || '').trim();
    let email = (obj.email || '').trim();
    let dob = (obj.dob || '').trim();
    const password = (obj.password || process.env.DEFAULT_DEMO_PASSWORD || 'Password123!').trim();
    const staff_role = (obj.staff_role || obj.role || 'lecturer').trim() || 'lecturer';
    const year = obj.year ? parseInt(obj.year) : null;
    const section = obj.section ? String(obj.section).toUpperCase() : null;

    if (!name) {
      failed.push({ row: i+2, reason: 'missing name' });
      continue;
    }

    if (!email) {
      const slug = slugifyNameForEmail(name) || 'staff';
      email = `${slug}@krct.ac.in`;
      if (register_no) email = `${slug}.${register_no}@krct.ac.in`;
    }

    const normalizedDob = normalizeDobToIso(dob) || null;

    try {
      // Try to create auth user
      let user = null;
      const createRes = await supabase.auth.admin.createUser({ email: String(email), password: String(password), user_metadata: { name }, email_confirm: true });
      if (createRes?.error) {
        // If email exists, try to find existing profile with that email
        const err = createRes.error;
        const isEmailExists = err?.code === 'email_exists' || err?.status === 422 || String(err?.message || '').toLowerCase().includes('already');
        if (isEmailExists) {
          const { data: existingProfile, error: profileErr } = await supabase.from('profiles').select('id').eq('email', String(email)).maybeSingle();
          if (profileErr) throw new Error(`auth exists and profile lookup failed: ${String(profileErr)}`);
          if (existingProfile && existingProfile.id) {
            user = { id: existingProfile.id, email };
          } else {
            // No profile exists — we will create a profile with a generated id by creating a new random uuid and use that as id? Safer to fail.
            throw new Error(`email exists in auth but no profile found for ${email}`);
          }
        } else {
          throw new Error(`createUser failed: ${JSON.stringify(createRes.error)}`);
        }
      } else {
        user = createRes?.data?.user || createRes?.user || createRes?.data || null;
        if (!user || !user.id) throw new Error('No user id returned from createUser');
      }

      // Upsert profile
      const profile = {
        id: user.id,
        email: String(email),
        role: 'staff',
        name: String(name),
        department: String(obj.department || 'AI&DS'),
        dob: normalizedDob || null,
      };

      const upRes = await supabase.from('profiles').upsert(profile).select();
      if (upRes?.error) {
        // cleanup created auth user if we created it
        try { if (createRes && !createRes.error && user && user.id) await supabase.auth.admin.deleteUser(user.id); } catch(e){}
        throw new Error(`profile upsert failed: ${JSON.stringify(upRes.error)}`);
      }

      // Upsert staff row
      const staffId = register_no || `STF${String(Date.now()).slice(-6)}`;
      const staffData = {
        id: user.id,
        staff_id: staffId,
        staff_role: String(staff_role),
        year: year || null,
        section: section || null,
      };

      const staffRes = await supabase.from('staff').upsert(staffData).select();
      if (staffRes?.error) {
        // cleanup on failure
        try { if (createRes && !createRes.error && user && user.id) { await supabase.from('profiles').delete().eq('id', user.id); await supabase.auth.admin.deleteUser(user.id); } } catch(e){}
        throw new Error(`staff upsert failed: ${JSON.stringify(staffRes.error)}`);
      }

      console.log(`OK: ${email}`);
      succeeded++;
    } catch (err) {
      console.error(`ERR row ${i+2}:`, String(err?.message || err));
      failed.push({ row: i+2, reason: String(err?.message || err) });
    }
  }

  console.log('--- Summary ---');
  console.log('Processed:', processed);
  console.log('Succeeded:', succeeded);
  console.log('Failed:', failed.length);
  if (failed.length > 0) console.table(failed);
}

const csvPath = process.argv[2] || path.join(process.cwd(), 'AI-DEPT-staff-for_import.csv');
importCsv(csvPath).catch((err) => { console.error('Import failed:', err); process.exit(1); });
