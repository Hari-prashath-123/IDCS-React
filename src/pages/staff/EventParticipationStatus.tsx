import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, Eye, FileText } from 'lucide-react';
import DashboardLayout from '../../components/DashboardLayout';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';

interface EventForm {
  id: string;
  event_title: string;
  date_from: string;
  date_to: string;
  nature_of_event: string;
  status: 'pending' | 'approved' | 'rejected';
  created_at: string;
  hod_remarks?: string;
  is_applying_financial_support: boolean;
  amount_proposed?: number;
}

export default function EventParticipationStatus() {
  const navigate = useNavigate();
  const { user, profile } = useAuth();
  const [forms, setForms] = useState<EventForm[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedForm, setSelectedForm] = useState<any>(null);
  const [showModal, setShowModal] = useState(false);

  useEffect(() => {
    fetchForms();
  }, [user]);

  const fetchForms = async () => {
    if (!user) return;
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('event_participation_forms')
        .select('*')
        .eq('staff_id', user.id)
        .order('created_at', { ascending: false });

      if (error) throw error;
      setForms(data || []);
    } catch (e) {
      console.error('Failed to fetch forms', e);
    } finally {
      setLoading(false);
    }
  };

  const viewDetails = (form: any) => {
    setSelectedForm(form);
    setShowModal(true);
  };

  const getStatusBadge = (status: string) => {
    const styles = {
      pending: 'bg-yellow-100 text-yellow-800',
      approved: 'bg-green-100 text-green-800',
      rejected: 'bg-red-100 text-red-800',
    };
    return styles[status as keyof typeof styles] || styles.pending;
  };

  const getFormPath = () => {
    if (profile?.role === 'ahod') return '/ahod/event-participation-form';
    if (profile?.role === 'hod') return '/hod/event-participation-form';
    return '/staff/event-participation-form';
  };

  return (
    <DashboardLayout>
      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6">
        <div className="flex justify-between items-center mb-6">
          <div>
            <h1 className="text-2xl font-bold text-slate-800">Event Participation Forms</h1>
            <p className="text-sm text-slate-600 mt-1">View and manage your event participation submissions</p>
          </div>
          <button
            onClick={() => navigate(getFormPath())}
            className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
          >
            <Plus className="w-4 h-4" />
            New Form
          </button>
        </div>

        {loading ? (
          <div className="text-center py-12">
            <div className="text-slate-600">Loading...</div>
          </div>
        ) : forms.length === 0 ? (
          <div className="bg-white rounded-xl border border-slate-200 p-12 text-center">
            <FileText className="w-16 h-16 text-slate-300 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-slate-800 mb-2">No submissions yet</h3>
            <p className="text-slate-600 mb-4">You haven't submitted any event participation forms.</p>
            <button
              onClick={() => navigate('/staff/event-participation-form')}
              className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
            >
              <Plus className="w-4 h-4" />
              Submit Your First Form
            </button>
          </div>
        ) : (
          <>
            {/* Desktop Table View */}
            <div className="hidden lg:block bg-white rounded-xl border border-slate-200 overflow-hidden">
              <table className="min-w-full divide-y divide-slate-200">
                <thead className="bg-slate-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">Event Title</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">Nature</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">Date</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">Financial Support</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">Status</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">Submitted On</th>
                    <th className="px-6 py-3"></th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-slate-200">
                  {forms.map((form) => (
                    <tr key={form.id} className="hover:bg-slate-50">
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="text-sm font-medium text-slate-900">{form.event_title}</div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="text-sm text-slate-600">{form.nature_of_event}</div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="text-sm text-slate-600">
                          {new Date(form.date_from).toLocaleDateString()} - {new Date(form.date_to).toLocaleDateString()}
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="text-sm text-slate-600">
                          {form.is_applying_financial_support ? `₹${form.amount_proposed || 0}` : 'No'}
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${getStatusBadge(form.status)}`}>
                          {form.status.charAt(0).toUpperCase() + form.status.slice(1)}
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-600">
                        {new Date(form.created_at).toLocaleDateString()}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                        <button
                          onClick={() => viewDetails(form)}
                          className="text-blue-600 hover:text-blue-900"
                        >
                          <Eye className="w-5 h-5" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Mobile Card View */}
            <div className="lg:hidden space-y-4">
              {forms.map((form) => (
                <div key={form.id} className="bg-white rounded-xl border border-slate-200 p-4">
                  <div className="flex justify-between items-start mb-3">
                    <div className="flex-1">
                      <h3 className="text-base font-semibold text-slate-800">{form.event_title}</h3>
                      <p className="text-sm text-slate-600 mt-1">{form.nature_of_event}</p>
                    </div>
                    <span className={`px-2 py-1 text-xs font-semibold rounded-full ${getStatusBadge(form.status)}`}>
                      {form.status.charAt(0).toUpperCase() + form.status.slice(1)}
                    </span>
                  </div>
                  
                  <div className="space-y-2 mb-3">
                    <div className="text-sm">
                      <span className="font-medium text-slate-700">Date: </span>
                      <span className="text-slate-600">
                        {new Date(form.date_from).toLocaleDateString()} - {new Date(form.date_to).toLocaleDateString()}
                      </span>
                    </div>
                    <div className="text-sm">
                      <span className="font-medium text-slate-700">Financial Support: </span>
                      <span className="text-slate-600">
                        {form.is_applying_financial_support ? `₹${form.amount_proposed || 0}` : 'No'}
                      </span>
                    </div>
                    <div className="text-xs text-slate-500">
                      Submitted: {new Date(form.created_at).toLocaleDateString()}
                    </div>
                  </div>

                  <button
                    onClick={() => viewDetails(form)}
                    className="w-full py-2 px-4 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700 transition-colors font-medium flex items-center justify-center gap-2"
                  >
                    <Eye className="w-4 h-4" /> View Details
                  </button>
                </div>
              ))}
            </div>
          </>
        )}

        {/* Details Modal */}
        {showModal && selectedForm && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50 p-4">
            <div className="bg-white rounded-xl max-w-3xl w-full max-h-[90vh] overflow-y-auto">
              <div className="sticky top-0 bg-white border-b border-slate-200 px-6 py-4 flex justify-between items-center">
                <h3 className="text-lg font-semibold text-slate-800">Event Details</h3>
                <button onClick={() => setShowModal(false)} className="text-slate-400 hover:text-slate-600">
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>

              <div className="p-6 space-y-6">
                {/* Event Information */}
                <div>
                  <h4 className="text-md font-semibold text-slate-800 mb-3">Event Information</h4>
                  <div className="grid grid-cols-2 gap-4 text-sm">
                    <div>
                      <span className="font-medium text-slate-700">Faculty Name:</span>
                      <p className="text-slate-600">{selectedForm.staff_name}</p>
                    </div>
                    <div>
                      <span className="font-medium text-slate-700">Faculty ID:</span>
                      <p className="text-slate-600">{selectedForm.faculty_id}</p>
                    </div>
                    <div>
                      <span className="font-medium text-slate-700">Department:</span>
                      <p className="text-slate-600">{selectedForm.department}</p>
                    </div>
                    <div>
                      <span className="font-medium text-slate-700">Date of Joining:</span>
                      <p className="text-slate-600">{selectedForm.date_of_joining ? new Date(selectedForm.date_of_joining).toLocaleDateString() : '-'}</p>
                    </div>
                    <div className="col-span-2">
                      <span className="font-medium text-slate-700">Event Title:</span>
                      <p className="text-slate-600">{selectedForm.event_title}</p>
                    </div>
                    <div>
                      <span className="font-medium text-slate-700">Mode:</span>
                      <p className="text-slate-600">{selectedForm.mode_of_event}</p>
                    </div>
                    <div>
                      <span className="font-medium text-slate-700">Nature:</span>
                      <p className="text-slate-600">{selectedForm.nature_of_event}</p>
                    </div>
                    <div>
                      <span className="font-medium text-slate-700">Date From:</span>
                      <p className="text-slate-600">{new Date(selectedForm.date_from).toLocaleDateString()}</p>
                    </div>
                    <div>
                      <span className="font-medium text-slate-700">Date To:</span>
                      <p className="text-slate-600">{new Date(selectedForm.date_to).toLocaleDateString()}</p>
                    </div>
                    {selectedForm.platform && (
                      <div className="col-span-2">
                        <span className="font-medium text-slate-700">Platform:</span>
                        <p className="text-slate-600">{selectedForm.platform}</p>
                      </div>
                    )}
                    <div className="col-span-2">
                      <span className="font-medium text-slate-700">Purpose:</span>
                      <p className="text-slate-600">{selectedForm.purpose}</p>
                    </div>
                    <div className="col-span-2">
                      <span className="font-medium text-slate-700">Expected Outcome:</span>
                      <p className="text-slate-600">{selectedForm.expected_outcome}</p>
                    </div>
                  </div>
                </div>

                {/* Financial Information */}
                {selectedForm.is_applying_financial_support && (
                  <div>
                    <h4 className="text-md font-semibold text-slate-800 mb-3">Financial Information</h4>
                    <div className="grid grid-cols-2 gap-4 text-sm">
                      <div>
                        <span className="font-medium text-slate-700">Head:</span>
                        <p className="text-slate-600">{selectedForm.head_to_be_considered}</p>
                      </div>
                      <div>
                        <span className="font-medium text-slate-700">Already Claimed:</span>
                        <p className="text-slate-600">₹{selectedForm.already_claimed_amount || 0}</p>
                      </div>
                      <div>
                        <span className="font-medium text-slate-700">Amount Proposed:</span>
                        <p className="text-slate-600">₹{selectedForm.amount_proposed || 0}</p>
                      </div>
                    </div>
                  </div>
                )}

                {/* Proof Files */}
                {selectedForm.proof_urls && selectedForm.proof_urls.length > 0 && (
                  <div>
                    <h4 className="text-md font-semibold text-slate-800 mb-3">Proof Documents</h4>
                    <div className="space-y-2">
                      {selectedForm.proof_urls.map((url: string, index: number) => (
                        <a
                          key={index}
                          href={url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex items-center gap-2 text-blue-600 hover:text-blue-800 text-sm"
                        >
                          <FileText className="w-4 h-4" />
                          Document {index + 1}
                        </a>
                      ))}
                    </div>
                  </div>
                )}

                {/* Status and Remarks */}
                <div>
                  <h4 className="text-md font-semibold text-slate-800 mb-3">Status</h4>
                  <div className="space-y-2">
                    <div>
                      <span className={`px-3 py-1 text-sm font-semibold rounded-full ${getStatusBadge(selectedForm.status)}`}>
                        {selectedForm.status.charAt(0).toUpperCase() + selectedForm.status.slice(1)}
                      </span>
                    </div>
                    {selectedForm.hod_remarks && (
                      <div>
                        <span className="font-medium text-slate-700 text-sm">HOD Remarks:</span>
                        <p className="text-slate-600 text-sm mt-1">{selectedForm.hod_remarks}</p>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}
