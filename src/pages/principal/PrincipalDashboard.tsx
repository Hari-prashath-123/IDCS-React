import { FileText, Calendar } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import DashboardLayout from '../../components/DashboardLayout';
import { Home, Bell, Users, GraduationCap, BookOpen, User, MessageSquare, Megaphone, BarChart3 } from 'lucide-react';
import { Link } from 'react-router-dom';
import AttendanceOverviewChart from '../../components/analytics/AttendanceOverviewChart';
import DepartmentPerformanceTable from '../../components/analytics/DepartmentPerformanceTable';

export default function PrincipalDashboard() {
  const { profile } = useAuth();

  const sidebarItems = [
    { label: 'Dashboard', path: '/principal-dashboard', icon: <Home className="h-5 w-5" /> },
    { label: 'Staff Leave', path: '/principal/staff-leave', icon: <Calendar className="h-5 w-5" /> },
    { label: 'Subjects', path: '/principal/subjects', icon: <BookOpen className="h-5 w-5" /> },
    { label: 'Staff Details', path: '/principal/staff-details', icon: <Users className="h-5 w-5" /> },
    { label: 'Student Details', path: '/principal/student-details', icon: <GraduationCap className="h-5 w-5" /> },
    { label: 'Attendance', path: '/principal/attendance', icon: <BarChart3 className="h-5 w-5" /> },
    { label: 'Feedback', path: '/principal/feedback', icon: <MessageSquare className="h-5 w-5" /> },
    { label: 'Notices', path: '/principal/notices', icon: <Megaphone className="h-5 w-5" /> },
    { label: 'Forms', path: '/principal/forms', icon: <FileText className="h-5 w-5" /> },
    { label: 'Views', path: '/admin/views', icon: <User className="h-5 w-5" /> },
    { label: 'Notifications', path: '/notifications', icon: <Bell className="h-5 w-5" /> },
  ];

  return (
    <DashboardLayout sidebarItems={sidebarItems}>
      <div className="max-w-7xl mx-auto">
        <div className="mb-8">
          <h1 className="text-xl font-bold text-slate-800">Principal Dashboard</h1>
          <p className="text-slate-600 mt-1">Welcome, {profile?.name || profile?.email}</p>
        </div>

        {/* Analytics Section */}
        <div className="mb-8">
          <h2 className="text-lg font-semibold text-slate-800 mb-4 flex items-center">
            <BarChart3 className="h-5 w-5 mr-2 text-blue-600" />
            Dashboard Analytics & Insights
          </h2>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Attendance Overview Chart */}
            <AttendanceOverviewChart />
            
            {/* Department Performance Table */}
            <DepartmentPerformanceTable />
          </div>
        </div>

        {/* Quick Actions Grid */}
        <div className="mb-6">
          <h2 className="text-lg font-semibold text-slate-800 mb-4">Quick Actions</h2>
        </div>
        
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          <Link to="/principal/subjects" className="p-6 bg-white rounded-lg shadow hover:shadow-md border transition-shadow">
            <div className="flex items-center gap-3">
              <BookOpen className="h-8 w-8 text-blue-600" />
              <div>
                <h3 className="font-semibold text-gray-900">Subjects</h3>
                <p className="text-sm text-gray-600">Manage subjects</p>
              </div>
            </div>
          </Link>
          <Link to="/principal/staff-details" className="p-6 bg-white rounded-lg shadow hover:shadow-md border transition-shadow">
            <div className="flex items-center gap-3">
              <Users className="h-8 w-8 text-emerald-600" />
              <div>
                <h3 className="font-semibold text-gray-900">Staff Details</h3>
                <p className="text-sm text-gray-600">View all staff members</p>
              </div>
            </div>
          </Link>
          <Link to="/principal/student-details" className="p-6 bg-white rounded-lg shadow hover:shadow-md border transition-shadow">
            <div className="flex items-center gap-3">
              <GraduationCap className="h-8 w-8 text-purple-600" />
              <div>
                <h3 className="font-semibold text-gray-900">Student Details</h3>
                <p className="text-sm text-gray-600">View all students</p>
              </div>
            </div>
          </Link>
          <Link to="/principal/feedback" className="p-6 bg-white rounded-lg shadow hover:shadow-md border transition-shadow">
            <div className="flex items-center gap-3">
              <MessageSquare className="h-8 w-8 text-indigo-600" />
              <div>
                <h3 className="font-semibold text-gray-900">Feedback</h3>
                <p className="text-sm text-gray-600">Create feedback forms for students & staff</p>
              </div>
            </div>
          </Link>
          <Link to="/principal/notices" className="p-6 bg-white rounded-lg shadow hover:shadow-md border transition-shadow">
            <div className="flex items-center gap-3">
              <Megaphone className="h-8 w-8 text-red-600" />
              <div>
                <h3 className="font-semibold text-gray-900">Notices</h3>
                <p className="text-sm text-gray-600">Create and manage digital circulars & announcements</p>
              </div>
            </div>
          </Link>
          <Link to="/principal/forms" className="p-6 bg-white rounded-lg shadow hover:shadow-md border transition-shadow">
            <div className="flex items-center gap-3">
              <FileText className="h-8 w-8 text-green-600" />
              <div>
                <h3 className="font-semibold text-gray-900">Forms</h3>
                <p className="text-sm text-gray-600">View and manage forms</p>
              </div>
            </div>
          </Link>
        </div>
      </div>
    </DashboardLayout>
  );
}
