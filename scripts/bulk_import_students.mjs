import fs from 'fs'
import path from 'path'
import { createClient } from '@supabase/supabase-js'

const [, , csvArg] = process.argv
const csvPath = csvArg || path.resolve(process.cwd(), 'students-sample.for_import.csv')

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.SUPABASE_API_URL
const SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SERVICE_KEY

if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_KEY environment variables.')
  process.exit(1)
}

const supabase = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } })

function normalizeDob(raw) {
  if (!raw) return null
  const s = raw.trim()
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s
  if (/^\d{2}-\d{2}-\d{4}$/.test(s)) {
    const [d, m, y] = s.split('-')
    return `${y.padStart(4, '0')}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`
  }
  if (/^\d{1,2}\/\d{1,2}\/\d{2,4}$/.test(s)) {
    const parts = s.split('/')
    const [d, m, y] = parts
    const yy = y.length === 2 ? (y > '50' ? `19${y}` : `20${y}`) : y
    return `${yy.padStart(4, '0')}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`
  }
  // last resort try Date parse
  const dt = new Date(s)
  if (!isNaN(dt)) {
    const y = dt.getFullYear()
    const m = String(dt.getMonth() + 1).padStart(2, '0')
    const d = String(dt.getDate()).padStart(2, '0')
    return `${y}-${m}-${d}`
  }
  return null
}

function parseCSV(content) {
  const lines = content.split(/\r?\n/).map(l => l.trim()).filter(l => l.length > 0)
  if (lines.length === 0) return []
  const header = lines[0].split(',').map(h => h.trim())
  const rows = []
  for (let i = 1; i < lines.length; i++) {
    const cols = lines[i].split(',').map(c => c.trim())
    if (cols.every(c => c === '')) continue
    const obj = {}
    for (let j = 0; j < header.length; j++) {
      obj[header[j]] = cols[j] || ''
    }
    rows.push(obj)
  }
  return rows
}

async function upsertStudent(row) {
  const name = row.name || ''
  let email = (row.email || '').toLowerCase()
  const department = row.department || null
  const dob = normalizeDob(row.dob)
  const reg_no = row.reg_no || null
  const rawRoll = row.roll_no || ''
  const rawReg = row.reg_no || ''
  const roll_no = (String(rawRoll).trim()) ? String(rawRoll).trim() : ((String(rawReg).trim()) ? String(rawReg).trim() : null)
  const year = row.year ? Number(row.year) : null
  const section = row.section || null
  const password = row.password || (dob ? dob.replace(/-/g, '') : null)

  // Accept missing email by synthesizing one from reg_no, roll_no or name
  if (!email) {
    const key = reg_no || roll_no || name || ''
    if (key) {
      const safe = String(key).toLowerCase().replace(/\s+/g, '').replace(/[^a-z0-9._-]/g, '') || 'noid'
      email = `${safe}@no-email.local`
      console.warn('Generated synthetic email for row:', name || key, '->', email)
    } else {
      throw new Error('Row missing email and no reg_no/roll_no to synthesize: ' + JSON.stringify(row))
    }
  }

  // 1) Try to create the auth user
  let userId = null
  try {
    const { data: createdUser, error: createErr } = await supabase.auth.admin.createUser({
      email,
      password: password || 'changeMe123',
      email_confirm: true,
      user_metadata: { name }
    })
    if (createErr) {
      // If user already exists, try to look up profile to reuse id
      const { data: existingProfile } = await supabase.from('profiles').select('id').eq('email', email).maybeSingle()
      if (existingProfile && existingProfile.id) {
        userId = existingProfile.id
      } else {
        throw createErr
      }
    } else if (createdUser && createdUser.user && createdUser.user.id) {
      userId = createdUser.user.id
    }
  } catch (err) {
    // rethrow so outer loop can log
    throw new Error('auth.createUser failed: ' + (err.message || String(err)))
  }

  if (!userId) {
    // fallback: try to find a profile id by email
    const { data: p2 } = await supabase.from('profiles').select('id').eq('email', email).maybeSingle()
    if (p2 && p2.id) userId = p2.id
  }

  if (!userId) throw new Error('Could not determine user id for ' + email)

  // 2) Upsert profile
  const profileRow = {
    id: userId,
    name: name || null,
    email,
    dob: dob || null,
    department: department || null,
    role: 'student'
  }
  const { error: profErr } = await supabase.from('profiles').upsert(profileRow, { onConflict: 'id' })
  if (profErr) throw new Error('profiles.upsert failed: ' + profErr.message)

  // 3) Upsert student (note: `students` table does not have `dob` column)
  const studentRow = {
    id: userId,
    reg_no,
    year,
    section
  }
  // Only include roll_no if we actually have a value — avoids inserting explicit nulls
  if (roll_no !== null) {
    studentRow.roll_no = roll_no
  } else {
    console.warn('No roll_no for user, omitting from upsert for id:', userId)
  }
  const { error: studErr } = await supabase.from('students').upsert(studentRow, { onConflict: 'id' })
  if (studErr) throw new Error('students.upsert failed: ' + studErr.message)

  return { userId }
}

async function main() {
  console.log('Reading CSV:', csvPath)
  const content = fs.readFileSync(csvPath, 'utf8')
  const rows = parseCSV(content)
  console.log('Rows to import:', rows.length)

  let success = 0
  let failed = 0
  const errors = []

  for (let i = 0; i < rows.length; i++) {
    const r = rows[i]
    try {
      const res = await upsertStudent(r)
      success++
      process.stdout.write('.')
    } catch (err) {
      failed++
      errors.push({ row: i + 1, email: r.email, error: err.message })
      process.stdout.write('E')
    }
  }

  console.log('\nDone. Success:', success, 'Failed:', failed)
  if (errors.length) console.log('Errors:', JSON.stringify(errors, null, 2))
}

main().catch(err => {
  console.error('Fatal:', err)
  process.exit(1)
})
