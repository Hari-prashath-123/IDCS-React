import { useEffect, useState } from "react";

import { useNavigate } from "react-router-dom";
import {
  FileText,
  Calendar,
  Award,
  Home,
  Users,
  Bell,
  CreditCard,
  Megaphone,
  CheckCircle,
  XCircle,
} from "lucide-react";
import DashboardLayout from "../../components/DashboardLayout";
import { supabase } from "../../lib/supabase";
import { useAuth } from "../../contexts/AuthContext";

export default function AHODDashboard() {
  type StaffRow = { on_leave?: boolean };

  const { user, profile } = useAuth();
  const navigate = useNavigate();
  const [pendingCounts, setPendingCounts] = useState({
    od: 0,
    leave: 0,
    bonafide: 0,
    gatepass: 0,
  });
  const [totalCounts, setTotalCounts] = useState({
    od: 0,
    leave: 0,
    bonafide: 0,
    gatepass: 0,
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

  useEffect(() => {
    if (user) {
      fetchPendingCounts();
      fetchLeaveStatus();
      fetchNotifications();

      const staffChannel = supabase
        .channel("staff-leave-ahod")
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
              const newVal = (payload.new as StaffRow)?.on_leave;
              console.log("Realtime staff-leave payload received:", payload);
              if (typeof newVal !== "undefined") setOnLeave(newVal);
            } catch {
              // ignore
            }
          }
        )
        .subscribe();

      return () => {
        try {
          staffChannel.unsubscribe();
        } catch {
          // ignore
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
      console.log("Initial AHOD leave status fetched:", initialLeaveStatus);
    } catch (error) {
      console.error("Error fetching leave status:", error);
    }
  };

  const handleLeaveToggle = async () => {
    setShowLeaveConfirmation(true);
  };

  const confirmLeaveToggle = async () => {
    setShowLeaveConfirmation(false);
    let prevLeave = onLeave;
    const newLeaveStatus = !onLeave;

    try {
      setUpdatingLeave(true);
      console.log(
        "Toggling leave status for AHOD:",
        user?.id,
        "Current:",
        onLeave,
        "New:",
        newLeaveStatus
      );

      prevLeave = onLeave;
      // Optimistically update UI so user sees immediate feedback. We'll revert if update fails.
      setOnLeave(newLeaveStatus);

      // Attempt update. The RLS policy requires id = auth.uid(), so we must ensure
      // the authenticated user's id matches the staff row id. Since AHOD users might
      // have profile.id != user.id in some setups, we use user.id (auth.uid()).
      let verified = newLeaveStatus;

      // Simple update without select to avoid PostgREST content-negotiation issues
      const { error: updateError, count } = await supabase
        .from("staff")
        .update({ on_leave: newLeaveStatus })
        .eq("id", user?.id);

      if (updateError) {
        console.error("Update failed:", updateError);
        throw updateError;
      }

      console.log("Update count:", count);

      if (count === 0) {
        console.error("Update matched 0 rows. Possible RLS block or wrong id.");
        throw new Error(
          "No staff row was updated. Check that you have permission to update your own leave status."
        );
      }

      // Refetch to confirm the new value
      const { data: refetch, error: refetchErr } = await supabase
        .from("staff")
        .select("on_leave")
        .eq("id", user?.id)
        .maybeSingle();

      if (refetchErr) {
        console.error("Refetch failed:", refetchErr);
        throw refetchErr;
      }

      verified = (refetch as StaffRow)?.on_leave ?? newLeaveStatus;
      console.log("Leave status after update (verified):", verified);

      setOnLeave(verified);
      // Ensure we have the freshest value from the DB reflected in the UI
      try {
        await fetchLeaveStatus();
      } catch (e) {
        console.warn("Failed to refetch leave status after update:", e);
      }
      setNotificationMessage(
        `Leave status updated to: ${verified ? "On Leave" : "Active"}`
      );
      setNotificationType("success");
      setShowNotification(true);
    } catch (error) {
      console.error("Error toggling leave status:", error);
      // Revert optimistic update on error
      try {
        setOnLeave(prevLeave);
      } catch (e) {
        /* ignore */
      }
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
      const { data: students, error: studentsError } = await supabase
        .from("students")
        .select("id")
        .eq("ahod_id", user?.id);

      if (studentsError) throw studentsError;

      const studentIds = students?.map((s) => s.id) || [];

      if (studentIds.length > 0) {
        // Query all application tables using count for better performance
        const [
          odPending,
          leavePending,
          bonafidePending,
          gatepassPending,
          odTotal,
          leaveTotal,
          bonafideTotal,
          gatepassTotal,
        ] = await Promise.all([
          // Pending applications - use count
          supabase
            .from("od_applications")
            .select("*", { count: "exact", head: true })
            .in("student_id", studentIds)
            .eq("status", "pending")
            .eq("current_approver_level", "ahod"),
          supabase
            .from("leave_applications")
            .select("*", { count: "exact", head: true })
            .in("student_id", studentIds)
            .eq("status", "pending")
            .eq("current_approver_level", "ahod"),
          supabase
            .from("bonafide_applications")
            .select("*", { count: "exact", head: true })
            .in("student_id", studentIds)
            .eq("status", "pending")
            .eq("current_approver_level", "ahod"),
          supabase
            .from("gatepass_applications")
            .select("*", { count: "exact", head: true })
            .in("student_id", studentIds)
            .eq("status", "pending")
            .eq("current_approver_level", "ahod"),
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
            .from("bonafide_applications")
            .select("*", { count: "exact", head: true })
            .in("student_id", studentIds),
          supabase
            .from("gatepass_applications")
            .select("*", { count: "exact", head: true })
            .in("student_id", studentIds),
        ]);

        const pending = {
          od: odPending.count || 0,
          leave: leavePending.count || 0,
          bonafide: bonafidePending.count || 0,
          gatepass: gatepassPending.count || 0,
        };

        const total = {
          od: odTotal.count || 0,
          leave: leaveTotal.count || 0,
          bonafide: bonafideTotal.count || 0,
          gatepass: gatepassTotal.count || 0,
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
        .eq("ahod_id", user?.id);

      const studentIds = students?.map((s) => s.id) || [];
      if (studentIds.length === 0) return;

      const [odApps, leaveApps, bonafideApps, gatepassApps] = await Promise.all(
        [
          supabase
            .from("od_applications")
            .select("id, status, updated_at")
            .in("student_id", studentIds)
            .order("updated_at", { ascending: false })
            .limit(3),
          supabase
            .from("leave_applications")
            .select("id, status, updated_at")
            .in("student_id", studentIds)
            .order("updated_at", { ascending: false })
            .limit(3),
          supabase
            .from("bonafide_applications")
            .select("id, status, updated_at")
            .in("student_id", studentIds)
            .order("updated_at", { ascending: false })
            .limit(3),
          supabase
            .from("gatepass_applications")
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
        ...(bonafideApps.data || []).map((app: any) => ({
          ...app,
          type: "Bonafide",
        })),
        ...(gatepassApps.data || []).map((app: any) => ({
          ...app,
          type: "Gatepass",
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

  const sidebarItems = [
    {
      label: "Dashboard",
      path: "/ahod-dashboard",
      icon: <Home className="h-5 w-5" />,
    },
    {
      label: "OD Applications",
      path: "/ahod/od",
      icon: <FileText className="h-5 w-5" />,
    },
    {
      label: "Leave Applications",
      path: "/ahod/leave",
      icon: <Calendar className="h-5 w-5" />,
    },
    {
      label: "Gatepass Applications",
      path: "/ahod/gatepass",
      icon: <CreditCard className="h-5 w-5" />,
    },
    {
      label: "Bonafide Applications",
      path: "/ahod/bonafide",
      icon: <Award className="h-5 w-5" />,
    },
    {
      label: "My Mentees",
      path: "/ahod/mentees",
      icon: <Users className="h-5 w-5" />,
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
      path: "/ahod/od",
    },
    {
      title: "Leave Applications",
      pending: pendingCounts.leave,
      total: totalCounts.leave,
      icon: <Calendar className="h-8 w-8 text-green-600" />,
      bgColor: "bg-green-50",
      borderColor: "border-green-200",
      path: "/ahod/leave",
    },
    {
      title: "Bonafide Applications",
      pending: pendingCounts.bonafide,
      total: totalCounts.bonafide,
      icon: <Award className="h-8 w-8 text-purple-600" />,
      bgColor: "bg-purple-50",
      borderColor: "border-purple-200",
      path: "/ahod/bonafide",
    },
    {
      title: "Gatepass Applications",
      pending: pendingCounts.gatepass,
      total: totalCounts.gatepass,
      icon: <CreditCard className="h-8 w-8 text-orange-600" />,
      bgColor: "bg-orange-50",
      borderColor: "border-orange-200",
      path: "/ahod/gatepass",
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
                AHOD Dashboard - Department Applications
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
                ⚠️ On Leave - Applications forwarded to HOD
              </p>
            </div>
          )}
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

            {/* Notifications Table - Right Side */}
            <div className="hidden md:block mt-4 sm:mt-6 bg-white rounded-xl shadow-lg border border-slate-200 p-3 sm:p-6 lg:max-w-md lg:ml-auto">
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
