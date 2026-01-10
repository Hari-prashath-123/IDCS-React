import { useEffect, useState } from 'react';
import DashboardLayout from '../../components/DashboardLayout';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { Users } from 'lucide-react';

type DeptStaff = {
  id: string;
  name: string;
  staff_role?: string | null;
  on_leave?: boolean | null;
};

type RPCAttendance = {
  subject_id: string;
  subject_code: string | null;
  subject_name: string | null;
  period: number;
  year: number;
  section: string | null;
  student_count: number;
  attendance: any; // array of { student_id, reg_no, roll_no, name, status }
};

export default function DepartmentPage() {
  const { profile } = useAuth();
  const [activeTab, setActiveTab] = useState<'overview' | 'leave' | 'assign'>('leave');
  const [loading, setLoading] = useState(false);
  const [staffList, setStaffList] = useState<DeptStaff[]>([]);
  const [error, setError] = useState<string | null>(null);
  // Assign tab / attendance
  const [assignDate, setAssignDate] = useState<string>(new Date().toISOString().split('T')[0]);
  const [attendanceResults, setAttendanceResults] = useState<RPCAttendance[]>([]);
  const [loadingAttendance, setLoadingAttendance] = useState(false);
  const [attendanceError, setAttendanceError] = useState<string | null>(null);
  const [replacementSelections, setReplacementSelections] = useState<Record<string, string>>({});
  const [replacementApplying, setReplacementApplying] = useState<Record<string, boolean>>({});
  const [replacementsMap, setReplacementsMap] = useState<Record<string, { id: string; target_staff: string; replacement_staff: string; for_date: string; period: number }>>({});
  const [leaveTimetableMap, setLeaveTimetableMap] = useState<Record<string, RPCAttendance[]>>({});
  const [editingFullDay, setEditingFullDay] = useState<Record<string, boolean>>({});

  useEffect(() => {
    if (!profile?.is_department_admin) return;
    if (activeTab === 'leave') {
      fetchDepartmentStaff();
    }
    if (activeTab === 'assign') {
      fetchDepartmentStaff();
      fetchReplacementsForDate();
    }
  }, [profile?.is_department_admin, profile?.department, activeTab]);

  useEffect(() => {
    if (activeTab === 'assign') {
      fetchReplacementsForDate();
    }
  }, [assignDate]);

  const fetchReplacementsForDate = async () => {
    try {
      const { data, error } = await supabase
        .from('replacements')
        .select('id, target_staff, replacement_staff, for_date, period')
        .eq('for_date', assignDate);
      if (error) throw error;
      const map: Record<string, any> = {};
      (data || []).forEach((r: any) => { map[`${r.target_staff}_${r.period || 0}`] = r; });
      setReplacementsMap(map);
    } catch (e) {
      console.error('Failed to load replacements for date', e);
      setReplacementsMap({});
    }
  };

  const fetchDepartmentStaff = async () => {
    if (!profile?.department) return setError('No department on your profile');
    setLoading(true);
    setError(null);
    try {
      // Fetch profiles for this department who are staff/ahod/hod
      const { data: profiles } = await supabase
        .from('profiles')
        .select('id, name')
        .eq('department', profile.department)
        .in('role', ['staff', 'ahod', 'hod']);

      const ids = (profiles ?? []).map((p: any) => p.id);

      let staffRows: any[] = [];
      if (ids.length) {
        const { data: srows } = await supabase.from('staff').select('id, staff_role, on_leave').in('id', ids as string[]);
        staffRows = srows ?? [];
      }

      const list: DeptStaff[] = (profiles ?? []).map((p: any) => {
        const s = staffRows.find((r) => r.id === p.id) || {};
        return {
          id: p.id,
          name: p.name,
          staff_role: s.staff_role,
          on_leave: typeof s.on_leave === 'boolean' ? s.on_leave : false,
        };
      });

      setStaffList(list);
    } catch (e: any) {
      console.error('Failed to load department staff', e);
      setError(e?.message || 'Failed to load department staff');
    } finally {
      setLoading(false);
    }
  };

  const toggleLeave = async (staffId: string, current: boolean | null | undefined) => {
    const newVal = !current;
    // optimistic update
    setStaffList((prev) => prev.map((s) => (s.id === staffId ? { ...s, on_leave: newVal } : s)));
    try {
      // Use RPC to perform authorization-safe update on the database
      const { data, error } = await supabase.rpc('set_staff_on_leave', { target_staff: staffId, new_status: newVal });
      console.debug('set_staff_on_leave RPC result', { data, error, staffId, newVal });
      if (error) throw error;

      // Ensure the UI reflects the persisted DB state by refetching the department staff
      // (this avoids transient UI flips when background syncs or subscriptions update the list)
      await fetchDepartmentStaff();
    } catch (e: any) {
      // Log full error object for easier debugging
      console.error('Failed to update leave status via RPC', e, {
        message: e?.message,
        details: e?.details,
        hint: e?.hint,
      });
      // revert optimistic update
      setStaffList((prev) => prev.map((s) => (s.id === staffId ? { ...s, on_leave: current ?? false } : s)));
      // Show a helpful alert with server message when available
      const userMsg = e?.message || (typeof e === 'string' ? e : 'Failed to update leave status');
      alert(`Failed to update leave status: ${userMsg}`);
      // Refresh list to reflect DB truth (in case of partial failures)
      fetchDepartmentStaff();
    }
  };

  const fetchLeaveAttendance = async (staffId: string) => {
    setAttendanceError(null);
    setAttendanceResults([]);
    // clear any previous timetable for this staff
    setLeaveTimetableMap((prev) => ({ ...prev, [staffId]: [] }));
    setLoadingAttendance(true);
    try {
      const { data, error: rpcError } = await supabase.rpc('get_staff_leave_attendance', { p_target_staff: staffId, p_for_date: assignDate });
      if (rpcError) throw rpcError;
      // Supabase returns an array of rows for set-returning functions. Store
      // the results keyed by staff id so the Assign tab can show per-period
      // replacement controls for each leave staff.
      const rows = (data || []) as RPCAttendance[];
      if (rows && rows.length > 0) {
        setLeaveTimetableMap((prev) => ({ ...prev, [staffId]: rows }));
        setAttendanceResults(rows);
      } else {
        // RPC returned no rows. As a fallback, query the timetable directly so
        // department admins can still assign replacements. This mirrors the
        // RPC fallback logic but runs client-side for visibility.
        try {
          const jsDay = new Date(assignDate).getDay();
          const dbDay = jsDay === 0 ? 0 : jsDay === 6 ? 0 : jsDay;

          // First try staff_timetables join timetables
          const { data: stData, error: stErr } = await supabase
            .from('staff_timetables')
            .select('period, year, section, department')
            .eq('staff_id', staffId)
            .eq('day_of_week', dbDay);

          const built: RPCAttendance[] = [];
          if (stErr) {
            console.error('Error fetching staff_timetables fallback', stErr);
          }

          if (stData && stData.length > 0) {
            // For each timetable entry, find the subject in timetables
            for (const st of stData) {
              const { data: tData } = await supabase
                .from('timetables')
                .select('subject_id')
                .eq('department', st.department)
                .eq('year', st.year)
                .eq('section', st.section)
                .eq('period', st.period)
                .eq('day_of_week', dbDay)
                .limit(1);

              const subjectId = tData && tData[0] ? tData[0].subject_id : null;
              if (!subjectId) continue;

              const { data: subData } = await supabase.from('subjects').select('id, subject_code, name').eq('id', subjectId).limit(1);
              const subject = subData && subData[0] ? subData[0] : null;

              // Count students in year/section
              const { data: studentsCount }: any = await supabase
                .from('students')
                .select('id', { count: 'exact' })
                .eq('year', st.year)
                .eq('section', st.section);

              const student_count = Array.isArray(studentsCount) ? studentsCount.length : (studentsCount?.length || 0);

              built.push({
                subject_id: subjectId,
                subject_code: subject?.subject_code ?? null,
                subject_name: subject?.name ?? null,
                period: st.period,
                year: st.year,
                section: st.section ?? null,
                student_count,
                attendance: [],
              } as RPCAttendance);
            }
          }

          // If still empty, try the general timetables for subjects taught by staff
          if (built.length === 0) {
            const { data: teachData } = await supabase
              .from('timetables')
              .select('period, year, section, subject_id')
              .eq('day_of_week', dbDay)
              .eq('subject_id.staff_id', staffId);

            if (teachData && teachData.length > 0) {
              for (const tt of teachData) {
                const { data: subData } = await supabase.from('subjects').select('id, subject_code, name').eq('id', tt.subject_id).limit(1);
                const subject = subData && subData[0] ? subData[0] : null;
                const { data: studentsCount }: any = await supabase
                  .from('students')
                  .select('id', { count: 'exact' })
                  .eq('year', tt.year)
                  .eq('section', tt.section);
                const student_count = Array.isArray(studentsCount) ? studentsCount.length : (studentsCount?.length || 0);

                built.push({
                  subject_id: tt.subject_id,
                  subject_code: subject?.subject_code ?? null,
                  subject_name: subject?.name ?? null,
                  period: tt.period,
                  year: tt.year,
                  section: tt.section ?? null,
                  student_count,
                  attendance: [],
                } as RPCAttendance);
              }
            }
          }

          setLeaveTimetableMap((prev) => ({ ...prev, [staffId]: built }));
          setAttendanceResults(built);
        } catch (fbErr) {
          console.error('Fallback timetable query failed', fbErr);
          setLeaveTimetableMap((prev) => ({ ...prev, [staffId]: [] }));
          setAttendanceResults([]);
        }
      }
    } catch (e: any) {
      console.error('Failed to fetch attendance from RPC', e, { message: e?.message, details: e?.details, hint: e?.hint });
      setAttendanceError(e?.message || 'Failed to fetch attendance');
    } finally {
      setLoadingAttendance(false);
    }
  };

  if (!profile) return (
    <DashboardLayout sidebarItems={[]}>
      <div className="max-w-4xl mx-auto p-6">Loading profile...</div>
    </DashboardLayout>
  );

  if (!profile.is_department_admin) return (
    <DashboardLayout sidebarItems={[]}>
      <div className="max-w-4xl mx-auto p-6">
        <h1 className="text-2xl font-semibold">Department</h1>
        <p className="text-sm text-slate-600 mt-2">You are not authorized to view this page.</p>
      </div>
    </DashboardLayout>
  );

  return (
    <DashboardLayout sidebarItems={[]}>
      <div className="max-w-6xl mx-auto p-6">
        <div className="mb-6">
          <div>
            <h1 className="text-2xl font-bold">Department — {profile.department}</h1>
            <p className="text-sm text-slate-600">Manage department-level settings and staff</p>
          </div>

          {/* Navigation buttons moved below the title/description (keep them in a single row) */}
          <div className="mt-4 flex gap-2 overflow-x-auto">
            <button
              onClick={() => setActiveTab('leave')}
              className={`px-3 py-1 rounded flex-shrink-0 ${activeTab === 'leave' ? 'bg-blue-600 text-white' : 'bg-white border'}`}>
              Leave
            </button>
            <button
              onClick={() => setActiveTab('assign')}
              className={`px-3 py-1 rounded flex-shrink-0 ${activeTab === 'assign' ? 'bg-blue-600 text-white' : 'bg-white border'}`}>
              Assign
            </button>
          </div>
        </div>

        {activeTab === 'overview' && (
          <div className="bg-white rounded-xl border border-slate-200 p-6">Overview content placeholder</div>
        )}

        {activeTab === 'leave' && (
          <div className="bg-white rounded-xl border border-slate-200 p-6">
            <h2 className="text-lg font-semibold mb-4">Department Staff — Leave Management</h2>
            {error && <div className="text-red-600 mb-3">{error}</div>}
            {loading ? (
              <div className="text-center py-12">
                <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-600 mx-auto"></div>
              </div>
            ) : (
              <div className="space-y-3">
                {staffList.length === 0 && <div className="text-slate-600">No staff found for this department.</div>}
                {staffList.map((s) => (
                  <div key={s.id} className="flex items-center justify-between p-3 border rounded">
                    <div className="flex items-center gap-3">
                      <Users className="h-6 w-6 text-slate-500" />
                      <div>
                        <div className="font-medium">{s.name}</div>
                        <div className="text-xs text-slate-500">{s.staff_role || 'staff'}</div>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <button
                        onClick={() => toggleLeave(s.id, s.on_leave)}
                        className={`px-3 py-1 rounded ${s.on_leave ? 'bg-red-600 text-white' : 'bg-green-600 text-white'}`}>
                        {s.on_leave ? 'On Leave' : 'Active'}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {activeTab === 'assign' && (
          <div className="bg-white rounded-xl border border-slate-200 p-6">
            <h2 className="text-lg font-semibold mb-4">Assign / Replacements</h2>
            <p className="text-sm text-slate-600 mb-4">View attendance for staff who are on leave and propose replacements.</p>

            <div className="mb-4 flex flex-col sm:flex-row gap-3 items-center">
              <label className="text-sm font-medium">Date</label>
              <input type="date" value={assignDate} onChange={(e) => setAssignDate(e.target.value)} className="px-3 py-2 border rounded w-full sm:w-auto" />
              <button onClick={() => fetchDepartmentStaff()} className="px-3 py-2 bg-slate-100 rounded w-full sm:w-auto">Refresh Staff List</button>
            </div>

            {loading ? (
              <div className="text-center py-6">Loading staff...</div>
            ) : (
              <div className="space-y-3">
                {staffList.filter(s => s.on_leave).length === 0 && <div className="text-slate-600">No staff currently marked on leave.</div>}
                {staffList.filter(s => s.on_leave).map(s => (
                  <div key={s.id} className="p-3 border rounded">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                      <div>
                        <div className="font-medium">{s.name}</div>
                        <div className="text-xs text-slate-500">{s.staff_role || 'staff'}</div>
                      </div>
                      <div className="flex flex-col sm:flex-row sm:items-center gap-2">
                        <button onClick={() => fetchLeaveAttendance(s.id)} className="px-3 py-1 bg-blue-600 text-white rounded w-full sm:w-auto">View Periods</button>
                        <div className="text-sm text-slate-600 ml-0 sm:ml-3 flex items-center gap-3">
                          <div>Full-day Assigned: {replacementsMap[`${s.id}_0`] ? (staffList.find(x => x.id === replacementsMap[`${s.id}_0`].replacement_staff)?.name || replacementsMap[`${s.id}_0`].replacement_staff) : '—'}</div>
                          {/* Edit control for full-day replacement (dept admins) */}
                          <div>
                            {!editingFullDay[s.id] ? (
                                <button
                                  onClick={() => setEditingFullDay(prev => ({ ...prev, [s.id]: true }))}
                                  className="px-2 py-1 bg-slate-100 text-sm rounded"
                                >
                                  Edit
                                </button>
                              ) : (
                                <div className="flex flex-col sm:flex-row sm:items-center gap-2">
                                  <select
                                    className="px-2 py-1 border rounded text-sm w-full sm:w-auto"
                                    value={replacementSelections[`${s.id}_0`] ?? ''}
                                    onChange={(e) => setReplacementSelections(prev => ({ ...prev, [`${s.id}_0`]: e.target.value }))}
                                  >
                                    <option value="">Choose replacement</option>
                                    {staffList
                                      .filter(opt => opt.id !== s.id)
                                      .map(opt => (
                                        <option key={opt.id} value={opt.id} disabled={!!opt.on_leave}>
                                          {opt.name} {opt.on_leave ? '(on leave)' : ''}
                                        </option>
                                      ))}
                                  </select>

                                  <div className="flex gap-2">
                                    <button
                                      onClick={async () => {
                                        const key = `${s.id}_0`;
                                        const replacementId = replacementSelections[key];
                                        if (!replacementId) return alert('Choose a replacement first');
                                        setReplacementApplying(prev => ({ ...prev, [key]: true }));
                                        try {
                                          const { error } = await supabase.rpc('apply_replacement', { p_target_staff: s.id, p_replacement_staff: replacementId, p_for_date: assignDate, p_period: 0 });
                                          if (error) throw error;
                                          alert('Full-day replacement applied successfully');
                                          fetchDepartmentStaff();
                                          fetchReplacementsForDate();
                                          setReplacementSelections(prev => ({ ...prev, [key]: '' }));
                                          setEditingFullDay(prev => ({ ...prev, [s.id]: false }));
                                        } catch (e: any) {
                                          console.error('Failed to apply full-day replacement', e);
                                          alert(e?.message || 'Failed to apply replacement');
                                        } finally {
                                          setReplacementApplying(prev => ({ ...prev, [key]: false }));
                                        }
                                      }}
                                      className="px-3 py-1 bg-green-600 text-white rounded text-sm"
                                      disabled={!!replacementApplying[`${s.id}_0`]}
                                    >
                                      {replacementApplying[`${s.id}_0`] ? 'Applying...' : 'Apply'}
                                    </button>

                                    <button onClick={() => setEditingFullDay(prev => ({ ...prev, [s.id]: false }))} className="px-2 py-1 bg-slate-100 text-sm rounded">Cancel</button>
                                  </div>
                                </div>
                              )}
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Per-period timetable and assign controls */}
                    {leaveTimetableMap[s.id] && leaveTimetableMap[s.id].length > 0 ? (
                      <div className="mt-3 space-y-2">
                        {leaveTimetableMap[s.id].map(r => (
                          <div key={`${r.subject_id}_${r.period}`} className="flex flex-col sm:flex-row sm:items-center justify-between p-2 border rounded gap-2">
                            <div>
                              <div className="font-medium">{r.subject_code || r.subject_name || 'Subject'}</div>
                              <div className="text-xs text-slate-500">Year {r.year} • Section {r.section} • Period {r.period} • Students: {r.student_count}</div>
                            </div>
                            <div className="flex flex-col sm:flex-row sm:items-center gap-2">
                              <select
                                className="px-2 py-1 border rounded text-sm w-full sm:w-auto"
                                value={replacementSelections[`${s.id}_${r.period}`] ?? ''}
                                onChange={(e) => setReplacementSelections(prev => ({ ...prev, [`${s.id}_${r.period}`]: e.target.value }))}
                              >
                                <option value="">Choose replacement</option>
                                {staffList
                                  .filter(opt => opt.id !== s.id)
                                  .map(opt => (
                                    <option key={opt.id} value={opt.id} disabled={!!opt.on_leave}>
                                      {opt.name} {opt.on_leave ? '(on leave)' : ''}
                                    </option>
                                  ))}
                              </select>

                              {replacementsMap[`${s.id}_${r.period}`] && (
                                <div className="text-sm text-slate-600">Assigned: {staffList.find(x => x.id === replacementsMap[`${s.id}_${r.period}`].replacement_staff)?.name || replacementsMap[`${s.id}_${r.period}`].replacement_staff}</div>
                              )}

                              <button
                                onClick={async () => {
                                  const key = `${s.id}_${r.period}`;
                                  const replacementId = replacementSelections[key];
                                  if (!replacementId) return alert('Choose a replacement first');
                                  setReplacementApplying(prev => ({ ...prev, [key]: true }));
                                  try {
                                    const { error } = await supabase.rpc('apply_replacement', { p_target_staff: s.id, p_replacement_staff: replacementId, p_for_date: assignDate, p_period: r.period });
                                    if (error) throw error;
                                    alert('Replacement applied successfully');
                                    fetchDepartmentStaff();
                                    fetchReplacementsForDate();
                                    setReplacementSelections(prev => ({ ...prev, [key]: '' }));
                                  } catch (e: any) {
                                    console.error('Failed to apply replacement', e);
                                    alert(e?.message || 'Failed to apply replacement');
                                  } finally {
                                    setReplacementApplying(prev => ({ ...prev, [key]: false }));
                                  }
                                }}
                                className="px-3 py-1 bg-green-600 text-white rounded text-sm w-full sm:w-auto"
                                disabled={!!replacementApplying[`${s.id}_${r.period}`]}
                              >
                                {replacementApplying[`${s.id}_${r.period}`] ? 'Applying...' : 'Apply'}
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="mt-3 text-sm text-slate-500">No scheduled periods found for this staff on {assignDate}. Click "View Periods" to refresh.</div>
                    )}
                  </div>
                ))}
              </div>
            )}

            {/* Attendance Results (Assign page) */}
            <div className="mt-6">
              {loadingAttendance && <div className="text-center py-4">Loading attendance...</div>}
              {attendanceError && <div className="text-red-600">{attendanceError}</div>}

              {/* For the Assign page we intentionally do not show detailed student lists.
                  Leave the per-period summary so admins can see which periods exist
                  and how many students are enrolled, but hide individual student rows.
              */}
              {!loadingAttendance && attendanceResults.length > 0 && (
                <div className="space-y-4">
                  {attendanceResults.map((r) => (
                    <div key={`${r.subject_id}_${r.period}`} className="border rounded p-3 flex items-center justify-between">
                      <div>
                        <div className="font-semibold">{r.subject_code || r.subject_name || 'Subject'}</div>
                        <div className="text-xs text-slate-500">Year {r.year} • Section {r.section} • Period {r.period}</div>
                      </div>
                      <div className="text-sm text-slate-700">Students: {r.student_count}</div>
                    </div>
                  ))}
                  <div className="text-sm text-slate-500">Student lists are hidden on the Assign page — use the Leave tab to view and mark students.</div>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}
