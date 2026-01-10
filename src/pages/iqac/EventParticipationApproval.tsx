import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Eye, CheckCircle, XCircle, FileText, Download } from 'lucide-react';
import DashboardLayout from '../../components/DashboardLayout';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';

interface EventForm {
  id: string;
  staff_id: string;
  staff_name: string;
  faculty_id: string;
  department: string;
  event_title: string;
  mode_of_event: string;
  date_from: string;
  date_to: string;
  nature_of_event: string;
  platform?: string;
  expected_outcome: string;
  purpose: string;
  proof_urls?: string[];
  is_applying_financial_support: boolean;
  head_to_be_considered?: string;
  already_claimed_amount?: number;
  amount_proposed?: number;
  status: string;
  hod_remarks?: string;
  iqac_remarks?: string;
  principal_remarks?: string;
  created_at: string;
}

export default function IQACEventApproval() {
  const navigate = useNavigate();
  const { user, profile } = useAuth();
  const [forms, setForms] = useState<EventForm[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedForm, setSelectedForm] = useState<EventForm | null>(null);
  const [showModal, setShowModal] = useState(false);
  const [showApprovalModal, setShowApprovalModal] = useState(false);
  const [actionType, setActionType] = useState<'approve' | 'reject'>('approve');
  const [remarks, setRemarks] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    fetchForms();
  }, [user]);

  const fetchForms = async () => {
    if (!user || !profile) return;
    try {
      setLoading(true);
      
      // IQAC sees all forms that were approved by HOD
      const { data, error } = await supabase
        .from('event_participation_forms')
        .select('*')
        .eq('status', 'hod_approved')
        .order('created_at', { ascending: false });

      if (error) throw error;
      setForms(data || []);
    } catch (e) {
      console.error('Failed to fetch forms', e);
    } finally {
      setLoading(false);
    }
  };

  const viewDetails = (form: EventForm) => {
    setSelectedForm(form);
    setShowModal(true);
  };

  const handleApprovalAction = (form: EventForm, type: 'approve' | 'reject') => {
    setSelectedForm(form);
    setActionType(type);
    setRemarks('');
    setShowApprovalModal(true);
  };

  const confirmAction = async () => {
    if (!selectedForm) return;

    try {
      setSubmitting(true);

      const updateData: any = {
        status: actionType === 'approve' ? 'iqac_approved' : 'iqac_rejected',
        iqac_remarks: remarks || null,
      };

      const { error } = await supabase
        .from('event_participation_forms')
        .update(updateData)
        .eq('id', selectedForm.id);

      if (error) throw error;

      alert(`Form ${actionType === 'approve' ? 'approved' : 'rejected'} successfully!`);
      setShowApprovalModal(false);
      setSelectedForm(null);
      setRemarks('');
      fetchForms();
    } catch (e: any) {
      console.error('Failed to update form', e);
      alert('Failed to update form: ' + (e.message || 'Unknown error'));
    } finally {
      setSubmitting(false);
    }
  };

  const getStatusBadge = (status: string) => {
    const styles: { [key: string]: string } = {
      hod_approved: 'bg-blue-100 text-blue-800',
      iqac_approved: 'bg-green-100 text-green-800',
      iqac_rejected: 'bg-red-100 text-red-800',
      principal_approved: 'bg-green-100 text-green-800',
      principal_rejected: 'bg-red-100 text-red-800',
    };
    return styles[status] || 'bg-slate-100 text-slate-800';
  };

  const getStatusText = (status: string) => {
    const texts: { [key: string]: string } = {
      hod_approved: 'HOD Approved',
      iqac_approved: 'IQAC Approved',
      iqac_rejected: 'IQAC Rejected',
      principal_approved: 'Principal Approved',
      principal_rejected: 'Principal Rejected',
    };
    return texts[status] || status;
  };

  return (
    <DashboardLayout>
      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6">
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-slate-800">IQAC Event Participation Approvals</h1>
          <p className="text-sm text-slate-600 mt-1">Review event participation forms approved by HODs</p>
        </div>

        {loading ? (
          <div className="text-center py-12">
            <div className="text-slate-600">Loading...</div>
          </div>
        ) : forms.length === 0 ? (
          <div className="bg-white rounded-xl border border-slate-200 p-12 text-center">
            <FileText className="w-16 h-16 text-slate-300 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-slate-800 mb-2">No submissions</h3>
            <p className="text-slate-600">No event participation forms pending IQAC review.</p>
          </div>
        ) : (
          <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-slate-200">
                <thead className="bg-slate-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase">Staff Name</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase">Department</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase">Event Title</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase">Nature</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase">Date</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase">Status</th>
                    <th className="px-6 py-3"></th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-slate-200">
                  {forms.map((form) => (
                    <tr key={form.id} className="hover:bg-slate-50">
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="text-sm font-medium text-slate-900">{form.staff_name}</div>
                        <div className="text-xs text-slate-500">{form.faculty_id}</div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="text-sm text-slate-600">{form.department}</div>
                      </td>
                      <td className="px-6 py-4">
                        <div className="text-sm text-slate-900 max-w-xs truncate">{form.event_title}</div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="text-sm text-slate-600">{form.nature_of_event}</div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="text-sm text-slate-600">
                          {new Date(form.date_from).toLocaleDateString()}
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${getStatusBadge(form.status)}`}>
                          {getStatusText(form.status)}
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium space-x-2">
                        <button
                          onClick={() => viewDetails(form)}
                          className="text-blue-600 hover:text-blue-800"
                          title="View Details"
                        >
                          <Eye className="w-5 h-5" />
                        </button>
                        {form.status === 'hod_approved' && (
                          <>
                            <button
                              onClick={() => handleApprovalAction(form, 'approve')}
                              className="text-green-600 hover:text-green-800"
                              title="Approve"
                            >
                              <CheckCircle className="w-5 h-5" />
                            </button>
                            <button
                              onClick={() => handleApprovalAction(form, 'reject')}
                              className="text-red-600 hover:text-red-800"
                              title="Reject"
                            >
                              <XCircle className="w-5 h-5" />
                            </button>
                          </>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      {/* View Details Modal (reuse same structure) */}
      {showModal && selectedForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50 p-4">
          <div className="bg-white rounded-lg shadow-xl max-w-3xl w-full max-h-[90vh] overflow-y-auto">
            <div className="sticky top-0 bg-white border-b border-slate-200 px-6 py-4">
              <div className="flex justify-between items-center">
                <h3 className="text-lg font-semibold text-slate-800">Event Details</h3>
                <button onClick={() => setShowModal(false)} className="text-slate-400 hover:text-slate-600">
                  <XCircle className="w-6 h-6" />
                </button>
              </div>
            </div>
            
            <div className="p-6 space-y-6">
              <div>
                <h4 className="font-semibold text-slate-800 mb-3">Staff Information</h4>
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div><span className="text-slate-600">Name:</span> <span className="font-medium">{selectedForm.staff_name}</span></div>
                  <div><span className="text-slate-600">Faculty ID:</span> <span className="font-medium">{selectedForm.faculty_id}</span></div>
                  <div><span className="text-slate-600">Department:</span> <span className="font-medium">{selectedForm.department}</span></div>
                  <div><span className="text-slate-600">Status:</span> <span className={`px-2 py-1 rounded-full text-xs ${getStatusBadge(selectedForm.status)}`}>{getStatusText(selectedForm.status)}</span></div>
                </div>
              </div>

              <div>
                <h4 className="font-semibold text-slate-800 mb-3">Event Information</h4>
                <div className="space-y-3 text-sm">
                  <div><span className="text-slate-600">Event Title:</span> <div className="font-medium mt-1">{selectedForm.event_title}</div></div>
                  <div className="grid grid-cols-2 gap-4">
                    <div><span className="text-slate-600">Mode:</span> <div className="font-medium mt-1">{selectedForm.mode_of_event}</div></div>
                    <div><span className="text-slate-600">Nature:</span> <div className="font-medium mt-1">{selectedForm.nature_of_event}</div></div>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div><span className="text-slate-600">From:</span> <div className="font-medium mt-1">{new Date(selectedForm.date_from).toLocaleDateString()}</div></div>
                    <div><span className="text-slate-600">To:</span> <div className="font-medium mt-1">{new Date(selectedForm.date_to).toLocaleDateString()}</div></div>
                  </div>
                  {selectedForm.platform && (
                    <div><span className="text-slate-600">Platform:</span> <div className="font-medium mt-1">{selectedForm.platform}</div></div>
                  )}
                  <div><span className="text-slate-600">Purpose:</span> <div className="font-medium mt-1">{selectedForm.purpose}</div></div>
                  <div><span className="text-slate-600">Expected Outcome:</span> <div className="font-medium mt-1 whitespace-pre-wrap">{selectedForm.expected_outcome}</div></div>
                </div>
              </div>

              {selectedForm.is_applying_financial_support && (
                <div>
                  <h4 className="font-semibold text-slate-800 mb-3">Financial Information</h4>
                  <div className="grid grid-cols-2 gap-4 text-sm">
                    <div><span className="text-slate-600">Head:</span> <div className="font-medium mt-1">{selectedForm.head_to_be_considered}</div></div>
                    <div><span className="text-slate-600">Amount Proposed:</span> <div className="font-medium mt-1">₹{selectedForm.amount_proposed?.toLocaleString()}</div></div>
                    <div><span className="text-slate-600">Already Claimed:</span> <div className="font-medium mt-1">₹{selectedForm.already_claimed_amount?.toLocaleString()}</div></div>
                  </div>
                </div>
              )}

              {selectedForm.proof_urls && selectedForm.proof_urls.length > 0 && (
                <div>
                  <h4 className="font-semibold text-slate-800 mb-3">Proof Documents</h4>
                  <div className="space-y-2">
                    {selectedForm.proof_urls.map((url, index) => (
                      <a key={index} href={url} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 text-blue-600 hover:text-blue-800 text-sm">
                        <Download className="w-4 h-4" />
                        Document {index + 1}
                      </a>
                    ))}
                  </div>
                </div>
              )}

              {(selectedForm.hod_remarks || selectedForm.iqac_remarks) && (
                <div>
                  <h4 className="font-semibold text-slate-800 mb-3">Remarks</h4>
                  <div className="space-y-2 text-sm">
                    {selectedForm.hod_remarks && (
                      <div className="bg-slate-50 p-3 rounded"><span className="font-medium text-slate-700">HOD:</span> {selectedForm.hod_remarks}</div>
                    )}
                    {selectedForm.iqac_remarks && (
                      <div className="bg-slate-50 p-3 rounded"><span className="font-medium text-slate-700">IQAC:</span> {selectedForm.iqac_remarks}</div>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Approval/Rejection Modal */}
      {showApprovalModal && selectedForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50 p-4">
          <div className="bg-white rounded-lg shadow-xl max-w-md w-full">
            <div className="p-6">
              <h3 className="text-lg font-semibold text-slate-800 mb-4">
                {actionType === 'approve' ? 'Approve' : 'Reject'} Event Form
              </h3>
              <p className="text-sm text-slate-600 mb-4">
                Are you sure you want to {actionType} this event participation form from {selectedForm.staff_name}?
              </p>
              <div className="mb-4">
                <label className="block text-sm font-medium text-slate-700 mb-2">
                  Remarks {actionType === 'reject' && <span className="text-red-500">*</span>}
                </label>
                <textarea
                  value={remarks}
                  onChange={(e) => setRemarks(e.target.value)}
                  rows={3}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                  placeholder="Enter your remarks..."
                />
              </div>
              <div className="flex justify-end gap-3">
                <button
                  onClick={() => setShowApprovalModal(false)}
                  className="px-4 py-2 border border-slate-300 text-slate-700 rounded-lg hover:bg-slate-50"
                  disabled={submitting}
                >
                  Cancel
                </button>
                <button
                  onClick={confirmAction}
                  disabled={submitting || (actionType === 'reject' && !remarks)}
                  className={`px-4 py-2 text-white rounded-lg ${
                    actionType === 'approve'
                      ? 'bg-green-600 hover:bg-green-700'
                      : 'bg-red-600 hover:bg-red-700'
                  } disabled:bg-slate-300 disabled:cursor-not-allowed`}
                >
                  {submitting ? 'Processing...' : actionType === 'approve' ? 'Approve' : 'Reject'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </DashboardLayout>
  );
}
