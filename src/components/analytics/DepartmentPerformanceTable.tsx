import { useEffect, useState } from 'react';
import { TrendingUp, TrendingDown, Users, Award } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { cache, getCacheKey, CACHE_TTL } from '../../lib/cache';
import { fetchInChunks } from '../../lib/supabaseHelpers';

interface DepartmentStats {
  department: string;
  averageAttendance: number;
  totalStudents: number;
  presentToday: number;
  attendanceChange: number;
}

export default function DepartmentPerformanceTable() {
  const [departmentStats, setDepartmentStats] = useState<DepartmentStats[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchDepartmentPerformance();
  }, []);

  const fetchDepartmentPerformance = async () => {
    try {
      setLoading(true);
      setError(null);
      
      const today = new Date().toISOString().split('T')[0];
      const lastWeek = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)
        .toISOString().split('T')[0];

      // Check cache first
      const cacheKey = getCacheKey('dept_performance', today);
      const cached = cache.get<DepartmentStats[]>(cacheKey);
      if (cached) {
        console.log('Loading department performance from cache');
        setDepartmentStats(cached);
        setLoading(false);
        return;
      }

      // Get departments from departments table, excluding Administration
      const { data: departments, error: deptError } = await supabase
        .from('departments')
        .select('id, name')
        .neq('name', 'Administration');

      if (deptError) {
        console.error('Error fetching departments:', deptError);
        throw new Error('Failed to fetch departments: ' + deptError.message);
      }

      if (!departments || departments.length === 0) {
        console.warn('No departments found');
        setDepartmentStats([]);
        setLoading(false);
        return;
      }

      // Get all profiles with their departments
      const { data: allProfiles, error: profilesError } = await supabase
        .from('profiles')
        .select('id, department, role')
        .eq('role', 'student');

      if (profilesError) {
        console.error('Error fetching profiles:', profilesError);
        throw new Error('Failed to fetch student profiles: ' + profilesError.message);
      }

      console.log('Found departments:', departments.map(d => d.name));
      console.log('Found student profiles:', allProfiles?.length || 0);

      // Group students by department
      const studentsByDept = new Map<string, string[]>();
      (allProfiles || []).forEach(profile => {
        if (profile.department) {
          if (!studentsByDept.has(profile.department)) {
            studentsByDept.set(profile.department, []);
          }
          studentsByDept.get(profile.department)!.push(profile.id);
        }
      });

      // Get all student IDs for batch queries
      const allStudentIds = allProfiles?.map(p => p.id) || [];

      if (allStudentIds.length === 0) {
        console.warn('No students found');
        const emptyStats = departments.map(dept => ({
          department: dept.name,
          averageAttendance: 0,
          totalStudents: 0,
          presentToday: 0,
          attendanceChange: 0,
        }));
        setDepartmentStats(emptyStats);
        setLoading(false);
        return;
      }

      // Fetch all attendance data in bulk using chunked queries to avoid very long GET URLs
      const [todayAttendance, lastWeekAttendance] = await Promise.all([
        fetchInChunks(
          'daily_attendance',
          'student_id, status',
          'student_id',
          allStudentIds,
          (q: any) => q.eq('date', today)
        ),
        fetchInChunks(
          'daily_attendance',
          'student_id, status, date',
          'student_id',
          allStudentIds,
          (q: any) => q.gte('date', lastWeek).lt('date', today)
        )
      ]);

      // Process attendance data by department
      const stats: DepartmentStats[] = [];

      for (const dept of departments) {
        const deptName = dept.name;
        const studentIds = studentsByDept.get(deptName) || [];
        
        if (studentIds.length === 0) {
          stats.push({
            department: deptName,
            averageAttendance: 0,
            totalStudents: 0,
            presentToday: 0,
            attendanceChange: 0,
          });
          continue;
        }

        // Filter today's attendance for this department
        const deptTodayAttendance = todayAttendance.filter(
          record => studentIds.includes(record.student_id)
        );

        const presentToday = deptTodayAttendance.filter(
          record => ['present', 'late', 'od'].includes(record.status)
        ).length;

        // Filter last week's attendance for this department
        const deptLastWeekAttendance = lastWeekAttendance.filter(
          record => studentIds.includes(record.student_id)
        );

        // Calculate average attendance over the last week
        const attendanceDays: { [key: string]: number } = {};
        deptLastWeekAttendance.forEach(record => {
          if (!attendanceDays[record.date]) {
            attendanceDays[record.date] = 0;
          }
          if (['present', 'late', 'od'].includes(record.status)) {
            attendanceDays[record.date]++;
          }
        });

        const dailyAttendanceRates = Object.values(attendanceDays).map(
          present => studentIds.length > 0 ? (present / studentIds.length) * 100 : 0
        );

        const averageAttendance = dailyAttendanceRates.length > 0
          ? dailyAttendanceRates.reduce((sum, rate) => sum + rate, 0) / dailyAttendanceRates.length
          : 0;

        // Calculate today's attendance percentage
        const todayPercentage = studentIds.length > 0 ? (presentToday / studentIds.length) * 100 : 0;

        // Calculate change from average
        const attendanceChange = todayPercentage - averageAttendance;

        stats.push({
          department: deptName,
          averageAttendance: Math.round(averageAttendance),
          totalStudents: studentIds.length,
          presentToday,
          attendanceChange: Math.round(attendanceChange * 10) / 10,
        });
      }

      // Sort by average attendance (descending)
      stats.sort((a, b) => b.averageAttendance - a.averageAttendance);

      // Cache the results for 5 minutes
      cache.set(cacheKey, stats, CACHE_TTL.SHORT);

      setDepartmentStats(stats);
    } catch (error: any) {
      console.error('Error fetching department performance:', error);
      setError(error.message || 'Failed to fetch department performance data');
    } finally {
      setLoading(false);
    }
  };

  const getRankIcon = (index: number) => {
    if (index === 0) return <Award className="h-5 w-5 text-yellow-500" />;
    if (index === 1) return <Award className="h-5 w-5 text-gray-400" />;
    if (index === 2) return <Award className="h-5 w-5 text-amber-600" />;
    return <span className="text-slate-600 font-semibold">#{index + 1}</span>;
  };

  const getAttendanceColor = (percentage: number) => {
    if (percentage >= 85) return 'text-green-600';
    if (percentage >= 75) return 'text-yellow-600';
    return 'text-red-600';
  };

  const getChangeIcon = (change: number) => {
    if (change > 0) return <TrendingUp className="h-4 w-4 text-green-500" />;
    if (change < 0) return <TrendingDown className="h-4 w-4 text-red-500" />;
    return <div className="h-4 w-4 rounded-full bg-gray-400"></div>;
  };

  if (loading) {
    return (
      <div className="bg-white rounded-xl shadow-lg border border-slate-200 p-6">
        <h2 className="text-lg font-bold text-slate-800 mb-4 flex items-center">
          <Users className="h-5 w-5 mr-2 text-blue-600" />
          Department Performance Ranking
        </h2>
        <div className="flex items-center justify-center h-64">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
          <span className="ml-2 text-slate-600">Loading department data...</span>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-white rounded-xl shadow-lg border border-slate-200 p-6">
        <h2 className="text-lg font-bold text-slate-800 mb-4 flex items-center">
          <Users className="h-5 w-5 mr-2 text-blue-600" />
          Department Performance Ranking
        </h2>
        <div className="flex items-center justify-center h-64">
          <div className="text-center">
            <div className="text-red-500 text-lg mb-2">⚠️</div>
            <p className="text-red-600">{error}</p>
            <button
              onClick={fetchDepartmentPerformance}
              className="mt-2 px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700 transition-colors"
            >
              Retry
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-xl shadow-lg border border-slate-200 p-6">
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-lg font-bold text-slate-800 flex items-center">
          <Users className="h-5 w-5 mr-2 text-blue-600" />
          Department Performance Ranking
        </h2>
        <div className="text-sm text-slate-500">
          Based on average attendance
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="border-b border-slate-200">
              <th className="text-left py-3 px-2 text-sm font-semibold text-slate-600">
                Rank
              </th>
              <th className="text-left py-3 px-2 text-sm font-semibold text-slate-600">
                Department
              </th>
              <th className="text-center py-3 px-2 text-sm font-semibold text-slate-600">
                Avg. Attendance
              </th>
              <th className="text-center py-3 px-2 text-sm font-semibold text-slate-600">
                Today
              </th>
              <th className="text-center py-3 px-2 text-sm font-semibold text-slate-600">
                Students
              </th>
              <th className="text-center py-3 px-2 text-sm font-semibold text-slate-600">
                Trend
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {departmentStats.map((dept, index) => (
              <tr 
                key={dept.department} 
                className={`hover:bg-slate-50 transition-colors ${
                  index < 3 ? 'bg-gradient-to-r from-blue-50 to-transparent' : ''
                }`}
              >
                <td className="py-4 px-2">
                  <div className="flex items-center">
                    {getRankIcon(index)}
                  </div>
                </td>
                <td className="py-4 px-2">
                  <div className="font-medium text-slate-800">
                    {dept.department}
                  </div>
                </td>
                <td className="py-4 px-2 text-center">
                  <div className={`text-lg font-bold ${getAttendanceColor(dept.averageAttendance)}`}>
                    {dept.averageAttendance}%
                  </div>
                </td>
                <td className="py-4 px-2 text-center">
                  <div className="text-sm text-slate-600">
                    {dept.presentToday} / {dept.totalStudents}
                  </div>
                  <div className="text-xs text-slate-500">
                    {dept.totalStudents > 0 
                      ? Math.round((dept.presentToday / dept.totalStudents) * 100)
                      : 0}%
                  </div>
                </td>
                <td className="py-4 px-2 text-center">
                  <div className="text-sm font-medium text-slate-700">
                    {dept.totalStudents}
                  </div>
                </td>
                <td className="py-4 px-2 text-center">
                  <div className="flex items-center justify-center gap-1">
                    {getChangeIcon(dept.attendanceChange)}
                    <span className={`text-xs font-medium ${
                      dept.attendanceChange > 0 
                        ? 'text-green-600' 
                        : dept.attendanceChange < 0 
                        ? 'text-red-600' 
                        : 'text-slate-500'
                    }`}>
                      {dept.attendanceChange > 0 ? '+' : ''}
                      {dept.attendanceChange.toFixed(1)}%
                    </span>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {departmentStats.length === 0 && (
        <div className="text-center py-8">
          <Users className="h-12 w-12 mx-auto text-slate-300 mb-2" />
          <p className="text-slate-500">No department data available</p>
        </div>
      )}

      {/* Summary Footer */}
      {departmentStats.length > 0 && (
        <div className="mt-6 pt-4 border-t border-slate-200">
          <div className="grid grid-cols-3 gap-4 text-center">
            <div>
              <div className="text-lg font-bold text-blue-600">
                {Math.round(
                  departmentStats.reduce((sum, dept) => sum + dept.averageAttendance, 0) / 
                  departmentStats.length
                )}%
              </div>
              <div className="text-xs text-slate-600">Overall Average</div>
            </div>
            <div>
              <div className="text-lg font-bold text-green-600">
                {departmentStats.filter(dept => dept.averageAttendance >= 75).length}
              </div>
              <div className="text-xs text-slate-600">Above 75%</div>
            </div>
            <div>
              <div className="text-lg font-bold text-slate-700">
                {departmentStats.reduce((sum, dept) => sum + dept.totalStudents, 0)}
              </div>
              <div className="text-xs text-slate-600">Total Students</div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}