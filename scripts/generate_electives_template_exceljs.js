import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import fetch from 'node-fetch';
import ExcelJS from 'exceljs';
import dotenv from 'dotenv';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const envPath = path.join(__dirname, '..', '.env.local');
dotenv.config({ path: envPath });

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY;

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error('Please set SUPABASE_URL and SUPABASE_KEY environment variables.');
  process.exit(1);
}

async function fetchStaff() {
  const url = `${SUPABASE_URL.replace(/\/+$/, '')}/rest/v1/profiles?select=name&role=in.(staff,ahod,hod)&order=name`;
  const res = await fetch(url, {
    headers: {
      apikey: SUPABASE_KEY,
      Authorization: `Bearer ${SUPABASE_KEY}`,
    },
  });
  if (!res.ok) throw new Error(`Failed to fetch staff: ${res.status} ${res.statusText}`);
  const data = await res.json();
  return data.map((r) => r.name).filter(Boolean);
}

(async () => {
  try {
    const staff = await fetchStaff();
    const departments = ['ALL','AI&DS','AI&ML','CSE','IT','ECE','EEE','MECH','CIVIL'];

    const wb = new ExcelJS.Workbook();
    wb.creator = 'electives-generator';

    const wsTemplate = wb.addWorksheet('Template');
    const headers = ['Subject Name','Course Code','Department','Staff Name','Seat Count','Blocked Department 1','Blocked Department 2','Blocked Department 3'];
    wsTemplate.addRow(headers);
    // sample rows
    wsTemplate.addRow(['Data Mining','DM101','ALL', staff[0] || 'Dr. A. Kumar', 60, 'CIVIL','MECH','']);
    wsTemplate.addRow(['Machine Learning','ML201','CSE', staff[1] || 'Prof. S. Ramesh', 50,'','','']);

    // columns width
    wsTemplate.columns = [
      { width: 30 }, { width: 12 }, { width: 12 }, { width: 25 }, { width: 10 }, { width: 18 }, { width: 18 }, { width: 18 }
    ];

    // Create a hidden Lists sheet with Departments in A and Staff in B
    const wsLists = wb.addWorksheet('Lists');
    // Departments in column A
    departments.forEach((d) => wsLists.addRow([d]));
    // Ensure staff starts in column B; append staff names to existing rows or new rows
    // First, write header-less entries: for each staff, push into column B
    staff.forEach((s, idx) => {
      const rowIndex = idx + 1;
      const row = wsLists.getRow(rowIndex);
      row.getCell(2).value = s; // column B
      row.commit();
    });
    wsLists.getColumn(1).width = 18;
    wsLists.getColumn(2).width = 30;
    // Hide the helper sheet so users don't see the lists
    wsLists.state = 'hidden';

    // Determine last rows for ranges
    const lastDeptRow = departments.length;
    const lastStaffRow = Math.max(staff.length, 1);

    // Define named ranges for compatibility with Excel data validation across sheets
    const deptRange = `Lists!$A$1:$A$${lastDeptRow}`;
    const staffRange = `Lists!$B$1:$B$${lastStaffRow}`;
    try {
      wb.definedNames.add('Departments', deptRange);
      wb.definedNames.add('StaffList', staffRange);
    } catch (err) {
      // ignore if definedNames API behaves differently
      console.warn('Could not add defined names:', err && err.message);
    }
    const deptRef = deptRange;
    const staffRef = staffRange;
    const lastRow = 1000;

    wsTemplate.dataValidations.add(`C2:C${lastRow}`, {
      type: 'list',
      allowBlank: false,
      formulae: ['=Departments'],
      showErrorMessage: true,
      showInputMessage: true,
    });

    wsTemplate.dataValidations.add(`D2:D${lastRow}`, {
      type: 'list',
      allowBlank: true,
      formulae: ['=StaffList'],
      showErrorMessage: true,
      showInputMessage: true,
    });

    ['F','G','H'].forEach((col) => {
      wsTemplate.dataValidations.add(`${col}2:${col}${lastRow}`, {
        type: 'list',
        allowBlank: false,
        formulae: ['=Departments'],
        showErrorMessage: true,
        showInputMessage: true,
      });
    });

    const outDir = path.join(__dirname, '..', 'public', 'templates');
    if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });
    const outPath = path.join(outDir, 'electives_import_template_with_dropdown.xlsx');

    await wb.xlsx.writeFile(outPath);
    console.log('Wrote', outPath);
  } catch (err) {
    console.error('Error:', err);
    process.exit(1);
  }
})();
