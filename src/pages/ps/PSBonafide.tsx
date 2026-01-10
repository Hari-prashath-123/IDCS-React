import { useEffect, useState } from 'react';
import DashboardLayout from '../../components/DashboardLayout';
import { supabase } from '../../lib/supabase';
// Unused imports removed
import ReasonList from '../../components/ReasonList';
import { useAuth } from '../../contexts/AuthContext';

export default function PSBonafide() {
  const { profile } = useAuth();
  const [apps, setApps] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showProofUrl, setShowProofUrl] = useState<string | null>(null);
  const [view, setView] = useState<'department' | 'students'>('department');
  const [processingApps, setProcessingApps] = useState<Record<string, boolean>>({});

  useEffect(() => {
    fetchAll();
    // subscribe to changes so PS view updates when HOD or others act
    const appsChannel = supabase
      .channel('ps-bonafide-applications')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'bonafide_applications' }, () => fetchAll())
      .subscribe();

    const approvalsChannel = supabase
      .channel('ps-bonafide-approvals')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'bonafide_approvals' }, () => fetchAll())
      .subscribe();

    return () => {
      try { appsChannel.unsubscribe(); } catch (e) {}
      try { approvalsChannel.unsubscribe(); } catch (e) {}
    };
  }, []);

  async function fetchAll() {
    setLoading(true);
    try {
      // Parallel fetch applications, profiles, and approvals
      // Fetch: 1) Pending applications at PS level, 2) Completed/approved applications
      // Exclude rejected applications (they should never reach PS)
      const [appsResult, profilesResult] = await Promise.all([
        supabase.from('bonafide_applications')
          .select('*')
          .or('and(current_approver_level.eq.ps,status.eq.pending),and(current_approver_level.eq.completed,status.eq.approved)')
          .order('created_at', { ascending: false })
          .limit(100), // Reduced from 500 for better performance
        supabase.from('profiles').select('id,name,email')
      ]);

      if (appsResult.error) throw appsResult.error;
      const appsArr = appsResult.data || [];

      // Filter relevant student IDs from fetched apps
      const studentIds = [...new Set(appsArr.map((a: any) => a.student_id).filter(Boolean))];
      const profiles = (profilesResult.data || []).filter((p: any) => studentIds.includes(p.id));
      const profilesMap = new Map(profiles.map((p: any) => [p.id, p]));

      // Batch fetch approvals for only these applications
      const appIds = appsArr.map((a: any) => a.id);
      const { data: approvals } = await supabase
        .from('bonafide_approvals')
        .select('*')
        .in('application_id', appIds)
        .order('created_at', { ascending: true });

      const approvalsMap = new Map<string, any[]>();
      (approvals || []).forEach((ap: any) => {
        approvalsMap.set(ap.application_id, [...(approvalsMap.get(ap.application_id) || []), ap]);
      });

      const enriched = appsArr.map((a: any) => ({
        ...a,
        profile: profilesMap.get(a.student_id) || null,
        approvals: approvalsMap.get(a.id) || [],
      }));

      setApps(enriched);
      console.debug('PSBonafide: fetched', enriched.length, 'applications');
    } catch (err) {
      console.error('Error fetching bonafide apps for PS:', err);
      setApps([]);
    } finally {
      setLoading(false);
    }
  }

  const extractUserReason = (app: any) => {
    if (!app) return '-';
    const raw = String(app.reason || '').trim();
    if (!raw) return app.purpose || '-';
    const parts = raw.split('|');
    let left = parts[0] || raw;
    left = left.replace(/^\s*Bonafide\s*-\s*/i, '').trim();
    if (left) return left;
    return app.purpose || '-';
  };

  const handlePSAction = async (appId: string, action: 'approved' | 'rejected', remarks?: string) => {
    try {
      if (processingApps[appId]) return;
      setProcessingApps(prev => ({ ...prev, [appId]: true }));

      // ensure server-side that PS hasn't already acted
      // Use atomic RPC to insert approval and update application in one transaction
      try {
        const rpcParams = {
          p_application_id: appId,
          p_approver_id: (profile as any)?.id || null,
          p_approver_role: 'ps',
          p_action: action,
          p_remarks: (remarks || '')
        };

        const { error: rpcErr } = await supabase.rpc('approve_bonafide_application', rpcParams);
        if (rpcErr) {
          console.error('approve_bonafide_application RPC error', rpcErr);
          const errText = JSON.stringify({ message: rpcErr.message, code: (rpcErr as any).code, details: (rpcErr as any).details }, Object.getOwnPropertyNames(rpcErr));
          alert('Approval failed: ' + errText);
          setProcessingApps(prev => { const c = { ...prev }; delete c[appId]; return c; });
          await fetchAll();
          return;
        }

        // rpc returns inserted approval and app status; refresh local list
        await fetchAll();
        alert(`Application ${action} successfully.`);
        setProcessingApps(prev => { const c = { ...prev }; delete c[appId]; return c; });
        return;
      } catch (rpcEx) {
        console.error('Error calling approve_bonafide_application RPC', rpcEx);
        alert('Failed to process action.');
        setProcessingApps(prev => { const c = { ...prev }; delete c[appId]; return c; });
        await fetchAll();
        return;
      }
    } catch (err) {
      console.error('Error processing PS action:', err);
      alert('Failed to process action.');
      setProcessingApps(prev => { const c = { ...prev }; delete c[appId]; return c; });
    }
  };

  // Approval history will show icons for approve/reject; badges removed per PS UX request

  const renderStudentsView = () => {
    return (
      <div className="space-y-3 sm:space-y-4">
        {apps.map((app) => {
          const approvalsArr = app.approvals || [];
          const hasHODApproved = approvalsArr.some((ap: any) => ap.approver_role === 'hod' && ap.action === 'approved');
          const hasPSApproved = approvalsArr.some((ap: any) => ap.approver_role === 'ps');
          const lastApproval = approvalsArr.length ? approvalsArr[approvalsArr.length - 1] : null;
          const lastApprovalRole = lastApproval?.approver_role;
          const canPSAct = profile?.role === 'ps' && app.status === 'pending' && (
            app.current_approver_level === 'ps' ||
            (hasHODApproved && !hasPSApproved) ||
            (lastApprovalRole === 'hod' && !hasPSApproved)
          );

          return (
            <div key={app.id} className="bg-white rounded-xl shadow-lg border border-slate-200 p-4 sm:p-6">
              <div className="flex flex-col sm:flex-row sm:justify-between sm:items-start mb-3 sm:mb-4 gap-2">
                <div className="flex-1">
                  <h3 className="text-base sm:text-lg font-bold text-slate-800">{app.profile?.name || app.student_id}</h3>
                  <p className="text-xs sm:text-sm text-slate-600 mt-1">{app.profile?.email || ''}</p>
                </div>
                <span
                  className={`px-3 py-1 rounded-full text-xs font-medium self-start ${
                    app.status === 'approved'
                      ? 'bg-green-100 text-green-700'
                      : app.status === 'rejected'
                      ? 'bg-red-100 text-red-700'
                      : 'bg-yellow-100 text-yellow-700'
                  }`}
                >
                  {app.status}
                </span>
              </div>

              <div className="space-y-2 mb-4">
                {(app.purpose || app.purpose === '') && (
                  <div className="flex text-sm">
                    <span className="font-medium text-slate-700 w-24">
                      Purpose:
                    </span>
                    <span className="text-slate-600">{app.purpose || '-'}</span>
                  </div>
                )}
                {app.fathers_name && (
                  <div className="flex text-sm">
                    <span className="font-medium text-slate-700 w-24">
                      Father's Name:
                    </span>
                    <span className="text-slate-600">{app.fathers_name}</span>
                  </div>
                )}
                {app.branch && (
                  <div className="flex text-sm">
                    <span className="font-medium text-slate-700 w-24">
                      Branch:
                    </span>
                    <span className="text-slate-600">{app.branch}</span>
                  </div>
                )}
                {app.community && (
                  <div className="flex text-sm">
                    <span className="font-medium text-slate-700 w-24">
                      Community:
                    </span>
                    <span className="text-slate-600">{app.community}</span>
                  </div>
                )}
                {app.study_mode && (
                  <div className="flex text-sm">
                    <span className="font-medium text-slate-700 w-24">
                      Study Mode:
                    </span>
                    <span className="text-slate-600 capitalize">
                      {app.study_mode === 'day_scholar' ? 'Day Scholar' : 'Hostel'}
                    </span>
                  </div>
                )}
                {app.bus_option && (
                  <div className="flex text-sm">
                    <span className="font-medium text-slate-700 w-24">
                      Bus:
                    </span>
                    <span className="text-slate-600 capitalize">
                      {app.bus_option === 'college' ? 'College Bus' : 'Out Bus'}
                      {app.bus_fare && ` (₹${app.bus_fare})`}
                    </span>
                  </div>
                )}
                {app.funding && (
                  <div className="flex text-sm">
                    <span className="font-medium text-slate-700 w-24">
                      Funding:
                    </span>
                    <span className="text-slate-600">
                      {app.funding}
                      {app.first_graduate && ` (First Graduate: ${app.first_graduate})`}
                    </span>
                  </div>
                )}
                <div className="flex text-sm">
                  <span className="font-medium text-slate-700 w-24">Reason:</span>
                  <div className="flex-1">
                    <ReasonList reason={extractUserReason(app)} className="ml-0" />
                  </div>
                </div>
                <div className="flex text-sm">
                  <span className="font-medium text-slate-700 w-24">
                    Applied:
                  </span>
                  <span className="text-slate-600">
                    {new Date(app.created_at).toLocaleString()}
                  </span>
                </div>
                {app.attachment_url && (
                  <div className="flex text-sm">
                    <span className="font-medium text-slate-700 w-24">Proof:</span>
                    <span className="text-slate-600">
                      <button
                        type="button"
                        onClick={() => setShowProofUrl(app.attachment_url)}
                        className="text-blue-600 hover:underline cursor-pointer"
                      >
                        View proof
                      </button>
                    </span>
                  </div>
                )}
              </div>

              {canPSAct && (
                <div className="flex justify-center">
                  <button 
                    disabled={!!processingApps[app.id]} 
                    onClick={() => { 
                      const remarks = prompt('Remarks (optional):'); 
                      handlePSAction(app.id, 'approved', remarks || undefined); 
                    }} 
                    className={`py-2 px-6 text-sm rounded-lg transition-colors font-medium ${
                      processingApps[app.id] 
                        ? 'bg-green-300 text-white cursor-not-allowed' 
                        : 'bg-green-600 text-white hover:bg-green-700'
                    }`}
                  >
                    Mark as Done
                  </button>
                </div>
              )}
            </div>
          );
        })}
      </div>
    );
  };

  return (
    <DashboardLayout>
      <div className="max-w-7xl mx-auto px-4 sm:px-6">
        <div className="mb-6 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold text-slate-800">Bonafide Applications</h1>
            <p className="text-sm text-slate-600 mt-1">All bonafide applications in the system</p>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={() => setView('department')} className={`px-3 py-2 rounded-md text-sm font-medium ${view === 'department' ? 'bg-blue-600 text-white' : 'bg-white text-slate-700 border border-slate-200'}`}>By Department</button>
            <button onClick={() => setView('students')} className={`px-3 py-2 rounded-md text-sm font-medium ${view === 'students' ? 'bg-blue-600 text-white' : 'bg-white text-slate-700 border border-slate-200'}`}>All Students</button>
          </div>
        </div>

        {loading ? (
          <div className="fixed inset-0 z-50 bg-white/90 flex flex-col items-center justify-center">
            <div className="animate-spin rounded-full h-14 w-14 border-b-2 border-blue-600"></div>
            <p className="mt-4 text-slate-600 text-lg">Loading applications...</p>
          </div>
        ) : apps.length === 0 ? (
          <div className="bg-white rounded-xl shadow border p-8 text-center">
            <p className="text-slate-600">No bonafide applications found.</p>
          </div>
        ) : view === 'department' ? (
          // Group by branch/department
          (() => {
            const groups = new Map<string, any[]>();
            for (const a of apps) {
              const b = a.branch || 'Unknown';
              if (!groups.has(b)) groups.set(b, []);
              const arr = groups.get(b)!;
              arr.push(a);
            }
            const entries = Array.from(groups.entries()).sort((x, y) => y[1].length - x[1].length);
            return (
              <div className="space-y-6">
                {entries.map(([branch, items]) => (
                  <div key={branch} className="bg-white rounded-xl border p-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <h3 className="text-lg font-semibold text-slate-800">{branch}</h3>
                        <p className="text-sm text-slate-500">{items.length} applications</p>
                      </div>
                    </div>
                    <div className="mt-3 space-y-3 sm:space-y-4">
                      {items.map((app) => {
                        const approvalsArr = app.approvals || [];
                        const hasHODApproved = approvalsArr.some((ap: any) => ap.approver_role === 'hod' && ap.action === 'approved');
                        const hasPSApproved = approvalsArr.some((ap: any) => ap.approver_role === 'ps');
                        const lastApproval = approvalsArr.length ? approvalsArr[approvalsArr.length - 1] : null;
                        const lastApprovalRole = lastApproval?.approver_role;
                        const canPSAct = profile?.role === 'ps' && app.status === 'pending' && (
                          app.current_approver_level === 'ps' ||
                          (hasHODApproved && !hasPSApproved) ||
                          (lastApprovalRole === 'hod' && !hasPSApproved)
                        );

                        return (
                          <div key={app.id} className="bg-white rounded-xl shadow-lg border border-slate-200 p-4 sm:p-6">
                            <div className="flex flex-col sm:flex-row sm:justify-between sm:items-start mb-3 sm:mb-4 gap-2">
                              <div className="flex-1">
                                <h3 className="text-base sm:text-lg font-bold text-slate-800">{app.profile?.name || app.student_id}</h3>
                                <p className="text-xs sm:text-sm text-slate-600 mt-1">{app.profile?.email || ''}</p>
                              </div>
                              <span
                                className={`px-3 py-1 rounded-full text-xs font-medium self-start ${
                                  app.status === 'approved'
                                    ? 'bg-green-100 text-green-700'
                                    : app.status === 'rejected'
                                    ? 'bg-red-100 text-red-700'
                                    : 'bg-yellow-100 text-yellow-700'
                                }`}
                              >
                                {app.status}
                              </span>
                            </div>

                            <div className="space-y-2 mb-4">
                              {(app.purpose || app.purpose === '') && (
                                <div className="flex text-sm">
                                  <span className="font-medium text-slate-700 w-24">
                                    Purpose:
                                  </span>
                                  <span className="text-slate-600">{app.purpose || '-'}</span>
                                </div>
                              )}
                              {app.fathers_name && (
                                <div className="flex text-sm">
                                  <span className="font-medium text-slate-700 w-24">
                                    Father's Name:
                                  </span>
                                  <span className="text-slate-600">{app.fathers_name}</span>
                                </div>
                              )}
                              {app.branch && (
                                <div className="flex text-sm">
                                  <span className="font-medium text-slate-700 w-24">
                                    Branch:
                                  </span>
                                  <span className="text-slate-600">{app.branch}</span>
                                </div>
                              )}
                              {app.community && (
                                <div className="flex text-sm">
                                  <span className="font-medium text-slate-700 w-24">
                                    Community:
                                  </span>
                                  <span className="text-slate-600">{app.community}</span>
                                </div>
                              )}
                              {app.study_mode && (
                                <div className="flex text-sm">
                                  <span className="font-medium text-slate-700 w-24">
                                    Study Mode:
                                  </span>
                                  <span className="text-slate-600 capitalize">
                                    {app.study_mode === 'day_scholar' ? 'Day Scholar' : 'Hostel'}
                                  </span>
                                </div>
                              )}
                              {app.bus_option && (
                                <div className="flex text-sm">
                                  <span className="font-medium text-slate-700 w-24">
                                    Bus:
                                  </span>
                                  <span className="text-slate-600 capitalize">
                                    {app.bus_option === 'college' ? 'College Bus' : 'Out Bus'}
                                    {app.bus_fare && ` (₹${app.bus_fare})`}
                                  </span>
                                </div>
                              )}
                              {app.funding && (
                                <div className="flex text-sm">
                                  <span className="font-medium text-slate-700 w-24">
                                    Funding:
                                  </span>
                                  <span className="text-slate-600">
                                    {app.funding}
                                    {app.first_graduate && ` (First Graduate: ${app.first_graduate})`}
                                  </span>
                                </div>
                              )}
                              <div className="flex text-sm">
                                <span className="font-medium text-slate-700 w-24">Reason:</span>
                                <div className="flex-1">
                                  <ReasonList reason={extractUserReason(app)} className="ml-0" />
                                </div>
                              </div>
                              <div className="flex text-sm">
                                <span className="font-medium text-slate-700 w-24">
                                  Applied:
                                </span>
                                <span className="text-slate-600">
                                  {new Date(app.created_at).toLocaleString()}
                                </span>
                              </div>
                              {app.attachment_url && (
                                <div className="flex text-sm">
                                  <span className="font-medium text-slate-700 w-24">Proof:</span>
                                  <span className="text-slate-600">
                                    <button
                                      type="button"
                                      onClick={() => setShowProofUrl(app.attachment_url)}
                                      className="text-blue-600 hover:underline cursor-pointer"
                                    >
                                      View proof
                                    </button>
                                  </span>
                                </div>
                              )}
                            </div>

                            {canPSAct && (
                              <div className="flex justify-center">
                                <button 
                                  disabled={!!processingApps[app.id]} 
                                  onClick={() => { 
                                    const remarks = prompt('Remarks (optional):'); 
                                    handlePSAction(app.id, 'approved', remarks || undefined); 
                                  }} 
                                  className={`py-2 px-6 text-sm rounded-lg transition-colors font-medium ${
                                    processingApps[app.id] 
                                      ? 'bg-green-300 text-white cursor-not-allowed' 
                                      : 'bg-green-600 text-white hover:bg-green-700'
                                  }`}
                                >
                                  Mark as Done
                                </button>
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            );
          })()
        ) : (
          renderStudentsView()
        )}

        {showProofUrl && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-70 p-4">
            <div className="bg-white rounded-lg overflow-hidden max-w-4xl w-full">
              <div className="p-3 text-right"><button onClick={() => setShowProofUrl(null)} className="text-slate-600">Close</button></div>
              {showProofUrl.match(/\.(jpg|jpeg|png|gif|webp)$/i) ? (
                <img src={showProofUrl} alt="proof" className="w-full object-contain" />
              ) : (
                <iframe src={showProofUrl} title="proof" className="w-full h-[80vh]" />
              )}
            </div>
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}
