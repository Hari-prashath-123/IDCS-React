import { useAuth } from '../../contexts/AuthContext';
import DashboardLayout from '../../components/DashboardLayout';
import { Home, Bell, Megaphone } from 'lucide-react';
import { Link } from 'react-router-dom';

export default function PSDashboard() {
  const { profile } = useAuth();

  const sidebarItems = [
    { label: 'Dashboard', path: '/ps-dashboard', icon: <Home className="h-5 w-5" /> },
    { label: 'Notifications', path: '/notifications', icon: <Bell className="h-5 w-5" /> },
    { label: 'Bonafide Applications', path: '/ps/bonafide', icon: <Home className="h-5 w-5" /> },
    { label: 'Notices', path: '/notices', icon: <Megaphone className="h-5 w-5" /> },
    // Removed 'Staff' and 'Profile' from PS sidebar as requested
  ];

  return (
    <DashboardLayout sidebarItems={sidebarItems}>
      <div className="max-w-7xl mx-auto">
        <div className="mb-8">
          <h1 className="text-xl font-bold text-slate-800">PS Dashboard</h1>
          <p className="text-slate-600 mt-1">Welcome, {profile?.name || profile?.email}</p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Link to="/notifications" className="p-4 bg-white rounded shadow hover:shadow-md border">Notifications</Link>
          <Link to="/ps/bonafide" className="p-4 bg-white rounded shadow hover:shadow-md border">Bonafide Applications</Link>
        </div>
      </div>
    </DashboardLayout>
  );
}
