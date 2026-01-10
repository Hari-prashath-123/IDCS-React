import { useEffect, useState } from "react";
import { useAuth } from "../../contexts/AuthContext";
import { useParams, useNavigate, useLocation } from "react-router-dom";
import DashboardLayout from "../../components/DashboardLayout";
import Loader from "../../components/Loader";
import { supabase } from "../../lib/supabase";
import { fetchInChunks } from "../../lib/supabaseHelpers";

interface Subject {
  id: string;
  subject_code: string;
  name: string;
  year: number;
  section: string;
  department: string;
}

export default function ViewStaffTimetable() {
  const { staffId } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const [staffName, setStaffName] = useState<string>("");
  const [department, setDepartment] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [year, setYear] = useState<number | null>(null);
  const [section, setSection] = useState<string | null>(null);
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [ttLoading, setTtLoading] = useState(false);
  const [timetable, setTimetable] = useState<
    Record<string, { subject_id: string | null }>
  >({});
  const [assigned, setAssigned] = useState<
    Record<string, { department: string; year: number; section: string }>
  >({});
  const [assignedSubjects, setAssignedSubjects] = useState<
    Record<string, Subject | null>
  >({});
  const [staffAssignedSubjectsByClass, setStaffAssignedSubjectsByClass] = useState<Record<string, Record<string, true>>>({});
  const [assignedLoading, setAssignedLoading] = useState(false);
  const [selectedDay, setSelectedDay] = useState<number>(1); // 1=Monday, 2=Tuesday, etc.
  const [selectedAssignedDay, setSelectedAssignedDay] = useState<number>(1);
  const computeCurrentSemester = () => {
    const m = new Date().getMonth();
    return m < 6 ? 1 : 2;
  };
  const [semester, setSemester] = useState<number>(computeCurrentSemester());
  // Editing (HOD) states
  const { profile } = useAuth();
  const [editMode, setEditMode] = useState(false);
  const [staffGridEdit, setStaffGridEdit] = useState<Record<string, { year: number | ''; section: string | ''; semester?: number; subject_id?: string | null }>>({});
  const [staffYearSectionOptions, setStaffYearSectionOptions] = useState<Array<{ year: number; section: string }>>([]);
  const [staffSubjectsByClass, setStaffSubjectsByClass] = useState<Record<string, Array<{ id: string; subject_code: string; name: string }>>>({});
  const [savingStaffEdits, setSavingStaffEdits] = useState(false);

  useEffect(() => {
    const loadStaff = async () => {
      if (!staffId) return;
      setLoading(true);
      setError(null);
      setInfo(null);
      try {
        const { data: prof, error: pErr } = await supabase
          .from("profiles")
          .select("id, name, department")
          .eq("id", staffId)
          .maybeSingle();
        if (pErr) throw pErr;
        if (!prof) throw new Error("Staff not found");
        setStaffName((prof as any).name);
        setDepartment((prof as any).department);

        // Get advisor class (if any)
        const { data: st, error: stErr } = await supabase
          .from("staff")
          .select("staff_role, year, section")
          .eq("id", staffId)
          .maybeSingle();
        if (stErr) throw stErr;
        if (!st || st.staff_role !== "advisor" || !st.year || !st.section) {
          setInfo(
            "No class assigned — class timetable not available. Assigned timetable (if any) is shown below."
          );
          setYear(null);
          setSection(null);
        } else {
          setYear(st.year);
          setSection(st.section);
          // Load subjects for mapping only for the advisor's class
                if ((prof as any).department) {
            const { data: subs } = await supabase
              .from("subjects")
              .select("id, subject_code, name, year, section, department")
              .in("department", [(prof as any).department, 'ALL'])
              .eq("year", st.year)
              .or(`section.eq.${st.section},section.eq.ALL`);
            setSubjects((subs || []) as any);
          }
        }
      } catch (e: any) {
        setError(e.message || "Failed to load staff");
      } finally {
        setLoading(false);
      }
    };
    loadStaff();
  }, [staffId]);

  useEffect(() => {
    const loadTt = async () => {
      if (!department || !year || !section) return;
      setTtLoading(true);
      setError(null);
      try {
        const { data, error } = await supabase
          .from("timetables")
          .select("day_of_week, period, subject_id")
          .eq("department", department)
          .eq("year", year)
          .eq("section", section);
        if (error) throw error;
        const m: Record<string, { subject_id: string | null }> = {};
        (data || []).forEach((row: any) => {
          const key = `${row.day_of_week}-${row.period}`;
          m[key] = { subject_id: row.subject_id };
        });
        setTimetable(m);
      } catch (e: any) {
        setError(e.message || "Failed to load timetable");
      } finally {
        setTtLoading(false);
      }
    };
    loadTt();
  }, [department, year, section, semester]);

  // Load staff-assigned timetable (maps staff -> class for each day/period)
  useEffect(() => {
    const loadAssigned = async () => {
      if (!staffId) return;
      setAssignedLoading(true);
      try {
        // Use server RPC to read staff_timetables so HOD can view entries despite RLS
        console.debug('ViewStaffTimetable: staffId', staffId);
        const { data: rows, error } = await supabase.rpc('rpc_get_staff_timetables_for_staff', { p_staff_id: staffId });
        if (error) {
          console.error('ViewStaffTimetable: rpc error', error);
          throw error;
        }
        // normalize rpc rows
        let rpcRows: any[] = [];
        if (!rows) rpcRows = [];
        else if (Array.isArray(rows)) rpcRows = rows as any[];
        else rpcRows = [rows as any];
        console.debug('ViewStaffTimetable: rpcRows count', rpcRows.length);
        // use all RPC rows (do not filter by semester)
        let filteredRows = rpcRows;

        // If RPC empty try direct select as fallback
        if (filteredRows.length === 0) {
          try {
            console.debug('ViewStaffTimetable: RPC empty, trying direct SELECT fallback');
            const { data: directRows, error: directErr } = await supabase
              .from('staff_timetables')
              .select('department, year, section, day_of_week, period, subject_id, semester')
              .eq('staff_id', staffId);
            if (directErr) console.error('ViewStaffTimetable: direct SELECT error', directErr);
            else {
              console.debug('ViewStaffTimetable: directRows', directRows);
              filteredRows = Array.isArray(directRows) ? directRows : (directRows ? [directRows] : []);
            }
          } catch (e) {
            console.error('ViewStaffTimetable: direct SELECT exception', e);
          }
        }
        const assignedMap: Record<string, { department: string; year: number; section: string }> = {};
        // Map keys to the original RPC row so we can prefer staff_timetables.subject_id
        const rowByKey: Record<string, any> = {};
        for (const r of filteredRows as any[]) {
          const key = `${r.day_of_week}-${r.period}`;
          assignedMap[key] = { department: r.department, year: r.year, section: r.section };
          rowByKey[key] = r;
        }

        // Resolve subjects for each assigned slot, preferring staff_timetables.subject_id
        // Build assignedSubjectsMap using only explicit staff_timetables.subject_id values
        const assignedSubjectsMap: Record<string, Subject | null> = {};
        const staffAssignedIds = new Set<string>();
        // 1) subject_id explicitly present on staff_timetables rows
        for (const r of filteredRows as any[]) {
          if (r?.subject_id) staffAssignedIds.add(r.subject_id);
        }
        // 2) subjects table where this staff is the owner for the selected semester
        try {
          const { data: subjOwned } = await supabase
            .from('subjects')
            .select('id')
            .eq('staff_id', staffId);
          (subjOwned || []).forEach((s: any) => { if (s?.id) staffAssignedIds.add(s.id); });
        } catch (e) {
          // ignore
        }
        // 3) electives authored by the staff may map to parent_subject_id
        try {
          const { data: electRows } = await supabase
            .from('electives')
            .select('parent_subject_id')
            .eq('staff_id', staffId);
          (electRows || []).forEach((r: any) => { if (r?.parent_subject_id) staffAssignedIds.add(r.parent_subject_id); });
        } catch (e) {
          // ignore
        }
        const subjectById: Record<string, Subject> = {};
        if (staffAssignedIds.size > 0) {
          try {
            const subjRows = await fetchInChunks('subjects', 'id, subject_code, name, year, section, department', 'id', Array.from(staffAssignedIds));
            (subjRows || []).forEach((s: any) => { subjectById[s.id] = s; });
          } catch (e) {
            // ignore
          }
        }
        for (const key of Object.keys(assignedMap)) {
          const r = rowByKey[key];
          if (r?.subject_id && subjectById[r.subject_id]) {
            assignedSubjectsMap[key] = subjectById[r.subject_id];
          } else {
            assignedSubjectsMap[key] = null;
          }
        }

        setAssigned(assignedMap);
        setAssignedSubjects(assignedSubjectsMap);
        // build map of subject ids the staff is assigned to per class for this semester
        const byClass: Record<string, Record<string, true>> = {};
        for (const key of Object.keys(assignedMap)) {
          const a = assignedMap[key];
          const subj = assignedSubjectsMap[key];
          const clsKey = `${a.year}:${a.section}`;
          if (!byClass[clsKey]) byClass[clsKey] = {};
          if (subj && subj.id) byClass[clsKey][subj.id] = true;
          // also register subject under YEAR:ALL if the subject's section === 'ALL'
          if (subj && subj.section === 'ALL') {
            const allKey = `${a.year}:ALL`;
            if (!byClass[allKey]) byClass[allKey] = {};
            byClass[allKey][subj.id] = true;
          }
        }
        // Also include subjects authored/owned by staff (subjectById) into the appropriate class buckets
        Object.values(subjectById).forEach((s) => {
          if (!s || !s.id) return;
          const cls = `${s.year}:${s.section}`;
          if (!byClass[cls]) byClass[cls] = {};
          byClass[cls][s.id] = true;
          if (s.section === 'ALL') {
            const allKey = `${s.year}:ALL`;
            if (!byClass[allKey]) byClass[allKey] = {};
            byClass[allKey][s.id] = true;
          }
        });
        setStaffAssignedSubjectsByClass(byClass);
        // initialize edit grid from assignedMap (include semester from RPC rows if present)
        const editMap: Record<string, { year: number | ''; section: string | ''; semester?: number; subject_id?: string | null }> = {};
        for (const k of Object.keys(assignedMap)) {
          const a = assignedMap[k];
          const r = rowByKey[k];
          editMap[k] = { year: a.year, section: a.section, semester: r?.semester ?? semester, subject_id: assignedSubjectsMap[k]?.id || null };
        }
        setStaffGridEdit(editMap);
      } catch (e) {
        // non-fatal
      } finally {
        setAssignedLoading(false);
      }
    };
    loadAssigned();
  }, [staffId, semester]);

  // When the common semester changes, update edit map semesters to match
  useEffect(() => {
    setStaffGridEdit((prev) => {
      const out: typeof prev = {} as any;
      for (const k of Object.keys(prev || {})) {
        out[k] = { ...prev[k], semester };
      }
      return out;
    });
  }, [semester]);

  // Load options for editing (year/section combos and subjects map)
  // Only include classes/subjects that this staff is assigned to (so HOD edits mirror admin behaviour)
  useEffect(() => {
    const loadEditOptionsFromAssigned = async () => {
      if (!department) return;
      try {
        const comboSet = new Set<string>();
        Object.values(assigned).forEach((a) => {
          if (a && a.year && a.section) comboSet.add(`${a.year}:${a.section}`);
        });
        let combos = Array.from(comboSet).map((k) => ({ year: Number(k.split(":")[0]), section: k.split(":")[1] }))
          .sort((a, b) => (a.year - b.year) || a.section.localeCompare(b.section));

        // If no assigned combos for this semester, try fallbacks so HOD can still edit
        if (combos.length === 0) {
          try {
            const { data: subjCombos } = await supabase
              .from('subjects')
              .select('year, section')
              .in('department', [department, 'ALL'])
              .eq('semester', semester);
            const fallbackSet = new Set<string>();
            (subjCombos || []).forEach((s: any) => {
              if (s && s.year && s.section) fallbackSet.add(`${s.year}:${s.section}`);
            });
            combos = Array.from(fallbackSet).map((k) => ({ year: Number(k.split(":")[0]), section: k.split(":")[1] }))
              .sort((a, b) => (a.year - b.year) || a.section.localeCompare(b.section));
          } catch (e) {
            console.error('Error loading fallback combos from subjects', e);
          }
        }
        if (combos.length === 0) {
          // final conservative fallback so the table renders for editing
          combos = [{ year: 1, section: 'A' }, { year: 2, section: 'A' }, { year: 3, section: 'A' }];
        }
        setStaffYearSectionOptions(combos);

        // load subjects only for the classes the staff is actually assigned to
        const map: Record<string, Array<{ id: string; subject_code: string; name: string }>> = {};
        for (const c of combos) {
          try {
            const { data: subjRows } = await supabase.from('subjects')
              .select('id, subject_code, name, year, section')
              .eq('year', c.year)
              .eq('semester', semester)
              .or(`section.eq.${c.section},section.eq.ALL`)
              .in('department', [department, 'ALL']);
            (subjRows || []).forEach((s: any) => {
              const key = `${s.year}:${s.section}`;
              if (!map[key]) map[key] = [];
              map[key].push({ id: s.id, subject_code: s.subject_code, name: s.name });
              if (s.section === 'ALL') {
                const allKey = `${s.year}:ALL`;
                if (!map[allKey]) map[allKey] = [];
                map[allKey].push({ id: s.id, subject_code: s.subject_code, name: s.name });
              }
            });
          } catch (e) {
            // ignore per-class failures
          }
        }
        // Ensure subjects map includes any subject ids the staff is assigned to
        try {
          const assignedIds = new Set<string>();
          Object.values(staffAssignedSubjectsByClass).forEach((m) => {
            Object.keys(m || {}).forEach((id) => assignedIds.add(id));
          });
          // collect ids already present in map
          const presentIds = new Set<string>();
          Object.values(map).forEach((arr) => arr.forEach((s) => presentIds.add(s.id)));
          const missing = Array.from(assignedIds).filter(id => !presentIds.has(id));
          if (missing.length > 0) {
            const missingRows = await fetchInChunks('subjects', 'id, subject_code, name, year, section', 'id', missing);
            (missingRows || []).forEach((s: any) => {
              const key = `${s.year}:${s.section}`;
              if (!map[key]) map[key] = [];
              // avoid duplicates
              if (!map[key].some((x) => x.id === s.id)) map[key].push({ id: s.id, subject_code: s.subject_code, name: s.name });
              if (s.section === 'ALL') {
                const allKey = `${s.year}:ALL`;
                if (!map[allKey]) map[allKey] = [];
                if (!map[allKey].some((x) => x.id === s.id)) map[allKey].push({ id: s.id, subject_code: s.subject_code, name: s.name });
              }
            });
          }
        } catch (e) {
          // ignore fetch failures
        }
        setStaffSubjectsByClass(map);
      } catch (e) {
        // ignore
      }
    };
    loadEditOptionsFromAssigned();
  }, [department, assigned]);

  // When HOD enters edit mode and the edit grid is empty, initialize empty cells
  useEffect(() => {
    if (!editMode) return;
    // don't clobber existing edits
    if (Object.keys(staffGridEdit || {}).length > 0) return;
    const initial: Record<string, { year: number | ''; section: string | ''; semester?: number; subject_id?: string | null }> = {};
    for (let d = 1; d <= 5; d++) {
      for (let p = 1; p <= 8; p++) {
        const key = `${d}-${p}`;
        initial[key] = { year: '', section: '', semester: semester, subject_id: null };
      }
    }
    setStaffGridEdit(initial);
  }, [editMode, semester]);

  const setStaffCellEdit = (dayIdx: number, period: number, patch: Partial<{ year: number | ''; section: string | ''; semester?: number; subject_id?: string | null }>) => {
    const key = `${dayIdx+1}-${period}`;
    setStaffGridEdit(g => ({ ...g, [key]: { year: patch.year ?? g[key]?.year ?? '', section: patch.section ?? g[key]?.section ?? '', semester: patch.semester ?? g[key]?.semester ?? 1, subject_id: patch.subject_id ?? (g[key]?.subject_id ?? null) } }));
  };

  const saveStaffEdits = async () => {
    if (!staffId) return;
    setSavingStaffEdits(true);
    try {
      // replace existing rows via SECURITY DEFINER RPC
      // prepare rows with staff_id included
      const rows: any[] = [];
      for (let d = 1; d <=5; d++) {
        for (let p = 1; p <=8; p++) {
          const key = `${d}-${p}`;
          const cell = staffGridEdit[key];
          if (!cell || !cell.year || !cell.section) continue;
          rows.push({ staff_id: staffId, department: department, year: cell.year as number, section: cell.section as string, semester: cell.semester ?? semester, day_of_week: d, period: p, subject_id: cell.subject_id ?? null });
        }
      }
      try {
        const { data: rpcData, error: rpcErr } = await supabase.rpc('rpc_replace_staff_timetables', { p_staff_id: staffId, p_rows: rows });
        console.info('[saveStaffEdits] rpc_replace_staff_timetables response', rpcData, rpcErr);
        if (rpcErr) throw rpcErr;
      } catch (e) {
        console.error('[saveStaffEdits] RPC replace failed', e);
        throw e;
      }
      setEditMode(false);
      // reload assigned mappings and resolve subjects so the view updates
      const { data: rowsReload } = await supabase.rpc('rpc_get_staff_timetables_for_staff', { p_staff_id: staffId });
      const assignedMap: any = {};
      const rowByKey: Record<string, any> = {};
      (rowsReload || []).forEach((r: any) => {
        const key = `${r.day_of_week}-${r.period}`;
        assignedMap[key] = { department: r.department, year: r.year, section: r.section };
        rowByKey[key] = r;
      });
      setAssigned(assignedMap);

      // Resolve subjects for each assigned slot and update assignedSubjects, preferring staff_timetables.subject_id
      const assignedSubjectsMap: Record<string, any> = {};
      for (const key of Object.keys(assignedMap)) {
        try {
          const r = rowByKey[key];
          if (r?.subject_id) {
            const { data: subj } = await supabase.from('subjects').select('id, subject_code, name, year, section, department').eq('id', r.subject_id).maybeSingle();
            assignedSubjectsMap[key] = subj || null;
            continue;
          }

          const [dayStr, periodStr] = key.split('-');
          const dd = parseInt(dayStr, 10);
          const pp = parseInt(periodStr, 10);
          const a = assignedMap[key];
          const sem = r?.semester ?? 1;
          const { data: ttRow } = await supabase
            .from('timetables')
            .select('subject_id')
            .match({ department: a.department, year: a.year, section: a.section, semester: sem, day_of_week: dd, period: pp })
            .maybeSingle();
          if (ttRow?.subject_id) {
            const { data: subj } = await supabase.from('subjects').select('id, subject_code, name, year, section, department').eq('id', ttRow.subject_id).maybeSingle();
            assignedSubjectsMap[key] = subj || null;
          } else {
            assignedSubjectsMap[key] = null;
          }
        } catch (e) {
          assignedSubjectsMap[key] = null;
        }
      }
      setAssignedSubjects(assignedSubjectsMap);
    } catch (e) {
      console.error('saveStaffEdits failed', e);
      alert('Failed to save staff timetable edits: '+ (e as any)?.message || String(e));
    } finally {
      setSavingStaffEdits(false);
    }
  };

  const handleGoBack = () => {
    // Try to go back in history, otherwise fallback to appropriate staff page
    if (window.history.length > 1) {
      navigate(-1);
    } else {
      // Fallback based on current path
      if (location.pathname.startsWith("/hod/")) {
        navigate("/hod/staff");
      } else if (location.pathname.startsWith("/ahod/")) {
        navigate("/ahod/staff");
      } else if (location.pathname.startsWith("/principal/")) {
        navigate("/principal/staff-details");
      } else {
        navigate("/dashboard");
      }
    }
  };

  return (
    <DashboardLayout>
      <div className="max-w-6xl mx-auto px-4 sm:px-6">
        <div className="mb-4 sm:mb-6 flex items-center justify-between">
          <div>
            <h1 className="text-xl sm:text-2xl font-bold text-slate-800">
              Staff Timetable
            </h1>
            {staffName && (
              <p className="text-slate-600 text-sm">
                Staff: {staffName} • Dept: {department}
              </p>
            )}
          </div>
          <button
            onClick={handleGoBack}
            className="text-blue-600 hover:text-blue-700 text-sm"
          >
            Back
          </button>
        </div>

        

        {loading ? (
          <Loader message="Loading..." />
        ) : error ? (
          <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-2 rounded">
            {error}
          </div>
        ) : (
          <>
            {year && section ? (
              <div className="bg-blue-50 rounded-xl border border-blue-200 p-3 mb-4 text-xs sm:text-sm text-slate-700">
                <span className="font-medium">Advisor Class:</span> {department}{" "}
                • Y{year}-{section}
              </div>
            ) : (
              info && (
                <div className="bg-white rounded-xl shadow border border-slate-200 p-4 text-slate-600 text-sm">
                  {info}
                </div>
              )
            )}

            {year && section && (
              <div className="mb-8">
                <h2 className="text-lg font-semibold text-slate-800 mb-2">
                  Class Timetable
                </h2>
                {ttLoading ? (
                  <Loader message="Loading timetable..." />
                ) : (
                  <>
                    {/* Desktop/tablet table */}
                    <div className="hidden sm:block bg-white rounded-xl shadow-lg border border-slate-200 p-3 sm:p-4 overflow-x-auto">
                      <table className="min-w-full table-auto border-collapse text-xs sm:text-sm">
                        <thead>
                          <tr>
                            <th className="w-16 sm:w-20 p-2 border border-slate-200 bg-slate-50 text-left">
                              Period
                            </th>
                            {[
                              "Monday",
                              "Tuesday",
                              "Wednesday",
                              "Thursday",
                              "Friday",
                            ].map((d) => (
                              <th
                                key={d}
                                className="p-2 border border-slate-200 bg-slate-50 text-left"
                              >
                                {d}
                              </th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                            {[1, 2, 3, 4, 5, 6, 7, 8].map((p) => (
                            <tr key={p}>
                              <td className="p-2 border border-slate-200 font-medium">
                                {p}
                              </td>
                              {Array.from({ length: 5 }).map((_, di) => {
                                const key = `${di + 1}-${p}`;
                                const cell = timetable[key];
                                const subj = cell?.subject_id
                                  ? subjects.find(
                                      (s) => s.id === cell.subject_id
                                    )
                                  : null;
                                return (
                                  <td
                                        key={key}
                                        className="p-2 border border-slate-200 align-top whitespace-normal break-words"
                                      >
                                    {subj ? (
                                      <div>
                                        <div className="font-medium">
                                          {subj.subject_code}
                                        </div>
                                        <div className="text-slate-600 text-[10px] sm:text-xs leading-snug">
                                          {subj.name}
                                        </div>
                                      </div>
                                    ) : (
                                      <span className="text-slate-400">—</span>
                                    )}
                                  </td>
                                );
                              })}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>

                    {/* Mobile: day selector and card-based view */}
                    <div className="sm:hidden">
                      {/* Day selector buttons */}
                      <div className="mb-4 flex flex-wrap gap-2">
                        {["MON", "TUE", "WED", "THU", "FRI"].map((day, di) => (
                          <button
                            key={day}
                            onClick={() => setSelectedDay(di + 1)}
                            className={`flex-1 px-3 py-2 rounded-md text-sm font-medium border transition-colors ${
                              selectedDay === di + 1
                                ? "bg-blue-600 text-white border-blue-600"
                                : "bg-white text-slate-700 border-slate-200 hover:bg-slate-50"
                            }`}
                          >
                            {day}
                          </button>
                        ))}
                      </div>

                      {/* Display selected day's timetable */}
                      <div className="bg-white rounded-xl shadow-lg border border-slate-200 p-4">
                        <h3 className="text-lg font-semibold text-slate-800 mb-4">
                          {
                            [
                              "Monday",
                              "Tuesday",
                              "Wednesday",
                              "Thursday",
                              "Friday",
                            ][selectedDay - 1]
                          }
                        </h3>
                        <div className="space-y-3">
                          {[1, 2, 3, 4, 5, 6, 7].map((p) => {
                            const key = `${selectedDay}-${p}`;
                            const cell = timetable[key];
                            const subj = cell?.subject_id
                              ? subjects.find((s) => s.id === cell.subject_id)
                              : null;
                            return (
                              <div
                                key={key}
                                className="flex items-start gap-3 p-3 bg-slate-50 rounded-lg border border-slate-200"
                              >
                                <div className="flex-shrink-0 w-16">
                                  <span className="text-sm font-medium text-slate-700">
                                    Period {p}
                                  </span>
                                </div>
                                <div className="flex-1 min-w-0">
                                  {subj ? (
                                    <div>
                                      <div className="text-sm font-medium text-slate-800">
                                        {subj.subject_code}
                                      </div>
                                      <div className="text-xs text-slate-600 mt-0.5">
                                        {subj.name}
                                      </div>
                                    </div>
                                  ) : (
                                    <span className="text-slate-400 text-sm">
                                      No class scheduled
                                    </span>
                                  )}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    </div>
                  </>
                )}
              </div>
            )}

            <div>
              <div className="flex items-center justify-between mb-2">
                <h2 className="text-lg font-semibold text-slate-800">Assigned Timetable</h2>
                {profile?.role === 'hod' && (
                  <div className="flex items-center gap-2">
                    {!editMode ? (
                      <button onClick={() => setEditMode(true)} className="text-sm px-3 py-1 bg-amber-500 text-white rounded">Edit</button>
                    ) : (
                      <>
                        <button onClick={() => saveStaffEdits()} disabled={savingStaffEdits} className="text-sm px-3 py-1 bg-emerald-600 text-white rounded">{savingStaffEdits ? 'Saving...' : 'Save'}</button>
                        <button onClick={() => { setEditMode(false); /* discard changes */ }} className="text-sm px-3 py-1 bg-slate-200 text-slate-800 rounded">Cancel</button>
                      </>
                    )}
                  </div>
                )}
              </div>
              {assignedLoading ? (
                <Loader message="Loading assigned timetable..." />
              ) : (Object.keys(assigned).length === 0 && !editMode) ? (
                <div className="text-sm text-slate-500">
                  No staff-assigned timetable found for this staff.
                </div>
              ) : (
                <>
                  {/* Desktop/tablet table */}
                  <div className="hidden sm:block bg-white rounded-xl shadow-lg border border-slate-200 p-3 sm:p-4 overflow-x-auto">
                      <table className="min-w-full table-auto border-collapse text-xs sm:text-sm">
                      <thead>
                        <tr>
                          <th className="w-16 sm:w-20 p-2 border border-slate-200 bg-slate-50 text-left">
                            Period
                          </th>
                          {[
                            "Monday",
                            "Tuesday",
                            "Wednesday",
                            "Thursday",
                            "Friday",
                          ].map((d) => (
                            <th
                              key={d}
                              className="p-2 border border-slate-200 bg-slate-50 text-left"
                            >
                              {d}
                            </th>
                          ))}
                        </tr>
                      </thead>
                        <tbody>
                          {[1, 2, 3, 4, 5, 6, 7, 8].map((p) => (
                          <tr key={p}>
                            <td className="p-2 border border-slate-200 font-medium">
                              {p}
                            </td>
                              {Array.from({ length: 5 }).map((_, di) => {
                                const key = `${di + 1}-${p}`;
                                const a = assigned[key];
                                const subj = assignedSubjects[key];
                                // edit mode: show selects (semester is common for the table)
                                if (editMode) {
                                  const cell = staffGridEdit[key] || { year: '', section: '', subject_id: null, semester: semester };
                                  return (
                                    <td key={key} className="p-2 border border-slate-200 align-top whitespace-normal break-words">
                                      <div className="flex flex-col gap-2">
                                        <select
                                          value={cell.year && cell.section ? `${cell.year}:${cell.section}:${cell.semester ?? semester}:::${cell.subject_id ?? '__NONE__'}` : ''}
                                          onChange={(e) => {
                                            const v = e.target.value;
                                            if (!v) { setStaffCellEdit(di, p, { year: '', section: '', semester: semester, subject_id: null }); return; }
                                            const [ysSec, subjPart] = v.split(':::');
                                            const [ys, sec, sem] = ysSec.split(':');
                                            const subj = subjPart === '__NONE__' ? null : subjPart;
                                            setStaffCellEdit(di, p, { year: Number(ys), section: sec, semester: Number(sem) || semester, subject_id: subj });
                                          }}
                                          className="w-full border rounded px-2 py-1 text-sm"
                                        >
                                          <option value="">Year / Section / Subject</option>
                                          {staffYearSectionOptions.map((opt) => {
                                            const keyYS = `${opt.year}:${opt.section}`;
                                            const ysSem = `${opt.year}:${opt.section}:${opt.semester ?? semester}`;
                                            const subjectsFor = staffSubjectsByClass[`${keyYS}`] || [];
                                            const subjectsForAll = staffSubjectsByClass[`${opt.year}:ALL`] || [];
                                            let combined = [...subjectsFor, ...subjectsForAll];
                                                                    // filter to only subjects the staff is assigned to for this specific class in this semester
                                                                    const classKeyYS = `${opt.year}:${opt.section}`;
                                                                    const classSet = staffAssignedSubjectsByClass[classKeyYS] || staffAssignedSubjectsByClass[`${opt.year}:ALL`] || {};
                                                                    if (Object.keys(classSet).length > 0) {
                                                                      combined = combined.filter(s => !!classSet[s.id]);
                                                                    } else {
                                                                      // staff has no assigned subjects for this class+semester -> show none
                                                                      combined = [];
                                                                    }
                                            if (combined.length === 0) {
                                              return (
                                                <option key={`${ysSem}:::__NONE__`} value={`${ysSem}:::__NONE__`}>Y{opt.year}-{opt.section} — (no staff subjects)</option>
                                              );
                                            }
                                            return (
                                              <optgroup key={ysSem} label={`Y${opt.year}-${opt.section}`}>
                                                <option value={`${ysSem}:::__NONE__`}>Use class timetable / none</option>
                                                {combined.map((s) => (
                                                  <option key={`${ysSem}:::${s.id}`} value={`${ysSem}:::${s.id}`}>{s.subject_code} — {s.name}</option>
                                                ))}
                                              </optgroup>
                                            );
                                          })}
                                        </select>
                                      </div>
                                    </td>
                                  );
                                }
                                return (
                                  <td
                                    key={key}
                                    className="p-2 border border-slate-200 align-top whitespace-normal break-words"
                                  >
                                    {a ? (
                                      subj ? (
                                        <div>
                                          <div className="font-medium">
                                            {subj.subject_code}
                                          </div>
                                          <div className="text-slate-600 text-[10px] sm:text-xs leading-snug">
                                            {subj.name}
                                          </div>
                                          <div className="text-[10px] sm:text-xs text-slate-500 mt-1">
                                            {a.department} — Y{a.year}-{a.section}
                                          </div>
                                        </div>
                                      ) : (
                                        <div className="text-xs text-slate-600">
                                          {a.department} — Y{a.year}-{a.section}
                                        </div>
                                      )
                                    ) : (
                                      <span className="text-slate-400">—</span>
                                    )}
                                  </td>
                                );
                              })}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  {/* Mobile: day selector and card-based view */}
                  <div className="sm:hidden">
                    {/* Day selector buttons for assigned timetable */}
                    <div className="mb-4 flex flex-wrap gap-2">
                      {["MON", "TUE", "WED", "THU", "FRI"].map((day, di) => (
                        <button
                          key={day}
                          onClick={() => setSelectedAssignedDay(di + 1)}
                          className={`flex-1 px-3 py-2 rounded-md text-sm font-medium border transition-colors ${
                            selectedAssignedDay === di + 1
                              ? "bg-blue-600 text-white border-blue-600"
                              : "bg-white text-slate-700 border-slate-200 hover:bg-slate-50"
                          }`}
                        >
                          {day}
                        </button>
                      ))}
                    </div>

                    {/* Display selected day's assigned timetable */}
                    <div className="bg-white rounded-xl shadow-lg border border-slate-200 p-4">
                      <h3 className="text-lg font-semibold text-slate-800 mb-4">
                        {
                          [
                            "Monday",
                            "Tuesday",
                            "Wednesday",
                            "Thursday",
                            "Friday",
                          ][selectedAssignedDay - 1]
                        }
                      </h3>
                        <div className="space-y-3">
                        {[1, 2, 3, 4, 5, 6, 7, 8].map((p) => {
                          const key = `${selectedAssignedDay}-${p}`;
                          const a = assigned[key];
                          const subj = assignedSubjects[key];
                          if (editMode) {
                            const cell = staffGridEdit[key] || { year: '', section: '', subject_id: null, semester: semester };
                            return (
                              <div key={key} className="flex flex-col gap-2 p-3 bg-slate-50 rounded-lg border border-slate-200">
                                <div className="flex items-center justify-between">
                                  <div className="text-sm font-medium text-slate-700">Period {p}</div>
                                </div>
                                <div className="flex flex-col gap-2">
                                  <select
                                    className="w-full border rounded px-2 py-1 text-sm"
                                    value={cell.year && cell.section ? `${cell.year}:${cell.section}:${cell.semester ?? semester}:::${cell.subject_id ?? '__NONE__'}` : ''}
                                    onChange={(e) => {
                                      const v = e.target.value;
                                      if (!v) { setStaffCellEdit(selectedAssignedDay - 1, p, { year: '', section: '', semester: semester, subject_id: null }); return; }
                                      const [ysSec, subjPart] = v.split(':::');
                                      const [yy, sec, sem] = ysSec.split(':');
                                      const subj = subjPart === '__NONE__' ? null : subjPart;
                                      setStaffCellEdit(selectedAssignedDay - 1, p, { year: Number(yy), section: sec, semester: Number(sem) || semester, subject_id: subj });
                                    }}
                                  >
                                    <option value="">Year / Section / Subject</option>
                                    {staffYearSectionOptions.map((opt) => {
                                      const keyYS = `${opt.year}:${opt.section}`;
                                      const ysSem = `${opt.year}:${opt.section}:${opt.semester ?? semester}`;
                                      const subjectsFor = staffSubjectsByClass[`${keyYS}`] || [];
                                      const subjectsForAll = staffSubjectsByClass[`${opt.year}:ALL`] || [];
                                      const combined = [...subjectsFor, ...subjectsForAll];
                                      if (combined.length === 0) {
                                        return (
                                          <option key={`${ysSem}:::__NONE__`} value={`${ysSem}:::__NONE__`}>Y{opt.year}-{opt.section} — (no staff subjects)</option>
                                        );
                                      }
                                      return (
                                        <optgroup key={ysSem} label={`Y${opt.year}-${opt.section}`}>
                                          <option value={`${ysSem}:::__NONE__`}>Use class timetable / none</option>
                                          {combined.map((s) => (
                                            <option key={`${ysSem}:::${s.id}`} value={`${ysSem}:::${s.id}`}>{s.subject_code} — {s.name}</option>
                                          ))}
                                        </optgroup>
                                      );
                                    })}
                                  </select>
                                </div>
                              </div>
                            );
                          }
                          return (
                            <div
                              key={key}
                              className="flex items-start gap-3 p-3 bg-slate-50 rounded-lg border border-slate-200"
                            >
                              <div className="flex-shrink-0 w-16">
                                <span className="text-sm font-medium text-slate-700">
                                  Period {p}
                                </span>
                              </div>
                              <div className="flex-1 min-w-0">
                                {a ? (
                                  subj ? (
                                    <div>
                                      <div className="text-sm font-medium text-slate-800">
                                        {subj.subject_code}
                                      </div>
                                      <div className="text-xs text-slate-600 mt-0.5">
                                        {subj.name}
                                      </div>
                                      <div className="text-[10px] text-slate-500 mt-1">
                                        {a.department} • Y{a.year}-{a.section}
                                      </div>
                                    </div>
                                  ) : (
                                    <div className="text-xs text-slate-600">
                                      {a.department} • Y{a.year}-{a.section}
                                    </div>
                                  )
                                ) : (
                                  <span className="text-slate-400 text-sm">
                                    No assignment
                                  </span>
                                )}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                </>
              )}
            </div>
          </>
        )}
      </div>
    </DashboardLayout>
  );
}
