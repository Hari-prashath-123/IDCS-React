import { useEffect, useMemo, useState } from 'react';
import DashboardLayout from '../../components/DashboardLayout';
import { useAuth } from '../../contexts/AuthContext';
import { supabase } from '../../lib/supabase';
import Loader from '../../components/Loader';

type TTCell = {
  subject_id: string | null;
};

type TimetableRow = {
  id?: string;
  department: string;
  year: number;
  section: string;
  day_of_week: number; // 1=Mon .. 5=Fri
  period: number; // 1..7
  subject_id: string | null;
};

const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'];
const PERIODS = [1, 2, 3, 4, 5, 6, 7];

export default function AdminTimetablePage() {
  useAuth(); // ensure route protection; no direct usage needed here

  const [department, setDepartment] = useState('');
  const [year, setYear] = useState<number | ''>('');
  const [section, setSection] = useState('');
  const [semester, setSemester] = useState<number>(1);

  const [departments, setDepartments] = useState<string[]>([]);
  const [sections, setSections] = useState<string[]>([]);
  const [subjects, setSubjects] = useState<Array<{ id: string; subject_code: string; name: string }>>([]);

  const [grid, setGrid] = useState<Record<string, TTCell>>({});
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [selectedDay, setSelectedDay] = useState<number>(1);

  // Staff timetable state
  const [staffList, setStaffList] = useState<Array<{ id: string; name: string; department: string | null }>>([]);
  const [selectedStaff, setSelectedStaff] = useState<string>('');
  const [staffDept, setStaffDept] = useState<string>('');
  const [staffYearSectionOptions, setStaffYearSectionOptions] = useState<Array<{ year: number; section: string }>>([]);
  const [staffGrid, setStaffGrid] = useState<Record<string, { year: number | ''; section: string | ''; subject_id?: string | null }>>({});
  const [staffLoading, setStaffLoading] = useState(false);
  const [staffSaving, setStaffSaving] = useState(false);
  const [staffError, setStaffError] = useState<string | null>(null);
  const [staffMessage, setStaffMessage] = useState<string | null>(null);
  const [staffSubjectsByClass, setStaffSubjectsByClass] = useState<Record<string, Array<{ id: string; subject_code: string; name: string }>>>({});
  const [selectedAssignedDay, setSelectedAssignedDay] = useState<number>(1);

  // Fetch departments from subjects (fallback to profiles if needed)
  useEffect(() => {
    const loadDepartments = async () => {
      try {
        // Prefer subjects, as they’re tied to course data
        const { data: subjDeps } = await supabase.from('subjects').select('department').not('department', 'is', null);
        const setDep = new Set<string>((subjDeps || []).map((r: any) => r.department).filter(Boolean));
        if (setDep.size === 0) {
          const { data: profDeps } = await supabase.from('profiles').select('department').not('department', 'is', null);
          (profDeps || []).forEach((r: any) => setDep.add(r.department));
        }
        setDepartments(Array.from(setDep).sort());
      } catch (e) {
        console.error('Error loading departments', e);
      }
    };
    loadDepartments();
  }, []);

  // Discover sections when department + year selected
  useEffect(() => {
    const loadSections = async () => {
      setSections([]);
      if (!department || !year) return;
      try {
        // discover from students first
        const { data: stuRows } = await supabase
          .from('students')
          .select('section')
          .in('id', (
            await supabase.from('profiles').select('id').eq('department', department)
          ).data?.map((p: any) => p.id) || []);
        const secSet = new Set<string>((stuRows || []).map((r: any) => r.section).filter(Boolean));
        // also include sections present in subjects for this dept/year
        const { data: subjRows } = await supabase
          .from('subjects')
          .select('section')
          .eq('department', department)
          .eq('year', year);
        (subjRows || []).forEach((r: any) => secSet.add(r.section));
        const secs = Array.from(secSet).sort();
        setSections(secs);
        if (secs.length > 0 && !secs.includes(section)) setSection(secs[0]);
      } catch (e) {
        console.error('Error loading sections', e);
      }
    };
    loadSections();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [department, year]);

  // Load subjects for selection
  useEffect(() => {
    const loadSubjects = async () => {
      setSubjects([]);
      if (!department || !year || !section) return;
      try {
        // Include subjects for this dept/year/section AND main electives
        // Main electives are stored with subject_type='elective' and a sentinel section (e.g. 'ALL')
        // so query subjects where department/year match and (section = selected OR subject_type = 'elective')
        const { data } = await supabase
          .from('subjects')
          .select('id, subject_code, name')
          .in('department', [department, 'ALL'])
          .eq('year', year)
          .or(`section.eq.${section},subject_type.eq.elective`)
          .order('subject_code', { ascending: true });
        setSubjects((data || []) as any);
      } catch (e) {
        console.error('Error loading subjects', e);
      }
    };
    loadSubjects();
  }, [department, year, section]);

  // Load current timetable grid
  const canLoadGrid = department && year && section;
  useEffect(() => {
    const loadGrid = async () => {
      setGrid({});
      setMessage(null);
      setError(null);
      if (!canLoadGrid) return;
      setLoading(true);
      try {
        const { data, error } = await supabase
          .from('timetables')
          .select('id, department, year, section, day_of_week, period, subject_id')
          .eq('department', department)
          .eq('year', year)
          .eq('section', section);
        if (error) throw error;
        const m: Record<string, TTCell> = {};
        (data || []).forEach((row: any) => {
          const key = `${row.day_of_week}-${row.period}`;
          m[key] = { subject_id: row.subject_id };
        });
        setGrid(m);
      } catch (e: any) {
        setError(e.message || 'Failed to load timetable');
      } finally {
        setLoading(false);
      }
    };
    loadGrid();
  }, [canLoadGrid, department, year, section]);

  useMemo(() => {
    // build once in case of future use; currently not needed in UI
    const map: Record<string, { code: string; name: string }> = {};
    subjects.forEach((s) => (map[s.id] = { code: s.subject_code, name: s.name }));
    return map;
  }, [subjects]);

  const setCell = (dayIdx: number, period: number, subject_id: string | null) => {
    const key = `${dayIdx + 1}-${period}`; // day_of_week 1..5
    setGrid((g) => ({ ...g, [key]: { subject_id } }));
  };

  const save = async () => {
    if (!canLoadGrid) return;
    setSaving(true);
    setError(null);
    setMessage(null);
    try {
      // Prepare upserts for all defined cells (including cleared ones with null subject_id)
      const rows: TimetableRow[] = [];
      const clearedPeriods: { day: number; period: number }[] = [];
      const assignedPeriods: { day: number; period: number; subject_id: string }[] = [];
      
      for (let d = 1; d <= 5; d++) {
        for (const p of PERIODS) {
          const key = `${d}-${p}`;
          const cell = grid[key];
          if (!cell) continue;
          
          rows.push({
            department,
            year: year as number,
            section,
            day_of_week: d,
            period: p,
            subject_id: cell.subject_id || null,
          });
          
          // Track cleared periods (null subject_id)
          if (cell.subject_id === null) {
            clearedPeriods.push({ day: d, period: p });
          } else {
            // Track assigned periods with subject_id
            assignedPeriods.push({ day: d, period: p, subject_id: cell.subject_id });
          }
        }
      }

      if (rows.length === 0) {
        setMessage('Nothing to save.');
        return;
      }

      const { error } = await supabase.from('timetables').upsert(rows, {
        onConflict: 'department,year,section,day_of_week,period',
      });
      if (error) throw error;

      // Debug: log what we're about to delete/insert for staff_timetables
      console.debug('[Timetable.save] clearedPeriods:', clearedPeriods, 'assignedPeriods:', assignedPeriods);

      // Delete staff_timetables entries for cleared periods
      if (clearedPeriods.length > 0) {
        for (const { day, period } of clearedPeriods) {
          await supabase
            .from('staff_timetables')
            .delete()
            .eq('department', department)
            .eq('year', year as number)
            .eq('section', section)
            .eq('day_of_week', day)
            .eq('period', period);
        }
      }

      // NOTE: We no longer infer or write `staff_timetables` rows from
      // `subjects.staff_id` when saving the class timetable. Staff
      // assignments are managed separately via the Staff Timetable UI.
      // We still clear any staff_timetables entries for explicitly cleared
      // periods above, but we avoid inserting/updating staff rows here to
      // prevent accidental overwrites when a subject's `staff_id` differs
      // or when a staff teaches multiple subjects in the same class.

      setMessage('Timetable saved successfully. Staff timetables updated.');
    } catch (e: any) {
      setError(e.message || 'Failed to save timetable');
    } finally {
      setSaving(false);
    }
  };

  // -------- Staff Timetable helpers --------
  useEffect(() => {
    const loadStaff = async () => {
      try {
        const { data } = await supabase.from('profiles').select('id, name, department').eq('role', 'staff').order('name', { ascending: true });
        setStaffList((data || []) as any);
      } catch (e) {
        console.error('Error loading staff list', e);
      }
    };
    loadStaff();
  }, []);

  useEffect(() => {
    const initStaff = async () => {
      setStaffError(null);
      setStaffMessage(null);
  setStaffGrid({});
  setStaffYearSectionOptions([]);
      setStaffDept('');
      if (!selectedStaff) return;
      setStaffLoading(true);
      try {
        const staff = staffList.find(s => s.id === selectedStaff);
        const dept = staff?.department || '';
        setStaffDept(dept);

        // discover year/section combinations across dept from students and subjects
        if (dept) {
          const comboSet = new Set<string>(); // key as `${year}:${section}`
          const { data: pids } = await supabase.from('profiles').select('id').eq('department', dept);
          const ids = (pids || []).map((p: any) => p.id);
          if (ids.length) {
            const { data: stu } = await supabase.from('students').select('year, section').in('id', ids);
            (stu || []).forEach((r: any) => (r.year && r.section) && comboSet.add(`${r.year}:${r.section}`));
          }
          const { data: subj } = await supabase.from('subjects').select('year, section').in('department', [dept, 'ALL']);
          (subj || []).forEach((r: any) => (r.year && r.section) && comboSet.add(`${r.year}:${r.section}`));
          const combos = Array.from(comboSet)
            .map((k) => ({ year: Number(k.split(':')[0]), section: k.split(':')[1] }))
            .sort((a, b) => (a.year - b.year) || a.section.localeCompare(b.section));
          setStaffYearSectionOptions(combos);
        }

        // Load existing staff timetable rows (include subject_id)
        const { data: rows } = await supabase
          .from('staff_timetables')
          .select('day_of_week, period, year, section, subject_id')
          .eq('staff_id', selectedStaff);
        const m: Record<string, { year: number | ''; section: string | ''; subject_id?: string | null }> = {};
        (rows || []).forEach((r: any) => {
          const key = `${r.day_of_week}-${r.period}`;
          m[key] = { year: r.year, section: r.section, subject_id: r.subject_id || null };
        });
        setStaffGrid(m);

        // Pre-load subjects for this staff's department so we can show subject options per class cell
        try {
          const { data: subjRows } = await supabase
            .from('subjects')
            .select('id, subject_code, name, year, section, staff_id')
            .in('department', [dept, 'ALL']);

          // Also include parent subjects where this staff teaches a subelective
          const { data: electRows } = await supabase
            .from('electives')
            .select('parent_subject_id')
            .eq('staff_id', selectedStaff);
          const parentIds = (electRows || []).map((r: any) => r.parent_subject_id).filter(Boolean as any) as string[];

          const map: Record<string, Array<{ id: string; subject_code: string; name: string }>> = {};
          (subjRows || []).forEach((s: any) => {
            // include subjects where staff is explicitly assigned OR this staff has a subelective under the parent
            if (String(s.staff_id) === String(selectedStaff) || parentIds.includes(s.id)) {
              const key = `${s.year}:${s.section}`;
              if (!map[key]) map[key] = [];
              map[key].push({ id: s.id, subject_code: s.subject_code, name: s.name });
              // also store under year:ALL to help electives/main entries
              if (s.section === 'ALL') {
                const allKey = `${s.year}:ALL`;
                if (!map[allKey]) map[allKey] = [];
                map[allKey].push({ id: s.id, subject_code: s.subject_code, name: s.name });
              }
            }
          });
          setStaffSubjectsByClass(map);
        } catch (e) {
          setStaffSubjectsByClass({});
        }
      } catch (e: any) {
        setStaffError(e.message || 'Failed to load staff timetable');
      } finally {
        setStaffLoading(false);
      }
    };
    initStaff();
  }, [selectedStaff, staffList]);

  const setStaffCell = (dayIdx: number, period: number, patch: Partial<{ year: number | ''; section: string | ''; subject_id?: string | null }>) => {
    const key = `${dayIdx + 1}-${period}`;
    setStaffGrid((g) => ({ ...g, [key]: { year: patch.year ?? g[key]?.year ?? '', section: patch.section ?? g[key]?.section ?? '', subject_id: patch.subject_id ?? (g[key]?.subject_id ?? null) } }));
  };

  const saveStaff = async () => {
    if (!selectedStaff || !staffDept) return;
    setStaffSaving(true);
    setStaffError(null);
    setStaffMessage(null);
    try {
      // First, delete all existing entries for this staff to start fresh
      console.debug('[Timetable.saveStaff] deleting existing staff_timetables for', selectedStaff);
      await supabase
        .from('staff_timetables')
        .delete()
        .eq('staff_id', selectedStaff);

      // Then insert only the filled cells. For each staff slot, try to
      // determine which `subject_id` is scheduled for that class slot in the
      // `timetables` table and include it on the staff_timetables row so we
      // remember which subject the staff teaches in that slot.
      const rows: Array<{ staff_id: string; department: string; year: number; section: string; day_of_week: number; period: number; subject_id?: string | null }> = [];
      for (let d = 1; d <= 5; d++) {
        for (const p of PERIODS) {
          const key = `${d}-${p}`;
          const cell = staffGrid[key];
          if (!cell || !cell.year || !cell.section) continue;

          // Fetch the subject scheduled for this class slot, if any
          try {
            if (cell.subject_id) {
              rows.push({ staff_id: selectedStaff, department: staffDept, year: cell.year as number, section: cell.section as string, day_of_week: d, period: p, subject_id: cell.subject_id });
            } else {
              const { data: ttRow } = await supabase
                .from('timetables')
                .select('subject_id')
                .match({ department: staffDept, year: cell.year as number, section: cell.section as string, day_of_week: d, period: p })
                .maybeSingle();
              rows.push({ staff_id: selectedStaff, department: staffDept, year: cell.year as number, section: cell.section as string, day_of_week: d, period: p, subject_id: ttRow?.subject_id || null });
            }
          } catch (e) {
            // If fetching timetable fails, still insert the staff row without subject_id
            rows.push({ staff_id: selectedStaff, department: staffDept, year: cell.year as number, section: cell.section as string, day_of_week: d, period: p, subject_id: cell.subject_id ?? null });
          }
        }
      }

      if (rows.length > 0) {
        console.debug('[Timetable.saveStaff] inserting rows:', rows);
        const { error } = await supabase.from('staff_timetables').insert(rows);
        if (error) throw error;
        console.debug('[Timetable.saveStaff] insert completed');
      }
      
      setStaffMessage('Staff timetable saved successfully.');
    } catch (e: any) {
      setStaffError(e.message || 'Failed to save staff timetable');
    } finally {
      setStaffSaving(false);
    }
  };

  return (
    <DashboardLayout>
      <div className="max-w-7xl mx-auto">
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-slate-800">Timetable</h1>
          <p className="text-slate-600">Set subjects for each period (Mon–Fri) by department, year and section.</p>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-4 mb-6 grid grid-cols-1 md:grid-cols-5 gap-4">
          <div>
            <label className="block text-sm text-slate-600 mb-1">Department</label>
            <select className="w-full border rounded-lg p-2" value={department} onChange={(e) => setDepartment(e.target.value)}>
              <option value="">Select</option>
              {departments.map((d) => (
                <option key={d} value={d}>{d}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm text-slate-600 mb-1">Year</label>
            <select className="w-full border rounded-lg p-2" value={year} onChange={(e) => setYear(e.target.value ? Number(e.target.value) : '')}>
              <option value="">Select</option>
              {[1,2,3,4,5,6].map((y) => (
                <option key={y} value={y}>{y}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm text-slate-600 mb-1">Section</label>
            <select className="w-full border rounded-lg p-2" value={section} onChange={(e) => setSection(e.target.value)}>
              <option value="">Select</option>
              {sections.map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm text-slate-600 mb-1">Semester</label>
            <select className="w-full border rounded-lg p-2" value={semester} onChange={(e) => setSemester(Number(e.target.value))}>
              {[1,2,3,4,5,6,7,8].map(s => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
          </div>
          <div className="flex items-end">
            <button
              className="w-full bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg disabled:opacity-50"
              onClick={save}
              disabled={!canLoadGrid || saving}
            >
              {saving ? 'Saving...' : 'Save' }
            </button>
          </div>
        </div>

        {!canLoadGrid ? (
          <div className="text-slate-600">Select department, year and section to load the timetable.</div>
        ) : loading ? (
          <Loader message="Loading timetable..." />
        ) : (
          <>
            {/* Desktop/tablet table */}
            <div className="hidden sm:block bg-white border border-slate-200 rounded-xl p-4 overflow-x-auto">
              {error && <div className="text-red-600 mb-3 text-sm">{error}</div>}
              {message && <div className="text-emerald-700 mb-3 text-sm">{message}</div>}

              <table className="min-w-full table-auto border-collapse">
                <thead>
                  <tr>
                    <th className="w-24 p-2 border border-slate-200 bg-slate-50 text-left text-sm">Period</th>
                    {DAYS.map((d) => (
                      <th key={d} className="p-2 border border-slate-200 bg-slate-50 text-left text-sm">{d}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {PERIODS.map((p) => (
                    <tr key={p}>
                      <td className="p-2 border border-slate-200 text-sm font-medium">{p}</td>
                      {DAYS.map((_, di) => {
                        const key = `${di + 1}-${p}`;
                        const cell = grid[key] || { subject_id: null };
                        return (
                          <td key={key} className="p-2 border border-slate-200 align-top whitespace-normal break-words">
                              <div className="flex items-center gap-2">
                                <select
                                  className="w-full max-w-full border rounded-lg p-2 text-sm"
                                  value={cell.subject_id || ''}
                                  onChange={(e) => setCell(di, p, e.target.value || null)}
                                >
                                <option value="">-- Empty --</option>
                                {subjects.map((s) => (
                                  <option key={s.id} value={s.id}>{s.subject_code} — {s.name}</option>
                                ))}
                              </select>
                              {cell.subject_id && (
                                <button
                                  className="text-xs text-slate-600 hover:text-red-600"
                                  onClick={() => setCell(di, p, null)}
                                  title="Clear"
                                >
                                  Clear
                                </button>
                              )}
                            </div>
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Mobile: day selector and card-based view for class timetable */}
            <div className="sm:hidden">
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

              <div className="bg-white rounded-xl shadow-lg border border-slate-200 p-4">
                <h3 className="text-lg font-semibold text-slate-800 mb-4">
                  {
                    ["Monday","Tuesday","Wednesday","Thursday","Friday"][selectedDay - 1]
                  }
                </h3>
                <div className="space-y-3">
                  {PERIODS.map((p) => {
                    const key = `${selectedDay}-${p}`;
                    const cell = grid[key] || { subject_id: null };
                    return (
                      <div key={key} className="flex items-start gap-3 p-3 bg-slate-50 rounded-lg border border-slate-200">
                        <div className="flex-shrink-0 w-16">
                          <span className="text-sm font-medium text-slate-700">Period {p}</span>
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <select
                              className="w-full border rounded-lg p-2 text-sm"
                              value={cell.subject_id || ''}
                              onChange={(e) => setCell(selectedDay - 1, p, e.target.value || null)}
                            >
                              <option value="">-- Empty --</option>
                              {subjects.map((s) => (
                                <option key={s.id} value={s.id}>{s.subject_code} — {s.name}</option>
                              ))}
                            </select>
                            {cell.subject_id && (
                              <button className="text-xs text-slate-600 hover:text-red-600" onClick={() => setCell(selectedDay - 1, p, null)} title="Clear">Clear</button>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          </>
        )}
        
        <div className="mt-10">
          <div className="mb-4">
            <h2 className="text-xl font-semibold text-slate-800">Staff Timetable Assignments</h2>
            <p className="text-slate-600">Assign which class (year/section) a staff handles in each hour (Mon–Fri).</p>
          </div>

          <div className="bg-white border border-slate-200 rounded-xl p-4 mb-4 grid grid-cols-1 md:grid-cols-4 gap-4">
            <div className="md:col-span-2">
              <label className="block text-sm text-slate-600 mb-1">Staff</label>
              <select
                className="w-full border rounded-lg p-2"
                value={selectedStaff}
                onChange={(e) => setSelectedStaff(e.target.value)}
              >
                <option value="">Select staff</option>
                {staffList.map((s) => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm text-slate-600 mb-1">Department</label>
              <input className="w-full border rounded-lg p-2 bg-slate-50" value={staffDept || ''} readOnly />
            </div>
            <div className="flex items-end">
              <button
                className="w-full bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg disabled:opacity-50"
                onClick={saveStaff}
                disabled={!selectedStaff || !staffDept || staffSaving}
              >
                {staffSaving ? 'Saving...' : 'Save'}
              </button>
            </div>
          </div>

          {!selectedStaff ? (
            <div className="text-slate-600">Select a staff member to load their timetable.</div>
          ) : staffLoading ? (
            <Loader message="Loading staff timetable..." />
          ) : !staffDept ? (
            <div className="text-amber-700">Selected staff has no department assigned.</div>
          ) : (<>
            <div className="hidden sm:block bg-white border border-slate-200 rounded-xl p-4 overflow-x-auto">
              {staffError && <div className="text-red-600 mb-3 text-sm">{staffError}</div>}
              {staffMessage && <div className="text-emerald-700 mb-3 text-sm">{staffMessage}</div>}

              {staffYearSectionOptions.length === 0 && (
                <div className="text-sm text-slate-600 mb-3">No year/section combinations discovered for this department yet.</div>
              )}

              <table className="min-w-full table-auto border-collapse">
                <thead>
                  <tr>
                    <th className="w-24 p-2 border border-slate-200 bg-slate-50 text-left text-sm">Period</th>
                    {DAYS.map((d) => (
                      <th key={d} className="p-2 border border-slate-200 bg-slate-50 text-left text-sm">{d}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {PERIODS.map((p) => (
                    <tr key={p}>
                      <td className="p-2 border border-slate-200 text-sm font-medium">{p}</td>
                      {DAYS.map((_, di) => {
                        const key = `${di + 1}-${p}`;
                        const cell = staffGrid[key] || { year: '', section: '' };
                        return (
                          <td key={key} className="p-2 border border-slate-200 align-top whitespace-normal break-words">
                                <div className="flex flex-col sm:flex-row gap-2 items-start sm:items-center w-full">
                                  <div className="w-full">
                                {/* Combined selector: selects class (year:section) and subject in one control.
                                    Value format: `${year}:${section}:::${subjectId || '__NONE__'}`. */}
                                <select
                                  className="w-full max-w-full border rounded-lg p-2 text-sm"
                                  value={cell.year && cell.section ? `${cell.year}:${cell.section}:::${cell.subject_id ?? '__NONE__'}` : ''}
                                  onChange={(e) => {
                                    const v = e.target.value;
                                    if (!v) {
                                      setStaffCell(di, p, { year: '', section: '', subject_id: null });
                                      return;
                                    }
                                    const [ysSec, subjPart] = v.split(':::');
                                    const [ys, sec] = ysSec.split(':');
                                    const subj = subjPart === '__NONE__' ? null : subjPart;
                                    setStaffCell(di, p, { year: Number(ys), section: sec, subject_id: subj });
                                  }}
                                >
                                  <option value="">Year / Section / Subject</option>
                                  {staffYearSectionOptions.map((opt) => {
                                    const key = `${opt.year}:${opt.section}`;
                                    const subjectsFor = staffSubjectsByClass[`${key}`] || [];
                                    const subjectsForAll = staffSubjectsByClass[`${opt.year}:ALL`] || [];
                                    const combined = [...subjectsFor, ...subjectsForAll];
                                    if (combined.length === 0) {
                                      return (
                                        <option key={`${key}:::__NONE__`} value={`${key}:::__NONE__`}>{opt.year} - {opt.section} — (no staff subjects)</option>
                                      );
                                    }
                                    return (
                                      <optgroup key={key} label={`${opt.year} - ${opt.section}`}>
                                        <option value={`${key}:::__NONE__`}>{opt.year} - {opt.section} — Use class timetable / none</option>
                                        {combined.map((s) => (
                                          <option key={`${key}:::${s.id}`} value={`${key}:::${s.id}`}>{s.subject_code || s.id} — {s.name}</option>
                                        ))}
                                      </optgroup>
                                    );
                                  })}
                                </select>
                              </div>
                              {(cell.year || cell.section) && (
                                <button
                                  className="text-xs text-slate-600 hover:text-red-600"
                                  onClick={() => setStaffCell(di, p, { year: '', section: '', subject_id: null })}
                                  title="Clear"
                                >
                                  Clear
                                </button>
                              )}
                            </div>
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

              {/* Mobile: day selector and card-based view for staff assignments */}
              <div className="sm:hidden">
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

                <div className="bg-white rounded-xl shadow-lg border border-slate-200 p-4">
                  <h3 className="text-lg font-semibold text-slate-800 mb-4">
                    {
                      ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"][
                        selectedAssignedDay - 1
                      ]
                    }
                  </h3>
                  <div className="space-y-3">
                    {PERIODS.map((p) => {
                      const key = `${selectedAssignedDay}-${p}`;
                      const cell = staffGrid[key] || { year: '', section: '' };
                      return (
                        <div key={key} className="flex items-start gap-3 p-3 bg-slate-50 rounded-lg border border-slate-200">
                          <div className="flex-shrink-0 w-16">
                            <span className="text-sm font-medium text-slate-700">Period {p}</span>
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex flex-col gap-2">
                              <select
                                className="w-full border rounded-lg p-2 text-sm"
                                value={cell.year && cell.section ? `${cell.year}:${cell.section}:::${cell.subject_id ?? '__NONE__'}` : ''}
                                onChange={(e) => {
                                  const v = e.target.value;
                                  if (!v) {
                                    setStaffCell(selectedAssignedDay - 1, p, { year: '', section: '', subject_id: null });
                                    return;
                                  }
                                  const [ysSec, subjPart] = v.split(':::');
                                  const [ys, sec] = ysSec.split(':');
                                  const subj = subjPart === '__NONE__' ? null : subjPart;
                                  setStaffCell(selectedAssignedDay - 1, p, { year: Number(ys), section: sec, subject_id: subj });
                                }}
                              >
                                <option value="">Year / Section / Subject</option>
                                {staffYearSectionOptions.map((opt) => {
                                  const keyY = `${opt.year}:${opt.section}`;
                                  const subjectsFor = staffSubjectsByClass[`${keyY}`] || [];
                                  const subjectsForAll = staffSubjectsByClass[`${opt.year}:ALL`] || [];
                                  const combined = [...subjectsFor, ...subjectsForAll];
                                  if (combined.length === 0) {
                                    return (
                                      <option key={`${keyY}:::__NONE__`} value={`${keyY}:::__NONE__`}>{opt.year} - {opt.section} — (no staff subjects)</option>
                                    );
                                  }
                                  return (
                                    <optgroup key={keyY} label={`${opt.year} - ${opt.section}`}>
                                      <option value={`${keyY}:::__NONE__`}>{opt.year} - {opt.section} — Use class timetable / none</option>
                                      {combined.map((s) => (
                                        <option key={`${keyY}:::${s.id}`} value={`${keyY}:::${s.id}`}>{s.subject_code || s.id} — {s.name}</option>
                                      ))}
                                    </optgroup>
                                  );
                                })}
                              </select>
                              {(cell.year || cell.section) && (
                                <button className="text-xs text-slate-600 hover:text-red-600" onClick={() => setStaffCell(selectedAssignedDay - 1, p, { year: '', section: '', subject_id: null })} title="Clear">Clear</button>
                              )}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            </>)}
        </div>
      </div>
    </DashboardLayout>
  );
}

