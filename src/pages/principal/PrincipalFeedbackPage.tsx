import { useEffect, useState } from 'react';
import DashboardLayout from '../../components/DashboardLayout';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { MessageSquare, Users, GraduationCap } from 'lucide-react';

export default function PrincipalFeedbackPage() {
  const { user, profile } = useAuth();
  const [loading, setLoading] = useState(true);
  const [forms, setForms] = useState<any[]>([]);
  
  // Form target selection
  const [targetType, setTargetType] = useState<'students' | 'staff'>('students');
  
  // New form state
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  
  // Staff-specific filters
  const [departments, setDepartments] = useState<string[]>([]);
  const [selectedDepartment, setSelectedDepartment] = useState<string>('All');
  
  // Student-specific filters
  const [studentDepartments, setStudentDepartments] = useState<string[]>([]);
  const [selectedStudentDepartment, setSelectedStudentDepartment] = useState<string>('All');
  const [years, setYears] = useState<number[]>([]);
  const [sections, setSections] = useState<string[]>([]);
  const [selectedYear, setSelectedYear] = useState<number | string>('All');
  const [selectedSection, setSelectedSection] = useState<string>('All');
  
  const [questions, setQuestions] = useState<string[]>([
    'How was the overall performance? (1-5)',
    'Was the interaction professional and helpful?',
    'Any suggestions for improvement?'
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
        // Load forms created by this Principal
        const { data: fData } = await supabase
          .from('feedback_forms')
          .select('id, title, description, created_at, active, default_staff, target_year, target_section')
          .eq('created_by', user.id)
          .order('created_at', { ascending: false });
        setForms((fData || []) as any[]);

        // Load all departments
        const { data: deptData } = await supabase
          .from('profiles')
          .select('department')
          .in('role', ['staff', 'hod', 'ahod'])
          .not('department', 'is', null);
        
        const uniqueDepts = Array.from(new Set(deptData?.map(d => d.department).filter(Boolean))) as string[];
        setDepartments(uniqueDepts.sort());
        
        // Load student departments from profiles table
        const { data: studentDeptData } = await supabase
          .from('profiles')
          .select('department')
          .eq('role', 'student')
          .not('department', 'is', null);
        
        const uniqueStudentDepts = Array.from(new Set(studentDeptData?.map(d => d.department).filter(Boolean))) as string[];
        setStudentDepartments(uniqueStudentDepts.sort());



        // Load years and sections from students
        const { data: studentsData } = await supabase
          .from('students')
          .select('year, section')
          .order('year', { ascending: true });
        
        if (studentsData) {
          const uniqueYears = Array.from(new Set(studentsData.map(s => s.year).filter(Boolean))).sort();
          const uniqueSections = Array.from(new Set(studentsData.map(s => s.section).filter(Boolean))).sort();
          setYears(uniqueYears as number[]);
          setSections(uniqueSections as string[]);
        }
      } catch (e) {
        console.error('Error loading Principal feedback page:', e);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [profile, user]);



  // When switching to results view, load form data
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
      const { data: qData } = await supabase
        .from('feedback_questions')
        .select('id, question_text')
        .eq('form_id', selectedFormId)
        .order('order', { ascending: true });
      if (!mounted) return;
      setResultQuestions((qData || []) as any);
    };
    loadDefault();
    return () => { mounted = false; };
  }, [viewMode, selectedFormId, forms]);



  const addQuestion = () => setQuestions((q) => [...q, '']);
  const updateQuestion = (idx: number, text: string) => setQuestions((q) => q.map((x,i) => i===idx?text:x));
  const removeQuestion = (idx:number) => setQuestions((q)=>q.filter((_,i)=>i!==idx));

  const handleCreateForm = async () => {
    if (!profile || !user) return;
    if (!title.trim()) { setError('Please provide a title'); return; }
    
    // Validation based on target type - 'All' selections are valid
    if (targetType === 'students' && (selectedYear === '' || selectedSection === '')) {
      setError('Please select year and section for student feedback (or "All" for college-wide)');
      return;
    }
    if (targetType === 'staff' && selectedDepartment === '') {
      setError('Please select a department for staff feedback (or "All" for college-wide)');
      return;
    }
    
    setSaving(true);
    setError(null);
    try {
      const formData = {
        title: title.trim(),
        description: description.trim() || null,
        created_by: user.id,
        target_year: targetType === 'students' ? (selectedYear === 'All' ? null : Number(selectedYear)) : null,
        target_section: targetType === 'students' ? (selectedSection === 'All' ? null : selectedSection) : null,
        // Add a custom field to indicate feedback target
        metadata: {
          target_type: targetType,
          target_department: targetType === 'staff' ? (selectedDepartment === 'All' ? null : selectedDepartment) : null,
          student_department: targetType === 'students' ? (selectedStudentDepartment === 'All' ? null : selectedStudentDepartment) : null,
          is_college_wide: (targetType === 'students' && (selectedYear === 'All' || selectedSection === 'All' || selectedStudentDepartment === 'All')) ||
                          (targetType === 'staff' && selectedDepartment === 'All')
        }
      };

      const { data: formRow, error: fErr } = await supabase
        .from('feedback_forms')
        .insert([formData])
        .select('id')
        .maybeSingle();
        
      if (fErr) throw fErr;
      const formId = (formRow as any).id;
      
      // Insert questions
      const qRows = questions.map((q, idx) => ({ 
        form_id: formId, 
        question_text: q, 
        order: idx 
      }));
      
      if (qRows.length) {
        const { error: qErr } = await supabase.from('feedback_questions').insert(qRows);
        if (qErr) throw qErr;
      }
      
      // Reload forms
      const { data: fData } = await supabase
        .from('feedback_forms')
        .select('id, title, description, created_at, active, default_staff, target_year, target_section')
        .eq('created_by', user.id)
        .order('created_at', { ascending: false });
      setForms((fData || []) as any[]);
      
      // Reset form
      setTitle('');
      setDescription('');
      setSelectedDepartment('All');
      setSelectedStudentDepartment('All');
      setSelectedYear('All');
      setSelectedSection('All');
      setQuestions([
        'How was the overall performance? (1-5)',
        'Was the interaction professional and helpful?',
        'Any suggestions for improvement?'
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
      
      // Reload forms
      const { data: fData } = await supabase
        .from('feedback_forms')
        .select('id, title, description, created_at, active, default_staff, target_year, target_section')
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

  return (
    <DashboardLayout>
      <div className="max-w-6xl mx-auto">
        <div className="mb-6 flex items-center gap-3">
          <div className="bg-blue-100 text-blue-600 p-3 rounded-lg">
            <MessageSquare className="h-6 w-6" />
          </div>
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold text-slate-800">Principal Feedback Management</h1>
            <p className="text-slate-600 mt-1 text-sm sm:text-base">Create feedback forms for students and staff across all departments</p>
          </div>
        </div>

        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-4">
          <div className="flex gap-2 w-full sm:w-auto">
            <button 
              onClick={() => setViewMode('create')} 
              className={`flex-1 sm:flex-none px-4 py-2 rounded-lg font-medium ${viewMode==='create'?'bg-blue-600 text-white':'bg-slate-100 text-slate-700 hover:bg-slate-200'}`}
            >
              Create Form
            </button>
            <button 
              onClick={() => setViewMode('results')} 
              className={`flex-1 sm:flex-none px-4 py-2 rounded-lg font-medium ${viewMode==='results'?'bg-blue-600 text-white':'bg-slate-100 text-slate-700 hover:bg-slate-200'}`}
            >
              View Results
            </button>
          </div>
        </div>

        {viewMode === 'create' && (
          loading ? (
            <div className="py-12 text-center">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto mb-3"></div>
              <p className="text-slate-600">Loading...</p>
            </div>
          ) : (
            <div className="bg-white rounded-xl shadow-lg border border-slate-200 p-6 mb-6">
              <h2 className="text-xl font-semibold text-slate-800 mb-4">Create New Feedback Form</h2>
              
              {error && (
                <div className="mb-4 p-3 bg-red-50 border border-red-200 text-red-700 rounded-lg text-sm">
                  {error}
                </div>
              )}

              {/* Target Type Selection */}
              <div className="mb-6">
                <label className="block text-sm font-medium text-slate-700 mb-3">Feedback Target</label>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <button
                    onClick={() => setTargetType('students')}
                    className={`p-4 border-2 rounded-lg flex items-center gap-3 transition-colors ${
                      targetType === 'students' 
                        ? 'border-blue-600 bg-blue-50 text-blue-700' 
                        : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300'
                    }`}
                  >
                    <GraduationCap className="h-6 w-6" />
                    <div className="text-left">
                      <div className="font-medium">Students</div>
                      <div className="text-sm opacity-75">Create feedback for students in specific class</div>
                    </div>
                  </button>
                  <button
                    onClick={() => setTargetType('staff')}
                    className={`p-4 border-2 rounded-lg flex items-center gap-3 transition-colors ${
                      targetType === 'staff' 
                        ? 'border-blue-600 bg-blue-50 text-blue-700' 
                        : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300'
                    }`}
                  >
                    <Users className="h-6 w-6" />
                    <div className="text-left">
                      <div className="font-medium">Staff</div>
                      <div className="text-sm opacity-75">Create feedback for staff in specific department</div>
                    </div>
                  </button>
                </div>
              </div>

              {/* Basic Form Details */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">Form Title</label>
                  <input 
                    value={title} 
                    onChange={e => setTitle(e.target.value)} 
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500" 
                    placeholder="Enter feedback form title"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">Description (Optional)</label>
                  <input 
                    value={description} 
                    onChange={e => setDescription(e.target.value)} 
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500" 
                    placeholder="Brief description of the feedback"
                  />
                </div>
              </div>

              {/* Target Filters */}
              <div className="mb-6">
                <label className="block text-sm font-medium text-slate-700 mb-3">
                  {targetType === 'students' ? 'Target Class' : 'Target Department'}
                </label>
                
                {targetType === 'students' ? (
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <div>
                      <label className="block text-xs text-slate-500 mb-1">Department</label>
                      <select 
                        className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500" 
                        value={selectedStudentDepartment} 
                        onChange={e => setSelectedStudentDepartment(e.target.value)}
                      >
                        <option value="All">All Departments</option>
                        {studentDepartments.map(dept => <option key={dept} value={dept}>{dept}</option>)}
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs text-slate-500 mb-1">Year</label>
                      <select 
                        className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500" 
                        value={selectedYear ?? 'All'} 
                        onChange={e => setSelectedYear(e.target.value === 'All' ? 'All' : Number(e.target.value))}
                      >
                        <option value="All">All Years</option>
                        {years.map(y => <option key={y} value={y}>Year {y}</option>)}
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs text-slate-500 mb-1">Section</label>
                      <select 
                        className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500" 
                        value={selectedSection ?? 'All'} 
                        onChange={e => setSelectedSection(e.target.value)}
                      >
                        <option value="All">All Sections</option>
                        {sections.map(s => <option key={s} value={s}>Section {s}</option>)}
                      </select>
                    </div>
                  </div>
                ) : (
                  <div>
                    <select 
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500" 
                      value={selectedDepartment} 
                      onChange={e => setSelectedDepartment(e.target.value)}
                    >
                      <option value="All">All Departments</option>
                      {departments.map(dept => <option key={dept} value={dept}>{dept}</option>)}
                    </select>
                  </div>
                )}
              </div>



              {/* Questions */}
              <div className="mb-6">
                <label className="block text-sm font-medium text-slate-700 mb-3">Feedback Questions</label>
                <div className="space-y-3">
                  {questions.map((q, idx) => (
                    <div key={idx} className="flex gap-2">
                      <input 
                        value={q} 
                        onChange={e => updateQuestion(idx, e.target.value)} 
                        className="flex-1 px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500" 
                        placeholder={`Question ${idx + 1}`}
                      />
                      <button 
                        onClick={() => removeQuestion(idx)} 
                        className="px-3 py-2 bg-red-50 text-red-600 border border-red-200 rounded-lg hover:bg-red-100 transition-colors"
                      >
                        Remove
                      </button>
                    </div>
                  ))}
                </div>
                <button 
                  onClick={addQuestion} 
                  className="mt-3 px-4 py-2 bg-slate-100 text-slate-700 rounded-lg hover:bg-slate-200 transition-colors"
                >
                  Add Question
                </button>
              </div>

              {/* Create Button */}
              <div className="flex justify-end">
                <button 
                  onClick={handleCreateForm} 
                  disabled={saving} 
                  className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  {saving ? 'Creating...' : 'Create Feedback Form'}
                </button>
              </div>
            </div>
          )
        )}

        {viewMode === 'results' && (
          <div className="bg-white rounded-xl shadow-lg border border-slate-200 p-6">
            <div className="mb-4 flex flex-col sm:flex-row sm:items-center gap-3">
              <div className="flex items-center gap-2 flex-1">
                <label className="text-sm font-medium whitespace-nowrap">Select Form:</label>
                <select 
                  value={selectedFormId || ''} 
                  onChange={e => setSelectedFormId(e.target.value || null)} 
                  className="flex-1 px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="">Choose a form</option>
                  {forms.map(f => (
                    <option key={f.id} value={f.id}>
                      {f.title} {f.target_year && f.target_section ? `(${f.target_year}-${f.target_section})` : ''}
                    </option>
                  ))}
                </select>
              </div>
              {selectedFormId && (
                <button 
                  onClick={() => handleDeleteForm(selectedFormId)} 
                  className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors" 
                  disabled={deleting}
                >
                  {deleting ? 'Deleting...' : 'Delete Form'}
                </button>
              )}
            </div>

            {!selectedFormId ? (
              <div className="py-12 text-center text-slate-500">
                <MessageSquare className="h-12 w-12 mx-auto mb-3 opacity-50" />
                <p>Select a form to view feedback responses</p>
              </div>
            ) : resultResponses === null ? (
              <div className="py-12 text-center">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto mb-3"></div>
                <p className="text-slate-600">Loading responses...</p>
              </div>
            ) : resultResponses.length === 0 ? (
              <div className="py-12 text-center text-slate-500">
                <MessageSquare className="h-12 w-12 mx-auto mb-3 opacity-50" />
                <p>No responses received for this form yet</p>
              </div>
            ) : (
              <>
                {/* Desktop Table View */}
                <div className="hidden md:block overflow-x-auto">
                  <table className="w-full border-collapse">
                    <thead>
                      <tr className="text-left text-sm text-slate-700 border-b-2 border-slate-200">
                        <th className="p-3 font-medium">Student</th>
                        <th className="p-3 font-medium">Staff Evaluated</th>
                        <th className="p-3 font-medium">Rating</th>
                        <th className="p-3 font-medium">Comments</th>
                        {resultQuestions.map(q => (
                          <th key={q.id} className="p-3 font-medium max-w-xs">
                            <div className="truncate" title={q.question_text}>
                              {q.question_text}
                            </div>
                          </th>
                        ))}
                        <th className="p-3 font-medium">Submitted</th>
                      </tr>
                    </thead>
                    <tbody>
                      {resultResponses.map(r => (
                        <tr key={r.id} className="border-b border-slate-100 hover:bg-slate-50">
                          <td className="p-3 text-sm font-medium text-slate-900">
                            {(r as any).student_name || r.student_id}
                          </td>
                          <td className="p-3 text-sm text-slate-600">
                            {r.staff_selected ? (r.staff_selected.name || 'Unknown') : 'Not specified'}
                          </td>
                          <td className="p-3 text-sm text-slate-600">
                            {r.rating ? `${r.rating}/5` : 'No rating'}
                          </td>
                          <td className="p-3 text-sm text-slate-600 max-w-xs">
                            <div className="truncate" title={r.comments || 'No comments'}>
                              {r.comments || 'No comments'}
                            </div>
                          </td>
                          {resultQuestions.map(q => {
                            const ans = (r.answers || []).find((a:any) => a.question_id === q.id);
                            return (
                              <td key={q.id} className="p-3 text-sm text-slate-600 max-w-xs">
                                <div className="truncate" title={ans ? ans.answer : 'No answer'}>
                                  {ans ? ans.answer : 'No answer'}
                                </div>
                              </td>
                            );
                          })}
                          <td className="p-3 text-sm text-slate-500">
                            {new Date(r.created_at).toLocaleDateString()}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {/* Mobile Card View */}
                <div className="block md:hidden space-y-4">
                  {resultResponses.map(r => (
                    <div key={r.id} className="bg-slate-50 border border-slate-200 rounded-lg p-4">
                      <div className="flex items-start justify-between mb-3">
                        <div>
                          <div className="text-sm font-medium text-slate-900">
                            {(r as any).student_name || r.student_id}
                          </div>
                          <div className="text-xs text-slate-500">
                            {new Date(r.created_at).toLocaleDateString()}
                          </div>
                        </div>
                        <div className="text-right">
                          <div className="text-sm font-medium text-slate-700">
                            {r.rating ? `${r.rating}/5` : 'No rating'}
                          </div>
                        </div>
                      </div>
                      
                      <div className="space-y-2 text-sm">
                        <div>
                          <span className="font-medium text-slate-700">Staff:</span>
                          <span className="ml-2 text-slate-600">
                            {r.staff_selected ? r.staff_selected.name : 'Not specified'}
                          </span>
                        </div>
                        
                        {r.comments && (
                          <div>
                            <span className="font-medium text-slate-700">Comments:</span>
                            <div className="mt-1 text-slate-600 text-xs">
                              {r.comments}
                            </div>
                          </div>
                        )}
                        
                        {resultQuestions.map(q => {
                          const ans = (r.answers || []).find((a:any) => a.question_id === q.id);
                          if (!ans?.answer) return null;
                          return (
                            <div key={q.id}>
                              <span className="font-medium text-slate-700 text-xs">{q.question_text}:</span>
                              <div className="mt-1 text-slate-600 text-xs">
                                {ans.answer}
                              </div>
                            </div>
                          );
                        })}
                      </div>
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