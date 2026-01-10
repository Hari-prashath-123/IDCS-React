import { useState, ReactNode, useEffect, useRef, useMemo } from "react";
import { useNavigate, useLocation, Link } from "react-router-dom";
import {
  Menu,
  X,
  User,
  LogOut,
  Bell,
  Home,
  FileText,
  CreditCard,
  Award,
  Users,
  BookOpen,
  ClipboardCheck,
  GraduationCap,
  MessageSquare,
  Megaphone,
  BarChart3,
  Calendar,
} from "lucide-react";
import { useAuth } from "../contexts/AuthContext";
import { supabase, withRetryBatch, withRetry } from "../lib/supabase";
import idcsLogo from "@/assets/idcs-logo.png";

type Approval = {
  id: string;
  action: string;
  remarks?: string | null;
  approver_role?: string | null;
  created_at: string;
};

type RawAppRow = {
  id: string;
  status: string;
  updated_at: string;
  student_id?: string;
  od_approvals?: Approval[];
  leave_approvals?: Approval[];
  gatepass_approvals?: Approval[];
  bonafide_approvals?: Approval[];
};

interface DashboardLayoutProps {
  children: ReactNode;
  // sidebarItems is accepted but ignored by default — layout uses a centralized default so all pages have the same links/style
  // If you really want a custom set, pass a prop named `customSidebarItems` and it will be used.
  sidebarItems?: {
    label: string;
    path: string;
    icon: ReactNode;
  }[];
}

