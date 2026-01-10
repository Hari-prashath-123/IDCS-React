import { useEffect, useMemo, useState } from "react";
import DashboardLayout from "../components/DashboardLayout";
import { useAuth } from "../contexts/AuthContext";
import { supabase } from "../lib/supabase";

type UINotification = {
  id: string;
  message: string;
  created_at: string; // ISO string
};

export default function AllNotifications() {
  const { profile } = useAuth();
  const [items, setItems] = useState<UINotification[]>([]);
  const [loading, setLoading] = useState(true);
  const [readSet, setReadSet] = useState<Set<string>>(new Set());

  // LocalStorage helpers (fallback when table is missing)
  const storageKey = useMemo(
    () => (profile ? `notif_reads:${profile.id}` : "notif_reads:anon"),
    [profile?.id]
  );
  const loadLocalReads = () => {
    try {
      const raw = localStorage.getItem(storageKey);
      if (!raw) return new Set<string>();
      const arr = JSON.parse(raw) as string[];
      return new Set(arr);
    } catch {
      return new Set<string>();
    }
  };
  const saveLocalReads = (setVal: Set<string>) => {
    try {
      localStorage.setItem(storageKey, JSON.stringify(Array.from(setVal)));
    } catch {}
  };

  useEffect(() => {
    if (!profile) return;

    const fetchAll = async () => {
      setLoading(true);
      try {
        const results: UINotification[] = [];

        // 1) Global active notices
        const { data: notices } = await supabase
          .from("notices")
          .select("id, title, created_at")
          .eq("is_active", true)
          .order("created_at", { ascending: false })
          .limit(50);

        (notices || []).forEach((n: any) => {
          results.push({
            id: `notice-${n.id}`,
            message: `Notice: ${n.title}`,
            created_at: n.created_at,
          });
        });

        if (profile.role === "student") {
          // 2) Student applications - query all four tables
          const [odApps, leaveApps, gatepassApps, bonafideApps] =
            await Promise.all([
              supabase
                .from("od_applications")
                .select(
                  "id, status, updated_at, od_approvals(id, action, remarks, approver_role, created_at)"
                )
                .eq("student_id", profile.id)
                .order("updated_at", { ascending: false })
                .limit(30),
              supabase
                .from("leave_applications")
                .select(
                  "id, status, updated_at, leave_approvals(id, action, remarks, approver_role, created_at)"
                )
                .eq("student_id", profile.id)
                .order("updated_at", { ascending: false })
                .limit(30),
              supabase
                .from("gatepass_applications")
                .select(
                  "id, status, updated_at, gatepass_approvals(id, action, remarks, approver_role, created_at)"
                )
                .eq("student_id", profile.id)
                .order("updated_at", { ascending: false })
                .limit(30),
              supabase
                .from("bonafide_applications")
                .select(
                  "id, status, updated_at, bonafide_approvals(id, action, remarks, approver_role, created_at)"
                )
                .eq("student_id", profile.id)
                .order("updated_at", { ascending: false })
                .limit(30),
            ]);

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

          allApps.forEach((app: any) => {
            let msg = `Your ${String(
              app.type || ""
            ).toUpperCase()} application is ${app.status}`;
            const approvals = app.approvals || [];
            if (approvals.length > 0) {
              const latest = approvals.sort(
                (a: any, b: any) =>
                  new Date(b.created_at).getTime() -
                  new Date(a.created_at).getTime()
              )[0];
              if (latest)
                msg += ` (${String(latest.action || "").toUpperCase()} by ${
                  latest.approver_role
                }${latest.remarks ? `: ${latest.remarks}` : ""})`;
            }
            results.push({
              id: `app-${app.id}`,
              message: msg,
              created_at: app.updated_at,
            });
          });
        } else {
          // 3) Staff/AHOD/HOD/Admin related
          const { data: students } = await supabase
            .from("students")
            .select("id")
            .or(
              `mentor_id.eq.${profile.id},advisor_id.eq.${profile.id},ahod_id.eq.${profile.id},hod_id.eq.${profile.id}`
            )
            .limit(200);
          const ids = (students || []).map((s: any) => s.id);
          if (ids.length) {
            // Query all four application tables
            const [odApps, leaveApps, gatepassApps, bonafideApps] =
              await Promise.all([
                supabase
                  .from("od_applications")
                  .select(
                    "id, student_id, status, updated_at, od_approvals(id, action, remarks, approver_role, created_at)"
                  )
                  .in("student_id", ids)
                  .order("updated_at", { ascending: false })
                  .limit(50),
                supabase
                  .from("leave_applications")
                  .select(
                    "id, student_id, status, updated_at, leave_approvals(id, action, remarks, approver_role, created_at)"
                  )
                  .in("student_id", ids)
                  .order("updated_at", { ascending: false })
                  .limit(50),
                supabase
                  .from("gatepass_applications")
                  .select(
                    "id, student_id, status, updated_at, gatepass_approvals(id, action, remarks, approver_role, created_at)"
                  )
                  .in("student_id", ids)
                  .order("updated_at", { ascending: false })
                  .limit(50),
                supabase
                  .from("bonafide_applications")
                  .select(
                    "id, student_id, status, updated_at, bonafide_approvals(id, action, remarks, approver_role, created_at)"
                  )
                  .in("student_id", ids)
                  .order("updated_at", { ascending: false })
                  .limit(50),
              ]);

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

            allApps.forEach((app: any) => {
              let msg = `Student ${app.student_id} ${String(
                app.type || ""
              ).toUpperCase()} is ${app.status}`;
              const approvals = app.approvals || [];
              if (approvals.length > 0) {
                const latest = approvals.sort(
                  (a: any, b: any) =>
                    new Date(b.created_at).getTime() -
                    new Date(a.created_at).getTime()
                )[0];
                if (latest)
                  msg += ` (${String(latest.action || "").toUpperCase()} by ${
                    latest.approver_role
                  }${latest.remarks ? `: ${latest.remarks}` : ""})`;
              }
              results.push({
                id: `app-${app.id}`,
                message: msg,
                created_at: app.updated_at,
              });
            });
          }

          // Query all approval tables
          const [
            odApprovals,
            leaveApprovals,
            gatepassApprovals,
            bonafideApprovals,
          ] = await Promise.all([
            supabase
              .from("od_approvals")
              .select("id, action, remarks, approver_role, created_at")
              .eq("approver_id", profile.id)
              .order("created_at", { ascending: false })
              .limit(50),
            supabase
              .from("leave_approvals")
              .select("id, action, remarks, approver_role, created_at")
              .eq("approver_id", profile.id)
              .order("created_at", { ascending: false })
              .limit(50),
            supabase
              .from("gatepass_approvals")
              .select("id, action, remarks, approver_role, created_at")
              .eq("approver_id", profile.id)
              .order("created_at", { ascending: false })
              .limit(50),
            supabase
              .from("bonafide_approvals")
              .select("id, action, remarks, approver_role, created_at")
              .eq("approver_id", profile.id)
              .order("created_at", { ascending: false })
              .limit(50),
          ]);

          const allApprovals = [
            ...(odApprovals.data || []),
            ...(leaveApprovals.data || []),
            ...(gatepassApprovals.data || []),
            ...(bonafideApprovals.data || []),
          ];

          allApprovals.forEach((a: any) => {
            results.push({
              id: `apr-${a.id}`,
              message: `You ${a.action} an application (${a.approver_role})${
                a.remarks ? `: ${a.remarks}` : ""
              }`,
              created_at: a.created_at,
            });
          });
        }

        results.sort(
          (a, b) =>
            new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
        );

        // 4) Principal feedback notifications
        if (profile.role === 'principal') {
          try {
            // Feedback forms created by principal
            const { data: feedbackForms } = await supabase
              .from('feedback_forms')
              .select('id, title, created_at, active')
              .eq('created_by', profile.id)
              .order('created_at', { ascending: false })
              .limit(20);

            (feedbackForms || []).forEach((form: any) => {
              results.push({
                id: `feedback-form-${form.id}`,
                message: `Feedback form "${form.title}" ${form.active ? 'is active' : 'created'}`,
                created_at: form.created_at
              });
            });

            // New feedback responses for principal's forms
            const formIds = (feedbackForms || []).map((f: any) => f.id);
            if (formIds.length > 0) {
              const { data: responses } = await supabase
                .from('feedback_responses')
                .select('id, form_id, student_id, created_at, feedback_forms!inner(title)')
                .in('form_id', formIds)
                .order('created_at', { ascending: false })
                .limit(50);

              // Get student names for the responses
              const studentIds = [...new Set((responses || []).map((r: any) => r.student_id))];
              let studentNamesMap = new Map();
              if (studentIds.length > 0) {
                const { data: studentsData } = await supabase
                  .from('profiles')
                  .select('id, name')
                  .in('id', studentIds);
                studentNamesMap = new Map((studentsData || []).map((s: any) => [s.id, s.name]));
              }

              (responses || []).forEach((response: any) => {
                const studentName = studentNamesMap.get(response.student_id) || 'Unknown Student';
                const formTitle = (response.feedback_forms as any)?.title || 'Unknown Form';
                results.push({
                  id: `feedback-response-${response.id}`,
                  message: `New feedback response from ${studentName} for "${formTitle}"`,
                  created_at: response.created_at
                });
              });
            }
          } catch (error) {
            console.error('Error loading feedback notifications:', error);
          }
        }

        results.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
        setItems(results);
      } finally {
        setLoading(false);
      }
    };

    const loadReads = async () => {
      // Try Supabase table optional: notification_reads(user_id, notification_id, read_at)
      try {
        const { data, error } = await supabase
          .from("notification_reads")
          .select("notification_id")
          .eq("user_id", profile.id);
        if (error) throw error;
        const setFromDb = new Set(
          (data || []).map((r: any) => r.notification_id as string)
        );
        setReadSet(setFromDb);
      } catch {
        setReadSet(loadLocalReads());
      }
    };

    fetchAll();
    loadReads();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile?.id, profile?.role]);

  const markRead = async (id: string) => {
    if (!profile) return;
    if (readSet.has(id)) return;
    const next = new Set(readSet);
    next.add(id);
    setReadSet(next);
    saveLocalReads(next);
    try {
      await supabase
        .from("notification_reads")
        .upsert({
          user_id: profile.id,
          notification_id: id,
          read_at: new Date().toISOString(),
        });
    } catch {}
  };

  const markAllRead = async () => {
    if (!profile) return;
    const allIds = items.map((i) => i.id);
    const next = new Set(readSet);
    allIds.forEach((id) => next.add(id));
    setReadSet(next);
    saveLocalReads(next);
    try {
      const rows = allIds.map((id) => ({
        user_id: profile.id,
        notification_id: id,
        read_at: new Date().toISOString(),
      }));
      if (rows.length) await supabase.from("notification_reads").upsert(rows);
    } catch {}
  };

  const unreadCount = items.reduce(
    (acc, it) => acc + (readSet.has(it.id) ? 0 : 1),
    0
  );

  return (
    <DashboardLayout>
      <div className="max-w-4xl mx-auto">
        <div className="flex items-center justify-between mb-4">
          <h1 className="text-2xl font-bold text-slate-800">
            All Notifications
          </h1>
          <button
            onClick={markAllRead}
            disabled={unreadCount === 0}
            className="px-3 py-1.5 rounded-md text-sm font-medium border border-slate-300 text-slate-700 hover:bg-slate-50 disabled:opacity-50"
          >
            Mark all as read
          </button>
        </div>
        <p className="text-slate-600 mb-4">Unread: {unreadCount}</p>

        <div className="bg-white rounded-xl shadow-lg border border-slate-200 overflow-hidden">
          {loading ? (
            <div className="p-6 text-center text-slate-600">
              Loading notifications…
            </div>
          ) : items.length === 0 ? (
            <div className="p-6 text-center text-slate-600">
              No notifications
            </div>
          ) : (
            <ul className="divide-y divide-slate-200">
              {items.map((it) => {
                const isRead = readSet.has(it.id);
                return (
                  <li
                    key={it.id}
                    onClick={() => markRead(it.id)}
                    className={`p-4 cursor-pointer hover:bg-slate-50 ${
                      isRead ? "" : "bg-blue-50/40"
                    }`}
                  >
                    <div className="flex items-start gap-3">
                      <span
                        className={`mt-1 h-2 w-2 rounded-full ${
                          isRead ? "bg-slate-300" : "bg-blue-600"
                        }`}
                      />
                      <div className="flex-1 min-w-0">
                        <p
                          className={`text-sm ${
                            isRead
                              ? "text-slate-700"
                              : "text-slate-900 font-medium"
                          }`}
                        >
                          {it.message}
                        </p>
                        <p className="text-xs text-slate-500 mt-1">
                          {new Date(it.created_at).toLocaleString()}
                        </p>
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>
    </DashboardLayout>
  );
}
