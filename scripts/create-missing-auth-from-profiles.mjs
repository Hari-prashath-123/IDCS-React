#!/usr/bin/env node
import { createClient } from '@supabase/supabase-js'
import crypto from 'crypto'

// Create missing Supabase Auth users for existing `profiles` rows.
// The script will attempt to create an auth user whose `id` equals the profile.id
// so the profile stays linked to the auth row.
// Usage (PowerShell):
// $env:SUPABASE_URL="https://..."; $env:SUPABASE_SERVICE_ROLE_KEY="<service-key>"; node .\scripts\create-missing-auth-from-profiles.mjs
// Optionally pass specific emails:
// node .\scripts\create-missing-auth-from-profiles.mjs --emails ps@example.com,principal@example.com

function parseArgs() {
  const args = process.argv.slice(2)
  const out = {}
  for (let i = 0; i < args.length; i++) {
    const a = args[i]
    if (a.startsWith('--')) {
      const key = a.slice(2)
      const val = args[i + 1] && !args[i + 1].startsWith('--') ? args[++i] : true
      out[key] = val
    }
  }
  return out
}

function genPassword() {
  return crypto.randomBytes(8).toString('base64') + 'A1!'
}

function parseEmailsArg(val) {
  if (!val) return []
  return String(val).split(',').map(s => s.trim()).filter(Boolean)
}

async function main() {
  const args = parseArgs()
  const emailsArg = args['emails'] || args['email'] || null
  const emails = parseEmailsArg(emailsArg)

  const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL
  const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SERVICE_ROLE_KEY

  if (!SUPABASE_URL || !SERVICE_KEY) {
    console.error('Please set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY environment variables.')
    process.exit(1)
  }

  const supabase = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } })

  // Fetch target profiles. If emails provided, filter by them; otherwise fetch profiles with role 'ps' or 'principal'.
  let q = supabase.from('profiles').select('id,name,email,role')
  if (emails.length > 0) q = q.in('email', emails)
  else q = q.in('role', ['ps', 'principal'])

  const { data: profiles, error: fetchErr } = await q
  if (fetchErr) {
    console.error('Failed to fetch profiles:', fetchErr)
    process.exit(1)
  }
  if (!profiles || profiles.length === 0) {
    console.log('No matching profiles found.')
    process.exit(0)
  }

  const summary = { created: [], skipped: [], errors: [] }

  for (const p of profiles) {
    if (!p.email) {
      summary.errors.push({ profile: p, error: 'missing email' })
      continue
    }
    const password = genPassword()
    console.log(`Creating auth user for profile ${p.email} (id: ${p.id}) ...`)

    // Attempt to create auth user with the profile.id so they link.
    // The admin.createUser API may return different shapes depending on supabase-js version.
    try {
      const res = await supabase.auth.admin.createUser({
        id: p.id,
        email: String(p.email),
        password: String(password),
        email_confirm: true,
        user_metadata: { name: p.name, role: p.role }
      })

      const err = res?.error || null
      const user = res?.data?.user || res?.user || res?.data || null

      if (err) {
        const msg = String(err.message || err)
        // If user already exists, skip
        if (msg.toLowerCase().includes('already exists') || msg.toLowerCase().includes('duplicate')) {
          console.log(`Auth user already exists for ${p.email}, skipping.`)
          summary.skipped.push({ email: p.email, id: p.id })
          continue
        }
        console.error('Error creating auth user for', p.email, err)
        summary.errors.push({ profile: p, error: err })
        continue
      }

      if (!user || !user.id) {
        console.warn('Unexpected createUser response for', p.email, res)
        summary.errors.push({ profile: p, error: 'no user id returned' })
        continue
      }

      console.log(`Created auth user ${user.id} for ${p.email}`)
      // Print temporary credentials so operator can share or set a password reset flow.
      console.log(`Temporary password for ${p.email}: ${password}`)
      summary.created.push({ email: p.email, id: user.id, password })
    } catch (err) {
      const msg = String(err?.message || err)
      if (msg.toLowerCase().includes('already exists') || msg.toLowerCase().includes('duplicate')) {
        console.log(`Auth user already exists for ${p.email}, skipping (caught).`)
        summary.skipped.push({ email: p.email, id: p.id })
        continue
      }
      console.error('Unhandled error creating auth user for', p.email, err)
      summary.errors.push({ profile: p, error: err })
    }
  }

  console.log('\nSummary:')
  console.log('Created:', summary.created.length)
  console.log('Skipped (already existed):', summary.skipped.length)
  console.log('Errors:', summary.errors.length)
  if (summary.created.length > 0) {
    console.log('\nCreated users (email / id / temp-password):')
    for (const c of summary.created) console.log(`${c.email}  ${c.id}  ${c.password}`)
  }

  // Helpful note for operators
  console.log('\nNext steps:')
  console.log('- Force password reset or send magic links for created users as needed.')
  console.log('- Verify `auth.users` contains the new ids and profiles are linked by id.')
}

main().catch(err => {
  console.error('Fatal error:', err)
  process.exit(1)
})