export default function DashboardLayout({
  children,
  sidebarItems,
}: DashboardLayoutProps) {
  const navigate = useNavigate();
  const location = useLocation();
  const { profile, signOut } = useAuth();
  const [sidebarOpen, setSidebarOpen] = useState(() =>
    typeof window !== "undefined" ? window.innerWidth >= 640 : false
  );
  const [isDesktop, setIsDesktop] = useState(() =>
    typeof window !== "undefined" ? window.innerWidth >= 640 : false
  );

  // Keep sidebar open by default on desktop. Allow user to toggle it closed.
  useEffect(() => {
    const onResize = () => {
      const desk = window.innerWidth >= 640;
      setIsDesktop(desk);
      if (desk) setSidebarOpen(true);
    };
    onResize();
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  // Auto-close sidebar on mobile when route changes
  useEffect(() => {
    if (!isDesktop) {
      setSidebarOpen(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.pathname]);

  // Notifications
  const [notifications, setNotifications] = useState<
    Array<{ id: string; message: string; created_at: string }>
  >([]);
  const [staffRole, setStaffRole] = useState<string | null>(null);
  const [hodDepartment, setHodDepartment] = useState<{ id: string; name: string } | null>(null);
  const [showNotifications, setShowNotifications] = useState(false);
  const notificationRef = useRef<HTMLDivElement>(null);
  const notificationButtonRef = useRef<HTMLButtonElement>(null);

  // Logout confirmation modal
  const [showLogoutModal, setShowLogoutModal] = useState(false);

  // Click outside to close notifications
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        showNotifications &&
        notificationRef.current &&
        notificationButtonRef.current &&
        !notificationRef.current.contains(event.target as Node) &&
        !notificationButtonRef.current.contains(event.target as Node)
      ) {
        setShowNotifications(false);
      }
    };

    if (showNotifications) {
      document.addEventListener("mousedown", handleClickOutside);
    }

    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [showNotifications]);

  useEffect(() => {
    if (!profile) return;

    // If this user is a staff, fetch the staff row to get `staff_role` (mentor/advisor/lecturer)
    if (profile.role === "staff") {
      (async () => {
        try {
          const result = await withRetry(async () => 
            await supabase
              .from("staff")
              .select("staff_role")
              .eq("id", profile.id)
              .maybeSingle()
          );
          if (!result.error && result.data && (result.data as any).staff_role)
            setStaffRole((result.data as any).staff_role as string);
        } catch (e) {
          console.debug("Failed to load staff role for menu", e);
        }
      })();
    }

    const fetchNotifications = async () => {
      try {
        const results: Array<{
          id: string;
          message: string;
          created_at: string;
        }> = [];

        // Global active notices with retry
        const noticesResult = await withRetryBatch([
          async () => await supabase
            .from("notices")
            .select("id, title, created_at")
            .eq("is_active", true)
            .order("created_at", { ascending: false })
            .limit(5)
        ]);
        const notices = noticesResult[0].data;

        if (notices) {
          for (const n of notices) {
            results.push({
              id: `notice-${n.id}`,
              message: `Notice: ${n.title}`,
              created_at: n.created_at,
            });
          }
        }

        // If this user is a HOD, fetch their department mapping from department_leads
        if (profile.role === 'hod') {
          (async () => {
            try {
              const { data } = await supabase
                .from('department_leads')
                .select('department_id, departments(name)')
                .eq('hod_id', profile.id)
                .maybeSingle();
              if (data && data.department_id) {
                const name = (data as any).departments?.name || '';
                setHodDepartment({ id: data.department_id, name });
              }
            } catch (e) {
              // ignore — missing mapping is acceptable
            }
          })();
        }

        if (profile.role === "student") {
          // Query all four application tables for student
          const [odApps, leaveApps, gatepassApps, bonafideApps] =
            await Promise.all([
              supabase
                .from("od_applications")
                .select(
                  "id, status, updated_at, od_approvals(id, action, remarks, approver_role, created_at)"
                )
                .eq("student_id", profile.id)
                .order("updated_at", { ascending: false })
                .limit(2),
              supabase
                .from("leave_applications")
                .select(
                  "id, status, updated_at, leave_approvals(id, action, remarks, approver_role, created_at)"
                )
                .eq("student_id", profile.id)
                .order("updated_at", { ascending: false })
                .limit(2),
              supabase
                .from("gatepass_applications")
                .select(
                  "id, status, updated_at, gatepass_approvals(id, action, remarks, approver_role, created_at)"
                )
                .eq("student_id", profile.id)
                .order("updated_at", { ascending: false })
                .limit(2),
              supabase
                .from("bonafide_applications")
                .select(
                  "id, status, updated_at, bonafide_approvals(id, action, remarks, approver_role, created_at)"
                )
                .eq("student_id", profile.id)
                .order("updated_at", { ascending: false })
                .limit(2),
            ]);

          const odRows = (odApps.data || []) as RawAppRow[];
          const leaveRows = (leaveApps.data || []) as RawAppRow[];
          const gateRows = (gatepassApps.data || []) as RawAppRow[];
          const bonafideRows = (bonafideApps.data || []) as RawAppRow[];

          const allApps: Array<
            RawAppRow & { type?: string | null; approvals?: Approval[] }
          > = [
            ...odRows.map((app) => ({
              ...app,
              type: "od",
              approvals: app.od_approvals,
            })),
            ...leaveRows.map((app) => ({
              ...app,
              type: "leave",
              approvals: app.leave_approvals,
            })),
            ...gateRows.map((app) => ({
              ...app,
              type: "gatepass",
              approvals: app.gatepass_approvals,
            })),
            ...bonafideRows.map((app) => ({
              ...app,
              type: "bonafide",
              approvals: app.bonafide_approvals,
            })),
          ];

          allApps.sort(
            (a, b) =>
              new Date(b.updated_at).getTime() -
              new Date(a.updated_at).getTime()
          );
          const topApps = allApps.slice(0, 5);

          for (const app of topApps) {
            let msg = `Your ${app.type?.toUpperCase()} application is ${
              app.status
            } - ${new Date(app.updated_at).toLocaleDateString()}`;
            const approvals: Approval[] = app.approvals || [];
            if (approvals.length > 0) {
              const latest = approvals
                .slice()
                .sort(
                  (a: Approval, b: Approval) =>
                    new Date(b.created_at).getTime() -
                    new Date(a.created_at).getTime()
                )[0];
              if (latest)
                msg += ` (${latest.action.toUpperCase()} by ${
                  latest.approver_role
                }${latest.remarks ? `: ${latest.remarks}` : ""})`;
            }
            results.push({
              id: `app-${app.id}`,
              message: msg,
              created_at: app.updated_at,
            });
          }
        } else {
          // For staff/ahod/hod: fetch students they are linked to with retry
          const studentsResult = await withRetryBatch([
            async () => await supabase
              .from("students")
              .select("id")
              .or(
                `mentor_id.eq.${profile.id},advisor_id.eq.${profile.id},ahod_id.eq.${profile.id},hod_id.eq.${profile.id}`
              )
              .limit(50)
          ]);
          const students = studentsResult[0].data;

          const studentIds = ((students || []) as Array<{ id: string }>).map(
            (s) => s.id
          );
          if (studentIds.length > 0) {
            // Query all four application tables for staff with retry
            const [odApps, leaveApps, gatepassApps, bonafideApps] =
              await withRetryBatch([
                async () => await supabase
                  .from("od_applications")
                  .select(
                    "id, student_id, status, updated_at, od_approvals(id, action, remarks, approver_role, created_at)"
                  )
                  .in("student_id", studentIds)
                  .order("updated_at", { ascending: false })
                  .limit(3),
                async () => await supabase
                  .from("leave_applications")
                  .select(
                    "id, student_id, status, updated_at, leave_approvals(id, action, remarks, approver_role, created_at)"
                  )
                  .in("student_id", studentIds)
                  .order("updated_at", { ascending: false })
                  .limit(3),
                async () => await supabase
                  .from("gatepass_applications")
                  .select(
                    "id, student_id, status, updated_at, gatepass_approvals(id, action, remarks, approver_role, created_at)"
                  )
                  .in("student_id", studentIds)
                  .order("updated_at", { ascending: false })
                  .limit(3),
                async () => await supabase
                  .from("bonafide_applications")
                  .select(
                    "id, student_id, status, updated_at, bonafide_approvals(id, action, remarks, approver_role, created_at)"
                  )
                  .in("student_id", studentIds)
                  .order("updated_at", { ascending: false })
                  .limit(3),
              ]);

            const odRows = (odApps.data || []) as RawAppRow[];
            const leaveRows = (leaveApps.data || []) as RawAppRow[];
            const gateRows = (gatepassApps.data || []) as RawAppRow[];
            const bonafideRows = (bonafideApps.data || []) as RawAppRow[];

            const allApps: Array<
              RawAppRow & { type?: string | null; approvals?: Approval[] }
            > = [
              ...odRows.map((app) => ({
                ...app,
                type: "od",
                approvals: app.od_approvals,
              })),
              ...leaveRows.map((app) => ({
                ...app,
                type: "leave",
                approvals: app.leave_approvals,
              })),
              ...gateRows.map((app) => ({
                ...app,
                type: "gatepass",
                approvals: app.gatepass_approvals,
              })),
              ...bonafideRows.map((app) => ({
                ...app,
                type: "bonafide",
                approvals: app.bonafide_approvals,
              })),
            ];

            allApps.sort(
              (a, b) =>
                new Date(b.updated_at).getTime() -
                new Date(a.updated_at).getTime()
            );
            const topApps = allApps.slice(0, 10);

            for (const app of topApps) {
              let msg = `Student application (${app.type?.toUpperCase()}) is ${
                app.status
              } - ${new Date(app.updated_at).toLocaleDateString()}`;
              const approvals: Approval[] = app.approvals || [];
              if (approvals.length > 0) {
                const latest = approvals
                  .slice()
                  .sort(
                    (a: Approval, b: Approval) =>
                      new Date(b.created_at).getTime() -
                      new Date(a.created_at).getTime()
                  )[0];
                if (latest)
                  msg += ` (${latest.action.toUpperCase()} by ${
                    latest.approver_role
                  }${latest.remarks ? `: ${latest.remarks}` : ""})`;
              }
              results.push({
                id: `app-${app.id}`,
                message: msg,
                created_at: app.updated_at,
              });
            }
          }

          // Also include approvals performed by this user - query all approval tables with retry
          const [
            odApprovals,
            leaveApprovals,
            gatepassApprovals,
            bonafideApprovals,
          ] = await withRetryBatch([
            async () => await supabase
              .from("od_approvals")
              .select(
                "id, application_id, action, remarks, approver_role, created_at"
              )
              .eq("approver_id", profile.id)
              .order("created_at", { ascending: false })
              .limit(3),
            async () => await supabase
              .from("leave_approvals")
              .select(
                "id, application_id, action, remarks, approver_role, created_at"
              )
              .eq("approver_id", profile.id)
              .order("created_at", { ascending: false })
              .limit(3),
            async () => await supabase
              .from("gatepass_approvals")
              .select(
                "id, application_id, action, remarks, approver_role, created_at"
              )
              .eq("approver_id", profile.id)
              .order("created_at", { ascending: false })
              .limit(3),
            async () => await supabase
              .from("bonafide_approvals")
              .select(
                "id, application_id, action, remarks, approver_role, created_at"
              )
              .eq("approver_id", profile.id)
              .order("created_at", { ascending: false })
              .limit(3),
          ]);

          const allApprovals = [
            ...(odApprovals.data || []),
            ...(leaveApprovals.data || []),
            ...(gatepassApprovals.data || []),
            ...(bonafideApprovals.data || []),
          ];

          allApprovals.sort(
            (a, b) =>
              new Date(b.created_at).getTime() -
              new Date(a.created_at).getTime()
          );
          const topApprovals = allApprovals.slice(0, 10);

          for (const a of topApprovals) {
            results.push({
              id: `apr-${a.id}`,
              message: `You ${a.action} an application (${a.approver_role})${
                a.remarks ? `: ${a.remarks}` : ""
              }`,
              created_at: a.created_at,
            });
          }
        }

        // sort combined results by created_at desc and limit
        const combined = results
          .sort(
            (x, y) =>
              new Date(y.created_at).getTime() -
              new Date(x.created_at).getTime()
          )
          .slice(0, 10);
        setNotifications(combined);
      } catch (err) {
        console.error("Error fetching notifications in layout:", err);
      }
    };

    fetchNotifications();
  }, [profile]);

  const handleSignOut = async () => {
    setShowLogoutModal(true);
  };

  const confirmLogout = async () => {
    setShowLogoutModal(false);
    try {
      await signOut();
      // Clear any local state
      setNotifications([]);
      setShowNotifications(false);
      // Force navigation with replace to prevent back button issues
      navigate("/login", { replace: true });
      // Additional cleanup - force reload for Edge browser
      if (navigator.userAgent.includes("Edg")) {
        window.location.href = "/login";
      }
    } catch (error) {
      console.error("Error signing out:", error);
      // Even if there's an error, try to navigate to login
      navigate("/login", { replace: true });
    }
  };

  return (
    <div className="min-h-screen bg-slate-100 overflow-x-hidden">
      <nav className="bg-white shadow-md border-b border-slate-200 fixed top-0 left-0 right-0 z-50">
        <div className="px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <div className="flex items-center space-x-4">
              <button
                onClick={() => setSidebarOpen((s) => !s)}
                className="p-2 rounded-lg hover:bg-slate-100 transition-colors"
              >
                {sidebarOpen ? (
                  <X className="h-6 w-6 text-slate-600" />
                ) : (
                  <Menu className="h-6 w-6 text-slate-600" />
                )}
              </button>
              <div className="flex items-center space-x-2">
                <img src={idcsLogo} alt="IDCS Logo" className="h-12 w-auto" />
              </div>
            </div>
            <div className="flex items-center space-x-4">
              <button
                ref={notificationButtonRef}
                onClick={() => setShowNotifications((s) => !s)}
                className="hidden sm:block p-2 rounded-lg hover:bg-slate-100 transition-colors relative"
                title="Notifications"
              >
                <Bell className="h-5 w-5 text-slate-600" />
                {notifications.length > 0 && (
                  <span className="absolute -top-1 -right-1 bg-red-600 text-white text-[10px] rounded-full px-1">
                    {notifications.length}
                  </span>
                )}
              </button>
              <button
                onClick={() => navigate("/profile")}
                className="hidden sm:block text-right bg-slate-100 hover:bg-slate-200 rounded-lg px-2 py-1"
                title={
                  profile?.is_department_admin
                    ? `Profile — Admin${
                        profile?.department_admin_for
                          ? ` (${profile.department_admin_for})`
                          : ""
                      }`
                    : "Profile"
                }
              >
                <div className="flex items-center justify-end gap-2">
                  <div className="text-right">
                    <p className="text-sm font-medium text-slate-800 flex items-center justify-end gap-2">
                      <span>{profile?.name}</span>
                      {profile?.is_department_admin && (
                        <span
                          title={
                            profile?.department_admin_for
                              ? `Department: ${profile.department_admin_for}`
                              : "Department Admin"
                          }
                          className="inline-block bg-amber-100 text-amber-800 text-xs px-2 py-0.5 rounded-full font-medium"
                        >
                          Admin
                        </span>
                      )}
                    </p>
                    <p className="text-xs text-slate-500 capitalize">
                      {profile?.role}
                    </p>
                  </div>
                </div>
              </button>
              {/* Mobile profile button */}
              <button
                onClick={() => navigate("/profile")}
                className="sm:hidden p-2 rounded-lg hover:bg-slate-100 transition-colors"
                title={
                  profile?.is_department_admin
                    ? `Profile — Admin${
                        profile?.department_admin_for
                          ? ` (${profile.department_admin_for})`
                          : ""
                      }`
                    : "Profile"
                }
              >
                <User className="h-5 w-5 text-slate-600" />
              </button>
              <button
                onClick={handleSignOut}
                className="p-2 rounded-lg hover:bg-slate-100 transition-colors"
                title="Sign Out"
              >
                <LogOut className="h-5 w-5 text-slate-600" />
              </button>
            </div>
          </div>
        </div>
      </nav>

      {showNotifications && (
        <div
          ref={notificationRef}
          className="fixed right-4 top-16 z-50 w-80 sm:w-96 bg-white shadow-lg rounded-lg p-0"
        >
          <h4 className="font-semibold px-3 py-2 border-b">Notifications</h4>
          <ul className="max-h-64 overflow-y-auto">
            {notifications.length === 0 ? (
              <li className="p-3 text-sm text-slate-500">No notifications</li>
            ) : (
              notifications.map((n) => (
                <li key={n.id} className="p-3 border-b last:border-b-0 text-sm">
                  <div>{n.message}</div>
                  <div className="text-xs text-slate-400 mt-1">
                    {new Date(n.created_at).toLocaleString()}
                  </div>
                </li>
              ))
            )}
          </ul>
        </div>
      )}

      <div className="flex pt-16">
        <aside
          className={`fixed left-0 top-16 bottom-0 w-full sm:w-64 bg-white border-r border-slate-200 transform transition-transform duration-300 ease-in-out z-40 flex flex-col ${
            sidebarOpen ? "translate-x-0" : "-translate-x-full"
          }`}
        >
          <nav
            className="p-4 overflow-y-auto flex-1"
            style={{ WebkitOverflowScrolling: "touch" }}
          >
            <ul className="space-y-2">
              {/* Role-based sidebar: compute menu based on `profile.role`.
                  Assumptions: user roles are 'student', 'staff', 'ahod', 'hod', 'admin'.
                  If you meant different role names, tell me and I'll adjust. */}
              {useMemo(() => {
                const role = profile?.role || "guest";

                const studentMenu = [
                  {
                    label: "Dashboard",
                    path: "/dashboard",
                    icon: <Home className="h-5 w-5" />,
                  },
                  {
                    label: "OD",
                    path: "/student/od",
                    icon: <FileText className="h-5 w-5" />,
                  },
                  {
                    label: "Leave",
                    path: "/student/leave",
                    icon: <FileText className="h-5 w-5" />,
                  },
                  {
                    label: "Bonafide",
                    path: "/student/bonafide",
                    icon: <Award className="h-5 w-5" />,
                  },
                  {
                    label: "Gatepass",
                    path: "/student/gatepass",
                    icon: <CreditCard className="h-5 w-5" />,
                  },
                  {
                    label: "Certificates",
                    path: "/student/certificates",
                    icon: <Award className="h-5 w-5" />,
                  },
                  // Attendance placed immediately after Gatepass, matching Electives card styling/page
                  {
                    label: "My Attendance",
                    path: "/student/attendance",
                    icon: <BookOpen className="h-5 w-5" />,
                  },
                  {
                    label: "My Subjects",
                    path: "/student/subjects",
                    icon: <BookOpen className="h-5 w-5" />,
                  },
                  {
                    label: "My Electives",
                    path: "/student/electives",
                    icon: <BookOpen className="h-5 w-5" />,
                  },
                  {
                    label: "Feedback",
                    path: "/student/feedback",
                    icon: <FileText className="h-5 w-5" />,
                  },
                  {
                    label: "Notifications",
                    path: "/notifications",
                    icon: <Bell className="h-5 w-5" />,
                  },
                  {
                    label: "Notices",
                    path: "/notices",
                    icon: <Megaphone className="h-5 w-5" />,
                  },
                ];

                const staffMenu = [
                  {
                    label: "Dashboard",
                    path: "/dashboard",
                    icon: <Home className="h-5 w-5" />,
                  },
                  {
                    label: "OD",
                    path: "/staff/od",
                    icon: <FileText className="h-5 w-5" />,
                  },
                  {
                    label: "Leave",
                    path: "/staff/leave",
                    icon: <FileText className="h-5 w-5" />,
                  },
                  {
                    label: "Bonafide",
                    path: "/staff/bonafide",
                    icon: <Award className="h-5 w-5" />,
                  },
                  {
                    label: "Gatepass",
                    path: "/staff/gatepass",
                    icon: <CreditCard className="h-5 w-5" />,
                  },
                  {
                    label: "Certificates",
                    path: "/staff/certificates",
                    icon: <Award className="h-5 w-5" />,
                  },
                  {
                    label: "My Certificates",
                    path: "/staff/my-certificates",
                    icon: <Award className="h-5 w-5" />,
                  },
                  {
                    label: "Event Participation",
                    path: "/staff/event-participation-status",
                    icon: <Calendar className="h-5 w-5" />,
                  },
                  // There is no dedicated staff notifications route; point to /dashboard where notifications appear in the header
                  {
                    label: "Notifications",
                    path: "/notifications",
                    icon: <Bell className="h-5 w-5" />,
                  },
                  {
                    label: "Notices",
                    path: "/notices",
                    icon: <Megaphone className="h-5 w-5" />,
                  },
                  {
                    label: "My Subjects",
                    path: "/staff/subjects",
                    icon: <BookOpen className="h-5 w-5" />,
                  },
                  {
                    label: "My Students",
                    path: "/staff/students",
                    icon: <Users className="h-5 w-5" />,
                  },
                  {
                    label: "My Mentees",
                    path: "/staff/mentees",
                    icon: <User className="h-5 w-5" />,
                  },
                  {
                    label: "Manage Mentees",
                    path: "/staff/manage-mentees",
                    icon: <Users className="h-5 w-5" />,
                  },
                  {
                    label: "Attendance",
                    path: "/staff/attendance",
                    icon: <ClipboardCheck className="h-5 w-5" />,
                  },
                  {
                    label: "Timetable",
                    path: "/staff/timetable",
                    icon: <BookOpen className="h-5 w-5" />,
                  },
                  {
                    label: "My Leave",
                    path: "/staff/my-leave",
                    icon: <FileText className="h-5 w-5" />,
                  },
                ];
                // If user is a department admin, add Department link right after Dashboard
                if (profile?.is_department_admin) {
                  const deptEntry = {
                    label: "Department",
                    path: "/staff/department",
                    icon: <Users className="h-5 w-5" />,
                  };
                  // Insert after the first item (Dashboard)
                  staffMenu.splice(1, 0, deptEntry);
                }

                // Manage Mentees is shown for staff in the role menu (no conditional splice)

                const ahodMenu = [
                  {
                    label: "Dashboard",
                    path: "/dashboard",
                    icon: <Home className="h-5 w-5" />,
                  },
                  {
                    label: "OD",
                    path: "/ahod/od",
                    icon: <FileText className="h-5 w-5" />,
                  },
                  {
                    label: "Leave",
                    path: "/ahod/leave",
                    icon: <FileText className="h-5 w-5" />,
                  },
                  {
                    label: "Attendance",
                    path: "/ahod/attendance",
                    icon: <ClipboardCheck className="h-5 w-5" />,
                  },
                  {
                    label: "Bonafide",
                    path: "/ahod/bonafide",
                    icon: <Award className="h-5 w-5" />,
                  },
                  {
                    label: "Gatepass",
                    path: "/ahod/gatepass",
                    icon: <CreditCard className="h-5 w-5" />,
                  },
                  {
                    label: "Certificates",
                    path: "/ahod/certificates",
                    icon: <Award className="h-5 w-5" />,
                  },
                  {
                    label: "My Leave",
                    path: "/staff/my-leave",
                    icon: <FileText className="h-5 w-5" />,
                  },
                  {
                    label: "Notifications",
                    path: "/notifications",
                    icon: <Bell className="h-5 w-5" />,
                  },
                  {
                    label: "Notices",
                    path: "/notices",
                    icon: <Megaphone className="h-5 w-5" />,
                  },
                  {
                    label: "My Mentees",
                    path: "/ahod/mentees",
                    icon: <User className="h-5 w-5" />,
                  },
                  {
                    label: "Students",
                    path: "/ahod/students",
                    icon: <Users className="h-5 w-5" />,
                  },
                  {
                    label: "Subjects",
                    path: "/ahod/subjects",
                    icon: <BookOpen className="h-5 w-5" />,
                  },
                  {
                    label: "My Certificates",
                    path: "/ahod/my-certificates",
                    icon: <Award className="h-5 w-5" />,
                  },
                  {
                    label: "Staff",
                    path: "/ahod/staff",
                    icon: <Users className="h-5 w-5" />,
                  },
                ];

                // The user provided two "ahod" lines; assuming the second was intended for HOD with extra manage action
                const hodMenu = [
                  {
                    label: "Dashboard",
                    path: "/dashboard",
                    icon: <Home className="h-5 w-5" />,
                  },
                  // Department link for HODs will be conditionally inserted below if mapping exists
                  {
                    label: "OD",
                    path: "/hod/od",
                    icon: <FileText className="h-5 w-5" />,
                  },
                  {
                    label: "Leave",
                    path: "/hod/leave",
                    icon: <FileText className="h-5 w-5" />,
                  },
                  {
                    label: "Bonafide",
                    path: "/hod/bonafide",
                    icon: <Award className="h-5 w-5" />,
                  },
                  {
                    label: "Gatepass",
                    path: "/hod/gatepass",
                    icon: <CreditCard className="h-5 w-5" />,
                  },
                  {
                    label: "Certificates",
                    path: "/hod/certificates",
                    icon: <Award className="h-5 w-5" />,
                  },
                  {
                    label: "My Mentees",
                    path: "/hod/mentees",
                    icon: <User className="h-5 w-5" />,
                  },
                  {
                    label: "Manage Mentees",
                    path: "/hod/manage-mentees",
                    icon: <Users className="h-5 w-5" />,
                  },
                  {
                    label: "Students",
                    path: "/hod/students",
                    icon: <Users className="h-5 w-5" />,
                  },
                  {
                    label: "Subjects",
                    path: "/hod/subjects",
                    icon: <BookOpen className="h-5 w-5" />,
                  },
                  {
                    label: "My Certificates",
                    path: "/hod/my-certificates",
                    icon: <Award className="h-5 w-5" />,
                  },
                  {
                    label: "Curriculum",
                    path: "/hod/curriculum",
                    icon: <BookOpen className="h-5 w-5" />,
                  },
                  {
                    label: "Staff Leave",
                    path: "/hod/staff-leave-approval",
                    icon: <ClipboardCheck className="h-5 w-5" />,
                  },
                  {
                    label: "My Leave",
                    path: "/staff/my-leave",
                    icon: <FileText className="h-5 w-5" />,

                  },
                  {
                    label: "Staff",
                    path: "/hod/staff",
                    icon: <Users className="h-5 w-5" />,
                  },
                  // Place Feedback directly above Notifications per request
                  {
                    label: "Feedback",
                    path: "/hod/feedback",
                    icon: <FileText className="h-5 w-5" />,
                  },
                  {
                    label: "Notifications",
                    path: "/notifications",
                    icon: <Bell className="h-5 w-5" />,
                  },
                  {
                    label: "Notices",
                    path: "/notices",
                    icon: <Megaphone className="h-5 w-5" />,
                  },
                ];

                // If this HOD is mapped to a specific department (department_leads), insert a Department link
                if (hodDepartment) {
                  const hodDeptEntry = {
                    label: hodDepartment.name ? `Department: ${hodDepartment.name}` : 'Department',
                    path: `/hod/students?dept=${encodeURIComponent(hodDepartment.id)}`,
                    icon: <Users className="h-5 w-5" />,
                  };
                  // Insert after the first item (Dashboard)
                  hodMenu.splice(1, 0, hodDeptEntry);
                }

                const principalMenu = [

                  { label: 'Dashboard', path: '/principal-dashboard', icon: <Home className="h-5 w-5" /> },
                  { label: 'Subjects', path: '/principal/subjects', icon: <BookOpen className="h-5 w-5" /> },
                  { label: 'Staff Details', path: '/principal/staff-details', icon: <Users className="h-5 w-5" /> },
                  { label: 'Student Details', path: '/principal/student-details', icon: <GraduationCap className="h-5 w-5" /> },
                  { label: 'Attendance', path: '/principal/attendance', icon: <BarChart3 className="h-5 w-5" /> },
                  { label: 'Staff Leave', path: '/principal/staff-leave', icon: <Calendar className="h-5 w-5" /> },
                  { label: 'Feedback', path: '/principal/feedback', icon: <MessageSquare className="h-5 w-5" /> },
                  { label: 'Notices', path: '/principal/notices', icon: <Megaphone className="h-5 w-5" /> },
                  { label: 'Forms', path: '/principal/forms', icon: <FileText className="h-5 w-5" /> },
                  { label: 'Views', path: '/admin/views', icon: <User className="h-5 w-5" /> },
                  { label: 'Notifications', path: '/notifications', icon: <Bell className="h-5 w-5" /> },

                ];

                const adminMenu = [
                  {
                    label: "Dashboard",
                    path: "/dashboard",
                    icon: <Home className="h-5 w-5" />,
                  },
                  {
                    label: "Notifications",
                    path: "/notifications",
                    icon: <Bell className="h-5 w-5" />,
                  },
                  {
                    label: "Notices",
                    path: "/notices",
                    icon: <Megaphone className="h-5 w-5" />,
                  },
                  {
                    label: "Create",
                    path: "/admin/Create",
                    icon: <Users className="h-5 w-5" />,
                  },
                  {
                    label: "Departments",
                    path: "/admin/departments",
                    icon: <Users className="h-5 w-5" />,
                  },
                  {
                    label: "Subjects",
                    path: "/admin/subjects",
                    icon: <BookOpen className="h-5 w-5" />,
                  },
                  {
                    label: "Timetable",
                    path: "/admin/timetable",
                    icon: <BookOpen className="h-5 w-5" />,
                  },
                  {
                    label: "Views",
                    path: "/admin/views",
                    icon: <User className="h-5 w-5" />,
                  },
                ];

                const psMenu = [
                  {
                    label: "Dashboard",
                    path: "/ps-dashboard",
                    icon: <Home className="h-5 w-5" />,
                  },
                  {
                    label: "Notifications",
                    path: "/notifications",
                    icon: <Bell className="h-5 w-5" />,
                  },
                  {
                    label: "Notices",
                    path: "/notices",
                    icon: <Megaphone className="h-5 w-5" />,
                  },
                  {
                    label: "Bonafide Applications",
                    path: "/ps/bonafide",
                    icon: <Award className="h-5 w-5" />,
                  },
                ];

                // Determine base menu from role
                let roleMenu = studentMenu;
                switch (role) {
                  case "student":
                    roleMenu = studentMenu;
                    break;
                  case "principal":
                    roleMenu = principalMenu;
                    break;
                  case "staff":
                    roleMenu = staffMenu;
                    break;
                  case "ps":
                    roleMenu = psMenu;
                    break;
                  case "ahod":
                    roleMenu = ahodMenu;
                    break;
                  case "hod":
                    roleMenu = hodMenu;
                    break;
                  case "admin":
                    roleMenu = adminMenu;
                    break;
                  default:
                    roleMenu = [
                      {
                        label: "Dashboard",
                        path: "/dashboard",
                        icon: <Home className="h-5 w-5" />,
                      },
                    ];
                }

                // Always render the canonical role-based menu to keep sidebar constant across pages.
                // Ignore page-provided `sidebarItems` to avoid inconsistent sidebars.
                let menuToRender: {
                  label: string;
                  path: string;
                  icon: ReactNode;
                }[] = roleMenu;


                // If user is from IQAC department HOD, provide a restricted IQAC menu
                // Do NOT clear or override menus for other IQAC users (e.g., principals)
                if (profile?.department === 'IQAC' && profile?.role === 'hod') {
                  // IQAC HODs: include quick links for common application types
                  menuToRender = [
                    {
                      label: "Dashboard",
                      path: "/iqac/dashboard",
                      icon: <Home className="h-5 w-5" />,
                    },
                    {
                      label: "OD",
                      path: "/iqac/od",
                      icon: <FileText className="h-5 w-5" />,
                    },
                    {
                      label: "Leave",
                      path: "/iqac/leave",
                      icon: <Calendar className="h-5 w-5" />,
                    },
                    {
                      label: "Bonafide",
                      path: "/iqac/bonafide",
                      icon: <Award className="h-5 w-5" />,
                    },
                    {
                      label: "Gatepass",
                      path: "/iqac/gatepass",
                      icon: <CreditCard className="h-5 w-5" />,
                    },
                    {
                      label: "Subjects",
                      path: "/iqac/subjects",
                      icon: <BookOpen className="h-5 w-5" />,
                    },
                    {
                      label: "Departments",
                      path: "/iqac/departments",
                      icon: <Users className="h-5 w-5" />,
                    },
                    {
                      label: "Curriculum",
                      path: "/iqac/curriculum",
                      icon: <ClipboardCheck className="h-5 w-5" />,
                    },
                    {
                      label: "Staff Details",
                      path: "/principal/staff-details",
                      icon: <Users className="h-5 w-5" />,
                    },
                    {
                      label: "Student Details",
                      path: "/principal/student-details",
                      icon: <GraduationCap className="h-5 w-5" />,
                    },
                    {
                      label: "Electives",
                      path: "/principal/electives",
                      icon: <FileText className="h-5 w-5" />,
                    },
                    {
                      label: "Event Approvals",
                      path: "/iqac/event-participation-approval",
                      icon: <Calendar className="h-5 w-5" />,
                    },
                  ];
                }

                // If user is PE HOD/AHOD, provide PE-specific menu
                if (
                  profile &&
                  (profile.role === 'hod' || profile.role === 'ahod') &&
                  (String(profile.department || '').toLowerCase().includes('physical') || 
                   String(profile.department || '').toLowerCase() === 'pe')
                ) {
                  if (profile.role === 'hod') {
                    menuToRender = [
                      { label: 'Dashboard', path: '/pe-dashboard', icon: <Home className="h-5 w-5" /> },
                      { label: 'Group OD', path: '/pe/group-od', icon: <Users className="h-5 w-5" /> },
                      { label: 'Event Participation', path: '/hod/event-participation-form', icon: <Calendar className="h-5 w-5" /> },
                      { label: 'Event Approvals', path: '/hod/event-participation-approval', icon: <ClipboardCheck className="h-5 w-5" /> },
                      { label: 'My Certificates', path: '/hod/my-certificates', icon: <Award className="h-5 w-5" /> },
                      { label: 'Staff Leave', path: '/hod/staff-leave-approval', icon: <ClipboardCheck className="h-5 w-5" /> },
                      { label: 'My Leave', path: '/staff/my-leave', icon: <FileText className="h-5 w-5" /> },
                      { label: 'Staff', path: '/hod/staff', icon: <Users className="h-5 w-5" /> },
                      { label: 'Feedback', path: '/hod/feedback', icon: <FileText className="h-5 w-5" /> },
                      { label: 'Notifications', path: '/notifications', icon: <Bell className="h-5 w-5" /> },
                      { label: 'Notices', path: '/notices', icon: <Megaphone className="h-5 w-5" /> },
                    ];
                  } else {
                    // PE AHOD
                    menuToRender = [
                      { label: 'Dashboard', path: '/pe-dashboard', icon: <Home className="h-5 w-5" /> },
                      { label: 'Group OD', path: '/pe/group-od', icon: <Users className="h-5 w-5" /> },
                      { label: 'Students', path: '/ahod/students', icon: <Users className="h-5 w-5" /> },
                      { label: 'Subjects', path: '/ahod/subjects', icon: <BookOpen className="h-5 w-5" /> },
                      { label: 'My Leave', path: '/staff/my-leave', icon: <FileText className="h-5 w-5" /> },
                      { label: 'Staff', path: '/ahod/staff', icon: <Users className="h-5 w-5" /> },
                      { label: 'Event Participation', path: '/ahod/event-participation-form', icon: <Calendar className="h-5 w-5" /> },
                      { label: 'Notifications', path: '/notifications', icon: <Bell className="h-5 w-5" /> },
                      { label: 'Notices', path: '/notices', icon: <Megaphone className="h-5 w-5" /> },
                    ];
                  }
                }

                return menuToRender.map((item) => {
                  const isActive =
                    location.pathname === item.path ||
                    location.pathname.startsWith(item.path + "/");
                  return (
                    <li key={item.path}>
                      <Link
                        to={item.path}
                        onClick={() => {
                          if (!isDesktop) setSidebarOpen(false);
                        }}
                        className={`w-full flex items-center space-x-3 px-4 py-3 rounded-lg transition-colors font-medium ${
                          isActive
                            ? "bg-blue-600 text-white"
                            : "text-slate-700 hover:bg-blue-50 hover:text-blue-600"
                        }`}
                      >
                        <span
                          className={`${
                            isActive ? "text-white" : "text-slate-500"
                          }`}
                        >
                          {item.icon}
                        </span>
                        <span>{item.label}</span>
                      </Link>
                    </li>
                  );
                });
              }, [
                profile,
                staffRole,
                sidebarItems,
                location.pathname,
                isDesktop,
                navigate,
              ])}
            </ul>
          </nav>
        </aside>

        <main
          className={`flex-1 transition-all duration-300 ${
            isDesktop && sidebarOpen ? "ml-64" : "ml-0"
          }`}
        >
          <div className="p-4 sm:p-6 lg:p-8">{children}</div>
        </main>
      </div>

      {sidebarOpen && !isDesktop && (
        <div
          className="fixed inset-0 bg-black bg-opacity-50 z-30 top-16"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Logout Confirmation Modal */}
      {showLogoutModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50 p-4">
          <div className="bg-white rounded-lg shadow-xl max-w-md w-full mx-4">
            <div className="p-6">
              <div className="flex items-center mb-4">
                <div className="flex-shrink-0 w-12 h-12 bg-red-100 rounded-full flex items-center justify-center">
                  <LogOut className="w-6 h-6 text-red-600" />
                </div>
                <div className="ml-4">
                  <h3 className="text-lg font-medium text-gray-900">Confirm Logout</h3>
                  <p className="text-sm text-gray-500">Are you sure you want to logout?</p>
                </div>
              </div>
              <div className="flex justify-end space-x-3">
                <button
                  onClick={() => setShowLogoutModal(false)}
                  className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 border border-gray-300 rounded-md hover:bg-gray-200 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-gray-500 transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={confirmLogout}
                  className="px-4 py-2 text-sm font-medium text-white bg-red-600 border border-transparent rounded-md hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500 transition-colors"
                >
                  Logout
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
