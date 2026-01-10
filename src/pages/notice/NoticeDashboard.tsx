import { useAuth } from '../../contexts/AuthContext';
import DashboardLayout from '../../components/DashboardLayout';
import { Home, Bell, FileText, Calendar, Image } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useNoticeImages } from '../../hooks/useNoticeImages';

export default function NoticeDashboard() {
  const { profile } = useAuth();
  const { images } = useNoticeImages();

  const sidebarItems = [
    { label: 'Dashboard', path: '/notice-dashboard', icon: <Home className="h-5 w-5" /> },
    { label: 'Notifications', path: '/notifications', icon: <Bell className="h-5 w-5" /> },
    { label: 'Manage Notices', path: '/notice/manage', icon: <FileText className="h-5 w-5" /> },
  ];

  return (
    <DashboardLayout sidebarItems={sidebarItems}>
      <div className="max-w-7xl mx-auto">
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-slate-800">Notice Board Dashboard</h1>
          <p className="text-slate-600 mt-1">Welcome, {profile?.name || profile?.email}</p>
          <div className="mt-2 text-sm text-slate-500">
            Role: {profile?.role || 'No role assigned'}
          </div>
        </div>

        {/* Role Check */}
        {(!profile || profile?.role !== 'notice') && (
          <div className="mb-6 p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
            <div className="flex items-center">
              <div className="text-yellow-600 mr-3">
                <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                </svg>
              </div>
              <div>
                <h3 className="text-yellow-800 font-medium">Access Restricted</h3>
                <p className="text-yellow-700 text-sm">
                  {!profile 
                    ? 'You must be logged in to access this page.'
                    : `You need to be logged in with a 'notice' role to manage carousel images. Current role: ${profile.role || 'None'}`
                  }
                </p>
              </div>
            </div>
          </div>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
          <Link to="/notice/manage" className="p-6 bg-white rounded-xl shadow hover:shadow-lg border border-slate-200 transition-shadow">
            <div className="flex items-center space-x-3">
              <div className="relative">
                <Image className="h-8 w-8 text-blue-600" />
                <div className="absolute -top-1 -right-1 w-3 h-3 bg-green-500 rounded-full animate-pulse"></div>
              </div>
              <div>
                <h3 className="text-lg font-semibold text-slate-800">Manage Carousel</h3>
                <p className="text-sm text-slate-600">Manage home page carousel images ({images.length} active)</p>
              </div>
            </div>
          </Link>

          <Link to="/notice/events" className="p-6 bg-white rounded-xl shadow hover:shadow-lg border border-slate-200 transition-shadow">
            <div className="flex items-center space-x-3">
              <Calendar className="h-8 w-8 text-purple-600" />
              <div>
                <h3 className="text-lg font-semibold text-slate-800">Events</h3>
                <p className="text-sm text-slate-600">Manage college events and announcements</p>
              </div>
            </div>
          </Link>
        </div>
      </div>
    </DashboardLayout>
  );
}