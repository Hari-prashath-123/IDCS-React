import { useState, useEffect } from 'react';
import { FileText, Calendar, CreditCard, Award, Home, CheckCircle, XCircle, RefreshCw, X, ClipboardCheck, Clock } from 'lucide-react';
import DashboardLayout from '../../components/DashboardLayout';
import { supabase, ApplicationType, Student, Profile, Approval, getApplicationTableName, getApprovalsTableName } from '../../lib/supabase';
import { fetchInChunks } from '../../lib/supabaseHelpers';
import ReasonList from '../../components/ReasonList';
import { useAuth } from '../../contexts/AuthContext';

interface StaffApplicationPageProps {
  type: ApplicationType;
}

export default function StaffApplicationPage({ type }: StaffApplicationPageProps) {
  const { user } = useAuth();
  const [showProofModal, setShowProofModal] = useState(false);
  const [currentProofUrl, setCurrentProofUrl] = useState<string | null>(null);
  const [classApplications, setClassApplications] = useState<
    (any & {
      student: Student & { profile: Profile };
      approvals: Approval[];
      mentorOnLeave?: boolean;
      advisorOnLeave?: boolean;
      ahodOnLeave?: boolean;
      hodOnLeave?: boolean;
    })[]
  >([]);
  const [menteeApplications, setMenteeApplications] = useState<
    (any & {
      student: Student & { profile: Profile };
      approvals: Approval[];
      mentorOnLeave?: boolean;
      advisorOnLeave?: boolean;
      ahodOnLeave?: boolean;
      hodOnLeave?: boolean;
    })[]
  >([]);
  const [loading, setLoading] = useState(true);
  const [processingApps, setProcessingApps] = useState<Record<string, boolean>>({});
  const [onLeave, setOnLeave] = useState(false);
  const [isAdvisor, setIsAdvisor] = useState(false);
  const [isMentor, setIsMentor] = useState(false);
  const [view, setView] = useState<'class' | 'mentees'>('class');

  // Helper to extract only the user-entered reason for bonafide applications.
  // If the stored `reason` contains appended data separated by '|', return the
  // left-hand side with the 'Bonafide - ' prefix removed. Fall back to
  // app.purpose or '-' when nothing meaningful found.
  const extractUserReason = (app: any) => {
    if (!app) return '-';
    if (type !== 'bonafide') return app.reason || '-';
    const raw = String(app.reason || '').trim();
    if (!raw) return app.purpose || '-';
    const parts = raw.split('|');
    let left = parts[0] || raw;
    left = left.replace(/^\s*Bonafide\s*-\s*/i, '').trim();
    if (left) return left;
    return app.purpose || '-';
  };

  useEffect(() => {
    if (user) {
      fetchApplications();
      fetchLeaveStatus();

      // Determine table names based on the selected application type
      const tableName = getApplicationTableName(type);
      const approvalsTableName = getApprovalsTableName(type);

      // Set up real-time subscription for applications
      const applicationsSubscription = supabase
        .channel(`staff-${type}-applications`)
        .on(
          'postgres_changes',
          {
            event: '*',
            schema: 'public',
            table: tableName,
          },
          () => {
            console.log(`${type} application change detected, refreshing...`);
            fetchApplications();
          }
        )
        .subscribe();

      // Set up real-time subscription for approvals
      const approvalsSubscription = supabase
        .channel(`staff-${type}-approvals`)
        .on(
          'postgres_changes',
          {
            event: '*',
            schema: 'public',
            table: approvalsTableName,
          },
          () => {
            console.log(`${type} approval change detected, refreshing...`);
            fetchApplications();
          }
        )
        .subscribe();

      return () => {
        applicationsSubscription.unsubscribe();
        approvalsSubscription.unsubscribe();
      };
    }
  }, [user, type]);

  const fetchLeaveStatus = async () => {
    try {
      const { data, error } = await supabase
        .from('staff')
        .select('on_leave')
        .eq('id', user?.id)
        .maybeSingle();

      if (error) throw error;
      setOnLeave(data?.on_leave || false);
    } catch (error) {
      console.error('Error fetching leave status:', error);
    }
  };

  const fetchApplications = async () => {
    setLoading(true);
    try {
      console.log('=== Fetching applications for user:', user?.email, user?.id);
      
      // Parallel fetch advisor and mentee students
      const [advisorResult, menteeResult] = await Promise.all([
        supabase.from('students').select('*').eq('advisor_id', user?.id),
        supabase.from('students').select('*').eq('mentor_id', user?.id)
      ]);

      if (advisorResult.error) {
        console.error('Error fetching advisor-assigned students:', advisorResult.error);
        throw advisorResult.error;
      }

      if (menteeResult.error) {
        console.error('Error fetching mentee students:', menteeResult.error);
        throw menteeResult.error;
      }

      const classStudents = advisorResult.data || [];
      const menteeStudents = menteeResult.data || [];
      
      console.log('Class students (advisor-assigned) found:', classStudents.length);
      console.log('Mentee students (mentor-assigned) found:', menteeStudents.length);

      // Set flags
      setIsAdvisor(classStudents.length > 0);
      setIsMentor(menteeStudents.length > 0);

      console.log('=== Final counts:', { 
        totalClassStudents: classStudents.length, 
        totalMenteeStudents: menteeStudents?.length || 0,
        isAdvisor: classStudents.length > 0,
        isMentor: (menteeStudents?.length || 0) > 0
      });

      const classStudentIds = classStudents.map((s) => s.id);
      const menteeStudentIds = menteeStudents.map((s) => s.id);
      const allStudentIds = [...new Set([...classStudentIds, ...menteeStudentIds])];

      console.log('Student IDs:', { classStudentIds, menteeStudentIds, allStudentIds });

      if (allStudentIds.length === 0) {
        setClassApplications([]);
        setMenteeApplications([]);
        setLoading(false);
        return;
      }

      // Get table names for current application type
      const tableName = getApplicationTableName(type);
      const approvalsTableName = getApprovalsTableName(type);

      // Fetch all applications in one query, limit 100 most recent
      console.log('Fetching applications for', allStudentIds.length, 'students');
      const [appsResult, profilesResult, studentsDataResult] = await Promise.all([
        (async () => ({ data: await fetchInChunks(tableName, '*', 'student_id', allStudentIds) }))(),
        (async () => ({ data: await fetchInChunks('profiles', '*', 'id', allStudentIds) }))(),
        (async () => ({ data: await fetchInChunks('students', '*', 'id', allStudentIds) }))()
      ]);

      if (appsResult.error) {
        console.error('Error fetching applications:', appsResult.error);
        throw appsResult.error;
      }

      const allApps = appsResult.data || [];
      const profiles = profilesResult.data || [];
      const studentsData = studentsDataResult.data || [];

      console.log('Applications fetched:', allApps.length);

      if (allApps.length > 0) {
        const appIds = allApps.map(app => app.id);
        
        const approvals = await fetchInChunks(approvalsTableName, '*', 'application_id', appIds);

        // Build maps for fast lookup
        const profilesMap = new Map(profiles.map(p => [p.id, p]));
        const studentsMap = new Map(studentsData.map(s => [s.id, s]));
        const approvalsMap = new Map<string, any[]>();
        
        approvals?.forEach((approval: any) => {
          if (!approvalsMap.has(approval.application_id)) {
            approvalsMap.set(approval.application_id, []);
          }
          approvalsMap.get(approval.application_id)?.push(approval);
        });

        // Separate class and mentee applications
        const classApps = allApps.filter(app => {
          const student = studentsMap.get(app.student_id);
          return student && String(student.advisor_id) === String(user?.id);
        });

        const menteeApps = allApps.filter(app => {
          const student = studentsMap.get(app.student_id);
          return student && String(student.mentor_id) === String(user?.id);
        });

        // Map both with profiles and approvals
        const studentsArray = Array.from(studentsMap.values());
        const leaveMap = await checkLeaveStatusesBatch(studentsArray);

        const classAppsWithData = classApps.map(app => {
          const student = studentsMap.get(app.student_id) || {};
          return {
            ...app,
            student: { ...student, profile: profilesMap.get(app.student_id) },
            approvals: approvalsMap.get(app.id) || [],
            mentorOnLeave: leaveMap.get(String(student.mentor_id)) || false,
            advisorOnLeave: leaveMap.get(String(student.advisor_id)) || false,
            ahodOnLeave: leaveMap.get(String(student.ahod_id)) || false,
            hodOnLeave: leaveMap.get(String(student.hod_id)) || false,
          };
        });

        // Sort applications by created_at descending (recent first)
        // Place pending apps first, then sort by created_at desc within each group
        classAppsWithData.sort((a: any, b: any) => {
          const aPending = String(a.status || '').toLowerCase() === 'pending';
          const bPending = String(b.status || '').toLowerCase() === 'pending';
          if (aPending && !bPending) return -1;
          if (!aPending && bPending) return 1;
          const ta = a.created_at ? new Date(a.created_at).getTime() : 0;
          const tb = b.created_at ? new Date(b.created_at).getTime() : 0;
          return tb - ta;
        });

        const menteeAppsWithData = menteeApps.map(app => {
          const student = studentsMap.get(app.student_id) || {};
          return {
            ...app,
            student: { ...student, profile: profilesMap.get(app.student_id) },
            approvals: approvalsMap.get(app.id) || [],
            mentorOnLeave: leaveMap.get(String(student.mentor_id)) || false,
            advisorOnLeave: leaveMap.get(String(student.advisor_id)) || false,
            ahodOnLeave: leaveMap.get(String(student.ahod_id)) || false,
            hodOnLeave: leaveMap.get(String(student.hod_id)) || false,
          };
        });

        // Sort mentee apps by created_at descending as well
        menteeAppsWithData.sort((a: any, b: any) => {
          const aPending = String(a.status || '').toLowerCase() === 'pending';
          const bPending = String(b.status || '').toLowerCase() === 'pending';
          if (aPending && !bPending) return -1;
          if (!aPending && bPending) return 1;
          const ta = a.created_at ? new Date(a.created_at).getTime() : 0;
          const tb = b.created_at ? new Date(b.created_at).getTime() : 0;
          return tb - ta;
        });

        console.log('Final app counts:', { 
          class: classAppsWithData.length, 
          mentee: menteeAppsWithData.length 
        });

        setClassApplications(classAppsWithData);
        setMenteeApplications(menteeAppsWithData);
      } else {
        setClassApplications([]);
        setMenteeApplications([]);
      }

      setLoading(false);
    } catch (error) {
      console.error('Error fetching applications:', error);
      setLoading(false);
    }
  };

  const checkLeaveStatusesBatch = async (students: any[]) => {
    const staffIds = new Set<string>();
    students.forEach(s => {
      if (s.mentor_id) staffIds.add(s.mentor_id);
      if (s.advisor_id) staffIds.add(s.advisor_id);
      if (s.ahod_id) staffIds.add(s.ahod_id);
      if (s.hod_id) staffIds.add(s.hod_id);
    });
    
    if (staffIds.size === 0) return new Map();
    
    const data = await fetchInChunks('staff', 'id, on_leave', 'id', Array.from(staffIds));
    return new Map((data || []).map(s => [String(s.id), s.on_leave || false]));
  };

  const checkLeaveStatuses = async (student: any) => {
    // Check if mentor is on leave
    let mentorOnLeave = false;
    if (student?.mentor_id) {
      const { data: mentorStaff } = await supabase
        .from('staff')
        .select('on_leave')
        .eq('id', student.mentor_id)
        .maybeSingle();
      mentorOnLeave = mentorStaff?.on_leave || false;
    }

    // Check if advisor is on leave
    let advisorOnLeave = false;
    if (student?.advisor_id) {
      const { data: advisorStaff } = await supabase
        .from('staff')
        .select('on_leave')
        .eq('id', student.advisor_id)
        .maybeSingle();
      advisorOnLeave = advisorStaff?.on_leave || false;
    }

    // Check if AHOD is on leave
    let ahodOnLeave = false;
    if (student?.ahod_id) {
      const { data: ahodStaff } = await supabase
        .from('staff')
        .select('on_leave')
        .eq('id', student.ahod_id)
        .maybeSingle();
      ahodOnLeave = ahodStaff?.on_leave || false;
    }

    // Check if HOD is on leave
    let hodOnLeave = false;
    if (student?.hod_id) {
      const { data: hodStaff } = await supabase
        .from('staff')
        .select('on_leave')
        .eq('id', student.hod_id)
        .maybeSingle();
      hodOnLeave = hodStaff?.on_leave || false;
    }

    return { mentorOnLeave, advisorOnLeave, ahodOnLeave, hodOnLeave };
  };

  const handleApproval = async (appId: string, action: 'approved' | 'rejected', remarks: string) => {
    try {
      // Check if staff is on leave before allowing approval
      if (onLeave) {
        alert('You cannot approve/reject applications while on leave. Please change your leave status first.');
        return;
      }

      // prevent repeated clicks
      if (processingApps[appId]) return;
      setProcessingApps(prev => ({ ...prev, [appId]: true }));

      // Find the app in either class or mentee applications
      const allApps = [...classApplications, ...menteeApplications];
      const app = allApps.find((a) => a.id === appId);
      if (!app) return;

      const studentData = await supabase
        .from('students')
        .select('*')
        .eq('id', app.student_id)
        .maybeSingle();

      if (!studentData.data) {
        alert('Student data not found');
        return;
      }

  const student = studentData.data;

      // Determine approver role
      let approverRole: 'mentor' | 'advisor' | 'ahod' | 'hod' = 'mentor';
      
      // Check if mentor is on leave
      let mentorIsOnLeave = false;
      if (student.mentor_id) {
        const { data: mentorStaff } = await supabase
          .from('staff')
          .select('on_leave')
          .eq('id', student.mentor_id)
          .maybeSingle();
        mentorIsOnLeave = mentorStaff?.on_leave || false;
      }

      // Check if advisor is on leave
      let advisorIsOnLeave = false;
      if (student.advisor_id) {
        const { data: advisorStaff } = await supabase
          .from('staff')
          .select('on_leave')
          .eq('id', student.advisor_id)
          .maybeSingle();
        advisorIsOnLeave = advisorStaff?.on_leave || false;
      }

      // Check if AHOD is on leave
      let ahodIsOnLeave = false;
      if (student.ahod_id) {
        const { data: ahodStaff } = await supabase
          .from('staff')
          .select('on_leave')
          .eq('id', student.ahod_id)
          .maybeSingle();
        ahodIsOnLeave = ahodStaff?.on_leave || false;
      }

      // Check if HOD is on leave
      let hodIsOnLeave = false;
      if (student.hod_id) {
        const { data: hodStaff } = await supabase
          .from('staff')
          .select('on_leave')
          .eq('id', student.hod_id)
          .maybeSingle();
        hodIsOnLeave = hodStaff?.on_leave || false;
      }

      if (student.hod_id === user?.id) {
        // User is the HOD
        approverRole = 'hod';
      } else if (student.ahod_id === user?.id) {
        // User is the AHOD
        approverRole = 'ahod';
      } else if (student.advisor_id === user?.id) {
        // User is the advisor
        approverRole = 'advisor';
      } else if (student.mentor_id === user?.id) {
        // User is the mentor
        approverRole = 'mentor';
      }

      console.log('Approval details:', {
        appId: appId.slice(0, 8),
        userId: user?.id,
        approverRole,
        mentorIsOnLeave,
        advisorIsOnLeave,
        ahodIsOnLeave,
        currentLevel: app.current_approver_level
      });

      // Determine table names based on the selected application type
      const approvalsTableName = getApprovalsTableName(type);
      const applicationsTableName = getApplicationTableName(type);

      // Record approver role in a way that respects DB constraints (gatepass approvals allow only 'advisor'|'hod')
      const approverRoleToRecord = (type === 'gatepass' && approverRole === 'ahod') ? 'hod' : approverRole;

      // insert approval and capture returned row for optimistic UI update
      const { data: insertData, error: insertErr } = await supabase.from(approvalsTableName).insert({
        application_id: appId,
        approver_id: user?.id,
        approver_role: approverRoleToRecord,
        action,
        remarks,
      }).select().single();

      if (insertErr) {
        console.error('Approval insert error:', insertErr);
        throw insertErr;
      }

      const insertedApproval = insertData;

      if (action === 'rejected') {
        await supabase
          .from(applicationsTableName)
          .update({
            status: 'rejected',
            current_approver_level: 'completed',
            updated_at: new Date().toISOString(),
          })
          .eq('id', appId);
      } else {
        // Determine next level based on current approver role
        let nextLevel: 'advisor' | 'ahod' | 'hod' | 'ps' | 'completed' = 'completed';

          if (approverRole === 'mentor') {
            nextLevel = 'advisor';
          } else if (approverRole === 'advisor') {
            // For gatepass, we always set next level to 'hod' (DB constraints disallow 'ahod')
            // AHOD will act as HOD when HOD is on leave (front-end logic determines acting user).
            if (type === 'gatepass') {
              nextLevel = 'hod';
            } else {
              // Advisor forwards to AHOD for non-bonafide flows, otherwise to HOD
              nextLevel = (type === 'bonafide') ? 'hod' : 'ahod';
            }
          } else if (approverRole === 'ahod') {
            nextLevel = 'hod';
        } else if (approverRole === 'hod') {
          // After HOD, bonafide goes to PS; other types may complete
          nextLevel = type === 'bonafide' ? 'ps' : 'completed';
        }

        // If the next level is 'advisor' but the advisor is missing or on leave,
        // skip advisor and advance appropriately. For gatepass, advisor has no
        // alternate so skip directly to 'hod'. For other types, fallback to
        // 'ahod' when appropriate. This fixes the case where advisor+hod are on
        // leave but the application remained at 'advisor' level.
        if (nextLevel === 'advisor') {
          if (!student.advisor_id || advisorIsOnLeave) {
            if (type === 'gatepass' || type === 'bonafide') {
              nextLevel = 'hod';
            } else {
              nextLevel = 'ahod';
            }
          }
        }

        // Defensive: never store 'ahod' as the current approver for gatepass due
        // to DB CHECK constraints — represent AHOD acting-as-HOD by storing 'hod'
        // and letting the front-end detect hodOnLeave to let AHOD act.
        if (nextLevel === 'ahod' && type === 'gatepass') {
          nextLevel = 'hod';
        }

        // Check if this is the last approver (no one at next level)
        const isLastApprover = (() => {
          if (approverRole === 'advisor') {
            // If bonafide or gatepass, next is HOD (or AHOD for gatepass when HOD on leave)
            if (type === 'bonafide') return !student.hod_id;
            if (type === 'gatepass') {
              // If HOD is on leave, advisor should forward to AHOD -> check AHOD presence
              if (hodIsOnLeave) return !student.ahod_id;
              // Otherwise check HOD presence
              return !student.hod_id;
            }
            return !student.ahod_id;
          }
          if (approverRole === 'ahod') return !student.hod_id;
          if (approverRole === 'hod') return type !== 'bonafide' || !student.hod_id;
          return false;
        })();

        const { data: updatedApp, error: updateErr } = await supabase
          .from(applicationsTableName)
          .update({
            status: isLastApprover ? 'approved' : 'pending',
            current_approver_level: isLastApprover ? 'completed' : nextLevel,
            updated_at: new Date().toISOString(),
          })
          .eq('id', appId)
          .select()
          .single();

        if (updateErr) {
          console.error('Application update error:', updateErr);
          throw updateErr;
        }

        // Optimistically update local state so UI reflects the change immediately
        const newStatus = updatedApp?.status || (isLastApprover ? 'approved' : 'pending');
        const newLevel = updatedApp?.current_approver_level || (isLastApprover ? 'completed' : nextLevel);
        applyLocalUpdateForStaff(appId, { status: newStatus, current_approver_level: newLevel, approvalToAppend: insertedApproval });
      }

      alert(`Application ${action} successfully!`);
      // refresh authoritative state from server (not awaited to avoid blocking UI)
      fetchApplications();
      setProcessingApps(prev => { const c = { ...prev }; delete c[appId]; return c; });
    } catch (error) {
      console.error('Error processing approval:', error);
      alert('Failed to process approval. Please try again.');
      setProcessingApps(prev => { const c = { ...prev }; delete c[appId]; return c; });
    }
  };

  const applyLocalUpdateForStaff = (appId: string, updates: { status?: string; current_approver_level?: string; approvalToAppend?: any }) => {
    setClassApplications(prev => prev.map(a => a.id === appId ? { ...a, ...(updates.approvalToAppend ? { approvals: [...(a.approvals||[]), updates.approvalToAppend] } : {}), ...updates } : a));
    setMenteeApplications(prev => prev.map(a => a.id === appId ? { ...a, ...(updates.approvalToAppend ? { approvals: [...(a.approvals||[]), updates.approvalToAppend] } : {}), ...updates } : a));
  };

  const sidebarItems = [
    { label: 'Dashboard', path: '/staff-dashboard', icon: <Home className="h-5 w-5" /> },
    { label: 'OD Applications', path: '/staff/od', icon: <FileText className="h-5 w-5" /> },
    { label: 'Leave Applications', path: '/staff/leave', icon: <Calendar className="h-5 w-5" /> },
    { label: 'Gatepass Applications', path: '/staff/gatepass', icon: <CreditCard className="h-5 w-5" /> },
    { label: 'Bonafide Applications', path: '/staff/bonafide', icon: <Award className="h-5 w-5" /> },
    { label: 'Attendance', path: '/staff/attendance', icon: <ClipboardCheck className="h-5 w-5" /> },
  ];

  const typeConfig = {
    od: { title: 'On Duty', icon: <FileText className="h-8 w-8" /> },
    leave: { title: 'Leave', icon: <Calendar className="h-8 w-8" /> },
    gatepass: { title: 'Gatepass', icon: <CreditCard className="h-8 w-8" /> },
    bonafide: { title: 'Bonafide', icon: <Award className="h-8 w-8" /> },
  };

  return (
    <DashboardLayout sidebarItems={sidebarItems}>
      <div className="max-w-7xl mx-auto px-4 sm:px-6">
        <div className="mb-6 sm:mb-8">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center space-x-3 sm:space-x-4">
              <div className="bg-blue-100 rounded-lg p-2 sm:p-3 text-blue-600">
                {typeConfig[type].icon}
              </div>
              <div>
                <h1 className="text-2xl sm:text-3xl font-bold text-slate-800">
                  {typeConfig[type].title} Applications
                </h1>
                <p className="text-sm sm:text-base text-slate-600 mt-1">
                  Review and approve student applications
                </p>
              </div>
            </div>
            
            <div className="flex items-center gap-3 flex-wrap">
              {/* Refresh Button */}
              <button
                onClick={() => {
                  setLoading(true);
                  fetchApplications();
                }}
                disabled={loading}
                className="flex items-center gap-2 px-3 sm:px-4 py-2 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                title="Refresh applications"
              >
                <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
                <span className="hidden sm:inline">Refresh</span>
              </button>
              
              {/* Leave Status Indicator */}
              {onLeave && (
                <div className="bg-orange-50 border border-orange-200 rounded-lg px-3 sm:px-4 py-2 w-full sm:w-auto">
                  <p className="text-orange-700 font-semibold text-xs sm:text-sm">
                    ⚠️ On Leave - Applications forwarded to advisor
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>

        

        {loading ? (
          <div className="text-center py-12">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
            <p className="mt-4 text-slate-600">Loading applications...</p>
          </div>
        ) : (
          <div className="space-y-6 sm:space-y-8">
            {/* Top view toggle for Class vs Mentees */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 sm:gap-3 w-full sm:w-auto">
                <button
                  onClick={() => setView('class')}
                  className={`flex-1 sm:flex-none px-3 sm:px-4 py-2 rounded-md text-sm font-medium border transition-colors ${view === 'class' ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'}`}
                >
                  Class
                </button>
                <button
                  onClick={() => setView('mentees')}
                  className={`flex-1 sm:flex-none px-3 sm:px-4 py-2 rounded-md text-sm font-medium border transition-colors ${view === 'mentees' ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'}`}
                >
                  Mentees
                </button>
              </div>
            </div>

            {/* Class view */}
            {view === 'class' && (
              <div>
                <h2 className="text-xl sm:text-2xl font-bold text-slate-800 mb-3 sm:mb-4">
                  Class {typeConfig[type].title} Applications
                </h2>
                <div className="space-y-3 sm:space-y-4">
                  {isAdvisor ? (
                    classApplications.length === 0 ? (
                      <div className="bg-white rounded-xl shadow-lg border border-slate-200 p-12 text-center">
                        <p className="text-slate-500">No class applications found</p>
                      </div>
                    ) : (
                      classApplications.map((app) => renderApplicationCard(app))
                    )
                  ) : (
                    <div className="bg-white rounded-xl shadow-lg border border-slate-200 p-12 text-center">
                      <p className="text-slate-500">You are not assigned as an advisor</p>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Mentees view */}
            {view === 'mentees' && (
              <div>
                <h2 className="text-xl sm:text-2xl font-bold text-slate-800 mb-3 sm:mb-4">
                  Mentee {typeConfig[type].title} Applications
                </h2>
                <div className="space-y-3 sm:space-y-4">
                  {isMentor ? (
                    menteeApplications.length === 0 ? (
                      <div className="bg-white rounded-xl shadow-lg border border-slate-200 p-12 text-center">
                        <p className="text-slate-500">No mentee applications found</p>
                      </div>
                    ) : (
                      menteeApplications.map((app) => renderApplicationCard(app))
                    )
                  ) : (
                    <div className="bg-white rounded-xl shadow-lg border border-slate-200 p-12 text-center">
                      <p className="text-slate-500">You are not assigned as a mentor</p>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* If user is neither advisor nor mentor show combined message */}
            {!isAdvisor && !isMentor && (
              <div className="bg-white rounded-xl shadow-lg border border-slate-200 p-12 text-center">
                <p className="text-slate-500">You are not assigned as an advisor or mentor</p>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Proof Modal */}
      {showProofModal && currentProofUrl && (
        <div 
          className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-75 p-4"
          onClick={() => setShowProofModal(false)}
        >
          <div className="relative max-w-4xl max-h-[90vh] w-full">
            <button
              onClick={() => setShowProofModal(false)}
              className="absolute -top-10 right-0 text-white hover:text-gray-300 transition-colors"
            >
              <X className="h-8 w-8" />
            </button>
            <div 
              className="bg-white rounded-lg overflow-hidden shadow-2xl"
              onClick={(e) => e.stopPropagation()}
            >
              {currentProofUrl.match(/\.(jpg|jpeg|png|gif|webp)$/i) ? (
                <img 
                  src={currentProofUrl} 
                  alt="Proof document" 
                  className="w-full h-auto max-h-[80vh] object-contain"
                />
              ) : (
                <iframe 
                  src={currentProofUrl} 
                  className="w-full h-[80vh]"
                  title="Proof document"
                />
              )}
            </div>
          </div>
        </div>
      )}
    </DashboardLayout>
  );

  function renderApplicationCard(app: typeof classApplications[0]) {
    // Determine if current user can approve this application
    const isMentorForStudent = app.student.mentor_id === user?.id;
    const isAdvisorForStudent = app.student.advisor_id === user?.id;
    const isAHOD = type === 'bonafide' ? false : app.student.ahod_id === user?.id;
    const isHOD = app.student.hod_id === user?.id;
    
    let canApprove = false;
    if (app.status === 'pending') {
      if (type === 'bonafide') {
        // For bonafide: AHOD is skipped. Approver chain: mentor -> advisor -> hod -> ps
        canApprove = (
          (app.current_approver_level === 'mentor' && isMentorForStudent && !onLeave) ||
          (app.current_approver_level === 'advisor' && isAdvisorForStudent && !onLeave) ||
          (app.current_approver_level === 'hod' && isHOD && !onLeave) ||
          // Advisor acts if mentor on leave
          (app.current_approver_level === 'mentor' && app.mentorOnLeave && isAdvisorForStudent && !onLeave) ||
          // HOD can act if advisor is on leave (directly)
          (app.current_approver_level === 'advisor' && app.advisorOnLeave && isHOD && !onLeave) ||
          // HOD can act if mentor+advisor are on leave
          (app.current_approver_level === 'mentor' && app.mentorOnLeave && app.advisorOnLeave && isHOD && !onLeave)
        );
      } else {
        canApprove = (
          (app.current_approver_level === 'mentor' && isMentorForStudent && !onLeave) ||
          (app.current_approver_level === 'advisor' && isAdvisorForStudent && !onLeave) ||
          (app.current_approver_level === 'ahod' && isAHOD && !onLeave) ||
          (app.current_approver_level === 'hod' && isHOD && !onLeave) ||
          // mentor on leave -> advisor steps in
          (app.current_approver_level === 'mentor' && app.mentorOnLeave && isAdvisorForStudent && !onLeave) ||
          // advisor on leave -> HOD may act, BUT for OD/Leave prefer AHOD first
          // HOD should only act when AHOD is absent or also on leave for OD/Leave types
          (app.current_approver_level === 'advisor' && app.advisorOnLeave && isHOD && !onLeave && !(
            (type === 'leave') &&
            app.student && app.student.ahod_id && !app.ahodOnLeave
          )) ||
          // advisor+HOD on leave -> AHOD should act when present
          (app.current_approver_level === 'advisor' && app.advisorOnLeave && app.hodOnLeave && isAHOD && !onLeave) ||
          // mentor+advisor on leave -> HOD steps in
          // mentor+advisor on leave -> HOD steps in, but for OD/Leave prefer AHOD first
          (app.current_approver_level === 'mentor' && app.mentorOnLeave && app.advisorOnLeave && isHOD && !onLeave && !(
            (type === 'leave') &&
            app.student && app.student.ahod_id && !app.ahodOnLeave
          )) ||
          (app.current_approver_level === 'mentor' && app.mentorOnLeave && app.advisorOnLeave && isHOD && !onLeave && !(
            (type === 'leave') &&
            app.student && app.student.ahod_id && !app.ahodOnLeave
          )) ||
          // AHOD on leave -> HOD acts when level is AHOD
          (app.current_approver_level === 'ahod' && app.ahodOnLeave && isHOD && !onLeave) ||
          // advisor on leave and AHOD also on leave -> HOD acts
          (app.current_approver_level === 'advisor' && app.advisorOnLeave && app.ahodOnLeave && isHOD && !onLeave) ||
          // all three lower levels on leave -> HOD acts
          (app.current_approver_level === 'mentor' && app.mentorOnLeave && app.advisorOnLeave && app.ahodOnLeave && isHOD && !onLeave)
        );
      }
    }

    return (
      <div
        key={app.id}
        className="bg-white rounded-xl shadow-lg border border-slate-200 p-4 sm:p-6"
      >
        <div className="flex flex-col sm:flex-row sm:justify-between sm:items-start mb-3 sm:mb-4 gap-2">
          <div className="flex-1">
            <h3 className="text-base sm:text-lg font-bold text-slate-800">
              {app.student.profile?.name}
            </h3>
            <p className="text-xs sm:text-sm text-slate-600 mt-1">
              {app.student.reg_no} • Year {app.student.year} •
              Section {app.student.section}
            </p>
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
          {app.mentorOnLeave && (
            <div className="bg-orange-50 border border-orange-200 rounded-lg px-3 py-2 mb-3">
              <p className="text-orange-700 text-sm font-medium">
                ⚠️ Mentor is on leave - Application forwarded to advisor
              </p>
            </div>
          )}
          {app.advisorOnLeave && (
            <div className="bg-orange-50 border border-orange-200 rounded-lg px-3 py-2 mb-3">
              <p className="text-orange-700 text-sm font-medium">
                ⚠️ Advisor is on leave - Application forwarded to {type === 'bonafide' || type === 'gatepass' ? 'HOD' : 'AHOD'}
              </p>
            </div>
          )}
          {app.ahodOnLeave && (
            <div className="bg-orange-50 border border-orange-200 rounded-lg px-3 py-2 mb-3">
              <p className="text-orange-700 text-sm font-medium">
                ⚠️ AHOD is on leave - Application forwarded to HOD
              </p>
            </div>
          )}
          {/* Show Body for OD, Leave */}
          {(app as any).body && (
            <div className="flex text-sm">
              <span className="font-medium text-slate-700 w-24">
                Body:
              </span>
              <span className="text-slate-600">{(app as any).body}</span>
            </div>
          )}
          {/* Show From/To Date Time for Gatepass */}
          {type === 'gatepass' && (app as any).from_date && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-sm mb-2">
              <div className="flex">
                <span className="font-medium text-slate-700 w-32 flex-shrink-0">
                  From Date & Time:
                </span>
                <span className="text-slate-600">
                  {new Date((app as any).from_date).toLocaleString('en-IN', {
                    day: '2-digit',
                    month: '2-digit',
                    year: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit',
                    hour12: true
                  })}
                </span>
              </div>
              <div className="flex">
                <span className="font-medium text-slate-700 w-32 flex-shrink-0">
                  To Date & Time:
                </span>
                <span className="text-slate-600">
                  {new Date((app as any).to_date).toLocaleString('en-IN', {
                    day: '2-digit',
                    month: '2-digit',
                    year: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit',
                    hour12: true
                  })}
                </span>
              </div>
            </div>
          )}
          {/* Show Purpose for Bonafide */}
          {(app as any).purpose && (
            <div className="flex text-sm">
              <span className="font-medium text-slate-700 w-24">
                Purpose:
              </span>
              <span className="text-slate-600">{(app as any).purpose}</span>
            </div>
          )}
          {/* Show Father's Name for Bonafide */}
          {(app as any).fathers_name && (
            <div className="flex text-sm">
              <span className="font-medium text-slate-700 w-24">
                Father's Name:
              </span>
              <span className="text-slate-600">{(app as any).fathers_name}</span>
            </div>
          )}
          {/* Show Branch, Community for Bonafide */}
          {(app as any).branch && (
            <div className="flex text-sm">
              <span className="font-medium text-slate-700 w-24">
                Branch:
              </span>
              <span className="text-slate-600">{(app as any).branch}</span>
            </div>
          )}
          {(app as any).community && (
            <div className="flex text-sm">
              <span className="font-medium text-slate-700 w-24">
                Community:
              </span>
              <span className="text-slate-600">{(app as any).community}</span>
            </div>
          )}
          {/* Show Study Mode, Bus Option, Bus Fare for Bonafide */}
          {(app as any).study_mode && (
            <div className="flex text-sm">
              <span className="font-medium text-slate-700 w-24">
                Study Mode:
              </span>
              <span className="text-slate-600 capitalize">
                {(app as any).study_mode === 'day_scholar' ? 'Day Scholar' : 'Hostel'}
              </span>
            </div>
          )}
          {(app as any).bus_option && (
            <div className="flex text-sm">
              <span className="font-medium text-slate-700 w-24">
                Bus:
              </span>
              <span className="text-slate-600 capitalize">
                {(app as any).bus_option === 'college' ? 'College Bus' : 'Out Bus'}
                {(app as any).bus_fare && ` (₹${(app as any).bus_fare})`}
              </span>
            </div>
          )}
          {/* Show Funding and First Graduate for Bonafide */}
          {(app as any).funding && (
            <div className="flex text-sm">
              <span className="font-medium text-slate-700 w-24">
                Funding:
              </span>
              <span className="text-slate-600">
                {(app as any).funding}
                {(app as any).first_graduate && ` (First Graduate: ${(app as any).first_graduate})`}
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
          {/* Show gatepass scan times if present */}
          {(app.out_time || app.in_time) && (
            <div className="flex text-sm">
              <span className="font-medium text-slate-700 w-24">Scans:</span>
              <span className="text-slate-600">
                {app.out_time ? `Out: ${new Date(app.out_time).toLocaleString()}` : ''}
                {app.out_time && app.in_time ? ' • ' : ''}
                {app.in_time ? `In: ${new Date(app.in_time).toLocaleString()}` : ''}
              </span>
            </div>
          )}
          {app.attachment_url && (
            <div className="flex text-sm">
              <span className="font-medium text-slate-700 w-24">Proof:</span>
              <span className="text-slate-600">
                <button
                  type="button"
                  onClick={() => {
                    setCurrentProofUrl(app.attachment_url!);
                    setShowProofModal(true);
                  }}
                  className="text-blue-600 hover:underline cursor-pointer"
                >
                  View proof
                </button>
              </span>
            </div>
          )}
        </div>

        {/* Approval History */}
        {(() => {
          const visibleLevels = type === 'bonafide' 
            ? ['mentor', 'advisor', 'hod', 'ps']
            : type === 'gatepass'
            ? ['advisor', 'hod']
            : ['mentor', 'advisor', 'ahod', 'hod'];
          const levelLabels: Record<string, string> = {
            mentor: 'Mentor',
            advisor: 'Advisor',
            ahod: 'AHOD',
            hod: 'HOD',
            ps: 'PS'
          };

          const roleToStudentField: Record<string, string | null> = {
            mentor: 'mentor_id',
            advisor: 'advisor_id',
            ahod: 'ahod_id',
            hod: 'hod_id',
            ps: 'ps_id',
          };

          const getApprovalForRole = (role: string) => {
            const normalizedRole = role.toLowerCase().trim();
            const studentField = (roleToStudentField as any)[normalizedRole];

            const approvals = (app.approvals || []).slice();
            if (approvals.length === 0) return null;

            // 1) Prefer exact role match first (most reliable when approver_role is set correctly)
            const byRoleExact = approvals.filter((a: any) => String(a.approver_role || '').toLowerCase().trim() === normalizedRole);
            if (byRoleExact.length > 0) {
              byRoleExact.sort((x: any, y: any) => {
                const tx = x.created_at ? new Date(x.created_at).getTime() : 0;
                const ty = y.created_at ? new Date(y.created_at).getTime() : 0;
                return ty - tx;
              });
              return byRoleExact[0];
            }

            // 2) Prefer approvals by the assigned staff id for this role.
            if (studentField && app.student && app.student[studentField]) {
              const assignedId = String(app.student[studentField]);
              const byId = approvals.filter((a: any) => String(a.approver_id) === assignedId);
              if (byId.length > 0) {
                // Prefer entries that correctly set approver_role first
                const byIdExactRole = byId.filter((a: any) => String(a.approver_role || '').toLowerCase().trim() === normalizedRole);
                const pick = (arr: any[]) => {
                  arr.sort((x: any, y: any) => {
                    const tx = x.created_at ? new Date(x.created_at).getTime() : 0;
                    const ty = y.created_at ? new Date(y.created_at).getTime() : 0;
                    return ty - tx;
                  });
                  return arr[0];
                };
                if (byIdExactRole.length > 0) return pick(byIdExactRole);
                return pick(byId);
              }
            }

            // 3) Finally try word-boundary contains-match for fuzzy role strings
            const escapeRegex = (s: string) => s.replace(/[-\\/\\^$*+?.()|[\]{}]/g, '\\$&');
            const roleRegex = new RegExp(`\\b${escapeRegex(normalizedRole)}\\b`);
            const byRoleContains = approvals.filter((a: any) => {
              const r = String(a.approver_role || '').toLowerCase().trim();
              return roleRegex.test(r);
            });
            if (byRoleContains.length > 0) {
              byRoleContains.sort((x: any, y: any) => {
                const tx = x.created_at ? new Date(x.created_at).getTime() : 0;
                const ty = y.created_at ? new Date(y.created_at).getTime() : 0;
                return ty - tx;
              });
              return byRoleContains[0];
            }

            return null;
          };

          const completedIndex = app.current_approver_level === 'completed'
            ? visibleLevels.length
            : Math.max(0, visibleLevels.indexOf(app.current_approver_level));

          const roleStatuses = visibleLevels.map((lvl, idx) => {
            const approval = getApprovalForRole(lvl);
            const studentFieldForRole = (roleToStudentField as any)[lvl];
            const onLeaveFlag = lvl === 'mentor' ? app.mentorOnLeave : lvl === 'advisor' ? app.advisorOnLeave : lvl === 'ahod' ? app.ahodOnLeave : lvl === 'hod' ? app.hodOnLeave : (app as any).psOnLeave;
            let hasAssignedStaff = studentFieldForRole ? !!app.student?.[studentFieldForRole] : true;
            if (lvl === 'ps') hasAssignedStaff = true;
            const inferred = !approval && idx < completedIndex && hasAssignedStaff && !onLeaveFlag && app.status !== 'rejected';
            const approvalSummary = approval
              ? { id: approval.id, approver_id: approval.approver_id, approver_role: approval.approver_role, action: approval.action, created_at: approval.created_at }
              : null;
            const status = approval ? (String(approval.action || '').toLowerCase().trim() === 'approved' ? 'approved' : String(approval.action || '')) : (inferred ? 'approved (inferred)' : (onLeaveFlag ? 'leave' : (hasAssignedStaff ? (app.current_approver_level === lvl ? 'pending' : '-') : '-')));
            return { role: lvl, approval: approvalSummary, inferred, status, hasAssignedStaff, onLeave: !!onLeaveFlag };
          });

          return (
            <div className="mt-4 pt-4 border-t border-slate-200">
              <h4 className="text-sm font-semibold text-slate-700 mb-3">Approval History</h4>
              <div className="space-y-2">
                {visibleLevels.map((lvl, idx) => {
                  const rs = roleStatuses[idx];
                  const lvlLabel = levelLabels[lvl] || lvl.charAt(0).toUpperCase() + lvl.slice(1);
                  if (rs.approval) {
                    const act = String(rs.approval.action || '').toLowerCase().trim();
                    const autoApproved = String(rs.approval.remarks || '').indexOf('[Auto-approved]') !== -1 && rs.onLeave;
                    // Check if AHOD acted for HOD (approver is AHOD but role recorded as HOD)
                    const ahodActedForHod = type === 'gatepass' && 
                      lvl === 'hod' && 
                      rs.approval.approver_id && 
                      app.student?.ahod_id && 
                      String(rs.approval.approver_id) === String(app.student.ahod_id);
                    
                    return (
                      <div key={`${app.id}-${lvl}`} className="flex items-center text-sm">
                        {autoApproved ? (
                          <span className="inline-block px-2 py-1 rounded-full text-xs font-medium bg-orange-100 text-orange-700 mr-2">On Leave</span>
                        ) : act === 'approved' ? (
                          <CheckCircle className="h-4 w-4 text-green-500 mr-2" />
                        ) : act === 'rejected' ? (
                          <XCircle className="h-4 w-4 text-red-500 mr-2" />
                        ) : (
                          <Clock className="h-4 w-4 text-yellow-500 mr-2" />
                        )}
                        <span className="capitalize text-slate-700">{lvlLabel}</span>
                        <span className="text-slate-500 ml-2">
                          {autoApproved ? 'On Leave (auto-approved)' : (act === 'approved' ? 'Approved' : act === 'rejected' ? 'Rejected' : 'Pending')}
                          {ahodActedForHod && <span className="text-xs text-blue-600 ml-1">(AHOD acted)</span>}
                        </span>
                        <span className="text-xs text-slate-400 ml-auto">
                          {new Date(rs.approval.created_at).toLocaleDateString()}
                        </span>
                      </div>
                    );
                  }

                  if (rs.inferred) {
                    return (
                      <div key={`${app.id}-${lvl}`} className="flex items-center text-sm">
                        <CheckCircle className="h-4 w-4 text-green-500 mr-2" />
                        <span className="capitalize text-slate-700">{lvlLabel}</span>
                        <span className="text-slate-500 ml-2">Approved (inferred)</span>
                      </div>
                    );
                  }

                  if (rs.onLeave) {
                    return (
                      <div key={`${app.id}-${lvl}`} className="flex items-center text-sm">
                        <span className="inline-block px-2 py-1 rounded-full text-xs font-medium bg-orange-100 text-orange-700">{lvlLabel}</span>
                        <span className="text-slate-500 ml-2">On Leave</span>
                      </div>
                    );
                  }

                  return (
                    <div key={`${app.id}-${lvl}`} className="flex items-center text-sm">
                      <Clock className="h-4 w-4 text-yellow-500 mr-2" />
                      <span className="capitalize text-slate-700">{lvlLabel}</span>
                      <span className="text-slate-500 ml-2">{rs.status === '-' ? '-' : rs.status}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })()}

        {/* debug helpers removed per UI cleanup — card ends after approval history */}

        {/* debug helpers removed per UI cleanup — card ends after approval history */}

        {canApprove && (
          <div className="space-y-3 mt-4">
            <div className="flex flex-col sm:flex-row gap-2 sm:gap-4">
              <button
                onClick={() => {
                  const remarks = prompt('Enter remarks (optional):');
                  handleApproval(app.id, 'approved', remarks || '');
                }}
                className="flex-1 py-2 px-4 bg-green-600 text-white text-sm rounded-lg hover:bg-green-700 transition-colors font-medium"
              >
                Approve
              </button>
              <button
                onClick={() => {
                  const remarks = prompt('Enter reason for rejection:');
                  if (remarks) {
                    handleApproval(app.id, 'rejected', remarks);
                  }
                }}
                className="flex-1 py-2 px-4 bg-red-600 text-white text-sm rounded-lg hover:bg-red-700 transition-colors font-medium"
              >
                Reject
              </button>
            </div>
          </div>
        )}
      </div>
    );
  }
}
