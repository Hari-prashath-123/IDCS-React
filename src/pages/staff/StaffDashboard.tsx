import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  FileText,
  Calendar,
  CreditCard,
  Award,
  Home,
  Users,
  ClipboardCheck,
  Bell,
  Megaphone,
  CheckCircle,
  XCircle,
} from "lucide-react";
import DashboardLayout from "../../components/DashboardLayout";
import { supabase } from "../../lib/supabase";
import { useAuth } from "../../contexts/AuthContext";

export default function StaffDashboard() {
  const { user, profile } = useAuth();
  const navigate = useNavigate();
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
  const [staffRole, setStaffRole] = useState<string | null>(null);
  const [showNotifications, setShowNotifications] = useState(false);
  const [notifications, setNotifications] = useState<
    Array<{
      id: string;
      type: string;
      status: string;
      date: string;
      student_id: string;
    }>
  >([]);
  const [todayTimetable, setTodayTimetable] = useState<any[]>([]);
  const [recentNotices, setRecentNotices] = useState<any[]>([]);
  const [unreadNoticesCount, setUnreadNoticesCount] = useState(0);

  useEffect(() => {
    if (user) {
      // Load critical data first
      fetchPendingCounts();
      fetchLeaveStatus();
      fetchStaffDetails();
      
      // Load non-critical data after a short delay
      setTimeout(() => {
        fetchRecentNotices();
        fetchNotifications();
        fetchTodayTimetable();
      }, 100);

      // Refetch timetable when tab becomes visible
      const handleVisibilityChange = () => {
        if (!document.hidden) {
          console.log("Tab became visible, refetching timetable...");
          fetchTodayTimetable();
        }
      };
      document.addEventListener("visibilitychange", handleVisibilityChange);

      // Poll for timetable updates every 30 seconds
      const pollInterval = setInterval(() => {
        console.log("Polling for timetable updates...");
        fetchTodayTimetable();
      }, 30000);

      // Subscribe to staff row updates so leave status stays in sync
      const staffChannel = supabase
        .channel("staff-leave-staff")
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

      // Subscribe to period_attendance changes to update timetable in real-time
      const periodAttendanceChannel = supabase
        .channel(`period-attendance-updates-${user?.id}-${Date.now()}`)
        .on(
          "postgres_changes",
          {
            event: "*",
            schema: "public",
            table: "period_attendance",
          },
          (payload) => {
            console.log("Period attendance changed:", payload);
            // Refetch timetable when attendance is marked
            fetchTodayTimetable();
          }
        )
        .subscribe((status) => {
          console.log("Period attendance subscription status:", status);
        });

      // Subscribe to daily_attendance changes for class advisors
      const dailyAttendanceChannel = supabase
        .channel(`daily-attendance-updates-${user?.id}-${Date.now()}`)
        .on(
          "postgres_changes",
          {
            event: "*",
            schema: "public",
            table: "daily_attendance",
          },
          (payload) => {
            console.log("Daily attendance changed:", payload);
            // Refetch timetable when daily attendance is marked
            fetchTodayTimetable();
          }
        )
        .subscribe((status) => {
          console.log("Daily attendance subscription status:", status);
        });

      return () => {
        try {
          document.removeEventListener(
            "visibilitychange",
            handleVisibilityChange
          );
          clearInterval(pollInterval);
          staffChannel.unsubscribe();
          periodAttendanceChannel.unsubscribe();
          dailyAttendanceChannel.unsubscribe();
        } catch (e) {
          /* ignore */
        }
      };
    }
  }, [user]);

  const fetchStaffDetails = async () => {
    try {
      console.log("Fetching staff details for user:", user?.id);
      const { data, error } = await supabase
        .from("staff")
        .select("staff_role, year, section")
        .eq("id", user?.id)
        .maybeSingle();

      if (error) {
        console.error("Error fetching staff details:", error);
        throw error;
      }

      console.log("Staff data received:", data);

      if (data) {
        console.log("Setting staff role to:", data.staff_role);
        setStaffRole(data.staff_role);
      } else {
        console.log("No staff data found for user");
      }
    } catch (error) {
      console.error("Error fetching staff details:", error);
    }
  };

  const fetchLeaveStatus = async () => {
    try {
      const { data, error } = await supabase
        .from("staff")
        .select("on_leave")
        .eq("id", user?.id)
        .maybeSingle();

      if (error) throw error;
      setOnLeave(data?.on_leave || false);
    } catch (error) {
      console.error("Error fetching leave status:", error);
      setOnLeave(false);
    }
  };

  const handleLeaveToggle = async () => {
    setShowLeaveConfirmation(true);
  };

  const confirmLeaveToggle = async () => {
    setShowLeaveConfirmation(false);
    setUpdatingLeave(true);
    const newLeaveStatus = !onLeave;
    try {
      console.log("Updating leave status:", {
        userId: user?.id,
        currentStatus: onLeave,
        newStatus: newLeaveStatus,
      });
      const { data: updatedRow, error } = await supabase
        .from("staff")
        .update({ on_leave: newLeaveStatus })
        .eq("id", user?.id)
        .select("on_leave")
        .maybeSingle();

      console.log("Update result (verified):", { updatedRow, error });

      if (error) {
        console.error("Database update error:", error);
        throw error;
      }

      if (!updatedRow) {
        console.error("No staff record found for user:", user?.id);
        setNotificationMessage(
          "Staff record not found. Please contact administrator."
        );
        setNotificationType("error");
        setShowNotification(true);
        return;
      }

      // Poll a couple times to ensure DB persisted value (handles transient replication/race)
      const pollVerify = async (
        expected: boolean,
        attempts = 3,
        delayMs = 400
      ) => {
        for (let i = 0; i < attempts; i++) {
          const { data: verifyRow } = await supabase
            .from("staff")
            .select("on_leave")
            .eq("id", user?.id)
            .maybeSingle();
          const val = verifyRow?.on_leave;
          console.log(`verify attempt ${i + 1}:`, val);
          if (typeof val !== "undefined" && val === expected) return true;
          await new Promise((r) => setTimeout(r, delayMs));
        }
        return false;
      };

      const verifiedNow = await pollVerify(newLeaveStatus);
      if (!verifiedNow) {
        console.warn(
          "Leave value did not persist immediately after update; showing latest DB value instead."
        );
        const { data: latest } = await supabase
          .from("staff")
          .select("on_leave")
          .eq("id", user?.id)
          .maybeSingle();
        const latestVal = latest?.on_leave ?? newLeaveStatus;
        setOnLeave(latestVal);
        setNotificationMessage(
          "Leave update did not persist reliably; UI shows latest DB value. Check logs for details."
        );
        setNotificationType("error");
        setShowNotification(true);
      } else {
        setOnLeave(newLeaveStatus);
        setNotificationMessage(
          newLeaveStatus
            ? "Leave status activated. Applications will be routed to advisor."
            : "Leave status deactivated. You will receive applications normally."
        );
        setNotificationType("success");
        setShowNotification(true);
      }
    } catch (error: any) {
      console.error("Error updating leave status:", error);
      setNotificationMessage(
        "Failed to update leave status: " + (error?.message || String(error))
      );
      setNotificationType("error");
      setShowNotification(true);
    } finally {
      setUpdatingLeave(false);
    }
  };

  const fetchPendingCounts = async () => {
    try {
      const { data: students, error: studentsError } = await supabase
        .from("students")
        .select("id")
        .or(`mentor_id.eq.${user?.id},advisor_id.eq.${user?.id}`);

      if (studentsError) throw studentsError;

      const studentIds = students?.map((s) => s.id) || [];

      if (studentIds.length > 0) {
        // Query all four application tables for pending and total
        const [
          odPending,
          leavePending,
          gatepassPending,
          bonafidePending,
          odTotal,
          leaveTotal,
          gatepassTotal,
          bonafideTotal,
        ] = await Promise.all([
          // Pending applications - use count instead of selecting data
          supabase
            .from("od_applications")
            .select("*", { count: "exact", head: true })
            .in("student_id", studentIds)
            .eq("status", "pending")
            .in("current_approver_level", ["mentor", "advisor"]),
          supabase
            .from("leave_applications")
            .select("*", { count: "exact", head: true })
            .in("student_id", studentIds)
            .eq("status", "pending")
            .in("current_approver_level", ["mentor", "advisor"]),
          supabase
            .from("gatepass_applications")
            .select("*", { count: "exact", head: true })
            .in("student_id", studentIds)
            .eq("status", "pending")
            .in("current_approver_level", ["mentor", "advisor"]),
          supabase
            .from("bonafide_applications")
            .select("*", { count: "exact", head: true })
            .in("student_id", studentIds)
            .eq("status", "pending")
            .in("current_approver_level", ["mentor", "advisor"]),
          // Total applications - use count
          supabase
            .from("od_applications")
            .select("*", { count: "exact", head: true })
            .in("student_id", studentIds),
          supabase
            .from("leave_applications")
            .select("*", { count: "exact", head: true })
            .in("student_id", studentIds),
          supabase
            .from("gatepass_applications")
            .select("*", { count: "exact", head: true })
            .in("student_id", studentIds),
          supabase
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
      const { data: students } = await supabase
        .from("students")
        .select("id")
        .or(`mentor_id.eq.${user?.id},advisor_id.eq.${user?.id}`);

      const studentIds = students?.map((s) => s.id) || [];
      if (studentIds.length === 0) return;

      const [odApps, leaveApps, gatepassApps, bonafideApps] = await Promise.all(
        [
          supabase
            .from("od_applications")
            .select("id, status, updated_at, student_id")
            .in("student_id", studentIds)
            .order("updated_at", { ascending: false })
            .limit(3),
          supabase
            .from("leave_applications")
            .select("id, status, updated_at, student_id")
            .in("student_id", studentIds)
            .order("updated_at", { ascending: false })
            .limit(3),
          supabase
            .from("gatepass_applications")
            .select("id, status, updated_at, student_id")
            .in("student_id", studentIds)
            .order("updated_at", { ascending: false })
            .limit(3),
          supabase
            .from("bonafide_applications")
            .select("id, status, updated_at, student_id")
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
        student_id: app.student_id,
      }));

      setNotifications(notifs);
    } catch (error) {
      console.error("Error fetching notifications:", error);
    }
  };

  const fetchTodayTimetable = async () => {
    try {
      if (!user?.id) return;

      console.log("Fetching timetable at:", new Date().toISOString());

      // Get today's day of week (1=Monday, 5=Friday)
      const today = new Date().getDay();
      const dayOfWeek = today === 0 ? 7 : today; // Convert Sunday (0) to 7, keep rest as is
      const todayDate = new Date().toISOString().split("T")[0];

      console.log("Fetching for date:", todayDate, "day:", dayOfWeek);

      const computeCurrentSemester = () => {
        const m = new Date().getMonth();
        return m < 6 ? 1 : 2;
      };
      const semester = computeCurrentSemester();

      // Fetch today's timetable for staff
      const { data: timetableData, error: timetableError } = await supabase
        .from("staff_timetables")
        .select("day_of_week, period, subject_id, year, section, department")
        .eq("staff_id", user.id)
        .eq("day_of_week", dayOfWeek)
        .order("period", { ascending: true });

      if (timetableError) throw timetableError;

      // Fetch staff details to check if they're a class advisor
      const { data: staffData } = await supabase
        .from("staff")
        .select("staff_role, year, section")
        .eq("id", user.id)
        .maybeSingle();

      // Create a map of assigned periods
      const assignedPeriods = new Map();
      timetableData?.forEach((t) => {
        assignedPeriods.set(t.period, t);
      });

      // Fetch attendance status for each assigned period (bypass cache)
      const attendanceStatusMap = new Map();
      Date.now();
      for (const t of timetableData || []) {
        const { data: attendanceData, error: attendanceError } = await supabase
          .from("period_attendance")
          .select("id, created_at")
          .eq("date", todayDate)
          .eq("period", t.period)
          .eq("year", t.year)
          .eq("section", t.section)
          .order("created_at", { ascending: false })
          .limit(1);

        if (attendanceError) {
          console.error(
            "Error fetching attendance for period",
            t.period,
            attendanceError
          );
        }

        const isMarked = attendanceData && attendanceData.length > 0;
        console.log(
          `Attendance status for period ${t.period}:`,
          isMarked,
          attendanceData
        );
        attendanceStatusMap.set(t.period, isMarked);
      }

      // If staff is a class advisor, check daily attendance
      let dailyAttendanceMarked = false;
      if (
        staffData &&
        staffData.staff_role === "advisor" &&
        staffData.year &&
        staffData.section
      ) {
        // First, get students from this advisor's class
        const { data: classStudents, error: studentsError } = await supabase
          .from("students")
          .select("id")
          .eq("year", staffData.year)
          .eq("section", staffData.section)
          .limit(1);

        if (studentsError) {
          console.error("Error fetching class students:", studentsError);
        }

        // If we have students in this class, check if any of them have attendance marked for today
        if (classStudents && classStudents.length > 0) {
          const { data: dailyAttendance, error: dailyError } = await supabase
            .from("daily_attendance")
            .select("id, student_id")
            .eq("date", todayDate)
            .in(
              "student_id",
              classStudents.map((s) => s.id)
            )
            .limit(1);

          if (dailyError) {
            console.error("Error fetching daily attendance:", dailyError);
          }

          dailyAttendanceMarked = !!(
            dailyAttendance && dailyAttendance.length > 0
          );
          console.log(
            "Daily attendance marked:",
            dailyAttendanceMarked,
            "Records found:",
            dailyAttendance?.length
          );
        } else {
          console.log(
            "No students found for class",
            staffData.year,
            staffData.section
          );
        }
      }

      // Create array with all 7 periods
      const allPeriods = [];
      for (let period = 1; period <= 7; period++) {
        if (assignedPeriods.has(period)) {
          const periodData = assignedPeriods.get(period);
          allPeriods.push({
            ...periodData,
            attendance_marked: attendanceStatusMap.get(period) || false,
          });
        } else {
          // Add unassigned period
          allPeriods.push({
            period,
            day_of_week: dayOfWeek,
            subject_id: null,
            year: null,
            section: null,
            department: null,
            attendance_marked: false,
          });
        }
      }

      // Fetch subject details for assigned periods
      const subjectIds = allPeriods
        .map((t) => t.subject_id)
        .filter((id) => id !== null);

      if (subjectIds.length > 0) {
        const { data: subjectsData } = await supabase
          .from("subjects")
          .select("id, name, subject_code")
          .in("id", subjectIds);

        const subjectMap = new Map();
        subjectsData?.forEach((s) => subjectMap.set(s.id, s));

        const enrichedTimetable = allPeriods.map((t) => ({
          ...t,
          subject: t.subject_id ? subjectMap.get(t.subject_id) : null,
          is_advisor: staffData?.staff_role === "advisor",
          daily_attendance_marked: dailyAttendanceMarked,
        }));

        setTodayTimetable(enrichedTimetable);
      } else {
        const enrichedAllPeriods = allPeriods.map((t) => ({
          ...t,
          is_advisor: staffData?.staff_role === "advisor",
          daily_attendance_marked: dailyAttendanceMarked,
        }));
        setTodayTimetable(enrichedAllPeriods);
      }
    } catch (error) {
      console.error("Error fetching staff timetable:", error);
    }
  };

  const fetchRecentNotices = async () => {
    try {
      // Fetch content from notice_content table (same as home page)
      const { data: contentData, error: contentError } = await supabase
        .from("notice_content")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(3);

      if (contentError) throw contentError;

      // Get public URLs for images
      const noticesWithUrls = contentData.map((content) => {
        const { data: publicUrl } = supabase.storage
          .from("notice")
          .getPublicUrl(content.image_name);

        return {
          ...content,
          publicUrl: publicUrl.publicUrl,
          content: content,
          id: content.id,
          title: content.title,
          description: content.description,
          created_at: content.created_at,
        };
      });

      setRecentNotices(noticesWithUrls);

      // Count unread notices (using the same logic but for notice_content)
      const readNotices = JSON.parse(
        localStorage.getItem("readNotices") || "[]"
      );
      const unreadCount = noticesWithUrls.filter(
        (notice) => !readNotices.includes(notice.id)
      ).length;
      setUnreadNoticesCount(unreadCount);
    } catch (error) {
      console.error("Error fetching notices:", error);
    }
  };

  const dashboardEntry = {
    label: "Dashboard",
    path: "/staff-dashboard",
    icon: <Home className="w-5 h-5" />,
  };
  const departmentEntry = {
    label: "Department",
    path: "/staff/department",
    icon: <ClipboardCheck className="w-5 h-5" />,
  };

  const otherEntries = [
    {
      label: "OD Applications",
      path: "/staff/od",
      icon: <FileText className="w-5 h-5" />,
    },
    {
      label: "Leave Applications",
      path: "/staff/leave",
      icon: <Calendar className="w-5 h-5" />,
    },
    {
      label: "Gatepass Applications",
      path: "/staff/gatepass",
      icon: <CreditCard className="w-5 h-5" />,
    },
    {
      label: "Bonafide Applications",
      path: "/staff/bonafide",
      icon: <Award className="w-5 h-5" />,
    },
    {
      label: "My Certificates",
      path: "/staff/my-certificates",
      icon: <Award className="w-5 h-5" />,
    },
    {
      label: "Attendance",
      path: "/staff/attendance",
      icon: <ClipboardCheck className="w-5 h-5" />,
    },
    {
      label: "My Mentees",
      path: "/staff/mentees",
      icon: <Users className="w-5 h-5" />,
    },
    {
      label: "Notices",
      path: "/notices",
      icon: <Megaphone className="w-5 h-5" />,
    },
    {
      label: "My Leave",
      path: "/staff/leave-application",
      icon: <Calendar className="w-5 h-5" />,
    },
  ];

  const sidebarItems = [
    dashboardEntry,
    // Insert department link immediately after dashboard when staff is a department admin
    ...(profile?.is_department_admin ? [departmentEntry] : []),
    ...otherEntries,
    ...(staffRole === "advisor"
      ? [
          {
            label: "My Students",
            path: "/staff/students",
            icon: <Users className="w-5 h-5" />,
          },
        ]
      : []),
    // Add leave approval for HODs
    ...(staffRole === "hod" || staffRole === "ahod"
      ? [
          {
            label: "My Leave",
            path: "/staff/my-leave",
            icon: <Calendar className="w-5 h-5" />,
          },
          {
            label: "Leave Approvals",
            path: "/staff/leave-approval",
            icon: <CheckCircle className="w-5 h-5" />,
          },
        ]
      : []),
  ];

  console.log(
    "Rendering StaffDashboard - staffRole:",
    staffRole,
    "sidebarItems count:",
    sidebarItems.length
  );

  const statusCards = [
    {
      title: "OD Applications",
      pending: pendingCounts.od,
      total: totalCounts.od,
      icon: <FileText className="h-8 w-8 text-blue-600" />,
      bgColor: "bg-blue-50",
      borderColor: "border-blue-200",
      path: "/staff/od",
    },
    {
      title: "Leave Applications",
      pending: pendingCounts.leave,
      total: totalCounts.leave,
      icon: <Calendar className="h-8 w-8 text-green-600" />,
      bgColor: "bg-green-50",
      borderColor: "border-green-200",
      path: "/staff/leave",
    },
    {
      title: "Bonafide Applications",
      pending: pendingCounts.bonafide,
      total: totalCounts.bonafide,
      icon: <Award className="h-8 w-8 text-purple-600" />,
      bgColor: "bg-purple-50",
      borderColor: "border-purple-200",
      path: "/staff/bonafide",
    },
    {
      title: "Gatepass Applications",
      pending: pendingCounts.gatepass,
      total: totalCounts.gatepass,
      icon: <CreditCard className="h-8 w-8 text-orange-600" />,
      bgColor: "bg-orange-50",
      borderColor: "border-orange-200",
      path: "/staff/gatepass",
    },
  ];

  return (
    <DashboardLayout sidebarItems={sidebarItems}>
      <div className="max-w-7xl mx-auto">
        <div className="mb-8">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
            <div>
              <h1 className="text-xl font-bold text-slate-800 flex items-center gap-3">
                <span>Welcome, {profile?.name}!</span>
              </h1>
              <p className="text-slate-600 mt-1">
                Staff Dashboard - Manage student applications
              </p>
              {(profile as any)?.is_department_admin && (
                <span
                  title={
                    (profile as any)?.department_admin_for
                      ? `Department: ${(profile as any).department_admin_for}`
                      : "Department Admin"
                  }
                  className="inline-block bg-amber-100 text-amber-800 text-sm px-2 py-0.5 rounded-full font-medium mt-2"
                >
                  Admin
                </span>
              )}
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
              {onLeave && (
                <p className="text-xs text-slate-500 mt-2">
                  Applications will be routed to advisor
                </p>
              )}
            </div>
          </div>
        </div>

        {loading ? (
          <div className="text-center py-12">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
            <p className="mt-4 text-slate-600">Loading dashboard...</p>
          </div>
        ) : (
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

            {/* Three Column Layout: Timetable, Attendance Status, and Notifications */}
            <div className="mt-4 sm:mt-6 grid grid-cols-1 lg:grid-cols-3 gap-4 sm:gap-6">
              {/* Today's Timetable Card - First Column */}
              <div className="lg:col-span-1">
                <div className="w-full bg-white rounded-xl shadow-lg border border-slate-200 p-3 sm:p-6">
                  <div className="mb-3 sm:mb-4 flex items-center justify-between">
                    <h2 className="text-base sm:text-lg font-bold text-slate-800">
                      Today's Timetable
                    </h2>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        fetchTodayTimetable();
                      }}
                      className="p-2 rounded-lg hover:bg-slate-100 transition-colors"
                      title="Refresh timetable"
                    >
                      <svg
                        className="w-5 h-5 text-slate-600"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
                        />
                      </svg>
                    </button>
                  </div>
                  <div
                    onClick={() => navigate("/staff/timetable")}
                    className="cursor-pointer"
                  >
                    {todayTimetable.length === 0 ? (
                      <p className="text-slate-500 text-center py-6 sm:py-8 text-sm">
                        No classes scheduled for today
                      </p>
                    ) : (
                      <div className="space-y-1.5 sm:space-y-2">
                        {todayTimetable.map((item, index) => (
                          <div
                            key={index}
                            className={`p-2 sm:p-3 rounded-lg border ${
                              item.subject_id
                                ? "bg-slate-50 border-slate-200"
                                : "bg-gray-50 border-gray-200"
                            }`}
                          >
                            <div className="flex items-center gap-2 sm:gap-3">
                              <div
                                className={`rounded-full w-6 h-6 sm:w-8 sm:h-8 flex items-center justify-center font-bold text-xs sm:text-sm flex-shrink-0 ${
                                  item.subject_id
                                    ? "bg-blue-100 text-blue-700"
                                    : "bg-gray-200 text-gray-500"
                                }`}
                              >
                                {item.period}
                              </div>
                              <div className="min-w-0 flex-1">
                                <p
                                  className={`font-semibold text-xs sm:text-sm truncate ${
                                    item.subject_id
                                      ? "text-slate-800"
                                      : "text-gray-500 italic"
                                  }`}
                                >
                                  {item.subject_id
                                    ? item.subject?.name || "Unknown Subject"
                                    : "Free Period"}
                                </p>
                                {item.subject_id && (
                                  <div className="flex items-center gap-1.5 sm:gap-2 text-[10px] sm:text-xs text-slate-500 mt-0.5">
                                    <span className="truncate">
                                      {item.subject?.subject_code || ""}
                                    </span>
                                    {item.year && item.section && (
                                      <>
                                        <span className="text-slate-400 hidden sm:inline">
                                          •
                                        </span>
                                        <span className="truncate hidden sm:inline">
                                          Year {item.year} - Section{" "}
                                          {item.section}
                                        </span>
                                        <span className="truncate sm:hidden">
                                          Y{item.year}-{item.section}
                                        </span>
                                      </>
                                    )}
                                  </div>
                                )}
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* Attendance Status Card - Right Side (1 column on lg screens) */}
              <div className="lg:col-span-1">
                <div className="bg-white rounded-xl shadow-lg border border-slate-200 p-3 sm:p-6 h-full">
                  <h2 className="text-sm sm:text-lg font-bold text-slate-800 mb-2 sm:mb-4">
                    Attendance Status
                  </h2>

                  {todayTimetable.length === 0 ? (
                    <p className="text-slate-500 text-center py-6 text-sm">
                      No classes scheduled for today
                    </p>
                  ) : (
                    <div className="space-y-2 sm:space-y-4">
                      {/* Daily Attendance Status (for Advisors) */}
                      {todayTimetable.length > 0 &&
                        todayTimetable[0]?.is_advisor && (
                          <div className="p-2 sm:p-4 bg-gradient-to-br from-purple-50 to-purple-100 rounded-lg border border-purple-200">
                            <div className="flex items-center justify-between mb-1 sm:mb-2">
                              <h3 className="text-xs sm:text-sm font-semibold text-purple-900">
                                Daily Attendance
                              </h3>
                              {todayTimetable[0]?.daily_attendance_marked ? (
                                <svg
                                  className="w-4 h-4 sm:w-6 sm:h-6 text-green-600"
                                  fill="currentColor"
                                  viewBox="0 0 20 20"
                                >
                                  <path
                                    fillRule="evenodd"
                                    d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
                                    clipRule="evenodd"
                                  />
                                </svg>
                              ) : (
                                <svg
                                  className="w-4 h-4 sm:w-6 sm:h-6 text-red-600"
                                  fill="currentColor"
                                  viewBox="0 0 20 20"
                                >
                                  <path
                                    fillRule="evenodd"
                                    d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z"
                                    clipRule="evenodd"
                                  />
                                </svg>
                              )}
                            </div>
                            <p className="text-[11px] sm:text-sm text-purple-800">
                              {todayTimetable[0]?.daily_attendance_marked ? (
                                <span className="font-medium">
                                  ✓ Daily attendance has been marked
                                </span>
                              ) : (
                                <span className="font-medium">
                                  ⚠ Daily attendance not yet marked
                                </span>
                              )}
                            </p>
                          </div>
                        )}

                      {/* Period-wise Attendance Summary */}
                      <div className="space-y-1.5 sm:space-y-2">
                        <h3 className="text-xs sm:text-sm font-semibold text-slate-700 mb-2 sm:mb-3">
                          Period Attendance
                        </h3>
                        {todayTimetable.filter((item) => item.subject_id)
                          .length === 0 ? (
                          <p className="text-slate-500 text-sm text-center py-4">
                            No periods assigned today
                          </p>
                        ) : (
                          todayTimetable
                            .filter((item) => item.subject_id)
                            .map((item, index) => (
                              <div
                                key={index}
                                className={`p-2 sm:p-3 rounded-lg border-l-4 ${
                                  item.attendance_marked
                                    ? "bg-green-50 border-green-500"
                                    : "bg-orange-50 border-orange-500"
                                }`}
                              >
                                <div className="flex items-center justify-between">
                                  <div className="flex items-center gap-1.5 sm:gap-2">
                                    <div
                                      className={`rounded-full w-6 h-6 sm:w-8 sm:h-8 flex items-center justify-center font-bold text-xs sm:text-sm ${
                                        item.attendance_marked
                                          ? "bg-green-200 text-green-800"
                                          : "bg-orange-200 text-orange-800"
                                      }`}
                                    >
                                      {item.period}
                                    </div>
                                    <div>
                                      <p className="text-[11px] sm:text-sm font-medium text-slate-800 leading-tight">
                                        {item.subject?.name || "Unknown"}
                                      </p>
                                      <p className="text-[10px] sm:text-xs text-slate-500">
                                        Y{item.year}-{item.section}
                                      </p>
                                    </div>
                                  </div>
                                  {item.attendance_marked ? (
                                    <svg
                                      className="w-4 h-4 sm:w-5 sm:h-5 text-green-600 flex-shrink-0"
                                      fill="currentColor"
                                      viewBox="0 0 20 20"
                                    >
                                      <path
                                        fillRule="evenodd"
                                        d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                                        clipRule="evenodd"
                                      />
                                    </svg>
                                  ) : (
                                    <svg
                                      className="w-4 h-4 sm:w-5 sm:h-5 text-orange-600 flex-shrink-0"
                                      fill="currentColor"
                                      viewBox="0 0 20 20"
                                    >
                                      <path
                                        fillRule="evenodd"
                                        d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z"
                                        clipRule="evenodd"
                                      />
                                    </svg>
                                  )}
                                </div>
                              </div>
                            ))
                        )}
                      </div>

                      {/* Summary Stats */}
                      <div className="mt-2 sm:mt-4 p-2 sm:p-4 bg-slate-50 rounded-lg border border-slate-200">
                        <div className="flex justify-between items-center">
                          <span className="text-xs sm:text-sm text-slate-600">
                            Total Periods:
                          </span>
                          <span className="text-base sm:text-lg font-bold text-slate-800">
                            {
                              todayTimetable.filter((item) => item.subject_id)
                                .length
                            }
                          </span>
                        </div>
                        <div className="flex justify-between items-center mt-1 sm:mt-2">
                          <span className="text-xs sm:text-sm text-slate-600">
                            Marked:
                          </span>
                          <span className="text-base sm:text-lg font-bold text-green-600">
                            {
                              todayTimetable.filter(
                                (item) =>
                                  item.subject_id && item.attendance_marked
                              ).length
                            }
                          </span>
                        </div>
                        <div className="flex justify-between items-center mt-1 sm:mt-2">
                          <span className="text-xs sm:text-sm text-slate-600">
                            Pending:
                          </span>
                          <span className="text-base sm:text-lg font-bold text-orange-600">
                            {
                              todayTimetable.filter(
                                (item) =>
                                  item.subject_id && !item.attendance_marked
                              ).length
                            }
                          </span>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* Notifications Table - Third Column */}
              <div className="hidden md:block lg:col-span-1">
                <div className="bg-white rounded-xl shadow-lg border border-slate-200 p-3 sm:p-6 h-full">
                  <div className="mb-3 sm:mb-4 flex items-center justify-between">
                    <h2 className="text-sm sm:text-lg font-bold text-slate-800 flex items-center">
                      <Bell className="h-4 w-4 sm:h-5 sm:w-5 mr-2 text-blue-600" />
                      Notifications
                    </h2>
                    <span className="text-xs sm:text-sm text-slate-500">
                      {Math.min(notifications.length, 5)}
                    </span>
                  </div>
                  {notifications.length === 0 ? (
                    <div className="text-center py-6 text-slate-500">
                      <Bell className="h-10 w-10 sm:h-12 sm:w-12 mx-auto text-slate-300 mb-2" />
                      <p className="text-xs sm:text-sm">No notifications</p>
                    </div>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full">
                        <thead>
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
                          {notifications.slice(0, 5).map((notif, idx) => (
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
            </div>
          </>
        )}

        {/* Recent Notices Section */}
        <div className="mt-8">
          <div className="bg-white rounded-xl shadow-lg border border-slate-200 p-6">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-lg font-bold text-slate-800 flex items-center">
                <Megaphone className="h-5 w-5 mr-2 text-orange-600" />
                Recent Notices
                {unreadNoticesCount > 0 && (
                  <span className="ml-2 bg-red-500 text-white text-xs font-bold rounded-full h-5 w-5 flex items-center justify-center">
                    {unreadNoticesCount}
                  </span>
                )}
              </h2>
              <button
                onClick={() => navigate("/notices")}
                className="text-blue-600 hover:text-blue-700 text-sm font-medium hover:underline"
              >
                View All
              </button>
            </div>

            {recentNotices.length === 0 ? (
              <div className="text-center py-8">
                <Megaphone className="h-12 w-12 mx-auto text-slate-300 mb-2" />
                <p className="text-slate-500">No recent notices</p>
              </div>
            ) : (
              <div className="space-y-4">
                {recentNotices.map((notice) => {
                  const readNotices = JSON.parse(
                    localStorage.getItem("readNotices") || "[]"
                  );
                  const isUnread = !readNotices.includes(notice.id);

                  return (
                    <div
                      key={notice.id}
                      className={`p-4 rounded-lg border cursor-pointer transition-all hover:shadow-md ${
                        isUnread
                          ? "bg-orange-50 border-orange-200 hover:border-orange-300"
                          : "bg-slate-50 border-slate-200 hover:border-slate-300"
                      }`}
                      onClick={() => navigate("/notices")}
                    >
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-2">
                            <h3
                              className={`font-semibold ${
                                isUnread ? "text-orange-900" : "text-slate-900"
                              }`}
                            >
                              {notice.title}
                            </h3>
                            {isUnread && (
                              <span className="bg-orange-500 text-white text-xs px-2 py-1 rounded-full font-medium">
                                New
                              </span>
                            )}
                          </div>
                          <p
                            className={`text-sm line-clamp-2 ${
                              isUnread ? "text-orange-700" : "text-slate-600"
                            }`}
                          >
                            {notice.description}
                          </p>
                          <div className="flex items-center gap-4 mt-2 text-xs text-slate-500">
                            <span>
                              {new Date(notice.created_at).toLocaleDateString()}
                            </span>
                            {notice.attachment_url && (
                              <span className="flex items-center gap-1">
                                📎 Attachment
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

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
