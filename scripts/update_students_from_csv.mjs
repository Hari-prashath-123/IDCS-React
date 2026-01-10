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
  const s = String(raw).trim()
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s
  const m = s.match(/^(\d{1,2})[\.\/\-](\d{1,2})[\.\/\-](\d{2,4})$/)
  if (m) {
    let [ , d, mo, y ] = m
    d = d.padStart(2,'0'); mo = mo.padStart(2,'0')
    if (y.length === 2) y = Number(y) > 30 ? '19' + y : '20' + y
    return `${y}-${mo}-${d}`
  }
  const m2 = s.match(/^(\d{2})(\d{2})(\d{4})$/)
  if (m2) return `${m2[3]}-${m2[2]}-${m2[1]}`
  const dt = new Date(s)
  if (!isNaN(dt)) {
    const y = dt.getFullYear(); const mo = String(dt.getMonth()+1).padStart(2,'0'); const d = String(dt.getDate()).padStart(2,'0')
    return `${y}-${mo}-${d}`
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
    for (let j = 0; j < header.length; j++) obj[header[j]] = cols[j] || ''
    rows.push(obj)
  }
  return rows
}

async function updateRow(row) {
  const email = (row.email || '').toLowerCase()
  if (!email) throw new Error('missing email')

  // find profile by email
  const { data: profile, error: pErr } = await supabase.from('profiles').select('id').eq('email', email).maybeSingle()
  if (pErr) throw pErr
  if (!profile || !profile.id) throw new Error('profile not found')

  const id = profile.id
  const name = row.name || null
  const department = row.department || null
  const dob = normalizeDob(row.dob) || null

  // update profile fields
  const { error: updProfErr } = await supabase.from('profiles').update({ name, department, dob }).eq('id', id)
  if (updProfErr) throw new Error('profiles.update failed: ' + updProfErr.message)

  // upsert student row (students.id references profiles.id)
  const studentRow = {
    id,
    reg_no: row.reg_no || null,
    roll_no: row.roll_no || null,
    year: row.year ? Number(row.year) : null,
    section: row.section ? String(row.section).toUpperCase() : null
  }
  const { error: studErr } = await supabase.from('students').upsert(studentRow, { onConflict: 'id' })
  if (studErr) throw new Error('students.upsert failed: ' + studErr.message)

  return { id }
}

async function main() {
  console.log('Reading CSV:', csvPath)
  const content = fs.readFileSync(csvPath, 'utf8')
  const rows = parseCSV(content)
  console.log('Rows to process:', rows.length)

  const failed = []
  let ok = 0
  for (let i = 0; i < rows.length; i++) {
    const r = rows[i]
    try {
      await updateRow(r)
      ok++
      process.stdout.write('.')
    } catch (err) {
      failed.push({ row: i+1, email: r.email, error: err.message || String(err) })
      process.stdout.write('E')
    }
  }
  console.log('\nDone. Updated:', ok, 'Failed:', failed.length)
  if (failed.length) {
    const out = 'students-update.failed.csv'
    fs.writeFileSync(out, 'row,email,error\n' + failed.map(f => `${f.row},${f.email},"${(f.error||'').replace(/"/g,'""')}"`).join('\n'))
    console.log('Wrote failed rows to', out)
    console.log(JSON.stringify(failed, null, 2))
  }
}

main().catch(err => { console.error('Fatal:', err); process.exit(1) })
