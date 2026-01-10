import { useEffect, useState } from 'react';
import { Pie } from 'react-chartjs-2';
import {
  Chart as ChartJS,
  ArcElement,
  Tooltip,
  Legend,
  Title,
} from 'chart.js';
import { supabase } from '../../lib/supabase';

ChartJS.register(ArcElement, Tooltip, Legend, Title);

interface AttendanceData {
  studentPresent: number;
  studentTotal: number;
  staffPresent: number;
  staffTotal: number;
}

export default function AttendanceOverviewChart() {
  const [attendanceData, setAttendanceData] = useState<AttendanceData>({
    studentPresent: 0,
    studentTotal: 0,
    staffPresent: 0,
    staffTotal: 0,
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchTodayAttendance();
  }, []);

  const fetchTodayAttendance = async () => {
    try {
      setLoading(true);
      const today = new Date().toISOString().split('T')[0];

      // Fetch student attendance for today
      const { data: studentAttendance, error: studentError } = await supabase
        .from('daily_attendance')
        .select('student_id, status')
        .eq('date', today);

      if (studentError) throw studentError;

      // Get total students count
      const { data: totalStudents, error: studentsError } = await supabase
        .from('students')
        .select('id');

      if (studentsError) throw studentsError;

      // Count present students (present, late, od considered as present)
      const studentPresent = studentAttendance?.filter(
        (record) => ['present', 'late', 'od'].includes(record.status)
      ).length || 0;

      // Fetch staff attendance for today
      const { data: staffAttendance, error: staffError } = await supabase
        .from('staff')
        .select('id, on_leave');

      if (staffError) throw staffError;

      // Count staff not on leave as present
      const staffPresent = staffAttendance?.filter(
        (staff) => !staff.on_leave
      ).length || 0;

      setAttendanceData({
        studentPresent,
        studentTotal: totalStudents?.length || 0,
        staffPresent,
        staffTotal: staffAttendance?.length || 0,
      });
    } catch (error) {
      console.error('Error fetching attendance:', error);
      setError('Failed to fetch attendance data');
    } finally {
      setLoading(false);
    }
  };

  const chartData = {
    labels: [
      `Students Present (${attendanceData.studentPresent})`,
      `Students Absent (${attendanceData.studentTotal - attendanceData.studentPresent})`,
      `Staff Present (${attendanceData.staffPresent})`,
      `Staff Absent/Leave (${attendanceData.staffTotal - attendanceData.staffPresent})`,
    ],
    datasets: [
      {
        label: 'Today\'s Attendance',
        data: [
          attendanceData.studentPresent,
          attendanceData.studentTotal - attendanceData.studentPresent,
          attendanceData.staffPresent,
          attendanceData.staffTotal - attendanceData.staffPresent,
        ],
        backgroundColor: [
          '#10B981', // Green for students present
          '#EF4444', // Red for students absent
          '#3B82F6', // Blue for staff present
          '#F59E0B', // Orange for staff absent/leave
        ],
        borderColor: [
          '#059669',
          '#DC2626',
          '#2563EB',
          '#D97706',
        ],
        borderWidth: 2,
      },
    ],
  };

  const chartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      title: {
        display: true,
        text: `Today's Attendance Overview - ${new Date().toLocaleDateString()}`,
        font: {
          size: 16,
          weight: 'bold' as const,
        },
        color: '#1F2937',
      },
      legend: {
        position: 'bottom' as const,
        labels: {
          padding: 20,
          usePointStyle: true,
          font: {
            size: 12,
          },
        },
      },
      tooltip: {
        callbacks: {
          label: function(context: any) {
            const label = context.label || '';
            const value = context.parsed || 0;
            const total = context.dataset.data.reduce((a: number, b: number) => a + b, 0);
            const percentage = total > 0 ? ((value / total) * 100).toFixed(1) : '0.0';
            return `${label}: ${value} (${percentage}%)`;
          },
        },
      },
    },
  };

  if (loading) {
    return (
      <div className="bg-white rounded-xl shadow-lg border border-slate-200 p-6">
        <div className="flex items-center justify-center h-64">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
          <span className="ml-2 text-slate-600">Loading attendance data...</span>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-white rounded-xl shadow-lg border border-slate-200 p-6">
        <div className="flex items-center justify-center h-64">
          <div className="text-center">
            <div className="text-red-500 text-lg mb-2">⚠️</div>
            <p className="text-red-600">{error}</p>
            <button
              onClick={fetchTodayAttendance}
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
      <div className="h-80">
        <Pie data={chartData} options={chartOptions} />
      </div>
      
      {/* Summary Statistics */}
      <div className="mt-6 grid grid-cols-2 gap-4 pt-4 border-t border-slate-200">
        <div className="text-center">
          <div className="text-2xl font-bold text-green-600">
            {attendanceData.studentTotal > 0 
              ? Math.round((attendanceData.studentPresent / attendanceData.studentTotal) * 100)
              : 0}%
          </div>
          <div className="text-sm text-slate-600">Student Attendance</div>
          <div className="text-xs text-slate-500">
            {attendanceData.studentPresent} / {attendanceData.studentTotal}
          </div>
        </div>
        <div className="text-center">
          <div className="text-2xl font-bold text-blue-600">
            {attendanceData.staffTotal > 0 
              ? Math.round((attendanceData.staffPresent / attendanceData.staffTotal) * 100)
              : 0}%
          </div>
          <div className="text-sm text-slate-600">Staff Attendance</div>
          <div className="text-xs text-slate-500">
            {attendanceData.staffPresent} / {attendanceData.staffTotal}
          </div>
        </div>
      </div>
    </div>
  );
}