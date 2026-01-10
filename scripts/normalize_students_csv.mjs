#!/usr/bin/env node
import fs from 'fs';
import path from 'path';

function pad2(n) { return String(n).padStart(2, '0'); }

function normalizeDob(raw) {
  if (!raw) return '';
  // replace common separators with -
  const s = raw.trim().replace(/[.\/]/g, '-');
  // Attempt to extract d,m,y with regex allowing 1-4 digit year
  const m = s.match(/^(\D*?)(\d{1,2})-(\d{1,2})-(\d{2,4})(\D*?)$/);
  if (m) {
    let d = pad2(Number(m[2]));
    let mo = pad2(Number(m[3]));
    let y = m[4];
    if (y.length === 2) {
      // assume 20xx for two-digit years if reasonable
      y = Number(y) > 30 ? '19' + y : '20' + y;
    }
    return `${d}-${mo}-${y}`;
  }
  // if already y-m-d or other, try to split by -
  const parts = s.split('-').map(p => p.trim());
  if (parts.length === 3) {
    let [a,b,c] = parts;
    // heuristics: if first part is year (4 digits)
    if (/^\d{4}$/.test(a)) return `${pad2(Number(b))}-${pad2(Number(c))}-${a}`;
    if (/^\d{4}$/.test(c)) return `${pad2(Number(a))}-${pad2(Number(b))}-${c}`;
    return `${pad2(Number(a))}-${pad2(Number(b))}-${pad2(Number(c))}`;
  }
  return raw;
}

function normalizePasswordFromDob(dob) {
  if (!dob) return '';
  const m = dob.match(/^(\d{2})-(\d{2})-(\d{4})$/);
  if (!m) return '';
  return `${m[1]}${m[2]}${m[3]}`;
}

function isBlankRow(line) {
  return line.trim() === '' || /^[,\s]*$/.test(line);
}

async function main() {
  const arg = process.argv[2] || 'AI&DS-A-LIST.csv';
  const filePath = path.resolve(arg);
  if (!fs.existsSync(filePath)) {
    console.error('File not found:', filePath);
    process.exit(2);
  }

  const raw = fs.readFileSync(filePath, { encoding: 'utf8' });
  const lines = raw.split(/\r?\n/);
  if (lines.length === 0) {
    console.error('Empty file');
    process.exit(2);
  }

  const header = lines[0].trim();
  const out = [header];

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i];
    if (isBlankRow(line)) continue;
    // naive split by comma (data has no quoted commas)
    const parts = line.split(',');
    // Ensure we have at least 9 columns; pad if necessary
    while (parts.length < 9) parts.push('');
    const [name,email,department,dob,reg_no,roll_no,year,section,password] = parts.map(p => p ? p.trim() : '');
    const ndob = normalizeDob(dob);
    let npass = password && password.trim() !== '' ? password.trim() : '';
    // If password looks like missing leading zero (length 6 or 7), regenerate
    if (!npass || npass.length !== 8) {
      const fromDob = normalizePasswordFromDob(ndob);
      if (fromDob) npass = fromDob;
    }

    // Ensure email exists: if missing, synthesize from reg_no, roll_no or name
    let nemail = (email || '').toLowerCase();
    if (!nemail) {
      const key = reg_no || roll_no || name || '';
      if (key) {
        const safe = String(key).toLowerCase().replace(/\s+/g, '').replace(/[^a-z0-9._-]/g, '') || 'noid';
        nemail = `${safe}@no-email.local`;
      }
    }

    out.push([name,nemail,department,ndob,reg_no,roll_no,year,section,npass].join(','));
  }

  const outPath = filePath.replace(/\.csv$/i, '.cleaned.csv');
  fs.writeFileSync(outPath, out.join('\n'), { encoding: 'utf8' });
  console.log('Wrote cleaned CSV to', outPath);
}

main().catch((e) => { console.error(e); process.exit(1); });
