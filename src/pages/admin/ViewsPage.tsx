import { useEffect, useState } from 'react';
import DashboardLayout from '../../components/DashboardLayout';
import { useAuth } from '../../contexts/AuthContext';
import { supabase } from '../../lib/supabase';
import { createBulkUsers } from '../../lib/userManagement';
import { fetchInChunks } from '../../lib/supabaseHelpers';

export default function ViewsPage() {
  const { profile } = useAuth();
  const [departments, setDepartments] = useState<string[]>([]);
  const [selectedDept, setSelectedDept] = useState<string>('');
  const [loading, setLoading] = useState(false);
  const [hodList, setHodList] = useState<any[]>([]);
  const [ahodList, setAhodList] = useState<any[]>([]);
  const [staffList, setStaffList] = useState<any[]>([]);
  const [studentList, setStudentList] = useState<any[]>([]);
  const [activeCard, setActiveCard] = useState<'staff'|'students'|'hod'|'ahod'|null>(null);
  const [editingUser, setEditingUser] = useState<any>(null);
  const [showEditModal, setShowEditModal] = useState(false);
  const [studentYearFilter, setStudentYearFilter] = useState<string>('');
  const [studentSectionFilter, setStudentSectionFilter] = useState<string>('');
  const [studentSortAsc, setStudentSortAsc] = useState<boolean>(true);

  // Helper getters to handle multiple possible shapes of student data
  const getRegNo = (s: any) => s?.reg_no ?? s?.regno ?? s?.regNo ?? s?.student?.reg_no ?? s?.students?.reg_no ?? '';
  const getRollNo = (s: any) => s?.roll_no ?? s?.rollno ?? s?.rollNo ?? s?.student?.roll_no ?? s?.students?.roll_no ?? '';
  const getYear = (s: any) => (s?.year ?? s?.student?.year ?? s?.students?.year ?? '') ;
  const getSection = (s: any) => (s?.section ?? s?.student?.section ?? s?.students?.section ?? '') ;

  useEffect(() => {
    fetchDepartments();
  }, []);

  useEffect(() => {
    if (selectedDept) loadDepartmentData(selectedDept);
  }, [selectedDept]);

  const fetchDepartments = async () => {
    try {
      const { data } = await supabase
        .from('profiles')
        .select('department')
        .neq('department', null);
      const deps = Array.from(new Set((data || []).map((d: any) => d.department))).filter(Boolean).sort();
      setDepartments(deps);
      if (deps.length > 0 && !selectedDept) setSelectedDept(deps[0]);
    } catch (err) {
      console.error('Error fetching departments', err);
    }
  };

  const loadDepartmentData = async (dept: string) => {
    try {
      setLoading(true);
      const { data: profiles, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('department', dept);

      if (error) throw error;

      const userIds = profiles.map((p) => p.id);
      console.log('User IDs for query:', userIds);

      // Fetch staff and student data in chunks to avoid oversized requests
      let staffData: any[] | null = null;
      let studentData: any[] | null = null;
      try {
        staffData = await fetchInChunks('staff', '*', 'id', userIds as any[]);
        console.log('Fetched staff data (chunked):', staffData?.length ?? 0);
      } catch (e: any) {
        console.error('Error fetching staff data (chunked):', e?.message || e);
      }

      try {
        studentData = await fetchInChunks('students', '*', 'id', userIds as any[]);
        console.log('Fetched student data (chunked):', studentData?.length ?? 0);
      } catch (e: any) {
        console.error('Error fetching student data (chunked):', e?.message || e);
      }

      const staffDataMap = new Map(
        staffData?.map((s) => [s.id, s]) || []
      );
      const studentDataMap = new Map(
        studentData?.map((s) => [s.id, s]) || []
      );

      const combinedData = profiles.map((profile) => ({
        ...profile,
        ...(staffDataMap.get(profile.id) || {}),
        ...(studentDataMap.get(profile.id) || {}),
      }));

      console.log('Combined Data before filtering:', JSON.stringify(combinedData, null, 2));

      const hodsData = combinedData.filter((p) => p.role === 'hod');
      const ahodsData = combinedData.filter((p) => p.role === 'ahod');
      const staff = combinedData.filter((p) => p.role === 'staff');
      const students = combinedData.filter((p) => p.role === 'student');

      setHodList(hodsData);
      setAhodList(ahodsData);
      setStaffList(staff);
      setStudentList(students);

      // reset filters/sort when loading a new department
      setStudentYearFilter('');
      setStudentSectionFilter('');
      setStudentSortAsc(true);

    } catch (err) {
      console.error('Error loading department data', err);
    } finally {
      setLoading(false);
    }
  };

  const handleEdit = (user: any) => {
    setEditingUser({ ...user });
    setShowEditModal(true);
  };

  const handleDelete = async (userId: string) => {
    if (!confirm('Are you sure you want to delete this user?')) return;

    // Allow a local dev shortcut: when running in dev/localhost and current user is admin,
    // perform direct deletes against `profiles`, `students`, and `staff` using the public supabase client.
    // This avoids requiring the admin API or admin token during local development.
    const isLocalDev = Boolean((import.meta as any).env?.DEV) || window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
    if (isLocalDev && profile?.role === 'admin') {
      try {
        const sDel = await supabase.from('students').delete().eq('id', userId);
        if (sDel.error) console.warn('Direct delete students error', sDel.error);
        const stfDel = await supabase.from('staff').delete().eq('id', userId);
        if (stfDel.error) console.warn('Direct delete staff error', stfDel.error);
        const pDel = await supabase.from('profiles').delete().eq('id', userId);
        if (pDel.error) {
          console.error('Direct delete profile error', pDel.error);
          throw pDel.error;
        }

        alert('User rows deleted locally (profiles/students/staff). Note: auth user not removed from Supabase Auth.');
        loadDepartmentData(selectedDept);
        return;
      } catch (e: any) {
        console.error('Local direct delete failed', e);
        alert('Local delete failed: ' + (e?.message || String(e)));
        // fallthrough to admin API attempt
      }
    }

    try {
      // Call admin API to delete user and related DB rows, then delete auth user
      const apiUrl = (await import('../../lib/adminApi')).getAdminApiUrl('/delete-user');
      const adminToken = (import.meta as any).env?.VITE_ADMIN_TOKEN || (window as any).__ADMIN_TOKEN__ || '';
      const resp = await fetch(apiUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-admin-token': adminToken },
        body: JSON.stringify({ id: userId }),
      });
      const body = await resp.json();
      if (!resp.ok) {
        throw new Error(body?.error || JSON.stringify(body));
      }

      alert('User deleted successfully');
      loadDepartmentData(selectedDept);
    } catch (err: any) {
      console.error('Error deleting user:', err);
      // Attempt best-effort direct DB delete as fallback (auth user will remain)
      try {
        const sDel = await supabase.from('students').delete().eq('id', userId);
        if (sDel.error) console.warn('Direct delete students error', sDel.error);
        const stfDel = await supabase.from('staff').delete().eq('id', userId);
        if (stfDel.error) console.warn('Direct delete staff error', stfDel.error);
        const pDel = await supabase.from('profiles').delete().eq('id', userId);
        if (pDel.error) {
          console.error('Direct delete profile error', pDel.error);
          throw pDel.error;
        }

        alert('User rows deleted locally (profiles/students/staff). Note: auth user not removed from Supabase Auth.');
        loadDepartmentData(selectedDept);
      } catch (e: any) {
        console.error('Fallback direct delete failed', e);
        alert('Failed to delete user: ' + (e?.message || String(e)));
      }
    }
  };

  // Bulk import state and helpers
  const [importFileName, setImportFileName] = useState<string | null>(null);
  const [importPreview, setImportPreview] = useState<any[] | null>(null);
  const [importErrors, setImportErrors] = useState<string[] | null>(null);
  const [importProcessing, setImportProcessing] = useState(false);

  const downloadSampleCsv = () => {
    const headers = ['name', 'email', 'department', 'dob', 'reg_no', 'roll_no', 'year', 'section', 'password'];
    const example = [
      ['John Doe','john.doe@example.com', selectedDept || 'AI&DS','2003-01-01','REG123','R001','1','A','Password123!'],
      ['Jane Smith','jane.smith@example.com', selectedDept || 'AI&DS','2003-02-02','REG124','R002','1','A','Password123!']
    ];
    const rows = [headers, ...example].map(r => r.map((c) => `"${String(c).replace(/"/g,'""')}"`).join(','));
    const blob = new Blob([rows.join('\n')], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'students-sample.csv';
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };

  const parseCsvText = (text: string) => {
    // Keep original raw lines so we can report original file line numbers
    const rawLines = text.split(/\r?\n/);
    // find first non-empty (non-whitespace) line to treat as header
    const headerIdx = rawLines.findIndex((l) => l.trim().length > 0);
    if (headerIdx === -1) return { rows: [], errors: ['CSV must contain a header row and at least one data row'] };
    const headerLine = rawLines[headerIdx];

    // naive CSV parser (handles quoted values)
    const parseLine = (line: string) => {
      const values: string[] = [];
      let cur = '';
      let inQuotes = false;
      for (let i = 0; i < line.length; i++) {
        const ch = line[i];
        if (ch === '"') {
          if (inQuotes && line[i + 1] === '"') {
            cur += '"';
            i++;
            continue;
          }
          inQuotes = !inQuotes;
          continue;
        }
        if (ch === ',' && !inQuotes) {
          values.push(cur);
          cur = '';
          continue;
        }
        cur += ch;
      }
      values.push(cur);
      return values.map((v) => v.trim());
    };

    const headers = parseLine(headerLine).map((h) => h.toLowerCase());
    const rows: any[] = [];
    const errors: string[] = [];

    // iterate over remaining raw lines and preserve file line numbers
    for (let idx = headerIdx + 1; idx < rawLines.length; idx++) {
      const raw = rawLines[idx];
      if (raw.trim().length === 0) {
        // skip completely empty lines
        continue;
      }
      try {
        const vals = parseLine(raw);
        // if all values are empty (e.g., ",,,,,,"), skip the row silently
        const allEmpty = vals.every((v) => v === '');
        if (allEmpty) continue;

        const obj: any = {};
        headers.forEach((h, j) => {
          obj[h] = vals[j] ?? '';
        });

        // basic validation
        if (!obj.name || !obj.email || !obj.department || !obj.reg_no || !obj.roll_no || !obj.year || !obj.section) {
          errors.push(`Row ${idx + 1}: missing required field(s)`);
        }
        rows.push(obj);
      } catch (e) {
        errors.push(`Row ${idx + 1}: parse error`);
      }
    }

    return { rows, errors };
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setImportFileName(file.name);
    const text = await file.text();
    const { rows, errors } = parseCsvText(text);
    setImportPreview(rows);
    setImportErrors(errors.length ? errors : null);
  };

  const handleImport = async () => {
    if (!importPreview || importPreview.length === 0) {
      alert('No rows to import');
      return;
    }
    if (!confirm(`Import ${importPreview.length} students? This will create auth users and profiles.`)) return;
    setImportProcessing(true);
    setImportErrors(null);
    
    // Use Edge Function for bulk import
    const usersData = importPreview.map(row => ({
      name: row.name,
      email: row.email,
      department: row.department || selectedDept || '',
      password: row.password || 'Password123!',
      role: 'student',
      reg_no: row.reg_no,
      roll_no: row.roll_no,
      year: row.year,
      section: row.section,
    }));
    
    const { results, errors } = await createBulkUsers(usersData);
    
    setImportProcessing(false);
    const resultMessages = [
      ...results.map((r, idx) => `Row ${idx+1}: ${r.success ? 'OK' : 'ERROR'} - ${r.success ? r.user : r.error}`),
      ...errors.map((e, idx) => `Row ${results.length + idx + 1}: ERROR - ${e.error}`)
    ];
    setImportErrors(resultMessages);
    
    // reload data
    loadDepartmentData(selectedDept);
  };

  const handleSaveEdit = async () => {
    if (!editingUser) return;
    
    try {
      // Fetch existing profile to detect role changes
      const { data: existingProfile, error: existingProfileErr } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', editingUser.id)
        .maybeSingle();

      if (existingProfileErr) throw existingProfileErr;

      // Update profile first
      const { error: profileError } = await supabase
        .from('profiles')
        .update({
          name: editingUser.name,
          email: editingUser.email,
          dob: editingUser.dob,
          department: editingUser.department,
          role: editingUser.role,
        })
        .eq('id', editingUser.id);

      if (profileError) throw profileError;

      // If role changed, reconcile staff/student tables so queries from other pages remain correct
      const prevRole = existingProfile?.role;
      const newRole = editingUser.role;

      // Helper: upsert staff row
      const upsertStaff = async () => {
        // Check if staff exists
        const { data: sExisting } = await supabase.from('staff').select('id').eq('id', editingUser.id).maybeSingle();
        if (sExisting) {
          await supabase.from('staff').update({
            staff_id: editingUser.staff_id || undefined,
            staff_role: editingUser.staff_role || undefined,
            year: editingUser.year ?? null,
            section: editingUser.section || null,
            on_leave: editingUser.on_leave || false,
          }).eq('id', editingUser.id);
        } else {
          await supabase.from('staff').insert({
            id: editingUser.id,
            staff_id: editingUser.staff_id || `STF${Date.now().toString().slice(-6)}`,
            staff_role: editingUser.staff_role || 'lecturer',
            year: editingUser.year ?? null,
            section: editingUser.section || null,
            on_leave: editingUser.on_leave || false,
          });
        }
        // After upserting staff, if this staff is an advisor with year+section, notify admin API
        // to assign matching students to this advisor (uses service-role key on server).
        try {
          if (editingUser.staff_role === 'advisor' && editingUser.year && editingUser.section) {
              const apiUrl = (await import('../../lib/adminApi')).getAdminApiUrl('/repair-advisor');
              const adminToken = (import.meta as any).env?.VITE_ADMIN_TOKEN || (window as any).__ADMIN_TOKEN__ || '';
              try {
                await fetch(apiUrl, {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json', ...(adminToken ? { 'x-admin-token': adminToken } : {}) },
                  body: JSON.stringify({
                    advisor_id: editingUser.id,
                    department: editingUser.department || null,
                    year: editingUser.year,
                    section: String(editingUser.section).toUpperCase(),
                    setStaffYearSection: false,
                    assignStudents: true
                  })
                }).then(async (r) => {
                  if (!r.ok) {
                    const body = await r.json().catch(() => ({}));
                    console.warn('repair-advisor failed', r.status, body);
                  }
                }).catch((e) => console.warn('repair-advisor request failed', e));
              } catch (apiErr) {
                console.warn('repair-advisor admin API failed, attempting local assignment', apiErr);
                try {
                  // Fallback: assign students in DB matching year/section and department
                  const { data: profs } = await supabase.from('profiles').select('id').eq('department', editingUser.department || null);
                  const profIds = (profs || []).map((p: any) => p.id);
                  if (profIds.length > 0) {
                    const { error: updErr } = await supabase.from('students').update({ advisor_id: editingUser.id }).in('id', profIds).eq('year', editingUser.year).eq('section', String(editingUser.section).toUpperCase());
                    if (updErr) console.warn('Local assign students error', updErr);
                  } else {
                    console.warn('No profiles found for department, skipping local assign');
                  }
                } catch (locErr) {
                  console.warn('Local repair-advisor fallback failed', locErr);
                }
              }
          }
        } catch (e) {
          console.warn('repair-advisor call error', e);
        }
      };

      // Helper: upsert student row
      const upsertStudent = async () => {
        const { data: stExisting } = await supabase.from('students').select('id').eq('id', editingUser.id).maybeSingle();
        if (stExisting) {
          await supabase.from('students').update({
            reg_no: editingUser.reg_no || null,
            roll_no: editingUser.roll_no || null,
            year: editingUser.year ?? null,
            section: editingUser.section || null,
          }).eq('id', editingUser.id);
        } else {
          await supabase.from('students').insert({
            id: editingUser.id,
            reg_no: editingUser.reg_no || null,
            roll_no: editingUser.roll_no || null,
            year: editingUser.year ?? null,
            section: editingUser.section || null,
            mentor_id: null,
            advisor_id: null,
            ahod_id: null,
            hod_id: null,
          });
        }
        // After upserting student, attempt to assign advisor based on staff year/section and profile.department
        try {
          // Only attempt if we have a year and section for the student
          if (editingUser.year && editingUser.section) {
            // Find advisors with same year/section
            const { data: advisorsByClass, error: advisorsErr } = await supabase
              .from('staff')
              .select('id')
              .eq('staff_role', 'advisor')
              .eq('year', editingUser.year)
              .eq('section', String(editingUser.section).toUpperCase());
            if (advisorsErr) throw advisorsErr;

            const advisorIds = (advisorsByClass || []).map((a: any) => a.id);
            if (advisorIds.length > 0) {
              // Filter by department via profiles
              const { data: profilesInDept, error: profErr } = await supabase
                .from('profiles')
                .select('id')
                .in('id', advisorIds)
                .eq('department', editingUser.department || null);
              if (profErr) throw profErr;
              const matchingAdvisorIds = (profilesInDept || []).map((p: any) => p.id);
              const newAdvisorId = matchingAdvisorIds.length > 0 ? matchingAdvisorIds[0] : null;

              await supabase.from('students').update({ advisor_id: newAdvisorId }).eq('id', editingUser.id);
            } else {
              // No advisor for this class - clear advisor_id
              await supabase.from('students').update({ advisor_id: null }).eq('id', editingUser.id);
            }
          } else {
            // No class specified - clear advisor
            await supabase.from('students').update({ advisor_id: null }).eq('id', editingUser.id);
          }
        } catch (assignErr) {
          console.warn('Failed to auto-assign advisor after student upsert:', assignErr);
        }
      };

      // If role changed from staff->student or student->staff, create/delete appropriate rows
      if (prevRole && prevRole !== newRole) {
        if (newRole === 'staff') {
          // Remove any student row (if present) and ensure staff row exists
          try { await supabase.from('students').delete().eq('id', editingUser.id); } catch (e) { /* ignore */ }
          await upsertStaff();
        } else if (newRole === 'student') {
          // Remove any staff row and ensure student row exists
          try { await supabase.from('staff').delete().eq('id', editingUser.id); } catch (e) { /* ignore */ }
          await upsertStudent();
        } else {
          // For other roles (hod/ahod/admin), ensure staff row exists and student row removed
          try { await supabase.from('students').delete().eq('id', editingUser.id); } catch (e) { /* ignore */ }
          await upsertStaff();
        }
      } else {
        // Role unchanged - update corresponding role table
        if (newRole === 'staff') {
          await upsertStaff();
          // Ensure advisors get their class students assigned after a staff update
          try {
                if (editingUser.staff_role === 'advisor' && editingUser.year && editingUser.section) {
                  const apiUrl = (await import('../../lib/adminApi')).getAdminApiUrl('/repair-advisor');
                  const adminToken = (import.meta as any).env?.VITE_ADMIN_TOKEN || (window as any).__ADMIN_TOKEN__ || '';
                  try {
                    await fetch(apiUrl, {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json', ...(adminToken ? { 'x-admin-token': adminToken } : {}) },
                      body: JSON.stringify({
                        advisor_id: editingUser.id,
                        department: editingUser.department || null,
                        year: editingUser.year,
                        section: String(editingUser.section).toUpperCase(),
                        setStaffYearSection: false,
                        assignStudents: true
                      })
                    }).then(async (r) => {
                      if (!r.ok) {
                        const body = await r.json().catch(() => ({}));
                        console.warn('repair-advisor failed', r.status, body);
                      }
                    }).catch((e) => console.warn('repair-advisor request failed', e));
                  } catch (apiErr) {
                    console.warn('repair-advisor admin API failed, attempting local assignment', apiErr);
                    try {
                      // Fallback: assign students in DB matching year/section and department
                      const { data: profs } = await supabase.from('profiles').select('id').eq('department', editingUser.department || null);
                      const profIds = (profs || []).map((p: any) => p.id);
                      if (profIds.length > 0) {
                        const { error: updErr } = await supabase.from('students').update({ advisor_id: editingUser.id }).in('id', profIds).eq('year', editingUser.year).eq('section', String(editingUser.section).toUpperCase());
                        if (updErr) console.warn('Local assign students error', updErr);
                      } else {
                        console.warn('No profiles found for department, skipping local assign');
                      }
                    } catch (locErr) {
                      console.warn('Local repair-advisor fallback failed', locErr);
                    }
                  }
                }
          } catch (e) {
            console.warn('repair-advisor call error', e);
          }
        } else if (newRole === 'student') {
          await upsertStudent();
        }
      }

      alert('User updated successfully');
      setShowEditModal(false);
      setEditingUser(null);
      loadDepartmentData(selectedDept);
    } catch (err: any) {
      console.error('Error updating user:', err);
      alert('Failed to update user: ' + err.message);
    }
  };

  const sidebarItems = [
    { label: 'Dashboard', path: '/admin-dashboard', icon: <div className="w-5 h-5" /> },
    { label: 'Views', path: '/admin/views', icon: <div className="w-5 h-5" /> },
  ];

  // Derived helpers for student filters/sorting
  const _years = Array.from(new Set(studentList.map((s) => String(getYear(s) ?? '').trim()).filter((y) => y !== '' && y !== 'null' && y !== 'undefined')));
  let availableYears = _years.sort((a: any, b: any) => Number(a) - Number(b));
  if (availableYears.length === 0) {
    // fallback to common years so filters are usable even if DB values are missing
    availableYears = ['1', '2', '3', '4'];
  }

  const availableSections = Array.from(new Set(studentList.map((s) => String(getSection(s) ?? '').trim().toUpperCase()).filter(Boolean))).sort();

  const filteredStudentList = (studentList || [])
    .filter((s) => (studentYearFilter ? String(getYear(s)) === String(studentYearFilter) : true))
    .filter((s) => (studentSectionFilter ? String(getSection(s)).trim().toUpperCase() === String(studentSectionFilter) : true))
    .slice() // copy before sort
    .sort((a: any, b: any) => {
      const an = (a.name || '').toLowerCase();
      const bn = (b.name || '').toLowerCase();
      return studentSortAsc ? an.localeCompare(bn) : bn.localeCompare(an);
    });

  return (
    <DashboardLayout sidebarItems={sidebarItems}>
      <div className="max-w-7xl mx-auto p-4">
        <h1 className="text-2xl font-bold">Views</h1>
        <p className="text-slate-600 mt-1">Select a department to view staffs, students, HOD and AHOD.</p>

        <div className="mt-6 flex items-center gap-4">
          <label className="font-medium">Department</label>
          <select
            value={selectedDept}
            onChange={(e) => setSelectedDept(e.target.value)}
            className="border rounded px-3 py-2"
          >
            {departments.map((d) => (
              <option key={d} value={d}>{d}</option>
            ))}
          </select>
        </div>
        {/* Quick debug/status for problematic departments like AI&DS */}
        {selectedDept === 'AI&DS' && (
          <div className="mt-3 p-3 bg-yellow-50 border border-yellow-100 text-sm rounded">
            <div className="font-medium">Debug: Selected department = AI&DS</div>
            <div className="text-xs text-slate-600 mt-1">Profiles found: {departments.includes(selectedDept) ? 'yes' : 'no'} — Students fetched: {studentList.length} — Staff fetched: {staffList.length}</div>
            <div className="text-xs text-slate-500 mt-1">Open browser console to see detailed fetch logs (loadDepartmentData logs).</div>
          </div>
        )}

        {/* Quick links to open respective cards */}
        <div className="mt-4 flex flex-wrap gap-3">
          {['staff','students','hod','ahod'].map((k) => {
            const key = k as 'staff'|'students'|'hod'|'ahod';
            const label = key === 'staff' ? 'Staff' : key === 'students' ? 'Students' : key === 'hod' ? 'HOD' : 'AHOD';
            const active = activeCard === key;
            return (
              <button
                key={key}
                onClick={() => {
                  setActiveCard(active ? null : key);
                  // scroll to card after a tiny delay to ensure render
                  setTimeout(() => {
                    const el = document.getElementById(`views-card-${key}`);
                    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
                  }, 150);
                }}
                className={`text-sm px-3 py-2 rounded-md transition-colors border ${active ? 'bg-blue-600 text-white border-blue-600' : 'bg-transparent text-blue-600 border-blue-200 hover:bg-blue-50'}`}>
                {label}
              </button>
            );
          })}
        </div>

        {loading ? (
          <div className="mt-6">Loading...</div>
        ) : activeCard ? (
          <div className="mt-6">
            {activeCard === 'staff' && (
              <div id="views-card-staff" className="bg-white p-6 rounded shadow">
                <h2 className="font-semibold mb-3">Staff — {selectedDept}</h2>
                {staffList.length === 0 ? <p className="text-slate-500">No staff</p> : (
                  <div>
                    <table className="min-w-full text-sm border-collapse">
                      <thead>
                        <tr className="text-left text-xs text-slate-500 border-b">
                          <th className="py-2">Name</th>
                          <th className="py-2">Email</th>
                          <th className="py-2">Role</th>
                          <th className="py-2">Year/Section</th>
                          <th className="py-2">Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {staffList.map(s => (
                          <tr key={s.id} className="border-b hover:bg-gray-50">
                            <td className="py-2">{s.name}</td>
                            <td className="py-2 text-slate-600">{s.email}</td>
                            <td className="py-2">{s.staff_role || '—'}</td>
                            <td className="py-2">{s.year ? `Y${s.year} ${s.section || ''}` : '—'}</td>
                            <td className="py-2">
                              <button
                                onClick={() => handleEdit(s)}
                                className="text-blue-600 hover:text-blue-800 mr-3 text-sm"
                              >
                                Edit
                              </button>
                              <button
                                onClick={() => handleDelete(s.id)}
                                className="text-red-600 hover:text-red-800 text-sm"
                              >
                                Delete
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )}

            {activeCard === 'students' && (
              <div id="views-card-students" className="bg-white p-6 rounded shadow">
                <div className="flex items-center justify-between mb-3">
                  <h2 className="font-semibold">Students — {selectedDept}</h2>
                  <div className="flex items-center gap-2">
                    <select value={studentYearFilter} onChange={(e) => setStudentYearFilter(e.target.value)} className="text-sm px-2 py-1 border rounded bg-white">
                      <option value="">All Years</option>
                      {availableYears.map((y: any) => (<option key={y} value={String(y)}>Year {y}</option>))}
                    </select>
                    <select value={studentSectionFilter} onChange={(e) => setStudentSectionFilter(e.target.value)} className="text-sm px-2 py-1 border rounded bg-white">
                      <option value="">All Sections</option>
                      {availableSections.map((sec) => (<option key={sec} value={sec}>{sec}</option>))}
                    </select>
                    <button onClick={() => setStudentSortAsc((s) => !s)} className="text-sm px-2 py-1 border rounded bg-white">
                      {studentSortAsc ? 'Sort A → Z' : 'Sort Z → A'}
                    </button>
                    <button onClick={downloadSampleCsv} className="text-sm px-3 py-2 border rounded bg-gray-50 hover:bg-gray-100">Download sample CSV</button>
                    <label className="text-sm px-3 py-2 border rounded bg-white hover:bg-gray-50 cursor-pointer">
                      <input type="file" accept=".csv" onChange={handleFileChange} className="hidden" />
                      Upload CSV
                    </label>
                    <button onClick={handleImport} disabled={!importPreview || importPreview.length === 0 || importProcessing} className="text-sm px-3 py-2 border rounded bg-blue-600 text-white disabled:opacity-50">
                      {importProcessing ? 'Importing...' : 'Import'}
                    </button>
                  </div>
                </div>
                {importPreview && (
                  <div className="mb-3 text-sm text-slate-600">Preview rows: {importPreview.length} {importFileName ? ` — ${importFileName}` : ''}</div>
                )}
                {importErrors && importErrors.length > 0 && (
                  <div className="mb-3 p-3 bg-rose-50 border border-rose-100 text-sm rounded">
                    <div className="font-medium text-rose-700">Import results / errors</div>
                    <ul className="list-disc ml-5 mt-2">
                      {importErrors.map((err, i) => (<li key={i} className="text-rose-700">{err}</li>))}
                    </ul>
                  </div>
                )}
                <hr className="mb-4" />
                {filteredStudentList.length === 0 ? <p className="text-slate-500">No students</p> : (
                  <div>
                    <table className="min-w-full text-sm border-collapse">
                      <thead>
                        <tr className="text-left text-xs text-slate-500 border-b">
                          <th className="py-2">S.No</th>
                          <th className="py-2">Name</th>
                          <th className="py-2">Email</th>
                          <th className="py-2">Reg No</th>
                          <th className="py-2">Roll No</th>
                          <th className="py-2">Year/Section</th>
                          <th className="py-2">Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {filteredStudentList.map((s, idx) => (
                          <tr key={s.id} className="border-b hover:bg-gray-50">
                            <td className="py-2">{idx + 1}</td>
                            <td className="py-2">{s.name}</td>
                            <td className="py-2 text-slate-600">{s.email}</td>
                            <td className="py-2">{getRegNo(s) || '—'}</td>
                            <td className="py-2">{getRollNo(s) || '—'}</td>
                            <td className="py-2">{getYear(s) ? `Y${getYear(s)} ${getSection(s) || ''}` : '—'}</td>
                            <td className="py-2">
                              <button
                                onClick={() => handleEdit(s)}
                                className="text-blue-600 hover:text-blue-800 mr-3 text-sm"
                              >
                                Edit
                              </button>
                              <button
                                onClick={() => handleDelete(s.id)}
                                className="text-red-600 hover:text-red-800 text-sm"
                              >
                                Delete
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )}

            {activeCard === 'hod' && (
              <div id="views-card-hod" className="bg-white p-6 rounded shadow">
                <h2 className="font-semibold mb-3">HOD — {selectedDept}</h2>
                {hodList.length === 0 ? <p className="text-slate-500">No HOD</p> : (
                  <ul className="space-y-2">
                    {hodList.map(h => (
                      <li key={h.id} className="flex justify-between items-center border-b py-2">
                        <div>
                          <div className="font-medium">{h.name}</div>
                          <div className="text-xs text-slate-500">{h.email}</div>
                        </div>
                        <div className="flex gap-2">
                          <button
                            onClick={() => handleEdit(h)}
                            className="text-blue-600 hover:text-blue-800 text-sm"
                          >
                            Edit
                          </button>
                          <button
                            onClick={() => handleDelete(h.id)}
                            className="text-red-600 hover:text-red-800 text-sm"
                          >
                            Delete
                          </button>
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}

            {activeCard === 'ahod' && (
              <div id="views-card-ahod" className="bg-white p-6 rounded shadow">
                <h2 className="font-semibold mb-3">AHOD — {selectedDept}</h2>
                {ahodList.length === 0 ? <p className="text-slate-500">No AHOD</p> : (
                  <ul className="space-y-2">
                    {ahodList.map(a => (
                      <li key={a.id} className="flex justify-between items-center border-b py-2">
                        <div>
                          <div className="font-medium">{a.name}</div>
                          <div className="text-xs text-slate-500">{a.email}</div>
                        </div>
                        <div className="flex gap-2">
                          <button
                            onClick={() => handleEdit(a)}
                            className="text-blue-600 hover:text-blue-800 text-sm"
                          >
                            Edit
                          </button>
                          <button
                            onClick={() => handleDelete(a.id)}
                            className="text-red-600 hover:text-red-800 text-sm"
                          >
                            Delete
                          </button>
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}
          </div>
        ) : (
          <div className="mt-6 grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div id="views-card-staff" className={`bg-white p-4 rounded shadow ${activeCard === 'staff' ? 'ring-2 ring-blue-200' : ''}`}>
              <h2 className="font-semibold mb-3">Staff</h2>
              {staffList.length === 0 ? <p className="text-slate-500">No staff</p> : (
                <ul className="space-y-2">
                  {staffList.map((s) => (
                    <li key={s.id} className="flex justify-between">
                      <div>
                        <div className="font-medium">{s.name}</div>
                        <div className="text-xs text-slate-500">{s.email}</div>
                      </div>
                      <div className="text-right text-sm text-slate-600">
                        <div>{s.staff_role || '—'}</div>
                        {s.year ? <div>Y{s.year} {s.section}</div> : null}
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <div id="views-card-students" className={`bg-white p-4 rounded shadow ${activeCard === 'students' ? 'ring-2 ring-blue-200' : ''}`}>
              <div className="flex items-center justify-between mb-3">
                <h2 className="font-semibold">Students</h2>
                <div className="flex items-center gap-2">
                  <select value={studentYearFilter} onChange={(e) => setStudentYearFilter(e.target.value)} className="text-sm px-2 py-1 border rounded bg-white">
                    <option value="">All Years</option>
                    {availableYears.map((y: any) => (<option key={y} value={String(y)}>Year {y}</option>))}
                  </select>
                  <select value={studentSectionFilter} onChange={(e) => setStudentSectionFilter(e.target.value)} className="text-sm px-2 py-1 border rounded bg-white">
                    <option value="">All Sections</option>
                    {availableSections.map((sec) => (<option key={sec} value={sec}>{sec}</option>))}
                  </select>
                  <button onClick={() => setStudentSortAsc((s) => !s)} className="text-sm px-2 py-1 border rounded bg-white">
                    {studentSortAsc ? 'A → Z' : 'Z → A'}
                  </button>
                  <button onClick={downloadSampleCsv} className="text-sm px-3 py-1 border rounded bg-gray-50 hover:bg-gray-100">Sample CSV</button>
                  <label className="text-sm px-3 py-1 border rounded bg-white hover:bg-gray-50 cursor-pointer">
                    <input type="file" accept=".csv" onChange={handleFileChange} className="hidden" />
                    Upload
                  </label>
                </div>
              </div>
              {importPreview && (
                <div className="mb-2 text-xs text-slate-600">Preview rows: {importPreview.length} {importFileName ? ` — ${importFileName}` : ''}</div>
              )}
              {filteredStudentList.length === 0 ? <p className="text-slate-500">No students</p> : (
                <ul className="space-y-2">
                  {filteredStudentList.map((s, idx) => (
                    <li key={s.id} className="flex justify-between">
                      <div>
                        <div className="font-medium">{idx + 1}. {s.name}</div>
                        <div className="text-xs text-slate-500">{s.email}</div>
                      </div>
                      <div className="text-right text-sm text-slate-600">
                        <div>{getRegNo(s) || '—'}</div>
                        <div>{getRollNo(s) || '—'}</div>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <div id="views-card-hod" className={`bg-white p-4 rounded shadow ${activeCard === 'hod' ? 'ring-2 ring-blue-200' : ''}`}>
              <h2 className="font-semibold mb-3">HOD</h2>
              {hodList.length === 0 ? <p className="text-slate-500">No HOD</p> : (
                <ul className="space-y-2">
                  {hodList.map((h) => (
                    <li key={h.id} className="flex justify-between">
                      <div>
                        <div className="font-medium">{h.name}</div>
                        <div className="text-xs text-slate-500">{h.email}</div>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <div id="views-card-ahod" className={`bg-white p-4 rounded shadow ${activeCard === 'ahod' ? 'ring-2 ring-blue-200' : ''}`}>
              <h2 className="font-semibold mb-3">AHOD</h2>
              {ahodList.length === 0 ? <p className="text-slate-500">No AHOD</p> : (
                <ul className="space-y-2">
                  {ahodList.map((a) => (
                    <li key={a.id} className="flex justify-between">
                      <div>
                        <div className="font-medium">{a.name}</div>
                        <div className="text-xs text-slate-500">{a.email}</div>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Edit Modal */}
      {showEditModal && editingUser && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 max-w-2xl w-full mx-4 max-h-[90vh] overflow-y-auto">
            <h2 className="text-xl font-bold mb-4">Edit User</h2>
            
            <div className="space-y-4">
              {/* Common Fields */}
              <div>
                <label className="block text-sm font-medium mb-1">Name</label>
                <input
                  type="text"
                  value={editingUser.name || ''}
                  onChange={(e) => setEditingUser({ ...editingUser, name: e.target.value })}
                  className="w-full border rounded px-3 py-2"
                />
              </div>

              <div>
                <label className="block text-sm font-medium mb-1">Email</label>
                <input
                  type="email"
                  value={editingUser.email || ''}
                  onChange={(e) => setEditingUser({ ...editingUser, email: e.target.value })}
                  className="w-full border rounded px-3 py-2"
                />
              </div>

              <div>
                <label className="block text-sm font-medium mb-1">Date of Birth</label>
                <input
                  type="date"
                  value={editingUser.dob || ''}
                  onChange={(e) => setEditingUser({ ...editingUser, dob: e.target.value })}
                  className="w-full border rounded px-3 py-2"
                />
              </div>

              <div>
                <label className="block text-sm font-medium mb-1">Department</label>
                <select
                  value={editingUser.department || ''}
                  onChange={(e) => setEditingUser({ ...editingUser, department: e.target.value })}
                  className="w-full border rounded px-3 py-2"
                >
                  {departments.map((d) => (
                    <option key={d} value={d}>{d}</option>
                  ))}
                </select>
              </div>

              {/* Staff-specific fields */}
              {editingUser.role === 'staff' && (
                <>
                  <div>
                    <label className="block text-sm font-medium mb-1">Staff ID</label>
                    <input
                      type="text"
                      value={editingUser.staff_id || ''}
                      onChange={(e) => setEditingUser({ ...editingUser, staff_id: e.target.value })}
                      className="w-full border rounded px-3 py-2"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium mb-1">Staff Role</label>
                    <select
                      value={editingUser.staff_role || ''}
                      onChange={(e) => setEditingUser({ ...editingUser, staff_role: e.target.value })}
                      className="w-full border rounded px-3 py-2"
                    >
                      <option value="mentor">Mentor</option>
                      <option value="advisor">Advisor</option>
                      <option value="lecturer">Lecturer</option>
                    </select>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium mb-1">Year</label>
                      <select
                        value={editingUser.year || ''}
                        onChange={(e) => setEditingUser({ ...editingUser, year: parseInt(e.target.value) })}
                        className="w-full border rounded px-3 py-2"
                      >
                        <option value="">Select Year</option>
                        <option value="1">1</option>
                        <option value="2">2</option>
                        <option value="3">3</option>
                        <option value="4">4</option>
                      </select>
                    </div>

                    <div>
                      <label className="block text-sm font-medium mb-1">Section</label>
                      <input
                        type="text"
                        value={editingUser.section || ''}
                        onChange={(e) => setEditingUser({ ...editingUser, section: e.target.value })}
                        className="w-full border rounded px-3 py-2"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="flex items-center">
                      <input
                        type="checkbox"
                        checked={editingUser.on_leave || false}
                        onChange={(e) => setEditingUser({ ...editingUser, on_leave: e.target.checked })}
                        className="mr-2"
                      />
                      <span className="text-sm font-medium">On Leave</span>
                    </label>
                  </div>
                </>
              )}

              {/* Student-specific fields */}
              {editingUser.role === 'student' && (
                <>
                  <div>
                    <label className="block text-sm font-medium mb-1">Registration Number</label>
                    <input
                      type="text"
                      value={editingUser.reg_no || ''}
                      onChange={(e) => setEditingUser({ ...editingUser, reg_no: e.target.value })}
                      className="w-full border rounded px-3 py-2"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium mb-1">Roll Number</label>
                    <input
                      type="text"
                      value={editingUser.roll_no || ''}
                      onChange={(e) => setEditingUser({ ...editingUser, roll_no: e.target.value })}
                      className="w-full border rounded px-3 py-2"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium mb-1">Year</label>
                      <select
                        value={editingUser.year || ''}
                        onChange={(e) => setEditingUser({ ...editingUser, year: parseInt(e.target.value) })}
                        className="w-full border rounded px-3 py-2"
                      >
                        <option value="">Select Year</option>
                        <option value="1">1</option>
                        <option value="2">2</option>
                        <option value="3">3</option>
                        <option value="4">4</option>
                      </select>
                    </div>

                    <div>
                      <label className="block text-sm font-medium mb-1">Section</label>
                      <input
                        type="text"
                        value={editingUser.section || ''}
                        onChange={(e) => setEditingUser({ ...editingUser, section: e.target.value })}
                        className="w-full border rounded px-3 py-2"
                      />
                    </div>
                  </div>
                </>
              )}
            </div>

            <div className="flex justify-end gap-3 mt-6">
              <button
                onClick={() => {
                  setShowEditModal(false);
                  setEditingUser(null);
                }}
                className="px-4 py-2 border rounded hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                onClick={handleSaveEdit}
                className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
              >
                Save Changes
              </button>
            </div>
          </div>
        </div>
      )}
    </DashboardLayout>
  );
}
