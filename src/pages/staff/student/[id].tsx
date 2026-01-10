import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import DashboardLayout from '../../../components/DashboardLayout';
import { supabase } from '../../../lib/supabase';
import Loader from '../../../components/Loader';
import { Home, FileText, Calendar, CreditCard, Award, Users, ClipboardCheck } from 'lucide-react';

type StudentLike = any;

export default function StaffStudentById() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [student, setStudent] = useState<StudentLike | null>(null);
  const [profile, setProfile] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;
    const load = async () => {
      if (!id) return;
      setLoading(true);
      setError(null);
      try {
        const { data: sRaw, error: sErr } = await supabase.from('students').select('*').eq('id', id).maybeSingle();
        if (sErr) throw sErr;
        const s = sRaw as StudentLike | null;

        const { data: pRaw, error: pErr } = await supabase.from('profiles').select('*').eq('id', id).maybeSingle();
        if (pErr) throw pErr;
        const p = pRaw || null;

        let enriched: StudentLike = s ? { ...s } : null;
        if (s) {
          const ids = [s.mentor_id, s.advisor_id, s.ahod_id, s.hod_id].filter(Boolean) as string[];
          if (ids.length) {
            const { data: profsRaw } = await supabase.from('profiles').select('id, name').in('id', ids);
            const map: Record<string, string> = {};
            const profs = (profsRaw ?? []) as Array<{ id: string; name: string }>;
            profs.forEach((pr) => (map[pr.id] = pr.name));
            enriched = {
              ...s,
              mentor_name: map[s.mentor_id] || null,
              advisor_name: map[s.advisor_id] || null,
              ahod_name: map[s.ahod_id] || null,
              hod_name: map[s.hod_id] || null,
            };
          }
        }

        if (mounted) {
          setStudent(enriched ?? null);
          setProfile(p);
        }
      } catch (e: any) {
        console.error('Failed to load student profile', e);
        if (mounted) setError(e?.message || 'Failed to load student profile');
      } finally {
        if (mounted) setLoading(false);
      }
    };
    load();
    return () => {
      mounted = false;
    };
  }, [id]);

  const headerBadgeColor = useMemo(() => {
    return 'bg-blue-100 text-blue-700';
  }, []);

  const sidebarItems = [
    { label: 'Dashboard', path: '/staff', icon: <Home className="w-5 h-5" /> },
    { label: 'OD Applications', path: '/staff/od', icon: <FileText className="w-5 h-5" /> },
    { label: 'Leave Applications', path: '/staff/leave', icon: <Calendar className="w-5 h-5" /> },
    { label: 'Gatepass Applications', path: '/staff/gatepass', icon: <CreditCard className="w-5 h-5" /> },
    { label: 'Bonafide Applications', path: '/staff/bonafide', icon: <Award className="w-5 h-5" /> },
    { label: 'Attendance', path: '/staff/attendance', icon: <ClipboardCheck className="w-5 h-5" /> },
    { label: 'My Mentees', path: '/staff/mentees', icon: <Users className="w-5 h-5" /> },
    { label: 'My Students', path: '/staff/students', icon: <Users className="w-5 h-5" /> },
  ];

  return (
    <DashboardLayout sidebarItems={sidebarItems}>
      <div className="max-w-5xl mx-auto p-4 sm:p-6">
        <div className="mb-4 sm:mb-6 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-xl sm:text-2xl font-semibold text-slate-800">Student Profile</h1>
            <p className="text-xs sm:text-sm text-slate-600">View student details (read-only)</p>
          </div>
          <div>
            <button
              onClick={() => navigate(-1)}
              className="w-full sm:w-auto px-3 py-1 bg-blue-600 text-white text-sm rounded hover:bg-blue-700"
            >
              Back
            </button>
          </div>
        </div>

        {!profile ? (
          <div className="bg-white rounded-xl border border-slate-200 p-6">
            <p className="text-slate-600">No profile found.</p>
          </div>
        ) : loading ? (
          <Loader message="Loading student profile..." />
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="lg:col-span-1">
              <div className="bg-white rounded-xl border border-slate-200 p-6">
                <div className="flex items-center space-x-4">
                  <div className="h-16 w-16 rounded-full bg-blue-600 text-white flex items-center justify-center text-2xl font-bold">
                    {profile.name?.charAt(0)?.toUpperCase() || 'U'}
                  </div>
                  <div>
                    <div className={`inline-block text-xs px-2 py-1 rounded ${headerBadgeColor} capitalize`}>student</div>
                    <h2 className="text-xl font-semibold text-slate-800 mt-1">{profile.name}</h2>
                    <p className="text-slate-600 text-sm">{profile.email}</p>
                  </div>
                </div>
                <div className="mt-6 space-y-3 text-sm">
                  <div className="flex justify-between"><span className="text-slate-500">Department</span><span className="font-medium">{profile.department || '-'}</span></div>
                  <div className="flex justify-between"><span className="text-slate-500">Date of Birth</span><span className="font-medium">{profile.dob ? new Date(profile.dob).toLocaleDateString() : '-'}</span></div>
                  <div className="flex justify-between"><span className="text-slate-500">Joined</span><span className="font-medium">{profile.created_at ? new Date(profile.created_at).toLocaleDateString() : '-'}</span></div>
                </div>
              </div>
            </div>

            <div className="lg:col-span-2 space-y-6">
              <div className="bg-white rounded-xl border border-slate-200 p-6">
                <h3 className="text-lg font-semibold text-slate-800 mb-4">Student Details</h3>
                {error ? (
                  <p className="text-red-600 text-sm">{error}</p>
                ) : !student ? (
                  <p className="text-slate-600">No student record found.</p>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
                    <DetailRow label="First Name" value={(profile as any)?.first_name || profile?.name?.split(' ')[0] || '-'} />
                    <DetailRow label="Last Name" value={(profile as any)?.last_name || profile?.name?.split(' ').slice(1).join(' ') || '-'} />
                    <DetailRow label="DOB" value={profile?.dob ? new Date(profile.dob).toLocaleDateString() : (student?.dob ? new Date(student.dob).toLocaleDateString() : '-')} />
                    <DetailRow label="Gender" value={profile?.gender || (student as any)?.gender || '-'} />
                    <DetailRow label="Father's Name" value={(student as any)?.fathers_name || (student as any)?.father_name || profile?.father_name || '-'} />
                    <DetailRow label="Mother's Name" value={(student as any)?.mothers_name || (student as any)?.mother_name || profile?.mother_name || '-'} />
                    <DetailRow label="Address" value={profile?.address || (student as any)?.address || '-'} />
                    <DetailRow label="City" value={profile?.city || (student as any)?.city || '-'} />
                    <DetailRow label="State" value={profile?.state || (student as any)?.state || '-'} />
                    <DetailRow label="Admission Year" value={(student as any)?.admission_year || student?.year || '-'} />
                    <DetailRow label="Register No" value={student?.reg_no || '-'} />
                    <DetailRow label="Roll No" value={student?.roll_no || '-'} />
                    <DetailRow label="Degree" value={profile?.degree || (student as any)?.degree || '-'} />
                    <DetailRow label="Department" value={profile?.department || student?.department || '-'} />
                    <DetailRow label="Sem" value={(student as any)?.sem || (student as any)?.semester || '-'} />
                    <DetailRow label="Section" value={student?.section || '-'} />
                    <DetailRow label="Course Name" value={profile?.course_name || (student as any)?.course_name || '-'} />
                    <DetailRow label="College" value={profile?.college || (student as any)?.college || '-'} />
                    <DetailRow label="Father Phone" value={(student as any)?.father_number || '-'} />
                    <DetailRow label="Mother Phone" value={(student as any)?.mother_number || '-'} />
                    <DetailRow label="Phone" value={(student as any)?.phone_number || '-'} />
                    <DetailRow label="Community" value={(student as any)?.community || '-'} />
                    <DetailRow label="Residence" value={(student as any)?.residence || '-'} />
                    <DetailRow label="College Bus" value={((student as any)?.college_bus != null ? ((student as any).college_bus ? 'Yes' : 'No') : ((student as any)?.bus || '-'))} />
                    <DetailRow label="First Graduate" value={(student as any)?.first_graduate ? 'Yes' : 'No'} />
                    <DetailRow label="Management" value={(student as any)?.management ? 'Yes' : 'No'} />
                  </div>
                )}
              </div>

              {student && (
                <div className="bg-white rounded-xl border border-slate-200 p-6">
                  <h3 className="text-lg font-semibold text-slate-800 mb-4">Academic Hierarchy</h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
                    <DetailRow label="Mentor" value={student.mentor_name || '-'} />
                    <DetailRow label="Advisor" value={student.advisor_name || '-'} />
                    <DetailRow label="AHOD" value={student.ahod_name || '-'} />
                    <DetailRow label="HOD" value={student.hod_name || '-'} />
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}

function DetailRow({ label, value }: { label: string; value: string | number | null | undefined }) {
  return (
    <div className="flex justify-between border-b border-slate-100 pb-2">
      <span className="text-slate-500">{label}</span>
      <span className="font-medium text-slate-800">{value ?? '-'}</span>
    </div>
  );
}
