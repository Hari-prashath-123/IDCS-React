import { useEffect, useMemo, useState, useRef } from 'react';
import { ChevronDown, ChevronUp, Download } from 'lucide-react';
import {
  supabase,
  Student as StudentType,
  Staff as StaffType,
} from "../lib/supabase";
import Loader from "./Loader";

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

interface ViewProfileProps {
  userId: string;
  showDownloadButton?: boolean;
  showBackButton?: boolean;
  onBack?: () => void;
}

export default function ViewProfile({ userId, showDownloadButton = true, showBackButton = false, onBack }: ViewProfileProps) {
  const [loading, setLoading] = useState(true);
  const [student, setStudent] = useState<StudentLike>(null);
  const [staff, setStaff] = useState<StaffLike>(null);
  const [profile, setProfile] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
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

  const fetchStaffCertificates = async (uid: string) => {
    setCertsLoading(true);
    try {
      const { data, error } = await supabase
        .from('certificates')
        .select('id, description, file_url, certificate_type, created_at')
        .eq('user_id', uid)
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
      if (!userId) return;
      setLoading(true);
      setError(null);
      try {
        // Load profile first to determine role
        const { data: pRaw, error: pErr } = await supabase
          .from("profiles")
          .select("*")
          .eq("id", userId)
          .maybeSingle();
        if (pErr) throw pErr;
        if (mounted) setProfile(pRaw);

        const userRole = pRaw?.role;

        if (userRole === "student") {
          const { data: sRaw, error: sErr } = await supabase
            .from("students")
            .select("*")
            .eq("id", userId)
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
              const [gatepassRes, odRes, bonafideRes, leaveRes] =
                await Promise.all([
                  supabase
                    .from("gatepass_applications")
                    .select("id", { count: "exact", head: true })
                    .eq("student_id", userId),
                  supabase
                    .from("od_applications")
                    .select("id", { count: "exact", head: true })
                    .eq("student_id", userId),
                  supabase
                    .from("bonafide_applications")
                    .select("id", { count: "exact", head: true })
                    .eq("student_id", userId),
                  supabase
                    .from("leave_applications")
                    .select("id", { count: "exact", head: true })
                    .eq("student_id", userId),
                ]);

              const { data: certificates } = await supabase
                .from("certificates")
                .select("certificate_type, exam_name")
                .eq("user_id", userId);

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
        } else if (userRole === "staff" || userRole === "ahod" || userRole === "hod") {
          const { data: stRaw, error: stErr } = await supabase
            .from("staff")
            .select("*")
            .eq("id", userId)
            .maybeSingle();
          if (stErr) throw stErr;
          const st = stRaw as StaffType | null;
          if (mounted) setStaff(st ?? null);
          if (userId) {
            await fetchStaffCertificates(userId);
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
  }, [userId]);

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
    
    const allCertIds = new Set(certificates.map(c => c.id));
    const originalExpanded = new Set(expandedCerts);
    setExpandedCerts(allCertIds);
    
    await new Promise(resolve => setTimeout(resolve, 500));
    
    try {
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
      setExpandedCerts(originalExpanded);
      setDownloading(false);
    }
  };

  if (loading) {
    return <Loader message="Loading profile..." />;
  }

  if (error) {
    return (
      <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-red-800">
        {error}
      </div>
    );
  }

  if (!profile) {
    return (
      <div className="bg-white rounded-xl border border-slate-200 p-6">
        <p className="text-slate-600">No profile found.</p>
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto">
      <div ref={profileRef}>
        <div className="mb-6 flex flex-col sm:flex-row sm:items-start sm:justify-between gap-6">
          {!downloading && (
            <div>
              <h1 className="text-3xl font-bold text-slate-800">Profile</h1>
              <p className="text-slate-600">View account and role details</p>
            </div>
          )}

          {/* Profile Card */}
          {profile && (
            <div className="bg-white rounded-xl border border-slate-200 p-6 w-full sm:w-auto sm:min-w-[280px]">
              <div className="flex items-center space-x-4">
                {profile.profile_image ? (
                  <img
                    src={profile.profile_image}
                    alt={profile.name}
                    className="h-16 w-16 rounded-full object-cover"
                  />
                ) : (
                  <div className="h-16 w-16 rounded-full bg-blue-600 text-white flex items-center justify-center text-2xl font-bold flex-shrink-0">
                    {profile.name?.charAt(0)?.toUpperCase() || "U"}
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <div
                    className={`inline-block text-xs px-2 py-1 rounded ${headerBadgeColor} capitalize mb-2`}
                  >
                    {role || "user"}
                  </div>
                  <h2 className="text-xl font-semibold text-slate-800 truncate">
                    {profile.name || "-"}
                  </h2>
                  <p className="text-slate-600 text-sm truncate">
                    {profile.email || "-"}
                  </p>
                </div>
              </div>
              {showDownloadButton && !downloading && (
                <button
                  onClick={downloadProfileAsPDF}
                  className="mt-4 w-full px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 flex items-center justify-center gap-2 text-sm font-medium"
                >
                  <Download className="w-4 h-4" />
                  Download Profile
                </button>
              )}
              {showBackButton && onBack && !downloading && (
                <button
                  onClick={onBack}
                  className="mt-2 w-full px-4 py-2 bg-slate-600 text-white rounded-lg hover:bg-slate-700 flex items-center justify-center gap-2 text-sm font-medium"
                >
                  Back
                </button>
              )}
            </div>
          )}
        </div>

        <div className="space-y-6">
          {role === "student" && (
            <div className="bg-white rounded-xl border border-slate-200 p-6">
              <h3 className="text-lg font-semibold text-slate-800 mb-4">
                Student Details
              </h3>
              {!student ? (
                <p className="text-slate-600">No student record found.</p>
              ) : (
                <div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
                    <DetailRow label="Roll No" value={student.roll_no} />
                    <DetailRow
                      label="Register No"
                      value={(student as any)?.reg_no}
                    />
                    <DetailRow label="Year" value={student.year} />
                    <DetailRow label="Section" value={student.section} />
                    <DetailRow
                      label="Department"
                      value={student.department || profile?.department}
                    />
                    <DetailRow
                      label="Course"
                      value={(student as any)?.course_name || profile?.course_name}
                    />
                    <DetailRow
                      label="College"
                      value={(student as any)?.college || profile?.college}
                    />
                    <DetailRow
                      label="Admission Year"
                      value={(student as any)?.admission_year}
                    />
                    <DetailRow
                      label="Semester"
                      value={(student as any)?.sem}
                    />
                    <DetailRow
                      label="Date of Birth"
                      value={
                        profile?.dob || (student as any)?.dob
                          ? new Date(
                              profile?.dob || (student as any)?.dob
                            ).toLocaleDateString()
                          : "-"
                      }
                    />
                    <DetailRow
                      label="Gender"
                      value={profile?.gender || (student as any)?.gender}
                    />
                    <DetailRow
                      label="Phone Number"
                      value={(student as any)?.phone_number || profile?.phone_number}
                    />
                    <DetailRow
                      label="Father's Name"
                      value={(student as any)?.fathers_name}
                    />
                    <DetailRow
                      label="Father's Number"
                      value={(student as any)?.father_number}
                    />
                    <DetailRow
                      label="Mother's Name"
                      value={(student as any)?.mothers_name}
                    />
                    <DetailRow
                      label="Mother's Number"
                      value={(student as any)?.mother_number}
                    />
                    <DetailRow
                      label="Community"
                      value={(student as any)?.community}
                    />
                    <DetailRow
                      label="Residence"
                      value={(student as any)?.residence}
                    />
                    <DetailRow
                      label="College Bus"
                      value={(student as any)?.college_bus ? "Yes" : "No"}
                    />
                    <DetailRow
                      label="Management"
                      value={(student as any)?.management ? "Yes" : "No"}
                    />
                    <DetailRow
                      label="First Graduate"
                      value={(student as any)?.first_graduate ? "Yes" : "No"}
                    />
                    <DetailRow
                      label="Address"
                      value={profile?.address || (student as any)?.address}
                    />
                    <DetailRow
                      label="City"
                      value={profile?.city || (student as any)?.city}
                    />
                    <DetailRow
                      label="State"
                      value={profile?.state || (student as any)?.state}
                    />
                    <DetailRow
                      label="Mentor"
                      value={student.mentor_name}
                    />
                    <DetailRow
                      label="Advisor"
                      value={student.advisor_name}
                    />
                    <DetailRow
                      label="AHOD"
                      value={student.ahod_name}
                    />
                    <DetailRow
                      label="HOD"
                      value={student.hod_name}
                    />
                  </div>

                  {/* Parent Photos */}
                  {((student as any)?.father_photo || (student as any)?.mother_photo) && (
                    <div className="mt-6 pt-6 border-t border-slate-200">
                      <h4 className="font-semibold text-slate-800 mb-3">Parent Photos</h4>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {(student as any)?.father_photo && (
                          <div>
                            <p className="text-sm text-slate-600 mb-2">Father's Photo</p>
                            <img
                              src={(student as any).father_photo}
                              alt="Father"
                              className="w-full h-48 object-cover rounded-lg border border-slate-200 cursor-pointer hover:opacity-90"
                              onClick={() =>
                                setModalImage({
                                  url: (student as any).father_photo,
                                  title: "Father's Photo",
                                })
                              }
                            />
                          </div>
                        )}
                        {(student as any)?.mother_photo && (
                          <div>
                            <p className="text-sm text-slate-600 mb-2">Mother's Photo</p>
                            <img
                              src={(student as any).mother_photo}
                              alt="Mother"
                              className="w-full h-48 object-cover rounded-lg border border-slate-200 cursor-pointer hover:opacity-90"
                              onClick={() =>
                                setModalImage({
                                  url: (student as any).mother_photo,
                                  title: "Mother's Photo",
                                })
                              }
                            />
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Statistics Section - Only for students */}
          {role === "student" && stats && (
            <div className="bg-white rounded-xl border border-slate-200 p-6">
              <h3 className="text-lg font-semibold text-slate-800 mb-4 flex items-center gap-2">
                Applications & Achievements
              </h3>

              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <StatCard
                  label="Gatepass"
                  value={stats.gatepass}
                  color="bg-blue-100 text-blue-700"
                />
                <StatCard
                  label="OD"
                  value={stats.od}
                  color="bg-green-100 text-green-700"
                />
                <StatCard
                  label="Bonafide"
                  value={stats.bonafide}
                  color="bg-purple-100 text-purple-700"
                />
                <StatCard
                  label="Leave"
                  value={stats.leave}
                  color="bg-orange-100 text-orange-700"
                />
                <StatCard
                  label="Courses Completed"
                  value={stats.coursesCompleted}
                  color="bg-indigo-100 text-indigo-700"
                />
                <StatCard
                  label="Events Attended"
                  value={stats.eventsAttended}
                  color="bg-pink-100 text-pink-700"
                />
                <StatCard
                  label="Exams Cleared"
                  value={stats.examsCleared}
                  color="bg-teal-100 text-teal-700"
                />
              </div>
            </div>
          )}

          {(role === "staff" || role === "ahod" || role === "hod") && (
            <div className="bg-white rounded-xl border border-slate-200 p-6">
              <h3 className="text-lg font-semibold text-slate-800 mb-4">
                Staff Details
              </h3>
              {!staff ? (
                <p className="text-slate-600">No staff record found.</p>
              ) : (
                <div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
                    <DetailRow label="Staff ID" value={staff.staff_id} />
                    <DetailRow
                      label="First Name"
                      value={(staff as any)?.first_name}
                    />
                    <DetailRow
                      label="Last Name"
                      value={(staff as any)?.last_name}
                    />
                    <DetailRow label="Staff Role" value={staff.staff_role} />
                    <DetailRow label="Year" value={staff.year} />
                    <DetailRow label="Section" value={staff.section} />
                    <DetailRow
                      label="Department"
                      value={(staff as any)?.department || profile?.department}
                    />
                    <DetailRow
                      label="Designation"
                      value={(staff as any)?.designation}
                    />
                    <DetailRow
                      label="Qualification"
                      value={(staff as any)?.qualification}
                    />
                    <DetailRow
                      label="Date of Birth"
                      value={
                        (staff as any)?.dob
                          ? new Date((staff as any).dob).toLocaleDateString()
                          : "-"
                      }
                    />
                    <DetailRow label="Gender" value={(staff as any)?.gender} />
                    <DetailRow
                      label="Marital Status"
                      value={(staff as any)?.marital_status}
                    />
                    <DetailRow
                      label="Phone Number"
                      value={(staff as any)?.phone_number}
                    />
                    <DetailRow
                      label="Alternate Phone"
                      value={(staff as any)?.alternate_phone_number}
                    />
                    <DetailRow
                      label="Address"
                      value={(staff as any)?.address}
                    />
                    <DetailRow
                      label="College"
                      value={(staff as any)?.college}
                    />
                    <DetailRow
                      label="Residence"
                      value={(staff as any)?.residence}
                    />
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Certificates Section for Staff/HOD/AHOD */}
          {(role === 'staff' || role === 'ahod' || role === 'hod') && (
            <div className="bg-white rounded-xl border border-slate-200 p-6">
              <h3 className="text-lg font-semibold text-slate-800 mb-4">Certificates</h3>
              {certsLoading ? (
                <p className="text-slate-600">Loading certificates...</p>
              ) : certificates.length === 0 ? (
                <p className="text-slate-600">No certificates uploaded.</p>
              ) : (
                <div className="space-y-3">
                  {certificates.map((cert) => {
                    const isExpanded = expandedCerts.has(cert.id);
                    return (
                      <div
                        key={cert.id}
                        className="border border-slate-200 rounded-lg p-4"
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-1">
                              {cert.certificate_type && (
                                <span className="inline-block px-2 py-0.5 text-xs font-semibold rounded bg-blue-100 text-blue-700 capitalize">
                                  {cert.certificate_type}
                                </span>
                              )}
                              <span className="text-xs text-slate-500">
                                {new Date(cert.created_at).toLocaleDateString()}
                              </span>
                            </div>
                            <p className="text-sm text-slate-700 break-words">
                              {cert.description || "No description"}
                            </p>
                          </div>
                          <button
                            onClick={() =>
                              setExpandedCerts((prev) => {
                                const next = new Set(prev);
                                if (next.has(cert.id)) {
                                  next.delete(cert.id);
                                } else {
                                  next.add(cert.id);
                                }
                                return next;
                              })
                            }
                            className="flex-shrink-0 p-1 text-slate-600 hover:text-slate-800"
                          >
                            {isExpanded ? (
                              <ChevronUp className="w-5 h-5" />
                            ) : (
                              <ChevronDown className="w-5 h-5" />
                            )}
                          </button>
                        </div>
                        {isExpanded && cert.file_url && (
                          <div className="mt-3 pt-3 border-t border-slate-200">
                            <a
                              href={cert.file_url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center gap-2 px-3 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm"
                            >
                              <Download className="w-4 h-4" />
                              View Certificate
                            </a>
                          </div>
                        )}
                      </div>
                    );
                  })}
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
                  <p className="text-slate-600">No image available</p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
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

function StatCard({
  label,
  value,
  color,
}: {
  label: string;
  value: number;
  color: string;
}) {
  return (
    <div className={`${color} rounded-lg p-4`}>
      <div className="text-2xl font-bold">{value}</div>
      <div className="text-sm font-medium mt-1">{label}</div>
    </div>
  );
}
