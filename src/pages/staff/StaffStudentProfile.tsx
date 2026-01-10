import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import DashboardLayout from '../../components/DashboardLayout';
import { supabase } from '../../lib/supabase';
import Loader from '../../components/Loader';

export default function StaffStudentProfile() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [student, setStudent] = useState<any>(null);
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
        const s = sRaw || null;

        const { data: pRaw, error: pErr } = await supabase.from('profiles').select('*').eq('id', id).maybeSingle();
        if (pErr) throw pErr;
        const p = pRaw || null;

        let enriched = s ? { ...s } : null;
        if (s) {
          const ids = [s.mentor_id, s.advisor_id, s.ahod_id, s.hod_id].filter(Boolean);
          if (ids.length) {
            const { data: profsRaw } = await supabase.from('profiles').select('id, name').in('id', ids);
            const map: Record<string, string> = {};
            (profsRaw ?? []).forEach((pr: any) => (map[String(pr.id)] = pr.name));
            enriched = {
              ...s,
              mentor_name: map[String(s.mentor_id)] || null,
              advisor_name: map[String(s.advisor_id)] || null,
              ahod_name: map[String(s.ahod_id)] || null,
              hod_name: map[String(s.hod_id)] || null,
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

  return (
    <DashboardLayout>
      <div className="max-w-5xl mx-auto">
        <div className="mb-6 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-semibold text-slate-800">Student Profile</h1>
            <p className="text-sm text-slate-600">View student details (read-only)</p>
          </div>
          <div>
            <button
              onClick={() => navigate(-1)}
              className="px-3 py-1 bg-blue-600 text-white rounded hover:bg-blue-700"
            >
              Back to Students
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
                    <DetailRow label="First Name" value={((): string => {
                      const raw = (profile?.name || '').trim();
                      const parts = raw ? raw.split(/\s+/) : [];
                      return parts.length > 1 ? parts.slice(0, -1).join(' ') : (parts[0] || '-');
                    })()} />
                    <DetailRow label="Last Name" value={((): string => {
                      const raw = (profile?.name || '').trim();
                      const parts = raw ? raw.split(/\s+/) : [];
                      return parts.length > 1 ? parts[parts.length - 1] : '-';
                    })()} />

                    <DetailRow label="DOB" value={profile?.dob ? new Date(profile.dob).toLocaleDateString() : (student?.dob ? new Date(student.dob).toLocaleDateString() : '-')} />
                    <DetailRow label="Gender" value={profile?.gender || student?.gender || '-'} />
                    <DetailRow label="Father's Name" value={student?.fathers_name || student?.father_name || profile?.father_name || '-'} />
                    <DetailRow label="Mother's Name" value={student?.mothers_name || student?.mother_name || profile?.mother_name || '-'} />
                    <DetailRow label="Address" value={profile?.address || student?.address || '-'} />
                    <DetailRow label="City" value={profile?.city || student?.city || '-'} />
                    <DetailRow label="State" value={profile?.state || student?.state || '-'} />

                    <DetailRow label="Admission Year" value={student?.admission_year || student?.year || '-'} />
                    <DetailRow label="Register No" value={student?.reg_no || '-'} />
                    <DetailRow label="Roll No" value={student?.roll_no || '-'} />
                    <DetailRow label="Degree" value={profile?.degree || student?.degree || '-'} />
                    <DetailRow label="Department" value={profile?.department || student?.department || '-'} />
                    <DetailRow label="Sem" value={student?.sem || student?.semester || '-'} />
                    <DetailRow label="Section" value={student?.section || '-'} />
                    <DetailRow label="Course Name" value={profile?.course_name || student?.course_name || '-'} />
                    <DetailRow label="College" value={profile?.college || student?.college || '-'} />
                    <DetailRow label="Father Phone" value={student?.father_number || '-'} />
                    <DetailRow label="Mother Phone" value={student?.mother_number || '-'} />
                    <DetailRow label="Community" value={student?.community || '-'} />
                    <DetailRow label="Residence" value={student?.residence || '-'} />
                    <DetailRow label="College Bus" value={(student?.college_bus != null ? (student.college_bus ? 'Yes' : 'No') : (student?.bus || '-'))} />
                    <DetailRow label="First Graduate" value={student?.first_graduate ? 'Yes' : 'No'} />
                  </div>
                )}
              </div>
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
      <span className="font-medium text-slate-800">{value ?? '-'} </span>
    </div>
  );
}
