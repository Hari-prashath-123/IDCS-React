#!/usr/bin/env node
import { createClient } from '@supabase/supabase-js'

// Usage:
// SERVICE_ROLE_KEY=... SUPABASE_URL=... node scripts/create_auth_user.mjs <profileId> <email> <password>
// Or set env vars: PROFILE_ID, EMAIL, PASSWORD

const SERVICE_ROLE_KEY = process.env.SERVICE_ROLE_KEY
if (!SERVICE_ROLE_KEY) {
  console.error('ERROR: set SERVICE_ROLE_KEY in env')
  process.exit(1)
}
const SUPABASE_URL = process.env.SUPABASE_URL || 'https://dtdwtbwgialaxgfzpfzj.supabase.co'
const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, { auth: { persistSession: false } })

const argv = process.argv.slice(2)
const profileId = process.env.PROFILE_ID || argv[0]
const email = process.env.EMAIL || argv[1]
const password = process.env.PASSWORD || argv[2]

if (!profileId || !email || !password) {
  console.error('Usage: PROFILE_ID=<id> EMAIL=you@example.com PASSWORD=Pass123! node scripts/create_auth_user.mjs')
  console.error('Or: node scripts/create_auth_user.mjs <profileId> <email> <password>')
  process.exit(1)
}

async function run() {
  console.log('Supabase URL:', SUPABASE_URL)
  console.log('Profile ID:', profileId)
  try {
    // Check profile exists
    const { data: profile, error: pErr } = await supabase.from('profiles').select('id,email').eq('id', profileId).maybeSingle()
    if (pErr) {
      console.error('Error querying profiles:', pErr)
      process.exit(1)
    }
    if (!profile) {
      console.error('Profile not found with id:', profileId)
      process.exit(1)
    }
    console.log('Found profile, email:', profile.email || '(no email)')

    // Create auth user via admin API
    const payload = {
      id: profileId,
      email,
      password,
      user_metadata: { profile_id: profileId },
      email_confirm: true
    }

    console.log('Creating auth user...')
    const res = await supabase.auth.admin.createUser(payload)
    console.log('Response:')
    console.log(JSON.stringify(res, null, 2))

    if (res.error) {
      console.error('Create user error:', res.error)
      process.exit(1)
    }

    console.log('User created successfully')
  } catch (err) {
    console.error('Unexpected error:', err)
    process.exit(1)
  }
}

run()
