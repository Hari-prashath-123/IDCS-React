import { useState, useEffect } from 'react';
import DashboardLayout from '../../components/DashboardLayout';
import { Home, BookOpen, CalendarCheck, CheckCircle, XCircle, Clock, FileText, Plane } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';

interface OverallAttendance {
  totalDays: number;
  present: number;
  absent: number;
  late: number;
  od: number;
  leave: number;
  percentage: number;
}

interface SubjectAttendance {
  subject_id: string;
  subject_name: string;
  subject_code: string;
  parent_code?: string;
  totalClasses: number;
  present: number;
  absent: number;
  late: number;
  od: number;
  leave: number;
  percentage: number;
}

interface AbsentRecord {
  date: string;
  period?: number;
  status: 'absent' | 'leave' | 'late' | 'od';
  subject?: string;
  type: 'daily' | 'period';
}

export default function Attendance() {
  const { user } = useAuth();
  const [overallAttendance, setOverallAttendance] = useState<OverallAttendance | null>(null);
  const [subjectAttendance, setSubjectAttendance] = useState<SubjectAttendance[]>([]);
  const [absentRecords, setAbsentRecords] = useState<AbsentRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'overall' | 'subject' | 'records'>('overall');
  const [recordFilter, setRecordFilter] = useState<'absent' | 'leave' | 'late' | 'od'>('absent');

  const sidebarItems = [
    { label: 'Dashboard', path: '/student-dashboard', icon: <Home className="h-5 w-5" /> },
    { label: 'My Electives', path: '/student/electives', icon: <BookOpen className="h-5 w-5" /> },
    { label: 'My Attendance', path: '/student/attendance', icon: <CalendarCheck className="h-5 w-5" /> },
  ];

  useEffect(() => {
    if (user?.id) {
      fetchAttendanceData();
    }
  }, [user?.id]);

  const fetchAttendanceData = async () => {
    setLoading(true);
    try {
      await Promise.all([
        fetchOverallAttendance(), 
        fetchSubjectAttendance(),
        fetchAbsentRecords()
      ]);
    } catch (error) {
      console.error('Error fetching attendance:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchOverallAttendance = async () => {
    if (!user?.id) return;

    console.log('Calculating overall attendance...');

    // Get all daily attendance
    const { data: dailyData, error: dailyError } = await supabase
      .from('daily_attendance')
      .select('date, status')
      .eq('student_id', user.id);

    if (dailyError) {
      console.error('Error fetching daily attendance:', dailyError);
      return;
    }

    console.log('Daily attendance records:', dailyData);

    // Get all period attendance
    const { data: periodData, error: periodError } = await supabase
      .from('period_attendance')
      .select('date, period, status')
      .eq('student_id', user.id);

    if (periodError) {
      console.error('Error fetching period attendance for overall calc:', periodError);
      return;
    }

    console.log('Period attendance records:', periodData);

    // Assume 7 periods per day
    const PERIODS_PER_DAY = 7;

    // Create a map to track attendance for each date and period
    const attendanceMap = new Map<string, Map<number, string>>();

    // First, populate from daily attendance (all periods for that day)
    dailyData?.forEach(day => {
      const dateKey = day.date;
      if (!attendanceMap.has(dateKey)) {
        attendanceMap.set(dateKey, new Map());
      }
      const dayMap = attendanceMap.get(dateKey)!;
      
      // Set all 7 periods to the daily status
      for (let period = 1; period <= PERIODS_PER_DAY; period++) {
        dayMap.set(period, day.status);
      }
    });

    // Then, override with specific period attendance (manual marking takes precedence)
    periodData?.forEach(record => {
      const dateKey = record.date;
      if (!attendanceMap.has(dateKey)) {
        attendanceMap.set(dateKey, new Map());
      }
      const dayMap = attendanceMap.get(dateKey)!;
      
      // Override this specific period
      dayMap.set(record.period, record.status);
    });

    console.log('Final attendance map:', attendanceMap);

    // Calculate totals
    let totalPeriods = 0;
    let presentCount = 0;
    let absentCount = 0;
    let lateCount = 0;
    let odCount = 0;
    let leaveCount = 0;

    attendanceMap.forEach((dayMap) => {
      dayMap.forEach((status) => {
        totalPeriods++;
        switch (status) {
          case 'present':
            presentCount++;
            break;
          case 'absent':
            absentCount++;
            break;
          case 'late':
            lateCount++;
            break;
          case 'od':
            odCount++;
            break;
          case 'leave':
            leaveCount++;
            break;
        }
      });
    });

    // Calculate percentage (present + od + late considered as attended)
    const attended = presentCount + odCount + lateCount;
    const percentage = totalPeriods > 0 ? (attended / totalPeriods) * 100 : 0;

    console.log('Overall attendance calculation:', {
      totalPeriods,
      presentCount,
      absentCount,
      lateCount,
      odCount,
      leaveCount,
      percentage
    });

    const totalDays = dailyData?.length || 0;

    setOverallAttendance({
      totalDays,
      present: presentCount,
      absent: absentCount,
      late: lateCount,
      od: odCount,
      leave: leaveCount,
      percentage
    });
  };

  const fetchSubjectAttendance = async () => {
    if (!user?.id) return;

    console.log('Fetching subject attendance for student:', user.id);

    // First, get student's elective assignments to map parent subjects to subelectives
    const { data: electiveAssignments, error: electiveError } = await supabase
      .from('student_electives')
      .select(`
        elective_id,
        electives (
          id,
          sub_name,
          course_code,
          parent_subject_id
        )
      `)
      .eq('student_id', user.id);

    if (electiveError) {
      console.error('Error fetching elective assignments:', electiveError);
    }

    console.log('Student elective assignments:', electiveAssignments);

    // Now get parent subject details for each elective
    const parentSubjectIds = new Set<string>();
    electiveAssignments?.forEach((assignment: any) => {
      if (assignment.electives?.parent_subject_id) {
        parentSubjectIds.add(assignment.electives.parent_subject_id);
      }
    });

    // Fetch parent subject info
    let parentSubjects = new Map<string, { name: string; code: string }>();
    if (parentSubjectIds.size > 0) {
      const { data: parentData, error: parentError } = await supabase
        .from('subjects')
        .select('id, name, subject_code')
        .in('id', Array.from(parentSubjectIds));

      if (parentError) {
        console.error('Error fetching parent subjects:', parentError);
      }

      parentData?.forEach((subject: any) => {
        parentSubjects.set(subject.id, {
          name: subject.name,
          code: subject.subject_code
        });
      });
    }

    console.log('Parent subjects:', parentSubjects);

    // Create TWO maps:
    // 1. Map parent_subject_id -> subelective info (for when attendance uses parent subject)
    // 2. Map elective_id -> subelective info (for when attendance uses elective subject directly)
    const parentToElectiveMap = new Map<string, { name: string; code: string; parentCode: string; parentName: string }>();
    const electiveIdMap = new Map<string, { name: string; code: string; parentCode: string; parentName: string }>();
    
    electiveAssignments?.forEach((assignment: any) => {
      const elective = assignment.electives;
      if (elective) {
        const parentInfo = elective.parent_subject_id ? parentSubjects.get(elective.parent_subject_id) : undefined;
        const electiveInfo = {
          name: elective.sub_name,
          code: elective.course_code,
          parentCode: parentInfo?.code || '',
          parentName: parentInfo?.name || ''
        };
        
        // Map by parent subject ID
        if (elective.parent_subject_id) {
          parentToElectiveMap.set(elective.parent_subject_id, electiveInfo);
        }
        
        // Map by elective ID itself
        if (elective.id) {
          electiveIdMap.set(elective.id, electiveInfo);
        }
      }
    });

    console.log('Parent to elective map:', parentToElectiveMap);
    console.log('Elective ID map:', electiveIdMap);

    const { data: attendanceData, error: attendanceError } = await supabase
      .from('period_attendance')
      .select(`
        subject_id,
        status,
        subjects (
          name,
          subject_code,
          id
        )
      `)
      .eq('student_id', user.id);

    if (attendanceError) {
      console.error('Error fetching subject attendance:', attendanceError);
      console.error('Full error:', JSON.stringify(attendanceError, null, 2));
      return;
    }

    console.log('Raw period attendance data:', attendanceData);
    console.log('Number of attendance records:', attendanceData?.length || 0);

    // Group by subject
    const subjectMap = new Map<string, SubjectAttendance>();

    attendanceData?.forEach((record: any) => {
      const subjectId = record.subject_id;
      console.log('Processing record for subject_id:', subjectId, 'Record:', record);
      
      if (!subjectMap.has(subjectId)) {
        const subjectInfo = record.subjects;
        let displayName = subjectInfo?.name || 'Unknown';
        let displayCode = subjectInfo?.subject_code || '';
        let parentCode: string | undefined = undefined;

        // Check both maps: first if this is directly an elective, then if it's a parent subject
        let electiveInfo = electiveIdMap.get(subjectId) || parentToElectiveMap.get(subjectId);
        console.log('Checking subject_id', subjectId, 'in elective maps:', electiveInfo);
        
        if (electiveInfo) {
          // This is an elective, show the subelective name and code with parent info
          displayName = `${electiveInfo.name} (${electiveInfo.parentName})`;
          displayCode = electiveInfo.code;
          parentCode = electiveInfo.parentCode;
        }

        subjectMap.set(subjectId, {
          subject_id: subjectId,
          subject_name: displayName,
          subject_code: displayCode,
          parent_code: parentCode,
          totalClasses: 0,
          present: 0,
          absent: 0,
          late: 0,
          od: 0,
          leave: 0,
          percentage: 0
        });
      }

      const subject = subjectMap.get(subjectId)!;
      subject.totalClasses++;

      switch (record.status) {
        case 'present':
          subject.present++;
          break;
        case 'absent':
          subject.absent++;
          break;
        case 'late':
          subject.late++;
          break;
        case 'od':
          subject.od++;
          break;
        case 'leave':
          subject.leave++;
          break;
      }
    });

    console.log('Subject map:', subjectMap);

    // Calculate percentages
    const subjects = Array.from(subjectMap.values()).map(subject => {
      const attended = subject.present + subject.od + subject.late;
      subject.percentage = subject.totalClasses > 0 ? (attended / subject.totalClasses) * 100 : 0;
      return subject;
    });

    console.log('Final subject attendance:', subjects);
    setSubjectAttendance(subjects);
  };

  const fetchAbsentRecords = async () => {
    if (!user?.id) return;

    const records: AbsentRecord[] = [];

    // Fetch daily attendance (absent, leave, late, od)
    const { data: dailyData } = await supabase
      .from('daily_attendance')
      .select('date, status')
      .eq('student_id', user.id)
      .in('status', ['absent', 'leave', 'late', 'od'])
      .order('date', { ascending: false });

    dailyData?.forEach(record => {
      records.push({
        date: record.date,
        status: record.status as 'absent' | 'leave' | 'late' | 'od',
        type: 'daily'
      });
    });

    // Fetch period attendance (absent, leave, late, od)
    const { data: periodData } = await supabase
      .from('period_attendance')
      .select(`
        date,
        period,
        status,
        subjects (
          name
        )
      `)
      .eq('student_id', user.id)
      .in('status', ['absent', 'leave', 'late', 'od'])
      .order('date', { ascending: false });

    periodData?.forEach((record: any) => {
      records.push({
        date: record.date,
        period: record.period,
        status: record.status as 'absent' | 'leave' | 'late' | 'od',
        subject: record.subjects?.name || 'Unknown',
        type: 'period'
      });
    });

    // Sort by date descending
    records.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

    setAbsentRecords(records);
  };

  const getPercentageColor = (percentage: number) => {
    if (percentage >= 75) return 'text-green-600';
    if (percentage >= 60) return 'text-yellow-600';
    return 'text-red-600';
  };

  const getPercentageBgColor = (percentage: number) => {
    if (percentage >= 75) return 'bg-green-50 border-green-200';
    if (percentage >= 60) return 'bg-yellow-50 border-yellow-200';
    return 'bg-red-50 border-red-200';
  };

  if (loading) {
    return (
      <DashboardLayout sidebarItems={sidebarItems}>
        <div className="flex justify-center items-center h-64">
          <div className="text-gray-500">Loading attendance data...</div>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout sidebarItems={sidebarItems}>
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between items-center mb-4 sm:mb-6">
          <h2 className="text-xl sm:text-2xl font-semibold text-gray-800">My Attendance</h2>
        </div>

        {/* Navigation Tabs */}
        <div className="bg-white rounded-xl shadow-lg border border-slate-200 p-4 mb-4 sm:mb-6">
          <div className="flex items-center gap-3 sm:gap-4 flex-wrap">
            <span className="text-xs sm:text-sm font-medium text-slate-700 hidden sm:inline">View:</span>
            <div className="flex flex-1 sm:flex-initial gap-2">
              <button
                onClick={() => setActiveTab('overall')}
                className={`flex-1 sm:flex-initial px-3 sm:px-4 py-2 rounded-lg font-medium transition-colors flex items-center justify-center gap-2 text-sm ${
                  activeTab === 'overall'
                    ? 'bg-blue-600 text-white'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                <CalendarCheck className="h-4 w-4" />
                <span className="hidden sm:inline">Overall</span>
              </button>
              <button
                onClick={() => setActiveTab('subject')}
                className={`flex-1 sm:flex-initial px-3 sm:px-4 py-2 rounded-lg font-medium transition-colors flex items-center justify-center gap-2 text-sm ${
                  activeTab === 'subject'
                    ? 'bg-blue-600 text-white'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                <BookOpen className="h-4 w-4" />
                <span className="hidden sm:inline">Subjects</span>
              </button>
              <button
                onClick={() => setActiveTab('records')}
                className={`flex-1 sm:flex-initial px-3 sm:px-4 py-2 rounded-lg font-medium transition-colors flex items-center justify-center gap-2 text-sm ${
                  activeTab === 'records'
                    ? 'bg-blue-600 text-white'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                <XCircle className="h-4 w-4" />
                <span className="hidden sm:inline">Records</span>
              </button>
            </div>
          </div>
        </div>

        {/* Overall Attendance Card */}
        {activeTab === 'overall' && (
        <div className={`rounded-lg shadow-md border-2 p-4 sm:p-6 mb-6 ${getPercentageBgColor(overallAttendance?.percentage || 0)}`}>
          <h3 className="text-base sm:text-lg font-semibold text-gray-800 mb-3 sm:mb-4">Overall Attendance (Period-wise)</h3>
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <div>
              <div className={`text-4xl sm:text-5xl font-bold ${getPercentageColor(overallAttendance?.percentage || 0)}`}>
                {overallAttendance?.percentage.toFixed(1)}%
              </div>
              <div className="text-xs sm:text-sm text-gray-600 mt-2">
                {overallAttendance?.totalDays || 0} Days tracked
              </div>
              <div className="text-xs text-gray-500 mt-1">
                Based on 7 periods per day
              </div>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-2 gap-3 sm:gap-4 text-xs sm:text-sm w-full sm:w-auto">
              <div className="flex items-center gap-2">
                <CheckCircle className="h-4 w-4 sm:h-5 sm:w-5 text-green-600 flex-shrink-0" />
                <div>
                  <div className="font-semibold text-green-700">Present</div>
                  <div className="text-gray-600">{overallAttendance?.present || 0} periods</div>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <XCircle className="h-4 w-4 sm:h-5 sm:w-5 text-red-600 flex-shrink-0" />
                <div>
                  <div className="font-semibold text-red-700">Absent</div>
                  <div className="text-gray-600">{overallAttendance?.absent || 0} periods</div>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Clock className="h-4 w-4 sm:h-5 sm:w-5 text-orange-600 flex-shrink-0" />
                <div>
                  <div className="font-semibold text-orange-700">Late</div>
                  <div className="text-gray-600">{overallAttendance?.late || 0} periods</div>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <FileText className="h-4 w-4 sm:h-5 sm:w-5 text-blue-600 flex-shrink-0" />
                <div>
                  <div className="font-semibold text-blue-700">OD</div>
                  <div className="text-gray-600">{overallAttendance?.od || 0} periods</div>
                </div>
              </div>
              <div className="flex items-center gap-2 col-span-2">
                <Plane className="h-4 w-4 sm:h-5 sm:w-5 text-purple-600 flex-shrink-0" />
                <div>
                  <div className="font-semibold text-purple-700">Leave</div>
                  <div className="text-gray-600">{overallAttendance?.leave || 0} periods</div>
                </div>
              </div>
            </div>
          </div>
        </div>
        )}

        {/* Subject-wise Attendance */}
        {activeTab === 'subject' && (
        <div className="bg-white rounded-lg shadow-md p-4 sm:p-6">
          <h3 className="text-base sm:text-lg font-semibold text-gray-800 mb-3 sm:mb-4">Subject-wise Attendance</h3>
          
          {subjectAttendance.length === 0 ? (
            <div>
              <div className="text-center text-gray-500 py-6 sm:py-8 text-sm sm:text-base">
                No subject attendance records found
              </div>
              
              {/* Debug Info */}
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 sm:p-4 mt-4 text-xs">
                <p className="font-semibold text-blue-800 mb-2">Debug Information:</p>
                <div className="space-y-1 text-blue-700">
                  <p><strong>Student ID:</strong> {user?.id}</p>
                  <p className="mt-2 text-blue-600">
                    Check browser console (F12) for detailed logs about the period_attendance query
                  </p>
                  <p className="mt-2 text-blue-600">
                    Possible reasons:
                  </p>
                  <ul className="list-disc list-inside ml-2 space-y-1">
                    <li>No period attendance has been marked yet</li>
                    <li>period_attendance table doesn't have records for this student</li>
                    <li>RLS policy might be blocking access</li>
                  </ul>
                </div>
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              {/* Bar Chart Container */}
              <div className="bg-gray-50 rounded-lg p-4 sm:p-6">
                <div
                  className="flex items-end justify-between gap-2 sm:gap-4"
                  style={{ height: window.innerWidth < 500 ? '420px' : '320px' }}
                >
                  {subjectAttendance.map((subject, index) => {
                    // Generate unique color for each bar using HSL
                    const hue = (index * 360 / subjectAttendance.length) % 360;
                    const barColor = `hsl(${hue}, 70%, 50%)`;
                    return (
                      <div key={subject.subject_id} className="flex flex-col items-center flex-1 h-full">
                        {/* Bar */}
                        <div className="flex-1 w-full flex flex-col justify-end items-center">
                          <div className="relative w-full flex flex-col justify-end items-center h-full">
                            {/* Percentage Label on top of bar */}
                            <div className={`text-xs sm:text-sm font-bold mb-1 ${getPercentageColor(subject.percentage)}`}>{subject.percentage.toFixed(1)}%</div>
                            {/* The Bar */}
                            <div
                              className="w-full rounded-t-lg transition-all duration-500"
                              style={{ height: `${subject.percentage}%`, backgroundColor: barColor }}
                            />
                          </div>
                        </div>
                        {/* Custom XAxis Tick for subject label (mobile only) */}
                        <div className="mt-2 text-center w-full">
                          <svg width="100%" height="24">
                            <foreignObject x="0" y="0" width="100%" height="24">
                              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', width: '100%' }}>
                                <span className="text-xs font-semibold text-gray-800 break-words text-center" style={{ wordBreak: 'break-word', width: '100%' }}>{subject.subject_code}</span>
                                <span className="text-xs text-gray-600 mt-1 text-center">{subject.present}/{subject.totalClasses}</span>
                              </div>
                            </foreignObject>
                          </svg>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          )}
        </div>
        )}

        {/* Records Section */}
        {activeTab === 'records' && (
        <div className="space-y-6">
          <div className="bg-white rounded-lg shadow-md p-4 sm:p-6">
            {/* Navigation Buttons */}
            <div className="flex gap-2 mb-6 overflow-x-auto pb-2">
              <button
                onClick={() => setRecordFilter('absent')}
                className={`flex items-center gap-2 px-4 py-2 rounded-lg font-medium transition-colors whitespace-nowrap ${
                  recordFilter === 'absent'
                    ? 'bg-red-600 text-white'
                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                }`}
              >
                <XCircle className="h-4 w-4" />
                Absent
              </button>
              <button
                onClick={() => setRecordFilter('leave')}
                className={`flex items-center gap-2 px-4 py-2 rounded-lg font-medium transition-colors whitespace-nowrap ${
                  recordFilter === 'leave'
                    ? 'bg-purple-600 text-white'
                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                }`}
              >
                <Plane className="h-4 w-4" />
                Leave
              </button>
              <button
                onClick={() => setRecordFilter('late')}
                className={`flex items-center gap-2 px-4 py-2 rounded-lg font-medium transition-colors whitespace-nowrap ${
                  recordFilter === 'late'
                    ? 'bg-orange-600 text-white'
                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                }`}
              >
                <Clock className="h-4 w-4" />
                Late
              </button>
              <button
                onClick={() => setRecordFilter('od')}
                className={`flex items-center gap-2 px-4 py-2 rounded-lg font-medium transition-colors whitespace-nowrap ${
                  recordFilter === 'od'
                    ? 'bg-blue-600 text-white'
                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                }`}
              >
                <FileText className="h-4 w-4" />
                On Duty
              </button>
            </div>

            {/* Filtered Records */}
            <h3 className="text-base sm:text-lg font-semibold text-gray-800 mb-3 sm:mb-4 flex items-center gap-2">
              {recordFilter === 'absent' && <XCircle className="h-4 w-4 sm:h-5 sm:w-5 text-red-600" />}
              {recordFilter === 'leave' && <Plane className="h-4 w-4 sm:h-5 sm:w-5 text-purple-600" />}
              {recordFilter === 'late' && <Clock className="h-4 w-4 sm:h-5 sm:w-5 text-orange-600" />}
              {recordFilter === 'od' && <FileText className="h-4 w-4 sm:h-5 sm:w-5 text-blue-600" />}
              {recordFilter === 'absent' && 'Absent Records'}
              {recordFilter === 'leave' && 'Leave Records'}
              {recordFilter === 'late' && 'Late Records'}
              {recordFilter === 'od' && 'On Duty Records'}
            </h3>
            
            {absentRecords.filter(r => r.status === recordFilter).length === 0 ? (
              <div className="text-center text-gray-500 py-6 sm:py-8 text-sm sm:text-base">
                No {recordFilter} records found
              </div>
            ) : (
              <div className="space-y-2">
                {absentRecords.filter(r => r.status === recordFilter).map((record, index) => (
                  <div
                    key={index}
                    className={`flex flex-col sm:flex-row items-start sm:items-center justify-between p-3 rounded-lg border gap-2 ${
                      record.status === 'absent' ? 'bg-red-50 border-red-200' :
                      record.status === 'leave' ? 'bg-purple-50 border-purple-200' :
                      record.status === 'late' ? 'bg-orange-50 border-orange-200' :
                      'bg-blue-50 border-blue-200'
                    }`}
                  >
                    <div className="flex items-center gap-3 flex-1">
                      {record.status === 'absent' && <XCircle className="h-4 w-4 sm:h-5 sm:w-5 text-red-600 flex-shrink-0" />}
                      {record.status === 'leave' && <Plane className="h-4 w-4 sm:h-5 sm:w-5 text-purple-600 flex-shrink-0" />}
                      {record.status === 'late' && <Clock className="h-4 w-4 sm:h-5 sm:w-5 text-orange-600 flex-shrink-0" />}
                      {record.status === 'od' && <FileText className="h-4 w-4 sm:h-5 sm:w-5 text-blue-600 flex-shrink-0" />}
                      <div className="flex-1 min-w-0">
                        <div className="font-medium text-gray-800 text-sm sm:text-base">
                          {new Date(record.date).toLocaleDateString('en-US', { 
                            weekday: 'short',
                            year: 'numeric', 
                            month: 'short', 
                            day: 'numeric' 
                          })}
                        </div>
                        <div className="text-xs sm:text-sm text-gray-600 truncate">
                          {record.type === 'daily' ? (
                            <span>Full Day {record.status.charAt(0).toUpperCase() + record.status.slice(1)}</span>
                          ) : (
                            <span>Period {record.period} - {record.subject}</span>
                          )}
                        </div>
                      </div>
                    </div>
                    <div className={`px-2 sm:px-3 py-1 rounded-full text-xs font-medium whitespace-nowrap self-start sm:self-center ${
                      record.status === 'absent' ? 'bg-red-100 text-red-700' :
                      record.status === 'leave' ? 'bg-purple-100 text-purple-700' :
                      record.status === 'late' ? 'bg-orange-100 text-orange-700' :
                      'bg-blue-100 text-blue-700'
                    }`}>
                      {record.status === 'absent' ? 'Absent' :
                       record.status === 'leave' ? 'Leave' :
                       record.status === 'late' ? 'Late' : 'On Duty'}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
        )}
      </div>
    </DashboardLayout>
  );
}