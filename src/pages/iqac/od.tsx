import { useEffect, useState } from "react";
import { Clock, FileText, Eye, Check, X } from "lucide-react";
import DashboardLayout from "../../components/DashboardLayout";
import { supabase } from "../../lib/supabase";
import { useAuth } from "../../contexts/AuthContext";

export default function IQACODPage() {
  const { profile } = useAuth();
  const [odApps, setOdApps] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [departments, setDepartments] = useState<string[]>([]);
  const [selectedDept, setSelectedDept] = useState<string>("ALL");

  useEffect(() => {
    fetchDepartments();
  }, []);

  useEffect(() => {
    fetchODApplications(selectedDept);
  }, [selectedDept]);

  useEffect(() => {
    if (profile?.department && selectedDept === "ALL") {
      // default to user's department when available
      setSelectedDept(profile.department);
    }
  }, [profile]);

  const fetchDepartments = async () => {
    try {
      // Prefer the canonical `departments` table if it exists
      const { data: deptRows, error: deptErr } = await supabase
        .from("departments")
        .select("name")
        .order("name", { ascending: true });

      if (!deptErr && deptRows && deptRows.length > 0) {
        const names = deptRows.map((r: any) => r.name).filter(Boolean);
        setDepartments(names);
        // if user's department is available and no selection yet, pick it
        if (profile?.department && selectedDept === "ALL") setSelectedDept(profile.department);
        return;
      }

      // Fallback: derive from students table (may be restricted by RLS)
      const { data } = await supabase.from("students").select("department");
      const uniq = Array.from(new Set((data || []).map((d: any) => d.department).filter(Boolean)));
      setDepartments(uniq.sort());
    } catch (err) {
      console.error("Error fetching departments:", err);
    }
  };

  const fetchODApplications = async (department?: string) => {
    setLoading(true);
    try {
      let data: any = null;
      let error: any = null;

      if (department && department !== "ALL") {
        ({ data, error } = await supabase
          .from("od_applications")
          .select(`
            id,
            student_id,
            status,
            created_at,
            updated_at,
            current_approver_level,
            od_approvals(id, action, remarks, approver_role, created_at),
            students!inner(roll_no, reg_no, year, section, department)
          `)
          .eq("students.department", department)
          .order("created_at", { ascending: false })
          .limit(200));
      } else {
        ({ data, error } = await supabase
          .from("od_applications")
          .select(`
            id,
            student_id,
            status,
            created_at,
            updated_at,
            current_approver_level,
            od_approvals(id, action, remarks, approver_role, created_at),
            students!inner(roll_no, reg_no, year, section, department)
          `)
          .order("created_at", { ascending: false })
          .limit(200));
      }

      if (error) throw error;
      const apps = data || [];

      // batch fetch student profiles to attach `name` (students.id references profiles.id)
      const studentIdsInApps = Array.from(new Set(apps.map((a: any) => a.student_id).filter(Boolean)));
      if (studentIdsInApps.length > 0) {
        const { data: profiles, error: profilesErr } = await supabase
          .from("profiles")
          .select("id, name")
          .in("id", studentIdsInApps as any[]);
        if (!profilesErr && profiles) {
          const profMap = new Map(profiles.map((p: any) => [p.id, p.name]));
          apps.forEach((a: any) => {
            if (!a.students) a.students = {};
            a.students.name = profMap.get(a.student_id) || null;
          });
        }
      }

      setOdApps(apps);
    } catch (err) {
      console.error("Error fetching OD applications:", err);
    } finally {
      setLoading(false);
    }
  };

  const formatDate = (d?: string) =>
    d ? new Date(d).toLocaleString("en-IN", { hour12: false }) : "-";

  const renderApprovalIcon = (approvals: any[] = [], role: string) => {
    const a = (approvals || []).find((x: any) => x.approver_role === role);
    if (!a) return <Clock className="h-4 w-4 text-yellow-500" title="Pending" />;
    if (a.action === "approved") return <Check className="h-4 w-4 text-green-600" title={`Approved by ${role}`} />;
    if (a.action === "rejected") return <X className="h-4 w-4 text-red-600" title={`Rejected by ${role}`} />;
    return <FileText className="h-4 w-4 text-slate-500" title={`${role}: ${a.action}`} />;
  };

  // Page is available for all departments; provide a department filter.

  return (
    <DashboardLayout>
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="mb-6">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h1 className="text-2xl font-semibold text-slate-800">OD Applications</h1>
              <p className="text-sm text-slate-600 mt-1">Department application logs and approval history</p>
            </div>
            <div className="text-sm text-slate-600 self-center">Total: <span className="font-medium text-slate-800">{odApps.length}</span></div>
          </div>
        </div>

        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-4">
          <div className="flex items-center gap-3">
            <label className="text-sm text-slate-600">Department</label>
            <select
              value={selectedDept}
              onChange={(e) => setSelectedDept(e.target.value)}
              className="border rounded px-2 py-1 text-sm bg-white"
            >
              <option value="ALL">All Departments</option>
              {departments.map((d) => (
                <option key={d} value={d}>{d}</option>
              ))}
            </select>
          </div>
          <div className="text-sm text-slate-500">Showing: <span className="font-medium text-slate-700">{selectedDept === 'ALL' ? 'All Departments' : selectedDept}</span></div>
        </div>

        {loading ? (
          <div className="text-center py-12">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
            <p className="mt-4 text-slate-600">Loading OD applications...</p>
          </div>
        ) : (
          <div className="bg-white rounded-lg border shadow-sm p-4">
            {odApps.length === 0 ? (
              <div className="text-center py-8">
                <Eye className="h-12 w-12 text-slate-400 mx-auto mb-4" />
                <p className="text-slate-500">No OD applications found for this department.</p>
              </div>
            ) : (
              <>
              <div className="md:hidden space-y-3">
                {odApps.map((app: any) => (
                  <div key={app.id} className="bg-white border rounded p-3">
                    <div className="flex items-start justify-between">
                      <div className="min-w-0">
                        <div className="font-medium text-slate-800 truncate">{app.students?.name || '—'}</div>
                        <div className="text-xs text-slate-500 truncate">{app.students?.department || '—'} • {app.students?.year || '-'} / {app.students?.section || '-'}</div>
                      </div>
                      <div className="ml-2">
                        <div className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border ${
                          app.status === 'approved' ? 'text-green-600 bg-green-50 border-green-200' : app.status === 'rejected' ? 'text-red-600 bg-red-50 border-red-200' : 'text-yellow-600 bg-yellow-50 border-yellow-200'
                        }`}>{app.status?.charAt(0)?.toUpperCase() + app.status?.slice(1)}</div>
                        <div className="text-xs text-slate-500 mt-1">{formatDate(app.created_at)}</div>
                      </div>
                    </div>
                    <div className="mt-3 flex items-center justify-between">
                      <div className="text-xs text-slate-500">&nbsp;</div>
                      <div className="flex items-center gap-3">
                        {renderApprovalIcon(app.od_approvals || [], 'mentor')}
                        {renderApprovalIcon(app.od_approvals || [], 'advisor')}
                        {renderApprovalIcon(app.od_approvals || [], 'ahod')}
                        {renderApprovalIcon(app.od_approvals || [], 'hod')}
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              <div className="hidden md:block overflow-x-auto">
                <table className="min-w-full divide-y divide-slate-100 text-sm table-fixed">
                  <thead className="bg-slate-50">
                    <tr>
                      <th className="px-3 py-2 text-left text-slate-600 font-medium" style={{ width: '40%' }}>Student</th>
                      <th className="px-3 py-2 text-left text-slate-600 font-medium" style={{ width: '20%' }}>Status</th>
                      <th className="px-3 py-2 text-left text-slate-600 font-medium" style={{ width: '20%' }}>Created</th>
                      <th className="px-3 py-2 text-left text-slate-600 font-medium" style={{ width: '20%' }}>Approvals</th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-slate-100">
                    {odApps.map((app: any) => {
                      const approvals: any[] = app.od_approvals || [];

                      return (
                        <tr key={app.id} className="align-top">
                            <td className="px-3 py-3 align-middle">
                              <div className="flex items-center gap-3">
                                <div className="flex-1 min-w-0">
                                  <div className="font-medium text-slate-800 truncate">{app.students?.name || '—'}</div>
                                  <div className="text-xs text-slate-500 truncate">{app.students?.department || '—'} • {app.students?.year || '-'} / {app.students?.section || '-'}</div>
                                </div>
                              </div>
                            </td>

                          <td className="px-3 py-3 align-middle">
                            <div className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border ${
                              app.status === 'approved' ? 'text-green-600 bg-green-50 border-green-200' : app.status === 'rejected' ? 'text-red-600 bg-red-50 border-red-200' : 'text-yellow-600 bg-yellow-50 border-yellow-200'
                            }`}>{app.status?.charAt(0)?.toUpperCase() + app.status?.slice(1)}</div>
                          </td>

                          <td className="px-3 py-3 align-middle text-slate-600">{formatDate(app.created_at)}</td>

                          <td className="px-3 py-3 align-middle">
                            <div className="flex items-center gap-2">
                              <div className="flex items-center gap-2 text-xs text-slate-600">
                                <div className="text-[10px] text-slate-500">Mentor</div>
                                {renderApprovalIcon(approvals, 'mentor')}
                              </div>
                              <div className="flex items-center gap-2 text-xs text-slate-600">
                                <div className="text-[10px] text-slate-500">Advisor</div>
                                {renderApprovalIcon(approvals, 'advisor')}
                              </div>
                              <div className="flex items-center gap-2 text-xs text-slate-600">
                                <div className="text-[10px] text-slate-500">AHOD</div>
                                {renderApprovalIcon(approvals, 'ahod')}
                              </div>
                              <div className="flex items-center gap-2 text-xs text-slate-600">
                                <div className="text-[10px] text-slate-500">HOD</div>
                                {renderApprovalIcon(approvals, 'hod')}
                              </div>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              </>
            )}
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}
