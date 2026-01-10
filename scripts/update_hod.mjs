#!/usr/bin/env node
import { createClient } from '@supabase/supabase-js'

// Usage:
// SERVICE_ROLE_KEY=... SUPABASE_URL=... node scripts/update_hod.mjs <profileId> <newName> <newEmail>
// Or set env vars: PROFILE_ID, NEW_NAME, NEW_EMAIL

const SERVICE_ROLE_KEY = process.env.SERVICE_ROLE_KEY
if (!SERVICE_ROLE_KEY) {
  console.error('ERROR: set SERVICE_ROLE_KEY in env')
  process.exit(1)
}
const SUPABASE_URL = process.env.SUPABASE_URL || 'https://dtdwtbwgialaxgfzpfzj.supabase.co'
const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, { auth: { persistSession: false } })

const argv = process.argv.slice(2)
const profileId = process.env.PROFILE_ID || argv[0]
const newName = process.env.NEW_NAME || argv[1]
const newEmail = process.env.NEW_EMAIL || argv[2]

if (!profileId || !newName || !newEmail) {
  console.error('Usage: PROFILE_ID=<id> NEW_NAME="Full Name" NEW_EMAIL=you@example.com SERVICE_ROLE_KEY=... node scripts/update_hod.mjs')
  console.error('Or: node scripts/update_hod.mjs <profileId> "Full Name" you@example.com')
  process.exit(1)
}

async function run() {
  console.log('Supabase URL:', SUPABASE_URL)
  console.log('Profile ID:', profileId)
  try {
    // verify profile exists
    const { data: profile, error: pErr } = await supabase.from('profiles').select('id,name,email').eq('id', profileId).maybeSingle()
    if (pErr) {
      console.error('Error querying profiles:', pErr)
      process.exit(1)
    }
    if (!profile) {
      console.error('Profile not found with id:', profileId)
      process.exit(1)
    }
    console.log('Current profile:', JSON.stringify(profile))

    // update profiles table name/email (if you store email there)
    const { data: upd, error: updErr } = await supabase.from('profiles').update({ name: newName, email: newEmail }).eq('id', profileId)
    if (updErr) {
      console.error('Error updating profiles table:', updErr)
      process.exit(1)
    }
    console.log('Updated profiles row')

    // update auth user via admin API
    // prefer supabase-js admin helper if available
    console.log('Updating auth user email via admin API...')
    let res
    try {
      res = await supabase.auth.admin.updateUserById(profileId, {
        email: newEmail,
        user_metadata: { profile_id: profileId, name: newName },
        email_confirm: true
      })
    } catch (e) {
      // fallback to raw REST call if admin helper not present
      console.warn('admin.updateUserById threw, falling back to REST PATCH', e?.message || e)
      const fetch = (await import('node-fetch')).default
      const url = `${SUPABASE_URL.replace(/\/$/, '')}/auth/v1/admin/users/${profileId}`
      const body = { email: newEmail, user_metadata: { profile_id: profileId, name: newName }, email_confirm: true }
      const r = await fetch(url, {
        method: 'PATCH',
        headers: {
          'apikey': SERVICE_ROLE_KEY,
          'Authorization': `Bearer ${SERVICE_ROLE_KEY}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(body)
      })
      const json = await r.text()
      console.log('Raw REST response status:', r.status)
      try { console.log(JSON.parse(json)) } catch { console.log(json) }
      process.exit(r.ok ? 0 : 1)
    }

    console.log('Auth update result:', JSON.stringify(res, null, 2))
    if (res?.error) {
      console.error('Auth update error:', res.error)
      process.exit(1)
    }

    console.log('HOD name and email updated successfully (profiles + auth).')
  } catch (err) {
    console.error('Unexpected error:', err)
    process.exit(1)
  }
}

run()
