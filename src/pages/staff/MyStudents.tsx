import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { FileText, Calendar, CreditCard, Award, Home, Users, RefreshCw, ClipboardCheck } from 'lucide-react';
import DashboardLayout from '../../components/DashboardLayout';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';

interface Student {
  id: string;
  reg_no: string;
  roll_no: string;
  year: number;
  section: string;
  profile: {
    name: string;
    department: string;
  } | null;
}

export default function MyStudents() {
  const navigate = useNavigate();
  const { user } = useAuth();

  const [students, setStudents] = useState<Student[]>([]);
  const [loading, setLoading] = useState(true);
  const [staffRole, setStaffRole] = useState<string | null>(null);
  const [staffDetails, setStaffDetails] = useState<{ year: number; section: string; department: string; } | null>(null);

  // Attendance filters and UI toggles
  const [attendanceFilter, setAttendanceFilter] = useState<'all' | 'od' | 'leave' | 'present' | 'absent' | 'late'>('all');
  const [selectedDate, setSelectedDate] = useState<string>(() => new Date().toISOString().split('T')[0]);
  const [filteredStudentsByAttendance, setFilteredStudentsByAttendance] = useState<string[]>([]);
  const [showBonafide, setShowBonafide] = useState(false);
  const [showGatepass, setShowGatepass] = useState(false);
  const [showOD, setShowOD] = useState(false);
  const [showLeave, setShowLeave] = useState(false);
  const [searchQuery, setSearchQuery] = useState<string>('');
  // Counts for applications per student
  const [bonafideCounts, setBonafideCounts] = useState<Record<string, number>>({});
  const [gatepassCounts, setGatepassCounts] = useState<Record<string, number>>({});
  const [odCounts, setOdCounts] = useState<Record<string, number>>({});
  const [leaveCounts, setLeaveCounts] = useState<Record<string, number>>({});

  useEffect(() => {
    if (user) fetchStaffDetails();
  }, [user]);

  useEffect(() => {
    if (staffRole === 'advisor' && staffDetails) {
      fetchStudents();

      const studentsSubscription = supabase
        .channel('students-changes')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'students' }, (payload) => {
          const record: any = payload.new || payload.old;
          if (record && record.year === staffDetails.year && record.section === staffDetails.section) fetchStudents();
        })
        .subscribe();

      const profilesSubscription = supabase
        .channel('profiles-changes')
        .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'profiles' }, (payload) => {
          const rec: any = payload.new;
          if (rec && rec.department === staffDetails.department && rec.role === 'student') fetchStudents();
        })
        .subscribe();

      return () => {
        studentsSubscription.unsubscribe();
        profilesSubscription.unsubscribe();
      };
    }
  }, [staffRole, staffDetails]);

  // Fetch attendance / OD / Leave info for the selected date and apply attendance filter
  useEffect(() => {
    const fetchAttendanceData = async () => {
      if (attendanceFilter === 'all' || !selectedDate || students.length === 0) {
        setFilteredStudentsByAttendance([]);
        return;
      }

      try {
        const studentIds = students.map(s => s.id);

        if (attendanceFilter === 'od') {
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
          return;
        }

        if (attendanceFilter === 'leave') {
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
          return;
        }

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
            if (pStatuses.length > 0 && pStatuses.every((st) => st === 'absent')) { matched.push(sid); continue; }
          }
        }

        setFilteredStudentsByAttendance(Array.from(new Set(matched)));
      } catch (err) {
        console.error('[MyStudents] Error fetching attendance data:', err);
        setFilteredStudentsByAttendance([]);
      }
    };

    fetchAttendanceData();
  }, [attendanceFilter, selectedDate, students]);

  // Fetch counts when students list changes or checkboxes toggle
  useEffect(() => {
    const studentIds = students.map(s => s.id);
    if (studentIds.length === 0) {
      setBonafideCounts({});
      setGatepassCounts({});
      setOdCounts({});
      setLeaveCounts({});
      return;
    }

    const fetchCounts = async () => {
      try {
        if (showBonafide) {
          const { data } = await supabase
            .from('bonafide_applications')
            .select('student_id')
            .in('student_id', studentIds)
            .eq('status', 'approved');
          const map: Record<string, number> = {};
          (data || []).forEach((r: any) => { map[r.student_id] = (map[r.student_id] || 0) + 1; });
          setBonafideCounts(map);
        } else {
          setBonafideCounts({});
        }

        if (showGatepass) {
          const { data } = await supabase
            .from('gatepass_applications')
            .select('student_id')
            .in('student_id', studentIds)
            .eq('status', 'approved');
          const map: Record<string, number> = {};
          (data || []).forEach((r: any) => { map[r.student_id] = (map[r.student_id] || 0) + 1; });
          setGatepassCounts(map);
        } else {
          setGatepassCounts({});
        }

        if (showOD) {
          const { data } = await supabase
            .from('od_applications')
            .select('student_id')
            .in('student_id', studentIds)
            .eq('status', 'approved');
          const map: Record<string, number> = {};
          (data || []).forEach((r: any) => { map[r.student_id] = (map[r.student_id] || 0) + 1; });
          setOdCounts(map);
        } else {
          setOdCounts({});
        }

        if (showLeave) {
          const { data } = await supabase
            .from('leave_applications')
            .select('student_id')
            .in('student_id', studentIds)
            .eq('status', 'approved');
          const map: Record<string, number> = {};
          (data || []).forEach((r: any) => { map[r.student_id] = (map[r.student_id] || 0) + 1; });
          setLeaveCounts(map);
        } else {
          setLeaveCounts({});
        }
      } catch (err) {
        console.error('[MyStudents] Error fetching counts:', err);
      }
    };

    fetchCounts();
  }, [students, showBonafide, showGatepass, showOD, showLeave]);

  const fetchStaffDetails = async () => {
    try {
      const { data: staffData, error: staffError } = await supabase
        .from('staff')
        .select('staff_role, year, section')
        .eq('id', user?.id)
        .maybeSingle();
      if (staffError) throw staffError;

      if (staffData && staffData.staff_role === 'advisor') {
        setStaffRole(staffData.staff_role);
        const { data: profileData, error: profileError } = await supabase
          .from('profiles')
          .select('department')
          .eq('id', user?.id)
          .single();
        if (profileError) throw profileError;
        if (profileData && staffData.year && staffData.section) setStaffDetails({ year: staffData.year, section: staffData.section, department: profileData.department });
      } else {
        setStaffRole(staffData?.staff_role || null);
      }
    } catch (error) {
      console.error('[MyStudents] Error in fetchStaffDetails:', error);
    }
  };

  const fetchStudents = async () => {
    try {
      setLoading(true);
      if (!staffDetails) { setStudents([]); return; }

      const { data, error } = await supabase
        .from('students')
        .select(`
          id,
          reg_no,
          roll_no,
          year,
          section,
          advisor_id,
          profiles!students_id_fkey (
            name,
            department
          )
        `)
        .eq('year', staffDetails.year)
        .eq('section', staffDetails.section)
        .order('roll_no');
      if (error) throw error;

      const transformedData = (data || []).map((item: any) => ({
        ...item,
        profile: Array.isArray(item.profiles) ? item.profiles[0] : item.profiles
      })).filter((s: any) => s.profile && s.profile.department === staffDetails.department);

      setStudents(transformedData as any);
    } catch (error) {
      console.error('[MyStudents] Error in fetchStudents:', error);
    } finally {
      setLoading(false);
    }
  };

  const sidebarItems = [
    { label: 'Dashboard', path: '/staff', icon: <Home className="w-5 h-5" /> },
    { label: 'OD Applications', path: '/staff/od', icon: <FileText className="w-5 h-5" /> },
    { label: 'Leave Applications', path: '/staff/leave', icon: <Calendar className="w-5 h-5" /> },
    { label: 'Gatepass Applications', path: '/staff/gatepass', icon: <CreditCard className="w-5 h-5" /> },
    { label: 'Bonafide Applications', path: '/staff/bonafide', icon: <Award className="w-5 h-5" /> },
    { label: 'Attendance', path: '/staff/attendance', icon: <ClipboardCheck className="w-5 h-5" /> },
    { label: 'My Mentees', path: '/staff/mentees', icon: <Users className="w-5 h-5" /> },
    ...(staffRole === 'advisor' ? [{ label: 'My Students', path: '/staff/students', icon: <Users className="w-5 h-5" /> }] : []),
  ];

  if (staffRole !== 'advisor') {
    return (
      <DashboardLayout sidebarItems={sidebarItems}>
        <div className="p-4 sm:p-6">
          <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
            <p className="text-yellow-800 text-sm sm:text-base">This page is only available for advisors.</p>
          </div>
        </div>
      </DashboardLayout>
    );
  }

  const attendanceFiltered = attendanceFilter === 'all' ? students : students.filter(s => filteredStudentsByAttendance.includes(s.id));
  const filteredStudents = (searchQuery && searchQuery.trim() !== '')
    ? attendanceFiltered.filter((s) => {
        const q = searchQuery.trim().toLowerCase();
        const name = (s.profile?.name || '').toString().toLowerCase();
        const reg = (s.reg_no || '').toString().toLowerCase();
        const roll = (s.roll_no || '').toString().toLowerCase();
        return name.includes(q) || reg.includes(q) || roll.includes(q);
      })
    : attendanceFiltered;

  return (
    <DashboardLayout sidebarItems={sidebarItems}>
      <div className="p-4 sm:p-6">
        <div className="mb-4 sm:mb-6 flex flex-col sm:flex-row sm:justify-between sm:items-center gap-4">
          <div>
            <h1 className="text-xl sm:text-2xl font-bold text-gray-900">My Students</h1>
            {staffDetails && (
              <p className="text-sm sm:text-base text-gray-600 mt-1">Year {staffDetails.year} - Section {staffDetails.section} - {staffDetails.department}</p>
            )}
          </div>

          <div className="flex items-end gap-3 w-full sm:w-auto">
            <div>
              <label className="block text-sm text-slate-600 mb-1">Attendance Filter</label>
              <select value={attendanceFilter} onChange={(e) => setAttendanceFilter(e.target.value as any)} className="border border-slate-300 rounded-lg px-3 py-2 text-sm w-44">
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
                <input type="date" value={selectedDate} onChange={(e) => setSelectedDate(e.target.value)} className="border border-slate-300 rounded-lg px-3 py-2 text-sm w-44" />
              </div>
            )}

            <div className="flex items-center gap-3 text-sm">
              <label className="inline-flex items-center space-x-2">
                <input type="checkbox" className="h-4 w-4" checked={showBonafide} onChange={(e) => setShowBonafide(e.target.checked)} />
                <span className="text-slate-700">Bonafide</span>
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

            <button onClick={() => fetchStudents()} disabled={loading} className="flex items-center justify-center gap-2 px-4 py-2 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors w-full sm:w-auto">
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
              <span>Refresh</span>
            </button>
          </div>
        </div>

        {/* Search input placed on next line below attendance filters */}
        <div className="mb-6">
          <label className="block text-sm text-slate-600 mb-1">Search</label>
          <input
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Name, Reg no or Roll no"
            className="border border-slate-300 rounded-lg px-3 py-2 text-sm w-56"
          />
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-12">
            <div className="text-gray-500 text-sm sm:text-base">Loading students...</div>
          </div>
        ) : filteredStudents.length === 0 ? (
          <div className="bg-gray-50 border border-gray-200 rounded-lg p-6 sm:p-8 text-center">
            <Users className="w-10 h-10 sm:w-12 sm:h-12 text-gray-400 mx-auto mb-3" />
            <p className="text-gray-600 text-sm sm:text-base">{attendanceFilter === 'all' ? 'No students assigned to your section yet.' : `No students found with ${attendanceFilter} on ${new Date(selectedDate).toLocaleDateString()}.`}</p>
          </div>
        ) : (
          <>
            {/* Desktop Table View */}
            <div className="hidden lg:block bg-white rounded-lg shadow overflow-hidden">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr className="bg-gray-100 font-semibold text-gray-700">
                    <th className="px-4 py-2 text-left">Reg No</th>
                    <th className="px-4 py-2 text-left">Name</th>
                    <th className="px-4 py-2 text-left">Profile</th>
                    {showBonafide && <th className="px-4 py-2 text-left">Bonafide</th>}
                    {showGatepass && <th className="px-4 py-2 text-left">Gatepass</th>}
                    {showOD && <th className="px-4 py-2 text-left">OD</th>}
                    {showLeave && <th className="px-4 py-2 text-left">Leave</th>}
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {filteredStudents.map((student) => (
                    <tr key={student.id} className="hover:bg-gray-50">
                      <td className="px-4 py-3">{student.reg_no}</td>
                      <td className="px-4 py-3">{student.profile?.name}</td>
                      <td className="px-4 py-3">
                        <button onClick={() => navigate(`/staff/student-profile/${student.id}`)} className="px-3 py-1 bg-blue-600 text-white text-sm rounded-md hover:bg-blue-700">View</button>
                      </td>
                      {showBonafide && <td className="px-4 py-3">{bonafideCounts[student.id] || 0}</td>}
                      {showGatepass && <td className="px-4 py-3">{gatepassCounts[student.id] || 0}</td>}
                      {showOD && <td className="px-4 py-3">{odCounts[student.id] || 0}</td>}
                      {showLeave && <td className="px-4 py-3">{leaveCounts[student.id] || 0}</td>}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Mobile Card View */}
            <div className="lg:hidden space-y-4">
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
                <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm">
                  <div>
                    <span className="text-blue-600 font-medium">Department:</span>
                    <span className="text-blue-900 ml-1">{staffDetails?.department}</span>
                  </div>
                  <div>
                    <span className="text-blue-600 font-medium">Year:</span>
                    <span className="text-blue-900 ml-1">{staffDetails?.year}</span>
                  </div>
                  <div>
                    <span className="text-blue-600 font-medium">Section:</span>
                    <span className="text-blue-900 ml-1">{staffDetails?.section}</span>
                  </div>
                </div>
              </div>

              <div className="space-y-2">
                {filteredStudents.map((student) => (
                  <div key={student.id} className="bg-white rounded-lg border border-gray-200 p-3">
                    <div className="flex-1 min-w-0">
                      <h3 className="text-sm font-semibold text-gray-900 truncate">{student.profile?.name}</h3>
                      <div className="flex gap-3 mt-1 text-xs text-gray-600">
                        <span>Reg: {student.reg_no}</span>
                      </div>
                      {(showBonafide || showGatepass || showOD || showLeave) && (
                        <div className="mt-2 flex flex-wrap gap-2 text-xs">
                          {showBonafide && <div className="px-2 py-0.5 bg-indigo-50 text-indigo-700 rounded-md">Bonafide: {bonafideCounts[student.id] || 0}</div>}
                          {showGatepass && <div className="px-2 py-0.5 bg-green-50 text-green-700 rounded-md">Gatepass: {gatepassCounts[student.id] || 0}</div>}
                          {showOD && <div className="px-2 py-0.5 bg-blue-50 text-blue-700 rounded-md">OD: {odCounts[student.id] || 0}</div>}
                          {showLeave && <div className="px-2 py-0.5 bg-red-50 text-red-700 rounded-md">Leave: {leaveCounts[student.id] || 0}</div>}
                        </div>
                      )}
                    </div>
                    <div className="hidden sm:flex">
                      <button onClick={() => navigate(`/staff/student-profile/${student.id}`)} className="px-3 py-1 bg-blue-600 text-white text-sm rounded-md hover:bg-blue-700">View</button>
                    </div>
                    <div className="flex sm:hidden justify-end mt-2">
                      <button onClick={() => navigate(`/staff/student-profile/${student.id}`)} className="px-3 py-1 bg-blue-600 text-white text-sm rounded-md hover:bg-blue-700">View</button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </>
        )}

        <div className="mt-4 text-sm text-gray-600">Total Students: {students.length}</div>
      </div>
    </DashboardLayout>
  );
}
