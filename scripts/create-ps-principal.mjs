#!/usr/bin/env node
import { createClient } from '@supabase/supabase-js'

// Create `PS` and `Principal` profiles and optionally Supabase auth users.
// Usage (PowerShell examples):
// $env:SUPABASE_URL="https://..."; $env:SUPABASE_SERVICE_ROLE_KEY="<service>"; node .\scripts\create-ps-principal.mjs --ps-email ps@example.com --principal-email principal@example.com
// To only create profiles (no auth users): add --no-auth

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
  return `Password123!` // default predictable password for convenience; change in production
}

async function createProfileAndAuth(supabase, name, role, email, createAuth, password, department) {
  let authUserId = null
  if (createAuth) {
    console.log(`Creating auth user for ${email}...`)
    const res = await supabase.auth.admin.createUser({ email: String(email), password: String(password), user_metadata: { name }, email_confirm: true })
    const error = res?.error || null
    const user = res?.data?.user || res?.user || res?.data || null
    if (error) {
      console.error('Error creating auth user:', error)
      throw error
    }
    if (!user || !user.id) {
      console.error('Unexpected createUser response:');
      console.dir(res, { depth: null })
      throw new Error('No user id returned from createUser')
    }
    authUserId = user.id
    console.log(`Auth user created: ${authUserId}`)
  }

  const insertRow = { name, email: String(email), role: String(role), dob: null, department: department || 'Administration' }
  if (authUserId) insertRow.id = authUserId

  console.log('Inserting profile:', insertRow)
  try {
    const { data, error } = await supabase.from('profiles').insert(insertRow).select()
    if (error) {
      // handle check-constraint violation for role (e.g., DB hasn't had roles extended)
      if (error.code === '23514') {
        console.warn('Role value not accepted by DB constraint. Will retry with fallback role mapping.');
        // map unknown roles to safe defaults
        const fallbackMap = { ps: 'staff', principal: 'admin' };
        const fallbackRole = fallbackMap[String(insertRow.role)] || 'staff';
        insertRow.role = fallbackRole;
        console.log('Retrying insert with fallback role:', fallbackRole);
        const retry = await supabase.from('profiles').insert(insertRow).select();
        if (retry.error) {
          console.error('Retry insert failed:', retry.error);
          throw retry.error;
        }
        console.log('Inserted profile with fallback role:', retry.data);
        return retry.data;
      }
      console.error('Error inserting profile:', error)
      throw error
    }
    return data
  } catch (err) {
    throw err
  }
  console.log('Inserted profile:', data)
  if (createAuth) console.log(`Credentials: ${email} / ${password}`)
}

async function main() {
  const args = parseArgs()
  const psEmail = args['ps-email'] || args['ps_email'] || 'ps@localhost'
  const principalEmail = args['principal-email'] || args['principal_email'] || 'principal@localhost'
  const psDepartment = args['ps-department'] || args['ps_department'] || 'Administration'
  const principalDepartment = args['principal-department'] || args['principal_department'] || 'Administration'
  const psRole = args['ps-role'] || args['ps_role'] || 'ps'
  const principalRole = args['principal-role'] || args['principal_role'] || 'principal'
  const noAuth = !!args['no-auth'] || !!args['no_auth']

  const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL
  const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SERVICE_ROLE_KEY

  if (!SUPABASE_URL || !SERVICE_KEY) {
    console.error('Please set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY environment variables (or use .env.local).')
    process.exit(1)
  }

  const supabase = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } })

  try {
    const password = genPassword()
    // Map friendly names to allowed role values in the `profiles.role` check constraint.
    // Default mapping: PS -> 'staff', Principal -> 'admin'. You can override with --ps-role / --principal-role
    await createProfileAndAuth(supabase, 'PS', psRole, psEmail, !noAuth, password, psDepartment)
    await createProfileAndAuth(supabase, 'Principal', principalRole, principalEmail, !noAuth, password, principalDepartment)
    console.log('Done creating PS and Principal (profiles and optional auth).')
  } catch (err) {
    console.error('Error:', err)
    process.exit(1)
  }
}

main()
