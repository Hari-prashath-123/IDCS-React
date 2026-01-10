import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Calendar, CheckCircle, XCircle, Clock, ArrowLeft } from 'lucide-react';
import DashboardLayout from '../../components/DashboardLayout';
import { supabase } from '../../lib/supabase';
import api from '../../lib/api';
import { useAuth } from '../../contexts/AuthContext';

interface LeaveApplication {
  id: string;
  staff_id: string;
  leave_type: string;
  start_date: string;
  end_date: string;
  total_days: number;
  reason: string;
  contact_info: string;
  status: string;
  created_at: string;
  requires_hod_approval: boolean;
  requires_principal_approval: boolean;
  current_approver_role: string;
  is_emergency: boolean;
  staff: {
    name: string;
    email: string;
    department: string;
    staff_role: string;
  };
  staff_leave_approvals: Array<{
    id: string;
    approver_role: string;
    action: string;
    remarks: string;
    created_at: string;
  }>;
}

export default function StaffLeaveApprovalPage() {
  const { user, profile } = useAuth();
  const navigate = useNavigate();
  
  const [applications, setApplications] = useState<LeaveApplication[]>([]);
  const [loading, setLoading] = useState(true);
  const [processingId, setProcessingId] = useState<string | null>(null);
  const [selectedApp, setSelectedApp] = useState<LeaveApplication | null>(null);
  const [approvalRemarks, setApprovalRemarks] = useState('');
  const [showApprovalModal, setShowApprovalModal] = useState(false);
  const [approvalAction, setApprovalAction] = useState<'approved' | 'rejected'>('approved');

  const leaveTypes = {
    casual: { label: 'Casual Leave', color: 'bg-blue-100 text-blue-800' },
    sick: { label: 'Sick Leave', color: 'bg-red-100 text-red-800' },
    earned: { label: 'Earned Leave', color: 'bg-green-100 text-green-800' },
    emergency: { label: 'Emergency Leave', color: 'bg-orange-100 text-orange-800' },
    maternity: { label: 'Maternity Leave', color: 'bg-purple-100 text-purple-800' },
    other: { label: 'Other', color: 'bg-gray-100 text-gray-800' },
  };

  useEffect(() => {
    fetchPendingApplications();
  }, [user, profile]);

  const fetchPendingApplications = async () => {
    try {
      setLoading(true);
      
      if (!user?.id || !profile?.role) return;

      let query = supabase
        .from('staff_leave_applications')
        .select(`
          *,
          staff:staff_id (
            name, email, department, staff_role
          ),
          staff_leave_approvals (
            id, approver_role, action, remarks, created_at
          )
        `)
        .order('created_at', { ascending: false });

      // Filter based on user role
      if (profile.role === 'hod') {
        // HODs see applications from their department that require HOD approval
        query = query
          .eq('current_approver_role', 'hod')
          .eq('staff.department', profile.department);
      } else if (profile.role === 'principal') {
        // Principal sees applications that require principal approval
        query = query.eq('current_approver_role', 'principal');
      } else {
        // Regular staff shouldn't access this page
        setApplications([]);
        setLoading(false);
        return;
      }

      const { data, error } = await query;

      if (error) throw error;
      setApplications(data || []);
    } catch (error) {
      console.error('Error fetching applications:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleApproval = (app: LeaveApplication, action: 'approved' | 'rejected') => {
    setSelectedApp(app);
    setApprovalAction(action);
    setApprovalRemarks('');
    setShowApprovalModal(true);
  };

  const processApproval = async () => {
    if (!selectedApp || !user?.id) return;

    try {
      setProcessingId(selectedApp.id);

      const approverRole = profile?.role === 'hod' ? 'hod' : 'principal';

      // Notify backend to perform approval. Backend enforces permissions and
      // business rules and persists approval records.
      await api.post(`/leaves/${selectedApp.id}/approve/`, {
        action: approvalAction,
        remarks: approvalRemarks.trim() || null,
      });

      // Refresh applications list
      await fetchPendingApplications();
      
      setShowApprovalModal(false);
      setSelectedApp(null);
      setApprovalRemarks('');

      alert(`Leave application ${approvalAction} successfully!`);
    } catch (error) {
      console.error('Error processing approval:', error);
      alert('Failed to process approval. Please try again.');
    } finally {
      setProcessingId(null);
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'pending':
        return <span className="px-2 py-1 text-xs font-medium bg-yellow-100 text-yellow-800 rounded-full flex items-center gap-1">
          <Clock className="h-3 w-3" />
          Pending
        </span>;
      case 'approved':
        return <span className="px-2 py-1 text-xs font-medium bg-green-100 text-green-800 rounded-full flex items-center gap-1">
          <CheckCircle className="h-3 w-3" />
          Approved
        </span>;
      case 'rejected':
        return <span className="px-2 py-1 text-xs font-medium bg-red-100 text-red-800 rounded-full flex items-center gap-1">
          <XCircle className="h-3 w-3" />
          Rejected
        </span>;
      default:
        return <span className="px-2 py-1 text-xs font-medium bg-gray-100 text-gray-800 rounded-full">
          {status}
        </span>;
    }
  };

  const getApprovalWorkflow = (app: LeaveApplication) => {
    const workflow = [];
    
    if (app.requires_hod_approval) {
      const hodApproval = app.staff_leave_approvals?.find(a => a.approver_role === 'hod');
      workflow.push({
        role: 'HOD',
        status: hodApproval ? hodApproval.action : 
                (app.current_approver_role === 'hod' ? 'pending' : 'waiting'),
        remarks: hodApproval?.remarks,
        date: hodApproval?.created_at
      });
    }
    
    if (app.requires_principal_approval) {
      const principalApproval = app.staff_leave_approvals?.find(a => a.approver_role === 'principal');
      workflow.push({
        role: 'Principal',
        status: principalApproval ? principalApproval.action :
                (app.current_approver_role === 'principal' ? 'pending' : 'waiting'),
        remarks: principalApproval?.remarks,
        date: principalApproval?.created_at
      });
    }

    return workflow;
  };

  return (
    <DashboardLayout>
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div className="flex items-center gap-4">
            <button
              onClick={() => navigate(-1)}
              className="p-2 hover:bg-slate-100 rounded-lg transition-colors"
            >
              <ArrowLeft className="h-5 w-5 text-slate-600" />
            </button>
            <div>
              <h1 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
                <Calendar className="h-6 w-6 text-blue-600" />
                Staff Leave Approvals
              </h1>
              <p className="text-slate-600 mt-1">
                {profile?.role === 'hod' ? 'Approve leave applications from your department' : 'Approve leave applications requiring principal approval'}
              </p>
            </div>
          </div>
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
            <div className="text-sm text-blue-800 font-medium">
              Pending: {applications.filter(app => app.status === 'pending').length}
            </div>
            <div className="text-xs text-blue-600">
              Total: {applications.length}
            </div>
          </div>
        </div>

        {/* Approval Modal */}
        {showApprovalModal && selectedApp && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
            <div className="bg-white rounded-xl shadow-2xl max-w-md w-full">
              <div className="p-6">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-lg font-bold text-slate-800">
                    {approvalAction === 'approved' ? 'Approve' : 'Reject'} Leave Application
                  </h3>
                  <button
                    onClick={() => setShowApprovalModal(false)}
                    className="text-slate-400 hover:text-slate-600 transition-colors"
                  >
                    <svg className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>

                <div className="mb-4">
                  <div className="bg-slate-50 rounded-lg p-3 mb-3">
                    <p className="text-sm text-slate-600">
                      <strong>{selectedApp.staff.name}</strong> - {leaveTypes[selectedApp.leave_type as keyof typeof leaveTypes]?.label}
                    </p>
                    <p className="text-xs text-slate-500">
                      {new Date(selectedApp.start_date).toLocaleDateString()} - {new Date(selectedApp.end_date).toLocaleDateString()} ({selectedApp.total_days} days)
                    </p>
                  </div>
                  
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-2">
                      Remarks {approvalAction === 'rejected' ? '(Required)' : '(Optional)'}
                    </label>
                    <textarea
                      value={approvalRemarks}
                      onChange={(e) => setApprovalRemarks(e.target.value)}
                      rows={3}
                      className="w-full p-3 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      placeholder={approvalAction === 'approved' ? 'Optional comments...' : 'Please provide a reason for rejection...'}
                      required={approvalAction === 'rejected'}
                    />
                  </div>
                </div>

                <div className="flex gap-3">
                  <button
                    onClick={() => setShowApprovalModal(false)}
                    className="flex-1 px-4 py-2 border border-slate-300 text-slate-700 rounded-lg hover:bg-slate-50 transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={processApproval}
                    disabled={processingId === selectedApp.id || (approvalAction === 'rejected' && !approvalRemarks.trim())}
                    className={`flex-1 px-4 py-2 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${
                      approvalAction === 'approved'
                        ? 'bg-green-600 hover:bg-green-700 text-white'
                        : 'bg-red-600 hover:bg-red-700 text-white'
                    }`}
                  >
                    {processingId === selectedApp.id ? 'Processing...' : 
                     approvalAction === 'approved' ? 'Approve' : 'Reject'}
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Applications List */}
        <div className="bg-white rounded-xl shadow-lg border border-slate-200">
          <div className="p-6 border-b border-slate-200">
            <h2 className="text-lg font-bold text-slate-800">Pending Applications</h2>
            <p className="text-sm text-slate-600 mt-1">
              Review and approve leave applications
            </p>
          </div>

          {loading ? (
            <div className="p-8 text-center">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto"></div>
              <p className="mt-2 text-slate-600">Loading applications...</p>
            </div>
          ) : applications.length === 0 ? (
            <div className="p-8 text-center">
              <Calendar className="h-12 w-12 mx-auto text-slate-300 mb-4" />
              <p className="text-slate-500">No pending applications</p>
              <p className="text-sm text-slate-400 mt-1">All leave applications have been processed</p>
            </div>
          ) : (
            <div className="divide-y divide-slate-200">
              {applications.map((app) => {
                const leaveType = leaveTypes[app.leave_type as keyof typeof leaveTypes];
                const workflow = getApprovalWorkflow(app);
                const canApprove = app.current_approver_role === profile?.role && app.status === 'pending';

                return (
                  <div key={app.id} className="p-6">
                    <div className="flex items-start justify-between mb-4">
                      <div className="flex-1">
                        <div className="flex items-center gap-3 mb-2">
                          <h3 className="font-semibold text-slate-800">{app.staff.name}</h3>
                          <span className="text-sm text-slate-500">({app.staff.staff_role})</span>
                          {app.staff.department && (
                            <span className="text-sm text-slate-500">- {app.staff.department}</span>
                          )}
                        </div>
                        <div className="flex items-center gap-2 mb-3">
                          <span className={`px-3 py-1 rounded-full text-sm font-medium ${leaveType?.color}`}>
                            {leaveType?.label}
                          </span>
                          {getStatusBadge(app.status)}
                          {/* Emergency leave indicator removed as per request */}
                        </div>
                      </div>
                      <div className="text-right text-sm text-slate-500">
                        <div>Applied: {new Date(app.created_at).toLocaleDateString()}</div>
                        <div className="font-medium text-slate-800">{app.total_days} day(s)</div>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-4">
                      <div>
                        <h4 className="font-medium text-slate-800 mb-2">Leave Period</h4>
                        <p className="text-sm text-slate-600 mb-3">
                          {new Date(app.start_date).toLocaleDateString()} - {new Date(app.end_date).toLocaleDateString()}
                        </p>
                        
                        <h4 className="font-medium text-slate-800 mb-2">Reason</h4>
                        <p className="text-sm text-slate-600">{app.reason}</p>
                        
                        {app.contact_info && (
                          <>
                            <h4 className="font-medium text-slate-800 mb-2 mt-3">Contact Info</h4>
                            <p className="text-sm text-slate-600">{app.contact_info}</p>
                          </>
                        )}
                      </div>
                      
                      <div>
                        <h4 className="font-medium text-slate-800 mb-2">Approval Workflow</h4>
                        <div className="space-y-2">
                          {workflow.map((step, index) => (
                            <div key={index} className="flex items-center justify-between p-2 bg-slate-50 rounded-lg">
                              <span className="text-sm font-medium">{step.role}</span>
                              <span
                                className={`px-2 py-1 text-xs font-medium rounded-full ${
                                  step.status === 'approved' 
                                    ? 'bg-green-100 text-green-800'
                                    : step.status === 'rejected'
                                    ? 'bg-red-100 text-red-800'
                                    : step.status === 'pending'
                                    ? 'bg-yellow-100 text-yellow-800'
                                    : 'bg-gray-100 text-gray-600'
                                }`}
                              >
                                {step.status}
                              </span>
                            </div>
                          ))}
                        </div>
                        
                        {/* Previous Approvals */}
                        {app.staff_leave_approvals && app.staff_leave_approvals.length > 0 && (
                          <div className="mt-4">
                            <h4 className="font-medium text-slate-800 mb-2">Previous Approvals</h4>
                            <div className="space-y-2">
                              {app.staff_leave_approvals.map((approval) => (
                                <div key={approval.id} className="p-2 bg-slate-50 rounded text-xs">
                                  <div className="flex justify-between items-center">
                                    <span className="font-medium">{approval.approver_role.toUpperCase()}</span>
                                    <span className={`px-2 py-1 rounded-full ${
                                      approval.action === 'approved' 
                                        ? 'bg-green-100 text-green-800'
                                        : 'bg-red-100 text-red-800'
                                    }`}>
                                      {approval.action}
                                    </span>
                                  </div>
                                  {approval.remarks && (
                                    <p className="text-slate-600 mt-1">{approval.remarks}</p>
                                  )}
                                  <p className="text-slate-500 mt-1">
                                    {new Date(approval.created_at).toLocaleString()}
                                  </p>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Action Buttons */}
                    {canApprove && (
                      <div className="flex gap-3 pt-4 border-t border-slate-200">
                        <button
                          onClick={() => handleApproval(app, 'rejected')}
                          disabled={processingId === app.id}
                          className="flex items-center gap-2 px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg transition-colors disabled:opacity-50"
                        >
                          <XCircle className="h-4 w-4" />
                          Reject
                        </button>
                        <button
                          onClick={() => handleApproval(app, 'approved')}
                          disabled={processingId === app.id}
                          className="flex items-center gap-2 px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg transition-colors disabled:opacity-50"
                        >
                          <CheckCircle className="h-4 w-4" />
                          Approve
                        </button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </DashboardLayout>
  );
}