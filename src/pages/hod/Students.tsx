import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import DashboardLayout from '../../components/DashboardLayout';
import { supabase } from '../../lib/supabase';
import { fetchInChunks } from '../../lib/supabaseHelpers';
import { useAuth } from '../../contexts/AuthContext';

interface StudentRow {
  id: string;
  roll_no: string;
  reg_no: string;
  name: string;
  mentorName: string;
  odCount: number;
  leaveCount: number;
  bonafideCount?: number;
  gatepassCount?: number;
}

const romanToNumber: Record<string, number> = { I: 1, II: 2, III: 3, IV: 4 };

export default function HODStudentsPage() {
  const { profile } = useAuth();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [year, setYear] = useState(() => searchParams.get('year') || 'ALL');
  const [section, setSection] = useState(() => searchParams.get('section') || 'A');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [students, setStudents] = useState<StudentRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [hodDepartments, setHodDepartments] = useState<Array<{ id: string; name: string }>>([]);
  const [selectedDept, setSelectedDept] = useState<string | null>(() => searchParams.get('dept'));
  const [showAdvisorModal, setShowAdvisorModal] = useState(false);
  const [staffList, setStaffList] = useState<Array<{ id: string; name: string; department: string }>>([]);
  const [selectedAdvisor, setSelectedAdvisor] = useState<string>('');
  const [assigningAdvisor, setAssigningAdvisor] = useState(false);
  const [showBonafide, setShowBonafide] = useState(false);
  const [showGatepass, setShowGatepass] = useState(false);
  const [showOD, setShowOD] = useState(false);
  const [showLeave, setShowLeave] = useState(false);
  
  // New filters for OD/Leave/Present/Absent/Late and date
  const [attendanceFilter, setAttendanceFilter] = useState<'all' | 'od' | 'leave' | 'present' | 'absent' | 'late'>('all');
  const [selectedDate, setSelectedDate] = useState<string>(() => {
    const today = new Date();
    return today.toISOString().split('T')[0];
  });
  const [filteredStudentsByAttendance, setFilteredStudentsByAttendance] = useState<string[]>([]);

  useEffect(() => {
    const load = async () => {
      if (!profile) return;
      setLoading(true);
      try {
        const yearNum = romanToNumber[year] || null;

        // load departments where this user is HOD (department_leads table)
        let initialSelected: string | null = selectedDept;
        if (profile.id) {
          const { data: leads } = await supabase
            .from('department_leads')
            .select('department_id, departments(name)')
            .eq('hod_id', profile.id);
          const depts = (leads || []).map((l: any) => ({ id: l.department_id, name: (l.departments && l.departments.name) || l.name || '' }));
          if (depts.length > 0) {
            setHodDepartments(depts);
            // set default selected dept to the id if not already set
            if (!selectedDept) setSelectedDept(depts[0].id);
            // compute an initialSelected value for this load so we don't rely on state updates
            initialSelected = selectedDept || depts[0].id;
          }
        }

        if (!initialSelected) {
          setStudents([]);
          setLoading(false);
          return;
        }

        // Use only `department_leads` (not `profile.department`) to determine which departments this HOD can view.
        let deptToUse = (typeof initialSelected !== 'undefined' && initialSelected !== null) ? initialSelected : selectedDept;
        if (!deptToUse) {
          console.debug('HOD: no department selected for HOD user, aborting student load');
          setStudents([]);
          setLoading(false);
          return;
        }

        // Resolve deptToUse (id) -> department NAME because `profiles.department` stores names.
        let deptNameToUse = deptToUse;
        if (deptToUse && /^[0-9a-fA-F-]{36}$/.test(String(deptToUse))) {
          try {
            const { data: deptRow } = await supabase.from('departments').select('id, name').eq('id', deptToUse).maybeSingle();
            if (deptRow && deptRow.name) deptNameToUse = deptRow.name;
          } catch (e) {
            console.debug('Could not resolve department id to name; using provided value', deptToUse, e);
          }
        }

        console.debug('HOD: using deptNameToUse for filter =', deptNameToUse, 'selectedDept=', selectedDept);

        // Robust approach: fetch profile ids for the department, then fetch students whose id is in that list.
        // This avoids relying on embed relationship names and ensures correct per-department filtering.
        const { data: profileRows, error: profileErr } = await supabase.from('profiles').select('id, name, department').eq('department', deptNameToUse).limit(10000);
        if (profileErr) throw profileErr;
        const profileIds = (profileRows || []).map((p: any) => p.id).filter(Boolean);
        console.debug('HOD: profiles found for department', deptNameToUse, profileIds.length, profileIds.slice(0,20));

        if (profileIds.length === 0) {
          setStudents([]);
          setLoading(false);
          return;
        }

        // fetch students for these profile ids in chunks
        const studs = await fetchInChunks('students', 'id, roll_no, reg_no, year, section, mentor_id, advisor_id', 'id', profileIds, 200);
        console.debug('HOD: fetched students sample', (studs || []).slice(0,20).map((s:any)=>({id:s.id, year:s.year, section:s.section})));

        // filter by year and section client-side (safe for per-dept lists)
        const filtered: any[] = [];
        (studs || []).forEach((s: any) => {
          let include = true;
          // If year is 'ALL', include all years, otherwise filter by selected year
          if (year !== 'ALL' && yearNum && Number(s.year) !== Number(yearNum)) include = false;
          // Only filter by section if a specific year is selected (not 'ALL')
          if (include && year !== 'ALL' && year !== 'I') {
            if (section && String(s.section) !== String(section)) include = false;
          }
          console.debug('HOD: student', s.id, 'year=', s.year, 'section=', s.section, 'include=', include);
          if (include) filtered.push(s);
        });

        console.debug('HOD: students fetched for dept', deptNameToUse, 'total', (studs || []).length, 'after year/section filter', filtered.length);

        // load profile details for mapping names
        const profilesData = await fetchInChunks('profiles', 'id, name, department', 'id', profileIds, 200);
        const profileMap = new Map<string, any>();
        (profilesData || []).forEach((p: any) => profileMap.set(p.id, p));

        const studentIds = filtered.map((s: any) => s.id).filter(Boolean);

        const rows: StudentRow[] = filtered.map((s: any) => {
          const prof = profileMap.get(s.id);
          return {
            id: s.id,
            roll_no: s.roll_no || '-',
            reg_no: s.reg_no || '-',
            name: prof?.name || '-',
            mentorName: '-',
            odCount: 0,
            leaveCount: 0,
          };
        });

        // gather ids for mentor lookup and application counts
        const mentorIds = Array.from(new Set((studs || []).map((s: any) => s.mentor_id).filter(Boolean)));

        // fetch OD counts and Leave counts in batch using count
        const odMap = new Map<string, number>();
        const leaveMap = new Map<string, number>();
        const mentorMap = new Map<string, string>();
        const bonafideMap = new Map<string, number>();
        const gatepassMap = new Map<string, number>();
        if (studentIds.length > 0) {
          const [mentorsData, odData, leaveData, bonafideData, gatepassData] = await Promise.all([
            mentorIds.length > 0 ? fetchInChunks('profiles', 'id, name', 'id', mentorIds) : Promise.resolve([]),
            fetchInChunks('od_applications', 'student_id', 'student_id', studentIds),
            fetchInChunks('leave_applications', 'student_id', 'student_id', studentIds),
            fetchInChunks('bonafide_applications', 'student_id', 'student_id', studentIds),
            fetchInChunks('gatepass_applications', 'student_id', 'student_id', studentIds)
          ]);

          // Build mentor map
          (mentorsData || []).forEach((m: any) => mentorMap.set(m.id, m.name));

          // Build count maps
          (odData || []).forEach((o: any) => odMap.set(o.student_id, (odMap.get(o.student_id) || 0) + 1));
          (leaveData || []).forEach((l: any) => leaveMap.set(l.student_id, (leaveMap.get(l.student_id) || 0) + 1));
          (bonafideData || []).forEach((b: any) => bonafideMap.set(b.student_id, (bonafideMap.get(b.student_id) || 0) + 1));
          (gatepassData || []).forEach((g: any) => gatepassMap.set(g.student_id, (gatepassMap.get(g.student_id) || 0) + 1));
        }

        // merge into rows
        const merged = rows.map((r) => ({
          ...r,
          mentorName: (studs || []).find((s: any) => s.id === r.id)?.mentor_id ? mentorMap.get((studs || []).find((s: any) => s.id === r.id)?.mentor_id) || '-' : '-',
          odCount: odMap.get(r.id) || 0,
          leaveCount: leaveMap.get(r.id) || 0,
          bonafideCount: (bonafideMap && bonafideMap.get) ? bonafideMap.get(r.id) || 0 : 0,
          gatepassCount: (gatepassMap && gatepassMap.get) ? gatepassMap.get(r.id) || 0 : 0,
        }));

        // Sort alphabetically by student name (case-insensitive)
        merged.sort((a, b) => (a.name || '').toLowerCase().localeCompare((b.name || '').toLowerCase()));

        setStudents(merged);
        // keep dept in URL
        if (deptToUse) setSearchParams({ year, section, dept: deptToUse });
      } catch (err) {
        console.error('Error loading students:', err);
        setStudents([]);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [profile, selectedDept, year, section]);

  // Fetch students with OD or Leave on selected date
  useEffect(() => {
    const fetchAttendanceData = async () => {
      if (attendanceFilter === 'all' || !selectedDate || students.length === 0) {
        setFilteredStudentsByAttendance([]);
        return;
      }

      try {
        const studentIds = students.map(s => s.id);
        
        // Handle OD and Leave (existing behaviour)
        if (attendanceFilter === 'od') {
          // Fetch OD applications for the selected date
          const { data: odApps } = await supabase
            .from('od_applications')
            .select('student_id, from_date, to_date')
            .in('student_id', studentIds)
            .eq('status', 'approved');

          const studentsWithOD = (odApps || [])
            .filter((app: any) => {
              const fromDate = new Date(app.from_date);
              const toDate = new Date(app.to_date);
              const checkDate = new Date(selectedDate);
              return checkDate >= fromDate && checkDate <= toDate;
            })
            .map((app: any) => app.student_id);

          setFilteredStudentsByAttendance(Array.from(new Set(studentsWithOD)));
        } else if (attendanceFilter === 'leave') {
          // Fetch Leave applications for the selected date
          const { data: leaveApps } = await supabase
            .from('leave_applications')
            .select('student_id, from_date, to_date')
            .in('student_id', studentIds)
            .eq('status', 'approved');

          const studentsWithLeave = (leaveApps || [])
            .filter((app: any) => {
              const fromDate = new Date(app.from_date);
              const toDate = new Date(app.to_date);
              const checkDate = new Date(selectedDate);
              return checkDate >= fromDate && checkDate <= toDate;
            })
            .map((app: any) => app.student_id);

          setFilteredStudentsByAttendance(Array.from(new Set(studentsWithLeave)));
        } else {
          // For present / absent / late: consult daily_attendance and period_attendance for the given date
          const [{ data: dailyData }, { data: periodData }] = await Promise.all([
            supabase
              .from('daily_attendance')
              .select('student_id, date, status')
              .in('student_id', studentIds)
              .eq('date', selectedDate),
            supabase
              .from('period_attendance')
              .select('student_id, date, period, status')
              .in('student_id', studentIds)
              .eq('date', selectedDate)
          ]);

          const dailyMap = new Map((dailyData || []).map((d: any) => [d.student_id, d.status]));
          const periodMap = new Map<string, string[]>();
          (periodData || []).forEach((p: any) => {
            if (!periodMap.has(p.student_id)) periodMap.set(p.student_id, []);
            periodMap.get(p.student_id)!.push(p.status);
          });

          const matched: string[] = [];
          for (const sid of studentIds) {
            const dStatus = dailyMap.get(sid);
            const pStatuses = periodMap.get(sid) || [];

            if (attendanceFilter === 'present') {
              if (dStatus === 'present') { matched.push(sid); continue; }
              if (pStatuses.includes('present')) { matched.push(sid); continue; }
            }

            if (attendanceFilter === 'late') {
              if (dStatus === 'late') { matched.push(sid); continue; }
              if (pStatuses.includes('late')) { matched.push(sid); continue; }
            }

            if (attendanceFilter === 'absent') {
              if (dStatus === 'absent') { matched.push(sid); continue; }
              // If no daily record but there are period records and all recorded periods are 'absent', consider absent
              if (pStatuses.length > 0 && pStatuses.every((st) => st === 'absent')) { matched.push(sid); continue; }
            }
          }

          setFilteredStudentsByAttendance(Array.from(new Set(matched)));
        }
      } catch (err) {
        console.error('Error fetching attendance data:', err);
        setFilteredStudentsByAttendance([]);
      }
    };

    fetchAttendanceData();
  }, [attendanceFilter, selectedDate, students]);

  // Load staff for advisor selection
  useEffect(() => {
    const loadStaff = async () => {
      if (!selectedDept) return;
      try {
        // Get department name from id
        const { data: deptRow } = await supabase.from('departments').select('name').eq('id', selectedDept).maybeSingle();
        const deptName = deptRow?.name;
        
        if (!deptName) return;
        
        // Fetch staff from the same department
        const { data: staffProfiles } = await supabase
          .from('profiles')
          .select('id, name, department')
          .eq('role', 'staff')
          .eq('department', deptName)
          .order('name');
        
        setStaffList(staffProfiles || []);
      } catch (err) {
        console.error('Error loading staff:', err);
      }
    };
    loadStaff();
  }, [selectedDept]);

  // keep URL in sync with selected filters (including dept)
  useEffect(() => {
    const params: any = { year, section };
    if (selectedDept) params.dept = selectedDept;
    setSearchParams(params);
  }, [year, section, selectedDept, setSearchParams]);

  const handleAssignAdvisor = async () => {
    if (!selectedAdvisor) {
      alert('Please select an advisor');
      return;
    }

    setAssigningAdvisor(true);
    try {
      const studentIds = students.map(s => s.id);

      if (studentIds.length === 0) {
        alert('No students found for this class');
        return;
      }

      const yearNum = romanToNumber[year] || null;

      // Update staff table: set staff_role to 'advisor', update year and section
      const { error: staffError } = await supabase
        .from('staff')
        .update({ 
          staff_role: 'advisor',
          year: yearNum,
          section: section
        })
        .eq('id', selectedAdvisor);

      if (staffError) throw staffError;

      // Update advisor_id for all students in this year+section
      const { error: studentsError } = await supabase
        .from('students')
        .update({ advisor_id: selectedAdvisor })
        .in('id', studentIds);

      if (studentsError) throw studentsError;

      alert(`Successfully assigned advisor to ${studentIds.length} students`);
      setShowAdvisorModal(false);
      setSelectedAdvisor('');
    } catch (err) {
      console.error('Error assigning advisor:', err);
      alert('Failed to assign advisor. Please try again.');
    } finally {
      setAssigningAdvisor(false);
    }
  };

  return (
    <DashboardLayout>
      <div className="max-w-6xl mx-auto">
        <div className="mb-6">
          <h1 className="text-2xl font-semibold text-slate-800">Students</h1>
        </div>

        {/* Department navigation for HODs with multiple departments */}
        {hodDepartments.length > 0 && (
          <div className="mb-4">
            <div className="flex gap-2">
              {hodDepartments.map((d) => (
                <button
                  key={d.id}
                  onClick={() => setSelectedDept(d.id)}
                  className={`px-3 py-2 rounded-md text-sm font-medium border ${selectedDept === d.id ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'}`}>
                  {d.name}
                </button>
              ))}
            </div>
          </div>
        )}

          <div className="flex flex-col sm:flex-row sm:items-end sm:gap-4 gap-3 mb-6">
          <div>
            <label className="block text-sm text-slate-600 mb-1">Year</label>
            <select
              value={year}
              onChange={(e) => setYear(e.target.value)}
              className="border border-slate-300 rounded-lg px-3 py-2 text-sm w-40"
            >
              <option value="ALL">ALL</option>
              <option value="I">I</option>
              <option value="II">II</option>
              <option value="III">III</option>
              <option value="IV">IV</option>
            </select>
          </div>

          <div>
            <label className="block text-sm text-slate-600 mb-1">Section</label>
            <select
              value={section}
              onChange={(e) => setSection(e.target.value)}
              className="border border-slate-300 rounded-lg px-3 py-2 text-sm w-40"
            >
              <option value="A">A</option>
              <option value="B">B</option>
              <option value="C">C</option>
            </select>
          </div>

          <div>
            <label className="block text-sm text-slate-600 mb-1">Attendance Filter</label>
            <select
              value={attendanceFilter}
              onChange={(e) => setAttendanceFilter(e.target.value as 'all' | 'od' | 'leave' | 'present' | 'absent' | 'late')}
              className="border border-slate-300 rounded-lg px-3 py-2 text-sm w-40"
            >
              <option value="all">All Students</option>
              <option value="od">With OD</option>
              <option value="leave">On Leave</option>
              <option value="present">Present</option>
              <option value="late">Late</option>
              <option value="absent">Absent</option>
            </select>
          </div>

          {attendanceFilter !== 'all' && (
            <div>
              <label className="block text-sm text-slate-600 mb-1">Date</label>
              <input
                type="date"
                value={selectedDate}
                onChange={(e) => setSelectedDate(e.target.value)}
                className="border border-slate-300 rounded-lg px-3 py-2 text-sm w-40"
              />
            </div>
          )}

          <div className="flex items-end gap-3">
            <div className="flex items-center gap-3 text-sm">
              <label className="inline-flex items-center space-x-2">
                <input type="checkbox" className="h-4 w-4" checked={showBonafide} onChange={(e) => setShowBonafide(e.target.checked)} />
                <span className="text-slate-700">Bonafide</span>
          {/* attendance summary box removed per request */}
              </label>
              <label className="inline-flex items-center space-x-2">
                <input type="checkbox" className="h-4 w-4" checked={showGatepass} onChange={(e) => setShowGatepass(e.target.checked)} />
                <span className="text-slate-700">Gatepass</span>
              </label>
              <label className="inline-flex items-center space-x-2">
                <input type="checkbox" className="h-4 w-4" checked={showOD} onChange={(e) => setShowOD(e.target.checked)} />
                <span className="text-slate-700">OD</span>
              </label>
              <label className="inline-flex items-center space-x-2">
                <input type="checkbox" className="h-4 w-4" checked={showLeave} onChange={(e) => setShowLeave(e.target.checked)} />
                <span className="text-slate-700">Leave</span>
              </label>
            </div>
            <div>
              <button
                onClick={() => setShowAdvisorModal(true)}
                className="px-4 py-2 bg-green-600 text-white rounded-lg text-sm font-medium hover:bg-green-700"
              >
                Assign Advisor
              </button>
            </div>
          </div>
        </div>

        <div className="mb-6">
          <label className="block text-sm text-slate-600 mb-1">Search</label>
          <input
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Name, Reg no or Roll no"
            className="border border-slate-300 rounded-lg px-3 py-2 text-sm w-56"
          />
        </div>

        <div className="bg-white p-6 rounded-xl shadow">
          <div className="overflow-x-auto">
            <table className="table-auto w-full">
              <thead>
                  <tr className="bg-gray-100 font-semibold text-gray-700">
                    <th className="px-4 py-2 text-left">Roll Number</th>
                    <th className="px-4 py-2 text-left">Register Number</th>
                    <th className="px-4 py-2 text-left">Name</th>
                    <th className="px-4 py-2 text-left">Mentor Name</th>
                    {showBonafide && <th className="px-4 py-2 text-left">Bonafide</th>}
                    {showGatepass && <th className="px-4 py-2 text-left">Gatepass</th>}
                    {showOD && <th className="px-4 py-2 text-left">OD Count</th>}
                    {showLeave && <th className="px-4 py-2 text-left">Leave Count</th>}
                    <th className="px-4 py-2 text-left">Profile</th>
                  </tr>
                </thead>
              <tbody>
                {loading ? (
                    <tr>
                      <td colSpan={5 + (showBonafide?1:0) + (showGatepass?1:0) + (showOD?1:0) + (showLeave?1:0)} className="px-4 py-6 text-center text-slate-600">Loading students...</td>
                    </tr>
                  ) : (() => {
                    // Apply attendance filter then search filter
                    let filteredStudents = attendanceFilter === 'all' ? [...students] : students.filter(s => filteredStudentsByAttendance.includes(s.id));
                    if (searchQuery && searchQuery.trim() !== '') {
                      const q = searchQuery.trim().toLowerCase();
                      filteredStudents = filteredStudents.filter((s: any) => {
                        const name = (s.name || '').toString().toLowerCase();
                        const reg = (s.reg_no || '').toString().toLowerCase();
                        const roll = (s.roll_no || '').toString().toLowerCase();
                        return name.includes(q) || reg.includes(q) || roll.includes(q);
                      });
                    }
                    
                    if (filteredStudents.length === 0) {
                      return (
                        <tr>
                          <td colSpan={5 + (showBonafide?1:0) + (showGatepass?1:0) + (showOD?1:0) + (showLeave?1:0)} className="px-4 py-6 text-center text-slate-600">
                            {attendanceFilter === 'all' ? 'No students found.' : `No students found with ${attendanceFilter === 'od' ? 'OD' : 'Leave'} on this date.`}
                          </td>
                        </tr>
                      );
                    }
                    
                    return filteredStudents.map((s) => (
                      <tr key={s.id} className="hover:bg-gray-50">
                        <td className="px-4 py-3">{s.roll_no}</td>
                        <td className="px-4 py-3">{s.reg_no}</td>
                        <td className="px-4 py-3">{s.name}</td>
                        <td className="px-4 py-3">{s.mentorName}</td>
                        {showBonafide && <td className="px-4 py-3">{(s as any).bonafideCount ?? 0}</td>}
                        {showGatepass && <td className="px-4 py-3">{(s as any).gatepassCount ?? 0}</td>}
                        {showOD && <td className="px-4 py-3">{s.odCount}</td>}
                        {showLeave && <td className="px-4 py-3">{s.leaveCount}</td>}
                        <td className="px-4 py-3">
                          <button
                            onClick={() => navigate(`/hod/student/${s.id}?year=${encodeURIComponent(year)}&section=${encodeURIComponent(section)}`)}
                            className="px-3 py-1 bg-blue-600 text-white rounded hover:bg-blue-700"
                          >
                            View
                          </button>
                        </td>
                      </tr>
                    ));
                  })()}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Advisor Assignment Modal */}
      {showAdvisorModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl shadow-xl p-6 max-w-md w-full mx-4">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-xl font-semibold text-slate-800">Assign Advisor</h2>
              <button
                onClick={() => {
                  setShowAdvisorModal(false);
                  setSelectedAdvisor('');
                }}
                className="text-slate-400 hover:text-slate-600"
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <div className="mb-4">
              <p className="text-sm text-slate-600 mb-4">
                Assign an advisor to all students in <strong>Year {year}, Section {section}</strong>
              </p>

              <label className="block text-sm font-medium text-slate-700 mb-2">
                Select Advisor
              </label>
              <select
                value={selectedAdvisor}
                onChange={(e) => setSelectedAdvisor(e.target.value)}
                className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="">-- Select Staff --</option>
                {staffList.map((staff) => (
                  <option key={staff.id} value={staff.id}>
                    {staff.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex gap-3 justify-end">
              <button
                onClick={() => {
                  setShowAdvisorModal(false);
                  setSelectedAdvisor('');
                }}
                className="px-4 py-2 border border-slate-300 text-slate-700 rounded-lg text-sm font-medium hover:bg-slate-50"
              >
                Cancel
              </button>
              <button
                onClick={handleAssignAdvisor}
                disabled={assigningAdvisor || !selectedAdvisor}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {assigningAdvisor ? 'Assigning...' : 'Assign'}
              </button>
            </div>
          </div>
        </div>
      )}
    </DashboardLayout>
  );
}
