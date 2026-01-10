import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import DashboardLayout from '../../components/DashboardLayout';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';

interface StudentRow {
  id: string;
  roll_no: string;
  name: string;
  mentorName: string;
  odCount: number;
  leaveCount: number;
}

const romanToNumber: Record<string, number> = { I: 1, II: 2, III: 3, IV: 4 };

export default function HODStudentsPage() {
  const { profile } = useAuth();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [year, setYear] = useState(() => searchParams.get('year') || 'I');
  const [section, setSection] = useState(() => searchParams.get('section') || 'A');
  const [students, setStudents] = useState<StudentRow[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const load = async () => {
      if (!profile?.department) return;
      setLoading(true);
      try {
        const yearNum = romanToNumber[year] || null;
        // select students and join their profile (name + department)
        let q = supabase
          .from('students')
          .select('id, roll_no, year, section, mentor_id, profiles:profiles!students_id_fkey(name, department)')
          // filter by the joined profile's department (students table doesn't have department)
          .eq('profiles.department', profile.department)
          .order('roll_no');

        if (yearNum) q = q.eq('year', yearNum);
        if (section) q = q.eq('section', section);

        const { data: studs, error } = await q;
        if (error) throw error;

        const rows: StudentRow[] = (studs || []).map((s: any) => {
          const profAny = Array.isArray(s.profiles) ? s.profiles[0] : s.profiles;
          return {
            id: s.id,
            roll_no: s.roll_no || '-',
            name: profAny?.name || '-',
            mentorName: '-',
            odCount: 0,
            leaveCount: 0,
          };
        });

        // gather ids for mentor lookup and application counts
        const studentIds = (studs || []).map((s: any) => s.id).filter(Boolean);
        const mentorIds = Array.from(new Set((studs || []).map((s: any) => s.mentor_id).filter(Boolean)));

        // fetch mentor names
        const mentorMap = new Map<string, string>();
        if (mentorIds.length > 0) {
          const { data: mentors } = await supabase.from('profiles').select('id, name').in('id', mentorIds);
          (mentors || []).forEach((m: any) => mentorMap.set(m.id, m.name));
        }

        // fetch OD counts and Leave counts in batch
        const odMap = new Map<string, number>();
        const leaveMap = new Map<string, number>();
        if (studentIds.length > 0) {
          const { data: ods } = await supabase.from('od_applications').select('student_id').in('student_id', studentIds);
          (ods || []).forEach((o: any) => odMap.set(o.student_id, (odMap.get(o.student_id) || 0) + 1));

          const { data: leaves } = await supabase.from('leave_applications').select('student_id').in('student_id', studentIds);
          (leaves || []).forEach((l: any) => leaveMap.set(l.student_id, (leaveMap.get(l.student_id) || 0) + 1));
        }

        // merge into rows
        const merged = rows.map((r) => ({
          ...r,
          mentorName: (studs || []).find((s: any) => s.id === r.id)?.mentor_id ? mentorMap.get((studs || []).find((s: any) => s.id === r.id)?.mentor_id) || '-' : '-',
          odCount: odMap.get(r.id) || 0,
          leaveCount: leaveMap.get(r.id) || 0,
        }));

        setStudents(merged);
      } catch (err) {
        console.error('Error loading students:', err);
        setStudents([]);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [profile?.department, year, section]);

  // keep URL in sync with selected filters
  useEffect(() => {
    setSearchParams({ year, section });
  }, [year, section, setSearchParams]);

  return (
    <DashboardLayout>
      <div className="max-w-6xl mx-auto">
        <div className="mb-6">
          <h1 className="text-2xl font-semibold text-slate-800">Students</h1>
        </div>

        <div className="flex flex-col sm:flex-row sm:items-center sm:gap-4 gap-3 mb-6">
          <div>
            <label className="block text-sm text-slate-600 mb-1">Year</label>
            <select
              value={year}
              onChange={(e) => setYear(e.target.value)}
              className="border border-slate-300 rounded-lg px-3 py-2 text-sm w-full sm:w-40"
            >
              <option value="I">I</option>
              <option value="II">II</option>
              <option value="III">III</option>
              <option value="IV">IV</option>
            </select>
          </div>

          <div>
            <label className="block text-sm text-slate-600 mb-1">Section</label>
            <select
              value={section}
              onChange={(e) => setSection(e.target.value)}
              className="border border-slate-300 rounded-lg px-3 py-2 text-sm w-full sm:w-40"
            >
              <option value="A">A</option>
              <option value="B">B</option>
              <option value="C">C</option>
            </select>
          </div>
        </div>

        <div className="bg-white p-6 rounded-xl shadow">
          <div className="overflow-x-auto">
            <table className="table-auto w-full">
              <thead>
                <tr className="bg-gray-100 font-semibold text-gray-700">
                  <th className="px-4 py-2 text-left">Roll Number</th>
                  <th className="px-4 py-2 text-left">Name</th>
                  <th className="px-4 py-2 text-left">Mentor Name</th>
                  <th className="px-4 py-2 text-left">OD Count</th>
                  <th className="px-4 py-2 text-left">Leave Count</th>
                  <th className="px-4 py-2 text-left">Profile</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan={6} className="px-4 py-6 text-center text-slate-600">Loading students...</td>
                  </tr>
                ) : students.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-4 py-6 text-center text-slate-600">No students found.</td>
                  </tr>
                ) : (
                  students.map((s) => (
                    <tr key={s.id} className="hover:bg-gray-50">
                      <td className="px-4 py-3">{s.roll_no}</td>
                      <td className="px-4 py-3">{s.name}</td>
                      <td className="px-4 py-3">{s.mentorName}</td>
                      <td className="px-4 py-3">{s.odCount}</td>
                      <td className="px-4 py-3">{s.leaveCount}</td>
                      <td className="px-4 py-3">
                        <button
                          onClick={() => navigate(`/hod/student/${s.id}?year=${encodeURIComponent(year)}&section=${encodeURIComponent(section)}`)}
                          className="px-3 py-1 bg-blue-600 text-white rounded hover:bg-blue-700"
                        >
                          View
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}
