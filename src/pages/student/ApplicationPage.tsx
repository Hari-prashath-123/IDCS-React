import { useState, useEffect, FormEvent } from "react";
import {
  FileText,
  Calendar,
  CreditCard,
  Award,
  Bell,
  Home,
  CheckCircle,
  XCircle,
  Clock,
  X,
} from "lucide-react";
import DashboardLayout from "../../components/DashboardLayout";
import Loader from "../../components/Loader";
import api from "../../lib/api";
import {
  ApplicationType,
  Student,
  Approval,
  getApplicationTableName,
  getApprovalsTableName,
} from "../../lib/supabase-types";
import { useAuth } from "../../contexts/AuthContext";

interface ApplicationPageProps {
  type: ApplicationType;
}

export default function ApplicationPage({ type }: ApplicationPageProps) {
  const { user } = useAuth();
  const [loading, setLoading] = useState(false);
  const [applications, setApplications] = useState<
    (any & { approvals: Approval[] })[]
  >([]);
  const [appsLoading, setAppsLoading] = useState<boolean>(true);
  const [gatepassLocked, setGatepassLocked] = useState(false);
  const [studentData, setStudentData] = useState<Student | null>(null);
  const [studentProfile, setStudentProfile] = useState<any>(null);
  const [mentorOnLeave, setMentorOnLeave] = useState(false);
  const [advisorOnLeave, setAdvisorOnLeave] = useState(false);
  const [hodOnLeave, setHodOnLeave] = useState(false);
  const [psOnLeave] = useState(false);
  const [mentorName, setMentorName] = useState<string>("");
  const [advisorName, setAdvisorName] = useState<string>("");
  const [ahodName, setAhodName] = useState<string>("");
  const [hodName, setHodName] = useState<string>("");
  const [showProofModal, setShowProofModal] = useState(false);
  const [currentProofUrl, setCurrentProofUrl] = useState<string | null>(null);
  const [showGatepassScanModal, setShowGatepassScanModal] = useState(false);
  const [, setGatepassScanUrl] = useState<string | null>(null);
  const [showStatusModal, setShowStatusModal] = useState(false);
  const [selectedApplication, setSelectedApplication] = useState<any>(null);

  // Prevent background scrolling when the gatepass scan modal is open
  useEffect(() => {
    if (typeof window === "undefined") return;
    const prev = document.body.style.overflow;
    if (showGatepassScanModal) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = prev || "";
    }
    return () => {
      document.body.style.overflow = prev || "";
    };
  }, [showGatepassScanModal]);

  // Listen for scan completion messages from the gatepass scan iframe
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!showGatepassScanModal) return;

    const handler = (e: MessageEvent) => {
      try {
        // only accept messages from same origin (the iframe is same-origin)
        if (e.origin !== window.location.origin) return;
      } catch (err) {
        // ignore
      }
      const d = e.data as any;
      if (d && d.type === "gatepass-scan-complete") {
        // Refresh applications so the OUT/IN times appear without manual refresh
        fetchApplications();
        // Close the modal (parent UI) and clear URL
        setShowGatepassScanModal(false);
        setGatepassScanUrl(null);
      }
    };

    window.addEventListener("message", handler);
    return () => window.removeEventListener("message", handler);
  }, [showGatepassScanModal]);

  // Mobile responsiveness helpers
  const [isMobile, setIsMobile] = useState(false);

  // Auto-populate current date/time for gatepass and bonafide
  const getCurrentDateTime = () => {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, "0");
    const day = String(now.getDate()).padStart(2, "0");
    const hours = String(now.getHours()).padStart(2, "0");
    const minutes = String(now.getMinutes()).padStart(2, "0");
    return `${year}-${month}-${day}T${hours}:${minutes}`;
  };

  const getCurrentDate = () => {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, "0");
    const day = String(now.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  };

  const [formData, setFormData] = useState({
    reason: "",
    fromDate: type === "gatepass" ? getCurrentDateTime() : "",
    toDate: type === "gatepass" ? getCurrentDateTime() : "",
    subject: "",
    purpose: "",
    otherPurpose: "",
    fathersName: "",
    branch: "",
    year: "",
    community: "",
    otherCommunity: "",
    date: type === "bonafide" ? getCurrentDate() : "",
    // Bonafide-specific fields
    studyMode: "day_scholar", // 'day_scholar' | 'hostel'
    busOption: "college", // 'college' | 'out'
    busFare: "",
    firstGraduate: "Yes", // 'Yes' | 'No'
    funding: "Gov", // 'Gov' | 'Management'
  });
  // Fields that are auto-prefilled from `students` or `profiles` should be locked
  // in the Bonafide form so users cannot accidentally change canonical data.
  const lockedFields = {
    fathersName: !!(
      (studentData as any)?.fathers_name ||
      (studentProfile as any)?.fathers_name ||
      (studentProfile as any)?.father_name
    ),
    community: !!(
      (studentData as any)?.community || (studentProfile as any)?.community
    ),
    year: !!studentData?.year,
    studyMode: !!(
      (studentData as any)?.residence || (studentProfile as any)?.residence
    ),
    busOption:
      (studentData as any)?.college_bus != null ||
      (studentProfile as any)?.college_bus != null,
    firstGraduate:
      (studentData as any)?.first_graduate != null ||
      (studentProfile as any)?.first_graduate != null,
    funding:
      (studentData as any)?.management != null ||
      (studentProfile as any)?.management != null,
  };

  // Determine whether the student is a hosteler (from profile or students table)
  const studentResidence =
    (studentProfile as any)?.residence || (studentData as any)?.residence || "";
  const isHosteler =
    String(studentResidence).toLowerCase().startsWith("hostel") ||
    formData.studyMode === "hostel";
  const [file, setFile] = useState<File | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  useState<string>("");

  // Gatepass QR scanning is handled via an external link/section after history

  // Detect viewport for responsive defaults
  useEffect(() => {
    if (typeof window === "undefined") return;
    const mql = window.matchMedia("(max-width: 768px)");
    const update = () => setIsMobile(mql.matches);
    update();
    mql.addEventListener("change", update);
    return () => mql.removeEventListener("change", update);
  }, []);

  // Collapse heavy sections by default on mobile (history no toggle; gatepass no toggle now)
  useEffect(() => {
    // No-op for now; kept to allow future responsive tweaks
  }, [isMobile]);

  useEffect(() => {
    if (user) {
      fetchApplications();
      fetchStudentData();
    }
  }, [user, type]);

  const fetchStudentData = async () => {
    try {
      const resp = await api.get('/students/me/');
      setStudentData(resp.data);
      // also load the profiles row for this student (profile may contain department and canonical names)
      try {
        const pResp = await api.get('/profiles/me/');
        setStudentProfile(pResp.data || null);
      } catch (e) {
        console.debug("Failed to load profile for student autofill", e);
      }

      // If this is the Bonafide form, prefill fields from profile first, then students
      const data = resp.data;
      const studentProfile = pResp?.data;
      if (type === "bonafide" && (data || studentProfile)) {
        const prefill: any = {};
        if (studentProfile?.department)
          prefill.branch = studentProfile.department;
        else if (data?.department) prefill.branch = data.department;
        if (studentProfile?.first_name || studentProfile?.last_name) {
        }
        if ((data as any).fathers_name)
          prefill.fathersName = (data as any).fathers_name;
        else if ((data as any).father_name)
          prefill.fathersName = (data as any).father_name;
        if (studentProfile?.community)
          prefill.community = studentProfile.community;
        else if ((data as any).community)
          prefill.community = (data as any).community;
        if (data?.year) {
          const mapY: any = { 1: "I", 2: "II", 3: "III", 4: "IV" };
          prefill.year = mapY[data.year] || String(data.year);
        }
        if ((studentProfile as any)?.residence) {
          const res = (studentProfile as any).residence as string;
          prefill.studyMode = res.toLowerCase().startsWith("hostel")
            ? "hostel"
            : "day_scholar";
        } else if ((data as any).residence) {
          const res = (data as any).residence as string;
          prefill.studyMode = res.toLowerCase().startsWith("hostel")
            ? "hostel"
            : "day_scholar";
        }
        if ((studentProfile as any)?.college_bus != null) {
          prefill.busOption = (studentProfile as any).college_bus
            ? "college"
            : "out";
        } else if ((data as any).college_bus != null) {
          prefill.busOption = (data as any).college_bus ? "college" : "out";
        }
        if ((studentProfile as any)?.first_graduate != null) {
          prefill.firstGraduate = (studentProfile as any).first_graduate
            ? "Yes"
            : "No";
        } else if ((data as any).first_graduate != null) {
          prefill.firstGraduate = (data as any).first_graduate ? "Yes" : "No";
        }
        setFormData((prev) => ({ ...prev, ...prefill }));
      }

      // Fetch staff names and leave status
      if (data?.mentor_id) {
        const mentorProfileResp = await api.get(`/profiles/${data.mentor_id}/`);
        setMentorName(mentorProfileResp.data?.name || "");
        const mentorStaffResp = await api.get(`/staff/${data.mentor_id}/`);
        setMentorOnLeave(mentorStaffResp.data?.on_leave || false);
      }
      if (data?.advisor_id) {
        const advisorProfileResp = await api.get(`/profiles/${data.advisor_id}/`);
        setAdvisorName(advisorProfileResp.data?.name || "");
      }
      if (data?.ahod_id) {
        const ahodProfileResp = await api.get(`/profiles/${data.ahod_id}/`);
        setAhodName(ahodProfileResp.data?.name || "");
      }
      if (data?.hod_id) {
        const hodProfileResp = await api.get(`/profiles/${data.hod_id}/`);
        setHodName(hodProfileResp.data?.name || "");
      }
    } catch (error) {
      console.error("Error fetching student data:", error);
    }
  };

  const fetchApplications = async () => {
    setAppsLoading(true);
    try {
      // Use the appropriate table name based on application type
      const tableName = getApplicationTableName(type);
      const approvalsTableName = getApprovalsTableName(type);

      // Parallel fetch: apps, approvals, and staff leave status in single batch
      const appsPromise = supabase
        .from(tableName)
        .select("*")
        .eq("student_id", user?.id)
        .order("created_at", { ascending: false });

      const approvalsPromise = supabase
        .from(approvalsTableName)
        .select("*")
        .order("created_at", { ascending: true });

      let mentorLeavePromise: any = null;
      let advisorLeavePromise: any = null;

      // Add staff leave queries only if needed
      if (studentData?.mentor_id) {
        mentorLeavePromise = supabase
          .from("staff")
          .select("on_leave")
          .eq("id", studentData.mentor_id)
          .maybeSingle();
      }
      if (studentData?.advisor_id) {
        advisorLeavePromise = supabase
          .from("staff")
          .select("on_leave")
          .eq("id", studentData.advisor_id)
          .maybeSingle();
      }

      // Execute all queries
      const [
        appsResult,
        approvalsResult,
        mentorLeaveResult,
        advisorLeaveResult,
      ] = await Promise.all([
        appsPromise,
        approvalsPromise,
        mentorLeavePromise || Promise.resolve(null),
        advisorLeavePromise || Promise.resolve(null),
      ]);

      // Update leave status
      if (mentorLeaveResult) {
        setMentorOnLeave(mentorLeaveResult.data?.on_leave || false);
      }
      if (advisorLeaveResult) {
        setAdvisorOnLeave(advisorLeaveResult.data?.on_leave || false);
      }

      const { data: apps, error: appsError } = appsResult;
      const { data: allApprovals } = approvalsResult;

      if (appsError) throw appsError;

      if (apps && apps.length > 0) {
        const appIds = apps.map((app: any) => app.id);

        const approvalsMap = new Map<string, any[]>();
        allApprovals?.forEach((approval: any) => {
          if (appIds.includes(approval.application_id)) {
            if (!approvalsMap.has(approval.application_id)) {
              approvalsMap.set(approval.application_id, []);
            }
            approvalsMap.get(approval.application_id)?.push(approval);
          }
        });

        const appsWithApprovals = apps.map((app: any) => ({
          ...app,
          approvals: approvalsMap.get(app.id) || [],
        }));

        setApplications(appsWithApprovals);

        // If this is a gatepass page, lock new applications when there
        // exists an approved gatepass with missing out_time or in_time,
        // or when there is any pending gatepass (prevent multiple pending apps).
        if (type === "gatepass") {
          const hasIncomplete = appsWithApprovals.some(
            (a: any) => a.status === "approved" && (!a.out_time || !a.in_time)
          );
          const hasPending = appsWithApprovals.some(
            (a: any) => a.status === "pending"
          );
          setGatepassLocked(!!(hasIncomplete || hasPending));
        }
      } else {
        setApplications([]);
        if (type === "gatepass") setGatepassLocked(false);
      }
    } catch (error) {
      console.error("Error fetching applications:", error);
    } finally {
      setAppsLoading(false);
    }
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    // Prevent submission if gatepass is locked (incomplete previous approved gatepass)
    if (type === "gatepass") {
      try {
        const tableName = getApplicationTableName(type);
        const { data: latestApproved, error: qErr } = await supabase
          .from(tableName)
          .select("id,out_time,in_time,status")
          .eq("student_id", user?.id)
          .eq("status", "approved")
          .order("created_at", { ascending: false })
          .limit(1);

        if (qErr) throw qErr;
        if (latestApproved && latestApproved.length > 0) {
          const la = latestApproved[0] as any;
          if (!la.out_time || !la.in_time) {
            alert(
              "You have an earlier approved gatepass which is not yet completed. Please scan OUT and IN for that pass before applying for a new gatepass."
            );
            return;
          }
        }
      } catch (err) {
        console.error("Error checking previous gatepass status:", err);
        const proceed = confirm(
          "Could not verify previous gatepass status due to a network error. Proceed with submission?"
        );
        if (!proceed) return;
      }
    }
    setLoading(true);

    // Client-side validation for OD and Leave dates (from/to)
    if (type === "od" || type === "leave") {
      if (!formData.fromDate || !formData.toDate) {
        alert("Please select both From and To dates.");
        setLoading(false);
        return;
      }
      const f = new Date(formData.fromDate);
      const t = new Date(formData.toDate);
      if (isNaN(f.getTime()) || isNaN(t.getTime())) {
        alert("Invalid date selection.");
        setLoading(false);
        return;
      }
      if (f > t) {
        alert("From date must be before or equal to To date.");
        setLoading(false);
        return;
      }
    }

    try {
      // Upload file if provided (optional)
      let attachmentUrl: string | null = null;
      if (file) {
        if (file.size > 10 * 1024 * 1024) {
          setFileError("File too large (max 10 MB)");
          alert("File too large. Maximum size is 10 MB.");
          setLoading(false);
          return;
        }
        const ext = file.name.split(".").pop()?.toLowerCase() || "bin";
        const path = `${user?.id}/${type}/${Date.now()}-${Math.random()
          .toString(36)
          .slice(2)}.${ext}`;
        const { error: uploadErr } = await supabase.storage
          .from("od-proofs")
          .upload(path, file, {
            contentType: file.type || "application/octet-stream",
            upsert: false,
          });
        if (uploadErr) {
          if (String(uploadErr.message).toLowerCase().includes("bucket")) {
            const msg =
              'Storage bucket "od-proofs" not found. Please create the bucket in Supabase or run `npm run ensure-od-bucket` from the project root.';
            console.error(msg, uploadErr);
            alert(msg);
            setLoading(false);
            return;
          }
          throw uploadErr;
        }
        const { data: pub } = supabase.storage
          .from("od-proofs")
          .getPublicUrl(path);
        const supabaseBase = import.meta.env.VITE_SUPABASE_URL || "";
        const fallback = supabaseBase
          ? `${supabaseBase.replace(
              /\/$/,
              ""
            )}/storage/v1/object/public/od-proofs/${encodeURIComponent(path)}`
          : null;
        attachmentUrl =
          pub && (pub as any).publicUrl ? (pub as any).publicUrl : fallback;
      }

      // Determine initial approver level with fallbacks based on leaves and type
      // Compute leave flags first (use local vars for decision; still update UI state)
      let initialApproverLevel = type === "gatepass" ? "advisor" : "mentor";
      let mentorLeave = false;
      let advisorLeave = false;
      let hodLeave = false;

      // Fetch leave flags for mentor/advisor/ahod/hod as available
      if (studentData?.mentor_id) {
        const { data: mentorStaff } = await supabase
          .from("staff")
          .select("on_leave")
          .eq("id", studentData.mentor_id)
          .maybeSingle();
        mentorLeave = !!mentorStaff?.on_leave;
        setMentorOnLeave(mentorLeave);
      }

      if (studentData?.advisor_id) {
        const { data: advisorStaff } = await supabase
          .from("staff")
          .select("on_leave")
          .eq("id", studentData.advisor_id)
          .maybeSingle();
        advisorLeave = !!advisorStaff?.on_leave;
        setAdvisorOnLeave(advisorLeave);
      }

      if (studentData?.hod_id) {
        const { data: hodStaff } = await supabase
          .from("staff")
          .select("on_leave")
          .eq("id", studentData.hod_id)
          .maybeSingle();
        hodLeave = !!hodStaff?.on_leave;
        setHodOnLeave(hodLeave);
      }

      // Decide initial approver deterministically for gatepass
      if (type === "gatepass") {
        // Preferred: advisor (if present and not on leave)
        if (studentData?.advisor_id && !advisorLeave) {
          initialApproverLevel = "advisor";
        } else {
          // Advisor missing or on leave -> prefer HOD if present and not on leave
          if (studentData?.hod_id && !hodLeave) {
            initialApproverLevel = "hod";
          } else if (studentData?.ahod_id) {
            // If HOD is on leave (or missing) and AHOD exists -> route to HOD level
            // (DB gatepass constraints do not allow 'ahod' as a current_approver_level).
            // AHOD will act on behalf of HOD when the frontend detects HOD is on leave.
            initialApproverLevel = "hod";
          } else if (studentData?.hod_id) {
            // HOD exists but is on leave and no AHOD -> still route to HOD as fallback
            initialApproverLevel = "hod";
          } else {
            // Fallback: advisor (even if missing) to preserve older behavior
            initialApproverLevel = "advisor";
          }
        }
      } else {
        // Non-gatepass types keep existing logic
        if (mentorLeave) initialApproverLevel = "advisor";
      }

      // Prepare fields for insert (bonafide uses single date)
      let reasonText = formData.reason;
      let insertFromDate = formData.fromDate;
      let insertToDate = formData.toDate;

      if (type === "bonafide") {
        const p =
          formData.purpose === "Other" && formData.otherPurpose
            ? `${formData.purpose}: ${formData.otherPurpose}`
            : formData.purpose || "Bonafide";
        // Summarize selections lightly into reason text
        const study =
          formData.studyMode === "hostel" ? "Hostel" : "Day Scholar";
        const bus =
          formData.studyMode === "day_scholar"
            ? formData.busOption === "college"
              ? `, College Bus${
                  formData.busFare ? ` (Fare: ${formData.busFare})` : ""
                }`
              : ", Out Bus"
            : "";
        // Funding comes before First Graduate now. If Management, hide FG and just mention Management.
        const fg =
          formData.funding === "Management"
            ? ", Management"
            : formData.firstGraduate === "Yes"
            ? ", First Graduate (Gov)"
            : ", Not First Graduate";
        reasonText = `Bonafide - ${p} | ${study}${bus}${fg}`;

        const d = formData.date || new Date().toISOString().slice(0, 10);
        insertFromDate = d;
        insertToDate = d;
      } else if (type === "gatepass") {
        // Gatepass uses the subject field as the reason text for display
        reasonText = formData.subject || "Gatepass";

        // Convert datetime-local to proper timestamptz with local timezone
        // datetime-local gives "YYYY-MM-DDTHH:mm" which is in user's local time
        // We need to convert it to ISO string with timezone info
        if (formData.fromDate) {
          const localDateTime = new Date(formData.fromDate);
          // Get timezone offset in minutes and convert to hours:minutes format
          const tzOffset = -localDateTime.getTimezoneOffset();
          const offsetHours = Math.floor(Math.abs(tzOffset) / 60);
          const offsetMinutes = Math.abs(tzOffset) % 60;
          const offsetSign = tzOffset >= 0 ? "+" : "-";
          const offsetString = `${offsetSign}${String(offsetHours).padStart(
            2,
            "0"
          )}:${String(offsetMinutes).padStart(2, "0")}`;

          // Format as YYYY-MM-DD HH:mm:ss+TZ
          insertFromDate = `${formData.fromDate.replace(
            "T",
            " "
          )}:00${offsetString}`;
        }
        if (formData.toDate) {
          const localDateTime = new Date(formData.toDate);
          const tzOffset = -localDateTime.getTimezoneOffset();
          const offsetHours = Math.floor(Math.abs(tzOffset) / 60);
          const offsetMinutes = Math.abs(tzOffset) % 60;
          const offsetSign = tzOffset >= 0 ? "+" : "-";
          const offsetString = `${offsetSign}${String(offsetHours).padStart(
            2,
            "0"
          )}:${String(offsetMinutes).padStart(2, "0")}`;

          insertToDate = `${formData.toDate.replace(
            "T",
            " "
          )}:00${offsetString}`;
        }

        // For gatepass, if the student is a day scholar we do not show a separate
        // To Date/Time input. Ensure insertToDate is set to fromDate in that case
        // so the applications table (which requires to_date) receives a valid value.
        if (!isHosteler) {
          insertToDate = insertFromDate || insertToDate;
        }
      } else if (type === "od" || type === "leave") {
        const today = new Date().toISOString().slice(0, 10);
        // For both OD and Leave, prefer selected dates from the form; fallback to today
        insertFromDate = formData.fromDate || today;
        insertToDate = formData.toDate || today;
      }

      // Ensure dates are set (fallback for any missing dates)
      if (!insertFromDate || !insertToDate) {
        const today = new Date().toISOString().slice(0, 10);
        insertFromDate = insertFromDate || today;
        insertToDate = insertToDate || today;
      }

      // Ensure we're inserting as the currently authenticated user (RLS check)
      const { data: sessionData, error: sessionError } =
        await supabase.auth.getSession();

      console.log("=== DEBUG: Full session data ===", {
        sessionData,
        sessionError,
        hasSession: !!sessionData?.session,
        hasUser: !!sessionData?.session?.user,
      });

      const authUserId = sessionData?.session?.user?.id || null;
      const authEmail = sessionData?.session?.user?.email || null;

      console.log("=== DEBUG: Auth check ===", {
        authUserId,
        authEmail,
        contextUserId: user?.id,
        contextEmail: user?.email,
        studentDataId: studentData?.id,
        studentRegNo: studentData?.reg_no,
        areEqual: authUserId === user?.id,
        sessionExpiry: sessionData?.session?.expires_at,
      });

      if (!authUserId) {
        console.error("❌ No auth user ID found in session");
        alert("You are not signed in. Please sign in and try again.");
        return;
      }

      if (!user?.id) {
        console.error("❌ No user in context");
        alert(
          "User profile not loaded. Please refresh the page and try again."
        );
        return;
      }

      if (authUserId !== user.id) {
        console.error("❌ Session mismatch!", {
          authUserId,
          contextUserId: user.id,
        });
        alert(
          `Session mismatch detected. Please sign out and sign back in.\nAuth ID: ${authUserId}\nProfile ID: ${user.id}`
        );
        return;
      }

      // Verify student record exists
      if (!studentData) {
        console.error("❌ No student data found");
        alert("Student record not found. Please contact an administrator.");
        return;
      }

      console.log("✅ All pre-checks passed. Proceeding with insert...");

      // Build comprehensive insert payload with all form fields
      // NOTE: 'type' field is NOT included because each table is specific to a type
      const insertPayload: any = {
        student_id: authUserId,
        reason: reasonText,
        from_date: insertFromDate,
        to_date: insertToDate,
        attachment_url: attachmentUrl,
        status: "pending",
        current_approver_level: initialApproverLevel,
      };

      // Add subject and body for OD and Leave only (not gatepass, not bonafide)
      if (type === "od" || type === "leave") {
        insertPayload.subject = formData.subject || null;
        insertPayload.body = formData.reason || null;
      }

      // Add bonafide-specific fields
      if (type === "bonafide") {
        insertPayload.purpose =
          formData.purpose === "Other" && formData.otherPurpose
            ? `${formData.purpose}: ${formData.otherPurpose}`
            : formData.purpose || null;
        insertPayload.fathers_name = formData.fathersName || null;
        insertPayload.branch =
          formData.branch ||
          (studentProfile as any)?.department ||
          (studentData as any)?.department ||
          null;
        insertPayload.community =
          formData.community === "Others" && formData.otherCommunity
            ? `${formData.community}: ${formData.otherCommunity}`
            : formData.community || null;
        insertPayload.study_mode = formData.studyMode || null;
        insertPayload.bus_option =
          formData.studyMode === "day_scholar"
            ? formData.busOption || null
            : null;
        insertPayload.bus_fare =
          formData.studyMode === "day_scholar" &&
          formData.busOption === "college"
            ? formData.busFare
              ? parseFloat(formData.busFare)
              : null
            : null;
        insertPayload.funding = formData.funding || null;
        insertPayload.first_graduate =
          formData.funding === "Gov" ? formData.firstGraduate || null : null;

        // Store additional data in metadata JSONB
        const metadata: any = {};
        if (formData.purpose === "Other" && formData.otherPurpose) {
          metadata.other_purpose = formData.otherPurpose;
        }
        if (formData.community === "Others" && formData.otherCommunity) {
          metadata.other_community = formData.otherCommunity;
        }
        if (formData.year) {
          metadata.year = formData.year;
        }
        insertPayload.metadata = metadata;
      }

      // Debug: log complete payload
      console.log(
        "=== DEBUG: Application payload ===",
        JSON.stringify(insertPayload, null, 2)
      );

      // Final verification before insert
      console.log("=== DEBUG: Final verification ===", {
        payload_student_id: insertPayload.student_id,
        auth_uid_from_session: authUserId,
        match: insertPayload.student_id === authUserId,
      });

      // Use the appropriate table name based on application type
      const tableName = getApplicationTableName(type);
      console.log(`🚀 Attempting insert to ${tableName} table...`);

      const { data: insertedData, error } = await supabase
        .from(tableName)
        .insert(insertPayload)
        .select();

      if (error) {
        // Helpful guidance for common RLS failure
        console.error("=== DEBUG: Insert failed ===", {
          error,
          message: error.message,
          details: error.details,
          hint: error.hint,
          code: error.code,
        });
        if (
          String(error.message || "")
            .toLowerCase()
            .includes("row-level") ||
          String(error.details || "")
            .toLowerCase()
            .includes("row-level")
        ) {
          alert(
            "Failed to submit application due to row-level security. Make sure you are signed in as the same student account you are submitting for. If the problem persists, check that your Supabase session is active."
          );
        } else {
          alert("Failed to submit application. Please try again.");
        }
        throw error;
      }

      console.log("=== DEBUG: Insert succeeded ===", insertedData);
      console.log("=== DEBUG: Insert succeeded ===", insertedData);

      // If the DB inserted row ended up with a different approver level than we intended,
      // enforce the chosen initial approver to ensure AHOD receives gatepass when both
      // advisor and HOD are on leave.
      try {
        const insertedRow = Array.isArray(insertedData)
          ? insertedData[0]
          : insertedData;
        if (
          insertedRow &&
          insertedRow.current_approver_level !== initialApproverLevel
        ) {
          console.warn(
            "Inserted current_approver_level differs from chosen initialApproverLevel — enforcing chosen level",
            {
              dbLevel: insertedRow.current_approver_level,
              chosen: initialApproverLevel,
              appId: insertedRow.id,
            }
          );
          const { error: fixErr } = await supabase
            .from(tableName)
            .update({
              current_approver_level: initialApproverLevel,
              updated_at: new Date().toISOString(),
            })
            .eq("id", insertedRow.id);
          if (fixErr)
            console.error(
              "Failed to enforce initial approver level after insert:",
              fixErr
            );
          else
            console.log(
              "Enforced initial approver level to",
              initialApproverLevel
            );
        }
      } catch (err) {
        console.error("Error while enforcing initial approver level:", err);
      }

      // Show appropriate message based on who is on leave
      if (mentorOnLeave && advisorOnLeave && hodOnLeave) {
        alert(
          "Application submitted successfully!\n(Note: Your mentor, advisor, and HOD are on leave. Application sent to PS)"
        );
      } else if (mentorOnLeave && advisorOnLeave) {
        alert(
          "Application submitted successfully!\n(Note: Your mentor and advisor are on leave. Application sent to HOD)"
        );
      } else if (mentorOnLeave) {
        alert(
          "Application submitted successfully!\n(Note: Your mentor is on leave. Application sent to advisor)"
        );
      } else {
        alert("Application submitted successfully!");
      }

      setFormData({
        reason: "",
        fromDate: "",
        toDate: "",
        subject: "",
        purpose: "",
        otherPurpose: "",
        fathersName: "",
        branch: "",
        year: "",
        community: "",
        otherCommunity: "",
        date: "",
        studyMode: "day_scholar",
        busOption: "college",
        busFare: "",
        firstGraduate: "Yes",
        funding: "Gov",
      });
      setFile(null);
      setFileError(null);
      fetchApplications();
    } catch (error) {
      console.error("Error submitting application:", error);
      alert("Failed to submit application. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  // No inline QR simulation; see Gatepass QR section after Application History

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
      label: "Notifications",
      path: "/student/notifications",
      icon: <Bell className="h-5 w-5" />,
    },
  ];

  const getApprovalStatus = (
    app: any & { approvals: Approval[] },
    level: string
  ) => {
    // If mentor is on leave and this is the mentor column, show "Leave" badge
    if (
      level === "mentor" &&
      mentorOnLeave &&
      !app.approvals.find((a: any) => a.approver_role === "mentor")
    ) {
      return (
        <span className="inline-block px-2 py-1 rounded-full text-xs font-medium bg-orange-100 text-orange-700">
          Leave
        </span>
      );
    }

    // If advisor is on leave and this is the advisor column, show "Leave" badge
    if (
      level === "advisor" &&
      advisorOnLeave &&
      !app.approvals.find((a: any) => a.approver_role === "advisor")
    ) {
      return (
        <span className="inline-block px-2 py-1 rounded-full text-xs font-medium bg-orange-100 text-orange-700">
          Leave
        </span>
      );
    }

    // If PS is on leave and this is the PS column, show "Leave" badge
    if (
      level === "ps" &&
      psOnLeave &&
      !app.approvals.find((a: any) => a.approver_role === "ps")
    ) {
      return (
        <span className="inline-block px-2 py-1 rounded-full text-xs font-medium bg-orange-100 text-orange-700">
          Leave
        </span>
      );
    }

    const approval = app.approvals.find((a: any) => a.approver_role === level);
    if (!approval) {
      return app.current_approver_level === level ? (
        <Clock className="h-5 w-5 text-yellow-500" />
      ) : (
        <span className="text-slate-400">-</span>
      );
    }
    return approval.action === "approved" ? (
      <CheckCircle className="h-5 w-5 text-green-500" />
    ) : (
      <XCircle className="h-5 w-5 text-red-500" />
    );
  };

  const typeConfig = {
    od: { title: "On Duty", icon: <FileText className="h-8 w-8" /> },
    leave: { title: "Leave", icon: <Calendar className="h-8 w-8" /> },
    gatepass: { title: "Gatepass", icon: <CreditCard className="h-8 w-8" /> },
    bonafide: { title: "Bonafide", icon: <Award className="h-8 w-8" /> },
  };

  const visibleLevels =
    type === "gatepass"
      ? ["advisor", "hod"]
      : type === "bonafide"
      ? ["mentor", "advisor", "hod", "ps"]
      : ["mentor", "advisor", "ahod", "hod"];

  const levelLabels: Record<string, string> = {
    mentor: "Mentor",
    advisor: "Advisor",
    ahod: "AHOD",
    hod: "HOD",
    ps: "PS",
  };

  return (
    <DashboardLayout sidebarItems={sidebarItems}>
      <div className="max-w-7xl mx-auto">
        <div className="mb-8">
          <div className="flex items-center space-x-4">
            <div className="bg-blue-100 rounded-lg p-3 text-blue-600">
              {typeConfig[type].icon}
            </div>
            <div>
              <h1 className="text-3xl font-bold text-slate-800">
                {typeConfig[type].title} Application
              </h1>
              <p className="text-slate-600 mt-1">
                Apply for {type} and track your applications
              </p>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-xl shadow-lg border border-slate-200 p-6 mb-8">
          <h2 className="text-xl font-bold text-slate-800 mb-6">
            Apply for {typeConfig[type].title}
          </h2>

          {/* Staff names display based on application type */}
          {(type === "od" || type === "leave") && (
            <div className="mb-6 p-4 bg-blue-50 border border-blue-200 rounded-lg">
              <h3 className="text-sm font-semibold text-slate-700 mb-3">
                Application Flow:
              </h3>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
                <div>
                  <p className="text-xs text-slate-500">Mentor</p>
                  <p className="font-medium text-slate-800">
                    {mentorName || "Loading..."}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-slate-500">Advisor</p>
                  <p className="font-medium text-slate-800">
                    {advisorName || "Loading..."}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-slate-500">AHOD</p>
                  <p className="font-medium text-slate-800">
                    {ahodName || "Loading..."}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-slate-500">HOD</p>
                  <p className="font-medium text-slate-800">
                    {hodName || "Loading..."}
                  </p>
                </div>
              </div>
            </div>
          )}

          {(type === "bonafide" || type === "gatepass") && (
            <div className="mb-6 p-4 bg-blue-50 border border-blue-200 rounded-lg">
              <h3 className="text-sm font-semibold text-slate-700 mb-3">
                Application Flow:
              </h3>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-3 text-sm">
                <div>
                  <p className="text-xs text-slate-500">Mentor</p>
                  <p className="font-medium text-slate-800">
                    {mentorName || "Loading..."}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-slate-500">Advisor</p>
                  <p className="font-medium text-slate-800">
                    {advisorName || "Loading..."}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-slate-500">HOD</p>
                  <p className="font-medium text-slate-800">
                    {hodName || "Loading..."}
                  </p>
                </div>
              </div>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-6">
            {type !== "bonafide" && (
              <>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">
                    {type === "gatepass" ? "Reason" : "Subject"}
                  </label>
                  <input
                    type="text"
                    value={formData.subject || ""}
                    onChange={(e) =>
                      setFormData({ ...formData, subject: e.target.value })
                    }
                    required
                    className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    placeholder={
                      type === "gatepass"
                        ? "Enter reason for gatepass..."
                        : "Enter subject for application..."
                    }
                  />
                </div>

                {type !== "gatepass" && (
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-2">
                      Body
                    </label>
                    <textarea
                      value={formData.reason}
                      onChange={(e) =>
                        setFormData({ ...formData, reason: e.target.value })
                      }
                      required
                      rows={4}
                      className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      placeholder={`Enter body for ${type}...`}
                    />
                  </div>
                )}
              </>
            )}

            {(type === "od" || type === "leave") && (
              <>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-2">
                      From Date
                    </label>
                    <input
                      type="date"
                      value={formData.fromDate}
                      onChange={(e) =>
                        setFormData({ ...formData, fromDate: e.target.value })
                      }
                      required
                      className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-2">
                      To Date
                    </label>
                    <input
                      type="date"
                      value={formData.toDate}
                      onChange={(e) =>
                        setFormData({ ...formData, toDate: e.target.value })
                      }
                      required
                      className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    />
                  </div>
                </div>

                <div className="mt-4">
                  <label className="block text-sm font-medium text-slate-700 mb-2">
                    Upload Proof (PDF/Image) (Optional)
                  </label>
                  <input
                    type="file"
                    accept="application/pdf,image/*"
                    onChange={(e) => {
                      setFileError(null);
                      const f = e.target.files?.[0] || null;
                      setFile(f);
                    }}
                    className="block w-full text-sm text-slate-700 file:mr-4 file:py-2 file:px-4 file:rounded-md file:border-0 file:text-sm file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100"
                  />
                  <p className="mt-1 text-xs text-slate-500">
                    Max size 10 MB. Accepted: PDF, JPG, PNG.
                  </p>
                  {file && (
                    <p className="mt-1 text-sm text-slate-600">
                      Selected: {file.name}
                    </p>
                  )}
                  {fileError && (
                    <p className="mt-1 text-sm text-red-600">{fileError}</p>
                  )}
                </div>
              </>
            )}

            {type === "gatepass" && (
              <>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-2">
                      From Date & Time (Auto-detected)
                    </label>
                    <input
                      type="datetime-local"
                      value={formData.fromDate}
                      readOnly
                      required
                      className="w-full px-4 py-2 border border-slate-200 rounded-lg bg-slate-50 text-slate-700 cursor-not-allowed"
                    />
                    <p className="mt-1 text-xs text-slate-500">
                      System date and time is automatically used
                    </p>
                  </div>

                  {isHosteler && (
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-2">
                        To Date & Time (Auto-detected)
                      </label>
                      <input
                        type="datetime-local"
                        value={formData.toDate}
                        readOnly
                        required={isHosteler}
                        className="w-full px-4 py-2 border border-slate-200 rounded-lg bg-slate-50 text-slate-700 cursor-not-allowed"
                      />
                      <p className="mt-1 text-xs text-slate-500">
                        Date is auto-detected, you can adjust the time
                      </p>
                    </div>
                  )}
                </div>

                {/* QR scanner moved to a separate section after Application History */}
              </>
            )}

            {type === "bonafide" && (
              <>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-2">
                      Purpose (Subject)
                    </label>
                    <select
                      value={formData.purpose || ""}
                      onChange={(e) =>
                        setFormData({ ...formData, purpose: e.target.value })
                      }
                      required
                      className="w-full px-4 py-2 border border-slate-300 rounded-lg"
                    >
                      <option value="">Select Purpose</option>
                      <option>Bank Loan</option>
                      <option>Fee Structure</option>
                      <option>Scholarship</option>
                      <option>Passport</option>
                      <option>Bus Pass</option>
                      <option>Train Pass</option>
                      <option>Bonafide</option>
                      <option>Other</option>
                    </select>
                    {formData.purpose === "Other" && (
                      <input
                        type="text"
                        value={formData.otherPurpose || ""}
                        onChange={(e) =>
                          setFormData({
                            ...formData,
                            otherPurpose: e.target.value,
                          })
                        }
                        placeholder="Specify other purpose"
                        className="w-full px-4 py-2 border border-slate-300 rounded-lg mt-2"
                      />
                    )}
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-2">
                      Father’s Name
                    </label>
                    <input
                      type="text"
                      value={formData.fathersName || ""}
                      onChange={(e) =>
                        !lockedFields.fathersName &&
                        setFormData({
                          ...formData,
                          fathersName: e.target.value,
                        })
                      }
                      required
                      readOnly={!!lockedFields.fathersName}
                      className={`w-full px-4 py-2 border border-slate-300 rounded-lg ${
                        lockedFields.fathersName
                          ? "bg-slate-50 text-slate-700"
                          : ""
                      }`}
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-2">
                      Branch
                    </label>
                    <input
                      type="text"
                      value={
                        formData.branch ||
                        (studentData as any)?.department ||
                        ""
                      }
                      readOnly
                      className="w-full px-4 py-2 border border-slate-200 rounded-lg bg-slate-50 text-slate-700"
                      placeholder="Branch (set from your student record)"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-2">
                      Year
                    </label>
                    <select
                      value={formData.year || ""}
                      onChange={(e) =>
                        !lockedFields.year &&
                        setFormData({ ...formData, year: e.target.value })
                      }
                      required
                      disabled={!!lockedFields.year}
                      className={`w-full px-4 py-2 border border-slate-300 rounded-lg ${
                        lockedFields.year ? "bg-slate-50 text-slate-700" : ""
                      }`}
                    >
                      <option value="">Select Year</option>
                      <option>I</option>
                      <option>II</option>
                      <option>III</option>
                      <option>IV</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-2">
                      Community
                    </label>
                    <select
                      value={formData.community || ""}
                      onChange={(e) =>
                        !lockedFields.community &&
                        setFormData({ ...formData, community: e.target.value })
                      }
                      disabled={!!lockedFields.community}
                      required
                      className={`w-full px-4 py-2 border border-slate-300 rounded-lg ${
                        lockedFields.community
                          ? "bg-slate-50 text-slate-700"
                          : ""
                      }`}
                    >
                      <option value="">Select Community</option>
                      <option>OC</option>
                      <option>BC</option>
                      <option>MBC</option>
                      <option>SC</option>
                      <option>ST</option>
                      <option>Others</option>
                    </select>
                    {formData.community === "Others" && (
                      <input
                        type="text"
                        value={formData.otherCommunity || ""}
                        onChange={(e) =>
                          setFormData({
                            ...formData,
                            otherCommunity: e.target.value,
                          })
                        }
                        placeholder="Specify other community"
                        className="w-full px-4 py-2 border border-slate-300 rounded-lg mt-2"
                      />
                    )}
                  </div>
                </div>

                {/* Day Scholar / Hostel and related options (after Community) */}
                <div className="space-y-6">
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-2">
                      Day Scholar / Hostel
                    </label>
                    <div className="flex items-center gap-6">
                      <label className="inline-flex items-center gap-2">
                        <input
                          type="radio"
                          name="studyMode"
                          value="day_scholar"
                          checked={formData.studyMode === "day_scholar"}
                          onChange={(e) =>
                            !lockedFields.studyMode &&
                            setFormData({
                              ...formData,
                              studyMode: e.target.value as
                                | "day_scholar"
                                | "hostel",
                            })
                          }
                          disabled={!!lockedFields.studyMode}
                        />
                        <span>Day Scholar</span>
                      </label>
                      <label className="inline-flex items-center gap-2">
                        <input
                          type="radio"
                          name="studyMode"
                          value="hostel"
                          checked={formData.studyMode === "hostel"}
                          onChange={(e) =>
                            !lockedFields.studyMode &&
                            setFormData({
                              ...formData,
                              studyMode: e.target.value as
                                | "day_scholar"
                                | "hostel",
                            })
                          }
                          disabled={!!lockedFields.studyMode}
                        />
                        <span>Hostel</span>
                      </label>
                    </div>
                  </div>

                  {formData.studyMode === "day_scholar" && (
                    <>
                      <div>
                        <label className="block text-sm font-medium text-slate-700 mb-2">
                          College Bus / Out Bus
                        </label>
                        <div className="flex items-center gap-6">
                          <label className="inline-flex items-center gap-2">
                            <input
                              type="radio"
                              name="busOption"
                              value="college"
                              checked={formData.busOption === "college"}
                              onChange={(e) =>
                                !lockedFields.busOption &&
                                setFormData({
                                  ...formData,
                                  busOption: e.target.value as
                                    | "college"
                                    | "out",
                                })
                              }
                              disabled={!!lockedFields.busOption}
                            />
                            <span>College Bus</span>
                          </label>
                          <label className="inline-flex items-center gap-2">
                            <input
                              type="radio"
                              name="busOption"
                              value="out"
                              checked={formData.busOption === "out"}
                              onChange={(e) =>
                                !lockedFields.busOption &&
                                setFormData({
                                  ...formData,
                                  busOption: e.target.value as
                                    | "college"
                                    | "out",
                                  busFare: "",
                                })
                              }
                              disabled={!!lockedFields.busOption}
                            />
                            <span>Out Bus</span>
                          </label>
                        </div>
                      </div>

                      {formData.busOption === "college" && (
                        <div>
                          <label className="block text-sm font-medium text-slate-700 mb-2">
                            Bus Fare
                          </label>
                          <input
                            type="number"
                            inputMode="numeric"
                            min="0"
                            step="1"
                            value={formData.busFare}
                            onChange={(e) =>
                              !lockedFields.busOption &&
                              setFormData({
                                ...formData,
                                busFare: e.target.value,
                              })
                            }
                            readOnly={!!lockedFields.busOption}
                            className={`${
                              lockedFields.busOption
                                ? "bg-slate-50 text-slate-700"
                                : ""
                            } w-full px-4 py-2 border border-slate-300 rounded-lg`}
                            placeholder="Enter bus fare"
                          />
                        </div>
                      )}
                    </>
                  )}

                  {/* Gov / Management first */}
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-2">
                      Gov / Management
                    </label>
                    <div className="flex items-center gap-6">
                      <label className="inline-flex items-center gap-2">
                        <input
                          type="radio"
                          name="funding"
                          value="Gov"
                          checked={formData.funding === "Gov"}
                          onChange={(e) =>
                            !lockedFields.funding &&
                            setFormData({
                              ...formData,
                              funding: e.target.value as "Gov" | "Management",
                            })
                          }
                          disabled={!!lockedFields.funding}
                        />
                        <span>Gov</span>
                      </label>
                      <label className="inline-flex items-center gap-2">
                        <input
                          type="radio"
                          name="funding"
                          value="Management"
                          checked={formData.funding === "Management"}
                          onChange={(e) =>
                            !lockedFields.funding &&
                            setFormData({
                              ...formData,
                              funding: e.target.value as "Gov" | "Management",
                            })
                          }
                          disabled={!!lockedFields.funding}
                        />
                        <span>Management</span>
                      </label>
                    </div>
                  </div>

                  {/* Then First Graduate (hidden when Management) */}
                  {formData.funding === "Gov" && (
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-2">
                        First Graduate
                      </label>
                      <div className="flex items-center gap-6">
                        <label className="inline-flex items-center gap-2">
                          <input
                            type="radio"
                            name="firstGraduate"
                            value="Yes"
                            checked={formData.firstGraduate === "Yes"}
                            onChange={(e) =>
                              !lockedFields.firstGraduate &&
                              setFormData({
                                ...formData,
                                firstGraduate: e.target.value as "Yes" | "No",
                              })
                            }
                            disabled={!!lockedFields.firstGraduate}
                          />
                          <span>Yes</span>
                        </label>
                        <label className="inline-flex items-center gap-2">
                          <input
                            type="radio"
                            name="firstGraduate"
                            value="No"
                            checked={formData.firstGraduate === "No"}
                            onChange={(e) =>
                              !lockedFields.firstGraduate &&
                              setFormData({
                                ...formData,
                                firstGraduate: e.target.value as "Yes" | "No",
                              })
                            }
                            disabled={!!lockedFields.firstGraduate}
                          />
                          <span>No</span>
                        </label>
                      </div>
                    </div>
                  )}
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-2">
                      Date (Auto-detected)
                    </label>
                    <input
                      type="date"
                      value={formData.date || ""}
                      readOnly
                      required
                      className="w-full px-4 py-2 border border-slate-200 rounded-lg bg-slate-50 text-slate-700 cursor-not-allowed"
                    />
                    <p className="mt-1 text-xs text-slate-500">
                      Current date is automatically used
                    </p>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-2">
                      Proof (Optional)
                    </label>
                    <input
                      type="file"
                      accept="image/*,application/pdf"
                      onChange={(e) => {
                        setFileError(null);
                        const f = e.target.files?.[0] || null;
                        setFile(f);
                      }}
                      className="block w-full text-sm text-slate-700 file:mr-4 file:py-2 file:px-4 file:rounded-md file:border-0 file:text-sm file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100"
                    />
                    <p className="mt-1 text-xs text-slate-500">
                      Accepted: PDF, JPG, PNG. Max size 10 MB.
                    </p>
                    {file && (
                      <p className="mt-1 text-sm text-slate-600">
                        Selected: {file.name}
                      </p>
                    )}
                    {fileError && (
                      <p className="mt-1 text-sm text-red-600">{fileError}</p>
                    )}
                  </div>
                </div>
              </>
            )}

            <button
              type="submit"
              disabled={loading || (type === "gatepass" && gatepassLocked)}
              className="w-full py-3 px-4 bg-blue-600 text-white rounded-lg hover:bg-blue-700 focus:ring-4 focus:ring-blue-200 font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? "Submitting..." : "Submit Application"}
            </button>
          </form>
        </div>

        <div className="bg-white rounded-xl shadow-lg border border-slate-200 p-6">
          <h2 className="text-xl font-bold text-slate-800 mb-6">
            Application History
          </h2>
          {type === "gatepass" && gatepassLocked && (
            <div className="mb-4 p-3 rounded-lg bg-yellow-50 border border-yellow-200 text-yellow-700">
              You have an earlier approved gatepass that hasn't completed its
              IN/OUT scans. You cannot apply for a new gatepass until the
              previous one has both OUT and IN scanned.
            </div>
          )}
          <>
            {/* Desktop / tablet table */}
            <div className="hidden md:block overflow-x-auto -mx-2 md:mx-0">
              {appsLoading ? (
                <Loader message="Loading applications..." />
              ) : (
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-slate-200">
                      <th className="text-left py-3 px-4 text-sm font-semibold text-slate-700">
                        App ID
                      </th>
                      <th className="text-left py-3 px-4 text-sm font-semibold text-slate-700">
                        Date
                      </th>
                      <th className="text-left py-3 px-4 text-sm font-semibold text-slate-700">
                        Reason
                      </th>
                      {(type === "od" ||
                        type === "leave" ||
                        type === "bonafide") && (
                        <th className="text-left py-3 px-4 text-sm font-semibold text-slate-700">
                          Proof
                        </th>
                      )}
                      <th className="text-center py-3 px-4 text-sm font-semibold text-slate-700">
                        Status
                      </th>
                      {visibleLevels.map((lvl) => (
                        <th
                          key={lvl}
                          className="text-center py-3 px-4 text-sm font-semibold text-slate-700"
                        >
                          {levelLabels[lvl]}
                          {lvl === "mentor" && mentorOnLeave && (
                            <span className="ml-1 text-xs text-orange-600">
                              (Leave)
                            </span>
                          )}
                          {lvl === "advisor" && advisorOnLeave && (
                            <span className="ml-1 text-xs text-orange-600">
                              (Leave)
                            </span>
                          )}
                          {lvl === "advisor" &&
                            mentorOnLeave &&
                            !advisorOnLeave && (
                              <span className="ml-1 text-xs text-blue-600">
                                (Acting)
                              </span>
                            )}
                          {lvl === "hod" && hodOnLeave && (
                            <span className="ml-1 text-xs text-orange-600">
                              (Leave)
                            </span>
                          )}
                          {lvl === "hod" && advisorOnLeave && !hodOnLeave && (
                            <span className="ml-1 text-xs text-blue-600">
                              (Acting)
                            </span>
                          )}
                          {lvl === "ps" && psOnLeave && (
                            <span className="ml-1 text-xs text-orange-600">
                              (Leave)
                            </span>
                          )}
                          {lvl === "ps" && hodOnLeave && !psOnLeave && (
                            <span className="ml-1 text-xs text-blue-600">
                              (Acting)
                            </span>
                          )}
                        </th>
                      ))}
                      {type === "gatepass" && (
                        <th className="text-center py-3 px-4 text-sm font-semibold text-slate-700">
                          View
                        </th>
                      )}
                    </tr>
                  </thead>
                  <tbody>
                    {applications.length === 0 ? (
                      <tr>
                        <td
                          colSpan={
                            4 +
                            visibleLevels.length +
                            ((type as string) === "od" ||
                            (type as string) === "leave" ||
                            (type as string) === "bonafide"
                              ? 1
                              : 0) +
                            (type === "gatepass" ? 1 : 0)
                          }
                          className="text-center py-8 text-slate-500"
                        >
                          No applications yet
                        </td>
                      </tr>
                    ) : (
                      applications.map((app) => (
                        <tr
                          key={app.id}
                          className="border-b border-slate-100 hover:bg-slate-50"
                        >
                          <td className="py-3 px-4 text-sm text-slate-600">
                            {app.id.slice(0, 8)}...
                          </td>
                          <td className="py-3 px-4 text-sm text-slate-600">
                            {new Date(app.created_at).toLocaleDateString()}
                          </td>
                          <td className="py-3 px-4 text-sm text-slate-600 max-w-xs truncate">
                            {type === "bonafide" &&
                            app.reason?.startsWith("Bonafide - ")
                              ? app.reason
                                  .split(" | ")[0]
                                  .replace("Bonafide - ", "")
                              : app.reason}
                          </td>
                          {(type === "od" ||
                            type === "leave" ||
                            type === "bonafide") && (
                            <td className="py-3 px-4 text-sm text-slate-600">
                              {app.attachment_url ? (
                                <button
                                  onClick={() => {
                                    setCurrentProofUrl(app.attachment_url);
                                    setShowProofModal(true);
                                  }}
                                  className="text-blue-600 hover:underline cursor-pointer"
                                >
                                  View proof
                                </button>
                              ) : (
                                <span className="text-slate-400">—</span>
                              )}
                            </td>
                          )}
                          <td className="py-3 px-4 text-center">
                            <span
                              className={`inline-block px-3 py-1 rounded-full text-xs font-medium ${
                                app.status === "approved"
                                  ? "bg-green-100 text-green-700"
                                  : app.status === "rejected"
                                  ? "bg-red-100 text-red-700"
                                  : "bg-yellow-100 text-yellow-700"
                              }`}
                            >
                              {app.status}
                            </span>
                          </td>
                          {visibleLevels.map((lvl) => (
                            <td key={lvl} className="py-3 px-4 text-center">
                              {getApprovalStatus(app, lvl)}
                            </td>
                          ))}
                          {type === "gatepass" && app.status !== "pending" && (
                            <td className="py-3 px-4 text-center">
                              <button
                                onClick={() => {
                                  setSelectedApplication(app);
                                  setShowStatusModal(true);
                                }}
                                className="px-3 py-1 bg-blue-600 text-white text-xs rounded-lg hover:bg-blue-700 transition-colors"
                              >
                                View
                              </button>
                            </td>
                          )}
                          {type === "gatepass" && app.status === "pending" && (
                            <td className="py-3 px-4 text-center">
                              <span className="text-slate-400">—</span>
                            </td>
                          )}
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              )}
            </div>

            {/* Mobile card list */}
            <div className="md:hidden space-y-4">
              {appsLoading ? (
                <Loader message="Loading applications..." />
              ) : applications.length === 0 ? (
                <p className="text-center py-4 text-slate-500">
                  No applications yet
                </p>
              ) : (
                applications.map((app) => (
                  <div
                    key={app.id}
                    className="border border-slate-200 rounded-lg p-4 shadow-sm bg-white"
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div className="space-y-1">
                        <p className="text-xs text-slate-400">App ID</p>
                        <p className="text-sm font-mono text-slate-700">
                          {app.id.slice(0, 10)}...
                        </p>
                      </div>
                      <span
                        className={`inline-block px-2 py-1 rounded-full text-[10px] font-semibold uppercase tracking-wide ${
                          app.status === "approved"
                            ? "bg-green-100 text-green-700"
                            : app.status === "rejected"
                            ? "bg-red-100 text-red-700"
                            : "bg-yellow-100 text-yellow-700"
                        }`}
                      >
                        {app.status}
                      </span>
                    </div>
                    <div className="mt-3 text-xs text-slate-500 flex items-center justify-between">
                      <span>
                        {new Date(app.created_at).toLocaleDateString()}
                      </span>
                      {(type === "od" ||
                        type === "leave" ||
                        type === "bonafide") &&
                        (app.attachment_url ? (
                          <button
                            onClick={() => {
                              setCurrentProofUrl(app.attachment_url);
                              setShowProofModal(true);
                            }}
                            className="text-blue-600 underline cursor-pointer"
                          >
                            Proof
                          </button>
                        ) : (
                          <span className="text-slate-400">No proof</span>
                        ))}
                    </div>
                    <p className="mt-3 text-sm text-slate-700 line-clamp-3">
                      {type === "bonafide" &&
                      app.reason?.startsWith("Bonafide - ")
                        ? app.reason.split(" | ")[0].replace("Bonafide - ", "")
                        : app.reason}
                    </p>
                    <div className="mt-4 grid grid-cols-2 gap-2">
                      {visibleLevels.map((lvl) => (
                        <div key={lvl} className="text-center">
                          <p className="text-[10px] text-slate-500 mb-1">
                            {levelLabels[lvl]}
                          </p>
                          {getApprovalStatus(app, lvl)}
                        </div>
                      ))}
                    </div>
                    {type === "gatepass" && app.status !== "pending" && (
                      <div className="mt-4">
                        <button
                          onClick={() => {
                            setSelectedApplication(app);
                            setShowStatusModal(true);
                          }}
                          className="w-full px-4 py-2 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700 transition-colors"
                        >
                          View Details
                        </button>
                      </div>
                    )}
                  </div>
                ))
              )}
            </div>
          </>
        </div>

        {type === "gatepass" && (
          <div className="bg-white rounded-xl shadow-lg border border-slate-200 p-6 mt-8">
            <h2 className="text-xl font-bold text-slate-800 mb-4">
              Latest Approved Gatepass
            </h2>
            {(() => {
              const approvedApp = (applications || []).find(
                (a) => a.status === "approved"
              );
              if (!approvedApp) {
                return (
                  <p className="text-slate-600">No approved gatepass yet.</p>
                );
              }

              const subject = approvedApp.reason || "Gatepass";

              // Format datetime for display
              // Check if the stored time already has the correct timezone offset
              const formatDateTime = (dateStr: string) => {
                if (!dateStr) return "—";

                // Parse the timestamp
                const date = new Date(dateStr);

                // Format in Indian locale and timezone
                return date.toLocaleString("en-IN", {
                  day: "2-digit",
                  month: "2-digit",
                  year: "numeric",
                  hour: "2-digit",
                  minute: "2-digit",
                  hour12: true,
                });
              };

              const fromDT = formatDateTime(approvedApp.from_date);
              const toDT = formatDateTime(approvedApp.to_date);
              const base =
                typeof window !== "undefined" ? window.location.origin : "";
              const sid = user?.id || "";
              const appid = approvedApp.id;
              const outUrl = `${base}/gatepass-scan?act=out&sid=${encodeURIComponent(
                sid
              )}&appid=${encodeURIComponent(appid)}`;
              const inUrl = `${base}/gatepass-scan?act=in&sid=${encodeURIComponent(
                sid
              )}&appid=${encodeURIComponent(appid)}`;
              return (
                <>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <p className="text-sm text-slate-500">Reason</p>
                      <p className="font-semibold text-slate-800">{subject}</p>
                    </div>
                    <div>
                      <p className="text-sm text-slate-500">
                        From Date &amp; Time
                      </p>
                      <p className="font-semibold text-slate-800">{fromDT}</p>
                    </div>
                    <div>
                      <p className="text-sm text-slate-500">
                        To Date &amp; Time
                      </p>
                      <p className="font-semibold text-slate-800">{toDT}</p>
                    </div>
                    <div>
                      <p className="text-sm text-slate-500">Gate Out-time</p>
                      <p className="font-semibold text-slate-800">
                        {approvedApp.out_time
                          ? new Date(approvedApp.out_time).toLocaleString(
                              "en-IN",
                              {
                                day: "2-digit",
                                month: "2-digit",
                                year: "numeric",
                                hour: "2-digit",
                                minute: "2-digit",
                                hour12: true,
                              }
                            )
                          : "—"}
                      </p>
                    </div>
                    <div>
                      <p className="text-sm text-slate-500">Gate In-time</p>
                      <p className="font-semibold text-slate-800">
                        {approvedApp.in_time
                          ? new Date(approvedApp.in_time).toLocaleString(
                              "en-IN",
                              {
                                day: "2-digit",
                                month: "2-digit",
                                year: "numeric",
                                hour: "2-digit",
                                minute: "2-digit",
                                hour12: true,
                              }
                            )
                          : "—"}
                      </p>
                    </div>
                  </div>

                  {!(approvedApp.out_time && approvedApp.in_time) && (
                    <div className="mt-6 flex flex-wrap gap-3 items-center">
                      <a
                        href={outUrl}
                        className="inline-flex items-center justify-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
                      >
                        <img
                          src="/src/assets/out.png"
                          alt="Out"
                          className="h-5 w-5"
                        />
                        <span>Scan OUT</span>
                      </a>
                      <a
                        href={inUrl}
                        className="inline-flex items-center justify-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700"
                      >
                        <img
                          src="/src/assets/in.png"
                          alt="In"
                          className="h-5 w-5"
                        />
                        <span>Scan IN</span>
                      </a>
                    </div>
                  )}
                </>
              );
            })()}
          </div>
        )}
      </div>

      {/* Status Modal for Gatepass */}
      {showStatusModal && selectedApplication && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-75 p-4"
          onClick={() => setShowStatusModal(false)}
        >
          <div className="relative w-96 h-96 md:w-[450px] md:h-[450px]">
            <button
              onClick={() => setShowStatusModal(false)}
              className="absolute -top-10 right-0 text-white hover:text-gray-300 transition-colors"
            >
              <X className="h-8 w-8" />
            </button>
            <div
              className="bg-white rounded-lg overflow-hidden shadow-2xl w-full h-full flex flex-col"
              onClick={(e) => e.stopPropagation()}
            >
              {/* Status Stamp - 50% */}
              <div
                className={`h-1/2 flex items-center justify-center relative ${
                  selectedApplication.status === "approved"
                    ? "bg-green-200"
                    : "bg-red-200"
                }`}
              >
                <div
                  className={`transform -rotate-12 border-8 rounded-lg px-6 py-4 ${
                    selectedApplication.status === "approved"
                      ? "border-green-700"
                      : "border-red-700"
                  }`}
                >
                  <div
                    className={`text-5xl md:text-6xl font-black text-center uppercase ${
                      selectedApplication.status === "approved"
                        ? "text-green-700"
                        : "text-red-700"
                    }`}
                    style={{ letterSpacing: "0.1em" }}
                  >
                    {selectedApplication.status === "approved"
                      ? "APPROVED"
                      : "REJECTED"}
                  </div>
                </div>
              </div>

              {/* Details - 50% */}
              <div className="h-1/2 flex flex-col items-center justify-center p-6 bg-white space-y-6">
                <div className="text-center">
                  <p className="text-base md:text-lg text-slate-700 font-semibold mb-2">
                    Name
                  </p>
                  <p className="text-2xl md:text-3xl font-black text-slate-900">
                    {studentProfile?.name || user?.email || "Student"}
                  </p>
                </div>

                {(() => {
                  const rec = (selectedApplication.approvals || [])
                    .slice()
                    .reverse()
                    .find((r: any) => r.action === selectedApplication.status);
                  const at = rec
                    ? new Date(rec.created_at)
                    : selectedApplication.updated_at
                    ? new Date(selectedApplication.updated_at)
                    : null;
                  return at ? (
                    <div className="text-center">
                      <p className="text-base md:text-lg text-slate-700 font-semibold mb-2">
                        Date & Time
                      </p>
                      <p className="text-xl md:text-2xl font-black text-slate-900">
                        {at.toLocaleDateString()}
                      </p>
                      <p className="text-xl md:text-2xl font-black text-slate-900">
                        {at.toLocaleTimeString()}
                      </p>
                    </div>
                  ) : null;
                })()}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Proof Modal */}
      {showProofModal && currentProofUrl && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-75 p-4"
          onClick={() => setShowProofModal(false)}
        >
          <div className="relative max-w-4xl max-h-[90vh] w-full">
            <button
              onClick={() => setShowProofModal(false)}
              className="absolute -top-10 right-0 text-white hover:text-gray-300 transition-colors"
            >
              <X className="h-8 w-8" />
            </button>
            <div
              className="bg-white rounded-lg overflow-hidden shadow-2xl"
              onClick={(e) => e.stopPropagation()}
            >
              {(currentProofUrl as string).match(
                /\.(jpg|jpeg|png|gif|webp)$/i
              ) ? (
                <img
                  src={currentProofUrl as string}
                  alt="Proof document"
                  className="w-full h-auto max-h-[80vh] object-contain"
                />
              ) : (
                <iframe
                  src={currentProofUrl as string}
                  className="w-full h-[80vh]"
                  title="Proof document"
                />
              )}
            </div>
          </div>
        </div>
      )}
    </DashboardLayout>
  );
}
