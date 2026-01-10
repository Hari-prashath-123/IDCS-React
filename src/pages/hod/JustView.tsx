import { useEffect, useState } from "react";
import {
  FileText,
  Calendar,
  CreditCard,
  Award,
  Eye,
  Clock,
  Home,
  Megaphone,
} from "lucide-react";
import DashboardLayout from "../../components/DashboardLayout";
import { supabase } from "../../lib/supabase";
import { useAuth } from "../../contexts/AuthContext";

export default function JustView() {
  const { user, profile } = useAuth();
  const [applications, setApplications] = useState<{
    od: any[];
    leave: any[];
    gatepass: any[];
    bonafide: any[];
  }>({
    od: [],
    leave: [],
    gatepass: [],
    bonafide: [],
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (user && profile?.department === 'IQAC') {
      fetchAllApplications();
    }
  }, [user, profile]);

  const fetchAllApplications = async () => {
    try {
      const { data: students } = await supabase
        .from("students")
        .select("id")
        .eq("department", profile?.department);

      const studentIds = students?.map((s) => s.id) || [];
      if (studentIds.length === 0) return;

      const [odApps, leaveApps, gatepassApps, bonafideApps] = await Promise.all([
        supabase
          .from("od_applications")
          .select(`
            id,
            status,
            created_at,
            updated_at,
            current_approver_level,
            students!inner(name, roll_number, year, section)
          `)
          .in("student_id", studentIds)
          .order("created_at", { ascending: false })
          .limit(10),
        supabase
          .from("leave_applications")
          .select(`
            id,
            status,
            created_at,
            updated_at,
            current_approver_level,
            students!inner(name, roll_number, year, section)
          `)
          .in("student_id", studentIds)
          .order("created_at", { ascending: false })
          .limit(10),
        supabase
          .from("gatepass_applications")
          .select(`
            id,
            status,
            created_at,
            updated_at,
            current_approver_level,
            students!inner(name, roll_number, year, section)
          `)
          .in("student_id", studentIds)
          .order("created_at", { ascending: false })
          .limit(10),
        supabase
          .from("bonafide_applications")
          .select(`
            id,
            status,
            created_at,
            updated_at,
            current_approver_level,
            students!inner(name, roll_number, year, section)
          `)
          .in("student_id", studentIds)
          .order("created_at", { ascending: false })
          .limit(10),
      ]);

      setApplications({
        od: odApps.data || [],
        leave: leaveApps.data || [],
        gatepass: gatepassApps.data || [],
        bonafide: bonafideApps.data || [],
      });
    } catch (error) {
      console.error("Error fetching applications:", error);
    } finally {
      setLoading(false);
    }
  };

  const sidebarItems = [
    {
      label: "Dashboard",
      path: "/hod-dashboard",
      icon: <Home className="h-5 w-5" />,
    },
    {
      label: "Just View",
      path: "/hod/just-view",
      icon: <Eye className="h-5 w-5" />,
    },
    {
      label: "Notices",
      path: "/notices",
      icon: <Megaphone className="h-5 w-5" />,
    },
  ];

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'approved':
        return 'text-green-600 bg-green-50 border-green-200';
      case 'rejected':
        return 'text-red-600 bg-red-50 border-red-200';
      case 'pending':
        return 'text-yellow-600 bg-yellow-50 border-yellow-200';
      default:
        return 'text-slate-600 bg-slate-50 border-slate-200';
    }
  };

  const getApplicationTypeIcon = (type: string) => {
    switch (type) {
      case 'od':
        return <FileText className="h-4 w-4" />;
      case 'leave':
        return <Calendar className="h-4 w-4" />;
      case 'gatepass':
        return <CreditCard className="h-4 w-4" />;
      case 'bonafide':
        return <Award className="h-4 w-4" />;
      default:
        return <FileText className="h-4 w-4" />;
    }
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-IN', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  if (profile?.department !== 'IQAC') {
    return (
      <div className="min-h-screen bg-slate-100 flex items-center justify-center">
        <div className="text-center">
          <div className="text-6xl mb-4">🚫</div>
          <h2 className="text-2xl font-bold text-slate-800 mb-2">Access Denied</h2>
          <p className="text-slate-600">This page is only accessible to IQAC department HODs.</p>
        </div>
      </div>
    );
  }

  return (
    <DashboardLayout sidebarItems={sidebarItems}>
      <div className="max-w-7xl mx-auto">
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-slate-800">
            Just View - Application Overview
          </h1>
          <p className="text-slate-600 mt-1">
            View all applications from {profile?.department} department students
          </p>
        </div>

        {loading ? (
          <div className="text-center py-12">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
            <p className="mt-4 text-slate-600">Loading applications...</p>
          </div>
        ) : (
          <div className="space-y-6">
            {/* Application Summary Cards */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-slate-600">OD Applications</p>
                    <p className="text-2xl font-bold text-slate-800">
                      {applications.od.length}
                    </p>
                  </div>
                  <FileText className="h-8 w-8 text-blue-600" />
                </div>
              </div>
              <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-slate-600">Leave Applications</p>
                    <p className="text-2xl font-bold text-slate-800">
                      {applications.leave.length}
                    </p>
                  </div>
                  <Calendar className="h-8 w-8 text-green-600" />
                </div>
              </div>
              <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-slate-600">Gatepass Applications</p>
                    <p className="text-2xl font-bold text-slate-800">
                      {applications.gatepass.length}
                    </p>
                  </div>
                  <CreditCard className="h-8 w-8 text-orange-600" />
                </div>
              </div>
              <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-slate-600">Bonafide Applications</p>
                    <p className="text-2xl font-bold text-slate-800">
                      {applications.bonafide.length}
                    </p>
                  </div>
                  <Award className="h-8 w-8 text-purple-600" />
                </div>
              </div>
            </div>

            {/* Recent Applications */}
            <div className="bg-white rounded-xl shadow-lg border border-slate-200 p-6">
              <h2 className="text-xl font-bold text-slate-800 mb-6 flex items-center">
                <Clock className="h-6 w-6 mr-2 text-blue-600" />
                Recent Applications
              </h2>

              <div className="space-y-4">
                {Object.entries(applications).map(([type, apps]) =>
                  apps.slice(0, 5).map((app: {
                    id: string;
                    status: string;
                    created_at: string;
                    students: {
                      name: string;
                      roll_number: string;
                      year: number;
                      section: string;
                    };
                  }) => (
                    <div
                      key={`${type}-${app.id}`}
                      className="flex items-center justify-between p-4 bg-slate-50 rounded-lg border border-slate-200 hover:bg-slate-100 transition-colors"
                    >
                      <div className="flex items-center space-x-4">
                        <div className="flex-shrink-0">
                          {getApplicationTypeIcon(type)}
                        </div>
                        <div>
                          <p className="font-medium text-slate-800">
                            {app.students?.name} ({app.students?.roll_number})
                          </p>
                          <p className="text-sm text-slate-600">
                            {app.students?.year} Year - {app.students?.section} Section
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center space-x-4">
                        <div className="text-right">
                          <div className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border ${getStatusColor(app.status)}`}>
                            {app.status.charAt(0).toUpperCase() + app.status.slice(1)}
                          </div>
                          <p className="text-xs text-slate-500 mt-1">
                            {formatDate(app.created_at)}
                          </p>
                        </div>
                      </div>
                    </div>
                  ))
                )}

                {Object.values(applications).every(apps => apps.length === 0) && (
                  <div className="text-center py-8">
                    <Eye className="h-12 w-12 text-slate-400 mx-auto mb-4" />
                    <p className="text-slate-500">No applications found</p>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}