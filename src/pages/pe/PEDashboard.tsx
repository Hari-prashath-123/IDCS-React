import { useEffect, useState } from 'react';
import { Home, Users, FileText, Award, CreditCard, Bell } from 'lucide-react';
import DashboardLayout from '../../components/DashboardLayout';
import { useAuth } from '../../contexts/AuthContext';
import { supabase, withRetryBatch, withRetry } from '../../lib/supabase';
import { useNavigate } from 'react-router-dom';

export default function PEDashboard() {
  const { profile, user } = useAuth();
  const navigate = useNavigate();
  const isPEDept = profile?.department?.toLowerCase().includes('physical') || profile?.department?.toLowerCase() === 'pe';
  const isPEHOD = profile?.role === 'hod' && isPEDept;
  const isPEAHOD = profile?.role === 'ahod' && isPEDept;

  const [onLeave, setOnLeave] = useState(false);
  const [updatingLeave, setUpdatingLeave] = useState(false);
  const [showLeaveConfirmation, setShowLeaveConfirmation] = useState(false);
  const [showNotification, setShowNotification] = useState(false);
  const [notificationMessage, setNotificationMessage] = useState('');
  const [notificationType, setNotificationType] = useState<'success' | 'error'>('success');
  const [notifications, setNotifications] = useState<Array<{ id: string; type: string; status: string; date: string }>>([]);
  const [showNotifications, setShowNotifications] = useState(false);

  useEffect(() => {
    if (user) {
      fetchLeaveStatus();
      fetchNotifications();

      // Subscribe to staff row changes for leave status updates
      const staffChannel = supabase
        .channel(`staff-updates-${user.id}`)
        .on(
          'postgres_changes',
          {
            event: 'UPDATE',
            schema: 'public',
            table: 'staff',
            filter: `id=eq.${user.id}`,
          },
          (payload) => {
            const newVal = (payload.new as any)?.on_leave;
            if (typeof newVal === 'boolean') {
              setOnLeave(newVal);
            }
          }
        )
        .subscribe();

      return () => {
        try {
          staffChannel.unsubscribe();
        } catch (e) {
          /* ignore */
        }
      };
    }
  }, [user]);

  const fetchNotifications = async () => {
    try {
      const studentsResult = await withRetry(async () =>
        await supabase.from('students').select('id').eq('hod_id', user?.id)
      );

      const studentIds = studentsResult.data?.map((s: any) => s.id) || [];
      if (studentIds.length === 0) return;

      const [odApps, leaveApps, gatepassApps, bonafideApps] = await withRetryBatch([
        async () =>
          await supabase
            .from('od_applications')
            .select('id, status, updated_at')
            .in('student_id', studentIds)
            .order('updated_at', { ascending: false })
            .limit(3),
        async () =>
          await supabase
            .from('leave_applications')
            .select('id, status, updated_at')
            .in('student_id', studentIds)
            .order('updated_at', { ascending: false })
            .limit(3),
        async () =>
          await supabase
            .from('gatepass_applications')
            .select('id, status, updated_at')
            .in('student_id', studentIds)
            .order('updated_at', { ascending: false })
            .limit(3),
        async () =>
          await supabase
            .from('bonafide_applications')
            .select('id, status, updated_at')
            .in('student_id', studentIds)
            .order('updated_at', { ascending: false })
            .limit(3),
      ]);

      const allApps: any[] = [
        ...(odApps.data || []).map((app: any) => ({ ...app, type: 'OD' })),
        ...(leaveApps.data || []).map((app: any) => ({ ...app, type: 'Leave' })),
        ...(gatepassApps.data || []).map((app: any) => ({ ...app, type: 'Gatepass' })),
        ...(bonafideApps.data || []).map((app: any) => ({ ...app, type: 'Bonafide' })),
      ];

      allApps.sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime());
      const topApps = allApps.slice(0, 10);

      const notifs = topApps.map((app) => ({
        id: app.id,
        type: app.type,
        status: app.status,
        date: new Date(app.updated_at).toLocaleDateString(),
      }));

      setNotifications(notifs);
    } catch (error) {
      console.error('Error fetching notifications:', error);
    }
  };

  const fetchLeaveStatus = async () => {
    try {
      const { data: staffData } = await supabase
        .from('staff')
        .select('on_leave')
        .eq('id', user?.id)
        .maybeSingle();

      const initialLeaveStatus = staffData?.on_leave || false;
      setOnLeave(initialLeaveStatus);
    } catch (error) {
      console.error('Error fetching leave status:', error);
    }
  };

  const handleLeaveToggle = async () => {
    setShowLeaveConfirmation(true);
  };

  const confirmLeaveToggle = async () => {
    setShowLeaveConfirmation(false);
    const newLeaveStatus = !onLeave;

    try {
      setUpdatingLeave(true);

      const { data: updatedRow, error: updateError } = await supabase
        .from('staff')
        .update({ on_leave: newLeaveStatus })
        .eq('id', user?.id)
        .select('on_leave')
        .maybeSingle();

      if (updateError) {
        throw updateError;
      }

      const verified = updatedRow?.on_leave ?? newLeaveStatus;
      setOnLeave(verified);
      setNotificationMessage(
        `Leave status updated to: ${verified ? 'On Leave' : 'Active'}`
      );
      setNotificationType('success');
      setShowNotification(true);
    } catch (error) {
      console.error('Error toggling leave status:', error);
      setNotificationMessage(
        'Failed to update leave status. Please try again.'
      );
      setNotificationType('error');
      setShowNotification(true);
    } finally {
      setUpdatingLeave(false);
    }
  };

  const sidebarItems = [
    { label: 'Dashboard', path: '/pe-dashboard', icon: <Home className="h-5 w-5" /> },
    { label: 'Group OD', path: '/pe/group-od', icon: <Users className="h-5 w-5" /> },
  ];

  return (
    <DashboardLayout sidebarItems={sidebarItems}>
      <div className="max-w-7xl mx-auto">
        <div className="mb-8">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
            <div>
              <h1 className="text-xl font-bold text-slate-800">
                Welcome, {profile?.name}!
              </h1>
              <p className="text-slate-600 mt-1">
                {isPEHOD ? 'PE HOD' : isPEAHOD ? 'PE AHOD' : 'PE'} Dashboard - Physical Education Department
              </p>
            </div>

            {/* Leave Status Card */}
            <div className="bg-white rounded-xl border border-slate-200 p-3 shadow-sm md:min-w-[280px]">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-slate-700">
                  Leave Status:
                </span>
                <div className="flex items-center space-x-3">
                  <button
                    onClick={handleLeaveToggle}
                    disabled={updatingLeave}
                    className={`relative inline-flex h-8 w-14 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 ${
                      onLeave ? 'bg-red-600' : 'bg-green-600'
                    } ${updatingLeave ? 'opacity-50 cursor-not-allowed' : ''}`}
                  >
                    <span
                      className={`inline-block h-6 w-6 transform rounded-full bg-white transition-transform ${
                        onLeave ? 'translate-x-7' : 'translate-x-1'
                      }`}
                    />
                  </button>
                  <span
                    className={`text-sm font-semibold ${
                      onLeave ? 'text-red-600' : 'text-green-600'
                    }`}
                  >
                    {onLeave ? 'On Leave' : 'Active'}
                  </span>
                </div>
              </div>
            </div>
          </div>
          {onLeave && (
            <div className="mt-4 bg-orange-50 border border-orange-200 rounded-lg px-4 py-2">
              <p className="text-orange-700 font-semibold text-sm">
                ⚠️ On Leave - You will not receive new applications while on leave
              </p>
            </div>
          )}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6">
          <div 
            onClick={() => navigate('/pe/group-od')}
            className="bg-blue-50 border border-blue-200 rounded-xl shadow-sm border p-6 hover:shadow-lg transition-all hover:scale-105 cursor-pointer"
          >
            <div className="flex items-center justify-between mb-4">
              <div className="bg-white rounded-lg p-3 shadow-sm">
                <Users className="h-8 w-8 text-blue-600" />
              </div>
            </div>
            <h3 className="text-lg font-semibold text-slate-800 mb-2">Group OD</h3>
            <p className="text-sm text-slate-600">
              Apply for group on-duty for multiple students across departments
            </p>
          </div>

          {/* Placeholder/analytics column could go here (kept intentionally minimal) */}
          <div className="hidden md:block" />

          {/* Notifications Panel */}
          <div className="bg-white rounded-xl shadow-lg border border-slate-200 p-4">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-lg font-bold text-slate-800 flex items-center">
                <Bell className="h-5 w-5 mr-2 text-blue-600" />
                Notifications
              </h2>
              <span className="text-xs text-slate-500">{Math.min(notifications.length, 5)}</span>
            </div>
            {notifications.length === 0 ? (
              <div className="text-center py-6 text-slate-500">
                <Bell className="h-10 w-10 mx-auto text-slate-300 mb-2" />
                <p className="text-xs">No notifications</p>
              </div>
            ) : (
              <div className="overflow-auto max-h-96">
                <table className="w-full">
                  <thead className="sticky top-0 bg-white">
                    <tr className="border-b border-slate-200">
                      <th className="text-left py-2 px-2 text-xs font-semibold text-slate-600">Type</th>
                      <th className="text-left py-2 px-2 text-xs font-semibold text-slate-600">Status</th>
                      <th className="text-left py-2 px-2 text-xs font-semibold text-slate-600">Date</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {notifications.slice(0, 10).map((notif, idx) => (
                      <tr
                        key={idx}
                        className="hover:bg-slate-50 transition-colors cursor-pointer"
                        onClick={() => navigate('/notifications')}
                      >
                        <td className="py-2 px-2">
                          <span className="text-xs font-medium text-slate-800 block truncate">{notif.type}</span>
                        </td>
                        <td className="py-2 px-2">
                          <span
                            className={`inline-block px-1.5 py-0.5 rounded-full text-xs font-medium ${
                              notif.status === 'approved'
                                ? 'bg-green-100 text-green-700'
                                : notif.status === 'rejected'
                                ? 'bg-red-100 text-red-700'
                                : notif.status === 'pending'
                                ? 'bg-yellow-100 text-yellow-700'
                                : 'bg-slate-100 text-slate-700'
                            }`}
                          >
                            {notif.status}
                          </span>
                        </td>
                        <td className="py-2 px-2 text-xs text-slate-600">{notif.date}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>

        {/* Floating Notification Button */}
        <button
          onClick={() => setShowNotifications(!showNotifications)}
          className="md:hidden fixed bottom-6 right-6 bg-blue-600 hover:bg-blue-700 text-white rounded-full p-4 shadow-lg hover:shadow-xl transition-all z-40"
          aria-label="Notifications"
        >
          <Bell className="h-6 w-6" />
          {notifications.length > 0 && (
            <span className="absolute -top-1 -right-1 bg-red-500 text-white text-xs font-bold rounded-full h-5 w-5 flex items-center justify-center">
              {notifications.length}
            </span>
          )}
        </button>

        {/* Notification Popup */}
        {showNotifications && (
          <>
            <div className="fixed inset-0 bg-black bg-opacity-25 z-40" onClick={() => setShowNotifications(false)} />
            <div className="fixed bottom-4 md:bottom-auto md:top-20 left-4 right-4 md:left-auto md:right-6 md:w-96 bg-white rounded-xl shadow-2xl border border-slate-200 z-50 max-h-[80vh] md:max-h-[600px] flex flex-col transition-all duration-500 ease-out animate-in slide-in-from-bottom-8 md:slide-in-from-top-4 fade-in">
              <div className="flex items-center justify-between p-4 border-b border-slate-200">
                <h2 className="text-lg font-bold text-slate-800 flex items-center">
                  <Bell className="h-5 w-5 mr-2 text-blue-600" />
                  Notifications
                </h2>
                <button onClick={() => setShowNotifications(false)} className="text-slate-400 hover:text-slate-600 transition-colors p-1 hover:bg-slate-100 rounded" aria-label="Close">
                  <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
              <div className="flex-1 overflow-y-auto p-4 space-y-3">
                {notifications.length === 0 ? (
                  <p className="text-slate-500 text-center py-8">No notifications at the moment</p>
                ) : (
                  notifications.map((notif, index) => (
                    <div key={index} className="p-3 bg-slate-50 rounded-lg border border-slate-200 hover:border-blue-300 transition-colors cursor-pointer" onClick={() => navigate('/notifications')}>
                      <p className="text-sm text-slate-700">{notif.type} application {notif.status} - {notif.date}</p>
                    </div>
                  ))
                )}
              </div>
            </div>
          </>
        )}
      </div>

      {/* Leave Status Confirmation Modal */}
      {showLeaveConfirmation && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50 p-4">
          <div className="bg-white rounded-lg shadow-xl max-w-md w-full mx-4">
            <div className="p-6">
              <div className="flex items-center mb-4">
                <div className={`flex-shrink-0 w-12 h-12 ${onLeave ? 'bg-green-100' : 'bg-orange-100'} rounded-full flex items-center justify-center`}>
                  <Bell className={`w-6 h-6 ${onLeave ? 'text-green-600' : 'text-orange-600'}`} />
                </div>
                <div className="ml-4">
                  <h3 className="text-lg font-medium text-gray-900">Confirm Leave Status</h3>
                  <p className="text-sm text-gray-500">
                    {onLeave
                      ? 'Mark yourself as active? You will start receiving new applications.'
                      : 'Mark yourself as on leave? New applications will be routed to the next approver.'}
                  </p>
                </div>
              </div>
              <div className="flex justify-end space-x-3">
                <button
                  onClick={() => setShowLeaveConfirmation(false)}
                  className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 border border-gray-300 rounded-md hover:bg-gray-200 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-gray-500 transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={confirmLeaveToggle}
                  className={`px-4 py-2 text-sm font-medium text-white border border-transparent rounded-md focus:outline-none focus:ring-2 focus:ring-offset-2 transition-colors ${
                    onLeave
                      ? 'bg-green-600 hover:bg-green-700 focus:ring-green-500'
                      : 'bg-orange-600 hover:bg-orange-700 focus:ring-orange-500'
                  }`}
                >
                  {onLeave ? 'Mark Active' : 'Mark On Leave'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Notification Toast */}
      {showNotification && (
        <div className="fixed bottom-4 right-4 z-50 animate-slide-up">
          <div
            className={`rounded-lg px-6 py-4 shadow-lg ${
              notificationType === 'success'
                ? 'bg-green-50 border border-green-200'
                : 'bg-red-50 border border-red-200'
            }`}
          >
            <div className="flex items-center space-x-3">
              <div
                className={`flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center ${
                  notificationType === 'success' ? 'bg-green-100' : 'bg-red-100'
                }`}
              >
                {notificationType === 'success' ? (
                  <svg
                    className="w-5 h-5 text-green-600"
                    fill="none"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth="2"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path d="M5 13l4 4L19 7"></path>
                  </svg>
                ) : (
                  <svg
                    className="w-5 h-5 text-red-600"
                    fill="none"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth="2"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path d="M6 18L18 6M6 6l12 12"></path>
                  </svg>
                )}
              </div>
              <p
                className={`text-sm font-medium ${
                  notificationType === 'success' ? 'text-green-800' : 'text-red-800'
                }`}
              >
                {notificationMessage}
              </p>
              <button
                onClick={() => setShowNotification(false)}
                className={`ml-4 ${
                  notificationType === 'success' ? 'text-green-600 hover:text-green-800' : 'text-red-600 hover:text-red-800'
                }`}
              >
                <svg
                  className="w-5 h-5"
                  fill="none"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth="2"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path d="M6 18L18 6M6 6l12 12"></path>
                </svg>
              </button>
            </div>
          </div>
        </div>
      )}
    </DashboardLayout>
  );
}
