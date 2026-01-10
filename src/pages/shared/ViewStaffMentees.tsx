import { useEffect, useState } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import DashboardLayout from '../../components/DashboardLayout';
import Loader from '../../components/Loader';
import { supabase } from '../../lib/supabase';

interface Student {
  id: string;
  reg_no: string;
  roll_no: string;
  year: number;
  section: string;
  profiles: { name: string; department: string }[] | { name: string; department: string } | null;
}

interface StaffProfile {
  id: string;
  name: string;
  department: string;
}

export default function ViewStaffMentees() {
  const { staffId } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const [staff, setStaff] = useState<StaffProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [students, setStudents] = useState<Student[]>([]);

  useEffect(() => {
    const load = async () => {
      if (!staffId) return;
      setLoading(true);
      try {
        const { data: prof } = await supabase
          .from('profiles')
          .select('id, name, department')
          .eq('id', staffId)
          .maybeSingle();
        if (prof) setStaff(prof as any);

        const { data: studs } = await supabase
          .from('students')
          .select(`id, reg_no, roll_no, year, section, profiles:profiles!students_id_fkey(name, department)`) // alias join
          .eq('mentor_id', staffId)
          .order('roll_no');
        setStudents((studs || []) as any);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [staffId]);

  const handleGoBack = () => {
    // Try to go back in history, otherwise fallback to appropriate staff page
    if (window.history.length > 1) {
      navigate(-1);
    } else {
      // Fallback based on current path
      if (location.pathname.startsWith('/hod/')) {
        navigate('/hod/staff');
      } else if (location.pathname.startsWith('/ahod/')) {
        navigate('/ahod/staff');
      } else if (location.pathname.startsWith('/principal/')) {
        navigate('/principal/staff-details');
      } else {
        navigate('/dashboard');
      }
    }
  };

  return (
    <DashboardLayout>
      <div className="max-w-5xl mx-auto px-4 sm:px-6">
        <div className="mb-4 sm:mb-6 flex items-center justify-between">
          <div>
            <h1 className="text-xl sm:text-2xl font-bold text-slate-800">Mentees</h1>
            {staff && (
              <p className="text-slate-600 text-sm">Mentor: {staff.name} • Dept: {staff.department}</p>
            )}
          </div>
          <button onClick={handleGoBack} className="text-blue-600 hover:text-blue-700 text-sm">Back</button>
        </div>

        {loading ? (
          <Loader message="Loading mentees..." />
        ) : students.length === 0 ? (
          <div className="bg-white border border-slate-200 rounded-lg p-6 text-slate-600">No mentees found.</div>
        ) : (
          <>
            {/* Desktop/tablet table */}
            <div className="hidden lg:block bg-white rounded-lg shadow border border-slate-200 overflow-x-auto">
              <table className="min-w-full table-auto text-sm">
                <thead>
                  <tr className="bg-slate-50 text-slate-600">
                    <th className="px-4 py-2 text-left">Roll No</th>
                    <th className="px-4 py-2 text-left">Reg No</th>
                    <th className="px-4 py-2 text-left">Name</th>
                    <th className="px-4 py-2 text-left">Year</th>
                    <th className="px-4 py-2 text-left">Section</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {students.map((s) => {
                    const profAny = (Array.isArray(s.profiles) ? s.profiles[0] : s.profiles) as any;
                    return (
                      <tr key={s.id} className="hover:bg-slate-50">
                        <td className="px-4 py-2">{s.roll_no}</td>
                        <td className="px-4 py-2">{s.reg_no}</td>
                        <td className="px-4 py-2">{profAny?.name}</td>
                        <td className="px-4 py-2">{s.year}</td>
                        <td className="px-4 py-2">{s.section}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Mobile card list */}
            <div className="lg:hidden space-y-3">
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
                <div className="text-xs sm:text-sm text-slate-700">
                  <span className="font-medium">Department:</span> {staff?.department}
                </div>
              </div>

              {students.map((s) => {
                const profAny = (Array.isArray(s.profiles) ? s.profiles[0] : s.profiles) as any;
                return (
                  <div key={s.id} className="bg-white rounded-lg shadow border border-slate-200 p-3">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-semibold text-slate-900 truncate">{profAny?.name}</div>
                        <div className="mt-1 text-[11px] text-slate-600 flex flex-wrap gap-x-2 gap-y-0.5">
                          <span>Roll: {s.roll_no}</span>
                          <span>•</span>
                          <span>Reg: {s.reg_no}</span>
                          <span>•</span>
                          <span>Y{s.year}-{s.section}</span>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        )}
      </div>
    </DashboardLayout>
  );
}
