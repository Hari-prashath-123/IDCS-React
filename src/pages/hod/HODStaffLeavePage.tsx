import { useState, useEffect } from 'react';
import { Users, CheckCircle, XCircle, Clock, ArrowLeft } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import DashboardLayout from '../../components/DashboardLayout';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';

interface StaffLeaveApplication {
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

export default function HODStaffLeavePage() {
  const { user, profile } = useAuth();
  const navigate = useNavigate();
  
  const [applications, setApplications] = useState<StaffLeaveApplication[]>([]);
  const [loading, setLoading] = useState(true);
  const [processingId, setProcessingId] = useState<string | null>(null);
  const [selectedApp, setSelectedApp] = useState<StaffLeaveApplication | null>(null);
  const [approvalRemarks, setApprovalRemarks] = useState('');
  const [showApprovalModal, setShowApprovalModal] = useState(false);
  const [approvalAction, setApprovalAction] = useState<'approved' | 'rejected'>('approved');
  const [filterStatus, setFilterStatus] = useState<'all' | 'pending' | 'approved' | 'rejected'>('pending');

  const leaveTypes = {
    casual: { label: 'Casual Leave', color: 'bg-blue-100 text-blue-800' },
    sick: { label: 'Sick Leave', color: 'bg-red-100 text-red-800' },
    earned: { label: 'Earned Leave', color: 'bg-green-100 text-green-800' },
    emergency: { label: 'Emergency Leave', color: 'bg-orange-100 text-orange-800' },
    maternity: { label: 'Maternity Leave', color: 'bg-purple-100 text-purple-800' },
    other: { label: 'Other', color: 'bg-gray-100 text-gray-800' },
  };

  useEffect(() => {
    if (profile?.department) {
      fetchDepartmentStaffApplications();
    }
  }, [profile]);

  const fetchDepartmentStaffApplications = async () => {
    try {
      setLoading(true);
      
      // Fetch staff leave applications for staff in HOD's department
      const { data, error } = await supabase
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
        .eq('staff.department', profile?.department)
        .order('created_at', { ascending: false });

      if (error) throw error;
      
      // Filter to only show applications that need HOD approval or already processed by HOD
      const filteredApps = (data || []).filter((app: StaffLeaveApplication) => 
        app.current_approver_role === 'hod' || 
        app.staff_leave_approvals?.some(approval => approval.approver_role === 'hod')
      );
      
      setApplications(filteredApps);
    } catch (error) {
      console.error('Error fetching applications:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleApproval = (app: StaffLeaveApplication, action: 'approved' | 'rejected') => {
    setSelectedApp(app);
    setApprovalAction(action);
    setApprovalRemarks('');
    setShowApprovalModal(true);
  };

  const processApproval = async () => {
    if (!selectedApp || !user?.id) return;

    try {
      setProcessingId(selectedApp.id);

      // Insert approval record
      const { error: approvalError } = await supabase
        .from('staff_leave_approvals')
        .insert({
          application_id: selectedApp.id,
          approver_id: user.id,
          approver_role: 'hod',
          action: approvalAction,
          remarks: approvalRemarks || null,
        });

      if (approvalError) throw approvalError;

      // Determine next status and approver
      let newStatus: 'approved' | 'rejected' | 'pending' = approvalAction;
      let nextApproverRole: string | null = null;

      if (approvalAction === 'approved') {
        // If leave is more than 3 days, escalate to principal
        if (selectedApp.total_days > 3) {
          newStatus = 'pending';
          nextApproverRole = 'principal';
        } else {
          newStatus = 'approved';
        }
      } else {
        newStatus = 'rejected';
      }

      // Update application status
      const { error: updateError } = await supabase
        .from('staff_leave_applications')
        .update({
          status: newStatus,
          current_approver_role: nextApproverRole,
          updated_at: new Date().toISOString(),
        })
        .eq('id', selectedApp.id);

      if (updateError) throw updateError;

      alert(`Leave application ${approvalAction} successfully!`);
      setShowApprovalModal(false);
      setSelectedApp(null);
      setApprovalRemarks('');
      
      // Refresh the list
      fetchDepartmentStaffApplications();
    } catch (error) {
      console.error('Error processing approval:', error);
      alert('Failed to process approval. Please try again.');
    } finally {
      setProcessingId(null);
    }
  };

  const getStatusBadge = (status: string) => {
    const statusConfig = {
      pending: { label: 'Pending', icon: Clock, className: 'bg-yellow-100 text-yellow-800' },
      approved: { label: 'Approved', icon: CheckCircle, className: 'bg-green-100 text-green-800' },
      rejected: { label: 'Rejected', icon: XCircle, className: 'bg-red-100 text-red-800' },
    };

    const config = statusConfig[status as keyof typeof statusConfig] || statusConfig.pending;
    const Icon = config.icon;

    return (
      <span className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium ${config.className}`}>
        <Icon className="h-3 w-3" />
        {config.label}
      </span>
    );
  };

  const filteredApplications = applications.filter(app => {
    if (filterStatus === 'all') return true;
    if (filterStatus === 'pending') return app.status === 'pending' && app.current_approver_role === 'hod';
    return app.status === filterStatus;
  });

  const pendingCount = applications.filter(app => app.status === 'pending' && app.current_approver_role === 'hod').length;

  if (loading) {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center min-h-screen">
          <div className="text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
            <p className="mt-4 text-slate-600">Loading staff leave applications...</p>
          </div>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold text-slate-800">Staff Leave Approval</h1>
            <p className="text-sm text-slate-600 mt-1">Review and approve department staff leave (including AHOD). Leaves &gt; 3 days escalate to Principal.</p>
          </div>
          <button
            onClick={() => navigate(-1)}
            className="flex items-center gap-2 px-4 py-2 text-slate-600 hover:text-slate-800 hover:bg-slate-100 rounded-lg transition-colors"
          >
            <ArrowLeft className="h-4 w-4" />
            Back
          </button>
        </div>

        {/* Filter Tabs */}
        <div className="bg-white rounded-lg border border-slate-200 mb-6">
          <div className="flex border-b border-slate-200">
            <button
              onClick={() => setFilterStatus('pending')}
              className={`flex-1 px-4 py-3 text-sm font-medium transition-colors ${
                filterStatus === 'pending'
                  ? 'text-blue-600 border-b-2 border-blue-600'
                  : 'text-slate-600 hover:text-slate-800'
              }`}
            >
              Pending {pendingCount > 0 && `(${pendingCount})`}
            </button>
            <button
              onClick={() => setFilterStatus('all')}
              className={`flex-1 px-4 py-3 text-sm font-medium transition-colors ${
                filterStatus === 'all'
                  ? 'text-blue-600 border-b-2 border-blue-600'
                  : 'text-slate-600 hover:text-slate-800'
              }`}
            >
              All
            </button>
            <button
              onClick={() => setFilterStatus('approved')}
              className={`flex-1 px-4 py-3 text-sm font-medium transition-colors ${
                filterStatus === 'approved'
                  ? 'text-blue-600 border-b-2 border-blue-600'
                  : 'text-slate-600 hover:text-slate-800'
              }`}
            >
              Approved
            </button>
            <button
              onClick={() => setFilterStatus('rejected')}
              className={`flex-1 px-4 py-3 text-sm font-medium transition-colors ${
                filterStatus === 'rejected'
                  ? 'text-blue-600 border-b-2 border-blue-600'
                  : 'text-slate-600 hover:text-slate-800'
              }`}
            >
              Rejected
            </button>
          </div>
        </div>

        {/* Applications List */}
        {filteredApplications.length === 0 ? (
          <div className="bg-white rounded-xl border border-slate-200 p-12 text-center">
            <Users className="h-12 w-12 text-slate-400 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-slate-800 mb-2">No Applications</h3>
            <p className="text-slate-600">
              {filterStatus === 'pending' 
                ? 'No pending staff leave applications to review.'
                : `No ${filterStatus === 'all' ? '' : filterStatus} staff leave applications found.`
              }
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {filteredApplications.map((app) => (
              <div key={app.id} className="bg-white rounded-xl border border-slate-200 p-6 hover:shadow-md transition-shadow">
                {/* Staff Info Header */}
                <div className="flex items-start justify-between mb-4">
                  <div>
                    <h3 className="text-lg font-semibold text-slate-800">{app.staff?.name || 'Unknown Staff'}</h3>
                    <p className="text-sm text-slate-600">
                      {app.staff?.email} • {app.staff?.department} • {app.staff?.staff_role}
                    </p>
                  </div>
                  {getStatusBadge(app.status)}
                </div>

                {/* Leave Details Grid */}
                <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-4 p-4 bg-slate-50 rounded-lg">
                  <div>
                    <p className="text-xs text-slate-500 mb-1">Leave Type</p>
                    <span className={`inline-block px-2 py-1 rounded text-xs font-medium ${leaveTypes[app.leave_type as keyof typeof leaveTypes]?.color || 'bg-gray-100 text-gray-800'}`}>
                      {leaveTypes[app.leave_type as keyof typeof leaveTypes]?.label || app.leave_type}
                    </span>
                  </div>
                  <div>
                    <p className="text-xs text-slate-500 mb-1">Start Date</p>
                    <p className="text-sm font-medium text-slate-800">
                      {new Date(app.start_date).toLocaleDateString()}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-slate-500 mb-1">End Date</p>
                    <p className="text-sm font-medium text-slate-800">
                      {new Date(app.end_date).toLocaleDateString()}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-slate-500 mb-1">Total Days</p>
                    <p className="text-sm font-medium text-slate-800">
                      {app.total_days} {app.total_days === 1 ? 'day' : 'days'}
                      {app.total_days > 3 && (
                        <span className="ml-2 text-xs text-orange-600">(Requires Principal Approval)</span>
                      )}
                    </p>
                  </div>
                </div>

                {/* Reason */}
                <div className="mb-4">
                  <p className="text-xs text-slate-500 mb-1">Reason</p>
                  <p className="text-sm text-slate-800">{app.reason}</p>
                </div>

                {/* Contact Info */}
                {app.contact_info && (
                  <div className="mb-4">
                    <p className="text-xs text-slate-500 mb-1">Contact Information</p>
                    <p className="text-sm text-slate-800">{app.contact_info}</p>
                  </div>
                )}

                {/* Approval History */}
                {app.staff_leave_approvals && app.staff_leave_approvals.length > 0 && (
                  <div className="mb-4 p-4 bg-blue-50 rounded-lg">
                    <p className="text-xs font-medium text-slate-700 mb-2">Approval History</p>
                    <div className="space-y-2">
                      {app.staff_leave_approvals.map((approval) => (
                        <div key={approval.id} className="flex items-start gap-2 text-xs">
                          <span className={`px-2 py-1 rounded font-medium ${
                            approval.action === 'approved' ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
                          }`}>
                            {approval.action.toUpperCase()}
                          </span>
                          <span className="text-slate-600">
                            by {approval.approver_role.toUpperCase()} on {new Date(approval.created_at).toLocaleString()}
                            {approval.remarks && ` - ${approval.remarks}`}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Action Buttons */}
                {app.status === 'pending' && app.current_approver_role === 'hod' && (
                  <div className="flex gap-3">
                    <button
                      onClick={() => handleApproval(app, 'approved')}
                      disabled={processingId === app.id}
                      className="flex-1 flex items-center justify-center gap-2 px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg font-medium transition-colors disabled:opacity-50"
                    >
                      <CheckCircle className="h-4 w-4" />
                      Approve
                    </button>
                    <button
                      onClick={() => handleApproval(app, 'rejected')}
                      disabled={processingId === app.id}
                      className="flex-1 flex items-center justify-center gap-2 px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg font-medium transition-colors disabled:opacity-50"
                    >
                      <XCircle className="h-4 w-4" />
                      Reject
                    </button>
                  </div>
                )}

                {app.status === 'pending' && app.current_approver_role === 'principal' && (
                  <div className="p-3 bg-yellow-50 border border-yellow-200 rounded-lg">
                    <p className="text-sm text-yellow-800">
                      ⏳ This application has been escalated to the Principal for final approval (leave duration &gt; 3 days)
                    </p>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Approval Modal */}
      {showApprovalModal && selectedApp && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl max-w-md w-full p-6">
            <h3 className="text-lg font-bold text-slate-800 mb-4">
              {approvalAction === 'approved' ? 'Approve' : 'Reject'} Leave Application
            </h3>
            
            <div className="mb-4 p-4 bg-slate-50 rounded-lg">
              <p className="text-sm text-slate-600 mb-1">Staff: <span className="font-medium text-slate-800">{selectedApp.staff?.name}</span></p>
              <p className="text-sm text-slate-600 mb-1">Leave Type: <span className="font-medium text-slate-800">{leaveTypes[selectedApp.leave_type as keyof typeof leaveTypes]?.label}</span></p>
              <p className="text-sm text-slate-600">Duration: <span className="font-medium text-slate-800">{selectedApp.total_days} days</span></p>
            </div>

            {selectedApp.total_days > 3 && approvalAction === 'approved' && (
              <div className="mb-4 p-3 bg-yellow-50 border border-yellow-200 rounded-lg">
                <p className="text-sm text-yellow-800">
                  ℹ️ This application will be forwarded to the Principal for final approval since the leave duration exceeds 3 days.
                </p>
              </div>
            )}

            <div className="mb-4">
              <label className="block text-sm font-medium text-slate-700 mb-2">
                Remarks (Optional)
              </label>
              <textarea
                value={approvalRemarks}
                onChange={(e) => setApprovalRemarks(e.target.value)}
                rows={3}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                placeholder="Add any comments or remarks..."
              />
            </div>

            <div className="flex gap-3">
              <button
                onClick={() => {
                  setShowApprovalModal(false);
                  setSelectedApp(null);
                  setApprovalRemarks('');
                }}
                className="flex-1 px-4 py-2 border border-slate-300 text-slate-700 rounded-lg hover:bg-slate-50 font-medium transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={processApproval}
                disabled={processingId === selectedApp.id}
                className={`flex-1 px-4 py-2 text-white rounded-lg font-medium transition-colors ${
                  approvalAction === 'approved'
                    ? 'bg-green-600 hover:bg-green-700'
                    : 'bg-red-600 hover:bg-red-700'
                } disabled:opacity-50`}
              >
                {processingId === selectedApp.id ? 'Processing...' : `Confirm ${approvalAction === 'approved' ? 'Approval' : 'Rejection'}`}
              </button>
            </div>
          </div>
        </div>
      )}
    </DashboardLayout>
  );
}
