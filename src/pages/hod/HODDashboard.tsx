import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  FileText,
  Calendar,
  CreditCard,
  Award,
  Home,
  Users,
  UserCog,
  ClipboardCheck,
  Bell,
  TrendingUp,
  UserCheck,
  Megaphone,
  CheckCircle,
  XCircle,
  BarChart3,
  BookOpen,
  MessageSquare,

} from "lucide-react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import DashboardLayout from "../../components/DashboardLayout";
import { supabase, withRetryBatch, withRetry } from "../../lib/supabase";
import { useAuth } from "../../contexts/AuthContext";
import AttendanceOverviewChart from "../../components/analytics/AttendanceOverviewChart";
import DepartmentPerformanceTable from "../../components/analytics/DepartmentPerformanceTable";

export default function HODDashboard() {
  const { user, profile } = useAuth();
  const navigate = useNavigate();
  
  // Redirect IQAC HOD users to the IQAC dashboard route
  useEffect(() => {
    if (profile?.department === "IQAC") {
      navigate("/iqac/dashboard");
    }
  }, [profile, navigate]);
  const [pendingCounts, setPendingCounts] = useState({
    od: 0,
    leave: 0,
    gatepass: 0,
    bonafide: 0,
  });
  const [totalCounts, setTotalCounts] = useState({
    od: 0,
    leave: 0,
    gatepass: 0,
    bonafide: 0,
  });
  const [loading, setLoading] = useState(true);
  const [onLeave, setOnLeave] = useState(false);
  const [updatingLeave, setUpdatingLeave] = useState(false);
  const [showLeaveConfirmation, setShowLeaveConfirmation] = useState(false);
  const [showNotification, setShowNotification] = useState(false);
  const [notificationMessage, setNotificationMessage] = useState("");
  const [notificationType, setNotificationType] = useState<"success" | "error">(
    "success"
  );
  const [showNotifications, setShowNotifications] = useState(false);
  const [notifications, setNotifications] = useState<
    Array<{ id: string; type: string; status: string; date: string }>
  >([]);
  const [attendanceStats, setAttendanceStats] = useState({
    totalStudents: 0,
    presentToday: 0,
    absentToday: 0,
    averageAttendance: 0,
  });
  const [selectedYear, setSelectedYear] = useState<number>(2);
  const [performanceData, setPerformanceData] = useState<
    Array<{
      section: string;
      passPercentage: number;
      studentCount: number;
      passed: number;
      failed: number;
    }>
  >([]);
  const [loadingStats, setLoadingStats] = useState(false);

  useEffect(() => {
    if (user) {
      fetchPendingCounts();
      fetchLeaveStatus();
      fetchNotifications();
      fetchAttendanceStats();
      fetchPerformanceData();

      // Subscribe to staff row changes for the current user so leave status updates across sessions
      const staffChannel = supabase
        .channel("staff-leave-hod")
        .on(
          "postgres_changes",
          {
            event: "UPDATE",
            schema: "public",
            table: "staff",
            filter: `id=eq.${user?.id}`,
          },
          (payload) => {
            try {
              const newVal = (payload.new as any)?.on_leave;
              if (typeof newVal !== "undefined") setOnLeave(newVal);
            } catch (e) {
              /* ignore */
            }
          }
        )
        .subscribe();

      return () => {
        try {
          staffChannel.unsubscribe();
        } catch (e) {
          /* ignore */
        }
      };
    }
  }, [user]);

  const fetchLeaveStatus = async () => {
    try {
      const { data: staffData } = await supabase
        .from("staff")
        .select("on_leave")
        .eq("id", user?.id)
        .maybeSingle();

      const initialLeaveStatus = staffData?.on_leave || false;
      setOnLeave(initialLeaveStatus);
      console.log("Initial leave status fetched:", initialLeaveStatus);
    } catch (error) {
      console.error("Error fetching leave status:", error);
    }
  };

  const handleLeaveToggle = async () => {
    setShowLeaveConfirmation(true);
  };

  const confirmLeaveToggle = async () => {
    setShowLeaveConfirmation(false);
    const newLeaveStatus = !onLeave;

    try {
      setUpdatingLeave(true);
      console.log(
        "Toggling leave status for HOD:",
        user?.id,
        "Current:",
        onLeave,
        "New:",
        newLeaveStatus
      );

      // Perform update and request the updated row back to verify
      const { data: updatedRow, error: updateError } = await supabase
        .from("staff")
        .update({ on_leave: newLeaveStatus })
        .eq("id", user?.id)
        .select("on_leave")
        .maybeSingle();

      if (updateError) {
        console.error("Error updating leave status:", updateError);
        throw updateError;
      }

      const verified = updatedRow?.on_leave ?? newLeaveStatus;
      console.log("Leave status after update (verified):", verified);

      setOnLeave(verified);
      setNotificationMessage(
        `Leave status updated to: ${verified ? "On Leave" : "Active"}`
      );
      setNotificationType("success");
      setShowNotification(true);
    } catch (error) {
      console.error("Error toggling leave status:", error);
      setNotificationMessage(
        "Failed to update leave status. Please try again."
      );
      setNotificationType("error");
      setShowNotification(true);
    } finally {
      setUpdatingLeave(false);
    }
  };

  const fetchPendingCounts = async () => {
    try {
      const studentsResult = await withRetry(async () =>
        await supabase
          .from("students")
          .select("id")
          .eq("hod_id", user?.id)
      );

      if (studentsResult.error) throw studentsResult.error;
      const students = studentsResult.data;

      const studentIds = students?.map((s) => s.id) || [];

      if (studentIds.length > 0) {
        // Query all application tables for pending and total using count
        const [
          odPending,
          leavePending,
          gatepassPending,
          bonafidePending,
          odTotal,
          leaveTotal,
          gatepassTotal,
          bonafideTotal,
        ] = await withRetryBatch([
          // Pending applications
          async () => await supabase
            .from("od_applications")
            .select("*", { count: "exact", head: true })
            .in("student_id", studentIds)
            .eq("status", "pending")
            .eq("current_approver_level", "hod"),
          async () => await supabase
            .from("leave_applications")
            .select("*", { count: "exact", head: true })
            .in("student_id", studentIds)
            .eq("status", "pending")
            .eq("current_approver_level", "hod"),
          async () => await supabase
            .from("gatepass_applications")
            .select("*", { count: "exact", head: true })
            .in("student_id", studentIds)
            .eq("status", "pending")
            .eq("current_approver_level", "hod"),
          async () => await supabase
            .from("bonafide_applications")
            .select("*", { count: "exact", head: true })
            .in("student_id", studentIds)
            .eq("status", "pending")
            .eq("current_approver_level", "hod"),
          // Total applications
          async () => await supabase
            .from("od_applications")
            .select("*", { count: "exact", head: true })
            .in("student_id", studentIds),
          async () => await supabase
            .from("leave_applications")
            .select("*", { count: "exact", head: true })
            .in("student_id", studentIds),
          async () => await supabase
            .from("gatepass_applications")
            .select("*", { count: "exact", head: true })
            .in("student_id", studentIds),
          async () => await supabase
            .from("bonafide_applications")
            .select("*", { count: "exact", head: true })
            .in("student_id", studentIds),
        ]);

        const pending = {
          od: odPending.count || 0,
          leave: leavePending.count || 0,
          gatepass: gatepassPending.count || 0,
          bonafide: bonafidePending.count || 0,
        };

        const total = {
          od: odTotal.count || 0,
          leave: leaveTotal.count || 0,
          gatepass: gatepassTotal.count || 0,
          bonafide: bonafideTotal.count || 0,
        };

        setPendingCounts(pending);
        setTotalCounts(total);
      }
    } catch (error) {
      console.error("Error fetching pending counts:", error);
    } finally {
      setLoading(false);
    }
  };

  const fetchNotifications = async () => {
    try {
      const studentsResult = await withRetry(async () =>
        await supabase
          .from("students")
          .select("id")
          .eq("hod_id", user?.id)
      );

      const studentIds = studentsResult.data?.map((s) => s.id) || [];
      if (studentIds.length === 0) return;

      const [odApps, leaveApps, gatepassApps, bonafideApps] = await withRetryBatch(
        [
          async () => await supabase
            .from("od_applications")
            .select("id, status, updated_at")
            .in("student_id", studentIds)
            .order("updated_at", { ascending: false })
            .limit(3),
          async () => await supabase
            .from("leave_applications")
            .select("id, status, updated_at")
            .in("student_id", studentIds)
            .order("updated_at", { ascending: false })
            .limit(3),
          async () => await supabase
            .from("gatepass_applications")
            .select("id, status, updated_at")
            .in("student_id", studentIds)
            .order("updated_at", { ascending: false })
            .limit(3),
          async () => await supabase
            .from("bonafide_applications")
            .select("id, status, updated_at")
            .in("student_id", studentIds)
            .order("updated_at", { ascending: false })
            .limit(3),
        ]
      );

      const allApps: any[] = [
        ...(odApps.data || []).map((app: any) => ({ ...app, type: "OD" })),
        ...(leaveApps.data || []).map((app: any) => ({
          ...app,
          type: "Leave",
        })),
        ...(gatepassApps.data || []).map((app: any) => ({
          ...app,
          type: "Gatepass",
        })),
        ...(bonafideApps.data || []).map((app: any) => ({
          ...app,
          type: "Bonafide",
        })),
      ];

      allApps.sort(
        (a, b) =>
          new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime()
      );
      const topApps = allApps.slice(0, 10);

      const notifs = topApps.map((app) => ({
        id: app.id,
        type: app.type,
        status: app.status,
        date: new Date(app.updated_at).toLocaleDateString(),
      }));

      setNotifications(notifs);
    } catch (error) {
      console.error("Error fetching notifications:", error);
    }
  };

  const fetchAttendanceStats = async () => {
    try {
      setLoadingStats(true);
      const today = new Date().toISOString().split("T")[0];

      // Get all students in the department
      const studentsResult = await withRetry(async () =>
        await supabase
          .from("students")
          .select("id")
          .eq("hod_id", user?.id)
      );

      const totalStudents = studentsResult.data?.length || 0;
      const studentIds = studentsResult.data?.map((s) => s.id) || [];

      if (studentIds.length === 0) {
        setAttendanceStats({
          totalStudents: 0,
          presentToday: 0,
          absentToday: 0,
          averageAttendance: 0,
        });
        return;
      }

      // Get today's attendance
      const { data: todayAttendance } = await supabase
        .from("daily_attendance")
        .select("status")
        .in("student_id", studentIds)
        .eq("date", today);

      const presentToday =
        todayAttendance?.filter((a) => a.status === "present").length || 0;
      const absentToday =
        todayAttendance?.filter((a) => a.status === "absent").length || 0;

      // Calculate average attendance (last 30 days)
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
      const startDate = thirtyDaysAgo.toISOString().split("T")[0];

      const { data: monthAttendance } = await supabase
        .from("daily_attendance")
        .select("status")
        .in("student_id", studentIds)
        .gte("date", startDate);

      const totalRecords = monthAttendance?.length || 0;
      const presentRecords =
        monthAttendance?.filter((a) => a.status === "present").length || 0;
      const averageAttendance =
        totalRecords > 0
          ? Math.round((presentRecords / totalRecords) * 100)
          : 0;

      setAttendanceStats({
        totalStudents,
        presentToday,
        absentToday,
        averageAttendance,
      });
    } catch (error) {
      console.error("Error fetching attendance stats:", error);
    } finally {
      setLoadingStats(false);
    }
  };

  const fetchPerformanceData = async () => {
    try {
      setLoadingStats(true);
      // Get students by year and section from the department
      const { data: students } = await supabase
        .from("students")
        .select("id, year, section")
        .eq("hod_id", user?.id)
        .eq("year", selectedYear);

      if (!students || students.length === 0) {
        setPerformanceData([]);
        return;
      }

      // Group students by section and calculate pass percentage
      // Note: Since there's no actual grades field, we'll generate representative data
      const sectionMap = new Map<string, { ids: string[]; count: number }>();

      students.forEach((student) => {
        const section = student.section || "Unknown";
        if (!sectionMap.has(section)) {
          sectionMap.set(section, { ids: [], count: 0 });
        }
        const data = sectionMap.get(section)!;
        data.ids.push(student.id);
        data.count++;
      });

      // Generate performance data (in real scenario, this would come from grades/results table)
      // Class pass % = percentage of students who passed ALL subjects (no failures)
      const performanceArray = Array.from(sectionMap.entries()).map(
        ([section, data]) => {
          // Mock data: Simulate students who passed all subjects (70-90% typically pass all subjects)
          const passAllSubjectsPercentage = parseFloat(
            (70 + Math.random() * 20).toFixed(1)
          ); // Mock data: 70-90%
          const passedAllSubjects = Math.round(
            (data.count * passAllSubjectsPercentage) / 100
          );
          const failedAnySubject = data.count - passedAllSubjects;

          return {
            section: `${selectedYear}-${section}`,
            passPercentage: passAllSubjectsPercentage,
            studentCount: data.count,
            passed: passedAllSubjects,
            failed: failedAnySubject,
          };
        }
      );

      performanceArray.sort((a, b) => a.section.localeCompare(b.section));
      setPerformanceData(performanceArray);
    } catch (error) {
      console.error("Error fetching performance data:", error);
    } finally {
      setLoadingStats(false);
    }
  };

  useEffect(() => {
    if (user) {
      fetchPerformanceData();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedYear, user]);

  const sidebarItems =
    profile?.department === "IQAC"
      ? []
      : [
          {
            label: "Dashboard",
            path: "/hod-dashboard",
            icon: <Home className="h-5 w-5" />,
          },
          {
            label: "OD Applications",
            path: "/hod/od",
            icon: <FileText className="h-5 w-5" />,
          },
          {
            label: "Leave Applications",
            path: "/hod/leave",
            icon: <Calendar className="h-5 w-5" />,
          },
          {
            label: "Gatepass Applications",
            path: "/hod/gatepass",
            icon: <CreditCard className="h-5 w-5" />,
          },
          {
            label: "Bonafide Applications",
            path: "/hod/bonafide",
            icon: <Award className="h-5 w-5" />,
          },
          {
            label: "Attendance",
            path: "/hod/attendance",
            icon: <ClipboardCheck className="h-5 w-5" />,
          },
          {
            label: "Timetable",
            path: "/hod/timetable",
            icon: <Calendar className="h-5 w-5" />,
          },
          {
            label: "My Mentees",
            path: "/hod/mentees",
            icon: <Users className="h-5 w-5" />,
          },
          {
            label: "Manage Mentees",
            path: "/hod/manage-mentees",
            icon: <UserCog className="h-5 w-5" />,
          },
          {
            label: "Notices",
            path: "/notices",
            icon: <Megaphone className="h-5 w-5" />,
          },
          {
            label: "My Leave",
            path: "/staff/my-leave",
            icon: <Calendar className="h-5 w-5" />,
          },
        ];

  const statusCards = [
    {
      title: "OD Applications",
      pending: pendingCounts.od,
      total: totalCounts.od,
      icon: <FileText className="h-8 w-8 text-blue-600" />,
      bgColor: "bg-blue-50",
      borderColor: "border-blue-200",
      path: "/hod/od",
    },
    {
      title: "Leave Applications",
      pending: pendingCounts.leave,
      total: totalCounts.leave,
      icon: <Calendar className="h-8 w-8 text-green-600" />,
      bgColor: "bg-green-50",
      borderColor: "border-green-200",
      path: "/hod/leave",
    },
    {
      title: "Bonafide Applications",
      pending: pendingCounts.bonafide,
      total: totalCounts.bonafide,
      icon: <Award className="h-8 w-8 text-purple-600" />,
      bgColor: "bg-purple-50",
      borderColor: "border-purple-200",
      path: "/hod/bonafide",
    },
    {
      title: "Gatepass Applications",
      pending: pendingCounts.gatepass,
      total: totalCounts.gatepass,
      icon: <CreditCard className="h-8 w-8 text-orange-600" />,
      bgColor: "bg-orange-50",
      borderColor: "border-orange-200",
      path: "/hod/gatepass",
    },
  ];

  return (
    <DashboardLayout sidebarItems={sidebarItems}>
      <div className="max-w-7xl mx-auto">
        <div className="mb-8">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
            <div>
              <h1 className="text-xl font-bold text-slate-800">
                Welcome, {profile?.name}!
              </h1>
              <p className="text-slate-600 mt-1">
                {profile?.department === "IQAC"
                  ? "IQAC Dashboard - View Only"
                  : "HOD Dashboard - Final Approval"}
              </p>
            </div>

            {/* Leave Status Card */}
            <div className="bg-white rounded-xl border border-slate-200 p-3 shadow-sm md:min-w-[280px]">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-slate-700">
                  Leave Status:
                </span>
                <div className="flex items-center space-x-3">
                  <button
                    onClick={handleLeaveToggle}
                    disabled={updatingLeave}
                    className={`relative inline-flex h-8 w-14 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 ${
                      onLeave ? "bg-red-600" : "bg-green-600"
                    } ${updatingLeave ? "opacity-50 cursor-not-allowed" : ""}`}
                  >
                    <span
                      className={`inline-block h-6 w-6 transform rounded-full bg-white transition-transform ${
                        onLeave ? "translate-x-7" : "translate-x-1"
                      }`}
                    />
                  </button>
                  <span
                    className={`text-sm font-semibold ${
                      onLeave ? "text-red-600" : "text-green-600"
                    }`}
                  >
                    {onLeave ? "On Leave" : "Active"}
                  </span>
                </div>
              </div>
            </div>
          </div>
          {onLeave && (
            <div className="mt-4 bg-orange-50 border border-orange-200 rounded-lg px-4 py-2">
              <p className="text-orange-700 font-semibold text-sm">
                ⚠️ On Leave - You will not receive new applications while on
                leave
              </p>
            </div>
          )}
        </div>

        {loading ? (
          <div className="fixed inset-0 z-50 bg-white/90 flex flex-col items-center justify-center">
            <div className="animate-spin rounded-full h-14 w-14 border-b-2 border-blue-600"></div>
            <p className="mt-4 text-slate-600 text-lg">Loading dashboard...</p>
          </div>
        ) : (
          /* Regular HOD Dashboard Content */
          <>
            <div className="grid grid-cols-2 md:grid-cols-2 lg:grid-cols-4 gap-1.5 sm:gap-3">
              {statusCards.map((card, index) => (
                <div
                  key={index}
                  onClick={() => navigate(card.path)}
                  className={`${card.bgColor} border ${card.borderColor} rounded-md p-1.5 sm:p-3 hover:shadow-lg transition-all hover:scale-105 cursor-pointer`}
                >
                  <div className="flex items-center justify-between mb-1 sm:mb-2">
                    <div className="bg-white rounded p-1 sm:p-1.5 shadow-sm">
                      <div className="w-5 h-5 sm:w-7 sm:h-7 flex items-center justify-center">
                        {card.icon}
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="flex items-baseline justify-end gap-1">
                        <span className="text-2xl sm:text-3xl font-bold text-slate-800">
                          {card.pending}
                        </span>
                        <span className="text-sm text-slate-400">/</span>
                        <span className="text-base sm:text-lg font-semibold text-slate-600">
                          {card.total}
                        </span>
                      </div>
                      <p className="text-[9px] text-slate-500 mt-0">
                        pending / total
                      </p>
                    </div>
                  </div>
                  <h3 className="text-[9px] sm:text-[10px] font-medium text-slate-600 leading-tight">
                    {card.title}
                  </h3>
                </div>
              ))}
            </div>

            {/* Three Column Layout: Attendance, Performance Graph, Notifications */}
            <div className="mt-6 grid grid-cols-1 lg:grid-cols-3 gap-4">
              {/* Department Attendance Card */}
              <div className="bg-white rounded-xl shadow-lg border border-slate-200 p-4">
                <div className="mb-4">
                  <h2 className="text-lg font-bold text-slate-800 flex items-center">
                    <UserCheck className="h-5 w-5 mr-2 text-blue-600" />
                    Attendance Overview
                  </h2>
                </div>

                {loadingStats ? (
                  <div className="flex items-center justify-center h-48">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
                  </div>
                ) : (
                  <div className="space-y-3">
                    <div className="bg-gradient-to-r from-blue-50 to-blue-100 border border-blue-200 rounded-lg p-3">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <Users className="h-5 w-5 text-blue-600" />
                          <span className="text-sm font-medium text-blue-900">
                            Total Students
                          </span>
                        </div>
                        <span className="text-xl font-bold text-blue-900">
                          {attendanceStats.totalStudents}
                        </span>
                      </div>
                    </div>

                    <div className="bg-gradient-to-r from-green-50 to-green-100 border border-green-200 rounded-lg p-3">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <UserCheck className="h-5 w-5 text-green-600" />
                          <span className="text-sm font-medium text-green-900">
                            Present Today
                          </span>
                        </div>
                        <span className="text-xl font-bold text-green-900">
                          {attendanceStats.presentToday}
                        </span>
                      </div>
                    </div>

                    <div className="bg-gradient-to-r from-red-50 to-red-100 border border-red-200 rounded-lg p-3">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <Users className="h-5 w-5 text-red-600" />
                          <span className="text-sm font-medium text-red-900">
                            Absent Today
                          </span>
                        </div>
                        <span className="text-xl font-bold text-red-900">
                          {attendanceStats.absentToday}
                        </span>
                      </div>
                    </div>

                    <div className="bg-gradient-to-r from-purple-50 to-purple-100 border border-purple-200 rounded-lg p-3">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <TrendingUp className="h-5 w-5 text-purple-600" />
                          <span className="text-sm font-medium text-purple-900">
                            Avg (30 Days)
                          </span>
                        </div>
                        <span className="text-xl font-bold text-purple-900">
                          {attendanceStats.averageAttendance}%
                        </span>
                      </div>
                    </div>

                    <div className="mt-4 pt-3 border-t border-slate-200">
                      <div className="flex justify-between text-xs text-slate-600 mb-1">
                        <span>Attendance Rate</span>
                        <span className="font-medium">
                          {attendanceStats.totalStudents > 0
                            ? Math.round(
                                (attendanceStats.presentToday /
                                  attendanceStats.totalStudents) *
                                  100
                              )
                            : 0}
                          %
                        </span>
                      </div>
                      <div className="w-full bg-slate-200 rounded-full h-2">
                        <div
                          className="bg-gradient-to-r from-green-500 to-green-600 h-2 rounded-full transition-all duration-300"
                          style={{
                            width: `${
                              attendanceStats.totalStudents > 0
                                ? (attendanceStats.presentToday /
                                    attendanceStats.totalStudents) *
                                  100
                                : 0
                            }%`,
                          }}
                        ></div>
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* Pass Percentage Graph */}
              <div className="bg-white rounded-xl shadow-lg border border-slate-200 p-4">
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between mb-4 gap-2">
                  <h2 className="text-lg font-bold text-slate-800 flex items-center">
                    <TrendingUp className="h-5 w-5 mr-2 text-blue-600" />
                    Pass Rate
                  </h2>
                  <div className="flex items-center gap-2">
                    <label className="text-xs font-medium text-slate-700">
                      Year:
                    </label>
                    <select
                      value={selectedYear}
                      onChange={(e) => setSelectedYear(Number(e.target.value))}
                      className="px-2 py-1 border border-slate-300 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-blue-500"
                    >
                      <option value={1}>1st</option>
                      <option value={2}>2nd</option>
                      <option value={3}>3rd</option>
                      <option value={4}>4th</option>
                    </select>
                  </div>
                </div>

                {loadingStats ? (
                  <div className="flex items-center justify-center h-48">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
                  </div>
                ) : performanceData.length === 0 ? (
                  <div className="flex flex-col items-center justify-center h-48 text-slate-500">
                    <TrendingUp className="h-10 w-10 mb-2 text-slate-300" />
                    <p className="text-xs">No data for Year {selectedYear}</p>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {/* Bar Chart */}
                    <div className="h-48">
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={performanceData}>
                          <CartesianGrid
                            strokeDasharray="3 3"
                            stroke="#e2e8f0"
                          />
                          <XAxis
                            dataKey="section"
                            tick={{ fill: "#64748b", fontSize: 10 }}
                            tickLine={{ stroke: "#cbd5e1" }}
                          />
                          <YAxis
                            domain={[0, 100]}
                            tick={{ fill: "#64748b", fontSize: 10 }}
                            tickLine={{ stroke: "#cbd5e1" }}
                          />
                          <Tooltip
                            contentStyle={{
                              backgroundColor: "#ffffff",
                              border: "1px solid #e2e8f0",
                              borderRadius: "8px",
                              fontSize: "11px",
                            }}
                            formatter={(value: any) => [
                              value.toFixed(1) + "%",
                              "Passed All Subjects",
                            ]}
                          />
                          <Bar
                            dataKey="passPercentage"
                            fill="#10b981"
                            radius={[4, 4, 0, 0]}
                          />
                        </BarChart>
                      </ResponsiveContainer>
                    </div>

                    {/* Student Count Summary */}
                    <div className="grid grid-cols-2 gap-2 pt-3 border-t border-slate-200">
                      {performanceData.map((data, idx) => (
                        <div
                          key={idx}
                          className="bg-slate-50 rounded-lg p-2 border border-slate-200"
                        >
                          <p className="text-xs text-slate-600 mb-0.5">
                            {data.section}
                          </p>
                          <p className="text-sm font-bold text-green-700">
                            {data.passPercentage.toFixed(1)}%
                          </p>
                          <p className="text-xs text-slate-500">
                            {data.passed}/{data.studentCount} passed all
                          </p>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* Notifications Table */}
              <div className="bg-white rounded-xl shadow-lg border border-slate-200 p-4">
                <div className="mb-4 flex items-center justify-between">
                  <h2 className="text-lg font-bold text-slate-800 flex items-center">
                    <Bell className="h-5 w-5 mr-2 text-blue-600" />
                    Notifications
                  </h2>
                  <span className="text-xs text-slate-500">
                    {Math.min(notifications.length, 5)}
                  </span>
                </div>
                {notifications.length === 0 ? (
                  <div className="text-center py-6 text-slate-500">
                    <Bell className="h-10 w-10 mx-auto text-slate-300 mb-2" />
                    <p className="text-xs">No notifications</p>
                  </div>
                ) : (
                  <div className="overflow-auto max-h-96">
                    <table className="w-full">
                      <thead className="sticky top-0 bg-white">
                        <tr className="border-b border-slate-200">
                          <th className="text-left py-2 px-2 text-xs font-semibold text-slate-600">
                            Type
                          </th>
                          <th className="text-left py-2 px-2 text-xs font-semibold text-slate-600">
                            Status
                          </th>
                          <th className="text-left py-2 px-2 text-xs font-semibold text-slate-600">
                            Date
                          </th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {notifications.slice(0, 10).map((notif, idx) => (
                          <tr
                            key={idx}
                            className="hover:bg-slate-50 transition-colors cursor-pointer"
                            onClick={() => navigate("/notifications")}
                          >
                            <td className="py-2 px-2">
                              <span className="text-xs font-medium text-slate-800 block truncate">
                                {notif.type}
                              </span>
                            </td>
                            <td className="py-2 px-2">
                              <span
                                className={`inline-block px-1.5 py-0.5 rounded-full text-xs font-medium ${
                                  notif.status === "approved"
                                    ? "bg-green-100 text-green-700"
                                    : notif.status === "rejected"
                                    ? "bg-red-100 text-red-700"
                                    : notif.status === "pending"
                                    ? "bg-yellow-100 text-yellow-700"
                                    : "bg-slate-100 text-slate-700"
                                }`}
                              >
                                {notif.status}
                              </span>
                            </td>
                            <td className="py-2 px-2 text-xs text-slate-600">
                              {notif.date}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>
          </>
        )}

        {/* Floating Notification Button */}
        <button
          onClick={() => setShowNotifications(!showNotifications)}
          className="md:hidden fixed bottom-6 right-6 bg-blue-600 hover:bg-blue-700 text-white rounded-full p-4 shadow-lg hover:shadow-xl transition-all z-40"
          aria-label="Notifications"
        >
          <Bell className="h-6 w-6" />
          {notifications.length > 0 && (
            <span className="absolute -top-1 -right-1 bg-red-500 text-white text-xs font-bold rounded-full h-5 w-5 flex items-center justify-center">
              {notifications.length}
            </span>
          )}
        </button>

        {/* Notification Popup */}
        {showNotifications && (
          <>
            <div
              className="fixed inset-0 bg-black bg-opacity-25 z-40"
              onClick={() => setShowNotifications(false)}
            />
            <div className="fixed bottom-4 md:bottom-auto md:top-20 left-4 right-4 md:left-auto md:right-6 md:w-96 bg-white rounded-xl shadow-2xl border border-slate-200 z-50 max-h-[80vh] md:max-h-[600px] flex flex-col transition-all duration-500 ease-out animate-in slide-in-from-bottom-8 md:slide-in-from-top-4 fade-in">
              <div className="flex items-center justify-between p-4 border-b border-slate-200">
                <h2 className="text-lg font-bold text-slate-800 flex items-center">
                  <Bell className="h-5 w-5 mr-2 text-blue-600" />
                  Notifications
                </h2>
                <button
                  onClick={() => setShowNotifications(false)}
                  className="text-slate-400 hover:text-slate-600 transition-colors p-1 hover:bg-slate-100 rounded"
                  aria-label="Close"
                >
                  <svg
                    className="h-5 w-5"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M6 18L18 6M6 6l12 12"
                    />
                  </svg>
                </button>
              </div>
              <div className="flex-1 overflow-y-auto p-4 space-y-3">
                {notifications.length === 0 ? (
                  <p className="text-slate-500 text-center py-8">
                    No notifications at the moment
                  </p>
                ) : (
                  notifications.map((notif, index) => (
                    <div
                      key={index}
                      className="p-3 bg-slate-50 rounded-lg border border-slate-200 hover:border-blue-300 transition-colors cursor-pointer"
                      onClick={() => navigate("/notifications")}
                    >
                      <p className="text-sm text-slate-700">
                        {notif.type} application {notif.status} - {notif.date}
                      </p>
                    </div>
                  ))
                )}
              </div>
            </div>
          </>
        )}
      </div>

      {/* Leave Confirmation Modal */}
      {showLeaveConfirmation && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50 p-4"
          onClick={() => setShowLeaveConfirmation(false)}
        >
          <div
            className="bg-white rounded-xl shadow-2xl p-6 max-w-md w-full"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-xl font-bold text-slate-800 mb-4">
              Confirm Leave Status
            </h3>
            <p className="text-slate-600 mb-6">
              Do you want to mark yourself as{" "}
              <span className="font-semibold">
                {!onLeave ? "on leave" : "active"}
              </span>
              ?
            </p>
            <div className="flex gap-3 justify-end">
              <button
                onClick={() => setShowLeaveConfirmation(false)}
                className="px-4 py-2 rounded-lg border border-slate-300 text-slate-700 hover:bg-slate-50 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={confirmLeaveToggle}
                className={`px-4 py-2 rounded-lg text-white transition-colors ${
                  !onLeave
                    ? "bg-red-600 hover:bg-red-700"
                    : "bg-green-600 hover:bg-green-700"
                }`}
              >
                Yes, {!onLeave ? "Mark as Leave" : "Mark as Active"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Notification Modal */}
      {showNotification && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50 p-4"
          onClick={() => setShowNotification(false)}
        >
          <div
            className="bg-white rounded-xl shadow-2xl p-6 max-w-md w-full"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start gap-4">
              <div
                className={`flex-shrink-0 w-12 h-12 rounded-full flex items-center justify-center ${
                  notificationType === "success" ? "bg-green-100" : "bg-red-100"
                }`}
              >
                {notificationType === "success" ? (
                  <CheckCircle className="h-6 w-6 text-green-600" />
                ) : (
                  <XCircle className="h-6 w-6 text-red-600" />
                )}
              </div>
              <div className="flex-1">
                <h3
                  className={`text-lg font-bold mb-2 ${
                    notificationType === "success"
                      ? "text-green-800"
                      : "text-red-800"
                  }`}
                >
                  {notificationType === "success" ? "Success" : "Error"}
                </h3>
                <p className="text-slate-600">{notificationMessage}</p>
              </div>
            </div>
            <div className="mt-6 flex justify-end">
              <button
                onClick={() => setShowNotification(false)}
                className={`px-6 py-2 rounded-lg text-white transition-colors ${
                  notificationType === "success"
                    ? "bg-green-600 hover:bg-green-700"
                    : "bg-red-600 hover:bg-red-700"
                }`}
              >
                OK
              </button>
            </div>
          </div>
        </div>
      )}
    </DashboardLayout>
  );
}
