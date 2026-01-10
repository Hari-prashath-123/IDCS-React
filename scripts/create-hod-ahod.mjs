#!/usr/bin/env node
import { createClient } from '@supabase/supabase-js'

// CLI to create a HOD/AHOD and optionally create a Supabase auth user (service role key required).
// Usage examples (PowerShell):
// Inline env + create profile only:
// $env:SUPABASE_URL="https://xyz.supabase.co"; $env:SUPABASE_SERVICE_ROLE_KEY="<service_key>"; node .\scripts\create-hod-ahod.mjs --role hod --name "Alice" --email alice@example.com --department CSE
// Create auth user + profile (generate password):
// $env:SUPABASE_URL="https://xyz.supabase.co"; $env:SUPABASE_SERVICE_ROLE_KEY="<service_key>"; node .\scripts\create-hod-ahod.mjs --role hod --name "Alice" --email alice@example.com --create-auth
// Create auth user + profile with provided password:
// $env:SUPABASE_URL="https://xyz.supabase.co"; $env:SUPABASE_SERVICE_ROLE_KEY="<service_key>"; node .\scripts\create-hod-ahod.mjs --role hod --name "Alice" --email alice@example.com --create-auth --password "S3cureP@ssw0rd"

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
  // simple generated password: uuid + suffix to satisfy most password rules
  if (typeof crypto !== 'undefined' && (crypto).randomUUID) return `${(crypto).randomUUID()}A!`;
  // fallback
  return `P@ss-${Math.random().toString(36).slice(2, 10)}`
}

async function main() {
  const args = parseArgs()
  const role = args.role
  const name = args.name
  const email = args.email
  const department = args.department
  const createAuth = !!args['create-auth'] || !!args['create_auth']
  const passwordArg = args.password

  if (!role || !name || !email) {
    console.error('Missing required args. Example: --role hod --name "Alice" --email alice@example.com --department CSE')
    process.exit(2)
  }

  const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL
  const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SERVICE_ROLE_KEY

  if (!SUPABASE_URL || !SERVICE_KEY) {
    console.error('Please provide SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY as environment variables.')
    process.exit(2)
  }

  const supabase = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } })

  try {
    let authUserId = null

    if (createAuth) {
      // default to the demo user's password so newly created users can sign in with the same credentials
      const DEMO_PASSWORD = 'Password123!'
      const password = passwordArg || DEMO_PASSWORD
      console.log('Creating auth user for', email)
      // admin create user
      const res = await supabase.auth.admin.createUser({ email: String(email), password: String(password), user_metadata: { name }, email_confirm: true })
      // Log full response for debugging
      console.log('createUser response:');
      console.dir(res, { depth: null });
      // supabase-js v2 returns res.data.user or res.user depending on version; handle both
      const user = res?.data?.user || res?.user || res?.data || null
      const error = res?.error || res?.data?.error || null
      if (error) {
        console.error('Error creating auth user (detailed):');
        console.dir(error, { depth: null });
        process.exit(3)
      }
      if (!user || !user.id) {
        console.error('Unexpected response creating user (no user.id):');
        console.dir(res, { depth: null });
        process.exit(4)
      }
      authUserId = user.id
      console.log('Created auth user id:', authUserId)
      console.log('Password (store this securely):', password)
    }

    // Insert profile
    let insertRow = { name: String(name), email: String(email), role: String(role), department: department ? String(department) : '', dob: null }
    if (authUserId) insertRow.id = authUserId

    console.log('Inserting profile:', insertRow)
    const { data, error } = await supabase.from('profiles').insert(insertRow).select()
    if (error) {
      console.error('Insert error:', error.message || error)
      process.exit(5)
    }
    console.log('Created profile:', data)

    // Also insert into staff table for HOD/AHOD roles
    const profileId = data?.[0]?.id || authUserId
    if (profileId) {
      const staffInsert = {
        id: profileId,
        staff_id: String(email),
        staff_role: String(role),
        on_leave: false
      }
      console.log('Inserting staff entry:', staffInsert)
      const { error: staffError } = await supabase.from('staff').upsert(staffInsert, { onConflict: 'id' }).select()
      if (staffError) {
        console.error('Staff insert error:', staffError.message || staffError)
        process.exit(7)
      }
      console.log('Created staff entry successfully')
    }
  } catch (err) {
    console.error('Unexpected error:', err)
    process.exit(6)
  }
}

main()
