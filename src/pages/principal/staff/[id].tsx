import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import DashboardLayout from '../../../components/DashboardLayout';
import { supabase } from '../../../lib/supabase';

export default function PrincipalStaffProfile() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [, setLoading] = useState(true);
  const [staff, setStaff] = useState<any>(null);
  const [profile, setProfile] = useState<any>(null);
  const [, setError] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;
    const load = async () => {
      if (!id) return;
      setLoading(true);
      setError(null);
      try {
        const { data: staffRaw, error: staffErr } = await supabase.from('staff').select('*').eq('id', id).maybeSingle();
        if (staffErr) throw staffErr;

        const { data: profileRaw, error: profileErr } = await supabase.from('profiles').select('*').eq('id', id).maybeSingle();
        if (profileErr) throw profileErr;

        if (mounted) {
          setStaff(staffRaw);
          setProfile(profileRaw);
        }
      } catch (e: any) {
        console.error('Failed to load staff profile', e);
        if (mounted) setError(e?.message || 'Failed to load staff profile');
      } finally {
        if (mounted) setLoading(false);
      }
    };
    load();
    return () => {
      mounted = false;
    };
  }, [id]);

  return (
    <DashboardLayout>
      <div className="max-w-5xl mx-auto">
        <div className="mb-6 flex flex-col sm:flex-row sm:items-start sm:justify-between gap-6">
          <div>
            <h1 className="text-3xl font-bold text-slate-800">Staff Profile</h1>
            <p className="text-slate-600">View staff details (read-only)</p>
          </div>
          <div>
            <button
              onClick={() => {
                try {
                  if (window.history.length > 1) navigate(-1);
                  else navigate('/principal/staff-details');
                } catch (e) {
                  navigate('/principal/staff-details');
                }
              }}
              className="w-full sm:w-auto px-3 py-1 bg-blue-600 text-white text-sm rounded hover:bg-blue-700"
            >
              Back
            </button>
          </div>
        </div>

        <div className="flex flex-col lg:flex-row gap-6">
          {/* Profile Card */}
          <div className="lg:w-1/3">
            <div className="bg-white rounded-xl border border-slate-200 p-6 w-full min-w-[280px]">
              <div className="flex items-center space-x-4">
                <div className="h-16 w-16 rounded-full bg-emerald-600 text-white flex items-center justify-center text-2xl font-bold flex-shrink-0">
                  {profile?.name?.charAt(0)?.toUpperCase() || 'S'}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="inline-block text-xs px-2 py-1 rounded bg-emerald-100 text-emerald-700 capitalize mb-2">{staff?.staff_role || profile?.role || 'staff'}</div>
                  <h2 className="text-xl font-semibold text-slate-800 truncate">{profile?.name || '-'}</h2>
                  <p className="text-slate-600 text-sm truncate">{profile?.email || '-'}</p>
                </div>
              </div>
            </div>
          </div>

          {/* Details Card - always shown, even if staff is missing */}
          <div className="lg:w-2/3">
            <div className="bg-white rounded-xl border border-slate-200 p-6">
              <h3 className="text-lg font-semibold text-slate-800 mb-4">Staff Details</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
                <DetailRow label="Staff ID" value={staff?.staff_id || '-'} />
                <DetailRow label="Employee ID" value={staff?.staff_id || '-'} />
                <DetailRow label="First Name" value={(staff as any)?.first_name || (profile?.name?.split(' ')[0] || '-')} />
                <DetailRow label="Last Name" value={(staff as any)?.last_name || (profile?.name?.split(' ').slice(1).join(' ') || '-')} />
                <DetailRow label="Year" value={staff?.year != null ? String(staff.year) : '-'} />
                <DetailRow label="Section" value={staff?.section || '-'} />
                <DetailRow label="Staff Role" value={staff?.staff_role || profile?.role || '-'} />
                <DetailRow label="Department" value={(staff as any)?.department || profile?.department || '-'} />
                <DetailRow label="DOB" value={(staff as any)?.dob ? new Date((staff as any).dob).toLocaleDateString() : '-'} />
                <DetailRow label="Gender" value={(staff as any)?.gender || '-'} />
                <DetailRow label="Marital Status" value={(staff as any)?.marital_status || '-'} />
                <DetailRow label="Education" value={(staff as any)?.education || '-'} />
                <DetailRow label="Address" value={(staff as any)?.address || '-'} />
                <DetailRow label="College" value={(staff as any)?.college || 'K.RAMAKRISHNAN COLLEGE OF TECHNOLOGY'} />
                <DetailRow label="Phone Number" value={(staff as any)?.phone_number || '-'} />
                <DetailRow label="Alternate Phone Number" value={(staff as any)?.alternate_phone_number || '-'} />
                <DetailRow label="Residence" value={(staff as any)?.residence || '-'} />
              </div>
            </div>
          </div>
        </div>
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
