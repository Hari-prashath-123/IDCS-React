import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
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

export default function MySubjects() {
  const { profile } = useAuth();
  const [loading, setLoading] = useState(true);
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [electivesList, setElectivesList] = useState<any[]>([]);
  const [staffRole, setStaffRole] = useState<string | null>(null);
  const [showElectiveModal, setShowElectiveModal] = useState(false);
  const [modalElective, setModalElective] = useState<any | null>(null);
  const [modalStudents, setModalStudents] = useState<any[]>([]);
  const [showClassElectivesModal, setShowClassElectivesModal] = useState(false);
  const [classElectiveStudents, setClassElectiveStudents] = useState<any[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<'my' | 'dept' | 'allElectives'>('my');
  const [filterSem, setFilterSem] = useState<string>('all');
  const [deptSubjects, setDeptSubjects] = useState<Subject[]>([]);
  const [allDeptElectives, setAllDeptElectives] = useState<any[]>([]);
  const [allElectivesFilterSem, setAllElectivesFilterSem] = useState<string>('all');
  
  const viewElectiveStudents = async (electiveRow: any) => {
    try {
      console.info('[MySubjects] viewElectiveStudents start', electiveRow?.id);
      setModalElective(electiveRow);
      setModalStudents([]);

      // Try SECURITY DEFINER RPC first
      let rows: any[] = [];
      try {
        const { data: rpcData, error: rpcErr } = await supabase.rpc('get_elective_students', { p_elective_id: electiveRow.id });
        if (!rpcErr && Array.isArray(rpcData)) rows = rpcData as any[];
        else if (rpcErr) console.warn('[MySubjects] RPC get_elective_students error:', rpcErr);
      } catch (rpcEx) {
        console.warn('[MySubjects] RPC invocation failed', rpcEx);
      }

      // Normalize rows
      const normalized = (rows || []).map((s: any) => ({
        id: s.student_id || s.id,
        name: s.name || s.full_name || '',
        reg_no: s.reg_no || s.registration_no || '—',
        year: s.year || s.sem || null,
        section: s.section || null,
        elective_name: electiveRow ? (`${electiveRow.course_code || ''} ${electiveRow.sub_name || ''}`).trim() : null,
      }));

      // Fallback: if RPC returned nothing, try alternative RPC then direct select
      if (normalized.length === 0) {
        // Try alternate RPC that some deployments use
        try {
          const { data: altRpc, error: altErr } = await supabase.rpc('rpc_get_students_for_elective', { p_elective_id: electiveRow.id });
          if (!altErr && Array.isArray(altRpc) && (altRpc as any[]).length > 0) {
            const altNorm = (altRpc as any[]).map((r:any) => ({
              id: r.student_id || r.id,
              name: r.student_name || r.name || '',
              reg_no: r.reg_no || '—',
              year: null,
              section: null,
              elective_name: electiveRow ? (`${electiveRow.course_code || ''} ${electiveRow.sub_name || ''}`).trim() : null,
            }));
            setModalStudents(altNorm);
            setShowElectiveModal(true);
            return;
          }
          if (altErr) console.warn('[MySubjects] alternate RPC rpc_get_students_for_elective error', altErr);
        } catch (altEx) {
          console.warn('[MySubjects] alternate RPC invocation failed', altEx);
        }

        // Direct select fallback: student_electives -> profiles
        try {
          const { data: se } = await supabase.from('student_electives').select('student_id').eq('elective_id', electiveRow.id);
          const ids = (se || []).map((r: any) => r.student_id).filter(Boolean);
          if (ids.length > 0) {
            const { data: profiles } = await supabase.from('profiles').select('id,name').in('id', ids as any[]);
            const profMap: Record<string, string> = {};
            (profiles || []).forEach((p: any) => { profMap[p.id] = p.name; });
            const merged = ids.map((id: any) => ({ id, name: profMap[id] || '', reg_no: '—', year: null, section: null, elective_name: electiveRow ? (`${electiveRow.course_code || ''} ${electiveRow.sub_name || ''}`).trim() : null }));
            setModalStudents(merged);
            setShowElectiveModal(true);
            return;
          }
        } catch (ex) {
          console.warn('[MySubjects] direct select fallback failed', ex);
        }
      }

      setModalStudents(normalized);
      setShowElectiveModal(true);
    } catch (e) {
      console.error('viewElectiveStudents failed', e);
      setModalStudents([]);
      setShowElectiveModal(true);
    }
  };

  const viewAdvisorClassElectives = async () => {
    if (!profile) return;
    setShowClassElectivesModal(true);
    setClassElectiveStudents([]);
    try {
      // Get advisee student ids (only advisor, exclude mentor relationships)
      const { data: studs, error: studsErr } = await supabase
        .from('students')
        .select('id, reg_no, year, section')
        .eq('advisor_id', profile.id);
      if (studsErr) throw studsErr;
      const studentIds = (studs || []).map((s: any) => s.id).filter(Boolean);
      if (studentIds.length === 0) {
        setClassElectiveStudents([]);
        return;
      }

      // Fetch chosen electives for these students
      const { data: se } = await supabase
        .from('student_electives')
        .select('student_id, elective_id')
        .in('student_id', studentIds as any[]);
      const electiveIds = Array.from(new Set((se || []).map((r: any) => r.elective_id).filter(Boolean)));

      // Fetch elective details
      const electiveMap: Record<string, any> = {};
      if (electiveIds.length > 0) {
        const { data: electives } = await supabase.from('electives').select('id, course_code, sub_name').in('id', electiveIds as any[]);
        (electives || []).forEach((e: any) => { electiveMap[e.id] = e; });
      }

      // Fetch student profiles for names and reg_no
      const { data: profiles } = await supabase.from('profiles').select('id, name').in('id', studentIds as any[]);
      const profMap: Record<string, string> = {};
      (profiles || []).forEach((p: any) => { profMap[p.id] = p.name; });

      // Build rows: combine student -> elective
      // create a map of student info from studs result
      const studentInfo: Record<string, any> = {};
      (studs || []).forEach((s: any) => { studentInfo[s.id] = s; });

      // Helper to resolve an elective id to an elective object. Some deployments
      // may store legacy values (course_code) or have electives in different lists
      // (`electivesList` or `allDeptElectives`). Try multiple fallbacks.
      const resolveElective = (eid: any) => {
        if (!eid) return null;
        if (electiveMap[eid]) return electiveMap[eid];
        // try in-memory lists
        const byId = (electivesList || []).find((x: any) => x.id === eid) || (allDeptElectives || []).find((x: any) => x.id === eid);
        if (byId) return byId;
        // try matching by course_code (in case older rows stored codes)
        const byCode = (electivesList || []).find((x: any) => x.course_code === eid) || (allDeptElectives || []).find((x: any) => x.course_code === eid);
        if (byCode) return byCode;
        return null;
      };

      const rows = (se || []).map((r: any) => {
        const ele = resolveElective(r.elective_id);
        const electiveLabel = ele ? `${ele.course_code || ''} ${ele.sub_name || ''}`.trim() : '—';
        return {
          id: r.student_id,
          name: profMap[r.student_id] || '',
          reg_no: studentInfo[r.student_id]?.reg_no || '—',
          year: studentInfo[r.student_id]?.year || null,
          section: studentInfo[r.student_id]?.section || null,
          elective_name: electiveLabel,
        };
      });

      // If some students have no selection, include them with empty elective
      const selectedStudentSet = new Set((se || []).map((r:any) => r.student_id));
      studentIds.forEach(sid => {
        if (!selectedStudentSet.has(sid)) {
          rows.push({ id: sid, name: profMap[sid] || '', reg_no: studentInfo[sid]?.reg_no || '—', year: studentInfo[sid]?.year || null, section: studentInfo[sid]?.section || null, elective_name: '—' });
        }
      });

      // Sort alphabetically by student name (case-insensitive) for consistent display
      rows.sort((a: any, b: any) => String(a.name || '').localeCompare(String(b.name || ''), undefined, { sensitivity: 'base' }));

      setClassElectiveStudents(rows);
    } catch (e) {
      console.error('viewAdvisorClassElectives failed', e);
      setClassElectiveStudents([]);
    }
  };

  // View students for an elective but restricted to this staff's advisees only
  const viewElectiveStudentsForAdvisor = async (electiveRow: any) => {
    try {
      setModalElective(electiveRow);
      setModalStudents([]);

      if (!profile) throw new Error('No profile');

      // Fetch advisee student ids
      const { data: studs, error: studsErr } = await supabase
        .from('students')
        .select('id')
        .eq('advisor_id', profile.id);
      if (studsErr) throw studsErr;
      const adviseeIds = (studs || []).map((s: any) => s.id).filter(Boolean);

      if (adviseeIds.length === 0) {
        setModalStudents([]);
        setShowElectiveModal(true);
        return;
      }

      // Try RPC to get elective students, then filter by adviseeIds
      let rows: any[] = [];
      try {
        const { data: rpcData, error: rpcErr } = await supabase.rpc('get_elective_students', { p_elective_id: electiveRow.id });
        if (!rpcErr && Array.isArray(rpcData)) rows = rpcData as any[];
        else if (rpcErr) console.warn('[MySubjects] RPC get_elective_students error:', rpcErr);
      } catch (rpcEx) {
        console.warn('[MySubjects] RPC invocation failed', rpcEx);
      }

      // Normalize and filter rows to advisees
      const normalized = (rows || []).map((s: any) => ({
        id: s.student_id || s.id,
        name: s.name || s.full_name || '',
        reg_no: s.reg_no || s.registration_no || '—',
        year: s.year || s.sem || null,
        section: s.section || null,
        elective_name: electiveRow ? (`${electiveRow.course_code || ''} ${electiveRow.sub_name || ''}`).trim() : null,
      })).filter((r: any) => adviseeIds.includes(r.id));

      // Fallbacks: if RPC returned nothing or none matched, try alternate RPC then direct select
      if (normalized.length === 0) {
        // Try alternate RPC
        try {
          const { data: altRpc, error: altErr } = await supabase.rpc('rpc_get_students_for_elective', { p_elective_id: electiveRow.id });
          if (!altErr && Array.isArray(altRpc) && (altRpc as any[]).length > 0) {
            const altNorm = (altRpc as any[]).map((r:any) => ({
              id: r.student_id || r.id,
              name: r.student_name || r.name || '',
              reg_no: r.reg_no || '—',
              year: null,
              section: null,
              elective_name: electiveRow ? (`${electiveRow.course_code || ''} ${electiveRow.sub_name || ''}`).trim() : null,
            })).filter((r:any) => adviseeIds.includes(r.id));
            setModalStudents(altNorm);
            setShowElectiveModal(true);
            return;
          }
          if (altErr) console.warn('[MySubjects] alternate RPC rpc_get_students_for_elective error', altErr);
        } catch (altEx) {
          console.warn('[MySubjects] alternate RPC invocation failed', altEx);
        }

        // Direct select fallback: student_electives -> profiles, filtered by adviseeIds
        try {
          const { data: se } = await supabase.from('student_electives').select('student_id').eq('elective_id', electiveRow.id);
          const ids = (se || []).map((r: any) => r.student_id).filter(Boolean).filter((id: any) => adviseeIds.includes(id));
          if (ids.length > 0) {
            const { data: profiles } = await supabase.from('profiles').select('id,name').in('id', ids as any[]);
            const profMap: Record<string, string> = {};
            (profiles || []).forEach((p: any) => { profMap[p.id] = p.name; });
            const merged = ids.map((id: any) => ({ id, name: profMap[id] || '', reg_no: '—', year: null, section: null, elective_name: electiveRow ? (`${electiveRow.course_code || ''} ${electiveRow.sub_name || ''}`).trim() : null }));
            setModalStudents(merged);
            setShowElectiveModal(true);
            return;
          }
        } catch (ex) {
          console.warn('[MySubjects] direct select fallback failed', ex);
        }
      }

      setModalStudents(normalized);
      setShowElectiveModal(true);
    } catch (e) {
      console.error('viewElectiveStudentsForAdvisor failed', e);
      setModalStudents([]);
      setShowElectiveModal(true);
    }
  };

  // View students in this staff's department who have NOT chosen any sub-elective under the parent
  const viewParentNotChosen = async (parentId: string, parentLabel?: string) => {
    try {
      setModalElective({ id: parentId, name: parentLabel || 'Not chosen' });
      setModalStudents([]);

      if (!profile) throw new Error('No profile');

      // Get elective ids under this parent
      const { data: electRows, error: electErr } = await supabase.from('electives').select('id').eq('parent_subject_id', parentId);
      if (electErr) throw electErr;
      const electiveIds = (electRows || []).map((r: any) => r.id).filter(Boolean);

      if (electiveIds.length === 0) {
        setModalStudents([]);
        setShowElectiveModal(true);
        return;
      }

      // Get advisee student ids (only students where advisor_id = this staff)
      const { data: studs, error: studsErr } = await supabase
        .from('students')
        .select('id, reg_no, year, section')
        .eq('advisor_id', profile.id);
      if (studsErr) throw studsErr;
      const adviseeIds = (studs || []).map((s: any) => s.id).filter(Boolean);

      if (adviseeIds.length === 0) {
        setModalStudents([]);
        setShowElectiveModal(true);
        return;
      }

      // Get student_electives for these advisees to determine what they've chosen
      const { data: se } = await supabase.from('student_electives').select('student_id, elective_id').in('student_id', adviseeIds as any[]);

      const profIds = adviseeIds;
      const { data: profiles } = await supabase.from('profiles').select('id, name').in('id', profIds as any[]);
      const profMap: Record<string, string> = {};
      (profiles || []).forEach((p: any) => { profMap[p.id] = p.name; });

      // Map student -> chosen elective identifiers (could be uuid or course_code)
      const chosenByStudent: Record<string, Set<string>> = {};
      (se || []).forEach((r: any) => {
        if (!r || !r.student_id) return;
        if (!chosenByStudent[r.student_id]) chosenByStudent[r.student_id] = new Set();
        if (r.elective_id) chosenByStudent[r.student_id].add(String(r.elective_id));
      });

      // Collect all chosen identifiers to resolve to elective rows
      const allChosenIds = Array.from(new Set((se || []).map((r:any) => r.elective_id).filter(Boolean).map(String)));
      const isUuid = (v: string) => /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/.test(v);

      // Fetch electives by id (uuid) and by course_code (non-uuid identifiers)
      const chosenElectivesMap: Record<string, any> = {};
      try {
        const uuids = allChosenIds.filter(isUuid);
        const codes = allChosenIds.filter(id => !isUuid(id));
        if (uuids.length > 0) {
          const { data: byId } = await supabase.from('electives').select('id,parent_subject_id,course_code').in('id', uuids as any[]);
          (byId || []).forEach((e: any) => { chosenElectivesMap[e.id] = e; });
        }
        if (codes.length > 0) {
          const { data: byCode } = await supabase.from('electives').select('id,parent_subject_id,course_code').in('course_code', codes as any[]);
          (byCode || []).forEach((e: any) => { if (e && e.course_code) chosenElectivesMap[String(e.course_code)] = e; });
        }
      } catch (err) {
        console.warn('Failed to resolve chosen electives to parent subjects', err);
      }

      // Determine which advisees have chosen any elective whose parent_subject_id === parentId
      const excludedStudentSet = new Set<string>();
      Object.keys(chosenByStudent).forEach(sid => {
        const ids = Array.from(chosenByStudent[sid]);
        for (const ident of ids) {
          const resolved = chosenElectivesMap[ident] || chosenElectivesMap[ident.toString()];
          if (resolved && resolved.parent_subject_id === parentId) {
            excludedStudentSet.add(sid);
            break;
          }
        }
      });

      // Final rows: advisees who are not in excludedStudentSet
      const rows = (studs || []).filter((s: any) => !excludedStudentSet.has(s.id)).map((s: any) => ({ id: s.id, name: profMap[s.id] || '', reg_no: s.reg_no || '—', year: s.year || null, section: s.section || null, elective_name: '—' }));

      // Sort alphabetically
      rows.sort((a: any, b: any) => String(a.name || '').localeCompare(String(b.name || ''), undefined, { sensitivity: 'base' }));

      setModalStudents(rows);
      setShowElectiveModal(true);
    } catch (err) {
      console.error('viewParentNotChosen failed', err);
      setModalStudents([]);
      setShowElectiveModal(true);
    }
  };
  // kept minimal: we only need staff id to fetch their subjects, so don't store unused staff profile

  useEffect(() => {
    if (!profile) return;

    const load = async () => {
      setLoading(true);
      try {
        // Fetch staff row to support subjects assigned by either profile.id or staff.staff_id
        let staffIdentifier: string | null = null;
        try {
          const { data: staffRow } = await supabase.from('staff').select('staff_id, staff_role').eq('id', profile.id).maybeSingle();
          if (staffRow && (staffRow as any).staff_id) staffIdentifier = (staffRow as any).staff_id;
          if (staffRow && (staffRow as any).staff_role) setStaffRole((staffRow as any).staff_role);
        } catch (e) {
          // ignore — fallback to profile.id only
        }

        console.info('[MySubjects] profile.id', profile?.id, 'staffIdentifier', staffIdentifier);
        const isUuid = (v: string) => /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/.test(v);

        // Fetch subjects assigned to this staff by either `staff_id` matching `profile.id` or the staff identifier (only if it's a UUID)
        let subjQuery: any = supabase.from('subjects').select('*')
          .order('department', { ascending: true })
          .order('year', { ascending: true })
          .order('subject_code', { ascending: true });
        if (staffIdentifier && isUuid(staffIdentifier)) {
          subjQuery = subjQuery.or(`staff_id.eq.${profile.id},staff_id.eq.${staffIdentifier}`);
        } else {
          subjQuery = subjQuery.eq('staff_id', profile.id);
        }
        const { data: subjData, error: subjErr } = await subjQuery;

        // Resolve subjects: either from direct query or RPC fallback for non-UUID staff codes
        let resolvedSubjects: Subject[] = [];
        if (subjErr) {
          console.warn('Subjects read error (table may not exist):', subjErr.message || subjErr);
          if (staffIdentifier && !isUuid(staffIdentifier)) {
            try {
              const { data: rpcSubjects, error: rpcErr } = await supabase.rpc('rpc_get_subjects_by_staff_code', { p_staff_code: staffIdentifier });
              if (!rpcErr && rpcSubjects) resolvedSubjects = rpcSubjects as Subject[];
            } catch (e) {
              console.warn('rpc_get_subjects_by_staff_code invocation failed', e);
            }
          }
        } else {
          resolvedSubjects = (subjData || []) as Subject[];
        }
        console.info('[MySubjects] resolvedSubjects count', (resolvedSubjects || []).length);
        setSubjects(resolvedSubjects);

        // Additionally: load electives specifically assigned to this staff — do this even if subjects are empty
        try {
          // Always try to fetch electives assigned by the canonical profile id
          const { data: byProfile } = await supabase.from('electives').select('*').eq('staff_id', profile.id).order('course_code', { ascending: true });
          console.info('[MySubjects] electives by profile count', (byProfile || []).length);
          let electives: any[] = byProfile || [];

          // If a staffIdentifier exists and is non-UUID, also call the RPC to resolve by staff code and merge results
          if (staffIdentifier && !isUuid(staffIdentifier)) {
            try {
              const { data: rpcElectives, error: rpcErr } = await supabase.rpc('rpc_get_electives_by_staff_code', { p_staff_code: staffIdentifier });
              if (!rpcErr && rpcElectives && Array.isArray(rpcElectives)) {
                const seen = new Set(electives.map((e: any) => e.id));
                for (const r of rpcElectives) {
                  if (!seen.has(r.id)) {
                    electives.push(r);
                    seen.add(r.id);
                  }
                }
              }
            } catch (e) {
              console.warn('rpc_get_electives_by_staff_code failed', e);
            }
          } else if (staffIdentifier && isUuid(staffIdentifier)) {
            // staffIdentifier is a UUID but may represent a staff.staff_id stored as UUID; include OR query
            try {
              const electQuery: any = supabase.from('electives').select('*').order('course_code', { ascending: true }).or(`staff_id.eq.${profile.id},staff_id.eq.${staffIdentifier}`);
              const { data: deptElectives } = await electQuery;
              const seen = new Set(electives.map((e: any) => e.id));
              (deptElectives || []).forEach((d: any) => { if (!seen.has(d.id)) electives.push(d); });
              console.info('[MySubjects] merged electives count', electives.length);
            } catch (e) {
              console.warn('electives OR query failed', e);
            }
          }

          console.info('[MySubjects] final electives count', electives.length);
          console.info('[MySubjects] final electives ids', (electives || []).map((x:any) => x.id));

          // fetch parent subjects for nicer display
          const parentIds = Array.from(new Set(electives.map((e: any) => e.parent_subject_id).filter(Boolean)));
          let parentMap: Record<string, any> = {};
          if (parentIds.length > 0) {
            const { data: parents } = await supabase.from('subjects').select('id, name, subject_code').in('id', parentIds);
            (parents || []).forEach((p: any) => { parentMap[p.id] = p; });
          }

          const electiveRows = electives.map((e: any) => ({
            id: e.id,
            course_code: e.course_code,
            name: e.sub_name || (parentMap[e.parent_subject_id] ? `${parentMap[e.parent_subject_id].name} (elective)` : 'Elective'),
            parent: parentMap[e.parent_subject_id] || null,
            department: e.department,
            year: e.year,
            semester: (e.sem ?? e.semester ?? null),
          }));
          setElectivesList(electiveRows);
        } catch (ee) {
          console.warn('Failed to load department electives:', ee);
          setElectivesList([]);
        }

        // end load

        // Also fetch all subjects for this staff's department to support Dept view
        try {
          const deptName = (profile as any).department;
          if (deptName) {
            const { data: deptRows, error: deptErr } = await supabase
              .from('subjects')
              .select('*')
              .in('department', [deptName, 'ALL'])
              .order('year', { ascending: true })
              .order('subject_code', { ascending: true });
            if (!deptErr && Array.isArray(deptRows)) setDeptSubjects(deptRows as Subject[]);
            else if (deptErr) console.warn('[MySubjects] dept subjects load error', deptErr);
          }
        } catch (e) {
          console.warn('[MySubjects] failed to load dept subjects', e);
        }

        // Load all department electives for "All Electives" section
        try {
          const deptName = (profile as any).department;
          if (deptName) {
            let electData: any[] = [];
            try {
              const { data, error } = await supabase.from('electives')
                .select('id, parent_subject_id, course_code, sub_name, credits, department, year, sem, staff_id')
                .in('department', [deptName, 'ALL'])
                .order('course_code', { ascending: true });
              if (error) {
                const msg = String(error?.message || '').toLowerCase();
                if (msg.includes('column') && (msg.includes('sem') || msg.includes('semester'))) {
                  const { data: d2, error: e2 } = await supabase.from('electives')
                    .select('id, parent_subject_id, course_code, sub_name, credits, department, year, staff_id')
                    .in('department', [deptName, 'ALL'])
                    .order('course_code', { ascending: true });
                  if (!e2) electData = d2 || [];
                } else {
                  console.warn('[MySubjects] all electives read error', error);
                }
              } else {
                electData = data || [];
              }
            } catch (ee) {
              console.warn('[MySubjects] all electives query failed', ee);
            }

            let parentMap: Record<string, any> = {};
            // Collect parent ids present in the initial elective data
            const parentIds = Array.from(new Set((electData || []).map((e:any) => e.parent_subject_id).filter(Boolean)));
            if (parentIds.length > 0) {
              try {
                const { data: parents } = await supabase.from('subjects').select('id, name, subject_code, department').in('id', parentIds as any[]);
                (parents || []).forEach((p:any) => { parentMap[p.id] = p; });
              } catch (err) {
                console.warn('[MySubjects] parent subjects lookup failed', err);
              }
            }

            // If any parent subject has department 'ALL', include all sub-electives under
            // that parent regardless of the sub-elective's department (do not block by staff dept)
            try {
              const parentsWithAll = Object.values(parentMap).filter((p: any) => (p.department || '').toString().toUpperCase() === 'ALL').map((p: any) => p.id);
              if (parentsWithAll.length > 0) {
                // Fetch any electives under these parents that we may have missed due to department filter
                const { data: extraElects } = await supabase.from('electives')
                  .select('id, parent_subject_id, course_code, sub_name, credits, department, year, sem, staff_id')
                  .in('parent_subject_id', parentsWithAll as any[])
                  .order('course_code', { ascending: true });

                if (extraElects && extraElects.length > 0) {
                  // Merge extras into electData, avoiding duplicates by id
                  const existingIds = new Set((electData || []).map((e:any) => e.id));
                  (extraElects || []).forEach((ex: any) => {
                    if (!existingIds.has(ex.id)) {
                      (electData as any[]).push(ex);
                    }
                  });
                }
              }
            } catch (err) {
              console.warn('[MySubjects] fetching extra electives for ALL parents failed', err);
            }

            const electRows = (electData || []).map((e:any) => ({
              id: e.id,
              course_code: e.course_code,
              sub_name: e.sub_name || e.course_code,
              parent_subject_id: e.parent_subject_id,
              parent: parentMap[e.parent_subject_id] || null,
              department: e.department,
              year: e.year,
              semester: (e.sem ?? e.semester ?? null),
              staff_id: e.staff_id,
            }));
            setAllDeptElectives(electRows);
          }
        } catch (err) {
          console.warn('[MySubjects] failed to load all dept electives', err);
        }

      } catch (err: any) {
        console.error('Error loading Staff MySubjects:', err);
        setError(err.message || String(err));
      } finally {
        setLoading(false);
      }
    };

    load();
  }, [profile]);

  // Filter subjects by selected semester (used in My Subjects view)
  const filteredSubjects = (subjects || []).filter((s: Subject) => {
    if (filterSem === 'all') return true;
    const subjSem = (s as any).sem ?? (s as any).semester ?? null;
    return subjSem != null && Number(subjSem) === Number(filterSem);
  });

  return (
    <DashboardLayout>
      

      {/* Portal modal placed at top-level so it renders regardless of subjects list */}
      {showElectiveModal && modalElective && typeof document !== 'undefined' && createPortal(
        <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.4)', zIndex: 120000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ backgroundColor: 'white', borderRadius: 8, width: '90%', maxWidth: '800px', padding: 16, boxShadow: '0 8px 32px rgba(0,0,0,0.3)' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
              <h3 style={{ fontSize: 18, fontWeight: 600 }}>Students for {modalElective.name}</h3>
              <button onClick={() => { setShowElectiveModal(false); setModalElective(null); setModalStudents([]); }} style={{ fontSize: 14, color: '#444' }}>Close</button>
            </div>
            <div style={{ maxHeight: '48vh', overflowY: 'auto' }}>
              {modalStudents.length === 0 ? (
                <div style={{ color: '#6b7280' }}>No students have selected this elective.</div>
              ) : (
                <table style={{ width: '100%', fontSize: 14 }}>
                  <thead style={{ background: '#f8fafc', textAlign: 'left', color: '#374151', fontWeight: 600 }}>
                    <tr>
                      <th style={{ padding: '8px 12px' }}>Name</th>
                      <th style={{ padding: '8px 12px' }}>Reg No</th>
                      <th style={{ padding: '8px 12px' }}>Year</th>
                      <th style={{ padding: '8px 12px' }}>Section</th>
                      <th style={{ padding: '8px 12px' }}>Dept</th>
                    </tr>
                  </thead>
                  <tbody>
                    {modalStudents.map((s, i) => (
                      <tr key={s.id || i} style={{ borderTop: '1px solid #eef2f7', background: i % 2 === 0 ? '#fff' : '#f8fafc' }}>
                        <td style={{ padding: '8px 12px' }}>{s.name || s.full_name}</td>
                        <td style={{ padding: '8px 12px' }}>{s.reg_no || s.registration_no || '—'}</td>
                        <td style={{ padding: '8px 12px' }}>{s.year || '—'}</td>
                        <td style={{ padding: '8px 12px' }}>{s.section || '—'}</td>
                        <td style={{ padding: '8px 12px' }}>{s.department || '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        </div>, document.body)
      }

      {/* Advisor: My Class Electives modal (students + chosen elective) */}
      {showClassElectivesModal && typeof document !== 'undefined' && createPortal(
        <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.45)', zIndex: 120002, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ backgroundColor: 'white', borderRadius: 8, width: '92%', maxWidth: '900px', padding: 18, boxShadow: '0 10px 40px rgba(0,0,0,0.35)' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
              <h3 style={{ fontSize: 18, fontWeight: 600 }}>My Class — Students & Chosen Electives</h3>
              <button onClick={() => { setShowClassElectivesModal(false); setClassElectiveStudents([]); }} style={{ fontSize: 14, color: '#444' }}>Close</button>
            </div>
            <div style={{ maxHeight: '60vh', overflowY: 'auto' }}>
              {classElectiveStudents.length === 0 ? (
                <div style={{ color: '#6b7280' }}>No students or no elective selections yet.</div>
              ) : (
                <table style={{ width: '100%', fontSize: 14 }}>
                  <thead style={{ background: '#f8fafc', textAlign: 'left', color: '#374151', fontWeight: 600 }}>
                    <tr>
                      <th style={{ padding: '8px 12px' }}>Name</th>
                      <th style={{ padding: '8px 12px' }}>Reg No</th>
                      <th style={{ padding: '8px 12px' }}>Year</th>
                      <th style={{ padding: '8px 12px' }}>Section</th>
                      <th style={{ padding: '8px 12px' }}>Chosen Elective</th>
                    </tr>
                  </thead>
                  <tbody>
                    {classElectiveStudents.map((s, i) => (
                      <tr key={s.id || i} style={{ borderTop: '1px solid #eef2f7', background: i % 2 === 0 ? '#fff' : '#f8fafc' }}>
                        <td style={{ padding: '8px 12px' }}>{s.name}</td>
                        <td style={{ padding: '8px 12px' }}>{s.reg_no || '—'}</td>
                        <td style={{ padding: '8px 12px' }}>{s.year || '—'}</td>
                        <td style={{ padding: '8px 12px' }}>{s.section || '—'}</td>
                        <td style={{ padding: '8px 12px' }}>{s.elective_name || '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        </div>, document.body)
      }

      <div className="max-w-4xl mx-auto px-4 sm:px-6">
        <div className="mb-4 sm:mb-6">
          <h1 className="text-xl sm:text-2xl lg:text-3xl font-bold text-slate-800">My Subjects</h1>
          <p className="text-sm sm:text-base text-slate-600 mt-1">Subjects assigned to you</p>
        </div>

        <div className="mb-4 flex gap-2">
          <button onClick={() => setViewMode('my')} className={`px-3 py-2 rounded ${viewMode === 'my' ? 'bg-blue-600 text-white' : 'bg-slate-100'}`}>My Subjects</button>
          <button onClick={() => setViewMode('dept')} className={`px-3 py-2 rounded ${viewMode === 'dept' ? 'bg-blue-600 text-white' : 'bg-slate-100'}`}>Dept</button>
          <button onClick={() => setViewMode('allElectives')} className={`px-3 py-2 rounded ${viewMode === 'allElectives' ? 'bg-blue-600 text-white' : 'bg-slate-100'}`}>All Electives</button>
        </div>

        {loading ? (
          <Loader message="Loading subjects..." />
        ) : error ? (
          <div className="bg-red-50 border border-red-200 text-red-700 px-3 py-2 rounded text-sm">{error}</div>
        ) : (
          <div>
            {viewMode === 'my' && (
              <>
                <div className="mb-3 flex items-center gap-3">
                  <label className="text-sm text-slate-700">Semester:</label>
                  <select value={filterSem} onChange={e => setFilterSem(e.target.value)} className="text-sm px-2 py-1 border rounded">
                    <option value="all">All</option>
                    {[1,2,3,4,5,6,7,8].map(n => <option key={n} value={String(n)}>{n}</option>)}
                  </select>
                </div>

                {filteredSubjects.length === 0 ? (
                  <div className="bg-white rounded-xl shadow-lg border border-slate-200 p-4 sm:p-6 text-center">
                    <p className="text-slate-500 text-sm sm:text-base">No subjects assigned to you</p>
                  </div>
                ) : (
                  <>
                    {/* Desktop Table View */}
                    <div className="hidden lg:block bg-white rounded-xl shadow-lg border border-slate-200 overflow-hidden">
                      <table className="w-full text-sm">
                        <thead className="bg-slate-50">
                          <tr className="text-left text-slate-700 font-medium">
                            <th className="py-2 px-3">Code</th>
                            <th className="py-2 px-3">Name</th>
                            <th className="py-2 px-3">Dept</th>
                            <th className="py-2 px-3">Year</th>
                            <th className="py-2 px-3">Section</th>
                            <th className="py-2 px-3">Credits</th>
                          </tr>
                        </thead>
                        <tbody>
                          {filteredSubjects.map((s, idx) => (
                            <tr key={s.id} className={`border-t border-slate-100 ${idx % 2 === 0 ? 'bg-white' : 'bg-slate-50/50'}`}>
                              <td className="py-2 px-3 font-medium text-slate-800">{s.subject_code}</td>
                              <td className="py-2 px-3 text-slate-800">{s.name}</td>
                              <td className="py-2 px-3 text-slate-600">{s.department}</td>
                              <td className="py-2 px-3 text-slate-600">{s.year}</td>
                              <td className="py-2 px-3 text-slate-600">{s.section || '—'}</td>
                              <td className="py-2 px-3 text-slate-600">{s.credits}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>

                    {/* Mobile/Tablet Card View */}
                    <div className="lg:hidden space-y-2">
                      {filteredSubjects.map((s) => (
                        <div key={s.id} className="bg-white rounded-lg border border-slate-200 p-3 shadow-sm">
                          <div className="flex justify-between items-start gap-2 mb-2">
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2">
                                <span className="text-sm font-bold text-slate-800">{s.subject_code}</span>
                                <span className="text-xs px-1.5 py-0.5 bg-blue-100 text-blue-700 rounded font-medium">{s.credits} cr</span>
                              </div>
                              <h3 className="text-sm font-medium text-slate-700 mt-1 truncate">{s.name}</h3>
                            </div>
                          </div>
                          <div className="flex flex-wrap gap-2 text-xs text-slate-600">
                            <span className="bg-slate-100 px-2 py-1 rounded">{s.department}</span>
                            <span className="bg-slate-100 px-2 py-1 rounded">Year {s.year}</span>
                            <span className="bg-slate-100 px-2 py-1 rounded">Sec {s.section || '—'}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </>
                )}

                {/* Electives section (show staff-assigned electives) */}
                <div className="mt-6">
                  <div className="flex items-center justify-between mb-3">
                    <h2 className="text-lg font-semibold text-slate-800">Electives</h2>
                    {profile?.role === 'staff' && staffRole === 'advisor' && (
                      <div>
                        <button className="text-sm px-3 py-1 bg-emerald-600 text-white rounded" onClick={() => viewAdvisorClassElectives()}>My class Electives</button>
                      </div>
                    )}
                  </div>

                  {(() => {
                    const filteredElectives = (electivesList || []).filter((el: any) => {
                      if (filterSem === 'all') return true;
                      const semVal = el.semester ?? null;
                      return semVal !== null && Number(semVal) === Number(filterSem);
                    });

                    return filteredElectives && filteredElectives.length > 0 ? (
                    <div className="bg-white rounded-xl shadow-lg border border-slate-200 p-4">
                      <h3 className="text-md font-medium mb-3">Assigned Electives</h3>
                      <div className="overflow-auto">
                        <table className="w-full text-sm">
                          <thead className="bg-slate-50">
                            <tr className="text-left text-slate-700 font-medium">
                              <th className="py-2 px-3">Code</th>
                              <th className="py-2 px-3">Elective</th>
                              <th className="py-2 px-3">Parent</th>
                              <th className="py-2 px-3">Year</th>
                              <th className="py-2 px-3"> </th>
                            </tr>
                          </thead>
                          <tbody>
                            {filteredElectives.map((e: any, idx: number) => (
                              <tr key={e.id} className={`border-t border-slate-100 ${idx % 2 === 0 ? 'bg-white' : 'bg-slate-50/50'}`}>
                                <td className="py-2 px-3 font-medium text-slate-800">{e.course_code}</td>
                                <td className="py-2 px-3 text-slate-800">{e.name}</td>
                                <td className="py-2 px-3 text-slate-600">{e.parent ? (e.parent.subject_code + ' — ' + e.parent.name) : '—'}</td>
                                <td className="py-2 px-3 text-slate-600">{e.year || '—'}</td>
                                <td className="py-2 px-3 text-right"><button className="text-sm px-2 py-1 bg-blue-600 text-white rounded" onClick={() => viewElectiveStudents(e)}>View Students</button></td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                    ) : (
                      <div className="bg-white rounded-lg border border-slate-200 p-4 text-sm text-slate-500">No electives assigned to you for the selected semester.</div>
                    );
                  })()}
                </div>
              </>
            )}

            {viewMode === 'dept' && (
              <div>
                <div className="mb-3 flex items-center gap-3">
                  <label className="text-sm text-slate-700">Semester:</label>
                  <select value={filterSem} onChange={e => setFilterSem(e.target.value)} className="text-sm px-2 py-1 border rounded">
                    <option value="all">All</option>
                    {[1,2,3,4,5,6,7,8].map(n => <option key={n} value={String(n)}>{n}</option>)}
                  </select>
                </div>

                {deptSubjects.length === 0 ? (
                  <div className="bg-white rounded-xl shadow-lg border border-slate-200 p-4 text-sm text-slate-500">No subjects found for your department.</div>
                ) : (
                  <div>
                    {(() => {
                      const byDept: Record<string, Subject[]> = {};
                      const semVal = filterSem === 'all' ? null : Number(filterSem);
                      (deptSubjects || []).forEach(s => {
                        const subjectSem = (s as any).sem ?? (s as any).semester ?? null;
                        if (semVal !== null && (subjectSem === null || Number(subjectSem) !== semVal)) return;
                        const d = s.department || 'UNKNOWN';
                        if (!byDept[d]) byDept[d] = [];
                        byDept[d].push(s);
                      });
                      return Object.keys(byDept).sort().map(d => (
                        <div key={d} className="mb-4 bg-white rounded-xl shadow-lg border border-slate-200 p-4">
                          <h3 className="text-lg font-semibold mb-3">{d}</h3>
                          <table className="w-full text-sm">
                            <thead>
                              <tr className="text-left text-slate-600">
                                <th className="py-2">Code</th>
                                <th className="py-2">Name</th>
                                <th className="py-2">Year</th>
                                <th className="py-2">Section</th>
                              </tr>
                            </thead>
                            <tbody>
                              {byDept[d].map(s => (
                                <tr key={s.id} className="border-t">
                                  <td className="py-2">{s.subject_code}</td>
                                  <td className="py-2">{s.name}</td>
                                  <td className="py-2">{s.year}</td>
                                  <td className="py-2">{s.section || '-'}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      ));
                    })()}
                  </div>
                )}
              </div>
            )}
            {viewMode === 'allElectives' && (
              <div>
                <div className="mb-3 flex items-center gap-3">
                  <label className="text-sm text-slate-700">Semester:</label>
                  <select value={allElectivesFilterSem} onChange={e => setAllElectivesFilterSem(e.target.value)} className="text-sm px-2 py-1 border rounded">
                    <option value="all">All</option>
                    {[1,2,3,4,5,6,7,8].map(n => <option key={n} value={String(n)}>{n}</option>)}
                  </select>
                </div>

                {(() => {
                  // If the main `filterSem` (My Subjects) is set use it, otherwise fall back to the
                  // local `allElectivesFilterSem`. This makes the All Electives section respect
                  // the semester filter chosen in My Subjects.
                  const activeSem = (filterSem && filterSem !== 'all') ? filterSem : allElectivesFilterSem;
                  const filtered = allDeptElectives.filter((e: any) => {
                    if (activeSem === 'all') return true;
                    const elecSem = e.semester ? Number(e.semester) : null;
                    return elecSem === Number(activeSem);
                  });

                  if (filtered.length === 0) {
                    return <div className="bg-white rounded-lg border border-slate-200 p-4 text-sm text-slate-500">No electives found for this department{allElectivesFilterSem !== 'all' ? ` in semester ${allElectivesFilterSem}` : ''}.</div>;
                  }

                  // Group by parent subject
                  const byParent: Record<string, any[]> = {};
                  filtered.forEach((e: any) => {
                    const pid = e.parent_subject_id || 'none';
                    if (!byParent[pid]) byParent[pid] = [];
                    byParent[pid].push(e);
                  });

                  return (
                    <div className="space-y-4">
                      {Object.keys(byParent).map(pid => (
                        <div key={pid} className="bg-white rounded-xl shadow-lg border border-slate-200 p-4">
                          <div className="mb-3 text-md font-medium text-slate-700 flex items-center justify-between">
                            <div>
                              {pid === 'none' ? 'No Parent Subject' : (byParent[pid][0].parent ? (byParent[pid][0].parent.subject_code + ' — ' + byParent[pid][0].parent.name) : 'Parent Subject')}
                            </div>
                            <div>
                              <button className="text-sm px-3 py-1 bg-amber-500 text-white rounded" onClick={() => viewParentNotChosen(pid, byParent[pid][0].parent ? (byParent[pid][0].parent.subject_code + ' — ' + byParent[pid][0].parent.name) : 'Parent Subject')}>Not chosen</button>
                            </div>
                          </div>
                          <div className="overflow-auto">
                            <table className="w-full text-sm">
                              <thead className="bg-slate-50">
                                <tr className="text-left text-slate-700 font-medium">
                                  <th className="py-2 px-3">Code</th>
                                  <th className="py-2 px-3">Elective Name</th>
                                  <th className="py-2 px-3">Dept</th>
                                  <th className="py-2 px-3">Year</th>
                                  <th className="py-2 px-3">Semester</th>
                                  <th className="py-2 px-3"> </th>
                                </tr>
                              </thead>
                              <tbody>
                                {byParent[pid].map((e: any, idx: number) => (
                                  <tr key={e.id} className={`border-t border-slate-100 ${idx % 2 === 0 ? 'bg-white' : 'bg-slate-50/50'}`}>
                                    <td className="py-2 px-3 font-medium text-slate-800">{e.course_code}</td>
                                    <td className="py-2 px-3 text-slate-800">{e.sub_name || e.course_code}</td>
                                    <td className="py-2 px-3 text-slate-600">{e.department || '—'}</td>
                                    <td className="py-2 px-3 text-slate-600">{e.year || '—'}</td>
                                    <td className="py-2 px-3 text-slate-600">{e.semester || '—'}</td>
                                    <td className="py-2 px-3 text-right">
                                      <button className="text-sm px-2 py-1 bg-blue-600 text-white rounded" onClick={() => viewElectiveStudentsForAdvisor(e)}>View Students</button>
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        </div>
                      ))}
                    </div>
                  );
                })()}
              </div>
            )}          </div>
        )}
      </div>
    </DashboardLayout>
  );
}
