// Generate XLSX template with Excel data-validation dropdowns using exceljs.
// Usage:
//   npm install exceljs node-fetch dotenv
//   node scripts/generate_subjects_template_xlsx_with_dropdown_exceljs.js

import ExcelJS from 'exceljs';
import fetch from 'node-fetch';
import { fileURLToPath } from 'url';
import path from 'path';
import fs from 'fs';
import dotenv from 'dotenv';

// load .env.local next to project root if present
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.join(__dirname, '..', '.env.local') });

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_KEY || process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY;

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error('Please set SUPABASE_URL and SUPABASE_KEY (or service role key) in .env.local or env vars');
  process.exit(1);
}

async function fetchStaff() {
  const url = `${SUPABASE_URL.replace(/\/+$/, '')}/rest/v1/profiles?select=name&role=in.(staff,ahod,hod)&order=name`;
  const res = await fetch(url, { headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` } });
  if (!res.ok) throw new Error(`Failed to fetch staff: ${res.status} ${res.statusText}`);
  const data = await res.json();
  return data.map(r => r.name).filter(Boolean);
}

async function fetchDepartments() {
  // Try years table first to get departments list
  const url = `${SUPABASE_URL.replace(/\/+$/, '')}/rest/v1/years?select=department&order=department`;
  const res = await fetch(url, { headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` } });
  if (!res.ok) return ['CSE','IT','ECE','EEE','MECH','CIVIL'];
  const data = await res.json();
  const depts = Array.from(new Set((data || []).map(d => d.department).filter(Boolean)));
  return depts.length ? depts : ['CSE','IT','ECE','EEE','MECH','CIVIL'];
}

async function main() {
  const staff = await fetchStaff();
  const departments = await fetchDepartments();

  const workbook = new ExcelJS.Workbook();
  const templateSheet = workbook.addWorksheet('Template');
  const staffSheet = workbook.addWorksheet('StaffList');
  const deptSheet = workbook.addWorksheet('Departments');

  // headers matching CSV template
  templateSheet.addRow(['subject_code','name','credits','department','section','year','semester','staff_name']);
  // sample rows
  templateSheet.addRow(['CS101','Intro to CS','3', departments[0] || 'CSE', 'A', '1', '1', staff[0] || 'Dr. A. Kumar']);
  templateSheet.addRow(['CS102','Data Structures','4', departments[0] || 'CSE', 'B', '2', '3', staff[1] || staff[0] || 'Prof. S. Ramesh']);

  // write staff list
  staff.forEach((s) => staffSheet.addRow([s]));
  // write departments
  departments.forEach((d) => deptSheet.addRow([d]));

  // set column widths
  templateSheet.columns = [ { width: 16 }, { width: 36 }, { width:8 }, { width:14 }, { width:8 }, { width:8 }, { width:8 }, { width:30 } ];
  staffSheet.columns = [{ width: 40 }];
  deptSheet.columns = [{ width: 20 }];

  // apply data validation for department (D) and staff_name (H)
  const lastRow = 1000;
  const staffCount = Math.max(staff.length, 1);
  const deptCount = Math.max(departments.length, 1);
  for (let r = 2; r <= lastRow; r++) {
    const dcell = templateSheet.getCell(`D${r}`);
    dcell.dataValidation = {
      type: 'list',
      allowBlank: false,
      formulae: [`=Departments!$A$1:$A$${deptCount}`],
      showErrorMessage: true,
      showInputMessage: true,
    };
    const cell = templateSheet.getCell(`H${r}`);
    cell.dataValidation = {
      type: 'list',
      allowBlank: true,
      formulae: [`=StaffList!$A$1:$A$${staffCount}`],
      showErrorMessage: true,
      showInputMessage: true,
    };
  }

  // ensure output directory exists
  const outDir = path.join(__dirname, '..', 'public', 'templates');
  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });
  const outPath = path.join(outDir, 'subjects_import_template_with_dropdown_exceljs.xlsx');

  await workbook.xlsx.writeFile(outPath);
  console.log('Wrote', outPath);
}

main().catch((err) => { console.error(err); process.exit(1); });
