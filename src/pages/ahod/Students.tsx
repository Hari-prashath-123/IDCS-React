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
}

const romanToNumber: Record<string, number> = { I: 1, II: 2, III: 3, IV: 4 };

export default function AHODStudentsPage() {
  const { profile } = useAuth();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [year, setYear] = useState(() => searchParams.get('year') || 'ALL');
  const [section, setSection] = useState(() => searchParams.get('section') || 'ALL');
  const [students, setStudents] = useState<StudentRow[]>([]);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [loading, setLoading] = useState(false);
  // Attendance filter and checkbox controls
  const [attendanceFilter, setAttendanceFilter] = useState<'all' | 'od' | 'leave' | 'present' | 'absent' | 'late'>('all');
  const [selectedDate, setSelectedDate] = useState<string>(() => new Date().toISOString().split('T')[0]);
  const [filteredStudentIds, setFilteredStudentIds] = useState<string[]>([]);

  const [showBonafide, setShowBonafide] = useState(false);
  const [showGatepass, setShowGatepass] = useState(false);
  const [showOD, setShowOD] = useState(true);
  const [showLeave, setShowLeave] = useState(true);

  // counts maps
  const [bonafideCounts, setBonafideCounts] = useState<Record<string, number>>({});
  const [gatepassCounts, setGatepassCounts] = useState<Record<string, number>>({});

  useEffect(() => {
    const load = async () => {
      if (!profile?.department) return;
      setLoading(true);
      try {
        const yearNum = (year && year !== 'ALL') ? romanToNumber[year] || null : null;
        // Prefer the department value as stored in the DB for this user (avoids mismatch between name vs id)
        let deptToUse = profile.department;
        try {
          const { data: myProfile } = await supabase.from('profiles').select('department').eq('id', profile.id).maybeSingle();
          if (myProfile && myProfile.department) {
            console.debug('AHOD: profile.department (client) =', profile.department, 'profile.department (db) =', myProfile.department);
            deptToUse = myProfile.department || deptToUse;
          } else {
            console.debug('AHOD: no department found in DB for profile', profile.id);
          }
        } catch (e) {
          console.debug('AHOD: error fetching profile department from DB', e);
        }
        if (deptToUse && !/^[0-9a-fA-F-]{36}$/.test(deptToUse)) {
          try {
            const { data: deptRow } = await supabase.from('departments').select('id, name').eq('name', deptToUse).maybeSingle();
            if (deptRow && deptRow.id) deptToUse = deptRow.id;
          } catch (e) {
            console.debug('Could not resolve AHOD department name to id, using provided value', deptToUse, e);
          }
        }

        // Query students via profiles join and filter by department id/name as available
        let q = supabase
          .from('students')
          .select(`
            id,
            roll_no,
            reg_no,
            year,
            section,
            mentor_id,
            advisor_id,
            profiles!students_id_fkey ( id, name, department )
          `)
          .eq('profiles.department', deptToUse)
          .order('roll_no');

        if (yearNum) q = q.eq('year', yearNum);
        if (section && section !== 'ALL') q = q.eq('section', section);

        const { data: studs, error } = await q;
        if (error) throw error;

        console.debug('AHOD: fetched students sample', (studs || []).slice(0, 3).map((s: any) => ({ id: s.id, roll: s.roll_no, reg: s.reg_no, profile: s.profiles })));

        const studentIds = (studs || []).map((s: any) => s.id).filter(Boolean);

        const rows: StudentRow[] = (studs || []).map((s: any) => {
          const prof = Array.isArray(s.profiles) ? s.profiles[0] : s.profiles;
          console.debug('AHOD: mapping student', s.id, 'prof=', prof, 'name=', prof?.name);
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
        const mentorIds = Array.from(new Set((studs || []).map((s: any) => s.mentor_id).filter(Boolean)));

        // fetch mentor names, OD and leave counts in parallel
        const mentorMap = new Map<string, string>();
        const odMap = new Map<string, number>();
        const leaveMap = new Map<string, number>();
        if (studentIds.length > 0) {
          const [mentorsData, odData, leaveData] = await Promise.all([
            mentorIds.length > 0 ? fetchInChunks('profiles', 'id, name', 'id', mentorIds) : Promise.resolve([]),
            fetchInChunks('od_applications', 'student_id', 'student_id', studentIds),
            fetchInChunks('leave_applications', 'student_id', 'student_id', studentIds)
          ]);

          (mentorsData || []).forEach((m: any) => mentorMap.set(m.id, m.name));
          console.debug('AHOD: fetched mentors', mentorMap.size, 'sample:', Array.from(mentorMap.entries()).slice(0, 3));
          (odData || []).forEach((o: any) => odMap.set(o.student_id, (odMap.get(o.student_id) || 0) + 1));
          (leaveData || []).forEach((l: any) => leaveMap.set(l.student_id, (leaveMap.get(l.student_id) || 0) + 1));
        }

        const merged = rows.map((r) => {
          const raw = (studs || []).find((s: any) => s.id === r.id) || {};
          const rawAny: any = raw;
          return {
            ...r,
            mentorName: rawAny.mentor_id ? mentorMap.get(rawAny.mentor_id) || '-' : '-',
            odCount: odMap.get(r.id) || 0,
            leaveCount: leaveMap.get(r.id) || 0,
          };
        });

        setStudents(merged);
      } catch (err) {
        console.error('Error loading AHOD students:', err);
        setStudents([]);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [profile?.department, year, section]);

  // Apply attendance filter for displayed students
  useEffect(() => {
    const applyFilter = async () => {
      if (attendanceFilter === 'all') {
        setFilteredStudentIds([]);
        return;
      }

      const studentIds = students.map(s => String(s.id));
      if (studentIds.length === 0) { setFilteredStudentIds([]); return; }

      try {
        if (attendanceFilter === 'od') {
          const { data: odApps } = await supabase
            .from('od_applications')
            .select('student_id, from_date, to_date')
            .in('student_id', studentIds)
            .eq('status', 'approved');

          const matched = (odApps || []).filter((app: any) => {
            const fromDate = new Date(app.from_date);
            const toDate = new Date(app.to_date);
            const checkDate = new Date(selectedDate);
            return checkDate >= fromDate && checkDate <= toDate;
          }).map((a: any) => String(a.student_id));

          setFilteredStudentIds(Array.from(new Set(matched)));
          return;
        }

        if (attendanceFilter === 'leave') {
          const { data: leaveApps } = await supabase
            .from('leave_applications')
            .select('student_id, from_date, to_date')
            .in('student_id', studentIds)
            .eq('status', 'approved');

          const matched = (leaveApps || []).filter((app: any) => {
            const fromDate = new Date(app.from_date);
            const toDate = new Date(app.to_date);
            const checkDate = new Date(selectedDate);
            return checkDate >= fromDate && checkDate <= toDate;
          }).map((a: any) => String(a.student_id));

          setFilteredStudentIds(Array.from(new Set(matched)));
          return;
        }

        const [{ data: dailyData }, { data: periodData }] = await Promise.all([
          supabase.from('daily_attendance').select('student_id, date, status').in('student_id', studentIds).eq('date', selectedDate),
          supabase.from('period_attendance').select('student_id, date, period, status').in('student_id', studentIds).eq('date', selectedDate)
        ]);

        const dailyMap = new Map((dailyData || []).map((d: any) => [String(d.student_id), d.status]));
        const periodMap = new Map<string, string[]>();
        (periodData || []).forEach((p: any) => {
          const sid = String(p.student_id);
          if (!periodMap.has(sid)) periodMap.set(sid, []);
          periodMap.get(sid)!.push(p.status);
        });

        const matched: string[] = [];
        for (const sid of studentIds) {
          const dStatus = dailyMap.get(sid);
          const pStatuses = periodMap.get(sid) || [];

            if (attendanceFilter === 'present') {
              if (dStatus === 'present' || pStatuses.includes('present')) { matched.push(sid); continue; }
            }
            if (attendanceFilter === 'late') {
              if (dStatus === 'late' || pStatuses.includes('late')) { matched.push(sid); continue; }
            }
            if (attendanceFilter === 'absent') {
              if (dStatus === 'absent' || (pStatuses.length > 0 && pStatuses.every((st) => st === 'absent'))) { matched.push(sid); continue; }
            }
        }

        setFilteredStudentIds(Array.from(new Set(matched)));
      } catch (err) {
        console.error('AHOD: error applying attendance filter', err);
        setFilteredStudentIds([]);
      }
    };

    applyFilter();
  }, [attendanceFilter, selectedDate, students]);

  // Fetch counts for bonafide/gatepass/od/leave when students list or toggles change
  useEffect(() => {
    const studentIds = students.map(s => s.id);
    if (studentIds.length === 0) {
      setBonafideCounts({}); setGatepassCounts({}); return;
    }

    const fetchCounts = async () => {
      try {
        if (showBonafide) {
          const { data } = await supabase.from('bonafide_applications').select('student_id').in('student_id', studentIds).eq('status', 'approved');
          const map: Record<string, number> = {};
          (data || []).forEach((r: any) => { map[r.student_id] = (map[r.student_id] || 0) + 1; });
          setBonafideCounts(map);
        } else setBonafideCounts({});

        if (showGatepass) {
          const { data } = await supabase.from('gatepass_applications').select('student_id').in('student_id', studentIds).eq('status', 'approved');
          const map: Record<string, number> = {};
          (data || []).forEach((r: any) => { map[r.student_id] = (map[r.student_id] || 0) + 1; });
          setGatepassCounts(map);
        } else setGatepassCounts({});

        if (showOD) {
          const odData = await fetchInChunks('od_applications', 'student_id', 'student_id', studentIds);
          const map: Record<string, number> = {};
          (odData || []).forEach((r: any) => { map[String(r.student_id)] = (map[String(r.student_id)] || 0) + 1; });
          // We keep od counts in student rows; nothing else necessary here.
        }

        if (showLeave) {
          const leaveData = await fetchInChunks('leave_applications', 'student_id', 'student_id', studentIds);
          const map: Record<string, number> = {};
          (leaveData || []).forEach((r: any) => { map[String(r.student_id)] = (map[String(r.student_id)] || 0) + 1; });
          // leave counts already present in rows but we computed as needed.
        }
      } catch (err) {
        console.error('AHOD: error fetching counts', err);
      }
    };

    fetchCounts();
  }, [students, showBonafide, showGatepass, showOD, showLeave]);

  // derive displayed students based on attendance filter and search
  const attendanceFiltered = attendanceFilter === 'all' ? students : students.filter(s => filteredStudentIds.includes(String(s.id)));
  const displayedStudents = (searchQuery && searchQuery.trim() !== '')
    ? attendanceFiltered.filter((s) => {
        const q = searchQuery.trim().toLowerCase();
        const name = (s.name || '').toString().toLowerCase();
        const reg = ((s as any).reg_no || '').toString().toLowerCase();
        const roll = (s.roll_no || '').toString().toLowerCase();
        return name.includes(q) || reg.includes(q) || roll.includes(q);
      })
    : attendanceFiltered;
  const colCount = 4 + (showBonafide ? 1 : 0) + (showGatepass ? 1 : 0) + (showOD ? 1 : 0) + (showLeave ? 1 : 0) + 1;

  useEffect(() => {
    setSearchParams({ year, section });
  }, [year, section, setSearchParams]);

  return (
    <DashboardLayout>
      <div className="max-w-6xl mx-auto">
        <div className="mb-6">
          <h1 className="text-2xl font-semibold text-slate-800">Students</h1>
        </div>

        {/* Debug info to help diagnose attendance filter */}
        <div className="mb-4">
          <div className="text-xs text-slate-500">Debug: filter=<strong>{attendanceFilter}</strong> | date=<strong>{selectedDate}</strong> | students=<strong>{students.length}</strong> | matchedIds=<strong>{filteredStudentIds.length}</strong></div>
        </div>

        <div className="flex flex-col sm:flex-row sm:items-center sm:gap-4 gap-3 mb-6">
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
              <option value="ALL">ALL</option>
              <option value="A">A</option>
              <option value="B">B</option>
              <option value="C">C</option>
            </select>
          </div>

          <div className="flex items-end gap-3">
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

            <div className="flex items-center gap-4">
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
                        <td colSpan={colCount} className="px-4 py-6 text-center text-slate-600">Loading students...</td>
                      </tr>
                    ) : displayedStudents.length === 0 ? (
                      <tr>
                        <td colSpan={colCount} className="px-4 py-6 text-center text-slate-600">No students found.</td>
                      </tr>
                    ) : (
                      displayedStudents.map((s) => (
                        <tr key={s.id} className="hover:bg-gray-50">
                          <td className="px-4 py-3">{s.roll_no}</td>
                          <td className="px-4 py-3">{(s as any).reg_no || '-'}</td>
                          <td className="px-4 py-3">{s.name}</td>
                          <td className="px-4 py-3">{s.mentorName}</td>
                          {showBonafide && <td className="px-4 py-3">{bonafideCounts[s.id] || 0}</td>}
                          {showGatepass && <td className="px-4 py-3">{gatepassCounts[s.id] || 0}</td>}
                          {showOD && <td className="px-4 py-3">{s.odCount}</td>}
                          {showLeave && <td className="px-4 py-3">{s.leaveCount}</td>}
                          <td className="px-4 py-3">
                            <button
                              onClick={() => navigate(`/ahod/student/${s.id}?year=${encodeURIComponent(year)}&section=${encodeURIComponent(section)}`)}
                              className="px-3 py-1 bg-blue-600 text-white rounded hover:bg-blue-700"
                            >
                              View
                            </button>
                          </td>
                        </tr>
                      ))
                    )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}
