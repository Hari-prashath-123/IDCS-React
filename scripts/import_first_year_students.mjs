import fs from 'fs'
import path from 'path'
import { createClient } from '@supabase/supabase-js'

const [, , csvArg] = process.argv
const csvPath = csvArg || path.resolve(process.cwd(), 'first_year_students.csv')

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

const VALID_SECTIONS = 'ABCDEFGHIJKL'.split('')

async function upsertFirstYearStudent(row) {
  const name = (row.name || '').trim()
  let email = (row.email || '').toLowerCase().trim()
  const department = row.department || null
  const dob = normalizeDob(row.dob)
  const reg_no = row.reg_no || null
  const roll_no = row.roll_no || null
  const year = 1
  const sectionRaw = (row.section || '').toUpperCase().trim()
  const section = sectionRaw && sectionRaw.length === 1 && /^[A-Z]$/.test(sectionRaw) ? sectionRaw : null
  const password = row.password || (dob ? dob.replace(/-/g, '') : 'Password123!')

  if (!section) {
    throw new Error(`Invalid or missing section (must be single letter A-L) for student ${name} / ${reg_no || roll_no}`)
  }
  if (VALID_SECTIONS.indexOf(section) === -1) {
    console.warn(`Section ${section} is outside A-L; importing anyway but verify if intended.`)
  }

  // synthesize email if missing
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

  // create auth user (service role required)
  let userId = null
  try {
    const { data: createdUser, error: createErr } = await supabase.auth.admin.createUser({
      email,
      password: password || 'changeMe123',
      email_confirm: true,
      user_metadata: { name }
    })
    if (createErr) {
      // try to resolve existing profile
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
    throw new Error('auth.createUser failed: ' + (err.message || String(err)))
  }

  if (!userId) {
    const { data: p2 } = await supabase.from('profiles').select('id').eq('email', email).maybeSingle()
    if (p2 && p2.id) userId = p2.id
  }
  if (!userId) throw new Error('Could not determine user id for ' + email)

  // upsert profile
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

  // upsert student
  const studentRow = {
    id: userId,
    reg_no,
    roll_no,
    year,
    section
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
      await upsertFirstYearStudent(r)
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
