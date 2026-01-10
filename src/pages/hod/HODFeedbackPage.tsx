import { useEffect, useState } from 'react';
import DashboardLayout from '../../components/DashboardLayout';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { MessageSquare, PlusCircle } from 'lucide-react';

interface StaffOption { id: string | null; name: string; }

export default function HODFeedbackPage() {
  const { user, profile } = useAuth();
  const [loading, setLoading] = useState(true);
  const [forms, setForms] = useState<any[]>([]);
  // staffOptions not stored separately here; individual staff list loaded into staffList

  // New form state
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [staffList, setStaffList] = useState<StaffOption[]>([]);
  const [defaultStaff, setDefaultStaff] = useState<StaffOption | null>(null);
  const [newStaffName, setNewStaffName] = useState('');
  const [years, setYears] = useState<number[]>([]);
  const [sections, setSections] = useState<string[]>([]);
  const [selectedYear, setSelectedYear] = useState<number | null>(null);
  const [selectedSection, setSelectedSection] = useState<string | null>(null);
  const [subjectsList, setSubjectsList] = useState<Array<{ id: string; name: string; subject_code?: string; staff_id?: string | null; year?: number; section?: string }>>([]);
  const [selectedSubjectId, setSelectedSubjectId] = useState<string | 'other' | null>(null);
  const [customSubjectName, setCustomSubjectName] = useState('');
  
  const [questions, setQuestions] = useState<string[]>([
    'How was the class interaction? (1-5)',
    'Was the material clear and helpful?',
    'Any suggestions to improve?'
  ]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<'create' | 'results'>('create');
  const [selectedFormId, setSelectedFormId] = useState<string | null>(null);
  const [resultResponses, setResultResponses] = useState<any[] | null>(null);
  const [resultQuestions, setResultQuestions] = useState<Array<{ id: string; question_text: string }>>([]);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    if (!profile || !user) return;
    const load = async () => {
      setLoading(true);
      try {
        // load forms created by this HOD
        const { data: fData } = await supabase
          .from('feedback_forms')
          .select('id, title, description, created_at, active, default_staff')
          .eq('created_by', user.id)
          .order('created_at', { ascending: false });
        setForms((fData || []) as any[]);

        // load staff list to populate options
        const { data: staffData } = await supabase.from('staff').select('id, name').order('name', { ascending: true });
        const s = (staffData || []).map((s: any) => ({ id: s.id, name: s.name }));
        // also include department staff (profiles) for HOD's department
        let deptStaff: StaffOption[] = [];
        try {
          if (profile?.department) {
            const { data: deptData } = await supabase.from('profiles').select('id, name').eq('role', 'staff').eq('department', profile.department).order('name', { ascending: true });
            deptStaff = (deptData || []).map((d: any) => ({ id: d.id, name: d.name }));
          }
        } catch (er) {
          console.warn('Failed to load department staff', er);
        }
        const merged = [...s];
        for (const d of deptStaff) {
          if (!merged.find((m) => m.id === d.id)) merged.push(d);
        }
        setStaffList(merged);
        // load subjects for department to derive years/sections
        try {
          if (profile?.department) {
            const { data: subs } = await supabase.from('subjects').select('id, name, subject_code, staff_id, year, section').in('department', [profile.department, 'ALL']).order('subject_code', { ascending: true });
            const allSubs = (subs || []) as any[];
            const yrs = Array.from(new Set(allSubs.map(su => su.year).filter(Boolean))).sort((a,b)=>a-b) as number[];
            const secs = Array.from(new Set(allSubs.map(su => su.section).filter(Boolean))).sort() as string[];
            setYears(yrs);
            setSections(secs);
            setSubjectsList(allSubs as any);
          }
        } catch (er) {
          console.warn('Failed to load subjects for department', er);
        }
      } catch (e) {
        console.error('Error loading HOD feedback page:', e);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [profile, user]);

  // when switching to results view, ensure a form is selected and load its responses/questions
  useEffect(() => {
    if (viewMode !== 'results') return;
    let mounted = true;
    const loadDefault = async () => {
      if (!selectedFormId && forms.length > 0) {
        setSelectedFormId(forms[0].id);
        return;
      }
      if (!selectedFormId) return;
      setResultResponses(null);
      setResultQuestions([]);
      const r = await fetchResponsesForForm(selectedFormId);
      if (!mounted) return;
      setResultResponses(r as any[]);
      const { data: qData } = await supabase.from('feedback_questions').select('id, question_text').eq('form_id', selectedFormId).order('order', { ascending: true });
      if (!mounted) return;
      setResultQuestions((qData || []) as any);
    };
    loadDefault();
    return () => { mounted = false; };
  }, [viewMode, selectedFormId, forms]);

  const addNewStaffToList = () => {
    if (!newStaffName.trim()) return;
    const opt = { id: null, name: newStaffName.trim() };
    setStaffList((s) => [...s, opt]);
    setNewStaffName('');
  };

  const addQuestion = () => setQuestions((q) => [...q, '']);
  const updateQuestion = (idx: number, text: string) => setQuestions((q) => q.map((x,i) => i===idx?text:x));
  const removeQuestion = (idx:number) => setQuestions((q)=>q.filter((_,i)=>i!==idx));

  // when year or section changes, load subjects list filtered
  useEffect(() => {
    if (!profile || !profile.department) return;
    const load = async () => {
      try {
        let q = supabase.from('subjects').select('id, name, subject_code, staff_id, year, section').in('department', [profile.department, 'ALL']).order('subject_code', { ascending: true });
        if (selectedYear) q = q.eq('year', selectedYear);
        if (selectedSection) q = q.eq('section', selectedSection);
        const { data: subs } = await q;
        setSubjectsList((subs || []) as any);
      } catch (er) {
        console.warn('Failed to load filtered subjects', er);
        setSubjectsList([]);
      }
    };
    load();
  }, [selectedYear, selectedSection, profile]);

  // when subject is selected, auto-select related staff if available
  useEffect(() => {
    if (!selectedSubjectId || selectedSubjectId === 'other') return;
    const subj = subjectsList.find(s => s.id === selectedSubjectId);
    if (!subj) return;
    const staffId = subj.staff_id;
    if (!staffId) return;
    // find in staffList
    const found = staffList.find(s => s.id === staffId);
    if (found) {
      setDefaultStaff(found);
      return;
    }
    // try loading profile for this staff id and add to staffList
    (async () => {
      try {
        const { data: p } = await supabase.from('profiles').select('id, name').eq('id', staffId).maybeSingle();
        if (p) {
          const opt = { id: p.id, name: p.name };
          setStaffList(s => [...s, opt]);
          setDefaultStaff(opt);
        }
      } catch (er) {
        console.warn('Failed to load subject staff profile', er);
      }
    })();
  }, [selectedSubjectId, subjectsList, staffList]);

  const handleCreateForm = async () => {
    if (!profile || !user) return;
    if (!title.trim()) { setError('Please provide a title'); return; }
    setSaving(true);
    setError(null);
    try {
        const target_subject = selectedSubjectId === 'other' && customSubjectName ? { id: null, name: customSubjectName } : (subjectsList.find(s => s.id === selectedSubjectId) ? { id: selectedSubjectId, name: (subjectsList.find(s=>s.id===selectedSubjectId) as any).name } : null);
        const { data: formRow, error: fErr } = await supabase
          .from('feedback_forms')
          .insert([{ title: title.trim(), description: description.trim() || null, created_by: user.id, staff_options: staffList, default_staff: defaultStaff, target_year: selectedYear, target_section: selectedSection, target_subject }])
          .select('id')
          .maybeSingle();
      if (fErr) throw fErr;
      const formId = (formRow as any).id;
      // insert questions
      const qRows = questions.map((q, idx) => ({ form_id: formId, question_text: q, order: idx }));
      if (qRows.length) {
        const { error: qErr } = await supabase.from('feedback_questions').insert(qRows);
        if (qErr) throw qErr;
      }
      // reload forms
      const { data: fData } = await supabase
        .from('feedback_forms')
        .select('id, title, description, created_at, active, default_staff')
        .eq('created_by', user.id)
        .order('created_at', { ascending: false });
      setForms((fData || []) as any[]);
      // reset
      setTitle(''); setDescription(''); setStaffList([]); setQuestions([
        'How was the class interaction? (1-5)',
        'Was the material clear and helpful?',
        'Any suggestions to improve?'
      ]);
    } catch (e:any) {
      console.error('Error creating feedback form', e);
      setError(e.message || 'Failed to create form');
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteForm = async (formId: string | null) => {
    if (!formId) return;
    const ok = confirm('Delete this feedback form and all its responses? This action cannot be undone.');
    if (!ok) return;
    setDeleting(true);
    try {
      const { error: rErr } = await supabase.from('feedback_responses').delete().eq('form_id', formId);
      if (rErr) throw rErr;
      const { error: qErr } = await supabase.from('feedback_questions').delete().eq('form_id', formId);
      if (qErr) throw qErr;
      const { error: fErr } = await supabase.from('feedback_forms').delete().eq('id', formId);
      if (fErr) throw fErr;
      const { data: fData } = await supabase
        .from('feedback_forms')
        .select('id, title, description, created_at, active, default_staff')
        .eq('created_by', user?.id)
        .order('created_at', { ascending: false });
      setForms((fData || []) as any[]);
      setSelectedFormId(null);
      setResultResponses(null);
      setResultQuestions([]);
    } catch (err: any) {
      console.error('Failed to delete form', err);
      alert('Failed to delete form: ' + (err?.message || JSON.stringify(err)));
    } finally {
      setDeleting(false);
    }
  };

  const fetchResponsesForForm = async (formId: string) => {
    const { data } = await supabase
      .from('feedback_responses')
      .select('*')
      .eq('form_id', formId)
      .order('created_at', { ascending: false });
    
    // Fetch student names for all responses
    if (data && data.length > 0) {
      const studentIds = [...new Set(data.map(r => r.student_id))];
      const { data: studentsData } = await supabase
        .from('profiles')
        .select('id, name')
        .in('id', studentIds);
      
      const studentNamesMap = new Map(studentsData?.map(s => [s.id, s.name]) || []);
      
      // Add student names to responses
      return data.map(r => ({
        ...r,
        student_name: studentNamesMap.get(r.student_id) || r.student_id
      }));
    }
    
    return data || [];
  };

  // Form summary card removed from create flow - forms are accessed via Results view

  return (
    <DashboardLayout>
      <div className="max-w-5xl mx-auto">
        <div className="mb-6 flex items-center gap-3">
          <div className="bg-blue-100 text-blue-600 p-3 rounded-lg"><MessageSquare className="h-6 w-6" /></div>
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold text-slate-800">Manage Feedback Forms</h1>
            <p className="text-slate-600 mt-1 text-sm sm:text-base">Create feedback forms for your students and review responses</p>
          </div>
        </div>

        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-4">
          <div className="flex gap-2 w-full sm:w-auto">
            <button onClick={() => setViewMode('create')} className={`flex-1 sm:flex-none px-3 py-2 rounded-lg ${viewMode==='create'?'bg-blue-600 text-white':'bg-slate-100'}`}>Create</button>
            <button onClick={() => setViewMode('results')} className={`flex-1 sm:flex-none px-3 py-2 rounded-lg ${viewMode==='results'?'bg-blue-600 text-white':'bg-slate-100'}`}>Results</button>
          </div>
        </div>

        {viewMode === 'create' && (
          loading ? (
            <div className="py-8 text-center text-slate-600">Loading…</div>
          ) : (
            <div className="bg-white rounded-xl shadow-lg border border-slate-200 p-6 mb-6">
              <h2 className="text-xl font-semibold mb-3">Create New Form</h2>
              {error && <div className="mb-3 text-sm text-red-600">{error}</div>}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="text-sm font-medium text-slate-700">Title</label>
                  <input value={title} onChange={e=>setTitle(e.target.value)} className="mt-1 w-full px-3 py-2 border border-slate-300 rounded-lg" />
                </div>
                <div>
                  <label className="text-sm font-medium text-slate-700">Description (optional)</label>
                  <input value={description} onChange={e=>setDescription(e.target.value)} className="mt-1 w-full px-3 py-2 border border-slate-300 rounded-lg" />
                </div>
              </div>

              <div className="mt-4">
                <label className="text-sm font-medium text-slate-700">Staff Options</label>
                <div className="mt-3 grid grid-cols-1 md:grid-cols-3 gap-3">
                  <div>
                    <label className="text-xs text-slate-500">Year</label>
                    <select className="mt-1 w-full px-3 py-2 border rounded" value={selectedYear ?? ''} onChange={e => setSelectedYear(e.target.value ? Number(e.target.value) : null)}>
                      <option value="">-- Year --</option>
                      {years.map(y => <option key={y} value={y}>{y}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="text-xs text-slate-500">Section</label>
                    <select className="mt-1 w-full px-3 py-2 border rounded" value={selectedSection ?? ''} onChange={e => setSelectedSection(e.target.value || null)}>
                      <option value="">-- Section --</option>
                      {sections.map(s => <option key={s} value={s}>{s}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="text-xs text-slate-500">Subject</label>
                    <select className="mt-1 w-full px-3 py-2 border rounded" value={selectedSubjectId ?? ''} onChange={e => setSelectedSubjectId(e.target.value || null)}>
                      <option value="">-- Subject (optional) --</option>
                      {subjectsList.map(s => <option key={s.id} value={s.id}>{s.subject_code ? `${s.subject_code} — ${s.name}` : s.name}</option>)}
                      <option value="other">Other (enter subject)</option>
                    </select>
                    {selectedSubjectId === 'other' && (
                      <input value={customSubjectName} onChange={e => setCustomSubjectName(e.target.value)} placeholder="Enter subject name" className="mt-2 w-full px-3 py-2 border rounded" />
                    )}
                  </div>
                </div>
                {/* Staff list preview: horizontal scroll on mobile, wrap on desktop */}
                <div className="mt-2 hidden sm:flex flex-wrap gap-2">
                  {staffList.map((s, idx) => (
                    <div key={idx} className="px-3 py-1 bg-slate-100 rounded-full text-sm">{s.name}</div>
                  ))}
                </div>
                <div className="mt-2 sm:hidden overflow-x-auto whitespace-nowrap w-full overscroll-x-contain">
                  {staffList.map((s, idx) => (
                    <span key={idx} className="inline-block mr-2 mb-2 px-3 py-1 bg-slate-100 rounded-full text-xs">{s.name}</span>
                  ))}
                </div>
                <div className="mt-2 flex gap-2">
                  <input value={newStaffName} onChange={e=>setNewStaffName(e.target.value)} placeholder="Add new staff name" className="px-3 py-2 border border-slate-300 rounded-lg flex-1" />
                  <button onClick={addNewStaffToList} className="px-3 py-2 bg-blue-600 text-white rounded-lg"><PlusCircle className="inline-block mr-2"/>Add</button>
                </div>
                
                <div className="mt-3">
                  <label className="text-sm font-medium text-slate-700">Default staff for this form</label>
                  {/* Mobile: use a select for compactness */}
                  <div className="mt-2 sm:hidden">
                    <select
                      className="w-full px-3 py-2 border rounded"
                      value={defaultStaff ? `${defaultStaff.id ?? ''}::${defaultStaff.name}` : ''}
                      onChange={(e) => {
                        const val = e.target.value;
                        if (!val) { setDefaultStaff(null); return; }
                        const [id, name] = val.split('::');
                        setDefaultStaff({ id: id || null, name });
                      }}
                    >
                      <option value="">-- Choose default staff (optional) --</option>
                      {staffList.map((s, idx) => (
                        <option key={idx} value={`${s.id ?? ''}::${s.name}`}>{s.name}</option>
                      ))}
                    </select>
                  </div>
                  {/* Desktop: show chip radios */}
                  <div className="mt-2 space-y-2 hidden sm:block">
                    <div className="flex flex-wrap gap-2">
                      {staffList.map((s, idx) => (
                        <label key={idx} className="inline-flex items-center gap-2 px-2 py-1 rounded-lg border border-slate-200">
                          <input type="radio" name="defaultStaff" checked={defaultStaff?.name === s.name && defaultStaff?.id === s.id} onChange={() => setDefaultStaff(s)} />
                          <span className="text-sm">{s.name}</span>
                        </label>
                      ))}
                    </div>
                  </div>
                </div>
              </div>

              <div className="mt-4">
                <label className="text-sm font-medium text-slate-700">Questions</label>
                <div className="mt-2 space-y-2">
                  {questions.map((q, idx) => (
                    <div key={idx} className="flex flex-col sm:flex-row gap-2">
                      <input value={q} onChange={e=>updateQuestion(idx, e.target.value)} className="flex-1 px-3 py-2 border border-slate-300 rounded-lg" />
                      <button onClick={()=>removeQuestion(idx)} className="px-3 py-2 bg-red-50 text-red-700 rounded-lg text-sm w-full sm:w-auto">Remove</button>
                    </div>
                  ))}
                </div>
                <div className="mt-2">
                  <button onClick={addQuestion} className="px-3 py-2 bg-slate-100 rounded-lg w-full sm:w-auto">Add question</button>
                </div>
              </div>

              <div className="mt-4 text-right">
                <button onClick={handleCreateForm} disabled={saving} className="px-5 py-2 bg-blue-600 text-white rounded-lg w-full sm:w-auto">{saving ? 'Saving…' : 'Create Form'}</button>
              </div>
            </div>
          )
        )}

        {/* 'Your Forms' removed from Create view per design - Create view shows only the form builder */}

        {viewMode === 'results' && (
          <div className="bg-white rounded-xl shadow border border-slate-200 p-6">
            <div className="mb-4 flex flex-col sm:flex-row sm:items-center gap-3">
              <div className="flex items-center gap-2 w-full sm:w-auto">
                <label className="text-sm font-medium whitespace-nowrap">Select form</label>
                <select value={selectedFormId || ''} onChange={e => setSelectedFormId(e.target.value || null)} className="px-3 py-2 border rounded-lg flex-1">
                  <option value="">-- choose form --</option>
                  {forms.map(f => <option key={f.id} value={f.id}>{f.title}</option>)}
                </select>
              </div>
              {selectedFormId && (
                <button onClick={() => handleDeleteForm(selectedFormId)} className="px-3 py-2 bg-red-600 text-white rounded-lg w-full sm:w-auto" disabled={deleting}>
                  {deleting ? 'Deleting…' : 'Delete Form'}
                </button>
              )}
              <div className="hidden sm:block sm:ml-auto text-sm text-slate-500">Showing results as table</div>
            </div>

            {!selectedFormId ? (
              <div className="py-8 text-center text-slate-500">Select a form to view results.</div>
            ) : resultResponses === null ? (
              <div className="py-8 text-center text-slate-600">Loading results…</div>
            ) : resultResponses.length === 0 ? (
              <div className="py-8 text-center text-slate-500">No responses for this form yet.</div>
            ) : (
              <>
                <div className="hidden sm:block overflow-x-auto">
                  <table className="w-full table-auto border-collapse">
                    <thead>
                      <tr className="text-left text-sm text-slate-700 border-b">
                        <th className="p-2">Student</th>
                        <th className="p-2">Staff</th>
                        <th className="p-2">Rating</th>
                        <th className="p-2">Comments</th>
                        {resultQuestions.map(q => <th key={q.id} className="p-2">{q.question_text}</th>)}
                        <th className="p-2">Submitted At</th>
                      </tr>
                    </thead>
                    <tbody>
                      {resultResponses.map(r => (
                        <tr key={r.id} className="border-b">
                          <td className="p-2 text-sm">{(r as any).student_name || r.student_id}</td>
                          <td className="p-2 text-sm">{r.staff_selected ? (r.staff_selected.name || '-') : '-'}</td>
                          <td className="p-2 text-sm">{r.rating ?? '-'}</td>
                          <td className="p-2 text-sm">{r.comments ?? '-'}</td>
                          {resultQuestions.map(q => {
                            const ans = (r.answers || []).find((a:any) => a.question_id === q.id);
                            return <td key={q.id} className="p-2 text-sm">{ans ? ans.answer : '-'}</td>;
                          })}
                          <td className="p-2 text-sm">{new Date(r.created_at).toLocaleString()}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <div className="block sm:hidden space-y-4">
                  {resultResponses.map(r => (
                    <div key={r.id} className="bg-white border border-slate-200 rounded-lg p-4">
                      <div className="flex items-start justify-between">
                        <div>
                          <div className="text-sm text-slate-600">Student</div>
                          <div className="font-medium text-slate-800">{(r as any).student_name || r.student_id}</div>
                        </div>
                        <div className="text-right">
                          <div className="text-sm text-slate-600">Rating</div>
                          <div className="font-medium">{r.rating ?? '-'}</div>
                        </div>
                      </div>
                      <div className="mt-3 text-sm text-slate-600">
                        <div><strong>Staff:</strong> {r.staff_selected ? (r.staff_selected.name || '-') : '-'}</div>
                        <div className="mt-2"><strong>Comments:</strong> {r.comments || '-'}</div>
                      </div>
                      <div className="mt-3 space-y-2">
                        {resultQuestions.map(q => {
                          const ans = (r.answers || []).find((a:any) => a.question_id === q.id);
                          return (
                            <div key={q.id} className="text-sm">
                              <div className="text-slate-700 font-medium">{q.question_text}</div>
                              <div className="text-slate-600 mt-1">{ans ? ans.answer : '-'}</div>
                            </div>
                          );
                        })}
                      </div>
                      <div className="mt-3 text-xs text-slate-400">{new Date(r.created_at).toLocaleString()}</div>
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}
