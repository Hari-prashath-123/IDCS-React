import { useEffect, useState } from 'react';
import DashboardLayout from '../../components/DashboardLayout';
import { useAuth } from '../../contexts/AuthContext';
import { supabase } from '../../lib/supabase';
import { MessageSquare, Lock } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

interface FeedbackForm {
  id: string;
  title: string;
  description?: string | null;
  created_at: string;
  created_by: string; // profile id
  active: boolean;
  closes_at?: string | null;
}

export default function StudentFeedbacks() {
  const { profile } = useAuth();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [forms, setForms] = useState<FeedbackForm[]>([]);
  const [submittedFormIds, setSubmittedFormIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!profile) return;
    const load = async () => {
      setLoading(true);
      setError(null);
      try {
        // Assumed schema: feedback_forms(active boolean, title text, description text, created_by uuid, closes_at timestamptz)
        // Filter: active = true AND created_by belongs to a HOD profile.
        // We'll first fetch HOD profile IDs.
        const { data: hodProfiles, error: hodErr } = await supabase
          .from('profiles')
          .select('id, role')
          .eq('role', 'hod');
        if (hodErr) throw hodErr;
        const hodIds = (hodProfiles || []).map(p => p.id);
        if (!hodIds.length) {
          setForms([]);
          setLoading(false);
          return;
        }
        const { data: feedbackData, error: fErr } = await supabase
          .from('feedback_forms')
          .select('id, title, description, created_at, created_by, active, closes_at, target_year, target_section, target_subject')
          .eq('active', true)
          .in('created_by', hodIds)
          .order('created_at', { ascending: false });
        if (fErr) throw fErr;
        // Filter forms by student's year and section when target is set
        const raw: any[] = (feedbackData || []);
        const studentRow = await supabase.from('students').select('year, section').eq('id', profile.id).maybeSingle();
        const year = studentRow.data?.year || null;
        const section = studentRow.data?.section || null;
        const filtered = raw.filter(f => {
          const ty = f.target_year ?? null;
          const ts = f.target_section ?? null;
          const yearOk = ty === null || ty === undefined || ty === year;
          const sectionOk = !ts || ts === section;
          return yearOk && sectionOk;
        });
        setForms(filtered as FeedbackForm[]);

        // Check which forms the student has already submitted
        const formIds = filtered.map(f => f.id);
        if (formIds.length > 0) {
          const { data: responses } = await supabase
            .from('feedback_responses')
            .select('form_id')
            .eq('student_id', profile.id)
            .in('form_id', formIds);
          
          const submitted = new Set((responses || []).map(r => r.form_id));
          setSubmittedFormIds(submitted);
        }
      } catch (e: any) {
        console.error('Error loading feedback forms:', e);
        setError(e.message || 'Failed to load feedback forms');
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [profile]);

  return (
    <DashboardLayout>
      <div className="max-w-5xl mx-auto px-4 sm:px-6">
        <div className="mb-6 flex items-center gap-3">
          <div className="bg-blue-100 text-blue-600 p-2 sm:p-3 rounded-lg"><MessageSquare className="h-5 w-5 sm:h-6 sm:w-6" /></div>
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold text-slate-800">Feedback</h1>
            <p className="text-sm sm:text-base text-slate-600 mt-1">Active feedback forms created by HOD</p>
          </div>
        </div>

        <div className="bg-white rounded-xl shadow-lg border border-slate-200 p-4 sm:p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg sm:text-xl font-semibold text-slate-800">Active Forms</h2>
          </div>
          {loading ? (
            <div className="py-12 text-center text-slate-600">Loading feedback forms…</div>
          ) : error ? (
            <div className="p-4 bg-red-50 border border-red-200 rounded text-red-700 text-sm">{error}</div>
          ) : forms.length === 0 ? (
            <div className="py-12 text-center text-slate-500">No active feedback forms right now.</div>
          ) : (
            <ul className="divide-y divide-slate-200">
              {forms.map(f => {
                const closingSoon = f.closes_at ? new Date(f.closes_at).getTime() - Date.now() < 48 * 3600 * 1000 : false;
                const isSubmitted = submittedFormIds.has(f.id);
                return (
                  <li key={f.id} className={`py-3 flex items-center justify-between gap-3 ${isSubmitted ? 'opacity-70' : ''}`}>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <h3 className="text-sm sm:text-base font-semibold text-slate-800">{f.title}</h3>
                        {isSubmitted && (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 text-xs rounded-full bg-green-100 text-green-700 font-medium">
                            <Lock className="h-3 w-3" />
                            Submitted
                          </span>
                        )}
                        {!isSubmitted && closingSoon && (
                          <span className="inline-block px-2 py-0.5 text-xs rounded-full bg-orange-100 text-orange-700">Closing Soon</span>
                        )}
                      </div>
                      {f.description && (
                        <p className="text-xs sm:text-sm text-slate-600 mt-0.5 line-clamp-2">{f.description}</p>
                      )}
                      <p className="mt-0.5 text-xs text-slate-400">Opened {new Date(f.created_at).toLocaleDateString()}{f.closes_at ? ` • Closes ${new Date(f.closes_at).toLocaleDateString()}` : ''}</p>
                    </div>
                    <button
                      onClick={() => navigate(`/student/feedback/${encodeURIComponent(f.id)}`)}
                      className={`px-3 sm:px-4 py-2 rounded-lg text-xs sm:text-sm font-medium focus:ring-4 whitespace-nowrap flex-shrink-0 transition-colors ${
                        isSubmitted
                          ? 'bg-slate-200 text-slate-600 cursor-default'
                          : 'bg-blue-600 text-white hover:bg-blue-700 focus:ring-blue-200'
                      }`}
                    >
                      {isSubmitted ? 'View' : 'Fill'}
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>
    </DashboardLayout>
  );
}
