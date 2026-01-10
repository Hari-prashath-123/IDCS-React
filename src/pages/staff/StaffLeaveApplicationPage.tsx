import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Calendar, FileText, AlertCircle, CheckCircle, Clock, ArrowLeft } from 'lucide-react';
import DashboardLayout from '../../components/DashboardLayout';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';

interface LeaveApplication {
  id: string;
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
}

export default function StaffLeaveApplicationPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  
  const [applications, setApplications] = useState<LeaveApplication[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  
  // Form state
  const [formData, setFormData] = useState({
    leave_type: 'casual',
    start_date: '',
    end_date: '',
    reason: '',
    contact_info: '',
    is_emergency: false,
  });

  const leaveTypes = [
    { value: 'casual', label: 'Casual Leave', color: 'bg-blue-100 text-blue-800' },
    { value: 'sick', label: 'Sick Leave', color: 'bg-red-100 text-red-800' },
    { value: 'earned', label: 'Earned Leave', color: 'bg-green-100 text-green-800' },
    { value: 'emergency', label: 'Emergency Leave', color: 'bg-orange-100 text-orange-800' },
    { value: 'maternity', label: 'Maternity Leave', color: 'bg-purple-100 text-purple-800' },
    { value: 'other', label: 'Other', color: 'bg-gray-100 text-gray-800' },
  ];

  useEffect(() => {
    fetchApplications();
  }, [user]);

  const fetchApplications = async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('staff_leave_applications')
        .select(`
          *,
          staff_leave_approvals(
            id, approver_role, action, remarks, created_at
          )
        `)
        .eq('staff_id', user?.id)
        .order('created_at', { ascending: false });

      if (error) throw error;
      setApplications(data || []);
    } catch (error) {
      console.error('Error fetching applications:', error);
    } finally {
      setLoading(false);
    }
  };

  const calculateDays = (startDate: string, endDate: string): number => {
    if (!startDate || !endDate) return 0;
    const start = new Date(startDate);
    const end = new Date(endDate);
    const diffTime = Math.abs(end.getTime() - start.getTime());
    return Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user?.id) return;

    try {
      setSubmitting(true);

      // Validate dates
      const startDate = new Date(formData.start_date);
      const endDate = new Date(formData.end_date);
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      if (startDate < today) {
        alert('Start date cannot be in the past');
        return;
      }

      if (endDate < startDate) {
        alert('End date must be after start date');
        return;
      }

      calculateDays(formData.start_date, formData.end_date);

      const { error } = await supabase
        .from('staff_leave_applications')
        .insert({
          staff_id: user.id,
          leave_type: formData.leave_type,
          start_date: formData.start_date,
          end_date: formData.end_date,
          reason: formData.reason,
          contact_info: formData.contact_info,
          is_emergency: formData.is_emergency,
        });

      if (error) throw error;

      // Reset form and refresh applications
      setFormData({
        leave_type: 'casual',
        start_date: '',
        end_date: '',
        reason: '',
        contact_info: '',
        is_emergency: false,
      });
      setShowForm(false);
      fetchApplications();

      alert('Leave application submitted successfully!');
    } catch (error) {
      console.error('Error submitting application:', error);
      alert('Failed to submit application. Please try again.');
    } finally {
      setSubmitting(false);
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
          <AlertCircle className="h-3 w-3" />
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
      workflow.push({
        role: 'HOD',
        status: app.current_approver_role === 'hod' ? 'pending' : 
                (app.status === 'approved' || app.current_approver_role === 'principal') ? 'approved' : 'pending'
      });
    }
    
    if (app.requires_principal_approval) {
      workflow.push({
        role: 'Principal',
        status: app.current_approver_role === 'principal' ? 'pending' : 
                app.status === 'approved' ? 'approved' : 'pending'
      });
    }

    if (workflow.length === 0) {
      workflow.push({ role: 'Auto-approved', status: 'approved' });
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
                Staff Leave Management
              </h1>
              <p className="text-slate-600 mt-1">Apply for leave and track your applications</p>
            </div>
          </div>
          <button
            onClick={() => setShowForm(true)}
            className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg transition-colors flex items-center gap-2"
          >
            <FileText className="h-4 w-4" />
            New Application
          </button>
        </div>

        {/* Application Form Modal */}
        {showForm && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
            <div className="bg-white rounded-xl shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
              <div className="p-6">
                <div className="flex items-center justify-between mb-6">
                  <h2 className="text-xl font-bold text-slate-800">Apply for Leave</h2>
                  <button
                    onClick={() => setShowForm(false)}
                    className="text-slate-400 hover:text-slate-600 transition-colors"
                  >
                    <svg className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>

                <form onSubmit={handleSubmit} className="space-y-4">
                  {/* Leave Type */}
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-2">
                      Leave Type *
                    </label>
                    <select
                      value={formData.leave_type}
                      onChange={(e) => setFormData(prev => ({ ...prev, leave_type: e.target.value }))}
                      className="w-full p-3 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      required
                    >
                      {leaveTypes.map(type => (
                        <option key={type.value} value={type.value}>
                          {type.label}
                        </option>
                      ))}
                    </select>
                  </div>

                  {/* Date Range */}
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-2">
                        Start Date *
                      </label>
                      <input
                        type="date"
                        value={formData.start_date}
                        onChange={(e) => setFormData(prev => ({ ...prev, start_date: e.target.value }))}
                        min={new Date().toISOString().split('T')[0]}
                        className="w-full p-3 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                        required
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-2">
                        End Date *
                      </label>
                      <input
                        type="date"
                        value={formData.end_date}
                        onChange={(e) => setFormData(prev => ({ ...prev, end_date: e.target.value }))}
                        min={formData.start_date || new Date().toISOString().split('T')[0]}
                        className="w-full p-3 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                        required
                      />
                    </div>
                  </div>

                  {/* Duration Display */}
                  {formData.start_date && formData.end_date && (
                    <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
                      <p className="text-sm text-blue-800">
                        <strong>Duration:</strong> {calculateDays(formData.start_date, formData.end_date)} day(s)
                        {calculateDays(formData.start_date, formData.end_date) > 3 && (
                          <span className="ml-2 text-orange-600 font-medium">
                            (Requires HOD approval)
                          </span>
                        )}
                      </p>
                    </div>
                  )}

                  {/* Emergency Leave Checkbox removed as per request */}

                  {/* Reason */}
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-2">
                      Reason for Leave *
                    </label>
                    <textarea
                      value={formData.reason}
                      onChange={(e) => setFormData(prev => ({ ...prev, reason: e.target.value }))}
                      rows={3}
                      className="w-full p-3 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      placeholder="Please provide a detailed reason for your leave request"
                      required
                    />
                  </div>

                  {/* Contact Info */}
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-2">
                      Contact Information (Optional)
                    </label>
                    <input
                      type="text"
                      value={formData.contact_info}
                      onChange={(e) => setFormData(prev => ({ ...prev, contact_info: e.target.value }))}
                      className="w-full p-3 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      placeholder="Phone number or address where you can be reached"
                    />
                  </div>

                  {/* Form Actions */}
                  <div className="flex gap-3 pt-4">
                    <button
                      type="button"
                      onClick={() => setShowForm(false)}
                      className="flex-1 px-4 py-3 border border-slate-300 text-slate-700 rounded-lg hover:bg-slate-50 transition-colors"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      disabled={submitting}
                      className="flex-1 px-4 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {submitting ? 'Submitting...' : 'Submit Application'}
                    </button>
                  </div>
                </form>
              </div>
            </div>
          </div>
        )}

        {/* Applications List */}
        <div className="bg-white rounded-xl shadow-lg border border-slate-200">
          <div className="p-6 border-b border-slate-200">
            <h2 className="text-lg font-bold text-slate-800">Your Leave Applications</h2>
            <p className="text-sm text-slate-600 mt-1">
              Track the status of your leave applications
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
              <p className="text-slate-500">No leave applications found</p>
              <p className="text-sm text-slate-400 mt-1">Click "New Application" to apply for leave</p>
            </div>
          ) : (
            <div className="divide-y divide-slate-200">
              {applications.map((app) => {
                const leaveType = leaveTypes.find(t => t.value === app.leave_type);
                const workflow = getApprovalWorkflow(app);

                return (
                  <div key={app.id} className="p-6">
                    <div className="flex items-start justify-between mb-4">
                      <div className="flex items-center gap-3">
                        <span className={`px-3 py-1 rounded-full text-sm font-medium ${leaveType?.color}`}>
                          {leaveType?.label}
                        </span>
                        {getStatusBadge(app.status)}
                        {app.is_emergency && (
                          <span className="px-2 py-1 text-xs font-medium bg-red-100 text-red-800 rounded-full">
                            Emergency
                          </span>
                        )}
                      </div>
                      <div className="text-right text-sm text-slate-500">
                        <div>Applied: {new Date(app.created_at).toLocaleDateString()}</div>
                        <div>{app.total_days} day(s)</div>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                      <div>
                        <h4 className="font-medium text-slate-800 mb-2">Leave Period</h4>
                        <p className="text-sm text-slate-600">
                          {new Date(app.start_date).toLocaleDateString()} - {new Date(app.end_date).toLocaleDateString()}
                        </p>
                      </div>
                      <div>
                        <h4 className="font-medium text-slate-800 mb-2">Approval Workflow</h4>
                        <div className="flex gap-2 flex-wrap">
                          {workflow.map((step, index) => (
                            <span
                              key={index}
                              className={`px-2 py-1 text-xs font-medium rounded-full ${
                                step.status === 'approved' 
                                  ? 'bg-green-100 text-green-800'
                                  : step.status === 'pending'
                                  ? 'bg-yellow-100 text-yellow-800'
                                  : 'bg-gray-100 text-gray-600'
                              }`}
                            >
                              {step.role}
                            </span>
                          ))}
                        </div>
                      </div>
                    </div>

                    <div>
                      <h4 className="font-medium text-slate-800 mb-2">Reason</h4>
                      <p className="text-sm text-slate-600">{app.reason}</p>
                    </div>

                    {app.contact_info && (
                      <div className="mt-3">
                        <h4 className="font-medium text-slate-800 mb-2">Contact Info</h4>
                        <p className="text-sm text-slate-600">{app.contact_info}</p>
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