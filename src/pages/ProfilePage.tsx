import { useEffect, useMemo, useState, useRef } from 'react';
import { ChevronDown, ChevronUp, Download } from 'lucide-react';
import DashboardLayout from "../components/DashboardLayout";
import { useAuth } from "../contexts/AuthContext";
import {
  supabase,
  Student as StudentType,
  Staff as StaffType,
} from "../lib/supabase";
import Loader from "../components/Loader";
import ProfileImageUpload from "../components/ProfileImageUpload";

type StaffLike = StaffType | null;
type StudentLike =
  | (StudentType & {
      mentor_name?: string | null;
      advisor_name?: string | null;
      ahod_name?: string | null;
      hod_name?: string | null;
    })
  | null;

interface CertificateItem {
  id: string;
  description: string | null;
  file_url: string;
  certificate_type?: string | null;
  created_at: string;
}

export default function ProfilePage() {
  const { profile, refreshProfile } = useAuth();
  const [loading, setLoading] = useState(true);
  const [student, setStudent] = useState<StudentLike>(null);
  const [staff, setStaff] = useState<StaffLike>(null);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState<Record<string, any>>({});
  const [certificates, setCertificates] = useState<CertificateItem[]>([]);
  const [certsLoading, setCertsLoading] = useState(false);
  const [expandedCerts, setExpandedCerts] = useState<Set<string>>(new Set());
  const [downloading, setDownloading] = useState(false);
  const profileRef = useRef<HTMLDivElement>(null);
  const [modalImage, setModalImage] = useState<{
    url: string | null;
    title: string;
  } | null>(null);
  const [stats, setStats] = useState<{
    gatepass: number;
    od: number;
    bonafide: number;
    leave: number;
    coursesCompleted: number;
    eventsAttended: number;
    examsCleared: number;
  } | null>(null);

  const isValidEmail = (e?: string | null) => {
    if (!e) return false;
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(e).trim());
  };

  const fetchStaffCertificates = async (userId: string) => {
    setCertsLoading(true);
    try {
      const { data, error } = await supabase
        .from('certificates')
        .select('id, description, file_url, certificate_type, created_at')
        .eq('user_id', userId)
        .in('role', ['staff', 'hod', 'ahod'])
        .order('created_at', { ascending: false });
      
      if (error) throw error;
      setCertificates(data || []);
    } catch (e) {
      console.error('Failed to fetch certificates', e);
    } finally {
      setCertsLoading(false);
    }
  };

  const role = profile?.role;

  useEffect(() => {
    let mounted = true;
    const load = async () => {
      if (!profile) return;
      setLoading(true);
      setError(null);
      try {
        if (role === "student") {
          const { data: sRaw, error: sErr } = await supabase
            .from("students")
            .select("*")
            .eq("id", profile.id)
            .maybeSingle();
          if (sErr) throw sErr;
          const s = sRaw as StudentType | null;
          let enriched: StudentLike = s ? { ...s } : null;
          if (s) {
            const ids = [s.mentor_id, s.advisor_id, s.ahod_id, s.hod_id].filter(
              Boolean
            ) as string[];
            if (ids.length) {
              const { data: profsRaw } = await supabase
                .from("profiles")
                .select("id, name")
                .in("id", ids);
              const map: Record<string, string> = {};
              const profs = (profsRaw ?? []) as Array<{
                id: string;
                name: string;
              }>;
              profs.forEach((p) => (map[p.id] = p.name));
              enriched = {
                ...s,
                mentor_name: map[s.mentor_id] || null,
                advisor_name: map[s.advisor_id] || null,
                ahod_name: map[s.ahod_id] || null,
                hod_name: map[s.hod_id] || null,
              };
            }
          }
          if (mounted) setStudent(enriched ?? null);

          // Fetch statistics for student
          if (mounted && s) {
            try {
              // Fetch application counts
              const [gatepassRes, odRes, bonafideRes, leaveRes] =
                await Promise.all([
                  supabase
                    .from("gatepass_applications")
                    .select("id", { count: "exact", head: true })
                    .eq("student_id", profile.id),
                  supabase
                    .from("od_applications")
                    .select("id", { count: "exact", head: true })
                    .eq("student_id", profile.id),
                  supabase
                    .from("bonafide_applications")
                    .select("id", { count: "exact", head: true })
                    .eq("student_id", profile.id),
                  supabase
                    .from("leave_applications")
                    .select("id", { count: "exact", head: true })
                    .eq("student_id", profile.id),
                ]);

              // Fetch certificates data for courses, events, and exams
              const { data: certificates } = await supabase
                .from("certificates")
                .select("certificate_type, exam_name")
                .eq("user_id", profile.id);

              const coursesCompleted =
                certificates?.filter((c) => c.certificate_type === "course")
                  ?.length || 0;
              const eventsAttended =
                certificates?.filter(
                  (c) =>
                    c.certificate_type === "participation" ||
                    c.certificate_type === "event"
                )?.length || 0;
              const examsCleared =
                certificates?.filter((c) => c.exam_name)?.length || 0;

              if (mounted) {
                setStats({
                  gatepass: gatepassRes.count || 0,
                  od: odRes.count || 0,
                  bonafide: bonafideRes.count || 0,
                  leave: leaveRes.count || 0,
                  coursesCompleted,
                  eventsAttended,
                  examsCleared,
                });
              }
            } catch (e) {
              console.error("Error fetching statistics:", e);
            }
          }

          // initialize form from loaded data
          if (mounted && s) {
            // Use explicit first_name and last_name stored on the profile if available.
            // Do NOT attempt to parse or split the `profile.name` value — use the
            // saved `first_name`/`last_name` exactly as entered by the user.
            const firstFromProfile = (profile as any)?.first_name || "";
            const lastFromProfile = (profile as any)?.last_name || "";
            setForm(() => ({
              email: profile?.email || "",
              first_name: firstFromProfile,
              last_name: lastFromProfile,
              dob: profile?.dob || (s as any)?.dob || "",
              gender: profile?.gender || (s as any)?.gender || "",
              fathers_name: (s as any)?.fathers_name || "",
              mothers_name: (s as any)?.mothers_name || "",
              address: profile?.address || (s as any)?.address || "",
              city: profile?.city || (s as any)?.city || "",
              state: profile?.state || (s as any)?.state || "",
              admission_year: (s as any)?.admission_year || s.year || "",
              roll_no: s.roll_no || "",
              reg_no: (s as any)?.reg_no || "",
              degree: profile?.degree || (s as any)?.degree || "",
              department: profile?.department || s.department || "",
              sem: (s as any)?.sem || "",
              section: s.section || "",
              course_name:
                profile?.course_name || (s as any)?.course_name || "",
              college: profile?.college || (s as any)?.college || "",
              father_number: (s as any)?.father_number || "",
              mother_number: (s as any)?.mother_number || "",
              phone_number:
                (s as any)?.phone_number || profile?.phone_number || "",
              community: (s as any)?.community || "",
              residence: (s as any)?.residence || "",
              college_bus: (s as any)?.college_bus ?? false,
              management: (s as any)?.management ?? false,
              first_graduate: (s as any)?.first_graduate || false,
              profile_image: (s as any)?.profile_image || null,
              mother_photo: (s as any)?.mother_photo || null,
              father_photo: (s as any)?.father_photo || null,
            }));
          }
        } else if (role === "staff" || role === "ahod" || role === "hod") {
          const { data: stRaw, error: stErr } = await supabase
            .from("staff")
            .select("*")
            .eq("id", profile.id)
            .maybeSingle();
          if (stErr) throw stErr;
          const st = stRaw as StaffType | null;
          if (mounted) setStaff(st ?? null);
          if (profile?.id) {
            await fetchStaffCertificates(profile.id);
          }
          // initialize form from loaded data
          if (mounted && st) {
            setForm(() => ({
              email: profile?.email || "",
              staff_id: st.staff_id || "",
              first_name: (st as any)?.first_name || "",
              last_name: (st as any)?.last_name || "",
              staff_role: st.staff_role || "",
              year: st.year != null ? String(st.year) : "",
              section: st.section || "",
              department: (st as any)?.department || profile?.department || "",
              designation: (st as any)?.designation || '',
              qualification: (st as any)?.qualification || '',
              dob: (st as any)?.dob || "",
              gender: (st as any)?.gender || "",
              marital_status: (st as any)?.marital_status || "",
              
              address: (st as any)?.address || "",
              college:
                (st as any)?.college || "K.RAMAKRISHNAN COLLEGE OF TECHNOLOGY",
              phone_number: (st as any)?.phone_number || "",
              alternate_phone_number: (st as any)?.alternate_phone_number || "",
              residence: (st as any)?.residence || "",
            }));
          }
        }
      } catch (e: unknown) {
        console.error("Error loading profile extras:", e);
        const message =
          e instanceof Error ? e.message : "Failed to load additional details";
        if (mounted) setError(message);
      } finally {
        if (mounted) setLoading(false);
      }
    };
    load();
    return () => {
      mounted = false;
    };
  }, [profile, role]);

  const headerBadgeColor = useMemo(() => {
    switch (role) {
      case "student":
        return "bg-blue-100 text-blue-700";
      case "staff":
        return "bg-emerald-100 text-emerald-700";
      case "ahod":
        return "bg-purple-100 text-purple-700";
      case "hod":
        return "bg-orange-100 text-orange-700";
      case "admin":
        return "bg-slate-200 text-slate-700";
      case "ps":
        return "bg-indigo-100 text-indigo-700";
      case "principal":
        return "bg-rose-100 text-rose-700";
      default:
        return "bg-slate-200 text-slate-700";
    }
  }, [role]);

  const downloadProfileAsPDF = async () => {
    if (!profileRef.current) return;
    
    setDownloading(true);
    
    // Temporarily expand all certificates for PDF
    const allCertIds = new Set(certificates.map(c => c.id));
    const originalExpanded = new Set(expandedCerts);
    setExpandedCerts(allCertIds);
    
    // Wait for DOM to update
    await new Promise(resolve => setTimeout(resolve, 500));
    
    try {
      // Load html2pdf library dynamically
      const html2pdf = (window as any).html2pdf;
      if (!html2pdf) {
        const script = document.createElement('script');
        script.src = 'https://cdnjs.cloudflare.com/ajax/libs/html2pdf.js/0.10.1/html2pdf.bundle.min.js';
        script.async = true;
        document.head.appendChild(script);
        await new Promise((resolve, reject) => {
          script.onload = resolve;
          script.onerror = reject;
        });
      }

      const element = profileRef.current;
      const opt = {
        margin: 10,
        filename: `${profile?.name || 'profile'}-${new Date().toISOString().split('T')[0]}.pdf`,
        image: { type: 'jpeg', quality: 0.98 },
        html2canvas: { scale: 2, useCORS: true, logging: false },
        jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' }
      };

      await (window as any).html2pdf().set(opt).from(element).save();
    } catch (e) {
      console.error('Failed to generate PDF', e);
      alert('Failed to download profile. Please try again.');
    } finally {
      // Restore original expanded state
      setExpandedCerts(originalExpanded);
      setDownloading(false);
    }
  };

  return (
    <DashboardLayout>
      <div className="max-w-5xl mx-auto">
        <div ref={profileRef}>
          <div className="mb-6 flex flex-col sm:flex-row sm:items-start sm:justify-between gap-6">
            {!downloading && (
              <div>
                <h1 className="text-3xl font-bold text-slate-800">My Profile</h1>
                <p className="text-slate-600">View your account and role details</p>
              </div>
            )}

          {/* Profile Card - Moved to right side */}
          {profile && (
            <div className="bg-white rounded-xl border border-slate-200 p-6 w-full sm:w-auto sm:min-w-[280px]">
              <div className="flex items-center space-x-4">
                {/* Profile Image or Initial */}
                <div className="relative">
                  {student && (student as any)?.profile_image ? (
                    <img
                      src={(student as any).profile_image}
                      alt={profile.name || "Profile"}
                      className="h-16 w-16 rounded-full object-cover flex-shrink-0 border-2 border-blue-600 cursor-pointer hover:opacity-80 transition-opacity"
                      onClick={() =>
                        setModalImage({
                          url: (student as any).profile_image,
                          title: "Profile Image",
                        })
                      }
                      onError={(e) => {
                        // Fallback to initials if image fails to load
                        e.currentTarget.style.display = "none";
                        const fallback = e.currentTarget
                          .nextElementSibling as HTMLElement;
                        if (fallback) fallback.style.display = "flex";
                      }}
                    />
                  ) : null}
                  <div
                    className="h-16 w-16 rounded-full bg-blue-600 text-white flex items-center justify-center text-2xl font-bold flex-shrink-0 cursor-pointer hover:opacity-80 transition-opacity"
                    style={{
                      display:
                        student && (student as any)?.profile_image
                          ? "none"
                          : "flex",
                    }}
                    onClick={() =>
                      setModalImage({
                        url: (student as any)?.profile_image || null,
                        title: "Profile Image",
                      })
                    }
                  >
                    {profile.name?.charAt(0)?.toUpperCase() || "U"}
                  </div>
                  {/* Edit Profile Image Button - Only in edit mode */}
                  {editing && role === "student" && profile?.id && (
                    <button
                      onClick={() => {
                        const input = document.getElementById(
                          "profile-image-upload"
                        ) as HTMLInputElement;
                        input?.click();
                      }}
                      className="absolute -bottom-1 -right-1 bg-blue-600 text-white p-1.5 rounded-full hover:bg-blue-700 transition-colors shadow-md"
                      title="Change profile picture"
                    >
                      <svg
                        className="w-3 h-3"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z"
                        />
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M15 13a3 3 0 11-6 0 3 3 0 016 0z"
                        />
                      </svg>
                    </button>
                  )}
                  {/* Hidden file input for profile image */}
                  {editing && role === "student" && profile?.id && (
                    <input
                      id="profile-image-upload"
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={async (e) => {
                        const file = e.target.files?.[0];
                        if (!file) return;
                        if (!file.type.startsWith("image/")) {
                          alert("Please select an image file");
                          return;
                        }
                        if (file.size > 5 * 1024 * 1024) {
                          alert("File size must be less than 5MB");
                          return;
                        }
                        setLoading(true);
                        try {
                          const fileExtension =
                            file.name.split(".").pop() || "jpg";
                          const fileName = `${profile.id}/profile.${fileExtension}`;
                          if (form.profile_image) {
                            const oldPath =
                              form.profile_image.split("/profile-images/")[1];
                            if (oldPath)
                              await supabase.storage
                                .from("profile-images")
                                .remove([oldPath]);
                          }
                          const { error: uploadError } = await supabase.storage
                            .from("profile-images")
                            .upload(fileName, file, {
                              cacheControl: "3600",
                              upsert: true,
                            });
                          if (uploadError) throw uploadError;
                          const { data } = supabase.storage
                            .from("profile-images")
                            .getPublicUrl(fileName);
                          setForm({ ...form, profile_image: data.publicUrl });
                        } catch (error) {
                          console.error("Upload error:", error);
                          alert(
                            `Failed to upload: ${
                              error instanceof Error
                                ? error.message
                                : "Unknown error"
                            }`
                          );
                        } finally {
                          setLoading(false);
                          e.target.value = "";
                        }
                      }}
                    />
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <div
                    className={`inline-block text-xs px-2 py-1 rounded ${headerBadgeColor} capitalize mb-2`}
                  >
                    {role}
                  </div>
                  <h2 className="text-xl font-semibold text-slate-800 truncate">
                    {profile.name}
                  </h2>
                  <p className="text-slate-600 text-sm truncate">
                    {profile.email}
                  </p>
                </div>
              </div>
              {/* Download Button for Staff/HOD/AHOD */}
                {(role === 'staff' || role === 'ahod' || role === 'hod') && !downloading && (
                  <button
                    onClick={downloadProfileAsPDF}
                    className="mt-4 w-full px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 flex items-center justify-center gap-2 text-sm font-medium"
                  >
                    <Download className="w-4 h-4" />
                    Download Profile
                  </button>
                )}
            </div>
          )}
        </div>

        {!profile ? (
          <div className="bg-white rounded-xl border border-slate-200 p-6">
            <p className="text-slate-600">No profile found.</p>
          </div>
        ) : loading ? (
          <Loader message="Loading your profile..." />
        ) : (
          <div className="space-y-6">
            {role === "student" && (
              <div className="bg-white rounded-xl border border-slate-200 p-6">
                <h3 className="text-lg font-semibold text-slate-800 mb-4">
                  Student Details
                </h3>
                {error ? (
                  <p className="text-red-600 text-sm">{error}</p>
                ) : !student ? (
                  <p className="text-slate-600">No student record found.</p>
                ) : (
                  <div>
                    <div className="flex items-center justify-between mb-3">
                      <div className="text-sm text-slate-600">
                        Editable student profile — update details and save.
                      </div>
                      {!downloading && (
                      <div>
                        {editing ? (
                          <>
                            <button
                              onClick={() => setEditing(false)}
                              className="mr-2 px-3 py-1 text-sm rounded border bg-white text-slate-700"
                            >
                              Cancel
                            </button>
                            <button
                              onClick={async () => {
                                setLoading(true);
                                setError(null);
                                try {
                                  // Update profiles table
                                  // Only update fields that exist on `profiles`. Student-specific
                                  // data (address, dob, college, etc.) is stored in `students`.
                                  const profilePatch: any = {
                                    id: profile?.id,
                                    email: profile?.email ?? "",
                                    role: profile?.role ?? "student",
                                    first_name: form.first_name || null,
                                    last_name: form.last_name || null,
                                    // Keep `name` in sync for compatibility with code that still
                                    // reads `profile.name`.
                                    name: `${form.first_name || ""}${
                                      form.last_name ? " " + form.last_name : ""
                                    }`.trim(),
                                    // Keep department if present on profile; do not attempt to set other student fields here.
                                    department:
                                      profile?.department ||
                                      form.department ||
                                      null,
                                    gender: form.gender || null,
                                  };
                                  // If the user changed their email, validate it and update the Auth user first
                                  if (
                                    form.email &&
                                    String(form.email).trim() !==
                                      String(profile?.email || "").trim()
                                  ) {
                                    if (!isValidEmail(form.email)) {
                                      throw new Error(
                                        "Please enter a valid email address before saving."
                                      );
                                    }
                                    const { data: authData, error: authErr } =
                                      await supabase.auth.updateUser({
                                        email: String(form.email).trim(),
                                      });
                                    if (authErr) throw authErr;
                                    profilePatch.email = String(
                                      form.email
                                    ).trim();
                                  }

                                  const { error: e1 } = await supabase
                                    .from("profiles")
                                    .upsert(profilePatch);
                                  if (e1) throw e1;

                                  // Update students table
                                  const studentPatch: any = {
                                    id: student?.id,
                                    reg_no:
                                      form.reg_no ||
                                      (student as any)?.reg_no ||
                                      null,
                                    roll_no: form.roll_no || null,
                                    // ensure a non-null year to avoid NOT NULL constraint failures
                                    year:
                                      (student as any)?.year ??
                                      (form.admission_year
                                        ? Number(form.admission_year)
                                        : 1),
                                    admission_year: form.admission_year
                                      ? Number(form.admission_year)
                                      : null,
                                    sem: form.sem ? Number(form.sem) : null,
                                    fathers_name: form.fathers_name || null,
                                    mothers_name: form.mothers_name || null,
                                    address: form.address || null,
                                    city: form.city || null,
                                    state: form.state || null,
                                    section:
                                      form.section ||
                                      (student as any)?.section ||
                                      "",
                                    course_name: form.course_name || null,
                                    college: form.college || null,
                                    father_number: form.father_number || null,
                                    mother_number: form.mother_number || null,
                                    phone_number: form.phone_number || null,
                                    community: form.community || null,
                                    residence: form.residence || null,
                                    college_bus: !!form.college_bus,
                                    management: !!form.management,
                                    first_graduate: !!form.first_graduate,
                                    degree: form.degree || null,
                                    profile_image: form.profile_image || null,
                                    mother_photo: form.mother_photo || null,
                                    father_photo: form.father_photo || null,
                                  };
                                  const { error: e2 } = await supabase
                                    .from("students")
                                    .upsert(studentPatch);
                                  if (e2) throw e2;

                                  // reload displayed data and refresh shared profile in context
                                  const { data: sRaw } = await supabase
                                    .from("students")
                                    .select("*")
                                    .eq("id", profile?.id)
                                    .maybeSingle();
                                  setStudent(sRaw as StudentLike);
                                  try {
                                    await refreshProfile();
                                  } catch (e) {
                                    console.debug(
                                      "Failed to refresh profile after save",
                                      e
                                    );
                                  }
                                  setEditing(false);
                                } catch (e: any) {
                                  console.error("Save failed", e);
                                  // If Supabase returns a detailed error, include it in the UI so developer can debug
                                  const msg =
                                    e?.message ||
                                    e?.error_description ||
                                    "Failed to save profile";
                                  setError(msg);
                                } finally {
                                  setLoading(false);
                                }
                              }}
                              className="px-3 py-1 text-sm rounded bg-blue-600 text-white"
                            >
                              Save
                            </button>
                          </>
                        ) : (
                          <button
                            onClick={() => setEditing(true)}
                            className="px-3 py-1 text-sm rounded bg-blue-600 text-white"
                          >
                            Edit
                          </button>
                        )}
                      </div>
                      )}
                    </div>

                    {/* Photo Upload Section - Only visible in edit mode */}
                    {editing && profile?.id && (
                      <div className="mb-6 pb-6 border-b border-slate-200">
                        <h4 className="text-md font-semibold text-slate-800 mb-4">
                          Parent Photos
                        </h4>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                          <ProfileImageUpload
                            label="Mother's Photo"
                            currentImageUrl={form.mother_photo}
                            onImageUpdate={(url) => {
                              setForm({ ...form, mother_photo: url });
                            }}
                            userId={profile.id}
                            imagePath="mother"
                            disabled={loading}
                          />
                          <ProfileImageUpload
                            label="Father's Photo"
                            currentImageUrl={form.father_photo}
                            onImageUpdate={(url) => {
                              setForm({ ...form, father_photo: url });
                            }}
                            userId={profile.id}
                            imagePath="father"
                            disabled={loading}
                          />
                        </div>
                      </div>
                    )}

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
                      {/* Personal / identity fields */}
                      {editing ? (
                        <>
                          <InputRow
                            label="First Name"
                            value={form.first_name}
                            onChange={(v) =>
                              setForm({ ...form, first_name: v })
                            }
                          />
                          <InputRow
                            label="Email"
                            value={form.email}
                            onChange={(v) => setForm({ ...form, email: v })}
                          />
                          <InputRow
                            label="Last Name"
                            value={form.last_name}
                            onChange={(v) => setForm({ ...form, last_name: v })}
                          />
                          <InputRow
                            label="DOB"
                            type="date"
                            value={form.dob}
                            onChange={(v) => setForm({ ...form, dob: v })}
                          />
                          <InputRow
                            label="Gender"
                            value={form.gender}
                            onChange={(v) => setForm({ ...form, gender: v })}
                          />
                          <InputRow
                            label="Father's Name"
                            value={form.fathers_name}
                            onChange={(v) =>
                              setForm({ ...form, fathers_name: v })
                            }
                          />
                          <InputRow
                            label="Mother's Name"
                            value={form.mothers_name}
                            onChange={(v) =>
                              setForm({ ...form, mothers_name: v })
                            }
                          />
                          <InputRow
                            label="Address"
                            value={form.address}
                            onChange={(v) => setForm({ ...form, address: v })}
                          />
                          <InputRow
                            label="City"
                            value={form.city}
                            onChange={(v) => setForm({ ...form, city: v })}
                          />
                          <InputRow
                            label="State"
                            value={form.state}
                            onChange={(v) => setForm({ ...form, state: v })}
                          />

                          <InputRow
                            label="Father's Phone"
                            value={form.father_number}
                            onChange={(v) =>
                              setForm({ ...form, father_number: v })
                            }
                          />
                          <InputRow
                            label="Mother's Phone"
                            value={form.mother_number}
                            onChange={(v) =>
                              setForm({ ...form, mother_number: v })
                            }
                          />
                          <InputRow
                            label="Phone"
                            value={form.phone_number}
                            onChange={(v) =>
                              setForm({ ...form, phone_number: v })
                            }
                          />
                          <InputRow
                            label="Community"
                            value={form.community}
                            onChange={(v) => setForm({ ...form, community: v })}
                          />

                          <div className="flex flex-col">
                            <label className="text-slate-500 text-xs mb-1">
                              Residence
                            </label>
                            <select
                              value={form.residence || ""}
                              onChange={(e) =>
                                setForm({ ...form, residence: e.target.value })
                              }
                              className="px-3 py-2 border border-slate-200 rounded text-sm"
                            >
                              <option value="">Select Residence</option>
                              <option value="Hosteler">Hosteler</option>
                              <option value="Dayscholler">Dayscholler</option>
                            </select>
                          </div>

                          {form.residence === "Dayscholler" && (
                            <div className="flex items-center gap-2">
                              <input
                                id="collegeBus"
                                type="checkbox"
                                checked={!!form.college_bus}
                                onChange={(e) =>
                                  setForm({
                                    ...form,
                                    college_bus: !!e.target.checked,
                                  })
                                }
                              />
                              <label
                                htmlFor="collegeBus"
                                className="text-sm text-slate-600"
                              >
                                College Bus
                              </label>
                            </div>
                          )}

                          <div className="flex items-center gap-2">
                            <input
                              id="firstGrad"
                              type="checkbox"
                              checked={!!form.first_graduate}
                              onChange={(e) =>
                                setForm({
                                  ...form,
                                  first_graduate: !!e.target.checked,
                                })
                              }
                            />
                            <label
                              htmlFor="firstGrad"
                              className="text-sm text-slate-600"
                            >
                              First graduate in family
                            </label>
                          </div>

                          <div className="flex items-center gap-2">
                            <input
                              id="managementFlag"
                              type="checkbox"
                              checked={!!form.management}
                              onChange={(e) =>
                                setForm({
                                  ...form,
                                  management: !!e.target.checked,
                                })
                              }
                            />
                            <label
                              htmlFor="managementFlag"
                              className="text-sm text-slate-600"
                            >
                              Management quota / self-financed
                            </label>
                          </div>

                          <InputRow
                            label="Admission Year"
                            type="number"
                            value={form.admission_year}
                            onChange={(v) =>
                              setForm({ ...form, admission_year: v })
                            }
                            readOnly={true}
                          />
                          <InputRow
                            label="Register No"
                            value={form.reg_no}
                            onChange={(v) => setForm({ ...form, reg_no: v })}
                            readOnly={true}
                          />
                          <InputRow
                            label="Roll No"
                            value={form.roll_no}
                            onChange={(v) => setForm({ ...form, roll_no: v })}
                            readOnly={true}
                          />
                          <InputRow
                            label="Degree"
                            value={form.degree}
                            onChange={(v) => setForm({ ...form, degree: v })}
                            readOnly={true}
                          />
                          <DetailRow
                            label="Department"
                            value={
                              profile?.department || student?.department || "-"
                            }
                          />
                          <InputRow
                            label="Sem"
                            type="number"
                            value={form.sem}
                            onChange={(v) => setForm({ ...form, sem: v })}
                            readOnly={true}
                          />
                          <DetailRow
                            label="Section"
                            value={student.section || "-"}
                          />
                          <InputRow
                            label="Course Name"
                            value={form.course_name}
                            onChange={(v) =>
                              setForm({ ...form, course_name: v })
                            }
                            readOnly={true}
                          />
                          <InputRow
                            label="College"
                            value={form.college}
                            onChange={(v) => setForm({ ...form, college: v })}
                            readOnly={true}
                          />
                        </>
                      ) : (
                        <>
                          <DetailRow
                            label="First Name"
                            value={(profile as any)?.first_name ?? "-"}
                          />
                          <DetailRow
                            label="Last Name"
                            value={(profile as any)?.last_name ?? "-"}
                          />
                          <DetailRow
                            label="DOB"
                            value={
                              profile?.dob
                                ? new Date(profile.dob).toLocaleDateString()
                                : student?.dob
                                ? new Date(student.dob).toLocaleDateString()
                                : "-"
                            }
                          />
                          <DetailRow
                            label="Gender"
                            value={
                              profile?.gender || (student as any)?.gender || "-"
                            }
                          />

                          {/* Father's Name with Photo */}
                          <div className="flex justify-between items-center border-b border-slate-100 pb-2">
                            <span className="text-slate-500">
                              Father's Name
                            </span>
                            <div className="flex items-center gap-2">
                              <span className="font-medium text-slate-800">
                                {(student as any)?.fathers_name ||
                                  (student as any)?.father_name ||
                                  profile?.father_name ||
                                  "-"}
                              </span>
                              {(student as any)?.father_photo ? (
                                <img
                                  src={(student as any).father_photo}
                                  alt="Father"
                                  className="h-8 w-8 rounded-full object-cover border border-slate-300 cursor-pointer hover:opacity-80 transition-opacity"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setModalImage({
                                      url: (student as any).father_photo,
                                      title: "Father's Photo",
                                    });
                                  }}
                                  onError={(e) => {
                                    e.currentTarget.style.display = "none";
                                  }}
                                />
                              ) : (
                                <div
                                  className="h-8 w-8 rounded-full bg-slate-200 flex items-center justify-center text-xs text-slate-500 cursor-pointer hover:bg-slate-300 transition-colors"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setModalImage({
                                      url: null,
                                      title: "Father's Photo",
                                    });
                                  }}
                                  title="Click to view"
                                >
                                  N/A
                                </div>
                              )}
                            </div>
                          </div>

                          {/* Mother's Name with Photo */}
                          <div className="flex justify-between items-center border-b border-slate-100 pb-2">
                            <span className="text-slate-500">
                              Mother's Name
                            </span>
                            <div className="flex items-center gap-2">
                              <span className="font-medium text-slate-800">
                                {(student as any)?.mothers_name ||
                                  (student as any)?.mother_name ||
                                  profile?.mother_name ||
                                  "-"}
                              </span>
                              {(student as any)?.mother_photo ? (
                                <img
                                  src={(student as any).mother_photo}
                                  alt="Mother"
                                  className="h-8 w-8 rounded-full object-cover border border-slate-300 cursor-pointer hover:opacity-80 transition-opacity"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setModalImage({
                                      url: (student as any).mother_photo,
                                      title: "Mother's Photo",
                                    });
                                  }}
                                  onError={(e) => {
                                    e.currentTarget.style.display = "none";
                                  }}
                                />
                              ) : (
                                <div
                                  className="h-8 w-8 rounded-full bg-slate-200 flex items-center justify-center text-xs text-slate-500 cursor-pointer hover:bg-slate-300 transition-colors"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setModalImage({
                                      url: null,
                                      title: "Mother's Photo",
                                    });
                                  }}
                                  title="Click to view"
                                >
                                  N/A
                                </div>
                              )}
                            </div>
                          </div>

                          <DetailRow
                            label="Address"
                            value={
                              profile?.address ||
                              (student as any)?.address ||
                              "-"
                            }
                          />
                          <DetailRow
                            label="City"
                            value={
                              profile?.city || (student as any)?.city || "-"
                            }
                          />
                          <DetailRow
                            label="State"
                            value={
                              profile?.state || (student as any)?.state || "-"
                            }
                          />

                          <DetailRow
                            label="Admission Year"
                            value={
                              (student as any)?.admission_year ||
                              student.year ||
                              "-"
                            }
                          />
                          <DetailRow
                            label="Register No"
                            value={student.reg_no || "-"}
                          />
                          <DetailRow
                            label="Roll No"
                            value={student.roll_no || "-"}
                          />
                          <DetailRow
                            label="Degree"
                            value={
                              profile?.degree || (student as any)?.degree || "-"
                            }
                          />
                          <DetailRow
                            label="Department"
                            value={
                              profile?.department || student?.department || "-"
                            }
                          />
                          <DetailRow
                            label="Sem"
                            value={
                              (student as any)?.sem ||
                              (student as any)?.semester ||
                              "-"
                            }
                          />
                          <DetailRow
                            label="Section"
                            value={student.section || "-"}
                          />
                          <DetailRow
                            label="Course Name"
                            value={
                              profile?.course_name ||
                              (student as any)?.course_name ||
                              "-"
                            }
                          />
                          <DetailRow
                            label="College"
                            value={
                              profile?.college ||
                              (student as any)?.college ||
                              "-"
                            }
                          />
                          <DetailRow
                            label="Father Phone"
                            value={(student as any)?.father_number || "-"}
                          />
                          <DetailRow
                            label="Mother Phone"
                            value={(student as any)?.mother_number || "-"}
                          />
                          <DetailRow
                            label="Phone"
                            value={(student as any)?.phone_number || "-"}
                          />
                          <DetailRow
                            label="Community"
                            value={(student as any)?.community || "-"}
                          />
                          <DetailRow
                            label="Residence"
                            value={(student as any)?.residence || "-"}
                          />
                          <DetailRow
                            label="College Bus"
                            value={
                              (student as any)?.college_bus != null
                                ? (student as any).college_bus
                                  ? "Yes"
                                  : "No"
                                : (student as any)?.bus || "-"
                            }
                          />
                          <DetailRow
                            label="First Graduate"
                            value={
                              (student as any)?.first_graduate ? "Yes" : "No"
                            }
                          />
                          <DetailRow
                            label="Management"
                            value={(student as any)?.management ? "Yes" : "No"}
                          />
                        </>
                      )}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Statistics Section - Only for students */}
            {role === "student" && stats && (
              <div className="bg-white rounded-xl border border-slate-200 p-6">
                <h3 className="text-lg font-semibold text-slate-800 mb-4 flex items-center gap-2">
                  <svg
                    className="w-5 h-5 text-blue-600"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"
                    />
                  </svg>
                  Applications & Achievements
                </h3>

                <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-3">
                  {/* Gatepass */}
                  <div className="bg-blue-50 rounded-lg p-3 border border-blue-200">
                    <div className="flex items-center gap-2 mb-1">
                      <svg
                        className="w-4 h-4 text-blue-600 flex-shrink-0"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z"
                        />
                      </svg>
                      <span className="text-xs font-medium text-slate-700">
                        Gatepass
                      </span>
                    </div>
                    <div className="text-xl font-bold text-blue-700">
                      {stats.gatepass}
                    </div>
                  </div>

                  {/* OD */}
                  <div className="bg-purple-50 rounded-lg p-3 border border-purple-200">
                    <div className="flex items-center gap-2 mb-1">
                      <svg
                        className="w-4 h-4 text-purple-600 flex-shrink-0"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"
                        />
                      </svg>
                      <span className="text-xs font-medium text-slate-700">
                        OD
                      </span>
                    </div>
                    <div className="text-xl font-bold text-purple-700">
                      {stats.od}
                    </div>
                  </div>

                  {/* Bonafide */}
                  <div className="bg-green-50 rounded-lg p-3 border border-green-200">
                    <div className="flex items-center gap-2 mb-1">
                      <svg
                        className="w-4 h-4 text-green-600 flex-shrink-0"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                        />
                      </svg>
                      <span className="text-xs font-medium text-slate-700">
                        Bonafide
                      </span>
                    </div>
                    <div className="text-xl font-bold text-green-700">
                      {stats.bonafide}
                    </div>
                  </div>

                  {/* Leave */}
                  <div className="bg-orange-50 rounded-lg p-3 border border-orange-200">
                    <div className="flex items-center gap-2 mb-1">
                      <svg
                        className="w-4 h-4 text-orange-600 flex-shrink-0"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
                        />
                      </svg>
                      <span className="text-xs font-medium text-slate-700">
                        Leave
                      </span>
                    </div>
                    <div className="text-xl font-bold text-orange-700">
                      {stats.leave}
                    </div>
                  </div>

                  {/* Courses */}
                  <div className="bg-indigo-50 rounded-lg p-3 border border-indigo-200">
                    <div className="flex items-center gap-2 mb-1">
                      <svg
                        className="w-4 h-4 text-indigo-600 flex-shrink-0"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253"
                        />
                      </svg>
                      <span className="text-xs font-medium text-slate-700">
                        Courses
                      </span>
                    </div>
                    <div className="text-xl font-bold text-indigo-700">
                      {stats.coursesCompleted}
                    </div>
                  </div>

                  {/* Events */}
                  <div className="bg-pink-50 rounded-lg p-3 border border-pink-200">
                    <div className="flex items-center gap-2 mb-1">
                      <svg
                        className="w-4 h-4 text-pink-600 flex-shrink-0"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z"
                        />
                      </svg>
                      <span className="text-xs font-medium text-slate-700">
                        Events
                      </span>
                    </div>
                    <div className="text-xl font-bold text-pink-700">
                      {stats.eventsAttended}
                    </div>
                  </div>

                  {/* Exams */}
                  <div className="bg-teal-50 rounded-lg p-3 border border-teal-200">
                    <div className="flex items-center gap-2 mb-1">
                      <svg
                        className="w-4 h-4 text-teal-600 flex-shrink-0"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M9 12l2 2 4-4M7.835 4.697a3.42 3.42 0 001.946-.806 3.42 3.42 0 014.438 0 3.42 3.42 0 001.946.806 3.42 3.42 0 013.138 3.138 3.42 3.42 0 00.806 1.946 3.42 3.42 0 010 4.438 3.42 3.42 0 00-.806 1.946 3.42 3.42 0 01-3.138 3.138 3.42 3.42 0 00-1.946.806 3.42 3.42 0 01-4.438 0 3.42 3.42 0 00-1.946-.806 3.42 3.42 0 01-3.138-3.138 3.42 3.42 0 00-.806-1.946 3.42 3.42 0 010-4.438 3.42 3.42 0 00.806-1.946 3.42 3.42 0 013.138-3.138z"
                        />
                      </svg>
                      <span className="text-xs font-medium text-slate-700">
                        Exams
                      </span>
                    </div>
                    <div className="text-xl font-bold text-teal-700">
                      {stats.examsCleared}
                    </div>
                  </div>
                </div>
              </div>
            )}

            {(role === "staff" || role === "ahod" || role === "hod") && (
              <div className="bg-white rounded-xl border border-slate-200 p-6">
                <h3 className="text-lg font-semibold text-slate-800 mb-4">
                  Staff Details
                </h3>
                {error ? (
                  <p className="text-red-600 text-sm">{error}</p>
                ) : !staff ? (
                  <p className="text-slate-600">No staff record found.</p>
                ) : (
                  <div>
                    <div className="flex items-center justify-between mb-3">
                      <div className="text-sm text-slate-600">
                        Editable staff profile — update details and save.
                      </div>
                      {!downloading && (
                      <div>
                        {editing ? (
                          <>
                            <button
                              onClick={() => setEditing(false)}
                              className="mr-2 px-3 py-1 text-sm rounded border bg-white text-slate-700"
                            >
                              Cancel
                            </button>
                            <button
                              onClick={async () => {
                                setLoading(true);
                                setError(null);
                                try {
                                  // Update staff table with all staff profile fields
                                  const staffPatch: any = {
                                    id: staff?.id,
                                    staff_id: form.staff_id || staff.staff_id,
                                    first_name: form.first_name || null,
                                    last_name: form.last_name || null,
                                    staff_role:
                                      form.staff_role || staff.staff_role,
                                    year: form.year ? Number(form.year) : null,
                                    section: form.section || null,
                                    department: form.department || null,
                                    designation: form.designation || null,
                                    qualification: form.qualification || null,
                                    dob: form.dob || null,
                                    gender: form.gender || null,
                                    marital_status: form.marital_status || null,
                                    address: form.address || null,
                                    college:
                                      form.college ||
                                      "K.RAMAKRISHNAN COLLEGE OF TECHNOLOGY",
                                    phone_number: form.phone_number || null,
                                    alternate_phone_number:
                                      form.alternate_phone_number || null,
                                    residence: form.residence || null,
                                  };
                                  const { error: e2 } = await supabase
                                    .from("staff")
                                    .upsert(staffPatch);
                                  if (e2) throw e2;

                                  // Update profiles table with basic info only
                                  const profilePatch: any = {
                                    id: profile?.id,
                                    email: profile?.email ?? "",
                                    role: profile?.role ?? "staff",
                                    name: `${form.first_name || ""}${
                                      form.last_name ? " " + form.last_name : ""
                                    }`.trim(),
                                    department: form.department || null,
                                  };
                                  // If the user changed their email, update the Auth user first
                                  if (
                                    form.email &&
                                    String(form.email).trim() !==
                                      String(profile?.email || "").trim()
                                  ) {
                                    const { data: authData, error: authErr } =
                                      await supabase.auth.updateUser({
                                        email: String(form.email).trim(),
                                      });
                                    if (authErr) throw authErr;
                                    profilePatch.email = String(
                                      form.email
                                    ).trim();
                                  }
                                  const { error: e1 } = await supabase
                                    .from("profiles")
                                    .upsert(profilePatch);
                                  if (e1) throw e1;

                                  // reload displayed data and refresh shared profile in context
                                  const { data: stRaw } = await supabase
                                    .from("staff")
                                    .select("*")
                                    .eq("id", profile?.id)
                                    .maybeSingle();
                                  setStaff(stRaw as StaffLike);
                                  try {
                                    await refreshProfile();
                                  } catch (e) {
                                    console.debug(
                                      "Failed to refresh profile after save",
                                      e
                                    );
                                  }
                                  setEditing(false);
                                } catch (e: any) {
                                  console.error("Save failed", e);
                                  const msg =
                                    e?.message ||
                                    e?.error_description ||
                                    "Failed to save profile";
                                  setError(msg);
                                } finally {
                                  setLoading(false);
                                }
                              }}
                              className="px-3 py-1 text-sm rounded bg-blue-600 text-white"
                            >
                              Save
                            </button>
                          </>
                        ) : (
                          <button
                            onClick={() => setEditing(true)}
                            className="px-3 py-1 text-sm rounded bg-blue-600 text-white"
                          >
                            Edit
                          </button>
                        )}
                      </div>
                      )}
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
                      {editing ? (
                        <>
                          <InputRow
                            label="Staff ID"
                            value={form.staff_id}
                            onChange={(v) => setForm({ ...form, staff_id: v })}
                          />
                          <InputRow
                            label="Email"
                            value={form.email}
                            onChange={(v) => setForm({ ...form, email: v })}
                          />
                          <InputRow
                            label="First Name"
                            value={form.first_name}
                            onChange={(v) =>
                              setForm({ ...form, first_name: v })
                            }
                          />
                          <InputRow
                            label="Last Name"
                            value={form.last_name}
                            onChange={(v) => setForm({ ...form, last_name: v })}
                          />
                          <InputRow
                            label="Year"
                            type="number"
                            value={form.year}
                            onChange={(v) => setForm({ ...form, year: v })}
                          />
                          <InputRow
                            label="Section"
                            value={form.section}
                            onChange={(v) => setForm({ ...form, section: v })}
                          />
                          <DetailRow
                            label="Staff Role"
                            value={staff.staff_role}
                          />
                          <InputRow
                            label="Department"
                            value={form.department}
                            onChange={(v) =>
                              setForm({ ...form, department: v })
                            }
                          />
                          <InputRow label="Designation" value={form.designation} onChange={(v) => setForm({ ...form, designation: v })} />
                          <InputRow label="Qualification" value={form.qualification} onChange={(v) => setForm({ ...form, qualification: v })} />
                          <InputRow
                            label="DOB"
                            type="date"
                            value={form.dob}
                            onChange={(v) => setForm({ ...form, dob: v })}
                          />
                          <div className="flex flex-col">
                            <label className="text-slate-500 text-xs mb-1">
                              Gender
                            </label>
                            <select
                              value={form.gender || ""}
                              onChange={(e) =>
                                setForm({ ...form, gender: e.target.value })
                              }
                              className="px-3 py-2 border border-slate-200 rounded text-sm"
                            >
                              <option value="">Select Gender</option>
                              <option value="male">Male</option>
                              <option value="female">Female</option>
                              <option value="other">Other</option>
                            </select>
                          </div>
                          <div className="flex flex-col">
                            <label className="text-slate-500 text-xs mb-1">
                              Marital Status
                            </label>
                            <select
                              value={form.marital_status || ""}
                              onChange={(e) =>
                                setForm({
                                  ...form,
                                  marital_status: e.target.value,
                                })
                              }
                              className="px-3 py-2 border border-slate-200 rounded text-sm"
                            >
                              <option value="">Select Marital Status</option>
                              <option value="single">Single</option>
                              <option value="married">Married</option>
                              <option value="divorced">Divorced</option>
                              <option value="widowed">Widowed</option>
                            </select>
                          </div>
                          <InputRow
                            label="Address"
                            value={form.address}
                            onChange={(v) => setForm({ ...form, address: v })}
                          />
                          <InputRow
                            label="College"
                            value={form.college}
                            onChange={(v) => setForm({ ...form, college: v })}
                          />
                          <InputRow
                            label="Phone Number"
                            value={form.phone_number}
                            onChange={(v) =>
                              setForm({ ...form, phone_number: v })
                            }
                          />
                          <InputRow
                            label="Alternate Phone Number"
                            value={form.alternate_phone_number}
                            onChange={(v) =>
                              setForm({ ...form, alternate_phone_number: v })
                            }
                          />
                          <InputRow
                            label="Residence"
                            value={form.residence}
                            onChange={(v) => setForm({ ...form, residence: v })}
                          />
                        </>
                      ) : (
                        <>
                          <DetailRow label="Staff ID" value={staff.staff_id} />
                          <DetailRow
                            label="Employee ID"
                            value={staff.staff_id || "-"}
                          />
                          <DetailRow
                            label="First Name"
                            value={(staff as any)?.first_name || "-"}
                          />
                          <DetailRow
                            label="Last Name"
                            value={(staff as any)?.last_name || "-"}
                          />
                          <DetailRow
                            label="Year"
                            value={
                              staff.year != null ? String(staff.year) : "-"
                            }
                          />
                          <DetailRow
                            label="Section"
                            value={staff.section || "-"}
                          />
                          <DetailRow
                            label="Staff Role"
                            value={staff.staff_role}
                          />
                          <DetailRow
                            label="Department"
                            value={(staff as any)?.department || "-"}
                          />
                          <DetailRow label="Designation" value={(staff as any)?.designation || '-'} />
                          <DetailRow label="Qualification" value={(staff as any)?.qualification || '-'} />
                          <DetailRow
                            label="DOB"
                            value={
                              (staff as any)?.dob
                                ? new Date(
                                    (staff as any).dob
                                  ).toLocaleDateString()
                                : "-"
                            }
                          />
                          <DetailRow
                            label="Gender"
                            value={(staff as any)?.gender || "-"}
                          />
                          <DetailRow
                            label="Marital Status"
                            value={(staff as any)?.marital_status || "-"}
                          />
                          <DetailRow
                            label="Address"
                            value={(staff as any)?.address || "-"}
                          />
                          <DetailRow
                            label="College"
                            value={
                              (staff as any)?.college ||
                              "K.RAMAKRISHNAN COLLEGE OF TECHNOLOGY"
                            }
                          />
                          <DetailRow
                            label="Phone Number"
                            value={(staff as any)?.phone_number || "-"}
                          />
                          <DetailRow
                            label="Alternate Phone Number"
                            value={
                              (staff as any)?.alternate_phone_number || "-"
                            }
                          />
                          <DetailRow
                            label="Residence"
                            value={(staff as any)?.residence || "-"}
                          />
                        </>
                      )}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Certificates Section for Staff/HOD/AHOD */}
              {(role === 'staff' || role === 'ahod' || role === 'hod') && (
                <div className="bg-white rounded-xl border border-slate-200 p-6" style={{ pageBreakBefore: 'always' }}>
                  <h3 className="text-lg font-semibold text-slate-800 mb-4">My Certificates</h3>
                  {certsLoading ? (
                    <div className="text-slate-600 text-sm">Loading certificates...</div>
                  ) : certificates.length === 0 ? (
                    <div className="text-slate-500 text-sm">No certificates uploaded yet.</div>
                  ) : (
                    <div className="space-y-3">
                      {certificates.map((cert) => {
                        const isExpanded = expandedCerts.has(cert.id);
                        return (
                          <div key={cert.id} className="border border-slate-200 rounded-lg overflow-hidden" style={{ pageBreakInside: 'avoid' }}>
                            <div 
                              className="p-4 bg-slate-50 cursor-pointer hover:bg-slate-100 transition-colors"
                              onClick={() => {
                                const newExpanded = new Set(expandedCerts);
                                if (isExpanded) {
                                  newExpanded.delete(cert.id);
                                } else {
                                  newExpanded.add(cert.id);
                                }
                                setExpandedCerts(newExpanded);
                              }}
                            >
                              <div className="flex items-center justify-between">
                                <div className="flex-1 min-w-0">
                                  <h4 className="text-base font-medium text-slate-800">
                                    {cert.description || 'Untitled Certificate'}
                                  </h4>
                                  <div className="flex flex-wrap gap-4 mt-2 text-sm">
                                    {cert.certificate_type && (
                                      <span className="text-slate-600">
                                        <span className="font-medium">Category:</span> {cert.certificate_type}
                                      </span>
                                    )}
                                    <span className="text-slate-500">
                                      <span className="font-medium">Uploaded:</span> {new Date(cert.created_at).toLocaleString()}
                                    </span>
                                  </div>
                                </div>
                                <div className="ml-4 flex-shrink-0">
                                  {isExpanded ? (
                                    <ChevronUp className="w-5 h-5 text-slate-600" />
                                  ) : (
                                    <ChevronDown className="w-5 h-5 text-slate-600" />
                                  )}
                                </div>
                              </div>
                            </div>
                            {isExpanded && (
                              <div className="bg-white p-4 border-t border-slate-200">
                                {cert.file_url && cert.file_url.toLowerCase().endsWith('.pdf') ? (
                                  <iframe
                                    src={cert.file_url}
                                    className="w-full h-[400px] border-0"
                                    title={cert.description || 'Certificate PDF'}
                                  />
                                ) : (
                                  <img
                                    src={cert.file_url || ''}
                                    alt={cert.description || 'Certificate'}
                                    className="max-w-full h-auto mx-auto max-h-[400px] object-contain"
                                  />
                                )}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}

            {role === "admin" && (
              <div className="bg-white rounded-xl border border-slate-200 p-6">
                <h3 className="text-lg font-semibold text-slate-800 mb-4">
                  Admin Details
                </h3>
                <p className="text-slate-600 text-sm">
                  You have administrator access to manage departments, subjects,
                  and views.
                </p>
              </div>
            )}

            {(role === "ps" || role === "principal") && (
              <div className="bg-white rounded-xl border border-slate-200 p-6">
                <h3 className="text-lg font-semibold text-slate-800 mb-4">
                  {role === "ps" ? "PS Details" : "Principal Details"}
                </h3>
                <p className="text-slate-600 text-sm">
                  {role === "ps"
                    ? "Office of the PS - high level reports and notices."
                    : "Principal access - overview of college-level settings and reports."}
                </p>
                <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="p-3 bg-slate-50 rounded">Quick Links</div>
                  <div className="p-3 bg-slate-50 rounded">Notifications</div>
                </div>
              </div>
            )}
          </div>
        )}
        </div>
      </div>

      {/* Image Modal */}
      {modalImage && (
        <div
          className="fixed inset-0 bg-black bg-opacity-75 z-50 flex items-center justify-center p-4"
          onClick={() => setModalImage(null)}
        >
          <div
            className="relative max-w-4xl max-h-[90vh] bg-white rounded-lg overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              onClick={() => setModalImage(null)}
              className="absolute top-2 right-2 bg-red-500 text-white p-2 rounded-full hover:bg-red-600 transition-colors z-10 shadow-lg"
            >
              <svg
                className="w-6 h-6"
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
            <div className="p-4">
              <h3 className="text-lg font-semibold text-slate-800 mb-4">
                {modalImage.title}
              </h3>
              {modalImage.url ? (
                <img
                  src={modalImage.url}
                  alt={modalImage.title}
                  className="max-w-full max-h-[75vh] object-contain mx-auto"
                />
              ) : (
                <div className="flex flex-col items-center justify-center py-20 px-10">
                  <svg
                    className="w-32 h-32 text-slate-300 mb-4"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={1.5}
                      d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"
                    />
                  </svg>
                  <p className="text-xl font-semibold text-slate-700 mb-2">
                    No Image Uploaded
                  </p>
                  <p className="text-sm text-slate-500 text-center">
                    This photo has not been uploaded yet.
                  </p>
                  {editing && (
                    <p className="text-sm text-blue-600 mt-2">
                      Click "Edit" and upload a photo to add it here.
                    </p>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

    </DashboardLayout>
  );
}

function DetailRow({
  label,
  value,
}: {
  label: string;
  value: string | number | null | undefined;
}) {
  return (
    <div className="flex justify-between border-b border-slate-100 pb-2">
      <span className="text-slate-500">{label}</span>
      <span className="font-medium text-slate-800">{value ?? "-"}</span>
    </div>
  );
}

function InputRow({
  label,
  value,
  onChange,
  type = "text",
  readOnly = false,
}: {
  label: string;
  value: any;
  onChange: (v: any) => void;
  type?: string;
  readOnly?: boolean;
}) {
  return (
    <div className="flex flex-col">
      <label className="text-slate-500 text-xs mb-1">{label}</label>
      <input
        type={type}
        value={value ?? ""}
        onChange={(e) => onChange(e.target.value)}
        readOnly={readOnly}
        className={`px-3 py-2 border border-slate-200 rounded text-sm ${
          readOnly ? "bg-slate-50 text-slate-500 cursor-not-allowed" : ""
        }`}
      />
    </div>
  );
}