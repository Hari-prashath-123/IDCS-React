import { useEffect, useState } from 'react';
import DashboardLayout from '../../components/DashboardLayout';
import Loader from '../../components/Loader';
import { useAuth } from '../../contexts/AuthContext';
import { supabase } from '../../lib/supabase';

interface Subject {
  id: string;
  subject_code: string;
  name: string;
  staff_id: string | null;
  year: number;
  section?: string;
  department: string;
  credits: number;
}

export default function AHODSubjects() {
  const { profile } = useAuth();
  const [loading, setLoading] = useState(true);
  const [subjectsByYear, setSubjectsByYear] = useState<Record<number, Subject[]>>({});
  const [error, setError] = useState<string | null>(null);
  const [staffMap, setStaffMap] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!profile) return;

    const load = async () => {
      setLoading(true);
      try {
        // Expect profile.department to contain department code/name
        const dept = (profile as any).department;
        if (!dept) {
          setError('Your profile does not have a department set.');
          setSubjectsByYear({});
          return;
        }

        const { data: subjData, error: subjErr } = await supabase
          .from('subjects')
          .select('*')
          .eq('department', dept)
          .order('year', { ascending: true })
          .order('subject_code', { ascending: true });

        if (subjErr) {
          console.warn('Subjects read error (table may not exist):', subjErr.message || subjErr);
          setSubjectsByYear({});
        } else {
          const rows = (subjData || []) as Subject[];
          const grouped: Record<number, Subject[]> = {};
          for (const r of rows) {
            const y = r.year || 0;
            if (!grouped[y]) grouped[y] = [];
            grouped[y].push(r);
          }
          setSubjectsByYear(grouped);

          // Build staff id -> name map
          const staffIds = Array.from(new Set(rows.map(r => r.staff_id).filter(Boolean) as string[]));
          if (staffIds.length > 0) {
            const { data: staffProfiles, error: staffErr } = await supabase
              .from('profiles')
              .select('id, name')
              .in('id', staffIds);
            if (!staffErr && staffProfiles) {
              const map: Record<string, string> = {};
              for (const p of staffProfiles as any[]) map[p.id] = p.name;
              setStaffMap(map);
            }
          } else {
            setStaffMap({});
          }
        }
      } catch (err: any) {
        console.error('Error loading AHOD subjects:', err);
        setError(err.message || String(err));
      } finally {
        setLoading(false);
      }
    };

    load();
  }, [profile]);

  return (
    <DashboardLayout>
      <div className="max-w-4xl mx-auto">
        <div className="mb-6">
          <h1 className="text-3xl font-bold text-slate-800">Subjects — Department</h1>
          <p className="text-slate-600 mt-1">Showing subjects for your department grouped by year</p>
        </div>

        {loading ? (
          <Loader message="Loading subjects..." />
        ) : error ? (
          <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-2 rounded">{error}</div>
        ) : (
          <div>
            {Object.keys(subjectsByYear).length === 0 ? (
              <div className="bg-white rounded-xl shadow-lg border border-slate-200 p-6 text-center">
                <p className="text-slate-500">No subjects found for your department</p>
              </div>
            ) : (
              <div className="space-y-6">
                {Object.keys(subjectsByYear)
                  .map((k) => Number(k))
                  .sort((a, b) => a - b)
                  .map((year) => (
                    <div key={year} className="bg-white rounded-xl shadow-lg border border-slate-200 p-4">
                      <h3 className="text-lg font-semibold mb-3">Year {year}</h3>
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="text-left text-slate-600">
                            <th className="py-2">Code</th>
                            <th className="py-2">Name</th>
                            <th className="py-2">Staff</th>
                            <th className="py-2">Section</th>
                            <th className="py-2">Credits</th>
                          </tr>
                        </thead>
                        <tbody>
                          {subjectsByYear[year].map((s) => (
                            <tr key={s.id} className="border-t">
                              <td className="py-2">{s.subject_code}</td>
                              <td className="py-2">{s.name}</td>
                              <td className="py-2">{s.staff_id ? (staffMap[s.staff_id] || s.staff_id) : '-'}</td>
                              <td className="py-2">{s.section || '-'}</td>
                              <td className="py-2">{s.credits}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  ))}
              </div>
            )}
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}
