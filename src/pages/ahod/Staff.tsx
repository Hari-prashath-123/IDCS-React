import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { BookOpen, Users } from 'lucide-react';
import DashboardLayout from '../../components/DashboardLayout';
import Loader from '../../components/Loader';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';

interface StaffRow {
  id: string;
  name: string;
  email: string;
  role: string;
  staff_role: string | null;
  year: number | null;
  section: string | null;
}

export default function AHODStaffPage() {
  const { profile } = useAuth();
  const navigate = useNavigate();
  const [list, setList] = useState<StaffRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState('');

  useEffect(() => {
    if (!profile?.department) return;
    const load = async () => {
      setLoading(true);
      try {
        const { data: profiles } = await supabase
          .from('profiles')
          .select('id, name, email, role, department')
          .eq('department', profile.department)
          .in('role', ['staff','ahod','hod']);

        const ids = (profiles || []).map((p: any) => p.id);
        let staffRows: any[] = [];
        if (ids.length) {
          const { data: sRows } = await supabase
            .from('staff')
            .select('id, staff_role, year, section')
            .in('id', ids);
          staffRows = sRows || [];
        }
        const byId = new Map(staffRows.map((s) => [s.id, s]));
        const combined: StaffRow[] = profiles.map((p: any) => {
          const s = byId.get(p.id);
          return {
            id: p.id,
            name: p.name,
            email: p.email,
            role: p.role,
            staff_role: s?.staff_role || p.role || 'staff',
            year: s?.year ?? null,
            section: s?.section ?? null,
          };
        });
        combined.sort((a, b) => a.name.localeCompare(b.name));
        setList(combined);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [profile?.department]);

  const filtered = list.filter((r) => {
    const t = (r.name + ' ' + r.email + ' ' + r.staff_role).toLowerCase();
    return t.includes(q.toLowerCase());
  });

  return (
    <DashboardLayout>
      <div className="max-w-6xl mx-auto">
        <div className="mb-4 sm:mb-6 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div>
            <h1 className="text-xl sm:text-2xl font-bold text-slate-800">Staff</h1>
            <p className="text-sm text-slate-600">All staff in {profile?.department}</p>
          </div>
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search by name, email, role..."
            className="w-full sm:w-72 border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>

        {loading ? (
          <Loader message="Loading staff..." />
        ) : (
          <>
            {/* Desktop/tablet table */}
            <div className="hidden sm:block bg-white rounded-lg shadow border border-slate-200 overflow-x-auto">
              <table className="min-w-[720px] sm:min-w-full table-auto text-sm">
                <thead>
                  <tr className="bg-slate-50 text-slate-600">
                    <th className="px-4 py-2 text-left">Name</th>
                    <th className="px-4 py-2 text-left">Email</th>
                    <th className="px-4 py-2 text-left">Role</th>
                    <th className="px-4 py-2 text-left">Advisor Class</th>
                    <th className="px-4 py-2 text-left">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {filtered.map((r) => {
                    const isAdvisor = r.staff_role === 'advisor' && r.year && r.section;
                    return (
                      <tr key={r.id} className="hover:bg-slate-50">
                        <td className="px-4 py-2">{r.name}</td>
                        <td className="px-4 py-2">{r.email}</td>
                        <td className="px-4 py-2 capitalize">{r.staff_role || r.role}</td>
                        <td className="px-4 py-2">{isAdvisor ? `Y${r.year}-${r.section}` : '—'}</td>
                        <td className="px-4 py-2">
                          <div className="flex gap-2">
                            <button
                              onClick={() => navigate(`/ahod/staff/${r.id}/timetable`)}
                              className="inline-flex items-center gap-1 sm:gap-2 px-2 sm:px-3 py-1.5 text-xs sm:text-sm bg-blue-600 text-white rounded hover:bg-blue-700"
                              title="View Timetable"
                            >
                              <BookOpen className="w-4 h-4" />
                              <span className="hidden sm:inline">View Timetable</span>
                            </button>
                            <button
                              onClick={() => navigate(`/ahod/staff/${r.id}/mentees`)}
                              className="inline-flex items-center gap-1 sm:gap-2 px-2 sm:px-3 py-1.5 text-xs sm:text-sm bg-slate-700 text-white rounded hover:bg-slate-800"
                              title="View Mentees"
                            >
                              <Users className="w-4 h-4" />
                              <span className="hidden sm:inline">View Mentees</span>
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Mobile card list */}
            <div className="sm:hidden space-y-3">
              {filtered.map((r) => {
                const isAdvisor = r.staff_role === 'advisor' && r.year && r.section;
                return (
                  <div key={r.id} className="bg-white rounded-lg shadow border border-slate-200 p-3">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="text-sm font-semibold text-slate-900 truncate">{r.name}</div>
                        <div className="text-xs text-slate-600 truncate">{r.email}</div>
                        <div className="mt-1 text-[11px] text-slate-600 flex flex-wrap gap-x-2 gap-y-0.5">
                          <span className="capitalize">{r.staff_role || r.role}</span>
                          <span>•</span>
                          <span>Advisor: {isAdvisor ? `Y${r.year}-${r.section}` : '—'}</span>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 flex-shrink-0">
                        <button
                          onClick={() => navigate(`/ahod/staff/${r.id}/timetable`)}
                          className="p-2 rounded bg-blue-600 text-white hover:bg-blue-700"
                          title="View Timetable"
                        >
                          <BookOpen className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => navigate(`/ahod/staff/${r.id}/mentees`)}
                          className="p-2 rounded bg-slate-700 text-white hover:bg-slate-800"
                          title="View Mentees"
                        >
                          <Users className="w-4 h-4" />
                        </button>
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
