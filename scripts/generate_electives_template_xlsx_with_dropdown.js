// Generates an XLSX template with a Template sheet and a StaffList sheet,
// and adds Excel data-validation (dropdown) on the Template's staff_name column.
// Usage:
//   Set env vars SUPABASE_URL and SUPABASE_KEY (service role or anon with read access),
//   then run: node scripts/generate_electives_template_xlsx_with_dropdown.js

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import fetch from 'node-fetch';
import XLSX from 'xlsx';
import dotenv from 'dotenv';

// Try loading .env.local for convenience when run locally
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
  // Fetch profiles with roles staff/ahod/hod
  const url = `${SUPABASE_URL.replace(/\/+$/, '')}/rest/v1/profiles?select=name&role=in.(staff,ahod,hod)&order=name`;
  const res = await fetch(url, {
    headers: {
      apikey: SUPABASE_KEY,
      Authorization: `Bearer ${SUPABASE_KEY}`,
    },
  });
  if (!res.ok) {
    throw new Error(`Failed to fetch staff: ${res.status} ${res.statusText}`);
  }
  const data = await res.json();
  return data.map((r) => r.name).filter(Boolean);
}

(async () => {
  try {
    const staff = await fetchStaff();
    if (!Array.isArray(staff)) throw new Error('Invalid staff response');

    const templateHeaders = ['sub_name','course_code','department','staff_name','seat_count','blocked_department_1','blocked_department_2','blocked_department_3'];
    const sampleRows = [
      ['Data Mining','DM101','ALL', staff[0] || 'Dr. A. Kumar', 60, 'CIVIL', 'MECH', ''],
      ['Machine Learning','ML201','CSE', staff[1] || 'Prof. S. Ramesh', 50, '', '', '']
    ];

    // Departments list (includes ALL)
    const departments = ['ALL','AI&DS','AI&ML','CSE','IT','ECE','EEE','MECH','CIVIL'];

    const wb = XLSX.utils.book_new();
    const wsTemplate = XLSX.utils.aoa_to_sheet([templateHeaders, ...sampleRows]);

    // Set a reasonable column width
    wsTemplate['!cols'] = [ { wch:30 }, { wch:12 }, { wch:12 }, { wch:25 }, { wch:10 }, { wch:18 }, { wch:18 }, { wch:18 } ];

    // Attempt to add data-validation (dropdown): department (C), staff_name (D), blocked_departments (F)
    // Note: not all readers respect this field but Excel and LibreOffice generally do.
    const lastRow = 1000;
    // Create named ranges for better Excel compatibility
    wb.Workbook = wb.Workbook || {};
    wb.Workbook.Names = wb.Workbook.Names || [];
    wb.Workbook.Names.push({ Name: 'Departments', Ref: `Departments!$A$1:$A$${departments.length}` });
    wb.Workbook.Names.push({ Name: 'StaffList', Ref: `StaffList!$A$1:$A$${Math.max(staff.length, 1)}` });

    wsTemplate['!dataValidation'] = [
      {
        sqref: `C2:C${lastRow}`,
        type: 'list',
        allowBlank: false,
        showInputMessage: true,
        showErrorMessage: true,
        formula1: `=Departments`
      },
      {
        sqref: `D2:D${lastRow}`,
        type: 'list',
        allowBlank: true,
        showInputMessage: true,
        showErrorMessage: true,
        formula1: `=StaffList`
      },
      {
        sqref: `F2:F${lastRow}`,
        type: 'list',
        allowBlank: false,
        showInputMessage: true,
        showErrorMessage: true,
        formula1: `=Departments`
      },
      {
        sqref: `G2:G${lastRow}`,
        type: 'list',
        allowBlank: false,
        showInputMessage: true,
        showErrorMessage: true,
        formula1: `=Departments`
      },
      {
        sqref: `H2:H${lastRow}`,
        type: 'list',
        allowBlank: false,
        showInputMessage: true,
        showErrorMessage: true,
        formula1: `=Departments`
      }
    ];

    XLSX.utils.book_append_sheet(wb, wsTemplate, 'Template');

    // StaffList sheet
    const wsStaff = XLSX.utils.aoa_to_sheet(staff.map(s => [s]));
    wsStaff['!cols'] = [{ wch: 30 }];
    XLSX.utils.book_append_sheet(wb, wsStaff, 'StaffList');

    // Departments sheet
    const wsDept = XLSX.utils.aoa_to_sheet(departments.map(d => [d]));
    wsDept['!cols'] = [{ wch: 18 }];
    XLSX.utils.book_append_sheet(wb, wsDept, 'Departments');

    const outDir = path.join(__dirname, '..', 'public', 'templates');
    if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });
    const outPath = path.join(outDir, 'electives_import_template_with_dropdown.xlsx');

    XLSX.writeFile(wb, outPath);
    console.log('Wrote', outPath);
  } catch (err) {
    console.error('Error:', err.message || err);
    process.exit(1);
  }
})();
