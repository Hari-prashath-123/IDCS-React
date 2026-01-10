import { useEffect, useState } from 'react';
import { X, Eye, Download } from 'lucide-react';
import DashboardLayout from '../../components/DashboardLayout';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';

interface Row {
  id: string;
  description: string | null;
  file_url: string;
  created_at: string;
  certificate_type?: string | null;
  event_college?: string | null;
  exam_name?: string | null;
  course_name?: string | null;
  student?: {
    id: string;
    roll_no: string;
    year: number;
    section: string;
    mentor_id?: string | null;
    advisor_id?: string | null;
    profile?: {
      name: string;
      department: string;
    } | null;
  } | null;
}

export default function StaffCertificates() {
  const { user } = useAuth();
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCertModal, setShowCertModal] = useState(false);
  const [currentCertUrl, setCurrentCertUrl] = useState<string | null>(null);
  const [currentCertMeta, setCurrentCertMeta] = useState<any | null>(null);
  
  const [studentFilter, setStudentFilter] = useState<string | null>(null);
  const [studentOptions, setStudentOptions] = useState<Array<{ id: string; name: string }>>([]);
  const [categoryFilter, setCategoryFilter] = useState<string>('all');
  const [studentTypeFilter, setStudentTypeFilter] = useState<string>('all'); // 'all', 'mentees', 'class'
  const [downloading, setDownloading] = useState(false);
  const [staffData, setStaffData] = useState<any>(null);
  const [allStudentsData, setAllStudentsData] = useState<any[]>([]);

  useEffect(() => {
    fetchStaffData();
    fetchRows();
  }, []);

  const fetchStaffData = async () => {
    if (!user) return;
    try {
      const { data, error } = await supabase
        .from('staff')
        .select('year, section')
        .eq('id', user.id)
        .maybeSingle();
      if (error) throw error;
      setStaffData(data);
    } catch (e) {
      console.error('Failed to fetch staff data', e);
    }
  };

  const fetchRows = async () => {
    try {
      setLoading(true);
      // First, fetch all students with mentor_id info to enable proper filtering
      if (user) {
        const { data: studentsData, error: studErr } = await supabase
          .from('students')
          .select('id, roll_no, year, section, mentor_id, advisor_id, profiles!students_id_fkey(name, department)');
        
        if (studentsData) {
          setAllStudentsData(studentsData);
        }
      }

      // RLS will ensure we only get certificates for our mentees/advisees
      const { data, error } = await supabase
        .from('certificates')
        .select('id, description, file_url, created_at, certificate_type, event_college, exam_name, course_name, user_id')
        .eq('role', 'student')
        .order('created_at', { ascending: false });

      // If we have certificate rows, fetch student details for any user_ids that correspond to students
      let studentsMap: Record<string, any> = {};
      if (data && Array.isArray(data) && data.length > 0) {
        const userIds = Array.from(new Set(data.map((c: any) => c.user_id).filter(Boolean)));
        if (userIds.length > 0) {
          const { data: studs, error: studsErr } = await supabase
            .from('students')
            .select('id, roll_no, year, section, mentor_id, advisor_id, profiles!students_id_fkey(name, department)')
            .in('id', userIds as string[]);
          if (studs && Array.isArray(studs)) {
            studentsMap = Object.fromEntries(studs.map((s: any) => [s.id, s]));
          } else if (studs === null && studsErr) {
            console.warn('Failed to fetch students for certificates:', studsErr);
          }
        }
      }

      if (error) throw error;

      const mapped: Row[] = (data || []).map((c: any) => {
        const studentRaw = c.user_id ? studentsMap[c.user_id] : null;
        let student: Row['student'] | null = null;
        if (studentRaw) {
          const prof = Array.isArray(studentRaw.profiles) ? (studentRaw.profiles[0] || null) : (studentRaw.profiles || null);
          student = {
            id: studentRaw.id,
            roll_no: studentRaw.roll_no,
            year: studentRaw.year,
            section: studentRaw.section,
            mentor_id: studentRaw.mentor_id,
            advisor_id: studentRaw.advisor_id,
            profile: prof,
          };
        }
        return {
          id: c.id,
          description: c.description,
          file_url: c.file_url,
          created_at: c.created_at,
          certificate_type: c.certificate_type || null,
          event_college: c.event_college || null,
          exam_name: c.exam_name || null,
          course_name: c.course_name || null,
          student,
        } as Row;
      });

      setRows(mapped);
      // build student options from the fetched rows (respect RLS)
      const opts = Array.from(new Map((mapped || []).map((m) => [m.student?.id, { id: m.student?.id, name: m.student?.profile?.name || '-' }])).values()).filter(Boolean) as Array<{ id: string; name: string }>;
      setStudentOptions(opts);
    } catch (e) {
      console.error('Failed to fetch certificates', e);
    } finally {
      setLoading(false);
    }
  };

  const getFilteredRows = () => {
    let filtered = [...rows];

    // Filter by student (existing)
    if (studentFilter) {
      filtered = filtered.filter(r => r.student?.id === studentFilter);
    }

    // Filter by student type (mentees or class students)
    if (studentTypeFilter !== 'all' && user && staffData) {
      if (studentTypeFilter === 'mentees') {
        // Filter students where current user is the mentor
        filtered = filtered.filter(r => 
          r.student?.mentor_id === user.id
        );
      } else if (studentTypeFilter === 'class') {
        // Get students from the same year/section
        filtered = filtered.filter(r => 
          r.student?.year === staffData.year && 
          r.student?.section === staffData.section
        );
      }
    }

    // Filter by certificate category
    if (categoryFilter !== 'all') {
      if (categoryFilter === 'event') {
        filtered = filtered.filter(r => r.event_college || r.certificate_type);
      } else if (categoryFilter === 'exam') {
        filtered = filtered.filter(r => r.exam_name);
      } else if (categoryFilter === 'course') {
        filtered = filtered.filter(r => r.course_name);
      }
    }

    return filtered;
  };

  const downloadFilteredCertificates = async () => {
    const filteredRows = getFilteredRows();
    if (filteredRows.length === 0) {
      alert('No certificates to download based on current filters.');
      return;
    }

    setDownloading(true);
    try {
      // Load JSZip dynamically
      const JSZip = (window as any).JSZip;
      if (!JSZip) {
        const script = document.createElement('script');
        script.src = 'https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js';
        script.async = true;
        document.head.appendChild(script);
        await new Promise((resolve, reject) => {
          script.onload = resolve;
          script.onerror = reject;
        });
      }

      const zip = new (window as any).JSZip();
      
      for (let idx = 0; idx < filteredRows.length; idx++) {
        const row = filteredRows[idx];
        const studentName = row.student?.profile?.name || 'Unknown';
        const category = row.certificate_type || row.exam_name || row.course_name || 'Certificate';
        
        // Sanitize filename
        const sanitizedName = studentName.replace(/[^a-zA-Z0-9]/g, '_');
        const sanitizedCategory = category.replace(/[^a-zA-Z0-9]/g, '_');
        
        // Determine file extension
        const url = row.file_url;
        let ext = '.pdf';
        if (url.match(/\.(jpg|jpeg|png|gif|webp)$/i)) {
          ext = url.match(/\.(jpg|jpeg|png|gif|webp)$/i)![0];
        }
        
        const filename = `${sanitizedName}-${sanitizedCategory}${ext}`;
        
        try {
          const response = await fetch(row.file_url);
          if (!response.ok) throw new Error('Failed to fetch file');
          const blob = await response.blob();
          zip.file(filename, blob);
        } catch (e) {
          console.error(`Failed to download ${filename}`, e);
        }
      }

      const content = await zip.generateAsync({ type: 'blob' });
      const link = document.createElement('a');
      link.href = URL.createObjectURL(content);
      link.download = `certificates-${new Date().toISOString().split('T')[0]}.zip`;
      link.click();
      URL.revokeObjectURL(link.href);
    } catch (e) {
      console.error('Download failed', e);
      alert('Failed to download certificates. Please try again.');
    } finally {
      setDownloading(false);
    }
  };

  const filteredRows = getFilteredRows();

  return (
    <DashboardLayout>
      <div className="max-w-6xl mx-auto px-4 sm:px-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between mb-4">
          <div>
            <h1 className="text-xl sm:text-2xl font-bold text-slate-800 mb-1">Student Certificates</h1>
            <p className="text-sm sm:text-base text-slate-600">Certificates submitted by your mentees/advisees.</p>
          </div>
          <button
            onClick={downloadFilteredCertificates}
            disabled={downloading || filteredRows.length === 0}
            className="mt-3 sm:mt-0 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 text-sm font-medium"
          >
            <Download className="w-4 h-4" />
            {downloading ? 'Downloading...' : `Download All (${filteredRows.length})`}
          </button>
        </div>

        {/* Filters */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-4">
          <div>
            <label className="block text-sm text-slate-600 mb-1">Filter by Student</label>
            <select 
              value={studentFilter || ''} 
              onChange={(e) => setStudentFilter(e.target.value || null)} 
              className="border border-slate-300 rounded-lg px-3 py-2 text-sm w-full"
            >
              <option value="">All students</option>
              {studentOptions.map(s => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm text-slate-600 mb-1">Filter by Student Type</label>
            <select 
              value={studentTypeFilter} 
              onChange={(e) => setStudentTypeFilter(e.target.value)} 
              className="border border-slate-300 rounded-lg px-3 py-2 text-sm w-full"
            >
              <option value="all">All Students</option>
              <option value="mentees">My Mentees</option>
              {staffData?.year && staffData?.section && (
                <option value="class">My Class ({staffData.year}/{staffData.section})</option>
              )}
            </select>
          </div>

          <div>
            <label className="block text-sm text-slate-600 mb-1">Filter by Category</label>
            <select 
              value={categoryFilter} 
              onChange={(e) => setCategoryFilter(e.target.value)} 
              className="border border-slate-300 rounded-lg px-3 py-2 text-sm w-full"
            >
              <option value="all">All Categories</option>
              <option value="event">Events</option>
              <option value="exam">Exams</option>
              <option value="course">Courses</option>
            </select>
          </div>
        </div>

        {loading && (
          <div className="text-slate-500 text-sm sm:text-base">Loading...</div>
        )}
        {!loading && filteredRows.length === 0 && (
          <div className="text-slate-500 text-sm sm:text-base">No certificates available.</div>
        )}
        {!loading && filteredRows.length > 0 && (
          <div>
            {/* If a student is selected, show only the list of uploaded names for that student */}
            {studentFilter ? (
              <div className="bg-white rounded-xl border border-slate-200 p-4">
                <h2 className="text-lg font-medium mb-3">Certificates for {studentOptions.find(s => s.id === studentFilter)?.name || 'student'}</h2>
                <ul className="space-y-2">
                  {filteredRows.filter(r => r.student?.id === studentFilter).map(r => (
                    <li key={r.id} className="flex items-center justify-between bg-slate-50 p-3 rounded">
                      <div className="text-sm text-slate-800 truncate">{r.description || (r.file_url ? r.file_url.split('/').pop() : 'Untitled')}</div>
                      <div>
                        <button onClick={() => { setCurrentCertUrl(r.file_url); setCurrentCertMeta(r); setShowCertModal(true); }} className="p-2 rounded bg-slate-50 text-blue-600 hover:bg-slate-100"><Eye className="w-4 h-4" /></button>
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
            ) : (
              <>
                {/* Desktop Table View */}
                <div className="hidden lg:block bg-white rounded-xl border border-slate-200 overflow-hidden">
                  <table className="min-w-full divide-y divide-slate-200 text-sm">
                    <thead className="bg-slate-50">
                      <tr>
                        <th className="px-4 py-2 text-left text-slate-600">Student</th>
                        <th className="px-4 py-2 text-left text-slate-600">Roll No</th>
                        <th className="px-4 py-2 text-left text-slate-600">Year/Section</th>
                        <th className="px-4 py-2 text-left text-slate-600">Description</th>
                        <th className="px-4 py-2 text-left text-slate-600">Category</th>
                        <th className="px-4 py-2 text-left text-slate-600">Uploaded</th>
                        <th className="px-4 py-2"></th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200">
                      {filteredRows.map((r) => (
                        <tr key={r.id} className="hover:bg-slate-50">
                          <td className="px-4 py-2">{r.student?.profile?.name || '-'}</td>
                          <td className="px-4 py-2">{r.student?.roll_no || '-'}</td>
                          <td className="px-4 py-2">{r.student ? `${r.student.year} / ${r.student.section}` : '-'}</td>
                          <td className="px-4 py-2">{r.description || '-'}</td>
                          <td className="px-4 py-2">{r.certificate_type || r.exam_name || r.course_name || '-'}</td>
                          <td className="px-4 py-2">{new Date(r.created_at).toLocaleString()}</td>
                          <td className="px-4 py-2 text-right">
                            <button
                              onClick={() => { setCurrentCertUrl(r.file_url); setCurrentCertMeta(r); setShowCertModal(true); }}
                              aria-label="View certificate"
                              title="View certificate"
                              className="p-2 rounded bg-slate-50 text-blue-600 hover:bg-slate-100"
                            >
                              <Eye className="w-4 h-4" />
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {/* Mobile Card View */}
                <div className="lg:hidden space-y-3">
                  {filteredRows.map((r) => (
                    <div key={r.id} className="bg-white rounded-xl border border-slate-200 p-4">
                      <div className="flex justify-between items-start mb-3">
                        <div className="flex-1">
                          <h3 className="text-base font-semibold text-slate-800">{r.student?.profile?.name || '-'}</h3>
                          <p className="text-xs text-slate-600 mt-1">
                            {r.student?.roll_no || '-'} • Year {r.student?.year || '-'} • Section {r.student?.section || '-'}
                          </p>
                        </div>
                      </div>
                      
                      <div className="space-y-2 mb-3">
                        {r.description && (
                          <div className="text-sm">
                            <span className="font-medium text-slate-700">Description: </span>
                            <span className="text-slate-600">{r.description}</span>
                          </div>
                        )}
                        <div className="text-xs text-slate-500">
                          Uploaded: {new Date(r.created_at).toLocaleString()}
                        </div>
                      </div>

                      <button
                        onClick={() => { setCurrentCertUrl(r.file_url); setCurrentCertMeta(r); setShowCertModal(true); }}
                        aria-label="View certificate"
                        title="View certificate"
                        className="w-full py-2 px-4 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700 transition-colors font-medium"
                      >
                        <Eye className="w-4 h-4 inline-block mr-2" /> View
                      </button>
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>
        )}
      </div>

      {showCertModal && currentCertUrl && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-75 p-4"
          onClick={() => setShowCertModal(false)}
        >
          <div className="relative max-w-4xl max-h-[90vh] w-full">
            <button
              onClick={() => setShowCertModal(false)}
              className="absolute -top-10 right-0 text-white hover:text-gray-300 transition-colors"
            >
              <X className="h-8 w-8" />
            </button>
            <div
              className="bg-white rounded-lg overflow-hidden shadow-2xl"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="p-4 border-b border-slate-100">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <div className="text-sm font-medium text-slate-800">{currentCertMeta?.description || 'Certificate'}</div>
                    <div className="text-xs text-slate-500">
                      {currentCertMeta?.created_at ? new Date(currentCertMeta.created_at).toLocaleString() : ''}
                    </div>
                    {currentCertMeta?.certificate_type && <div className="text-xs text-slate-500 mt-1">Type: {currentCertMeta.certificate_type}</div>}
                    {currentCertMeta?.event_college && <div className="text-xs text-slate-500 mt-1">College: {currentCertMeta.event_college}</div>}
                    {currentCertMeta?.exam_name && <div className="text-xs text-slate-500 mt-1">Exam: {currentCertMeta.exam_name}</div>}
                    {currentCertMeta?.course_name && <div className="text-xs text-slate-500 mt-1">Course: {currentCertMeta.course_name}</div>}
                  </div>
                  <div className="text-xs text-slate-500">{currentCertMeta?.student?.profile?.department || ''}</div>
                </div>
              </div>
              <div className="p-4">
                {currentCertUrl?.match(/\.(jpg|jpeg|png|gif|webp)$/i) ? (
                  <img
                    src={currentCertUrl!}
                    alt="Certificate document"
                    className="w-full h-auto max-h-[60vh] object-contain"
                  />
                ) : currentCertUrl ? (
                  <iframe
                    src={currentCertUrl!}
                    className="w-full h-[60vh]"
                    title="Certificate document"
                  />
                ) : (
                  <div className="py-12 text-center text-slate-500">No certificate file available</div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </DashboardLayout>
  );
}
