#!/usr/bin/env node
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

async function getAuthUserEmailById(id) {
  // Try official admin method names that may vary by SDK version
  try {
    if (supabase.auth && supabase.auth.admin && typeof supabase.auth.admin.getUserById === 'function') {
      const res = await supabase.auth.admin.getUserById(id);
      if (res?.data?.user) return res.data.user.email || null;
      if (res?.user) return res.user.email || null;
      return null;
    }
    if (supabase.auth && supabase.auth.admin && typeof supabase.auth.admin.getUser === 'function') {
      const res = await supabase.auth.admin.getUser(id);
      if (res?.data?.user) return res.data.user.email || null;
      if (res?.user) return res.user.email || null;
    }
  } catch (e) {
    // ignore — we'll treat as unknown
  }
  return null;
}

async function updateAuthEmail(id, email) {
  try {
    if (supabase.auth && supabase.auth.admin && typeof supabase.auth.admin.updateUserById === 'function') {
      const res = await supabase.auth.admin.updateUserById(id, { email: String(email) });
      if (res?.error) throw res.error;
      return { ok: true, res };
    }
    if (supabase.auth && supabase.auth.admin && typeof supabase.auth.admin.updateUser === 'function') {
      const res = await supabase.auth.admin.updateUser(id, { email: String(email) });
      if (res?.error) throw res.error;
      return { ok: true, res };
    }
    throw new Error('Admin update API not available on this client');
  } catch (err) {
    return { ok: false, error: err };
  }
}

async function main() {
  console.log('Syncing auth emails to match profiles.email');

  // Fetch profiles with non-null email
  const { data: profiles, error } = await supabase.from('profiles').select('id, email').not('email', 'is', null);
  if (error) {
    console.error('Failed to fetch profiles:', error);
    process.exit(1);
  }

  console.log(`Fetched ${profiles.length} profiles`);

  const results = [];

  for (const p of profiles) {
    const id = p.id;
    const targetEmail = String(p.email).trim().toLowerCase();
    if (!id || !targetEmail) {
      results.push({ id, ok: false, reason: 'missing id or email in profile' });
      continue;
    }

    // Try to fetch auth user's current email
    const currentAuthEmail = await getAuthUserEmailById(id);
    if (currentAuthEmail && String(currentAuthEmail).trim().toLowerCase() === targetEmail) {
      results.push({ id, ok: true, skipped: true, reason: 'already in sync' });
      continue;
    }

    // Attempt to update auth email
    console.log(`Updating auth email for id=${id}: ${currentAuthEmail || '<unknown>'} => ${targetEmail}`);
    const upd = await updateAuthEmail(id, targetEmail);
    if (upd.ok) {
      results.push({ id, ok: true });
    } else {
      const err = upd.error;
      // If email is already in use by different user, this will error
      results.push({ id, ok: false, reason: String(err?.message || err) });
      console.error(`Failed to update auth email for ${id}:`, err?.message || err);
    }
  }

  console.log('--- Summary ---');
  const success = results.filter(r => r.ok).length;
  const failed = results.filter(r => !r.ok).length;
  const skipped = results.filter(r => r.skipped).length;
  console.log(`Total: ${results.length}  Success: ${success}  Skipped: ${skipped}  Failed: ${failed}`);
  if (failed > 0) console.table(results.filter(r => !r.ok));
}

main().catch((err) => { console.error('Fatal error', err); process.exit(1); });
