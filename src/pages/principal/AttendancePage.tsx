import { useEffect, useState } from 'react';
import DashboardLayout from '../../components/DashboardLayout';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { Users, Calendar, TrendingUp, TrendingDown, BarChart3 } from 'lucide-react';
import { cache, getCacheKey, CACHE_TTL } from '../../lib/cache';

interface StudentAttendance {
  student_id: string;
  student_name: string;
  department: string;
  year: number;
  section: string;
  total_days: number;
  present_days: number;
  absent_days: number;
  percentage: number;
}

export default function AttendancePage() {
  const { profile } = useAuth();
  const [loading, setLoading] = useState(false);
  const [attendance, setAttendance] = useState<StudentAttendance[]>([]);
  const [departments, setDepartments] = useState<string[]>([]);
  const [years, setYears] = useState<number[]>([]);
  const [selectedDept, setSelectedDept] = useState('');
  const [selectedYear, setSelectedYear] = useState<number | ''>('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [periodType, setPeriodType] = useState<'range' | 'year' | 'month'>('range');
  const [selectedMonth, setSelectedMonth] = useState<number | ''>('');

  const [overallAllPct, setOverallAllPct] = useState<number | null>(null);
  const [deptAllYearsPct, setDeptAllYearsPct] = useState<number | null>(null);
  const [perYearPct, setPerYearPct] = useState<Array<{ year: number; percentage: number; students: number }>>([]);
  const [perSectionPct, setPerSectionPct] = useState<Array<{ section: string; percentage: number; students: number }>>([]);

  // Check if user is authorized (principal or IQAC HOD)
  const isAuthorized = profile?.role === 'principal' || 
    (profile?.role === 'hod' && profile?.department === 'IQAC');

  if (!isAuthorized) {
    return (
      <DashboardLayout>
        <div className="min-h-screen bg-slate-100 flex items-center justify-center">
          <div className="text-center">
            <h2 className="text-2xl font-bold text-slate-800 mb-4">Access Denied</h2>
            <p className="text-slate-600">You don't have permission to access this page.</p>
          </div>
        </div>
      </DashboardLayout>
    );
  }

  useEffect(() => {
    // Load departments and years on mount
    (async () => {
      try {
        console.log('Loading attendance page filters...');
        const [depsRes, yearsRes] = await Promise.all([
          supabase.from('profiles').select('department').not('department', 'is', null).eq('role', 'student'),
          supabase.from('students').select('year'),
        ]);

        if (depsRes.error) {
          console.error('Error loading departments:', depsRes.error);
        }
        if (yearsRes.error) {
          console.error('Error loading years:', yearsRes.error);
        }

        const deps = Array.from(new Set((depsRes.data || []).map((d: any) => d.department).filter(Boolean))).sort() as string[];
        setDepartments(deps);
        console.log('Departments loaded:', deps);

        const yrs = Array.from(new Set((yearsRes.data || []).map((s: any) => s.year).filter(Boolean))) as number[];
        setYears(yrs.sort());
        console.log('Years loaded:', yrs);
      } catch (e) {
        console.error('Failed to load filters', e);
      }
    })();
  }, []);

  const fetchAttendance = async () => {
    if (!selectedDept || !selectedYear) {
      setAttendance([]);
      setOverallAllPct(null);
      setDeptAllYearsPct(null);
      setPerYearPct([]);
      setPerSectionPct([]);
      return;
    }

    setLoading(true);
    try {
      // Determine date range based on selected period or explicit dates
      let fromDate = dateFrom;
      let toDate = dateTo;
      if (periodType === 'year' && selectedYear) {
        fromDate = `${selectedYear}-01-01`;
        toDate = `${selectedYear}-12-31`;
      } else if (periodType === 'month' && selectedYear && selectedMonth) {
        const mm = String(selectedMonth).padStart(2, '0');
        const year = String(selectedYear);
        const start = `${year}-${mm}-01`;
        // compute last day of month
        const lastDay = new Date(Number(year), Number(selectedMonth), 0).getDate();
        const end = `${year}-${mm}-${String(lastDay).padStart(2, '0')}`;
        fromDate = start;
        toDate = end;
      }

      // Check cache first
      const cacheKey = getCacheKey('attendance', selectedDept, selectedYear, fromDate, toDate);
      const cached = cache.get<any>(cacheKey);
      if (cached) {
        console.log('Loading attendance data from cache');
        setAttendance(cached.attendance);
        setOverallAllPct(cached.overallAllPct);
        setDeptAllYearsPct(cached.deptAllYearsPct);
        setPerYearPct(cached.perYearPct);
        setPerSectionPct(cached.perSectionPct);
        setLoading(false);
        return;
      }

      // Get profiles for the selected department first
      const { data: deptProfiles, error: deptProfilesError } = await supabase
        .from('profiles')
        .select('id, name, department')
        .eq('department', selectedDept)
        .eq('role', 'student');

      if (deptProfilesError) {
        console.error('Error fetching profiles:', deptProfilesError);
        setAttendance([]);
        setLoading(false);
        return;
      }

      if (!deptProfiles || deptProfiles.length === 0) {
        console.log('No students found for department:', selectedDept);
        setAttendance([]);
        setLoading(false);
        return;
      }

      const deptStudentIds = deptProfiles.map(p => p.id);

      // Get students matching the selected year from the filtered IDs
      const { data: students, error: studentsError } = await supabase
        .from('students')
        .select('id, year, section')
        .in('id', deptStudentIds)
        .eq('year', selectedYear);

      if (studentsError) {
        console.error('Error fetching students:', studentsError);
        setAttendance([]);
        setLoading(false);
        return;
      }

      if (!students || students.length === 0) {
        console.log('No students found for year:', selectedYear);
        setAttendance([]);
        setLoading(false);
        return;
      }

      const studentIds = students.map((s: any) => s.id);

      // Create profile map from the dept profiles we already fetched
      const profileMap = new Map(deptProfiles.map((p: any) => [p.id, p.name]));

      // Fetch attendance records for the date range (or all if no range specified)
      // Fetch attendance records for table scope (students in selected dept+year)
      let query = supabase
        .from('daily_attendance')
        .select('student_id, status, date')
        .in('student_id', studentIds);

      if (fromDate) query = query.gte('date', fromDate);
      if (toDate) query = query.lte('date', toDate);

      const { data: attendanceRecords, error: attError } = await query;
      
      if (attError) {
        console.error('Error fetching attendance records:', attError);
      }

      console.log('Attendance records fetched:', attendanceRecords?.length || 0);

      // For aggregates, we need all students with their departments
      // First get all profiles to map student_id to department
      const { data: allProfiles } = await supabase
        .from('profiles')
        .select('id, department')
        .eq('role', 'student');
      
      const studentDeptMap = new Map((allProfiles || []).map((p: any) => [p.id, p.department]));

      // Fetch all students
      const { data: allStudents } = await supabase
        .from('students')
        .select('id, year, section');

      // Enhance allStudents with department from profiles
      const allStudentsWithDept = (allStudents || []).map((s: any) => ({
        ...s,
        department: studentDeptMap.get(s.id) || ''
      }));

      // Fetch attendance records for global aggregates (all students in period)
      let aggQuery = supabase.from('daily_attendance').select('student_id, status, date');
      if (fromDate) aggQuery = aggQuery.gte('date', fromDate);
      if (toDate) aggQuery = aggQuery.lte('date', toDate);
      const { data: allAttendanceRecords } = await aggQuery;

      // Calculate attendance stats for table
      const stats: Record<string, StudentAttendance> = {};

      students.forEach((student: any) => {
        stats[student.id] = {
          student_id: student.id,
          student_name: profileMap.get(student.id) || 'Unknown',
          department: selectedDept,
          year: student.year,
          section: student.section || '-',
          total_days: 0,
          present_days: 0,
          absent_days: 0,
          percentage: 0,
        };
      });

      // Count attendance per student for table
      const dateCountMap: Record<string, Set<string>> = {};
      (attendanceRecords || []).forEach((record: any) => {
        const sid = record.student_id;
        if (!dateCountMap[sid]) dateCountMap[sid] = new Set();
        dateCountMap[sid].add(record.date);

        if (stats[sid]) {
          stats[sid].total_days = dateCountMap[sid].size;
          if (['present', 'late', 'od'].includes(record.status)) {
            stats[sid].present_days++;
          } else if (record.status === 'absent') {
            stats[sid].absent_days++;
          }
        }
      });

      // Calculate percentages
      Object.values(stats).forEach((stat) => {
        stat.percentage = stat.total_days > 0 
          ? Math.round((stat.present_days / stat.total_days) * 100)
          : 0;
      });

      const result = Object.values(stats).sort((a, b) => a.student_name.localeCompare(b.student_name));
      setAttendance(result);
      console.log('Attendance table data set:', result.length, 'students');

      // --- Aggregates ---
      // overallAllPct: across all departments in period
      const studentAggMap: Record<string, { present: number; totalDates: Set<string> }> = {};
      (allAttendanceRecords || []).forEach((rec: any) => {
        const sid = rec.student_id;
        if (!studentAggMap[sid]) studentAggMap[sid] = { present: 0, totalDates: new Set() };
        studentAggMap[sid].totalDates.add(rec.date);
        if (['present', 'late', 'od'].includes(rec.status)) studentAggMap[sid].present++;
      });

      let totalPresent = 0;
      let totalPossible = 0;
      allStudentsWithDept.forEach((st: any) => {
        const agg = studentAggMap[st.id];
        if (agg) {
          totalPresent += agg.present;
          totalPossible += agg.totalDates.size;
        }
      });
      const overallPct = totalPossible > 0 ? Math.round((totalPresent / totalPossible) * 100) : 0;
      setOverallAllPct(overallPct);

      // deptAllYearsPct: for selectedDept across all years
      const deptStudents = allStudentsWithDept.filter((s: any) => s.department === selectedDept);
      let deptPresent = 0;
      let deptPossible = 0;
      deptStudents.forEach((st: any) => {
        const agg = studentAggMap[st.id];
        if (agg) {
          deptPresent += agg.present;
          deptPossible += agg.totalDates.size;
        }
      });
      const deptPct = deptPossible > 0 ? Math.round((deptPresent / deptPossible) * 100) : 0;
      setDeptAllYearsPct(deptPct);

      // perYearPct: breakdown for selectedDept by year
      const yearsMap: Record<number, { present: number; possible: number; students: Set<string> }> = {};
      deptStudents.forEach((st: any) => {
        const y = Number(st.year) || 0;
        if (!yearsMap[y]) yearsMap[y] = { present: 0, possible: 0, students: new Set() };
        const agg = studentAggMap[st.id];
        if (agg) {
          yearsMap[y].present += agg.present;
          yearsMap[y].possible += agg.totalDates.size;
        }
        yearsMap[y].students.add(st.id);
      });
      const perYearArr = Object.keys(yearsMap).map((k) => {
        const y = Number(k);
        const entry = yearsMap[y];
        return {
          year: y,
          percentage: entry.possible > 0 ? Math.round((entry.present / entry.possible) * 100) : 0,
          students: entry.students.size,
        };
      }).sort((a, b) => a.year - b.year);
      setPerYearPct(perYearArr);

      // perSectionPct: for selectedDept and selectedYear, breakdown by section
      const sectionMap: Record<string, { present: number; possible: number; students: Set<string> }> = {};
      allStudentsWithDept.forEach((st: any) => {
        if (st.department === selectedDept && Number(st.year) === Number(selectedYear)) {
          const sec = st.section || '-';
          if (!sectionMap[sec]) sectionMap[sec] = { present: 0, possible: 0, students: new Set() };
          const agg = studentAggMap[st.id];
          if (agg) {
            sectionMap[sec].present += agg.present;
            sectionMap[sec].possible += agg.totalDates.size;
          }
          sectionMap[sec].students.add(st.id);
        }
      });
      const perSectionArr = Object.keys(sectionMap).map((k) => ({
        section: k,
        percentage: sectionMap[k].possible > 0 ? Math.round((sectionMap[k].present / sectionMap[k].possible) * 100) : 0,
        students: sectionMap[k].students.size,
      }));
      setPerSectionPct(perSectionArr);

      // Cache all the results
      const cacheData = {
        attendance: attendance,
        overallAllPct: overallPct,
        deptAllYearsPct: deptPct,
        perYearPct: perYearArr,
        perSectionPct: perSectionArr
      };
      cache.set(cacheKey, cacheData, CACHE_TTL.SHORT);

    } catch (error) {
      console.error('Error fetching attendance:', error);
      setAttendance([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAttendance();
  }, [selectedDept, selectedYear, dateFrom, dateTo]);

  const getAttendanceColor = (percentage: number) => {
    if (percentage >= 75) return 'bg-green-100 text-green-800';
    if (percentage >= 60) return 'bg-yellow-100 text-yellow-800';
    return 'bg-red-100 text-red-800';
  };

  const sidebarItems = [
    { label: 'Dashboard', path: '/principal-dashboard', icon: <Users className="h-5 w-5" /> },
  ];

  return (
    <DashboardLayout sidebarItems={sidebarItems}>
      <div className="max-w-7xl mx-auto">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-slate-800 flex items-center gap-3">
            <Calendar className="h-8 w-8 text-blue-600" />
            Student Attendance
          </h1>
          <p className="text-slate-600 mt-1">View and manage student attendance records</p>
        </div>

        {/* Filters */}
        <div className="bg-white rounded-xl shadow-lg border border-slate-200 p-6 mb-6">
          <h2 className="text-lg font-semibold text-slate-800 mb-4">Filters</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">Period</label>
              <select
                value={periodType}
                onChange={(e) => setPeriodType(e.target.value as any)}
                className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="range">Custom Range</option>
                <option value="year">Year</option>
                <option value="month">Month</option>
              </select>
            </div>

            {periodType === 'month' && (
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">Month</label>
                <select
                  value={selectedMonth}
                  onChange={(e) => setSelectedMonth(e.target.value ? Number(e.target.value) : '')}
                  className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="">Select Month</option>
                  {[...Array(12)].map((_, i) => (
                    <option key={i + 1} value={i + 1}>{new Date(0, i).toLocaleString(undefined, { month: 'long' })}</option>
                  ))}
                </select>
              </div>
            )}
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">Department</label>
              <select
                value={selectedDept}
                onChange={(e) => setSelectedDept(e.target.value)}
                className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="">Select Department</option>
                {departments.map((dept) => (
                  <option key={dept} value={dept}>{dept}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">Year</label>
              <select
                value={selectedYear}
                onChange={(e) => setSelectedYear(e.target.value ? Number(e.target.value) : '')}
                className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="">Select Year</option>
                {years.map((year) => (
                  <option key={year} value={year}>Year {year}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">From Date</label>
              <input
                type="date"
                value={dateFrom}
                onChange={(e) => setDateFrom(e.target.value)}
                className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">To Date</label>
              <input
                type="date"
                value={dateTo}
                onChange={(e) => setDateTo(e.target.value)}
                className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            <div className="flex items-end">
              <button
                onClick={fetchAttendance}
                disabled={loading}
                className="w-full bg-blue-600 hover:bg-blue-700 text-white font-medium py-2 px-4 rounded-lg transition-colors disabled:opacity-50"
              >
                {loading ? 'Loading...' : 'Refresh'}
              </button>
            </div>
          </div>
        </div>

        {/* Statistics */}
        {attendance.length > 0 && (
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
            <div className="bg-white rounded-lg shadow border border-slate-200 p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-slate-600">Total Students</p>
                  <p className="text-2xl font-bold text-slate-800">{attendance.length}</p>
                </div>
                <Users className="h-8 w-8 text-blue-500" />
              </div>
            </div>

            <div className="bg-white rounded-lg shadow border border-slate-200 p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-slate-600">High Attendance (≥75%)</p>
                  <p className="text-2xl font-bold text-green-600">
                    {attendance.filter((a) => a.percentage >= 75).length}
                  </p>
                </div>
                <TrendingUp className="h-8 w-8 text-green-500" />
              </div>
            </div>

            <div className="bg-white rounded-lg shadow border border-slate-200 p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-slate-600">Average Attendance</p>
                  <p className="text-2xl font-bold text-slate-800">
                    {Math.round(
                      attendance.reduce((sum, a) => sum + a.percentage, 0) / attendance.length
                    )}%
                  </p>
                </div>
                <BarChart3 className="h-8 w-8 text-purple-500" />
              </div>
            </div>

            <div className="bg-white rounded-lg shadow border border-slate-200 p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-slate-600">Low Attendance (&lt;60%)</p>
                  <p className="text-2xl font-bold text-red-600">
                    {attendance.filter((a) => a.percentage < 60).length}
                  </p>
                </div>
                <TrendingDown className="h-8 w-8 text-red-500" />
              </div>
            </div>
          </div>
        )}

        {/* Aggregated Metrics requested: overall all-departments, dept all-years, sections breakdown */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
          <div className="bg-white rounded-lg shadow border border-slate-200 p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-slate-600">Overall Attendance (All Departments)</p>
                <p className="text-2xl font-bold text-slate-800">
                  {overallAllPct === null ? '—' : `${overallAllPct}%`}
                </p>
                <p className="text-xs text-slate-500 mt-1">Period: {periodType === 'range' ? `${dateFrom || 'any'} to ${dateTo || 'any'}` : periodType === 'year' ? `Year ${selectedYear || '—'}` : periodType === 'month' ? `${selectedMonth || '—'}/${selectedYear || '—'}` : ''}</p>
              </div>
              <BarChart3 className="h-8 w-8 text-blue-500" />
            </div>
          </div>

          <div className="bg-white rounded-lg shadow border border-slate-200 p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-slate-600">{selectedDept || 'Department'} (All Years)</p>
                <p className="text-2xl font-bold text-slate-800">
                  {deptAllYearsPct === null ? '—' : `${deptAllYearsPct}%`}
                </p>
                <p className="text-xs text-slate-500 mt-1">Combined for all years in department</p>
              </div>
              <Users className="h-8 w-8 text-green-500" />
            </div>
            {perYearPct.length > 0 && (
              <div className="mt-3 grid grid-cols-2 gap-2">
                {perYearPct.map((y) => (
                  <div key={y.year} className="text-xs bg-slate-50 p-2 rounded">
                    <div className="font-semibold">Year {y.year}</div>
                    <div className="text-sm">{y.percentage}% ({y.students})</div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="bg-white rounded-lg shadow border border-slate-200 p-4">
            <div>
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-slate-600">Sections — Year {selectedYear || '—'}</p>
                  <p className="text-2xl font-bold text-slate-800">Details</p>
                </div>
              </div>
              <div className="mt-3 grid grid-cols-1 gap-2">
                {perSectionPct.length === 0 ? (
                  <div className="text-sm text-slate-500">No section data</div>
                ) : (
                  perSectionPct.map((s) => (
                    <div key={s.section} className="flex items-center justify-between text-sm bg-slate-50 p-2 rounded">
                      <div>{s.section}</div>
                      <div className="font-semibold">{s.percentage}% ({s.students})</div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Attendance Table */}
        <div className="bg-white rounded-xl shadow-lg border border-slate-200 overflow-hidden">
          {loading ? (
            <div className="p-8 text-center">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
              <p className="mt-4 text-slate-600">Loading attendance...</p>
            </div>
          ) : attendance.length === 0 ? (
            <div className="p-8 text-center">
              <p className="text-slate-500">No attendance records found. Please select department and year.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-slate-100 border-b border-slate-200">
                  <tr>
                    <th className="px-4 py-3 text-left font-semibold text-slate-700">Student Name</th>
                    <th className="px-4 py-3 text-left font-semibold text-slate-700">Roll No / ID</th>
                    <th className="px-4 py-3 text-center font-semibold text-slate-700">Year</th>
                    <th className="px-4 py-3 text-center font-semibold text-slate-700">Section</th>
                    <th className="px-4 py-3 text-center font-semibold text-slate-700">Total Days</th>
                    <th className="px-4 py-3 text-center font-semibold text-slate-700">Present</th>
                    <th className="px-4 py-3 text-center font-semibold text-slate-700">Absent</th>
                    <th className="px-4 py-3 text-center font-semibold text-slate-700">Percentage</th>
                  </tr>
                </thead>
                <tbody>
                  {attendance.map((record, idx) => (
                    <tr key={record.student_id} className={idx % 2 === 0 ? 'bg-white' : 'bg-slate-50'}>
                      <td className="px-4 py-3 font-medium text-slate-800">{record.student_name}</td>
                      <td className="px-4 py-3 text-slate-600">{record.student_id}</td>
                      <td className="px-4 py-3 text-center text-slate-600">{record.year}</td>
                      <td className="px-4 py-3 text-center text-slate-600">{record.section}</td>
                      <td className="px-4 py-3 text-center font-semibold text-slate-800">{record.total_days}</td>
                      <td className="px-4 py-3 text-center text-green-600 font-semibold">{record.present_days}</td>
                      <td className="px-4 py-3 text-center text-red-600 font-semibold">{record.absent_days}</td>
                      <td className="px-4 py-3 text-center">
                        <span className={`inline-flex items-center px-3 py-1 rounded-full text-sm font-semibold ${getAttendanceColor(record.percentage)}`}>
                          {record.percentage}%
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </DashboardLayout>
  );
}
