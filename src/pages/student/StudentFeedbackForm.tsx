import { useEffect, useState } from 'react';
import DashboardLayout from '../../components/DashboardLayout';
import { useParams, useNavigate } from 'react-router-dom';
import api from '../../lib/api';
import { useAuth } from '../../contexts/AuthContext';

interface FeedbackForm {
  id: string;
  title: string;
  description?: string | null;
  active: boolean;
  closes_at?: string | null;
}

export default function StudentFeedbackForm() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { profile } = useAuth();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState<FeedbackForm | null>(null);
  const [answers, setAnswers] = useState<Record<string,string>>({});
  const [submitting, setSubmitting] = useState(false);

  // Placeholder: assumed feedback_questions table with form_id, id, question_text, order
  const [questions, setQuestions] = useState<Array<{ id: string; question_text: string }>>([]);
  const [formDefaultStaff, setFormDefaultStaff] = useState<{ id: string | null; name: string } | null>(null);
  const [rating, setRating] = useState<number | null>(null);
  const [comments, setComments] = useState('');
  const [alreadySubmitted, setAlreadySubmitted] = useState(false);
  const [existingResponse, setExistingResponse] = useState<any | null>(null);

  useEffect(() => {
    if (!profile || !id) return;
    const load = async () => {
      setLoading(true);
      setError(null);
      try {
        // Fetch form details
        const resp = await api.get(`/feedback/forms/${id}/`);
        const formData = resp.data;
        if (!formData || !formData.active) {
          setError('Feedback form not found or inactive');
          setLoading(false);
          return;
        }
        setForm(formData as FeedbackForm);
        // Fetch questions
        const qResp = await api.get(`/feedback/forms/${id}/questions/`);
        setQuestions(qResp.data || []);
        // Fetch default staff for this form
        if (formData.default_staff) setFormDefaultStaff(formData.default_staff);
        // Check if already submitted
        try {
          const subResp = await api.get(`/feedback/responses/status/`, {
            params: { form_id: id, student_id: profile.id }
          });
          if (subResp.data?.submitted) {
            setAlreadySubmitted(true);
            setExistingResponse(subResp.data.response);
            setRating(subResp.data.response?.rating || null);
            setComments(subResp.data.response?.comments || '');
            const ansMap: Record<string,string> = {};
            (subResp.data.response?.answers || []).forEach((a: any) => { ansMap[a.question_id] = a.answer; });
            setAnswers(ansMap);
          }
        } catch (er) {
          console.warn('Failed to check existing response', er);
        }
      } catch (e: any) {
        setError(e?.response?.data?.detail || e.message || 'Failed to load form');
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [profile, id]);

  const handleSubmit = async () => {
    if (!profile || !form) return;
    setSubmitting(true);
    try {
      // Construct answers array for API
      const answersArr = questions.map(q => ({ question: q.id, answer: answers[q.id] || '' }));
      const payload: any = {
        form: form.id,
        student: profile.id,
        staff_selected: formDefaultStaff ? formDefaultStaff : null,
        rating: rating,
        comments: comments || null,
        answers: answersArr,
      };
      await api.post('/feedback/responses/', payload);
      setAlreadySubmitted(true);
      navigate('/student/feedback');
    } catch (e: any) {
      setError(e?.response?.data?.detail || e.message || 'Failed to submit answers');
    } finally {
      setSubmitting(false);
    }
  };

  // no local staff addition on student form; HOD defines staff

  return (
    <DashboardLayout>
      <div className="max-w-3xl mx-auto px-4 sm:px-6">
        {loading ? (
          <div className="py-16 text-center text-slate-600">Loading form…</div>
        ) : error ? (
          <div className="bg-red-50 border border-red-200 p-4 rounded text-red-700 text-sm">{error}</div>
        ) : form ? (
          <div className="space-y-6">
            {alreadySubmitted && (
              <div className="bg-green-50 border border-green-200 p-3 rounded text-green-700 text-sm font-medium flex items-center gap-2">
                <svg className="h-5 w-5 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd"/>
                </svg>
                <span>You have already submitted this feedback{existingResponse?.created_at ? ` on ${new Date(existingResponse.created_at).toLocaleString()}` : ''}. The form is now locked.</span>
              </div>
            )}
            <div>
              <h1 className="text-2xl sm:text-3xl font-bold text-slate-800">{form.title}</h1>
              {form.description && <p className="mt-2 text-sm sm:text-base text-slate-600">{form.description}</p>}
              {form.closes_at && (
                <p className="mt-1 text-xs text-slate-500">Closes {new Date(form.closes_at).toLocaleString()}</p>
              )}
              <div className={`mt-4 border p-4 rounded-lg ${alreadySubmitted ? 'bg-slate-50 border-slate-200' : 'bg-white border-slate-100'}`}>
                <label className="text-sm font-medium text-slate-700">Staff</label>
                <div className="mt-2 text-sm text-slate-600">{formDefaultStaff ? formDefaultStaff.name : '—'}</div>

                <div className="mt-4">
                  <label className="text-sm font-medium text-slate-700">Rating</label>
                  <div className="mt-2 flex items-center gap-2 flex-wrap">
                    {[1,2,3,4,5].map((n) => (
                      <button 
                        key={n} 
                        type="button" 
                        onClick={() => !alreadySubmitted && setRating(n)} 
                        disabled={alreadySubmitted}
                        className={`px-3 py-1 rounded text-sm transition-colors ${
                          rating === n 
                            ? 'bg-yellow-400 text-slate-800' 
                            : alreadySubmitted 
                              ? 'bg-slate-200 text-slate-400 cursor-not-allowed' 
                              : 'bg-slate-100 hover:bg-slate-200'
                        }`}
                      >
                        {n} ★
                      </button>
                    ))}
                  </div>
                </div>

                <div className="mt-4">
                  <label className="text-sm font-medium text-slate-700">Comments (optional)</label>
                  <textarea 
                    value={comments} 
                    onChange={e => !alreadySubmitted && setComments(e.target.value)} 
                    rows={3} 
                    disabled={alreadySubmitted}
                    className={`w-full mt-2 px-3 py-2 border rounded-lg text-sm ${
                      alreadySubmitted 
                        ? 'bg-slate-100 border-slate-200 text-slate-600 cursor-not-allowed' 
                        : 'border-slate-300 focus:ring-2 focus:ring-blue-500 focus:border-transparent'
                    }`}
                    placeholder={alreadySubmitted ? '' : 'Your comments...'}
                  />
                </div>
              </div>
            </div>
            <div className={`rounded-xl shadow-lg border p-4 sm:p-6 space-y-5 ${
              alreadySubmitted 
                ? 'bg-slate-50 border-slate-200' 
                : 'bg-white border-slate-200'
            }`}>
              {alreadySubmitted && (
                <div className="bg-amber-50 border border-amber-200 p-3 rounded-lg flex items-start gap-2">
                  <svg className="h-5 w-5 text-amber-600 flex-shrink-0 mt-0.5" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M5 9V7a5 5 0 0110 0v2a2 2 0 012 2v5a2 2 0 01-2 2H5a2 2 0 01-2-2v-5a2 2 0 012-2zm8-2v2H7V7a3 3 0 016 0z" clipRule="evenodd"/>
                  </svg>
                  <div className="flex-1">
                    <p className="text-sm font-medium text-amber-800">Form Locked</p>
                    <p className="text-xs text-amber-700 mt-0.5">This form has been submitted and can no longer be edited.</p>
                  </div>
                </div>
              )}
              {questions.length === 0 ? (
                <p className="text-sm text-slate-500">No questions defined for this form.</p>
              ) : (
                questions.map(q => (
                  <div key={q.id} className="space-y-2">
                    <label className="text-sm font-medium text-slate-700">{q.question_text}</label>
                    <textarea
                      rows={3}
                      className={`w-full px-3 py-2 border rounded-lg text-sm ${
                        alreadySubmitted
                          ? 'bg-slate-100 border-slate-200 text-slate-600 cursor-not-allowed'
                          : 'border-slate-300 focus:ring-2 focus:ring-blue-500 focus:border-transparent'
                      }`}
                      value={answers[q.id] || ''}
                      onChange={e => !alreadySubmitted && setAnswers(a => ({ ...a, [q.id]: e.target.value }))}
                      disabled={alreadySubmitted}
                      placeholder={alreadySubmitted ? '' : 'Your answer...'}
                    />
                  </div>
                ))
              )}
              <div className="pt-4 flex justify-end">
                <button
                  disabled={submitting || loading || alreadySubmitted}
                  onClick={handleSubmit}
                  className={`px-5 py-2 rounded-lg text-sm font-medium transition-colors ${
                    alreadySubmitted
                      ? 'bg-slate-300 text-slate-500 cursor-not-allowed'
                      : submitting
                        ? 'bg-blue-400 text-white cursor-wait'
                        : 'bg-blue-600 text-white hover:bg-blue-700'
                  }`}
                >
                  {alreadySubmitted ? '✓ Submitted' : (submitting ? 'Submitting...' : 'Submit Feedback')}
                </button>
              </div>
            </div>
          </div>
        ) : null}
      </div>
    </DashboardLayout>
  );
}
