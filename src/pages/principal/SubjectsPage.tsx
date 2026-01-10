import DashboardLayout from '../../components/DashboardLayout';
import { useEffect, useState } from 'react';
import * as XLSX from 'xlsx';
import { supabase } from '../../lib/supabase';
import { getAdminApiUrl } from '../../lib/adminApi';
import { useAuth } from '../../contexts/AuthContext';

export default function PrincipalSubjectsPage() {
  const { profile } = useAuth();
  const [departments, setDepartments] = useState<string[]>([]);
  const [yearsByDept, setYearsByDept] = useState<Record<string, number[]>>({});
  const [years, setYears] = useState<number[]>([]);
  const [subjects, setSubjects] = useState<any[]>([]);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [electivesByParent, setElectivesByParent] = useState<Record<string, any[]>>({});
  const [selectedElectiveByParent, setSelectedElectiveByParent] = useState<Record<string, string>>({});
  const [staffProfiles, setStaffProfiles] = useState<StaffProfile[]>([]);
  const [selectedDept, setSelectedDept] = useState('');
  const [selectedYear, setSelectedYear] = useState<number | ''>('');
  const [selectedSem, setSelectedSem] = useState<number | ''>('');
  const [loading, setLoading] = useState(false);
  // Add/Edit modal state (for IQAC HOD)
  const [showModal, setShowModal] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editSubject, setEditSubject] = useState<any | null>(null);
  const [form, setForm] = useState<any>({
    subject_code: '',
    name: '',
    staff_id: '',
    credits: 3,
    year: '',
    sem: '',
    department: '',
    section: '',
  });
  const [sectionsForYear, setSectionsForYear] = useState<string[]>([]);
  const [sectionStaffMap, setSectionStaffMap] = useState<Record<string, string>>({});
  const [sectionIncluded, setSectionIncluded] = useState<Record<string, boolean>>({});
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deleteSubjectId, setDeleteSubjectId] = useState<string | null>(null);

  useEffect(() => {
    // Use cached years when available for fast dropdown response
    if (!selectedDept) return setYears([]);
    const cached = yearsByDept[selectedDept];
    if (cached && cached.length) {
      setYears(cached);
      if (selectedYear && !cached.includes(Number(selectedYear))) setSelectedYear('');
      return;
    }

    // Fallback: fetch from API and update cache
    (async () => {
      try {
        const { data } = await supabase.from('years').select('year_number').eq('department', selectedDept).order('year_number', { ascending: true });
        if (data && data.length) {
          const arr = data.map((d: any) => d.year_number);
          setYears(arr);
          setYearsByDept((p) => ({ ...p, [selectedDept]: arr }));
        } else {
          setYears([1, 2, 3, 4]);
          setYearsByDept((p) => ({ ...p, [selectedDept]: [1, 2, 3, 4] }));
        }
      } catch (e) {
        setYears([1, 2, 3, 4]);
      }
    })();
  }, [selectedDept, yearsByDept]);

  useEffect(() => {
    // Load subjects for selected department and year/semester
    if (!selectedDept || (!selectedYear && !selectedSem)) return setSubjects([]);
    setLoading(true);
    (async () => {
      try {
        let q = supabase.from('subjects').select('*').eq('department', selectedDept).order('subject_code');
        if (selectedSem) q = q.eq('semester', selectedSem);
        else if (selectedYear) q = q.eq('year', selectedYear);
        const { data: subs } = await q;

        const subjectsArr = subs || [];
        setSubjects(subjectsArr);

        // Find parent elective subject ids (PE, OE, EE)
        const parentElectiveIds = (subjectsArr as any[])
          .filter((s) => s && typeof s.name === 'string' && ['PE', 'OE', 'EE'].includes(s.name))
          .map((s) => s.id)
          .filter(Boolean);

          if (parentElectiveIds.length > 0) {
          const { data: electives } = await supabase
            .from('electives')
            .select('*')
            .in('parent_subject_id', parentElectiveIds as any[]);

          const map: Record<string, any[]> = {};
          (electives || []).forEach((e: any) => {
            const pid = e.parent_subject_id;
            if (!map[pid]) map[pid] = [];
            map[pid].push(e);
          });
          setElectivesByParent(map);

          // Fetch staff profiles for elective staff_ids and merge into staffProfiles
          try {
            const electiveStaffIds = Array.from(new Set((electives || []).map((el: any) => el.staff_id).filter(Boolean)));
            if (electiveStaffIds.length > 0) {
              const { data: electiveStaffProfiles } = await supabase
                .from('profiles')
                .select('id, name, email')
                .in('id', electiveStaffIds as any[]);

              if (electiveStaffProfiles && electiveStaffProfiles.length > 0) {
                setStaffProfiles((prev) => {
                  const existingIds = new Set(prev.map(p => p.id));
                  const toAdd = (electiveStaffProfiles || []).filter((p: any) => !existingIds.has(p.id));
                  return [...prev, ...toAdd];
                });
              }
            }
          } catch (e) {
            console.warn('Failed to load elective staff profiles', e);
          }
        } else {
          setElectivesByParent({});
        }
      } catch (e) {
        console.warn('Failed to load subjects or electives', e);
        setSubjects([]);
        setElectivesByParent({});
      } finally {
        setLoading(false);
      }
    })();
  }, [selectedDept, selectedYear, selectedSem]);

  // Load available sections for selectedDept+selectedYear: prefer `sections` table, fall back to inspecting students/profiles
  useEffect(() => {
    setSectionsForYear([]);
    setSectionStaffMap({});
    setSectionIncluded({});
    if (!selectedDept || !selectedYear) return;
    (async () => {
      try {
        // Try sections table first (rows per section). Some deployments may store comma-separated values here, so handle both.
        try {
          const { data: secRows, error: secErr } = await supabase
            .from('sections')
            .select('section_name')
            .eq('department', selectedDept)
            .eq('year_number', selectedYear)
            .order('section_name', { ascending: true });

          if (!secErr && secRows && secRows.length > 0) {
            // section_name might be a comma-separated string in some setups; split and normalize
            const all: string[] = [];
            secRows.forEach((r: any) => {
              if (!r || !r.section_name) return;
              const parts = String(r.section_name).split(',').map((p: string) => p.trim()).filter(Boolean);
              parts.forEach(p => { if (!all.includes(p)) all.push(p); });
            });
            const finalSections = all.length ? all.sort() : ['A'];
            setSectionsForYear(finalSections);
            const incl: Record<string, boolean> = {};
            const smap: Record<string, string> = {};
            finalSections.forEach(sec => { incl[sec] = true; smap[sec] = ''; });
            setSectionIncluded(incl);
            setSectionStaffMap(smap);
            return;
          }
        } catch (err) {
          // ignore and continue to student-based detection
          console.warn('sections table read failed, falling back to students detection', err);
        }

        // fetch students for the year
        const { data: students } = await supabase.from('students').select('id, section').eq('year', selectedYear);
        const studIds = (students || []).map((s: any) => s.id).filter(Boolean);
        if (studIds.length === 0) {
          setSectionsForYear(['A']);
          return;
        }
        // fetch profiles for those students filtered by department
        const { data: profiles } = await supabase.from('profiles').select('id').in('id', studIds).eq('department', selectedDept);
        const validIds = new Set((profiles || []).map((p: any) => p.id));
        const sections = Array.from(new Set((students || []).filter((s: any) => validIds.has(s.id)).map((s: any) => (s.section || 'A')))).sort();
        const finalSections = (sections && sections.length) ? sections : ['A'];
        setSectionsForYear(finalSections);
        // initialize include map and default staff (none)
        const incl: Record<string, boolean> = {};
        const smap: Record<string, string> = {};
        finalSections.forEach(sec => { incl[sec] = true; smap[sec] = ''; });
        setSectionIncluded(incl);
        setSectionStaffMap(smap);
      } catch (e) {
        console.warn('Failed to detect sections for year', e);
        setSectionsForYear(['A']);
      }
    })();
  }, [selectedDept, selectedYear]);

  const includeAllSections = () => {
    const incl: Record<string, boolean> = {};
    sectionsForYear.forEach(s => { incl[s] = true; });
    setSectionIncluded(incl);
  };

  const detectSectionsAgain = async () => {
    setSectionsForYear([]);
    setSectionStaffMap({});
    setSectionIncluded({});
    if (!selectedDept || !selectedYear) return;
    try {
      // Try sections table first
      try {
        const { data: secRows, error: secErr } = await supabase
          .from('sections')
          .select('section_name')
          .eq('department', selectedDept)
          .eq('year_number', selectedYear)
          .order('section_name', { ascending: true });
        if (!secErr && secRows && secRows.length > 0) {
          const all: string[] = [];
          secRows.forEach((r: any) => {
            if (!r || !r.section_name) return;
            const parts = String(r.section_name).split(',').map((p: string) => p.trim()).filter(Boolean);
            parts.forEach(p => { if (!all.includes(p)) all.push(p); });
          });
          const finalSections = all.length ? all.sort() : ['A'];
          const incl: Record<string, boolean> = {};
          const smap: Record<string, string> = {};
          finalSections.forEach(sec => { incl[sec] = true; smap[sec] = ''; });
          setSectionsForYear(finalSections);
          setSectionIncluded(incl);
          setSectionStaffMap(smap);
          return;
        }
      } catch (err) {
        console.warn('sections table read failed in detectSectionsAgain, falling back', err);
      }

      const { data: students } = await supabase.from('students').select('id, section').eq('year', selectedYear);
      const studIds = (students || []).map((s: any) => s.id).filter(Boolean);
      if (studIds.length === 0) { setSectionsForYear(['A']); return; }
      const { data: profiles } = await supabase.from('profiles').select('id').in('id', studIds).eq('department', selectedDept);
      const validIds = new Set((profiles || []).map((p: any) => p.id));
      const sections = Array.from(new Set((students || []).filter((s: any) => validIds.has(s.id)).map((s: any) => (s.section || 'A')))).sort();
      const finalSections = (sections && sections.length) ? sections : ['A'];
      const incl: Record<string, boolean> = {};
      const smap: Record<string, string> = {};
      finalSections.forEach(sec => { incl[sec] = true; smap[sec] = ''; });
      setSectionsForYear(finalSections);
      setSectionIncluded(incl);
      setSectionStaffMap(smap);
    } catch (e) {
      console.warn('Detect sections failed', e);
    }
  };

  // Bulk import helpers
  const downloadTemplate = () => {
    const header = ['subject_code', 'name', 'credits', 'department', 'section', 'year', 'semester', 'staff_name'];
    // include two sample rows using available departments and staff names when possible
    const sampleDept = (departments && departments.length > 0) ? departments[0] : 'CSE';
    const sampleStaff1 = (staffProfiles && staffProfiles.length > 0) ? staffProfiles[0].name : 'Alice Example';
    const sampleStaff2 = (staffProfiles && staffProfiles.length > 1) ? staffProfiles[1].name : sampleStaff1;
    const sampleRows = [
      ['CS101', 'Intro to CS', '3', sampleDept, 'A', '1', '1', sampleStaff1],
      ['CS102', 'Data Structures', '4', sampleDept, 'B', '2', '3', sampleStaff2],
    ];
    const csv = header.join(',') + '\n' + sampleRows.map(r => r.map(String).map(v => v.includes(',') ? '"' + v.replace(/"/g, '""') + '"' : v).join(',')).join('\n') + '\n';
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'subjects-import-template.csv';
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };

  const parseCsvText = (text: string) => {
    const lines = text.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
    if (lines.length === 0) return [];
    const headers = lines[0].split(',').map(h => h.trim().toLowerCase());
    const rows: any[] = [];
    for (let i = 1; i < lines.length; i++) {
      const cols = lines[i].split(',').map(c => c.trim());
      const obj: any = {};
      headers.forEach((h, idx) => { obj[h] = cols[idx] ?? ''; });
      rows.push(obj);
    }
    return rows;
  };

  const onImportFile = (file?: File) => {
    if (!file) return;
    setImportFileName(file.name || '');
    const name = (file.name || '').toLowerCase();
    const reader = new FileReader();
    if (name.endsWith('.xlsx') || name.endsWith('.xls')) {
      reader.onload = (e) => {
        (async () => {
          try {
            const data = e.target?.result as ArrayBuffer;
            const workbook = XLSX.read(data, { type: 'array' });
            const sheetName = workbook.SheetNames[0];
            const sheet = workbook.Sheets[sheetName];
            const rows: any[] = XLSX.utils.sheet_to_json(sheet, { defval: '' });
            const parsed = rows.map((row) => {
              const obj: any = {};
              Object.keys(row).forEach((k) => {
                const key = String(k).trim().toLowerCase().replace(/\s+/g, '_');
                obj[key] = row[k];
              });
              return obj;
            });
            const normalized = parsed.map((r: any) => ({
              subject_code: r.subject_code || r.code || '',
              name: r.name || '',
              credits: r.credits || '',
              department: r.department || selectedDept || '',
              section: r.section || '',
              year: r.year || '',
              semester: r.semester || r.sem || '',
              staff: r.staff_name || r.staff || '',
              resolved_staff_id: '',
            }));

            if (!staffProfiles || staffProfiles.length === 0) {
              try {
                const { data: sp } = await supabase.from('profiles').select('id, name, email').neq('role', 'student').order('name', { ascending: true });
                if (sp && sp.length) setStaffProfiles(sp as StaffProfile[]);
              } catch (fetchErr) {
                console.warn('Failed to fetch staff profiles for resolution', fetchErr);
              }
            }

            try {
              const staffById = new Map((staffProfiles || []).map((s) => [s.id, s]));
              const staffByName = new Map((staffProfiles || []).map((s) => [(s.name || '').toLowerCase(), s]));
              const staffByEmail = new Map((staffProfiles || []).map((s) => [(s.email || '').toLowerCase(), s]));
              const resolved = normalized.map((row: any) => {
                const copy = { ...row };
                const v = String(copy.staff || '').trim();
                if (v) {
                  if (staffById.has(v)) copy.resolved_staff_id = v;
                  else {
                    const byName = staffByName.get(v.toLowerCase());
                    if (byName) copy.resolved_staff_id = byName.id;
                    else {
                      const byEmail = staffByEmail.get(v.toLowerCase());
                      if (byEmail) copy.resolved_staff_id = byEmail.id;
                    }
                  }
                }
                return copy;
              });
              setImportRows(resolved);
              console.debug('[SubjectsPage] importRows after parse:', resolved);
            } catch (e) {
              setImportRows(normalized);
              console.debug('[SubjectsPage] importRows after parse (unresolved):', normalized);
            }
          } catch (err) {
            console.error('Failed to parse XLSX', err);
            alert('Failed to parse XLSX file');
          }
        })();
      };
      reader.readAsArrayBuffer(file);
    } else {
      reader.onload = (e) => {
        (async () => {
          try {
            const text = e.target?.result as string || '';
            const parsed = parseCsvText(text);
            const normalized = parsed.map((r: any) => ({
              subject_code: r.subject_code || r.code || '',
              name: r.name || '',
              credits: r.credits || '',
              department: r.department || selectedDept || '',
              section: r.section || '',
              year: r.year || '',
              semester: r.semester || r.sem || '',
              staff: r.staff_name || r.staff_email_or_id || r.staff || '',
              resolved_staff_id: '',
            }));

            if (!staffProfiles || staffProfiles.length === 0) {
              try {
                const { data: sp } = await supabase.from('profiles').select('id, name, email').neq('role', 'student').order('name', { ascending: true });
                if (sp && sp.length) setStaffProfiles(sp as StaffProfile[]);
              } catch (fetchErr) {
                console.warn('Failed to fetch staff profiles for resolution', fetchErr);
              }
            }

            try {
              const staffById = new Map((staffProfiles || []).map((s) => [s.id, s]));
              const staffByName = new Map((staffProfiles || []).map((s) => [(s.name || '').toLowerCase(), s]));
              const staffByEmail = new Map((staffProfiles || []).map((s) => [(s.email || '').toLowerCase(), s]));
              const resolved = normalized.map((row: any) => {
                const copy = { ...row };
                const v = String(copy.staff || '').trim();
                if (v) {
                  if (staffById.has(v)) copy.resolved_staff_id = v;
                  else {
                    const byName = staffByName.get(v.toLowerCase());
                    if (byName) copy.resolved_staff_id = byName.id;
                    else {
                      const byEmail = staffByEmail.get(v.toLowerCase());
                      if (byEmail) copy.resolved_staff_id = byEmail.id;
                    }
                  }
                }
                return copy;
              });
              setImportRows(resolved);
              console.debug('[SubjectsPage] importRows after parse (csv):', resolved);
            } catch (e) {
              setImportRows(normalized);
              console.debug('[SubjectsPage] importRows after parse (csv unresolved):', normalized);
            }
          } catch (err) {
            console.error('Failed to parse CSV', err);
            alert('Failed to parse CSV file');
          }
        })();
      };
      reader.readAsText(file);
    }
  };

  const submitImport = async () => {
    if (!importRows || importRows.length === 0) { alert('No rows to import'); return; }
    setSaving(true);
    try {
      // map staff by email or id (prefer id)
      const staffById = new Map(staffProfiles.map(s => [s.id, s]));
      const staffByName = new Map(staffProfiles.map(s => [s.name?.toLowerCase() || '', s]));

      const items: any[] = [];
      for (const r of importRows) {
        let staff_id = null;
        if (r.resolved_staff_id) staff_id = r.resolved_staff_id;
        else if (r.staff) {
          const v = String(r.staff).trim();
          if (staffById.has(v)) staff_id = v;
          else {
            const byName = staffByName.get(v.toLowerCase());
            if (byName) staff_id = byName.id;
          }
        }
        const sem = r.semester ? Number(r.semester) : (r.sem ? Number(r.sem) : null);
        let yearVal = null;
        if (sem) yearVal = Math.min(6, Math.max(1, Math.ceil(sem / 2)));
        else if (r.year) yearVal = Number(r.year);

        // support comma-separated sections: expand one row per section
        const rawSections = (r.section || '').split(',').map((s: string) => s.trim()).filter((s: string) => s);
        const sectionsList = rawSections.length > 0 ? rawSections : [(sectionsForYear && sectionsForYear[0]) || 'A'];
        for (const sec of sectionsList) {
          items.push({
            subject_code: r.subject_code || null,
            name: r.name,
            staff_id: staff_id || null,
            credits: r.credits ? Number(r.credits) : null,
            year: yearVal,
            semester: sem ?? null,
            department: (r.department || selectedDept || null),
            section: String(sec).trim(),
          });
        }
      }

      // debug: show prepared items
      console.debug('[SubjectsPage] prepared import items:', items);

      // Try admin API
      try {
        const url = getAdminApiUrl('/subjects/bulk-insert');
        const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ items }) });
        const json = await res.json();
        if (!res.ok || json?.error) throw new Error(json?.error || 'bulk import failed');
        if (json?.data) setSubjects((prev) => [...json.data, ...prev]);
      } catch (apiErr) {
        console.warn('Admin API bulk-import failed, falling back to Supabase client', apiErr);
        const { data, error } = await supabase.from('subjects').insert(items).select();
        if (error) throw error;
        if (data) setSubjects((prev) => [...data, ...prev]);
      }

      setShowImportModal(false);
      setImportRows([]);
      setImportFileName('');
    } catch (err: any) {
      console.error('Import failed', err);
      alert('Import failed: ' + (err?.message || String(err)));
    } finally {
      setSaving(false);
    }
  };

  const openEdit = (s: any) => {
    setEditSubject(s);
    setForm({
      subject_code: s.subject_code || '',
      name: s.name || '',
      staff_id: s.staff_id || '',
      credits: s.credits ?? 3,
      year: (s.year ?? selectedYear) || '',
      sem: (s.semester ?? selectedSem ?? '') || '',
      department: s.department || selectedDept || '',
      section: s.section || '',
    });
    setShowModal(true);
  };

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  };

  const toggleSelectAll = () => {
    if (selectedIds.length === subjects.length) setSelectedIds([]);
    else setSelectedIds(subjects.map(s => s.id));
  };

  // Bulk update modal
  const [showBulkModal, setShowBulkModal] = useState(false);
  const [bulkForm, setBulkForm] = useState<any>({ department: '', year: '', semester: '' });
  // Bulk import CSV modal state
  const [showImportModal, setShowImportModal] = useState(false);
  const [importRows, setImportRows] = useState<any[]>([]);
  const [importFileName, setImportFileName] = useState<string>('');

  const applyBulkUpdate = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!selectedIds || selectedIds.length === 0) { alert('No subjects selected'); return; }
    setSaving(true);
    try {
      const semVal = bulkForm.semester ? Number(bulkForm.semester) : null;
      let yearVal = null;
      if (semVal) yearVal = Math.min(6, Math.max(1, Math.ceil(semVal / 2)));
      else if (bulkForm.year) yearVal = Number(bulkForm.year);

      const payload: any = { ids: selectedIds };
      if (bulkForm.department) payload.department = bulkForm.department;
      if (typeof yearVal !== 'undefined' && yearVal !== null) payload.year = yearVal;
      if (semVal !== null) payload.semester = semVal;
      if (bulkForm.section) payload.section = bulkForm.section;

      // Try admin API then fallback to supabase client
      try {
        const url = getAdminApiUrl('/subjects/bulk-update');
        const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
        const json = await res.json();
        if (!res.ok || json?.error) throw new Error((json?.error && JSON.stringify(json?.detail || json?.error)) || 'bulk update failed');
        if (json?.data) {
          const updated = json.data as any[];
          setSubjects((prev) => {
            const byId = new Map(updated.map(u => [u.id, u]));
            return prev.map(p => byId.has(p.id) ? byId.get(p.id) : p);
          });
        }
      } catch (apiErr) {
        console.warn('Admin API bulk update failed, falling back to Supabase client', apiErr);
        const updateBody: any = {};
        if (payload.department) updateBody.department = payload.department;
        if (Object.prototype.hasOwnProperty.call(payload, 'year')) updateBody.year = payload.year;
        if (Object.prototype.hasOwnProperty.call(payload, 'semester')) updateBody.semester = payload.semester;
        if (Object.prototype.hasOwnProperty.call(payload, 'section')) updateBody.section = payload.section ?? null;
        const { data, error } = await supabase.from('subjects').update(updateBody).in('id', selectedIds).select();
        if (error) throw error;
        if (data) {
          const updated = data as any[];
          setSubjects((prev) => {
            const byId = new Map(updated.map(u => [u.id, u]));
            return prev.map(p => byId.has(p.id) ? byId.get(p.id) : p);
          });
        }
      }
      setShowBulkModal(false);
      setSelectedIds([]);
    } catch (err: any) {
      console.error('Bulk update failed', err);
      alert('Bulk update failed: ' + (err.message || String(err)));
    } finally {
      setSaving(false);
    }
  };

  const closeModal = () => {
    setShowModal(false);
    setEditSubject(null);
  };

  const saveSubject = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    // minimal validation: accept either year or sem
    if (!form.name || !form.department || !(form.year || form.sem)) {
      alert('Please fill name, department and year/semester');
      return;
    }
    setSaving(true);
    try {
      const semVal = (typeof form.sem !== 'undefined' && form.sem !== '') ? Number(form.sem) : null;
      let yearVal: number | null = null;
      if (semVal) {
        // derive academic year from semester: year = ceil(sem / 2), clamp to 1..6
        yearVal = Math.min(6, Math.max(1, Math.ceil(semVal / 2)));
      } else if (typeof form.year !== 'undefined' && form.year !== '') {
        yearVal = Number(form.year);
      }

      const sectionDefault = (form.section && String(form.section).trim()) || (sectionsForYear && sectionsForYear.length > 0 ? sectionsForYear[0] : 'A');
      const payload: any = {
        subject_code: form.subject_code || null,
        name: form.name,
        staff_id: form.staff_id || null,
        credits: typeof form.credits !== 'undefined' && form.credits !== '' ? Number(form.credits) : null,
        year: yearVal,
        semester: semVal,
        department: form.department,
        section: sectionDefault,
      };

      if (profile?.role === 'admin') {
        if (editSubject && editSubject.id) {
          const { data, error } = await supabase.from('subjects').update(payload).eq('id', editSubject.id).select().single();
          if (error) throw error;
          if (data) setSubjects((prev) => prev.map((p) => (p.id === data.id ? data : p)));
        } else {
          // If sections mapping is present and multiple sections selected, perform bulk insert
          const sectionsToCreate = Object.keys(sectionIncluded).filter(k => sectionIncluded[k]);
          if (sectionsForYear.length > 0 && sectionsToCreate.length > 0) {
            const items = sectionsToCreate.map(sec => ({
              subject_code: form.subject_code || null,
              name: form.name,
              staff_id: (sectionStaffMap[sec] && String(sectionStaffMap[sec]).trim()) ? sectionStaffMap[sec] : (form.staff_id || null),
              credits: typeof form.credits !== 'undefined' && form.credits !== '' ? Number(form.credits) : null,
              year: yearVal,
              semester: semVal,
              department: form.department,
              section: String(sec).trim(),
            }));
            console.debug('[SubjectsPage] admin-role bulk items to create (client insert):', items);
            const { data, error } = await supabase.from('subjects').insert(items).select();
            if (error) throw error;
            if (data) setSubjects((prev) => [...data, ...prev]);
          } else {
            // If multiple sections were selected, perform a bulk insert via Supabase client as fallback
            const sectionsToCreate = Object.keys(sectionIncluded).filter(k => sectionIncluded[k]);
            if (sectionsForYear.length > 0 && sectionsToCreate.length > 0) {
              const items = sectionsToCreate.map(sec => ({
                subject_code: form.subject_code || null,
                name: form.name,
                staff_id: sectionStaffMap[sec] || null,
                credits: typeof form.credits !== 'undefined' && form.credits !== '' ? Number(form.credits) : null,
                year: yearVal,
                semester: semVal,
                department: form.department,
                section: sec,
              }));
              const { data, error } = await supabase.from('subjects').insert(items).select();
              if (error) throw error;
              if (data) setSubjects((prev) => [...data, ...prev]);
            } else {
              const { data, error } = await supabase.from('subjects').insert([payload]).select();
              if (error) throw error;
              if (data && data[0]) setSubjects((prev) => [data[0], ...prev]);
            }
          }
        }
      } else {
        // Try admin API first (preferred), but fall back to client-side Supabase if the admin server is unreachable.
        try {
          if (editSubject && editSubject.id) {
            const url = getAdminApiUrl(`/subjects/${editSubject.id}`);
            const res = await fetch(url, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
            const json = await res.json();
            if (!res.ok || json?.error) throw new Error((json?.error && JSON.stringify(json?.detail || json?.error)) || 'update failed');
            if (json?.data) setSubjects((prev) => prev.map((p) => (p.id === json.data.id ? json.data : p)));
          } else {
            const sectionsToCreate = Object.keys(sectionIncluded).filter(k => sectionIncluded[k]);
            if (sectionsForYear.length > 0 && sectionsToCreate.length > 0) {
              const items = sectionsToCreate.map(sec => ({
                subject_code: form.subject_code || null,
                name: form.name,
                staff_id: (sectionStaffMap[sec] && String(sectionStaffMap[sec]).trim()) ? sectionStaffMap[sec] : (form.staff_id || null),
                credits: typeof form.credits !== 'undefined' && form.credits !== '' ? Number(form.credits) : null,
                year: yearVal,
                semester: semVal,
                department: form.department,
                section: String(sec).trim(),
              }));
              console.debug('[SubjectsPage] bulk items to send to admin API:', items);
              const url = getAdminApiUrl('/subjects/bulk-insert');
              const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ items }) });
              const json = await res.json();
              if (!res.ok || json?.error) throw new Error((json?.error && JSON.stringify(json?.detail || json?.error)) || 'bulk insert failed');
              if (json?.data) setSubjects((prev) => [...json.data, ...prev]);
            } else {
              const url = getAdminApiUrl('/subjects');
              const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
              const json = await res.json();
              if (!res.ok || json?.error) throw new Error((json?.error && JSON.stringify(json?.detail || json?.error)) || 'insert failed');
              if (json?.data && json.data[0]) setSubjects((prev) => [json.data[0], ...prev]);
            }
          }
          } catch (apiErr) {
            console.warn('Admin API unavailable or failed, falling back to Supabase client:', apiErr);
            // Fallback: attempt Supabase client write (may fail due to RLS/policies)
            if (editSubject && editSubject.id) {
              const { data, error } = await supabase.from('subjects').update(payload).eq('id', editSubject.id).select().single();
              if (error) throw error;
              if (data) setSubjects((prev) => prev.map((p) => (p.id === data.id ? data : p)));
            } else {
              const sectionsToCreateFallback = Object.keys(sectionIncluded).filter(k => sectionIncluded[k]);
              if (sectionsForYear.length > 0 && sectionsToCreateFallback.length > 0) {
                const items = sectionsToCreateFallback.map(sec => ({
                  subject_code: form.subject_code || null,
                  name: form.name,
                  staff_id: (sectionStaffMap[sec] && String(sectionStaffMap[sec]).trim()) ? sectionStaffMap[sec] : (form.staff_id || null),
                  credits: typeof form.credits !== 'undefined' && form.credits !== '' ? Number(form.credits) : null,
                  year: yearVal,
                  semester: semVal,
                  department: form.department,
                  section: String(sec).trim(),
                }));
                console.debug('[SubjectsPage] fallback bulk items to insert via supabase client:', items);
                const { data, error } = await supabase.from('subjects').insert(items).select();
                if (error) throw error;
                if (data) setSubjects((prev) => [...data, ...prev]);
              } else {
                const { data, error } = await supabase.from('subjects').insert([payload]).select();
                if (error) throw error;
                if (data && data[0]) setSubjects((prev) => [data[0], ...prev]);
              }
            }
          }
      }
      closeModal();
    } catch (err: any) {
      console.error('Save subject failed', err);
      alert('Save failed: ' + (err.message || String(err)));
    } finally {
      setSaving(false);
    }
  };

  return (
    <DashboardLayout>
      <div className="w-full mx-auto p-4">
        <h1 className="text-2xl font-bold mb-4">Subjects</h1>
        <div className="flex gap-3 items-center mb-4">
          <div>
            <label className="text-xs text-slate-600 block">Department</label>
            <select value={selectedDept} onChange={(e) => { setSelectedDept(e.target.value); setSelectedYear(''); setSelectedSem(''); }} className="border rounded px-2 py-1">
              <option value="">— All Departments —</option>
              {departments.map((d) => <option key={d} value={d}>{d}</option>)}
            </select>
          </div>

          <div>
            <label className="text-xs text-slate-600 block">Year</label>
            <select value={selectedYear as any} onChange={(e) => { const v = e.target.value; setSelectedYear(v ? Number(v) : ''); setSelectedSem(''); }} className="border rounded px-2 py-1">
              <option value="">— Year —</option>
              {years.map((y) => <option key={y} value={y}>{y}</option>)}
            </select>
          </div>

          <div>
            <label className="text-xs text-slate-600 block">Sem</label>
            <select value={selectedSem as any} onChange={(e) => { const v = e.target.value; setSelectedSem(v ? Number(v) : ''); }} className="border rounded px-2 py-1">
              <option value="">— Sem —</option>
              {[1,2,3,4,5,6,7,8].map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>

          <div className="ml-2">
            <button className="text-sm text-slate-600 underline" onClick={() => { setSelectedDept(''); setSelectedYear(''); setSelectedSem(''); }}>Clear</button>
          </div>
        </div>
        {/* Add Subject button for IQAC HOD */}
        {(profile?.role === 'hod' && profile?.department === 'IQAC') && (
          <div className="mb-4">
            <button className="bg-blue-600 text-white px-3 py-2 rounded-md shadow-sm" onClick={() => { setEditSubject(null); setForm({ subject_code: '', name: '', staff_id: '', credits: 3, year: selectedYear || '', sem: selectedSem || '', department: selectedDept || '', section: '' }); setShowModal(true); }}>
              + Add Subject
            </button>
            <button className="ml-3 bg-green-600 text-white px-3 py-2 rounded-md shadow-sm" onClick={() => { setShowImportModal(true); }}>
              Bulk Import
            </button>
            {selectedIds.length > 0 && (
              <button className="ml-3 bg-amber-600 text-white px-3 py-2 rounded-md shadow-sm" onClick={() => { setBulkForm({ department: '', year: '', semester: '' }); setShowBulkModal(true); }}>
                Bulk Update ({selectedIds.length})
              </button>
            )}
          </div>
          )}

          <div className="-mx-4 px-4">
            <div className="hidden md:block bg-white rounded-xl shadow-lg border border-slate-200 p-4 overflow-x-auto">
              <table className="w-full text-sm min-w-[840px]">
                <thead>
                  <tr className="text-left text-slate-600">
                    <th className="py-2 pr-3"><input type="checkbox" checked={selectedIds.length === subjects.length && subjects.length>0} onChange={toggleSelectAll} /></th>
                    <th className="py-2 pr-3">Subject Code</th>
                    <th className="py-2 pr-3">Subject Name</th>
                    <th className="py-2 pr-3">Staff Name</th>
                    <th className="py-2 pr-3">Year</th>
                    <th className="py-2 pr-3">Sem</th>
                    <th className="py-2">Credits</th>
                    <th className="py-2">Actions</th>
                  </tr>
                </thead>
                <tbody>
                {loading ? (
                  <tr>
                    <td colSpan={4} className="text-center p-4 align-middle">
                      Loading...
                    </td>
                  </tr>
                ) : subjects.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="text-center p-4">
                      No subjects found
                    </td>
                  </tr>
                ) : (
                  subjects.map((s) => {
                    const staff = staffProfiles.find((sp) => sp.id === s.staff_id);
                    return (
                      <tr key={s.id} className="border-t">
                        <td className="py-2 pr-3"><input type="checkbox" checked={selectedIds.includes(s.id)} onChange={() => toggleSelect(s.id)} /></td>
                        <td className="py-2 pr-3">{s.subject_code || '-'}</td>
                        <td className="py-2 pr-3">
                          <div className="flex items-center gap-2">
                            <span>{s.name}</span>
                            {s.name && ['PE', 'OE', 'EE'].includes(s.name) && (
                              <select
                                value={selectedElectiveByParent[s.id] || ''}
                                onChange={(e) => setSelectedElectiveByParent((p) => ({ ...p, [s.id]: e.target.value }))}
                                className="ml-2 text-sm border rounded px-2 py-1"
                              >
                                <option value="">— Electives —</option>
                                {(electivesByParent[s.id] || []).map((el) => (
                                  <option key={el.id} value={el.id}>{el.sub_name || el.course_code || el.name}</option>
                                ))}
                              </select>
                            )}
                          </div>
                        </td>
                            {/* Show staff for selected elective if present, otherwise the subject's staff */}
                        <td className="py-2 pr-3">
                          {(() => {
                            if (s.name && ['PE', 'OE', 'EE'].includes(s.name)) {
                              const selId = selectedElectiveByParent[s.id];
                              const sel = (electivesByParent[s.id] || []).find((el: any) => el.id === selId);
                              const staffId = sel ? sel.staff_id : s.staff_id;
                              const st = staffProfiles.find((sp) => sp.id === staffId);
                              return st ? st.name : (staffId ? staffId : '-');
                            }
                            return staff ? staff.name : '-';
                          })()}
                        </td>
                        <td className="py-2 pr-3">{s.year ?? '-'}</td>
                        <td className="py-2 pr-3">{s.semester ?? '-'}</td>
                        <td className="py-2">{s.credits ?? '-'}</td>
                        <td className="py-2">
                          <div className="flex gap-2">
                          {(profile?.role === 'hod' && profile?.department === 'IQAC') && (
                            <>
                              <button className="text-sm text-blue-600 hover:underline" onClick={() => openEdit(s)}>Edit</button>
                              <button className="text-sm text-red-600 hover:underline" onClick={() => { setDeleteSubjectId(s.id); setShowDeleteModal(true); }}>Delete</button>
                            </>
                          )}
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>

          {/* Mobile: card list */}
          <div className="md:hidden space-y-3">
            {loading ? (
              <div className="text-center p-4">Loading...</div>
            ) : subjects.length === 0 ? (
              <div className="text-center p-4">No subjects found</div>
            ) : (
              subjects.map((s) => {
                const staff = staffProfiles.find((sp) => sp.id === s.staff_id);
                    return (
                      <div key={s.id} className="bg-white rounded-xl shadow border border-slate-200 p-4">
                        <div className="flex items-start justify-between gap-3">
                          <div>
                        <p className="text-xs text-slate-500">Subject Code</p>
                        <p className="text-sm font-semibold text-slate-800">{s.subject_code || '-'}</p>
                      </div>
                      <span className="text-xs px-2 py-0.5 rounded-full bg-slate-100 text-slate-700">{s.credits ?? '-'} cr</span>
                    </div>
                    <p className="mt-2 text-slate-700 text-sm">{s.name}</p>
                    {s.name && ['PE', 'OE', 'EE'].includes(s.name) && (
                      <div className="mt-2">
                        <select
                          value={selectedElectiveByParent[s.id] || ''}
                          onChange={(e) => setSelectedElectiveByParent((p) => ({ ...p, [s.id]: e.target.value }))}
                          className="w-full text-sm border rounded px-2 py-1"
                        >
                          <option value="">— Electives —</option>
                          {(electivesByParent[s.id] || []).map((el) => (
                            <option key={el.id} value={el.id}>{el.sub_name || el.course_code || el.name}</option>
                          ))}
                        </select>
                      </div>
                    )}

                    <div className="mt-3 grid grid-cols-2 gap-2 text-xs text-slate-600">
                      <div>
                        <p className="text-slate-500">Staff</p>
                        <p className="font-medium">{(() => {
                          if (s.name && ['PE', 'OE', 'EE'].includes(s.name)) {
                            const selId = selectedElectiveByParent[s.id];
                            const sel = (electivesByParent[s.id] || []).find((el: any) => el.id === selId);
                            const staffId = sel ? sel.staff_id : s.staff_id;
                            const st = staffProfiles.find((sp) => sp.id === staffId);
                            return st ? st.name : (staffId ? staffId : '-');
                          }
                          return staff ? staff.name : '-';
                        })()}</p>
                      </div>
                      <div className="col-span-2 mt-3">
                        {(profile?.role === 'hod' && profile?.department === 'IQAC') && (
                          <div className="mt-2">
                            <button className="text-sm text-blue-600 hover:underline" onClick={() => { toggleSelect(s.id); }}>{selectedIds.includes(s.id) ? 'Deselect' : 'Select'}</button>
                          </div>
                        )}
                      </div>
                      <div>
                        <p className="text-slate-500">Year</p>
                        <p className="font-medium">{s.year ?? '-'}</p>
                      </div>
                      <div>
                        <p className="text-slate-500">Sem</p>
                        <p className="font-medium">{s.semester ?? '-'}</p>
                      </div>
                      <div className="text-right">
                        <p className="text-slate-500">Credits</p>
                        <p className="font-medium">{s.credits ?? '-'}</p>
                      </div>
                    </div>
                        {/* Edit button for IQAC HOD */}
                        {(profile?.role === 'hod' && profile?.department === 'IQAC') && (
                          <div className="text-right">
                            <button className="text-sm text-blue-600 hover:underline" onClick={() => openEdit(s)}>Edit</button>
                          </div>
                        )}
                      </div>
                );
              })
            )}
          </div>
              {/* Modal: Add / Edit Subject */}
              {showModal && (
                <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center">
                  <div className="bg-white rounded-lg shadow-lg w-full max-w-lg p-6">
                    <h3 className="text-lg font-semibold mb-4">{editSubject ? 'Edit Subject' : 'Add Subject'}</h3>
                    <form onSubmit={saveSubject}>
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className="text-xs text-slate-600">Department</label>
                          <select value={form.department} onChange={(e) => setForm({ ...form, department: e.target.value })} className="border rounded px-2 py-1 w-full">
                            <option value="">Select department</option>
                            {departments.map(d => <option key={d} value={d}>{d}</option>)}
                          </select>
                        </div>
                        <div>
                          <label className="text-xs text-slate-600">Year</label>
                          <input type="number" value={form.year} onChange={(e) => setForm({ ...form, year: e.target.value })} className="border rounded px-2 py-1 w-full" />
                        </div>
                        <div>
                          <label className="text-xs text-slate-600">Semester</label>
                          <select value={form.sem} onChange={(e) => setForm({ ...form, sem: e.target.value })} className="border rounded px-2 py-1 w-full">
                            <option value="">— Select —</option>
                            {[1,2,3,4,5,6,7,8].map(s => <option key={s} value={s}>Sem {s}</option>)}
                          </select>
                        </div>
                        <div className="col-span-2">
                          <label className="text-xs text-slate-600">Subject Name</label>
                          <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="border rounded px-2 py-1 w-full" />
                        </div>
                        <div>
                          <label className="text-xs text-slate-600">Subject Code</label>
                          <input value={form.subject_code} onChange={(e) => setForm({ ...form, subject_code: e.target.value })} className="border rounded px-2 py-1 w-full" />
                        </div>
                        <div>
                          <label className="text-xs text-slate-600">Credits</label>
                          <input type="number" value={form.credits} onChange={(e) => setForm({ ...form, credits: Number(e.target.value) })} className="border rounded px-2 py-1 w-full" />
                        </div>
                        {/* If creating a new subject and sections detected for this year, show per-section staff assignment */}
                        {(!editSubject && sectionsForYear && sectionsForYear.length > 0) ? (
                          <div className="col-span-2">
                            <label className="text-xs text-slate-600">Assign staff per section</label>
                            <div className="mt-2 space-y-2">
                              {sectionsForYear.map((sec) => (
                                <div key={sec} className="flex items-center gap-2">
                                  <input type="checkbox" checked={!!sectionIncluded[sec]} onChange={() => setSectionIncluded((p) => ({ ...p, [sec]: !p[sec] }))} />
                                  <div className="w-20 text-sm">Section {sec}</div>
                                  <select value={sectionStaffMap[sec] || ''} onChange={(e) => setSectionStaffMap((p) => ({ ...p, [sec]: e.target.value }))} className="border rounded px-2 py-1 w-full">
                                    <option value="">— Select staff (optional) —</option>
                                    {staffProfiles.map(sp => <option key={sp.id} value={sp.id}>{sp.name}{sp.department ? ` • ${sp.department}` : ''}</option>)}
                                  </select>
                                  </div>
                              ))}
                                <div className="flex gap-2 mt-2">
                                  <button type="button" className="px-2 py-1 border rounded text-sm" onClick={includeAllSections}>Include All Sections</button>
                                  <button type="button" className="px-2 py-1 border rounded text-sm" onClick={detectSectionsAgain}>Detect Sections Again</button>
                                </div>
                            </div>
                          </div>
                        ) : (
                          <>
                            <div className="col-span-2">
                              <label className="text-xs text-slate-600">Staff</label>
                              <select value={form.staff_id} onChange={(e) => setForm({ ...form, staff_id: e.target.value })} className="border rounded px-2 py-1 w-full">
                                <option value="">— None —</option>
                                {staffProfiles.map(sp => <option key={sp.id} value={sp.id}>{sp.name} {sp.department ? `• ${sp.department}` : ''}</option>)}
                              </select>
                            </div>
                            <div className="col-span-2">
                              <label className="text-xs text-slate-600">Section (optional)</label>
                              <input value={form.section} onChange={(e) => setForm({ ...form, section: e.target.value })} className="border rounded px-2 py-1 w-full" />
                            </div>
                          </>
                        )}
                      </div>
                      <div className="mt-4 flex justify-end items-center gap-2">
                        <button type="button" className="px-3 py-1 rounded border" onClick={closeModal}>Cancel</button>
                        <button type="submit" disabled={saving} className="px-3 py-1 rounded bg-blue-600 text-white">{saving ? 'Saving...' : 'Save'}</button>
                      </div>
                    </form>
                  </div>
                </div>
              )}
              {/* Delete confirmation modal */}
              {showDeleteModal && (
                <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center">
                  <div className="bg-white rounded-lg shadow-lg w-full max-w-sm p-6">
                    <h3 className="text-lg font-semibold mb-4">Confirm Delete</h3>
                    <p>Are you sure you want to delete this subject? This action cannot be undone.</p>
                    <div className="mt-4 flex justify-end gap-2">
                      <button className="px-3 py-1 rounded border" onClick={() => { setShowDeleteModal(false); setDeleteSubjectId(null); }}>Cancel</button>
                      <button className="px-3 py-1 rounded bg-red-600 text-white" onClick={async () => {
                        if (!deleteSubjectId) return;
                        setSaving(true);
                        try {
                          try {
                            const url = getAdminApiUrl(`/subjects/${deleteSubjectId}`);
                            const res = await fetch(url, { method: 'DELETE' });
                            const json = await res.json();
                            if (!res.ok || json?.error) throw new Error(json?.error || 'delete failed');
                            setSubjects((prev) => prev.filter(s => s.id !== deleteSubjectId));
                          } catch (apiErr) {
                            // fallback to Supabase client
                            const { error } = await supabase.from('subjects').delete().eq('id', deleteSubjectId);
                            if (error) throw error;
                            setSubjects((prev) => prev.filter(s => s.id !== deleteSubjectId));
                          }
                        } catch (err) {
                          console.error('Delete subject failed', err);
                          alert('Delete failed: ' + (err?.message || String(err)));
                        } finally {
                          setSaving(false);
                          setShowDeleteModal(false);
                          setDeleteSubjectId(null);
                        }
                      }}>Delete</button>
                    </div>
                  </div>
                </div>
              )}
              {/* Modal: Bulk Update */}
              {showBulkModal && (
                <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center">
                  <div className="bg-white rounded-lg shadow-lg w-full max-w-md p-6">
                    <h3 className="text-lg font-semibold mb-4">Bulk Update Subjects ({selectedIds.length})</h3>
                    <form onSubmit={applyBulkUpdate}>
                      <div className="grid grid-cols-2 gap-3">
                        <div className="col-span-2">
                          <label className="text-xs text-slate-600">Department (leave blank to skip)</label>
                          <select value={bulkForm.department} onChange={(e) => setBulkForm({ ...bulkForm, department: e.target.value })} className="border rounded px-2 py-1 w-full">
                            <option value="">— No change —</option>
                            {departments.map(d => <option key={d} value={d}>{d}</option>)}
                          </select>
                        </div>
                        <div>
                          <label className="text-xs text-slate-600">Year (leave blank to skip)</label>
                          <input type="number" value={bulkForm.year} onChange={(e) => setBulkForm({ ...bulkForm, year: e.target.value })} className="border rounded px-2 py-1 w-full" />
                        </div>
                        <div>
                          <label className="text-xs text-slate-600">Semester (leave blank to skip)</label>
                          <select value={bulkForm.semester} onChange={(e) => setBulkForm({ ...bulkForm, semester: e.target.value })} className="border rounded px-2 py-1 w-full">
                            <option value="">— No change —</option>
                            {[1,2,3,4,5,6,7,8].map(s => <option key={s} value={s}>Sem {s}</option>)}
                          </select>
                        </div>
                        <div className="col-span-2">
                          <label className="text-xs text-slate-600">Section (leave blank to skip)</label>
                          <input value={bulkForm.section || ''} onChange={(e) => setBulkForm({ ...bulkForm, section: e.target.value })} className="border rounded px-2 py-1 w-full" />
                        </div>
                      </div>
                      <div className="mt-4 flex justify-end items-center gap-2">
                        <button type="button" className="px-3 py-1 rounded border" onClick={() => setShowBulkModal(false)}>Cancel</button>
                        <button type="submit" disabled={saving} className="px-3 py-1 rounded bg-amber-600 text-white">{saving ? 'Applying...' : 'Apply'}</button>
                      </div>
                    </form>
                  </div>
                </div>
              )}
              {/* Modal: Bulk Import CSV */}
              {showImportModal && (
                <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center">
                  <div className="bg-white rounded-lg shadow-lg w-full max-w-2xl p-6">
                    <h3 className="text-lg font-semibold mb-4">Bulk Import Subjects (XLSX)</h3>
                    <div className="mb-3 flex gap-2">
                      <a className="px-3 py-1 bg-indigo-600 text-white rounded text-sm inline-block" href={`/templates/subjects_import_template_with_dropdown_exceljs.xlsx?v=${Date.now()}`}>Download Template (XLSX)</a>
                      <label className="px-3 py-1 bg-white border rounded cursor-pointer">
                        Choose File
                        <input type="file" accept=".xlsx,.xls" className="hidden" onChange={(e) => onImportFile(e.target.files?.[0])} />
                      </label>
                      <div className="text-sm text-slate-500 self-center">{importFileName || 'No file chosen'}</div>
                    </div>
                    <div className="max-h-64 overflow-auto border rounded">
                      {importRows.length === 0 ? (
                        <div className="p-4 text-sm text-slate-500">No rows parsed. Select a CSV file matching the template.</div>
                      ) : (
                        <table className="w-full text-sm">
                          <thead>
                            <tr className="text-left text-slate-600">
                              <th className="p-2">Code</th>
                              <th className="p-2">Name</th>
                              <th className="p-2">Credits</th>
                              <th className="p-2">Department</th>
                              <th className="p-2">Section</th>
                              <th className="p-2">Year</th>
                              <th className="p-2">Sem</th>
                              <th className="p-2">Staff</th>
                            </tr>
                          </thead>
                          <tbody>
                            {importRows.map((r, idx) => (
                              <tr key={idx} className="border-t">
                                <td className="p-2">{r.subject_code}</td>
                                <td className="p-2">{r.name}</td>
                                <td className="p-2">{r.credits}</td>
                                <td className="p-2">
                                  <select value={r.department} onChange={(e) => setImportRows((p) => { const copy = [...p]; copy[idx].department = e.target.value; return copy; })} className="border rounded px-2 py-1 w-full">
                                    <option value="">Select</option>
                                    {departments.map(d => <option key={d} value={d}>{d}</option>)}
                                  </select>
                                </td>
                                <td className="p-2"><input value={r.section} onChange={(e) => setImportRows((p) => { const c = [...p]; c[idx].section = e.target.value; return c; })} className="border rounded px-2 py-1 w-full" /></td>
                                <td className="p-2">{r.year}</td>
                                <td className="p-2">{r.semester}</td>
                                <td className="p-2">
                                  <select
                                    value={r.resolved_staff_id || ''}
                                    onChange={(e) => setImportRows((p) => {
                                      const c = [...p];
                                      const chosenId = e.target.value;
                                      c[idx].resolved_staff_id = chosenId;
                                      // also set `staff` field to the chosen id so resolution logic later finds it reliably
                                      c[idx].staff = chosenId || c[idx].staff || '';
                                      return c;
                                    })}
                                    className="border rounded px-2 py-1 w-full"
                                  >
                                    <option value="">(none)</option>
                                    {staffProfiles.map(sp => <option key={sp.id} value={sp.id}>{sp.name}{sp.email ? ` • ${sp.email}` : ''}</option>)}
                                  </select>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      )}
                    </div>
                    <div className="mt-4 flex justify-end gap-2">
                      <button className="px-3 py-1 rounded border" onClick={() => { setShowImportModal(false); setImportRows([]); setImportFileName(''); }}>Cancel</button>
                      <button className="px-3 py-1 rounded bg-blue-600 text-white" onClick={submitImport} disabled={saving}>{saving ? 'Importing...' : 'Import'}</button>
                    </div>
                  </div>
                </div>
              )}
        </div>
      </div>
    </DashboardLayout>
  );
}
