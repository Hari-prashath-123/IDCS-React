import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import DashboardLayout from '../../components/DashboardLayout';
import { supabase } from '../../lib/supabase';

export default function HODStudentProfile() {
  const { studentId } = useParams();
  const [loading, setLoading] = useState(true);
  const [student, setStudent] = useState<any>(null);
  const [mentorName, setMentorName] = useState<string | null>(null);
  const [odCount, setOdCount] = useState<number>(0);
  const [leaveCount, setLeaveCount] = useState<number>(0);

  useEffect(() => {
    let mounted = true;
    const load = async () => {
      if (!studentId) return;
      setLoading(true);
      try {
        const { data: s } = await supabase.from('students').select('*').eq('id', studentId).maybeSingle();
        if (!mounted) return;
        setStudent(s || null);

        if (s?.mentor_id) {
          const { data: m } = await supabase.from('profiles').select('name').eq('id', s.mentor_id).maybeSingle();
          setMentorName(m?.name || null);
        }

        const { data: ods } = await supabase.from('od_applications').select('id').eq('student_id', studentId);
        setOdCount((ods || []).length);
        const { data: leaves } = await supabase.from('leave_applications').select('id').eq('student_id', studentId);
        setLeaveCount((leaves || []).length);
      } catch (e) {
        console.error('Failed to load student profile', e);
        setStudent(null);
      } finally {
        setLoading(false);
      }
    };
    load();
    return () => {
      mounted = false;
    };
  }, [studentId]);

  return (
    <DashboardLayout>
      <div className="max-w-4xl mx-auto">
        <div className="mb-6">
          <h1 className="text-2xl font-semibold text-slate-800">Student Profile</h1>
        </div>

        <div className="bg-white p-6 rounded-xl shadow">
          {loading ? (
            <div className="text-slate-600">Loading...</div>
          ) : !student ? (
            <div className="text-slate-600">Student not found.</div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
              <div>
                <div className="text-slate-500">Roll Number</div>
                <div className="font-medium text-slate-800">{student.roll_no || '-'}</div>
              </div>
              <div>
                <div className="text-slate-500">Name</div>
                <div className="font-medium text-slate-800">{student.name || student.id || '-'}</div>
              </div>
              <div>
                <div className="text-slate-500">Mentor</div>
                <div className="font-medium text-slate-800">{mentorName || '-'}</div>
              </div>
              <div>
                <div className="text-slate-500">OD Count</div>
                <div className="font-medium text-slate-800">{odCount}</div>
              </div>
              <div>
                <div className="text-slate-500">Leave Count</div>
                <div className="font-medium text-slate-800">{leaveCount}</div>
              </div>
            </div>
          )}
        </div>
      </div>
    </DashboardLayout>
  );
}
