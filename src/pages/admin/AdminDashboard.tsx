import DashboardLayout from '../../components/DashboardLayout';
import { FileText, Home, Megaphone } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';

export default function AdminDashboard() {
  const { profile } = useAuth();

  const sidebarItems = [
    { label: 'Dashboard', path: '/admin-dashboard', icon: <Home className="h-5 w-5" /> },
    { label: 'Views', path: '/admin/views', icon: <FileText className="h-5 w-5" /> },
    { label: 'Notices', path: '/notices', icon: <Megaphone className="h-5 w-5" /> },
  ];

  return (
    <DashboardLayout sidebarItems={sidebarItems}>
      <div className="max-w-7xl mx-auto">
        <div className="mb-8">
          <h1 className="text-xl font-bold text-slate-800">Admin Dashboard</h1>
          <p className="text-slate-600 mt-1">Welcome, {profile?.name} — admin tools will appear here.</p>
        </div>
        <div className="bg-white rounded-xl shadow-lg border border-slate-200 p-6">
          <p className="text-slate-600">No admin features are implemented yet. This page is reserved for superuser actions.</p>
        </div>
      </div>
    </DashboardLayout>
  );
}
