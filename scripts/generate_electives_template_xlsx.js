// Generates an XLSX template with a Template sheet and a StaffList sheet.
// Run: node scripts/generate_electives_template_xlsx.js

const XLSX = require('xlsx');
const fs = require('fs');

const templateHeaders = ['sub_name','course_code','staff_name','seat_count','blocked_departments'];
const sampleRows = [
  ['Data Mining','DM101','Dr. A. Kumar',60,'CIVIL;MECH'],
  ['Machine Learning','ML201','Prof. S. Ramesh',50,'']
];

// Example staff list - replace or extend before generating
const staff = [
  'Dr. A. Kumar',
  'Prof. S. Ramesh',
  'Ms. L. Priya',
  'Mr. K. Naveen'
];

const wb = XLSX.utils.book_new();
const wsTemplate = XLSX.utils.aoa_to_sheet([templateHeaders, ...sampleRows]);
XLSX.utils.book_append_sheet(wb, wsTemplate, 'Template');

const wsStaff = XLSX.utils.aoa_to_sheet(staff.map(s => [s]));
XLSX.utils.book_append_sheet(wb, wsStaff, 'StaffList');

const outPath = 'public/templates/electives_import_template.xlsx';
XLSX.writeFile(wb, outPath);
console.log('Wrote', outPath);
