import { useEffect, useState } from "react";
import DashboardLayout from "../../components/DashboardLayout";
import Loader from "../../components/Loader";
import { useAuth } from "../../contexts/AuthContext";
import { supabase } from "../../lib/supabase";

interface Subject {
  id: string;
  subject_code: string;
  name: string;
  mnemonic?: string;
  subject_type?: string;
  year: number;
  section: string;
  department: string;
}

export default function StaffTimetable() {
  const { profile } = useAuth();
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
  const [selectedSaturdayDate, setSelectedSaturdayDate] = useState<string | null>(null);
  const [saturdaySlots, setSaturdaySlots] = useState<Record<number, string | null>>({});
  const [assigned, setAssigned] = useState<
    Record<string, { department: string; year: number; section: string }>
  >({});
  const [assignedSubjects, setAssignedSubjects] = useState<
    Record<string, Subject | null>
  >({});
  const [assignedLoading, setAssignedLoading] = useState(false);
  const [deptStaff, setDeptStaff] = useState<Array<{ id: string; profile?: { name?: string } }>>([]);
  const [myOnLeave, setMyOnLeave] = useState<boolean>(false);
  const [selectedDay, setSelectedDay] = useState<number>(1); // 1=Monday, 2=Tuesday, etc.
  const [selectedAssignedDay, setSelectedAssignedDay] = useState<number>(1);
  const [timetableView, setTimetableView] = useState<"class" | "assigned">(
    "class"
  );
  const computeCurrentSemester = () => {
    const m = new Date().getMonth();
    return m < 6 ? 1 : 2;
  };
  const [semester, setSemester] = useState<number>(computeCurrentSemester());

  useEffect(() => {
    const loadAdvisorClass = async () => {
      if (!profile) return;
      setLoading(true);
      setError(null);
      setInfo(null);
      try {
        // Check staff role and assigned class
        const { data: st, error: stErr } = await supabase
          .from("staff")
          .select("staff_role, year, section, on_leave")
          .eq("id", profile.id)
          .maybeSingle();
        if (stErr) throw stErr;
        setMyOnLeave(!!(st as any)?.on_leave);
        if (!st || st.staff_role !== "advisor" || !st.year || !st.section) {
          // Not an advisor or no class assigned — still continue to load staff-assigned timetable below.
          setInfo(
            "No class assigned — class timetable not available. Your assigned timetable (if any) is shown below."
          );
          setYear(null);
          setSection(null);
        } else {
          setYear(st.year);
          setSection(st.section);

          // Load subjects for mapping only for the advisor's class
            if (profile.department) {
            const { data: subs } = await supabase
              .from("subjects")
              .select("id, subject_code, name, mnemonic, subject_type, year, section, department")
              .in("department", [profile.department, 'ALL'])
              .eq("year", st.year)
              .or(`section.eq.${st.section},section.eq.ALL`);
            setSubjects((subs || []) as any);
          }
        }
      } catch (e: any) {
        setError(e.message || "Failed to load advisor class");
      } finally {
        setLoading(false);
      }
    };
    loadAdvisorClass();
  }, [profile]);

  useEffect(() => {
    const loadTt = async () => {
      if (!profile?.department || !year || !section) return;
      setTtLoading(true);
      setError(null);
      try {
        const { data, error } = await supabase
          .from("timetables")
          .select("day_of_week, period, subject_id")
          .eq("department", profile.department)
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
  }, [profile?.department, year, section, semester]);

  // Auto-select next upcoming Saturday when class context becomes available
  useEffect(() => {
    if (!profile?.department || !year || !section) return;
    if (selectedSaturdayDate) return; // don't override user's choice
    const today = new Date();
    const day = today.getDay();
    // compute days until next Saturday (6)
    const diff = (6 - day + 7) % 7 || 7;
    const nextSat = new Date(today.getFullYear(), today.getMonth(), today.getDate() + diff);
    const iso = nextSat.toISOString().slice(0,10);
    loadSaturday(iso);
  }, [profile?.department, year, section]);
  

  // Load Saturday (day_of_week = 6) timetable entries for the advisor class
  const loadSaturday = async (dateStr?: string) => {
    if (!profile?.department || !year || !section) return;
    setTtLoading(true);
    try {
      const dayOfWeek = 6; // Saturday in this system
      const { data, error } = await supabase
        .from('timetables')
        .select('period, subject_id')
        .eq('department', profile.department)
        .eq('year', year)
        .eq('section', section)
        .eq('day_of_week', dayOfWeek);
      if (error) throw error;
      const slots: Record<number, string | null> = {};
      for (let p = 1; p <= 7; p++) slots[p] = null;
      (data || []).forEach((r: any) => {
        slots[r.period] = r.subject_id || null;
      });
      setSaturdaySlots(slots);
      if (dateStr) setSelectedSaturdayDate(dateStr);
    } catch (e: any) {
      console.error('Failed to load Saturday timetable:', e);
      alert('Failed to load Saturday timetable: ' + (e?.message || String(e)));
    } finally {
      setTtLoading(false);
    }
  };

  // Load staff-assigned timetable (maps staff -> class for each day/period)
  const loadAssigned = async () => {
    if (!profile?.id) return;
    setAssignedLoading(true);
    try {
      // Use SECURITY DEFINER RPC to fetch staff_timetables (avoids RLS issues)
      console.debug('loadAssigned: profile.id', profile.id);
      const { data: rows, error } = await supabase.rpc('rpc_get_staff_timetables_for_staff', { p_staff_id: profile.id });
      if (error) {
        console.error('loadAssigned: rpc error', error);
        throw error;
      }
      console.debug('loadAssigned: fetched rows (raw)', rows);

      // Normalize RPC result to an array (rpc may return null, single object, or array)
      let rowsArr: any[] = [];
      if (!rows) rowsArr = [];
      else if (Array.isArray(rows)) rowsArr = rows as any[];
      else rowsArr = [rows as any];
      console.debug('loadAssigned: normalized rows count', rowsArr.length);

      // If RPC returned no rows, try a direct SELECT as a diagnostic/fallback
      if (rowsArr.length === 0) {
        try {
          console.debug('loadAssigned: RPC returned 0 rows, trying direct SELECT fallback');
          const { data: directRows, error: directErr } = await supabase
            .from('staff_timetables')
            .select('department, year, section, day_of_week, period, subject_id, semester')
            .eq('staff_id', profile.id);
          if (directErr) {
            console.error('loadAssigned: direct SELECT error', directErr);
          } else {
            console.debug('loadAssigned: direct SELECT rows', directRows);
            rowsArr = Array.isArray(directRows) ? directRows : (directRows ? [directRows] : []);
          }
        } catch (e) {
          console.error('loadAssigned: direct SELECT fallback exception', e);
        }
      }

      const assignedMap: Record<string, { department: string; year: number; section: string; subject_id?: string | null }> = {};
      const subjectIds: string[] = [];

      // For each assigned slot, the staff_timetables now includes subject_id (if available)
      for (const r of rowsArr) {
        const key = `${r.day_of_week}-${r.period}`;
        assignedMap[key] = {
          department: r.department,
          year: r.year,
          section: r.section,
          subject_id: r.subject_id || null,
        };
        if (r.subject_id) subjectIds.push(r.subject_id);
      }

      // Fetch subject details in batch (only those referenced by staff_timetables)
      const subjMap: Record<string, Subject> = {};
      if (subjectIds.length > 0) {
        const uniqueIds = Array.from(new Set(subjectIds));
        const { data: subs } = await supabase
          .from("subjects")
          .select("id, subject_code, name, mnemonic, subject_type, year, section, department")
          .in("id", uniqueIds);
        (subs || []).forEach((s: any) => {
          subjMap[s.id] = s;
        });
      }

      // Build assignedSubjects map using the subject_id present on staff_timetables
      const assignedSubjectsMap: Record<string, Subject | null> = {};
      for (const key of Object.keys(assignedMap)) {
        const sid = assignedMap[key].subject_id;
        assignedSubjectsMap[key] = sid ? subjMap[sid] || null : null;
      }

      console.debug('loadAssigned: assignedMap keys', Object.keys(assignedMap));
      console.debug('loadAssigned: assignedSubjectsMap keys', Object.keys(assignedSubjectsMap));
      setAssigned(assignedMap);
      setAssignedSubjects(assignedSubjectsMap);
    } catch (e: any) {
      // non-fatal: we display nothing if load fails
      console.error("Failed to load assigned timetable:", e?.message || e, e);
    } finally {
      setAssignedLoading(false);
    }
  };

  useEffect(() => { loadAssigned(); }, [profile?.id]);


  // Reassign a specific period to another staff (used when substituting during leave)
  const reassignPeriod = async (dayOfWeek: number, period: number, newStaffId: string) => {
    if (!profile?.id) return alert('No current staff context');
    try {
      const { data, error } = await supabase
        .from('staff_timetables')
        .update({ staff_id: newStaffId })
        .match({ staff_id: profile.id, day_of_week: dayOfWeek, period: period })
        .select();
      if (error) throw error;
      if (!data || data.length === 0) {
        alert('No timetable row updated. There may be no assigned slot for this period to reassign.');
        return;
      }
      await loadAssigned();
      alert('Reassigned successfully');
    } catch (e: any) {
      console.error('Failed to reassign period:', e);
      alert('Failed to reassign period: ' + (e?.message || String(e)));
    }
  };

  // Save Saturday edits: upsert timetable rows for day_of_week = 6
  const saveSaturday = async () => {
    if (!profile?.department || !year || !section) return alert('No class context to save.');
    const dayOfWeek = 6;
    try {
      const rows: any[] = [];
      for (let p = 1; p <= 7; p++) {
        rows.push({
          department: profile.department,
          year,
          section,
          semester,
          day_of_week: dayOfWeek,
          period: p,
          subject_id: saturdaySlots[p] || null,
        });
      }
      // Use upsert with onConflict key used elsewhere in the app
      const { error } = await supabase.from('timetables').upsert(rows, { onConflict: 'department,year,section,semester,day_of_week,period' });
      if (error) throw error;
      await loadSaturday(selectedSaturdayDate || undefined);
      alert('Saturday timetable saved successfully');
    } catch (e: any) {
      console.error('Failed to save Saturday timetable:', e);
      alert('Failed to save Saturday timetable: ' + (e?.message || String(e)));
    }
  };

  // Fetch department staff list for substitute dropdowns
  useEffect(() => {
    const fetchDeptStaff = async () => {
      if (!profile?.department) return;
      try {
        const { data: profiles, error: profilesError } = await supabase
          .from('profiles')
          .select('id, name, role, department')
          .eq('department', profile.department)
          .in('role', ['staff','ahod','hod']);
        if (profilesError) throw profilesError;

        const ids = (profiles || []).map((p: any) => p.id);
        if (ids.length === 0) { setDeptStaff([]); return; }

        const { data: staffRows, error: staffErr } = await supabase
          .from('staff')
          .select('id, staff_role, on_leave')
          .in('id', ids as string[]);
        if (staffErr) throw staffErr;

        const staffById = new Map((staffRows || []).map((s: any) => [s.id, s]));
        const combined = (profiles || []).map((p: any) => ({ id: p.id, profile: { name: p.name }, staff: staffById.get(p.id) }));
        // Keep only those who have a staff row (i.e., can be substitutes)
        setDeptStaff(combined.filter((c: any) => !!c.staff).map((c: any) => ({ id: c.id, profile: c.profile })));
      } catch (e) {
        console.error('Failed to fetch department staff for substitutes:', e);
      }
    };
    fetchDeptStaff();
  }, [profile?.department]);


  return (
    <DashboardLayout>
      <div className="max-w-5xl mx-auto px-4 sm:px-6">
        {/* Timetable View Toggle Buttons */}
        <div className="mb-6 flex items-center gap-2 sm:gap-3">
          <button
            onClick={() => setTimetableView("class")}
            className={`flex-1 sm:flex-none px-3 sm:px-4 py-2 rounded-md text-sm font-medium border transition-colors ${
              timetableView === "class"
                ? "bg-blue-600 text-white border-blue-600"
                : "bg-white text-slate-700 border-slate-200 hover:bg-slate-50"
            }`}
          >
            My Class
          </button>
          <button
            onClick={() => setTimetableView("assigned")}
            className={`flex-1 sm:flex-none px-3 sm:px-4 py-2 rounded-md text-sm font-medium border transition-colors ${
              timetableView === "assigned"
                ? "bg-blue-600 text-white border-blue-600"
                : "bg-white text-slate-700 border-slate-200 hover:bg-slate-50"
            }`}
          >
            My Assigned
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
            {/* Class Timetable View */}
            {timetableView === "class" && (
              <>
                {info ? (
                  <div className="bg-white rounded-xl shadow-lg border border-slate-200 p-4 sm:p-6 text-center text-slate-600 text-sm sm:text-base">
                    {info}
                  </div>
                ) : (
                  <>
                    <div className="bg-blue-50 rounded-xl border border-blue-200 p-3 mb-4">
                      <div className="text-xs sm:text-sm text-slate-700">
                        <span className="font-medium">Department:</span>{" "}
                        {profile?.department} •{" "}
                        <span className="font-medium">Year:</span> {year} •{" "}
                        <span className="font-medium">Section:</span> {section}
                      </div>
                    </div>
                    {ttLoading ? (
                      <Loader message="Loading timetable..." />
                    ) : (
                      <>
                        {/* Day selector buttons (mobile only) */}
                        <div className="mb-4 flex flex-wrap gap-2 md:hidden">
                          {["MON", "TUE", "WED", "THU", "FRI"].map(
                            (day, di) => (
                              <button
                                key={day}
                                onClick={() => setSelectedDay(di + 1)}
                                className={`flex-1 sm:flex-none px-3 sm:px-4 py-2 rounded-md text-sm font-medium border transition-colors ${
                                  selectedDay === di + 1
                                    ? "bg-blue-600 text-white border-blue-600"
                                    : "bg-white text-slate-700 border-slate-200 hover:bg-slate-50"
                                }`}
                              >
                                {day}
                              </button>
                            )
                          )}
                        </div>

                        {/* Display selected day's timetable (mobile only) */}
                        <div className="bg-white rounded-xl shadow-lg border border-slate-200 p-4 sm:p-6 md:hidden">
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
                                  <div className="flex-shrink-0 w-16 sm:w-20">
                                    <span className="text-sm font-medium text-slate-700">
                                      Period {p}
                                    </span>
                                  </div>
                                  <div className="flex-1 min-w-0">
                                    {subj ? (
                                      <div>
                                        <div className="text-sm sm:text-base font-medium text-slate-800">
                                          {subj.subject_type === 'elective' ? subj.name : (subj.mnemonic || subj.subject_code)}
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

                        {/* Saturday editor: calendar + one-day table (mobile) */}
                        <div className="mt-6 bg-white rounded-xl shadow-lg border border-slate-200 p-4 sm:p-6 md:hidden">
                          <h3 className="text-lg font-semibold text-slate-800 mb-3">Saturday Timetable (Single Day)</h3>
                          <div className="mb-3">
                            <label className="text-sm text-slate-700 mr-2">Choose Saturday:</label>
                            <input
                              type="date"
                              value={selectedSaturdayDate || ''}
                              onChange={(e) => {
                                const v = e.target.value;
                                if (!v) { setSelectedSaturdayDate(null); setSaturdaySlots({}); return; }
                                const d = new Date(v + 'T00:00:00');
                                // JS: 6 is Saturday
                                if (d.getDay() !== 6) {
                                  alert('Please choose a Saturday date');
                                  return;
                                }
                                loadSaturday(v);
                              }}
                              className="border px-2 py-1 rounded"
                            />
                          </div>
                          <div className="space-y-2">
                            {[1,2,3,4,5,6,7].map((p) => (
                              <div key={`sat-mobile-${p}`} className="flex items-center justify-between gap-3 p-2 bg-slate-50 rounded">
                                <div className="text-sm font-medium">Period {p}</div>
                                <div className="w-2/3">
                                  <select
                                    className="w-full border rounded px-2 py-1 text-sm"
                                    value={saturdaySlots[p] || ''}
                                    onChange={(e) => setSaturdaySlots(prev => ({ ...prev, [p]: e.target.value || null }))}
                                  >
                                    <option value="">-- None --</option>
                                    {subjects.map(s => (
                                      <option key={s.id} value={s.id}>{s.subject_code} — {s.name}</option>
                                    ))}
                                  </select>
                                </div>
                              </div>
                            ))}
                          </div>
                          <div className="mt-4 flex justify-end gap-2">
                            <button onClick={() => { setSelectedSaturdayDate(null); setSaturdaySlots({}); }} className="px-3 py-1 rounded border">Clear</button>
                            <button onClick={saveSaturday} className="px-3 py-1 rounded bg-blue-600 text-white">Save Saturday</button>
                          </div>
                        </div>

                        {/* Desktop: full-week timetable table */}
                        <div className="hidden md:block bg-white rounded-xl shadow-lg border border-slate-200 p-4 overflow-x-auto mb-4">
                          <table className="w-full text-sm">
                            <thead>
                              <tr className="text-left text-slate-600">
                                <th className="py-2 pr-3">Period</th>
                                {["Monday","Tuesday","Wednesday","Thursday","Friday"].map((d) => (
                                  <th key={d} className="py-2 pr-3">{d}</th>
                                ))}
                              </tr>
                            </thead>
                            <tbody>
                              {[1,2,3,4,5,6,7].map((p) => (
                                <tr key={`period-${p}`} className="border-t">
                                  <td className="py-2 pr-3 w-28 whitespace-normal break-words">Period {p}</td>
                                  {[1,2,3,4,5].map((dayIdx) => {
                                    const key = `${dayIdx}-${p}`;
                                    const cell = timetable[key];
                                    const subj = cell?.subject_id
                                      ? subjects.find((s) => s.id === cell.subject_id)
                                      : null;
                                    return (
                                      <td key={`${dayIdx}-${p}`} className="py-2 pr-3 align-top whitespace-normal break-words">
                                        {subj ? (
                                          <div>
                                            <div className="text-sm font-medium text-slate-800">
                                              {subj.subject_type === 'elective' ? subj.name : (subj.mnemonic || subj.subject_code)}
                                            </div>
                                          </div>
                                        ) : (
                                          <span className="text-slate-400 text-sm">No class</span>
                                        )}
                                      </td>
                                    );
                                  })}
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                        {/* Desktop: Saturday single-day editor */}
                        <div className="hidden md:block bg-white rounded-xl shadow-lg border border-slate-200 p-4 overflow-x-auto mb-4">
                          <div className="flex items-center justify-between mb-3">
                            <h3 className="text-lg font-semibold">Saturday Timetable (Single Day)</h3>
                            <div className="flex items-center gap-2">
                              <input
                                type="date"
                                value={selectedSaturdayDate || ''}
                                onChange={(e) => {
                                  const v = e.target.value;
                                  if (!v) { setSelectedSaturdayDate(null); setSaturdaySlots({}); return; }
                                  const d = new Date(v + 'T00:00:00');
                                  if (d.getDay() !== 6) { alert('Please choose a Saturday date'); return; }
                                  loadSaturday(v);
                                }}
                                className="border px-2 py-1 rounded"
                              />
                              <button onClick={saveSaturday} className="px-3 py-1 bg-blue-600 text-white rounded">Save Saturday</button>
                            </div>
                          </div>

                          <table className="w-full text-sm">
                            <thead>
                              <tr>
                                <th className="py-2 pr-3">Period</th>
                                <th className="py-2 pr-3">Subject</th>
                              </tr>
                            </thead>
                            <tbody>
                              {[1,2,3,4,5,6,7].map((p) => (
                                <tr key={`sat-${p}`} className="border-t">
                                  <td className="py-2 pr-3 w-28">Period {p}</td>
                                  <td className="py-2 pr-3">
                                    <select className="w-full border rounded px-2 py-1 text-sm" value={saturdaySlots[p] || ''} onChange={(e) => setSaturdaySlots(prev => ({ ...prev, [p]: e.target.value || null }))}>
                                      <option value="">-- None --</option>
                                      {subjects.map(s => (
                                        <option key={s.id} value={s.id}>{s.subject_code} — {s.name}</option>
                                      ))}
                                    </select>
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </>
                    )}
                  </>
                )}
              </>
            )}

            {/* Assigned Timetable View */}
            {timetableView === "assigned" && (
              <>
                {assignedLoading ? (
                  <Loader message="Loading assigned timetable..." />
                ) : Object.keys(assigned).length === 0 ? (
                  <div className="bg-white rounded-xl shadow-lg border border-slate-200 p-4 sm:p-6 text-center text-slate-500 text-sm sm:text-base">
                    No staff-assigned timetable found for your account.
                  </div>
                ) : (
                  <>
                    {/* Day selector buttons for assigned timetable (mobile only) */}
                    <div className="mb-4 flex flex-wrap gap-2 md:hidden">
                      {["MON", "TUE", "WED", "THU", "FRI"].map((day, di) => (
                        <button
                          key={day}
                          onClick={() => setSelectedAssignedDay(di + 1)}
                          className={`flex-1 sm:flex-none px-3 sm:px-4 py-2 rounded-md text-sm font-medium border transition-colors ${
                            selectedAssignedDay === di + 1
                              ? "bg-blue-600 text-white border-blue-600"
                              : "bg-white text-slate-700 border-slate-200 hover:bg-slate-50"
                          }`}
                        >
                          {day}
                        </button>
                      ))}
                    </div>

                    {/* Display selected day's assigned timetable (mobile only) */}
                    <div className="bg-white rounded-xl shadow-lg border border-slate-200 p-4 sm:p-6 md:hidden">
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
                        {[1, 2, 3, 4, 5, 6, 7].map((p) => {
                          const key = `${selectedAssignedDay}-${p}`;
                          const a = assigned[key];
                          const subj = assignedSubjects[key];
                          return (
                            <div
                              key={key}
                              className="flex items-start gap-3 p-3 bg-slate-50 rounded-lg border border-slate-200"
                            >
                              <div className="flex-shrink-0 w-16 sm:w-20">
                                <span className="text-sm font-medium text-slate-700">
                                  Period {p}
                                </span>
                              </div>
                              <div className="flex-1 min-w-0">
                                {a ? (
                                  subj ? (
                                    <div>
                                      <div className="text-sm sm:text-base font-medium text-slate-800">
                                        {subj.subject_code}
                                      </div>
                                      <div className="text-xs text-slate-600 mt-0.5">
                                        {subj.mnemonic ? subj.mnemonic : subj.name}
                                      </div>
                                      <div className="text-[10px] sm:text-xs text-slate-500 mt-1">
                                        {a.department} • Y{a.year}-{a.section}
                                      </div>
                                    </div>
                                  ) : (
                                    <div className="text-xs sm:text-sm text-slate-600">
                                      {a.department} • Y{a.year}-{a.section}
                                    </div>
                                  )
                                ) : (
                                  <span className="text-slate-400 text-sm">
                                    No assignment
                                  </span>
                                )}
                              {myOnLeave && a && (
                                <div className="mt-3">
                                  <label className="text-xs text-slate-600 mr-2">Substitute:</label>
                                  <select
                                    className="text-sm border rounded px-2 py-1"
                                    defaultValue={""}
                                    onChange={(e) => {
                                      const val = e.target.value;
                                      if (!val) return;
                                      reassignPeriod(selectedAssignedDay, p, val);
                                    }}
                                  >
                                    <option value="">Choose</option>
                                    {deptStaff.filter(ds => ds.id !== profile?.id).map((ds) => (
                                      <option key={ds.id} value={ds.id}>{ds.profile?.name || ds.id}</option>
                                    ))}
                                  </select>
                                </div>
                              )}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>

                    {/* Desktop: full-week assigned timetable table */}
                    <div className="hidden md:block bg-white rounded-xl shadow-lg border border-slate-200 p-4 overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="text-left text-slate-600">
                            <th className="py-2 pr-3">Period</th>
                            {["Monday","Tuesday","Wednesday","Thursday","Friday"].map((d) => (
                              <th key={d} className="py-2 pr-3">{d}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {[1,2,3,4,5,6,7].map((p) => (
                            <tr key={`assigned-period-${p}`} className="border-t">
                              <td className="py-2 pr-3 w-28 whitespace-normal break-words">Period {p}</td>
                              {[1,2,3,4,5].map((dayIdx) => {
                                const key = `${dayIdx}-${p}`;
                                const a = assigned[key];
                                const subj = assignedSubjects[key];
                                return (
                                  <td key={`${dayIdx}-${p}`} className="py-2 pr-3 align-top whitespace-normal break-words">
                                    {a ? (
                                      subj ? (
                                        <div>
                                          <div className="text-sm font-medium text-slate-800">
                                            {subj.subject_code}
                                          </div>
                                          <div className="text-xs text-slate-600 mt-0.5">{subj.mnemonic ? subj.mnemonic : subj.name}</div>
                                          <div className="text-[10px] sm:text-xs text-slate-500 mt-1">{a.department} • Y{a.year}-{a.section}</div>
                                        </div>
                                      ) : (
                                        <div className="text-xs sm:text-sm text-slate-600">{a.department} • Y{a.year}-{a.section}</div>
                                      )
                                    ) : (
                                      <span className="text-slate-400 text-sm">No assignment</span>
                                    )}
                                    {myOnLeave && a && (
                                      <div className="mt-2">
                                        <label className="text-xs text-slate-600 mr-2">Sub:</label>
                                        <select
                                          className="text-sm border rounded px-2 py-1"
                                          defaultValue={""}
                                          onChange={(e) => {
                                            const val = e.target.value;
                                            if (!val) return;
                                            reassignPeriod(dayIdx, p, val);
                                          }}
                                        >
                                          <option value="">Choose</option>
                                          {deptStaff.filter(ds => ds.id !== profile?.id).map(ds => (
                                            <option key={ds.id} value={ds.id}>{ds.profile?.name || ds.id}</option>
                                          ))}
                                        </select>
                                      </div>
                                    )}
                                  </td>
                                );
                              })}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </>
                )}
              </>
            )}
          </>
        )}
      </div>
    </DashboardLayout>
  );
}
