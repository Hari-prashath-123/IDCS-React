#!/usr/bin/env node
import { createClient } from '@supabase/supabase-js'
import crypto from 'crypto'

// Reset or set passwords for auth users matching given emails.
// Usage (PowerShell):
// $env:SUPABASE_URL="https://..."; $env:SUPABASE_SERVICE_ROLE_KEY="<service-key>"; node .\scripts\reset-auth-passwords.mjs --emails ps@gmail.com,principal@gmail.com --password NewPass123!
// To auto-generate passwords use --generate

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

function parseEmails(val) {
  if (!val) return []
  return String(val).split(',').map(s => s.trim()).filter(Boolean)
}

async function main() {
  const args = parseArgs()
  const emails = parseEmails(args['emails'] || args['email'])
  const newPassword = args['password'] || null
  const generate = !!args['generate']

  if (emails.length === 0) {
    console.error('Provide --emails a@b.com,c@d.com')
    process.exit(1)
  }

  const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL
  const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SERVICE_ROLE_KEY
  if (!SUPABASE_URL || !SERVICE_KEY) {
    console.error('Please set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY environment variables.')
    process.exit(1)
  }

  const supabase = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } })

  const results = []
  for (const email of emails) {
    try {
      // Try to find user id in profiles first (common pattern when profiles.id == auth.id)
      const { data: profile } = await supabase.from('profiles').select('id,email').eq('email', email).maybeSingle()
      let userId = profile?.id || null

      if (!userId) {
        // Fallback: query auth.users view
        const { data: authRow } = await supabase.from('auth.users').select('id,email').eq('email', email).maybeSingle()
        userId = authRow?.id || null
      }

      if (!userId) {
        console.warn(`No user id found for ${email} (no profile or auth.users row). Skipping.`)
        results.push({ email, status: 'not_found' })
        continue
      }

      const password = newPassword || (generate ? genPassword() : null)
      if (!password) {
        console.error('No password provided and --generate not set. Use --password or --generate.')
        process.exit(1)
      }

      console.log(`Updating password for ${email} (id: ${userId}) ...`)
      const res = await supabase.auth.admin.updateUserById(userId, { password })
      if (res.error) {
        console.error('Failed to update password for', email, res.error)
        results.push({ email, status: 'error', error: res.error })
        continue
      }
      console.log(`Password updated for ${email}`)
      results.push({ email, status: 'updated', password })
    } catch (err) {
      console.error('Unhandled error for', email, err)
      results.push({ email, status: 'error', error: String(err) })
    }
  }

  console.log('\nSummary:')
  for (const r of results) console.log(r)
}

main().catch(err => { console.error('Fatal:', err); process.exit(1) })
