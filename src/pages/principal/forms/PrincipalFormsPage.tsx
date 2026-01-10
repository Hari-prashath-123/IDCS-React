
import { useState, useEffect } from 'react';
import DashboardLayout from '../../../components/DashboardLayout';
import { supabase, getApplicationTableName, ApplicationType } from '../../../lib/supabase';

const FORM_TYPES = [
  { key: 'od', label: 'OD Applications' },
  { key: 'leave', label: 'Leave Applications' },
  { key: 'bonafide', label: 'Bonafide Applications' },
  { key: 'gatepass', label: 'Gatepass Applications' },
];

type FormType = ApplicationType;

export default function PrincipalFormsPage() {
  const [activeForm, setActiveForm] = useState<FormType>('od');
  const [applications, setApplications] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [departments, setDepartments] = useState<string[]>([]);
  const [years, setYears] = useState<string[]>([]);
  const [sections, setSections] = useState<string[]>([]);
  const [selectedDept, setSelectedDept] = useState('');
  const [selectedYear, setSelectedYear] = useState('');
  const [selectedSection, setSelectedSection] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchApplications();
    // Reset filters on form change
    setSelectedDept(''); 
    setSelectedYear(''); 
    setSelectedSection(''); 
    setDateFrom(''); 
    setDateTo('');
    setError(null);
  }, [activeForm]);

  const fetchApplications = async () => {
    setLoading(true);
    try {
      const table = getApplicationTableName(activeForm);
      const approvalsTable = getApprovalsTableName(activeForm);
      
      // Parallel fetch apps and limited profiles (top 100 most recent apps)
      const [appsResult, profilesResult] = await Promise.all([
        supabase.from(table)
          .select('*')
          .order('created_at', { ascending: false })
          .limit(100), // Limit for performance
        supabase.from('profiles').select('*')
      ]);
        
      if (appsResult.error) {
        console.error('Error fetching applications:', appsResult.error);
        throw appsResult.error;
      }

      const apps = appsResult.data || [];
      const studentIds = [...new Set(apps.map((a: any) => a.student_id).filter(Boolean))];
      
      let studentsMap = new Map();
      let profilesMap = new Map();
      let approvalsMap = new Map();
      
      if (studentIds.length > 0) {
        // Filter profiles to only relevant students
        const profiles = (profilesResult.data || []).filter((p: any) => studentIds.includes(p.id));
        profilesMap = new Map(profiles.map((p: any) => [p.id, p]));

        // Fetch students and approvals in parallel
        const appIds = apps.map((a: any) => a.id);
        const [studentsData, approvalsData] = await Promise.all([
          supabase.from('students').select('*').in('id', studentIds),
          supabase.from(approvalsTable).select('*').in('application_id', appIds)
        ]);
        
        if (studentsData.error) {
          console.error('Error fetching students:', studentsData.error);
          throw studentsData.error;
        }
        
        studentsMap = new Map((studentsData.data || []).map((s: any) => [s.id, s]));
        
        // Build approvals map
        (approvalsData.data || []).forEach((approval: any) => {
          if (!approvalsMap.has(approval.application_id)) {
            approvalsMap.set(approval.application_id, []);
          }
          approvalsMap.get(approval.application_id).push(approval);
        });
      }

      // Combine the data with approvals
      const combined = apps.map((app: any) => {
        const student = studentsMap.get(app.student_id);
        const profile = profilesMap.get(app.student_id);
        return {
          ...app,
          student: student ? { ...student, profile } : null,
          approvals: approvalsMap.get(app.id) || []
        };
      });

      setApplications(combined);
      
      // Extract filter options from the combined data
      const validApps = combined.filter((f: any) => f.student?.profile);
      setDepartments([...new Set(validApps.map((f: any) => f.student.profile.department).filter(Boolean))].sort());
      setYears([...new Set(validApps.map((f: any) => String(f.student.profile.year || f.student.year)).filter(Boolean))].sort());
      setSections([...new Set(validApps.map((f: any) => f.student.profile.section || f.student.section).filter(Boolean))].sort());
      
    } catch (error) {
      console.error('Error in fetchApplications:', error);
      const errorMessage = error instanceof Error ? error.message : 'Failed to load applications. Please try again.';
      setError(`Error loading ${FORM_TYPES.find(ft => ft.key === activeForm)?.label?.toLowerCase() || 'applications'}: ${errorMessage}`);
      setApplications([]);
      setDepartments([]);
      setYears([]);
      setSections([]);
    } finally {
      setLoading(false);
    }
  };

  const filtered = applications.filter((f: any) => {
    if (selectedDept && f.student?.profile?.department !== selectedDept) return false;
    if (selectedYear && String(f.student?.profile?.year) !== selectedYear) return false;
    if (selectedSection && f.student?.profile?.section !== selectedSection) return false;
    if (dateFrom && dateTo) {
      if (new Date(f.created_at) < new Date(dateFrom)) return false;
      if (new Date(f.created_at) > new Date(dateTo)) return false;
    }
    return true;
  });

  return (
    <DashboardLayout>
      <div className="max-w-7xl mx-auto p-4 sm:p-6">
        <div className="flex flex-col sm:flex-row gap-2 mb-6">
          {FORM_TYPES.map(ft => (
            <button
              key={ft.key}
              className={`flex-1 sm:flex-none px-3 sm:px-4 py-2 rounded font-medium border text-sm sm:text-base ${activeForm === ft.key ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'}`}
              onClick={() => setActiveForm(ft.key as FormType)}
            >
              {ft.label}
            </button>
          ))}
        </div>
        <div className="bg-white rounded-lg shadow p-4 mb-6">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-4">
            <div>
              <label className="block text-xs sm:text-sm text-gray-600 mb-1">Department</label>
              <select value={selectedDept} onChange={e => setSelectedDept(e.target.value)} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
                <option value="">All Departments</option>
                {departments.map(d => <option key={d} value={d}>{d}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs sm:text-sm text-gray-600 mb-1">Year</label>
              <select value={selectedYear} onChange={e => setSelectedYear(e.target.value)} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
                <option value="">All Years</option>
                {years.map(y => <option key={y} value={y}>Year {y}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs sm:text-sm text-gray-600 mb-1">Section</label>
              <select value={selectedSection} onChange={e => setSelectedSection(e.target.value)} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
                <option value="">All Sections</option>
                {sections.map(s => <option key={s} value={s}>Section {s}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs sm:text-sm text-gray-600 mb-1">From Date</label>
              <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
            <div>
              <label className="block text-xs sm:text-sm text-gray-600 mb-1">To Date</label>
              <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
          </div>
          <div className="mt-4 flex flex-col sm:flex-row gap-2 sm:justify-end">
            <button
              onClick={() => {
                setSelectedDept('');
                setSelectedYear('');
                setSelectedSection('');
                setDateFrom('');
                setDateTo('');
              }}
              className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors text-sm"
            >
              Clear Filters
            </button>
          </div>
        </div>
        {error && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-6">
            <p className="text-red-800 text-sm">{error}</p>
            <button 
              onClick={fetchApplications}
              className="mt-2 px-3 py-1 bg-red-100 text-red-800 rounded text-sm hover:bg-red-200"
            >
              Retry
            </button>
          </div>
        )}
        {loading ? (
          <div className="bg-white rounded-lg shadow p-8 text-center">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto"></div>
            <p className="mt-2 text-gray-600">Loading applications...</p>
          </div>
        ) : (
          <div className="bg-white rounded-lg shadow p-4">
            <div className="mb-4 flex flex-col sm:flex-row sm:justify-between sm:items-center gap-2">
              <h3 className="text-lg font-semibold text-gray-900">
                {FORM_TYPES.find(ft => ft.key === activeForm)?.label || 'Applications'}
              </h3>
              <div className="text-sm text-gray-500">
                Showing {filtered.length} of {applications.length} applications
              </div>
            </div>
            
            {/* Desktop Table View */}
            <div className="hidden lg:block overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Student Name</th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Roll Number</th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Department</th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Year</th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Section</th>
                  {activeForm === 'od' || activeForm === 'leave' ? (
                    <>
                      <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Subject</th>
                      <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">From Date</th>
                      <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">To Date</th>
                    </>
                  ) : activeForm === 'gatepass' ? (
                    <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Purpose</th>
                  ) : (
                    <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Purpose</th>
                  )}
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Applied Date</th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {filtered.length > 0 ? filtered.map((f: any) => (
                  <tr key={f.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-900">{f.student?.profile?.name || 'N/A'}</td>
                    <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-900">{f.student?.roll_no || 'N/A'}</td>
                    <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-900">{f.student?.profile?.department || 'N/A'}</td>
                    <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-900">{f.student?.profile?.year || 'N/A'}</td>
                    <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-900">{f.student?.profile?.section || 'N/A'}</td>
                    {activeForm === 'od' || activeForm === 'leave' ? (
                      <>
                        <td className="px-4 py-3 text-sm text-gray-900 max-w-xs truncate" title={f.subject || f.reason}>{f.subject || f.reason || 'N/A'}</td>
                        <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-900">{f.from_date ? new Date(f.from_date).toLocaleDateString() : 'N/A'}</td>
                        <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-900">{f.to_date ? new Date(f.to_date).toLocaleDateString() : 'N/A'}</td>
                      </>
                    ) : (
                      <td className="px-4 py-3 text-sm text-gray-900 max-w-xs truncate" title={f.purpose || f.reason}>{f.purpose || f.reason || 'N/A'}</td>
                    )}
                    <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-900">{f.created_at ? new Date(f.created_at).toLocaleDateString() : 'N/A'}</td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${
                        f.status === 'approved' ? 'bg-green-100 text-green-800' :
                        f.status === 'rejected' ? 'bg-red-100 text-red-800' :
                        'bg-yellow-100 text-yellow-800'
                      }`}>
                        {f.status ? f.status.charAt(0).toUpperCase() + f.status.slice(1) : 'Pending'}
                      </span>
                    </td>
                  </tr>
                )) : (
                  <tr>
                    <td colSpan={activeForm === 'od' || activeForm === 'leave' ? 9 : 7} className="px-4 py-8 text-center text-gray-500">
                      No applications found for the selected filters.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
            </div>
            
            {/* Mobile Card View */}
            <div className="lg:hidden space-y-3">
              {filtered.length > 0 ? filtered.map((f: any) => (
                <div key={f.id} className="bg-gray-50 border border-gray-200 rounded-lg p-4">
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex-1 min-w-0">
                      <h4 className="text-sm font-semibold text-gray-900 truncate">
                        {f.student?.profile?.name || 'N/A'}
                      </h4>
                      <div className="text-xs text-gray-600 mt-1">
                        {f.student?.roll_no || 'N/A'} • {f.student?.profile?.department || 'N/A'} • Y{f.student?.profile?.year || 'N/A'}-{f.student?.profile?.section || 'N/A'}
                      </div>
                    </div>
                    <span className={`ml-2 inline-flex px-2 py-1 text-xs font-semibold rounded-full flex-shrink-0 ${
                      f.status === 'approved' ? 'bg-green-100 text-green-800' :
                      f.status === 'rejected' ? 'bg-red-100 text-red-800' :
                      'bg-yellow-100 text-yellow-800'
                    }`}>
                      {f.status ? f.status.charAt(0).toUpperCase() + f.status.slice(1) : 'Pending'}
                    </span>
                  </div>
                  
                  <div className="space-y-2 text-xs">
                    {activeForm === 'od' || activeForm === 'leave' ? (
                      <>
                        <div>
                          <span className="font-medium text-gray-700">Subject/Reason:</span>
                          <div className="text-gray-600 mt-1">{f.subject || f.reason || 'N/A'}</div>
                        </div>
                        <div className="flex gap-4">
                          <div>
                            <span className="font-medium text-gray-700">From:</span>
                            <div className="text-gray-600">{f.from_date ? new Date(f.from_date).toLocaleDateString() : 'N/A'}</div>
                          </div>
                          <div>
                            <span className="font-medium text-gray-700">To:</span>
                            <div className="text-gray-600">{f.to_date ? new Date(f.to_date).toLocaleDateString() : 'N/A'}</div>
                          </div>
                        </div>
                      </>
                    ) : (
                      <div>
                        <span className="font-medium text-gray-700">Purpose:</span>
                        <div className="text-gray-600 mt-1">{f.purpose || f.reason || 'N/A'}</div>
                      </div>
                    )}
                    <div>
                      <span className="font-medium text-gray-700">Applied:</span>
                      <span className="ml-2 text-gray-600">{f.created_at ? new Date(f.created_at).toLocaleDateString() : 'N/A'}</span>
                    </div>
                  </div>
                </div>
              )) : (
                <div className="text-center py-12 text-gray-500">
                  <div className="text-4xl mb-2">📋</div>
                  <p>No applications found for the selected filters.</p>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}
