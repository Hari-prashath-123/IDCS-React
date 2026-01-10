// Generate staff import XLSX template with department dropdown using exceljs.
// Usage:
//   npm install exceljs node-fetch dotenv
//   node scripts/generate_staff_template_with_dropdown_exceljs.js

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

async function fetchDepartments() {
  if (!SUPABASE_URL || !SUPABASE_KEY) return ['CSE','IT','ECE','EEE','MECH','CIVIL'];
  try {
    const url = `${SUPABASE_URL.replace(/\/+$|$/, '')}/rest/v1/departments?select=name&order=name`;
    const res = await fetch(url, { headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` } });
    if (!res.ok) return ['CSE','IT','ECE','EEE','MECH','CIVIL'];
    const data = await res.json();
    let depts = Array.from(new Set((data || []).map(d => d.name).filter(Boolean)));
    // Normalize legacy short code 'ME' to 'MECH' for the staff template dropdown
    depts = depts.map((d) => d === 'ME' ? 'MECH' : d);
    return depts.length ? depts : ['CSE','IT','ECE','EEE','MECH','CIVIL'];
  } catch (e) {
    return ['CSE','IT','ECE','EEE','MECH','CIVIL'];
  }
}

// Roles available for staff records
function getDefaultRoles() {
  return ['mentor','advisor','lecturer','hod','ahod'];
}

async function main() {
  const departments = await fetchDepartments();
  const roles = getDefaultRoles();

  const workbook = new ExcelJS.Workbook();
  const templateSheet = workbook.addWorksheet('Template');
  const deptSheet = workbook.addWorksheet('Departments');
  const rolesSheet = workbook.addWorksheet('Roles');

  // headers: id, name, dept, role, designation, qualification, date of joining
  templateSheet.addRow(['id','name','dept','role','designation','qualification','date of joining']);
  // sample row (leave id empty for new user). Use a Date object so Excel shows DD-MM-YY when formatted.
  const sampleDate = new Date(2026, 0, 6); // 6 Jan 2026
  const sampleRow = ['', 'Dr. A. Example', departments[0] || 'CSE', roles[0] || 'mentor', 'Assistant Professor', 'Ph.D.', sampleDate];
  templateSheet.addRow(sampleRow);

  // write departments
  departments.forEach((d) => deptSheet.addRow([d]));
  // write roles
  roles.forEach((r) => rolesSheet.addRow([r]));

  // set column widths
  templateSheet.columns = [ { width: 20 }, { width: 36 }, { width:20 }, { width:12 }, { width:24 }, { width:24 }, { width:16 } ];
  // apply date format for the 7th column (date of joining) so Excel shows DD-MM-YY
  templateSheet.getColumn(7).numFmt = 'dd-mm-yy';
  deptSheet.columns = [{ width: 24 }];
  rolesSheet.columns = [{ width: 20 }];

  // apply data validation for department (C column) and roll (D column)
  const lastRow = 1000;
  const deptCount = Math.max(departments.length, 1);
  const rollsCount = Math.max(roles.length, 1);
  for (let r = 2; r <= lastRow; r++) {
    const dcell = templateSheet.getCell(`C${r}`);
    dcell.dataValidation = {
      type: 'list',
      allowBlank: true,
      formulae: [`=Departments!$A$1:$A$${deptCount}`],
      showErrorMessage: true,
      showInputMessage: true,
    };
    const rollCell = templateSheet.getCell(`D${r}`);
    rollCell.dataValidation = {
      type: 'list',
      allowBlank: true,
      formulae: [`=Roles!$A$1:$A$${rollsCount}`],
      showErrorMessage: true,
      showInputMessage: true,
    };
  }

  // ensure output directory exists
  const outDir = path.join(__dirname, '..', 'public', 'templates');
  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });
  const outPath = path.join(outDir, 'staff_import_template_with_dropdown_exceljs.xlsx');

  await workbook.xlsx.writeFile(outPath);
  console.log('Wrote', outPath);
}

main().catch((err) => { console.error(err); process.exit(1); });
