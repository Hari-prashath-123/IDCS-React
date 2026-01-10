import { useEffect, useState } from 'react';
import DashboardLayout from '../../components/DashboardLayout';
import Loader from '../../components/Loader';
import { useAuth } from '../../contexts/AuthContext';
import { supabase } from '../../lib/supabase';

interface Subject {
  id: string;
  subject_code: string;
  name: string;
  staff_id: string | null;
  year: number;
  section?: string;
  department: string;
  credits: number;
}

export default function HODSubjects() {
  const { profile } = useAuth();
  const [loading, setLoading] = useState(true);
  const [subjectsByYear, setSubjectsByYear] = useState<Record<number, Subject[]>>({});
  const [mySubjectsByYear, setMySubjectsByYear] = useState<Record<number, any[]>>({});
  const [viewMode, setViewMode] = useState<'dept' | 'mine' | 'electives'>('dept');
  const [error, setError] = useState<string | null>(null);
  const [staffMap, setStaffMap] = useState<Record<string, string>>({});
  const [filterSem, setFilterSem] = useState<string>('all');
  const [deptElectivesByYear, setDeptElectivesByYear] = useState<Record<number, any[]>>({});
  const [electiveParentMap, setElectiveParentMap] = useState<Record<string, string>>({});
  const [hodDepartments, setHodDepartments] = useState<string[]>([]);
  const [showStudentsModal, setShowStudentsModal] = useState(false);
  const [studentsForElective, setStudentsForElective] = useState<any[]>([]);
  const [studentsLoading, setStudentsLoading] = useState(false);
  const [modalElectiveTitle, setModalElectiveTitle] = useState<string | null>(null);

  useEffect(() => {
    if (!profile) return;
    const load = async () => {
      setLoading(true);
      try {
        // Expect profile.department to contain department code/name
        const dept = (profile as any).department;
        if (!dept) {
          setError('Your profile does not have a department set.');
          setSubjectsByYear({});
          setMySubjectsByYear({});
          return;
        }

        // Determine departments this HOD should see.
        // Prefer explicit `department_leads` mappings, but include profile.department as fallback.
        const deptNames: string[] = [];
        try {
          const { data: leads } = await supabase
            .from('department_leads')
            .select('department_id, departments(name)')
            .eq('hod_id', profile.id);
          if (leads && leads.length > 0) {
            for (const l of leads as any[]) {
              const name = (l.departments && l.departments.name) || l.name;
              if (name) deptNames.push(name);
            }
          }
        } catch (e) {
          console.debug('Could not load department_leads for HOD subjects, falling back to profile.department', e);
        }
        // Always include the profile.department if present and not already included
        if (dept && !deptNames.includes(dept)) deptNames.push(dept);
        // expose HOD departments to render logic
        setHodDepartments([...deptNames]);

        // Load department subjects for all HOD departments (and global 'ALL')
        const { data: subjData, error: subjErr } = await supabase
          .from('subjects')
          .select('*')
          .in('department', deptNames.length > 0 ? [...deptNames, 'ALL'] : [dept, 'ALL'])
          .order('year', { ascending: true })
          .order('subject_code', { ascending: true });

        if (subjErr) {
          console.warn('Subjects read error (table may not exist):', subjErr.message || subjErr);
          setSubjectsByYear({});
        } else {
          const rows = (subjData || []) as Subject[];
          const grouped: Record<number, Subject[]> = {};
          for (const r of rows) {
            const y = r.year || 0;
            if (!grouped[y]) grouped[y] = [];
            grouped[y].push(r);
          }
          setSubjectsByYear(grouped);

          // Load electives for these departments (show all electives, including those whose parent is 'ALL')
            try {
            // Try to fetch electives including `semester`. If the column does not exist
            // (some deployments), retry without selecting `semester` to avoid a 400 error.
            let electData: any[] | null = null;
            let electiveHasSemester = true;
            try {
              // semFilter: use sem column filtering only when present
              const semFilterVal = filterSem === 'all' ? null : Number(filterSem);
              let query = supabase
                .from('electives')
                .select('id, parent_subject_id, course_code, sub_name, credits, department, year, sem, staff_id')
                .in('department', deptNames.length > 0 ? [...deptNames, 'ALL'] : [dept, 'ALL'])
                .order('course_code', { ascending: true });
              if (semFilterVal !== null) query = query.eq('sem', semFilterVal);
              const { data, error } = await query;
              if (error) {
                // detect missing column error and retry without semester
                const msg = String(error?.message || '').toLowerCase();
                if (msg.includes('column') && msg.includes('semester')) {
                  const { data: d2, error: e2 } = await supabase
                    .from('electives')
                    .select('id, parent_subject_id, course_code, sub_name, credits, department, year, staff_id')
                    .in('department', deptNames.length > 0 ? [...deptNames, 'ALL'] : [dept, 'ALL'])
                    .order('course_code', { ascending: true });
                  if (e2) throw e2;
                  electData = d2 as any[] || [];
                  electiveHasSemester = false;
                } else {
                  throw error;
                }
              } else {
                electData = data as any[] || [];
              }
            } catch (innerErr) {
              console.debug('Electives query fallback triggered or failed', innerErr);
              electData = electData || [];
            }

              if (electData && electData.length > 0) {
              const parentIds = Array.from(new Set((electData as any[]).map(e => e.parent_subject_id).filter(Boolean).filter((id:any)=>id !== 'ALL')));
              let parentMap: Record<string, string> = {};
              let parentDept: Record<string, string> = {};
              if (parentIds.length > 0) {
                // fetch parent subjects, include semester/sem columns if present to allow sem filtering
                const { data: parents } = await supabase.from('subjects').select('id, name, department, sem, semester').in('id', parentIds);
                // only include parent subjects that are from same HOD departments or ALL and match sem filter (if set)
                const semFilterVal = filterSem === 'all' ? null : Number(filterSem);
                (parents || []).forEach((p: any) => {
                  const pdept = p.department;
                  const includeDept = (pdept === 'ALL') || deptNames.includes(pdept);
                  const parentSemVal = (p.sem ?? p.semester ?? null);
                  const includeSem = semFilterVal === null ? true : Number(parentSemVal) === semFilterVal;
                  if (includeDept && includeSem) {
                    parentMap[p.id] = p.name;
                    parentDept[p.id] = p.department;
                  }
                });

                // For any parent subject whose department === 'ALL', fetch all electives that reference it across departments
                const allParentIds = (parents || []).filter((p:any) => String(p.department).toUpperCase() === 'ALL').map((p:any) => p.id);
                if (allParentIds.length > 0) {
                  try {
                    const semFilterVal = filterSem === 'all' ? null : Number(filterSem);
                    // Parent subjects with department 'ALL' may have subelectives in any department.
                    // Fetch extras across all departments (do not restrict by deptNames) but respect sem filter.
                    let extraQuery = supabase.from('electives')
                      .select('id, parent_subject_id, course_code, sub_name, credits, department, year, sem, staff_id')
                      .in('parent_subject_id', allParentIds)
                      .order('course_code', { ascending: true });
                    if (semFilterVal !== null) extraQuery = extraQuery.eq('sem', semFilterVal);
                    const { data: extraElects } = await extraQuery;
                    if (extraElects && extraElects.length > 0) {
                      // Append extras that aren't already present
                      const existingIds = new Set((electData as any[]).map((e:any) => e.id));
                      for (const ex of extraElects) {
                        if (!existingIds.has(ex.id)) (electData as any[]).push(ex);
                      }
                    }
                  } catch (ee) {
                    console.debug('Failed to load extra electives for ALL parents', ee);
                  }
                }
              }
              setElectiveParentMap(parentMap);

              const electRows: any[] = [];
                for (const e of electData as any[]) {
                  const deptVal = String(e.department || '').trim();
                  let cat: 'ALL' | 'SAME' | 'OTHER' = 'OTHER';
                  if (String(deptVal).toUpperCase() === 'ALL') cat = 'ALL';
                  else if (deptNames.includes(deptVal)) cat = 'SAME';
                  electRows.push({
                  id: e.id,
                  subject_code: e.course_code,
                  name: `${parentMap[e.parent_subject_id] || 'Elective'} — ${e.sub_name || e.course_code}`,
                  staff_id: e.staff_id || null,
                  year: e.year,
                  section: 'ALL',
                  department: e.department,
                  credits: e.credits,
                  semester: (e.sem ?? e.semester ?? null),
                  _is_subelective: true,
                  _parent_subject_id: e.parent_subject_id,
                  _dept_category: cat,
                });
              }

              const electGrouped: Record<number, any[]> = {};
              for (const r of electRows) {
                const y = r.year || 0;
                if (!electGrouped[y]) electGrouped[y] = [];
                electGrouped[y].push(r);
              }
              setDeptElectivesByYear(electGrouped);

              // Ensure we have staff names for any electives' staff_id values
              const electiveStaffIds = Array.from(new Set(electRows.map((er:any) => er.staff_id).filter(Boolean) as string[]));
              const missingStaffIds = electiveStaffIds.filter(id => !Object.prototype.hasOwnProperty.call(staffMap, id));
              if (missingStaffIds.length > 0) {
                try {
                  let moreStaff: any[] | null = null;
                  try {
                    const res = await supabase.from('profiles').select('id, name, email').in('id', missingStaffIds);
                    if ((res as any).error) throw (res as any).error;
                    moreStaff = (res as any).data || [];
                  } catch (err) {
                    // fallback to minimal columns if extended columns don't exist
                    try {
                      const res2 = await supabase.from('profiles').select('id, name, email').in('id', missingStaffIds);
                      moreStaff = (res2 as any).data || [];
                    } catch (err2) {
                      console.debug('Failed elective staff profiles lookup (both attempts)', err, err2);
                      moreStaff = [];
                    }
                  }
                  if (moreStaff && moreStaff.length > 0) {
                    const addMap: Record<string, string> = {};
                    for (const s of moreStaff as any[]) {
                      addMap[s.id] = s.name || s.email || s.id;
                    }
                    setStaffMap(prev => ({ ...(prev || {}), ...addMap }));
                  } else {
                    console.debug('No profiles returned for elective staff lookup', { missingStaffIds, moreStaff });
                    const placeholder: Record<string, string> = {};
                    for (const id of missingStaffIds) placeholder[id] = `Unknown (${id})`;
                    setStaffMap(prev => ({ ...(prev || {}), ...placeholder }));
                  }
                } catch (e) {
                  console.debug('Failed to load elective staff profiles', e);
                }
              }
            } else {
              setDeptElectivesByYear({});
            }
          } catch (ee) {
            console.debug('Failed to load electives for HOD subjects', ee);
            setDeptElectivesByYear({});
          }

          // Build staff id -> name map
          const staffIds = Array.from(new Set(rows.map(r => r.staff_id).filter(Boolean) as string[]));
          if (staffIds.length > 0) {
            let staffProfiles: any[] | null = null;
            try {
              const res = await supabase.from('profiles').select('id, name, email').in('id', staffIds);
              if ((res as any).error) throw (res as any).error;
              staffProfiles = (res as any).data || [];
            } catch (err) {
              try {
                const res2 = await supabase.from('profiles').select('id, name, email').in('id', staffIds);
                staffProfiles = (res2 as any).data || [];
              } catch (err2) {
                console.debug('Failed profiles lookup for staffIds (both attempts)', { err, err2, staffIds });
                staffProfiles = [];
              }
            }
            if (staffProfiles && staffProfiles.length > 0) {
              const map: Record<string, string> = {};
              for (const p of staffProfiles as any[]) map[p.id] = p.name || p.email || p.id;
              // Ensure HOD's own name is present
              if ((profile as any)?.id && (profile as any)?.name) map[(profile as any).id] = (profile as any).name;
              // Merge into existing map instead of replacing to preserve any previous lookups
              setStaffMap(prev => ({ ...(prev || {}), ...map }));
            }
          } else {
            // Ensure HOD's own name is present
            if ((profile as any)?.id && (profile as any)?.name) {
              setStaffMap(prev => ({ ...(prev || {}), [(profile as any).id]: (profile as any).name }));
            }
          }
        }

        // Load HOD's assigned subjects (My Subjects)
        const hodId = profile.id as string;
        // 1) subjects where staff_id == hodId
        const { data: mySubjData, error: mySubjErr } = await supabase
          .from('subjects')
          .select('*')
          .eq('staff_id', hodId)
          .order('year', { ascending: true })
          .order('subject_code', { ascending: true });

        const myRows: any[] = [];
        if (!mySubjErr && mySubjData && mySubjData.length > 0) {
          myRows.push(...(mySubjData as Subject[]));
        }

        // 2) subelectives where staff_id == hodId
        const { data: myElects, error: myElectErr } = await supabase
          .from('electives')
          .select('id, parent_subject_id, course_code, sub_name, credits, department, year')
          .eq('staff_id', hodId)
          .order('course_code', { ascending: true });

        if (!myElectErr && myElects && myElects.length > 0) {
          // For each subelective, fetch parent subject name
          const parentIds = Array.from(new Set((myElects as any[]).map(e => e.parent_subject_id).filter(Boolean)));
          const { data: parents } = await supabase.from('subjects').select('id, name').in('id', parentIds);
          const parentMap: Record<string, string> = {};
          (parents || []).forEach((p: any) => parentMap[p.id] = p.name);

          for (const e of myElects as any[]) {
            myRows.push({
              id: e.id,
              subject_code: e.course_code,
              name: `${parentMap[e.parent_subject_id] || 'Elective'} — ${e.sub_name || e.course_code}`,
              staff_id: hodId,
              year: e.year,
              section: 'ALL',
              department: e.department,
              credits: e.credits,
              _is_subelective: true,
              _parent_subject_id: e.parent_subject_id,
            });
          }
        }

        // Group myRows by year
        const myGrouped: Record<number, any[]> = {};
        for (const r of myRows) {
          const y = r.year || 0;
          if (!myGrouped[y]) myGrouped[y] = [];
          myGrouped[y].push(r);
        }
        setMySubjectsByYear(myGrouped);

        // Consolidated staff-name lookup: collect all staff IDs from department subjects, electives and myRows
        try {
          const allStaffIds = new Set<string>();
          // from department subjects
          for (const y of Object.keys(grouped || {})) {
            for (const s of (grouped as any)[Number(y)] || []) if (s.staff_id) allStaffIds.add(s.staff_id);
          }
          // from electives
          for (const y of Object.keys(electGrouped || {})) {
            for (const s of (electGrouped as any)[Number(y)] || []) if (s.staff_id) allStaffIds.add(s.staff_id);
          }
          // from myRows
          for (const y of Object.keys(myGrouped || {})) {
            for (const s of (myGrouped as any)[Number(y)] || []) if (s.staff_id) allStaffIds.add(s.staff_id);
          }
          const ids = Array.from(allStaffIds).filter(Boolean);
          const missing = ids.filter(id => !Object.prototype.hasOwnProperty.call(staffMap, id));
          if (missing.length > 0) {
            let profs: any[] | null = null;
            try {
                    const res = await supabase.from('profiles').select('id, name, full_name, display_name, email').in('id', missing);
              if ((res as any).error) throw (res as any).error;
              profs = (res as any).data || [];
            } catch (err) {
              try {
                      const res2 = await supabase.from('profiles').select('id, name, email').in('id', missing);
                profs = (res2 as any).data || [];
              } catch (err2) {
                console.debug('Failed consolidated profiles lookup (both attempts)', { err, err2, missing });
                profs = [];
              }
            }
            if (profs && profs.length > 0) {
              const add: Record<string, string> = {};
                      for (const p of profs as any[]) add[p.id] = p.name || p.full_name || p.display_name || p.email || p.id;
              setStaffMap(prev => ({ ...(prev || {}), ...add }));
            } else {
              console.debug('Consolidated profiles lookup returned no rows for', missing);
              // ensure missing ids have a readable placeholder
              const placeholder: Record<string, string> = {};
              for (const id of missing) placeholder[id] = `Unknown (${id})`;
              setStaffMap(prev => ({ ...(prev || {}), ...placeholder }));
            }
          }
        } catch (e) {
          console.debug('Failed consolidated staff lookup', e);
        }
      } catch (err: any) {
        console.error('Error loading HOD subjects:', err);
        setError(err.message || String(err));
      } finally {
        setLoading(false);
      }
    };

    load();
  }, [profile, filterSem]);

  const fetchStudentsForElective = async (elective: any) => {
    setModalElectiveTitle(`${elective.name || elective.sub_name || elective.subject_code} (${elective.subject_code || elective.course_code || ''})`);
    setStudentsLoading(true);
    setStudentsForElective([]);
    try {
      // Try direct SELECT first
      const { data: seRows, error: seErr } = await supabase
        .from('student_electives')
        .select('id, student_id, elective_id')
        .eq('elective_id', elective.id);

      if (seErr) {
        console.debug('student_electives select error, will attempt RPC fallback', seErr);
      }

      let finalList: any[] = [];

      if (seRows && seRows.length > 0) {
        const studentIds = (seRows as any[]).map(r => r.student_id);
        const { data: studentsData } = await supabase.from('students').select('id, reg_no, course_name').in('id', studentIds);
        const { data: profilesData } = await supabase.from('profiles').select('id, name, department').in('id', studentIds);

        finalList = (seRows as any[]).map((row: any) => {
          const student = (studentsData || []).find((s: any) => s.id === row.student_id);
          const profile = (profilesData || []).find((p: any) => p.id === row.student_id);
          return {
            name: profile?.name || 'N/A',
            register_number: student?.reg_no || 'N/A',
            department: profile?.department || student?.course_name || 'N/A',
            student_elective_id: row.id,
          };
        }).sort((a: any, b: any) => (a.name || '').localeCompare(b.name || ''));
      }

      // If direct SELECT returned no rows (possibly blocked by RLS), try RPC fallback
      if ((!finalList || finalList.length === 0)) {
        try {
          const { data: rpcData, error: rpcErr } = await supabase.rpc('rpc_get_students_for_elective', { p_elective_id: elective.id });
          if (rpcErr) throw rpcErr;
          if (rpcData && (rpcData as any[]).length > 0) {
            finalList = (rpcData as any[]).map((r: any) => ({
              name: r.student_name || 'N/A',
              register_number: r.reg_no || 'N/A',
              department: r.department || 'N/A',
              student_elective_id: r.student_elective_id,
            }));
          }
        } catch (rpcErr) {
          console.debug('rpc_get_students_for_elective failed', rpcErr);
        }
      }

      setStudentsForElective(finalList as any[]);
      setShowStudentsModal(true);
    } catch (err) {
      console.error('Failed to fetch students for elective', err);
      setStudentsForElective([]);
      setShowStudentsModal(true);
    } finally {
      setStudentsLoading(false);
    }
  };

  return (
    <DashboardLayout>
      <div className="max-w-4xl mx-auto">
        <div className="mb-6 flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-slate-800">Subjects</h1>
            <p className="text-slate-600 mt-1">Showing subjects for your department or your assigned subjects</p>
          </div>
          <div className="flex gap-2">
            <button onClick={() => setViewMode('dept')} className={`px-3 py-2 rounded ${viewMode === 'dept' ? 'bg-blue-600 text-white' : 'bg-slate-100'}`}>Dept</button>
            <button onClick={() => setViewMode('mine')} className={`px-3 py-2 rounded ${viewMode === 'mine' ? 'bg-blue-600 text-white' : 'bg-slate-100'}`}>My Subjects</button>
            <button onClick={() => setViewMode('electives')} className={`px-3 py-2 rounded ${viewMode === 'electives' ? 'bg-blue-600 text-white' : 'bg-slate-100'}`}>Electives</button>
          </div>
        </div>

        <div className="mb-4 flex flex-wrap gap-3 items-center">
          <div className="flex items-center gap-2">
            <label className="text-sm text-slate-700">Semester</label>
            <select value={filterSem} onChange={(e) => setFilterSem(e.target.value)} className="border rounded px-2 py-1">
              <option value="all">All</option>
              {[1,2,3,4,5,6,7,8].map(s => (
                <option key={s} value={String(s)}>{s}</option>
              ))}
            </select>
          </div>
        </div>

        {loading ? (
          <Loader message="Loading subjects..." />
        ) : error ? (
          <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-2 rounded">{error}</div>
        ) : (
          <div>
            {(() => {
              const semFilter = filterSem === 'all' ? null : Number(filterSem);
              const semesterMatches = (s: any) => {
                if (!semFilter) return true;
                // Always include electives whose parent_subject_id is 'ALL'
                if (s?._is_subelective && String(s?._parent_subject_id || '').toUpperCase() === 'ALL') return true;
                const semVal = (s?.semester ?? s?.sem ?? null);
                return Number(semVal) === semFilter;
              };

              if (viewMode === 'electives') {
                const electMap = deptElectivesByYear || {};
                const electYears = Object.keys(electMap)
                  .map(k => Number(k))
                  .filter(y => (electMap[y] || []).some((s:any) => semesterMatches(s)))
                  .sort((a,b)=>a-b);
                if (electYears.length === 0) {
                  return (
                    <div className="bg-white rounded-xl shadow-lg border border-slate-200 p-6 text-center">
                      <p className="text-slate-500">No electives found</p>
                    </div>
                  );
                }
                return (
                  <div className="space-y-6">
                    {electYears.map((ey) => {
                      const rows = (electMap[ey] || []).filter((s:any)=>semesterMatches(s));
                      if (rows.length === 0) return null;
                      // Group rows by parent_subject_id so we show parent header then its subjects
                      const byParent: Record<string, any[]> = {};
                      const noParentKey = '__NOPARENT__';
                      for (const r of rows) {
                        const pid = r._parent_subject_id || noParentKey;
                        if (!byParent[pid]) byParent[pid] = [];
                        byParent[pid].push(r);
                      }
                      return (
                        <div key={`elect-${ey}`} className="bg-white rounded-xl shadow-lg border border-slate-200 p-4">
                          <h3 className="text-lg font-semibold mb-3">Electives — Year {ey}</h3>
                          {Object.keys(byParent).map((pid) => {
                            const group = byParent[pid] || [];
                            const sameRows = group.filter((r:any) => r._dept_category === 'SAME');
                            const otherRows = group.filter((r:any) => r._dept_category === 'OTHER');
                            const allRows = group.filter((r:any) => r._dept_category === 'ALL');
                            const anyRows = sameRows.length || otherRows.length || allRows.length;
                            if (!anyRows) return null;
                            return (
                              <div key={pid} className="mb-4">
                                {pid !== noParentKey && (
                                  <div className="text-base font-semibold text-slate-800 mb-2">{electiveParentMap[pid] || 'Elective'}</div>
                                )}

                                {sameRows.length > 0 && (
                                  <div className="mb-3">
                                    <div className="text-sm font-medium text-slate-700 mb-1">Same department</div>
                                    <div className="overflow-auto max-h-[48vh]">
                                      <table className="w-full text-sm">
                                      <thead>
                                        <tr className="text-left text-slate-600">
                                          <th className="py-2">Code</th>
                                          <th className="py-2">Name</th>
                                          <th className="py-2">Staff</th>
                                          <th className="py-2">Section</th>
                                            <th className="py-2">Credits</th>
                                            <th className="py-2">Actions</th>
                                        </tr>
                                      </thead>
                                      <tbody>
                                        {sameRows.map((s:any) => (
                                          <tr key={s.id} className="border-t">
                                            <td className="py-2">{s.subject_code}</td>
                                            <td className="py-2">{s.name}</td>
                                            <td className="py-2">{s.staff_id ? (staffMap[s.staff_id] || s.staff_id) : '-'}</td>
                                            <td className="py-2">{s.section || '-'}</td>
                                            <td className="py-2">{s.credits}</td>
                                              <td className="py-2">
                                                <button className="text-sm px-2 py-1 bg-slate-100 rounded" onClick={() => fetchStudentsForElective(s)}>View</button>
                                              </td>
                                            </tr>
                                        ))}
                                      </tbody>
                                      </table>
                                    </div>
                                  </div>
                                )}

                                {otherRows.length > 0 && (
                                  <div className="mb-3">
                                    <div className="text-sm font-medium text-slate-700 mb-1">Other departments</div>
                                    <div className="overflow-auto max-h-[48vh]">
                                      <table className="w-full text-sm">
                                      <thead>
                                        <tr className="text-left text-slate-600">
                                          <th className="py-2">Code</th>
                                          <th className="py-2">Name</th>
                                          <th className="py-2">Dept</th>
                                          <th className="py-2">Staff</th>
                                          <th className="py-2">Credits</th>
                                          <th className="py-2">Actions</th>
                                        </tr>
                                      </thead>
                                      <tbody>
                                        {otherRows.map((s:any) => (
                                          <tr key={s.id} className="border-t">
                                            <td className="py-2">{s.subject_code}</td>
                                            <td className="py-2">{s.name}</td>
                                            <td className="py-2">{s.department || '-'}</td>
                                            <td className="py-2">{s.staff_id ? (staffMap[s.staff_id] || s.staff_id) : '-'}</td>
                                            <td className="py-2">{s.credits}</td>
                                            <td className="py-2">
                                              <button className="text-sm px-2 py-1 bg-slate-100 rounded" onClick={() => fetchStudentsForElective(s)}>View</button>
                                            </td>
                                          </tr>
                                        ))}
                                      </tbody>
                                      </table>
                                    </div>
                                  </div>
                                )}

                                {allRows.length > 0 && (
                                  <div className="mb-3">
                                    <div className="text-sm font-medium text-slate-700 mb-1">ALL department</div>
                                    <div className="overflow-auto max-h-[48vh]">
                                      <table className="w-full text-sm">
                                      <thead>
                                        <tr className="text-left text-slate-600">
                                          <th className="py-2">Code</th>
                                          <th className="py-2">Name</th>
                                          <th className="py-2">Staff</th>
                                          <th className="py-2">Credits</th>
                                          <th className="py-2">Actions</th>
                                        </tr>
                                      </thead>
                                      <tbody>
                                        {allRows.map((s:any) => (
                                          <tr key={s.id} className="border-t">
                                            <td className="py-2">{s.subject_code}</td>
                                            <td className="py-2">{s.name}</td>
                                            <td className="py-2">{s.staff_id ? (staffMap[s.staff_id] || s.staff_id) : '-'}</td>
                                            <td className="py-2">{s.credits}</td>
                                            <td className="py-2">
                                              <button className="text-sm px-2 py-1 bg-slate-100 rounded" onClick={() => fetchStudentsForElective(s)}>View</button>
                                            </td>
                                          </tr>
                                        ))}
                                      </tbody>
                                      </table>
                                    </div>
                                  </div>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      );
                    })}
                  </div>
                );
              }

              // default (dept or mine) behavior preserved
              const dataMap = viewMode === 'dept' ? subjectsByYear : mySubjectsByYear;
              const visibleYears = Object.keys(dataMap)
                .map(k => Number(k))
                .filter(y => (dataMap[y] || []).some((s: any) => semesterMatches(s)))
                .sort((a, b) => a - b);

              if (visibleYears.length === 0) {
                return (
                  <div className="bg-white rounded-xl shadow-lg border border-slate-200 p-6 text-center">
                    <p className="text-slate-500">No subjects found</p>
                  </div>
                );
              }

              return (
                <div className="space-y-6">
                  {visibleYears.map((year) => (
                    <div key={year} className="bg-white rounded-xl shadow-lg border border-slate-200 p-4">
                      <h3 className="text-lg font-semibold mb-3">Year {year}</h3>
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="text-left text-slate-600">
                            <th className="py-2">Code</th>
                            <th className="py-2">Name</th>
                            <th className="py-2">Staff</th>
                            <th className="py-2">Section</th>
                            <th className="py-2">Credits</th>
                          </tr>
                        </thead>
                        <tbody>
                          {(dataMap[year] || []).filter((s:any) => semesterMatches(s)).map((s: any) => (
                            <tr key={s.id} className="border-t">
                              <td className="py-2">{s.subject_code}</td>
                              <td className="py-2">{s.name}</td>
                              <td className="py-2">{s.staff_id ? (staffMap[s.staff_id] || s.staff_id) : '-'}</td>
                              <td className="py-2">{s.section || '-'}</td>
                              <td className="py-2">{s.credits}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  ))}

                  {/* Electives section shown only when viewMode !== 'electives' (kept as additional content) */}
                  {viewMode !== 'electives' && (() => {
                    const electMap = deptElectivesByYear || {};
                    const electYears = Object.keys(electMap).map(k => Number(k)).filter(y => (electMap[y] || []).some((s:any) => semesterMatches(s))).sort((a,b)=>a-b);
                    if (electYears.length === 0) return null;
                    return (
                      <div className="bg-white rounded-xl shadow-lg border border-slate-200 p-4">
                        <h3 className="text-lg font-semibold mb-3">Electives</h3>
                        {electYears.map((ey) => {
                          const rows = (electMap[ey] || []).filter((s:any)=>semesterMatches(s));
                          if (rows.length === 0) return null;
                          // Group rows by parent_subject_id so we can show parent header when available
                          const byParent: Record<string, any[]> = {};
                          const noParentKey = '__NOPARENT__';
                          for (const r of rows) {
                            const pid = r._parent_subject_id || noParentKey;
                            if (!byParent[pid]) byParent[pid] = [];
                            byParent[pid].push(r);
                          }
                          return (
                            <div key={`elect-${ey}`} className="mb-4">
                              <h4 className="font-medium mb-2">Year {ey}</h4>
                              {Object.keys(byParent).map((pid) => (
                                <div key={pid} className="mb-3">
                                  {pid !== noParentKey && (
                                    <div className="text-sm font-semibold text-slate-700 mb-2">{electiveParentMap[pid] || 'Elective'}</div>
                                  )}
                                  <div className="overflow-auto max-h-[48vh]">
                                    <table className="w-full text-sm">
                                    <thead>
                                      <tr className="text-left text-slate-600">
                                        <th className="py-2">Code</th>
                                        <th className="py-2">Name</th>
                                        <th className="py-2">Staff</th>
                                        <th className="py-2">Section</th>
                                        <th className="py-2">Credits</th>
                                      </tr>
                                    </thead>
                                    <tbody>
                                      {byParent[pid].map((s:any) => (
                                        <tr key={s.id} className="border-t">
                                          <td className="py-2">{s.subject_code}</td>
                                          <td className="py-2">{s.name}</td>
                                          <td className="py-2">{s.staff_id ? (staffMap[s.staff_id] || s.staff_id) : '-'}</td>
                                          <td className="py-2">{s.section || '-'}</td>
                                          <td className="py-2">{s.credits}</td>
                                        </tr>
                                      ))}
                                    </tbody>
                                    </table>
                                  </div>
                                </div>
                              ))}
                            </div>
                          );
                        })}
                      </div>
                    );
                  })()}
                </div>
              );
            })()}
          </div>
        )}
      </div>
      {showStudentsModal && (
        <div className="fixed inset-0 z-50 flex items-start justify-center p-6">
          <div className="absolute inset-0 bg-black/50" onClick={() => setShowStudentsModal(false)} />
          <div className="relative bg-white rounded-lg shadow-lg w-full max-w-2xl z-60 overflow-auto">
            <div className="flex items-center justify-between p-4 border-b">
              <h3 className="text-lg font-semibold">Students — {modalElectiveTitle}</h3>
              <button className="px-3 py-1 rounded bg-slate-100" onClick={() => setShowStudentsModal(false)}>Close</button>
            </div>
            <div className="p-4">
              {studentsLoading ? (
                <div className="text-sm text-slate-600">Loading students...</div>
              ) : studentsForElective.length === 0 ? (
                <div className="text-sm text-slate-600">No students mapped to this elective.</div>
              ) : (
                <div className="max-h-[60vh] overflow-auto">
                                  <div className="overflow-auto max-h-[48vh]">
                                    <table className="w-full text-sm">
                    <thead>
                      <tr className="text-left text-slate-600">
                        <th className="py-2">#</th>
                        <th className="py-2">Name</th>
                        <th className="py-2">Register No</th>
                        <th className="py-2">Department</th>
                      </tr>
                    </thead>
                    <tbody>
                      {studentsForElective.map((st, idx) => (
                        <tr key={st.student_elective_id || idx} className="border-t">
                          <td className="py-2">{idx+1}</td>
                          <td className="py-2">{st.name}</td>
                          <td className="py-2">{st.register_number}</td>
                          <td className="py-2">{st.department}</td>
                        </tr>
                      ))}
                    </tbody>
                                    </table>
                                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </DashboardLayout>
  );
}
