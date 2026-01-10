import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  FileText,
  Calendar,
  CreditCard,
  Award,
  Bell,
  Home,
  BookOpen,
  Megaphone,
} from "lucide-react";
import DashboardLayout from "../../components/DashboardLayout";
import { supabase } from "../../lib/supabase";
import { useAuth } from "../../contexts/AuthContext";
import { useInactivityLogout } from "../../hooks/useInactivityLogout";

export default function StudentDashboard() {
  const { user, profile } = useAuth();
  
  // Auto-logout after 3 minutes of inactivity (students only)
  const { showWarning, secondsRemaining, cancelLogout } = useInactivityLogout(3);
  const navigate = useNavigate();
  const [pendingStats, setPendingStats] = useState({
    od: 0,
    leave: 0,
    gatepass: 0,
    bonafide: 0,
  });
  const [totalStats, setTotalStats] = useState({
    od: 0,
    leave: 0,
    gatepass: 0,
    bonafide: 0,
  });
  const [notifications, setNotifications] = useState<
    Array<{
      id: string;
      type: string;
      status: string;
      date: string;
      message: string;
    }>
  >([]);
  const [loading, setLoading] = useState(true);
  const [attendancePercentage, setAttendancePercentage] = useState<number>(0);
  const [todayTimetable, setTodayTimetable] = useState<any[]>([]);
  const [todayPeriodAttendance, setTodayPeriodAttendance] = useState<
    Map<number, string>
  >(new Map());
  
  const [showNotifications, setShowNotifications] = useState(false);
  const [recentNotices, setRecentNotices] = useState<any[]>([]);
  const [unreadNoticesCount, setUnreadNoticesCount] = useState(0);
  const [showPSBonafidePopup, setShowPSBonafidePopup] = useState(false);
  const [showClaimConfirmation, setShowClaimConfirmation] = useState(false);

  useEffect(() => {
    if (user) {
      // Load critical data first (stats and notices)
      Promise.all([
        fetchPendingStats(),
        fetchRecentNotices()
      ]).then(() => {
        // Load less critical data after
        fetchNotifications();
        fetchAttendancePercentage();
        fetchTodayTimetable();
      });
    }
  }, [user]);

  const fetchPendingStats = async () => {
    try {
      // Use count() instead of select("id") for better performance
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
        // Pending applications - use count for efficiency
        supabase
          .from("od_applications")
          .select("*", { count: "exact", head: true })
          .eq("student_id", user?.id)
          .eq("status", "pending"),
        supabase
          .from("leave_applications")
          .select("*", { count: "exact", head: true })
          .eq("student_id", user?.id)
          .eq("status", "pending"),
        supabase
          .from("gatepass_applications")
          .select("*", { count: "exact", head: true })
          .eq("student_id", user?.id)
          .eq("status", "pending"),
        supabase
          .from("bonafide_applications")
          .select("*", { count: "exact", head: true })
          .eq("student_id", user?.id)
          .eq("status", "pending"),
        // Total applications - use count for efficiency
        supabase
          .from("od_applications")
          .select("*", { count: "exact", head: true })
          .eq("student_id", user?.id),
        supabase
          .from("leave_applications")
          .select("*", { count: "exact", head: true })
          .eq("student_id", user?.id),
        supabase
          .from("gatepass_applications")
          .select("*", { count: "exact", head: true })
          .eq("student_id", user?.id),
        supabase
          .from("bonafide_applications")
          .select("*", { count: "exact", head: true })
          .eq("student_id", user?.id),
      ]);

      const pendingStatsData = {
        od: odPending.count || 0,
        leave: leavePending.count || 0,
        gatepass: gatepassPending.count || 0,
        bonafide: bonafidePending.count || 0,
      };

      const totalStatsData = {
        od: odTotal.count || 0,
        leave: leaveTotal.count || 0,
        gatepass: gatepassTotal.count || 0,
        bonafide: bonafideTotal.count || 0,
      };

      setPendingStats(pendingStatsData);
      setTotalStats(totalStatsData);
    } catch (error) {
      console.error("Error fetching stats:", error);
    } finally {
      setLoading(false);
    }
  };

  const fetchAttendancePercentage = async () => {
    try {
      if (!user?.id) return;

      // Get today's date in YYYY-MM-DD format
      const today = new Date();
      const todayStr = today.toISOString().split("T")[0];

      // Get all daily attendance
      const { data: dailyData, error: dailyError } = await supabase
        .from("daily_attendance")
        .select("date, status")
        .eq("student_id", user.id);

      if (dailyError) throw dailyError;

      // Get all period attendance
      const { data: periodData, error: periodError } = await supabase
        .from("period_attendance")
        .select("date, period, status")
        .eq("student_id", user.id);

      if (periodError) throw periodError;

      // Assume 7 periods per day
      const PERIODS_PER_DAY = 7;

      // Create a map to track attendance for each date and period
      const attendanceMap = new Map<string, Map<number, string>>();

      // First, populate from daily attendance (all periods for that day)
      dailyData?.forEach((day) => {
        const dateKey = day.date;
        if (!attendanceMap.has(dateKey)) {
          attendanceMap.set(dateKey, new Map());
        }
        const dayMap = attendanceMap.get(dateKey)!;

        // Set all 7 periods to the daily status
        for (let period = 1; period <= PERIODS_PER_DAY; period++) {
          dayMap.set(period, day.status);
        }
      });

      // Then, override with specific period attendance (manual marking takes precedence)
      periodData?.forEach((record) => {
        const dateKey = record.date;
        if (!attendanceMap.has(dateKey)) {
          attendanceMap.set(dateKey, new Map());
        }
        const dayMap = attendanceMap.get(dateKey)!;

        // Override this specific period
        dayMap.set(record.period, record.status);
      });

      // Calculate totals
      let totalPeriods = 0;
      let presentCount = 0;
      let lateCount = 0;
      let odCount = 0;

      attendanceMap.forEach((dayMap) => {
        dayMap.forEach((status) => {
          totalPeriods++;
          switch (status) {
            case "present":
              presentCount++;
              break;
            case "late":
              lateCount++;
              break;
            case "od":
              odCount++;
              break;
          }
        });
      });

      // Calculate percentage (present + od + late considered as attended)
      const attended = presentCount + odCount + lateCount;
      const percentage =
        totalPeriods > 0 ? Math.round((attended / totalPeriods) * 100) : 0;

      setAttendancePercentage(percentage);

      // Extract today's period attendance
      const todayAttendance = attendanceMap.get(todayStr);
      if (todayAttendance) {
        setTodayPeriodAttendance(todayAttendance);
      } else {
        setTodayPeriodAttendance(new Map());
      }
    } catch (error) {
      console.error("Error fetching attendance:", error);
      setAttendancePercentage(0);
      setTodayPeriodAttendance(new Map());
    }
  };

  const fetchNotifications = async () => {
    try {
      // Query all four application tables with their approvals
      const [odApps, leaveApps, gatepassApps, bonafideApps] = await Promise.all(
        [
          supabase
            .from("od_applications")
            .select(
              "id, status, updated_at, od_approvals(id, action, remarks, approver_role, created_at)"
            )
            .eq("student_id", user?.id)
            .order("updated_at", { ascending: false })
            .limit(2),
          supabase
            .from("leave_applications")
            .select(
              "id, status, updated_at, leave_approvals(id, action, remarks, approver_role, created_at)"
            )
            .eq("student_id", user?.id)
            .order("updated_at", { ascending: false })
            .limit(2),
          supabase
            .from("gatepass_applications")
            .select(
              "id, status, updated_at, gatepass_approvals(id, action, remarks, approver_role, created_at)"
            )
            .eq("student_id", user?.id)
            .order("updated_at", { ascending: false })
            .limit(2),
          supabase
            .from("bonafide_applications")
            .select(
              "id, status, updated_at, claimed_at, bonafide_approvals(id, action, remarks, approver_role, created_at)"
            )
            .eq("student_id", user?.id)
            .order("updated_at", { ascending: false })
            .limit(2),
        ]
      );

      // Check for PS-approved bonafide applications that are not yet claimed (server-side)
      const bonafideData = bonafideApps.data || [];
      let hasUnclaimedPSApprovedBonafide = false;

      for (const app of bonafideData) {
        const approvals = app.bonafide_approvals || [];
        const psApproval = approvals.find((approval: any) =>
          approval.approver_role === 'ps' && approval.action === 'approved'
        );

        // If PS approved and application has no claimed_at or PS approval is newer than claimed_at
        if (psApproval) {
          const claimedAt = app.claimed_at ? new Date(app.claimed_at).getTime() : 0;
          const psTime = new Date(psApproval.created_at).getTime();
          if (!app.claimed_at || psTime > claimedAt) {
            hasUnclaimedPSApprovedBonafide = true;
            break;
          }
        }
      }

      if (hasUnclaimedPSApprovedBonafide) setShowPSBonafidePopup(true);

      // Merge and sort all applications
      const allApps: any[] = [
        ...(odApps.data || []).map((app: any) => ({
          ...app,
          type: "od",
          approvals: app.od_approvals,
        })),
        ...(leaveApps.data || []).map((app: any) => ({
          ...app,
          type: "leave",
          approvals: app.leave_approvals,
        })),
        ...(gatepassApps.data || []).map((app: any) => ({
          ...app,
          type: "gatepass",
          approvals: app.gatepass_approvals,
        })),
        ...(bonafideApps.data || []).map((app: any) => ({
          ...app,
          type: "bonafide",
          approvals: app.bonafide_approvals,
        })),
      ];

      // Sort by updated_at and take top 5
      allApps.sort(
        (a, b) =>
          new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime()
      );
      const topApps = allApps.slice(0, 10);

      const notifs = topApps.map((app) => {
        const date = new Date(app.updated_at).toLocaleDateString();
        let message = `Your ${app.type.toUpperCase()} application is ${
          app.status
        } - ${date}`;

        // If there are approvals, show the latest approval action and remarks
        const approvals = app.approvals || [];
        if (approvals.length > 0) {
          const latest = approvals.sort(
            (a: any, b: any) =>
              new Date(b.created_at).getTime() -
              new Date(a.created_at).getTime()
          )[0];
          if (latest) {
            message += ` (${latest.action.toUpperCase()} by ${
              latest.approver_role
            }${latest.remarks ? `: ${latest.remarks}` : ""})`;
          }
        }

        return {
          id: app.id,
          type: app.type.toUpperCase(),
          status: app.status,
          date: date,
          message: message,
        };
      });

      setNotifications(notifs);
    } catch (error) {
      console.error("Error fetching notifications:", error);
    }
  };

  const fetchTodayTimetable = async () => {
    try {
      if (!user?.id || !profile?.department) return;

      // Fetch student year and section
      const { data: studentData, error: studentError } = await supabase
        .from("students")
        .select("year, section")
        .eq("id", user.id)
        .maybeSingle();

      if (studentError) throw studentError;
      if (!studentData || !studentData.year || !studentData.section) return;

      const computeCurrentSemester = () => {
        const m = new Date().getMonth();
        return m < 6 ? 1 : 2;
      };
      const semester = computeCurrentSemester();

      // Get today's day of week (1=Monday, 5=Friday)
      const today = new Date().getDay();
      const dayOfWeek = today === 0 ? 7 : today; // Convert Sunday (0) to 7, keep rest as is

      // Fetch today's timetable (same logic as MySubjects page)
      const { data: timetableData, error: timetableError } = await supabase
        .from("timetables")
        .select("day_of_week, period, subject_id")
        .eq("department", profile.department)
        .eq("year", studentData.year)
        .eq("section", studentData.section)
        .eq("day_of_week", dayOfWeek)
        .order("period", { ascending: true });

      if (timetableError) throw timetableError;

      // Fetch subject details for the timetable
      if (timetableData && timetableData.length > 0) {
        const subjectIds = timetableData
          .map((t) => t.subject_id)
          .filter((id) => id !== null);

        if (subjectIds.length > 0) {
          const { data: subjectsData } = await supabase
            .from("subjects")
            .select("id, name, subject_code")
            .in("id", subjectIds);

          const subjectMap = new Map();
          subjectsData?.forEach((s) => subjectMap.set(s.id, s));

          const enrichedTimetable = timetableData.map((t) => ({
            ...t,
            subject: t.subject_id ? subjectMap.get(t.subject_id) : null,
          }));

          setTodayTimetable(enrichedTimetable);
        } else {
          setTodayTimetable(timetableData);
        }
      } else {
        setTodayTimetable([]);
      }
    } catch (error) {
      console.error("Error fetching timetable:", error);
    }
  };

  const handleClaimBonafide = () => {
    setShowClaimConfirmation(true);
  };

  const handleClaimConfirmation = (confirmed: boolean) => {
    if (confirmed && user?.id) {
      (async () => {
        try {
          // Fetch bonafide applications for this student that have a PS-approved approval
          const { data: appsWithApprovals, error: fetchErr } = await supabase
            .from('bonafide_applications')
            .select('id, claimed_at, bonafide_approvals(created_at, approver_role, action)')
            .eq('student_id', user.id)
            .order('created_at', { ascending: false })
            .limit(500);
          if (fetchErr) throw fetchErr;

          const toUpdate: string[] = [];
          (appsWithApprovals || []).forEach((a: any) => {
            const approvals = a.bonafide_approvals || [];
            const psApproval = approvals.find((ap: any) => ap.approver_role === 'ps' && ap.action === 'approved');
            if (psApproval) {
              const claimedAt = a.claimed_at ? new Date(a.claimed_at).getTime() : 0;
              const psTime = new Date(psApproval.created_at).getTime();
              if (!a.claimed_at || psTime > claimedAt) {
                toUpdate.push(a.id);
              }
            }
          });

          if (toUpdate.length > 0) {
            const { error: updErr } = await supabase
              .from('bonafide_applications')
              .update({ claimed_at: new Date().toISOString() })
              .in('id', toUpdate);
            if (updErr) {
              console.error('Failed to update claimed_at', updErr);
              alert('Failed to record claim. Please try again.');
            } else {
              // Refresh notifications and hide popup
              await fetchNotifications();
              setShowPSBonafidePopup(false);
            }
          } else {
            // Nothing to update, just hide popup
            setShowPSBonafidePopup(false);
          }
        } catch (err) {
          console.error('Error claiming bonafide approvals', err);
          alert('Failed to record claim. Please try again.');
        }
      })();
    }
    setShowClaimConfirmation(false);
  };

  const fetchRecentNotices = async () => {
    try {
      // Fetch content from notice_content table (same as home page)
      const { data: contentData, error: contentError } = await supabase
        .from('notice_content')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(3);

      if (contentError) throw contentError;

      // Get public URLs for images
      const noticesWithUrls = contentData.map(content => {
        const { data: publicUrl } = supabase.storage
          .from('notice')
          .getPublicUrl(content.image_name);

        return {
          ...content,
          publicUrl: publicUrl.publicUrl,
          content: content,
          id: content.id,
          title: content.title,
          description: content.description,
          created_at: content.created_at
        };
      });

      setRecentNotices(noticesWithUrls);

      // Count unread notices (using the same logic but for notice_content)
      const readNotices = JSON.parse(localStorage.getItem("readNotices") || "[]");
      const unreadCount = noticesWithUrls.filter(
        (notice) => !readNotices.includes(notice.id)
      ).length;
      setUnreadNoticesCount(unreadCount);
    } catch (error) {
      console.error("Error fetching notices:", error);
    }
  };

  const sidebarItems = [
    {
      label: "Dashboard",
      path: "/student-dashboard",
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
      icon: <Calendar className="h-5 w-5" />,
    },
    {
      label: "Gatepass",
      path: "/student/gatepass",
      icon: <CreditCard className="h-5 w-5" />,
    },
    {
      label: "Bonafide",
      path: "/student/bonafide",
      icon: <Award className="h-5 w-5" />,
    },
    {
      label: "My Electives",
      path: "/student/electives",
      icon: <BookOpen className="h-5 w-5" />,
    },
    {
      label: "Notifications",
      path: "/student/notifications",
      icon: <Bell className="h-5 w-5" />,
    },
    {
      label: "Notices",
      path: "/notices",
      icon: <Megaphone className="h-5 w-5" />,
    },
  ];

  const statusCards = [
    {
      title: "Apply for OD",
      pending: pendingStats.od,
      total: totalStats.od,
      icon: <FileText className="h-8 w-8 text-blue-600" />,
      bgColor: "bg-blue-50",
      borderColor: "border-blue-200",
      path: "/student/od",
    },
    {
      title: "Apply for Leave",
      pending: pendingStats.leave,
      total: totalStats.leave,
      icon: <Calendar className="h-8 w-8 text-green-600" />,
      bgColor: "bg-green-50",
      borderColor: "border-green-200",
      path: "/student/leave",
    },
    {
      title: "Apply for Bonafide",
      pending: pendingStats.bonafide,
      total: totalStats.bonafide,
      icon: <Award className="h-8 w-8 text-purple-600" />,
      bgColor: "bg-purple-50",
      borderColor: "border-purple-200",
      path: "/student/bonafide",
    },
    {
      title: "Apply for Gatepass",
      pending: pendingStats.gatepass,
      total: totalStats.gatepass,
      icon: <CreditCard className="h-8 w-8 text-orange-600" />,
      bgColor: "bg-orange-50",
      borderColor: "border-orange-200",
      path: "/student/gatepass",
    },
  ];

  return (
    <DashboardLayout sidebarItems={sidebarItems}>
      <div className="max-w-7xl mx-auto">
        <div className="mb-8">
          <h1 className="text-xl font-bold text-slate-800">
            Welcome, {profile?.name}!
          </h1>
          <p className="text-slate-600 mt-1">
            Here's your dashboard overview for today
          </p>
        </div>

        {loading ? (
          <div className="text-center py-12">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
            <p className="mt-4 text-slate-600">Loading dashboard...</p>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-2 md:grid-cols-2 lg:grid-cols-4 gap-1.5 sm:gap-3 mb-4">
              {statusCards.map((card, index) => (
                <button
                  key={index}
                  onClick={() => navigate(card.path)}
                  className={`${card.bgColor} border ${card.borderColor} rounded-md p-1.5 sm:p-3 hover:shadow-lg transition-all hover:scale-105 cursor-pointer text-left`}
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
                </button>
              ))}
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 sm:gap-6">
              {/* Today's Timetable Card */}
              <div className="lg:col-span-1">
                <button
                  onClick={() => navigate("/student/subjects?view=timetable")}
                  className="w-full bg-white rounded-xl shadow-lg border border-slate-200 p-3 sm:p-6 hover:shadow-xl transition-all hover:scale-105 cursor-pointer text-left h-full"
                >
                  <h2 className="text-lg font-bold text-slate-800 mb-4">
                    Today's Timetable
                  </h2>
                  {todayTimetable.length === 0 ? (
                    <p className="text-slate-500 text-center py-8">
                      No classes scheduled for today
                    </p>
                  ) : (
                    <div className="space-y-2">
                      {todayTimetable.map((item, index) => (
                        <div
                          key={index}
                          className="p-2 bg-slate-50 rounded-lg border border-slate-200"
                        >
                          <div className="flex items-center gap-2">
                            <div className="bg-blue-100 text-blue-700 rounded-full w-7 h-7 flex items-center justify-center font-bold text-xs flex-shrink-0">
                              {item.period}
                            </div>
                            <div className="min-w-0 flex-1">
                              <p className="font-semibold text-slate-800 text-sm truncate">
                                {item.subject?.name || "Unknown Subject"}
                              </p>
                              <p className="text-xs text-slate-500">
                                {item.subject?.subject_code || ""}
                              </p>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </button>

                
              </div>

              {/* Attendance Card */}
              <div className="lg:col-span-1">
                <button
                  onClick={() => navigate("/student/attendance")}
                  className="w-full bg-white rounded-xl shadow-lg border border-slate-200 p-3 sm:p-6 hover:shadow-xl transition-all hover:scale-105 cursor-pointer text-left flex flex-col h-full"
                >
                  <h2 className="text-lg font-bold text-slate-800 mb-4">
                    My Attendance
                  </h2>

                  {/* Total Attendance at Top */}
                  <div className="bg-gradient-to-r from-blue-50 to-indigo-50 rounded-lg p-4 mb-4 border border-blue-200">
                    <p className="text-xs text-slate-600 text-center mb-2">
                      Overall Attendance
                    </p>
                    <div className="flex items-center justify-center gap-3">
                      <div className="relative w-16 h-16">
                        <svg className="w-full h-full transform -rotate-90">
                          <circle
                            cx="32"
                            cy="32"
                            r="28"
                            stroke="#e2e8f0"
                            strokeWidth="6"
                            fill="none"
                          />
                          <circle
                            cx="32"
                            cy="32"
                            r="28"
                            stroke={
                              attendancePercentage >= 75
                                ? "#10b981"
                                : attendancePercentage >= 50
                                ? "#f59e0b"
                                : "#ef4444"
                            }
                            strokeWidth="6"
                            fill="none"
                            strokeDasharray={`${2 * Math.PI * 28}`}
                            strokeDashoffset={`${
                              2 *
                              Math.PI *
                              28 *
                              (1 - attendancePercentage / 100)
                            }`}
                            strokeLinecap="round"
                            className="transition-all duration-1000 ease-out"
                          />
                        </svg>
                        <div className="absolute inset-0 flex items-center justify-center">
                          <span
                            className={`text-lg font-bold ${
                              attendancePercentage >= 75
                                ? "text-green-600"
                                : attendancePercentage >= 50
                                ? "text-orange-600"
                                : "text-red-600"
                            }`}
                          >
                            {attendancePercentage}%
                          </span>
                        </div>
                      </div>
                      <div className="text-left">
                        <p
                          className={`text-sm font-semibold ${
                            attendancePercentage >= 75
                              ? "text-green-700"
                              : attendancePercentage >= 50
                              ? "text-orange-700"
                              : "text-red-700"
                          }`}
                        >
                          {attendancePercentage >= 75
                            ? "Excellent!"
                            : attendancePercentage >= 50
                            ? "Needs Improvement"
                            : "Critical"}
                        </p>
                        <p className="text-xs text-slate-500">
                          {attendancePercentage >= 75
                            ? "Keep it up!"
                            : "Attend more classes"}
                        </p>
                      </div>
                    </div>
                  </div>

                  {/* Today's Period Attendance */}
                  <div>
                    <h3 className="text-sm font-semibold text-slate-700 mb-3">
                      Today's Attendance
                    </h3>
                    {todayPeriodAttendance.size === 0 ? (
                      <div className="text-center py-6">
                        <p className="text-slate-400 text-sm">
                          No periods marked yet
                        </p>
                        <p className="text-slate-400 text-xs mt-1">
                          Attendance will appear here once marked
                        </p>
                      </div>
                    ) : (
                      <div className="space-y-2 max-h-48 overflow-y-auto">
                        {Array.from({ length: 7 }, (_, i) => i + 1)
                          .filter((period) => todayPeriodAttendance.has(period))
                          .map((period) => {
                            const status = todayPeriodAttendance.get(period);
                            const timetableEntry = todayTimetable.find(
                              (t) => t.period === period
                            );
                            const subjectName =
                              timetableEntry?.subject?.name ||
                              `Period ${period}`;

                            let bgColor = "bg-slate-50";
                            let textColor = "text-slate-600";
                            let statusLabel = "Not Marked";
                            let statusBadgeColor =
                              "bg-slate-200 text-slate-600";

                            if (status === "present") {
                              bgColor = "bg-green-50";
                              textColor = "text-green-700";
                              statusLabel = "Present";
                              statusBadgeColor = "bg-green-100 text-green-700";
                            } else if (status === "absent") {
                              bgColor = "bg-red-50";
                              textColor = "text-red-700";
                              statusLabel = "Absent";
                              statusBadgeColor = "bg-red-100 text-red-700";
                            } else if (status === "late") {
                              bgColor = "bg-orange-50";
                              textColor = "text-orange-700";
                              statusLabel = "Late";
                              statusBadgeColor =
                                "bg-orange-100 text-orange-700";
                            } else if (status === "od") {
                              bgColor = "bg-blue-50";
                              textColor = "text-blue-700";
                              statusLabel = "OD";
                              statusBadgeColor = "bg-blue-100 text-blue-700";
                            } else if (status === "leave") {
                              bgColor = "bg-purple-50";
                              textColor = "text-purple-700";
                              statusLabel = "Leave";
                              statusBadgeColor =
                                "bg-purple-100 text-purple-700";
                            }

                            return (
                              <div
                                key={period}
                                className={`${bgColor} rounded-lg p-2.5 border border-slate-200 flex items-center justify-between`}
                              >
                                <div className="flex items-center gap-2 flex-1 min-w-0">
                                  <div className="bg-white rounded-full w-7 h-7 flex items-center justify-center border border-slate-300 flex-shrink-0">
                                    <span
                                      className={`text-xs font-bold ${textColor}`}
                                    >
                                      {period}
                                    </span>
                                  </div>
                                  <span
                                    className={`text-sm font-medium ${textColor} truncate`}
                                  >
                                    {subjectName}
                                  </span>
                                </div>
                                <span
                                  className={`${statusBadgeColor} px-2.5 py-1 rounded-full text-xs font-semibold flex-shrink-0 ml-2`}
                                >
                                  {statusLabel}
                                </span>
                              </div>
                            );
                          })}
                      </div>
                    )}
                  </div>
                </button>
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
                      const readNotices = JSON.parse(localStorage.getItem("readNotices") || "[]");
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
                                <h3 className={`font-semibold ${isUnread ? "text-orange-900" : "text-slate-900"}`}>
                                  {notice.title}
                                </h3>
                                {isUnread && (
                                  <span className="bg-orange-500 text-white text-xs px-2 py-1 rounded-full font-medium">
                                    New
                                  </span>
                                )}
                              </div>
                              <p className={`text-sm line-clamp-2 ${isUnread ? "text-orange-700" : "text-slate-600"}`}>
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

            {/* Mobile Notifications Panel */}
            {showNotifications && (
              <div className="md:hidden fixed inset-0 z-50 flex items-end justify-center p-4">
                {/* Backdrop */}
                <div
                  className="absolute inset-0 bg-black bg-opacity-50"
                  onClick={() => setShowNotifications(false)}
                />

                {/* Notification Panel */}
                <div className="relative bg-white rounded-t-xl shadow-lg w-full max-w-md max-h-[70vh] overflow-hidden transform transition-all duration-300 ease-out animate-in slide-in-from-bottom">
                  {/* Header */}
                  <div className="flex items-center justify-between p-4 border-b border-slate-200">
                    <h2 className="text-lg font-bold text-slate-800 flex items-center">
                      <Bell className="h-5 w-5 mr-2 text-blue-600" />
                      Notifications
                    </h2>
                    <button
                      onClick={() => setShowNotifications(false)}
                      className="text-slate-400 hover:text-slate-600 transition-colors p-1 hover:bg-slate-100 rounded-full"
                      aria-label="Close"
                    >
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  </div>

                  {/* Content */}
                  <div className="overflow-y-auto max-h-[calc(70vh-80px)]">
                    {notifications.length === 0 ? (
                      <div className="text-center py-8 px-4">
                        <Bell className="h-12 w-12 mx-auto text-slate-300 mb-3" />
                        <p className="text-slate-500 text-sm">No notifications</p>
                      </div>
                    ) : (
                      <div className="divide-y divide-slate-100">
                        {notifications.map((notif, idx) => (
                          <div
                            key={idx}
                            className="p-4 hover:bg-slate-50 transition-colors cursor-pointer"
                            onClick={() => {
                              navigate("/notifications");
                              setShowNotifications(false);
                            }}
                          >
                            <div className="flex items-start justify-between mb-2">
                              <span className="text-sm font-medium text-slate-800 flex-1 mr-2">
                                {notif.type}
                              </span>
                              <span
                                className={`inline-block px-2 py-1 rounded-full text-xs font-medium flex-shrink-0 ${
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
                            </div>
                            <div className="text-xs text-slate-500">
                              {notif.date}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Footer */}
                  {notifications.length > 0 && (
                    <div className="p-4 border-t border-slate-200 bg-slate-50">
                      <button
                        onClick={() => {
                          navigate("/notifications");
                          setShowNotifications(false);
                        }}
                        className="w-full bg-blue-600 hover:bg-blue-700 text-white py-2 px-4 rounded-lg text-sm font-medium transition-colors"
                      >
                        View All Notifications
                      </button>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* PS Bonafide Approval Popup */}
            {showPSBonafidePopup && (
              <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
                {/* Backdrop */}
                <div 
                  className="absolute inset-0 bg-black bg-opacity-10"
                  onClick={() => setShowPSBonafidePopup(false)}
                />
                
                {/* Popup Card */}
                <div className="relative bg-green-50 border-2 border-green-200 rounded-xl shadow-lg p-6 max-w-md w-full transform transition-all duration-300 ease-out animate-in fade-in slide-in-from-top-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 bg-green-100 rounded-full flex items-center justify-center">
                        <svg className="w-6 h-6 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                      </div>
                      <div>
                        <h3 className="text-lg font-semibold text-green-800">
                          Bonafide Approved!
                        </h3>
                        <p className="text-sm text-green-700">
                          Done by Principal Secretary
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={handleClaimBonafide}
                        className="bg-green-600 hover:bg-green-700 text-white px-3 py-1.5 rounded-lg text-sm font-medium transition-colors"
                      >
                        Claimed
                      </button>
                      <button
                        onClick={() => setShowPSBonafidePopup(false)}
                        className="text-green-500 hover:text-green-700 transition-colors p-1 hover:bg-green-100 rounded-full"
                        aria-label="Close"
                      >
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Claim Confirmation Dialog */}
            {showClaimConfirmation && (
              <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
                {/* Backdrop */}
                <div 
                  className="absolute inset-0 bg-black bg-opacity-50"
                  onClick={() => setShowClaimConfirmation(false)}
                />
                
                {/* Confirmation Card */}
                <div className="relative bg-white border border-slate-200 rounded-xl shadow-lg p-6 max-w-sm w-full transform transition-all duration-300 ease-out animate-in fade-in slide-in-from-top-4">
                  <div className="text-center">
                    <div className="w-12 h-12 bg-orange-100 rounded-full flex items-center justify-center mx-auto mb-4">
                      <svg className="w-6 h-6 text-orange-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L3.732 16.5c-.77.833.192 2.5 1.732 2.5z" />
                      </svg>
                    </div>
                    <h3 className="text-lg font-semibold text-slate-800 mb-2">
                      Confirm Claim
                    </h3>
                    <p className="text-sm text-slate-600 mb-6">
                      If yes, the popup won't show again. Claim bonafide before yes.
                    </p>
                    <div className="flex gap-3">
                      <button
                        onClick={() => handleClaimConfirmation(false)}
                        className="flex-1 bg-slate-200 hover:bg-slate-300 text-slate-700 px-4 py-2 rounded-lg text-sm font-medium transition-colors"
                      >
                        No
                      </button>
                      <button
                        onClick={() => handleClaimConfirmation(true)}
                        className="flex-1 bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors"
                      >
                        Yes
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </>
        )}

        {/* Inactivity Logout Warning Popup */}
        {showWarning && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
            {/* Backdrop */}
            <div className="absolute inset-0 bg-black bg-opacity-60" />
            
            {/* Warning Card */}
            <div className="relative bg-white border-2 border-red-500 rounded-xl shadow-2xl p-6 max-w-md w-full transform transition-all duration-300 ease-out animate-in fade-in zoom-in-95">
              <div className="text-center">
                <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4 animate-pulse">
                  <svg className="w-8 h-8 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-1.964-1.333-2.732 0L3.732 16c-.77 1.333.192 3 1.732 3z" />
                  </svg>
                </div>
                <h3 className="text-xl font-bold text-slate-900 mb-2">
                  Session Timeout Warning
                </h3>
                <p className="text-slate-600 mb-4">
                  You will be automatically logged out due to inactivity
                </p>
                
                {/* Countdown Timer */}
                <div className="mb-6">
                  <div className="inline-flex items-center justify-center w-20 h-20 bg-red-50 border-4 border-red-200 rounded-full mb-2">
                    <span className="text-3xl font-bold text-red-600">
                      {secondsRemaining}
                    </span>
                  </div>
                  <p className="text-sm text-slate-500">
                    seconds remaining
                  </p>
                </div>

                {/* Cancel Button */}
                <button
                  onClick={cancelLogout}
                  className="w-full bg-blue-600 hover:bg-blue-700 text-white px-6 py-3 rounded-lg text-base font-semibold transition-colors shadow-lg hover:shadow-xl"
                >
                  Stay Logged In
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}
