import { useState, useEffect } from 'react';
import { FileText, Calendar, CreditCard, Award, Home, CheckCircle, XCircle, X, Clock } from 'lucide-react';
import DashboardLayout from '../../components/DashboardLayout';
import { supabase, ApplicationType, Student, Profile, Approval, getApplicationTableName, getApprovalsTableName } from '../../lib/supabase';
import { fetchInChunks } from '../../lib/supabaseHelpers';
import ReasonList from '../../components/ReasonList';
import { useAuth } from '../../contexts/AuthContext';

interface AHODApplicationPageProps {
  type: ApplicationType;
}

export default function AHODApplicationPage({ type }: AHODApplicationPageProps) {
  const { user, profile } = useAuth();
  
  const [showProofModal, setShowProofModal] = useState(false);
  const [currentProofUrl, setCurrentProofUrl] = useState<string | null>(null);
  const [applications, setApplications] = useState<
    (any & {
      student: Student & { profile: Profile };
      approvals: Approval[];
      mentorOnLeave?: boolean;
      advisorOnLeave?: boolean;
      ahodOnLeave?: boolean;
      hodOnLeave?: boolean;
    })[]
  >([]);
  const [deptApplications, setDeptApplications] = useState<typeof applications>([]);
  const [menteeApplications, setMenteeApplications] = useState<typeof applications>([]);
  const [loading, setLoading] = useState(true);
  const [onLeave, setOnLeave] = useState(false);
  const [processingApps, setProcessingApps] = useState<Record<string, boolean>>({});
  const [view, setView] = useState<'mentees' | 'department'>(() => (type === 'gatepass' ? 'department' : 'mentees'));

  useEffect(() => {
    if (user) {
      fetchLeaveStatus();
      fetchApplications();
      fetchDeptAndMenteeApplications();

      // Get table names based on application type
      const tableName = getApplicationTableName(type);
      const approvalsTableName = getApprovalsTableName(type);

      // Set up real-time subscriptions so the AHOD view stays in sync when advisors/mentors act
      const appsChannel = supabase
        .channel(`ahod-${type}-applications`)
        .on(
          'postgres_changes',
          {
            event: '*',
            schema: 'public',
            table: tableName,
          },
          () => {
            // If an application changed, refresh lists for current type
            console.log('AHOD: application change detected, refreshing lists');
            fetchApplications();
            fetchDeptAndMenteeApplications();
          }
        )
        .subscribe();

      const approvalsChannel = supabase
        .channel(`ahod-${type}-approvals`)
        .on(
          'postgres_changes',
          {
            event: '*',
            schema: 'public',
            table: approvalsTableName,
          },
          () => {
            console.log('AHOD: approval change detected, refreshing lists');
            fetchApplications();
            fetchDeptAndMenteeApplications();
          }
        )
        .subscribe();

      return () => {
        try {
          appsChannel.unsubscribe();
        } catch (e) {
          /* ignore */
        }
        try {
          approvalsChannel.unsubscribe();
        } catch (e) {
          /* ignore */
        }
      };
    }
  }, [user, type]);

  const fetchLeaveStatus = async () => {
    try {
      const { data: staffData } = await supabase
        .from('staff')
        .select('on_leave')
        .eq('id', user?.id)
        .maybeSingle();

      setOnLeave(staffData?.on_leave || false);
    } catch (error) {
      console.error('Error fetching leave status:', error);
    }
  };

  // Helper to extract only the user-entered reason for bonafide applications.
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

  const fetchDeptAndMenteeApplications = async () => {
    setLoading(true);
    try {
      // Department applications: all students whose profile.department === profile.department
      if (!profile?.department) {
        setDeptApplications([]);
      } else {
        const { data: deptProfiles, error: deptProfErr } = await supabase
          .from('profiles')
          .select('id')
          .eq('department', profile.department);
        if (deptProfErr) throw deptProfErr;
        const deptIds = (deptProfiles || []).map((p: any) => p.id);

        if (deptIds.length > 0) {
          const tableName = getApplicationTableName(type);
          const approvalsTableName = getApprovalsTableName(type);

          const deptApps = await fetchInChunks(tableName, '*', 'student_id', deptIds);

          if (deptApps && deptApps.length > 0) {
            // Batch fetch all related data
            const studentIds = [...new Set(deptApps.map(app => app.student_id))];
            const appIds = deptApps.map(app => app.id);
            
            const [studentsData, profilesData, approvalsData] = await Promise.all([
              fetchInChunks('students', '*', 'id', studentIds),
              fetchInChunks('profiles', '*', 'id', studentIds),
              fetchInChunks(approvalsTableName, '*', 'application_id', appIds)
            ]);

            // Get all unique staff IDs for leave status check
            const allStaffIds = new Set<string>();
            (studentsData || []).forEach((s: any) => {
              if (s.mentor_id) allStaffIds.add(s.mentor_id);
              if (s.advisor_id) allStaffIds.add(s.advisor_id);
              if (s.ahod_id) allStaffIds.add(s.ahod_id);
              if (s.hod_id) allStaffIds.add(s.hod_id);
            });
            
            const staffLeaveData = await fetchInChunks('staff', 'id, on_leave', 'id', Array.from(allStaffIds));
            
            const leaveMap = new Map((staffLeaveData || []).map((s: any) => [String(s.id), s.on_leave]));
            const studentsMap = new Map((studentsData || []).map(s => [s.id, s]) || []);
            const profilesMap = new Map((profilesData || []).map(p => [p.id, p]) || []);
            const approvalsMap = new Map<string, any[]>();
            (approvalsData || []).forEach((approval: any) => {
              if (!approvalsMap.has(approval.application_id)) {
                approvalsMap.set(approval.application_id, []);
              }
              approvalsMap.get(approval.application_id)?.push(approval);
            });

            const detailed = deptApps.map(app => {
              const student = studentsMap.get(app.student_id);
              const prof = profilesMap.get(app.student_id);
              const approvals = (approvalsMap.get(app.id) || []).sort((a, b) => 
                new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
              );

              const mentorId = student?.mentor_id;
              const advisorId = student?.advisor_id;
              const ahodId = student?.ahod_id;
              const mentorOn = mentorId ? (leaveMap.get(String(mentorId)) || false) : false;
              const advisorOn = advisorId ? (leaveMap.get(String(advisorId)) || false) : false;
              const ahodOn = ahodId ? (leaveMap.get(String(ahodId)) || false) : false;
              const forceAHOD = (type === 'leave') && mentorId && advisorId && String(mentorId) === String(advisorId) && mentorOn && advisorOn && ahodId && !ahodOn && !approvals.some((a: any) => String(a.approver_role || '').toLowerCase().trim() === 'ahod');

              return {
                ...app,
                current_approver_level: forceAHOD ? 'ahod' : app.current_approver_level,
                student: { ...student, profile: prof } as any,
                approvals,
                mentorOnLeave: mentorOn,
                advisorOnLeave: advisorOn,
                ahodOnLeave: ahodOn,
                hodOnLeave: student?.hod_id ? (leaveMap.get(String(student.hod_id)) || false) : false,
              };
            });
            // Pending first, then newest-first
            detailed.sort((a: any, b: any) => {
              const aPending = String(a.status || '').toLowerCase() === 'pending';
              const bPending = String(b.status || '').toLowerCase() === 'pending';
              if (aPending && !bPending) return -1;
              if (!aPending && bPending) return 1;
              const ta = a.created_at ? new Date(a.created_at).getTime() : 0;
              const tb = b.created_at ? new Date(b.created_at).getTime() : 0;
              return tb - ta;
            });
            setDeptApplications(detailed);
          } else {
            setDeptApplications([]);
          }
        } else {
          setDeptApplications([]);
        }
      }

      // For gatepass we don't need the Mentees section - skip fetching mentee-specific applications
      if (type === 'gatepass') {
        setMenteeApplications([]);
      } else {
        // Mentees applications: students where mentor_id === user.id OR advisor_id === user.id
        const { data: mentees } = await supabase
          .from('students')
          .select('*')
          .or(`mentor_id.eq.${user?.id},advisor_id.eq.${user?.id}`);
        const menteeIds = (mentees || []).map((s: any) => s.id);
        
        if (menteeIds.length === 0) {
          setMenteeApplications([]);
        } else {
          const tableName = getApplicationTableName(type);
          const approvalsTableName = getApprovalsTableName(type);

          const mApps = await fetchInChunks(tableName, '*', 'student_id', menteeIds);

          if (mApps && mApps.length > 0) {
            const appIds = mApps.map(app => app.id);
            const studentIds = [...new Set(mApps.map(app => app.student_id))];
            
            const [profilesData, approvalsData] = await Promise.all([
              fetchInChunks('profiles', '*', 'id', studentIds),
              fetchInChunks(approvalsTableName, '*', 'application_id', appIds)
            ]);

            const allStaffIds = new Set<string>();
            mentees?.forEach((s: any) => {
              if (s.mentor_id) allStaffIds.add(s.mentor_id);
              if (s.advisor_id) allStaffIds.add(s.advisor_id);
              if (s.ahod_id) allStaffIds.add(s.ahod_id);
              if (s.hod_id) allStaffIds.add(s.hod_id);
            });
            
            const staffLeaveData = await fetchInChunks('staff', 'id, on_leave', 'id', Array.from(allStaffIds));
            
            const leaveMap = new Map((staffLeaveData || []).map((s: any) => [String(s.id), s.on_leave]));
            const studentsMap = new Map(mentees?.map(s => [s.id, s]) || []);
            const profilesMap = new Map((profilesData || []).map(p => [p.id, p]) || []);
            const approvalsMap = new Map<string, any[]>();
            (approvalsData || []).forEach((approval: any) => {
              if (!approvalsMap.has(approval.application_id)) {
                approvalsMap.set(approval.application_id, []);
              }
              approvalsMap.get(approval.application_id)?.push(approval);
            });

            const detailed = mApps.map(app => {
              const student = studentsMap.get(app.student_id);
              const prof = profilesMap.get(app.student_id);
              const approvals = (approvalsMap.get(app.id) || []).sort((a, b) => 
                new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
              );

              const mentorId = student?.mentor_id;
              const advisorId = student?.advisor_id;
              const ahodId = student?.ahod_id;
              const mentorOn = mentorId ? (leaveMap.get(String(mentorId)) || false) : false;
              const advisorOn = advisorId ? (leaveMap.get(String(advisorId)) || false) : false;
              const ahodOn = ahodId ? (leaveMap.get(String(ahodId)) || false) : false;

              return {
                ...app,
                current_approver_level: app.current_approver_level,
                student: { ...student, profile: prof } as any,
                approvals,
                mentorOnLeave: mentorOn,
                advisorOnLeave: advisorOn,
                ahodOnLeave: ahodOn,
                hodOnLeave: student?.hod_id ? (leaveMap.get(String(student.hod_id)) || false) : false,
              };
            });
            // Pending first, then newest-first
            detailed.sort((a: any, b: any) => {
              const aPending = String(a.status || '').toLowerCase() === 'pending';
              const bPending = String(b.status || '').toLowerCase() === 'pending';
              if (aPending && !bPending) return -1;
              if (!aPending && bPending) return 1;
              const ta = a.created_at ? new Date(a.created_at).getTime() : 0;
              const tb = b.created_at ? new Date(b.created_at).getTime() : 0;
              return tb - ta;
            });
            setMenteeApplications(detailed);
          } else {
            setMenteeApplications([]);
          }
        }
      }
    } catch (err) {
      console.error('Error fetching dept/mentee apps:', err);
      setDeptApplications([]);
      setMenteeApplications([]);
    } finally {
      setLoading(false);
    }
  };

  const fetchApplications = async () => {
    setLoading(true);
    try {
      const tableName = getApplicationTableName(type);
      const approvalsTableName = getApprovalsTableName(type);

      // Batch fetch students and apps in parallel
      const [studentsResult, appsResult] = await Promise.all([
        supabase.from('students').select('*').eq('ahod_id', user?.id),
        supabase.from(tableName).select('*').order('created_at', { ascending: false }).limit(100)
      ]);

      if (studentsResult.error) throw studentsResult.error;
      const students = studentsResult.data || [];
      const studentIds = students.map((s) => s.id);

      if (studentIds.length === 0) {
        setApplications([]);
        setLoading(false);
        return;
      }

      // Filter apps client-side (faster for large datasets)
      const apps = (appsResult.data || []).filter(app => studentIds.includes(app.student_id));

      if (apps.length > 0) {
        const appIds = apps.map(app => app.id);
        
        const [profilesData, approvalsData] = await Promise.all([
          fetchInChunks('profiles', '*', 'id', studentIds),
          fetchInChunks(approvalsTableName, '*', 'application_id', appIds)
        ]);

        const allStaffIds = new Set<string>();
        students?.forEach((s: any) => {
          if (s.mentor_id) allStaffIds.add(s.mentor_id);
          if (s.advisor_id) allStaffIds.add(s.advisor_id);
          if (s.ahod_id) allStaffIds.add(s.ahod_id);
          if (s.hod_id) allStaffIds.add(s.hod_id);
        });
        
        const staffLeaveData = await fetchInChunks('staff', 'id, on_leave', 'id', Array.from(allStaffIds));
        
        const leaveMap = new Map((staffLeaveData || []).map((s: any) => [String(s.id), s.on_leave]));
        const studentsMap = new Map(students?.map(s => [s.id, s]) || []);
        const profilesMap = new Map((profilesData || []).map(p => [p.id, p]) || []);
        const approvalsMap = new Map<string, any[]>();
        (approvalsData || []).forEach((approval: any) => {
          if (!approvalsMap.has(approval.application_id)) {
            approvalsMap.set(approval.application_id, []);
          }
          approvalsMap.get(approval.application_id)?.push(approval);
        });

          const appsWithDetails = apps.map(app => {
          const student = studentsMap.get(app.student_id);
          const profile = profilesMap.get(app.student_id);
          const approvals = (approvalsMap.get(app.id) || []).sort((a, b) => 
            new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
          );

              const mentorId = student?.mentor_id;
              const advisorId = student?.advisor_id;
              const ahodId = student?.ahod_id;
              const mentorOn = mentorId ? (leaveMap.get(String(mentorId)) || false) : false;
              const advisorOn = advisorId ? (leaveMap.get(String(advisorId)) || false) : false;
              const ahodOn = ahodId ? (leaveMap.get(String(ahodId)) || false) : false;
              const forceAHOD = (type === 'leave') && mentorId && advisorId && String(mentorId) === String(advisorId) && mentorOn && advisorOn && ahodId && !ahodOn && !approvals.some((a: any) => String(a.approver_role || '').toLowerCase().trim() === 'ahod');

              return {
                ...app,
                current_approver_level: forceAHOD ? 'ahod' : app.current_approver_level,
                student: { ...student, profile } as any,
                approvals,
                mentorOnLeave: mentorOn,
                advisorOnLeave: advisorOn,
                ahodOnLeave: ahodOn,
                hodOnLeave: student?.hod_id ? (leaveMap.get(String(student.hod_id)) || false) : false,
              };
        });

        // Pending first, then newest-first
        appsWithDetails.sort((a: any, b: any) => {
          const aPending = String(a.status || '').toLowerCase() === 'pending';
          const bPending = String(b.status || '').toLowerCase() === 'pending';
          if (aPending && !bPending) return -1;
          if (!aPending && bPending) return 1;
          const ta = a.created_at ? new Date(a.created_at).getTime() : 0;
          const tb = b.created_at ? new Date(b.created_at).getTime() : 0;
          return tb - ta;
        });
        setApplications(appsWithDetails);
      } else {
        setApplications([]);
      }
    } catch (error) {
      console.error('Error fetching applications:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleApproval = async (appId: string, action: 'approved' | 'rejected', remarks: string) => {
    try {
      if (onLeave) {
        alert('You cannot approve/reject applications while on leave. Please change your leave status first.');
        return;
      }

      // prevent repeated clicks
      if (processingApps[appId]) return;
      setProcessingApps(prev => ({ ...prev, [appId]: true }));

      // application may be in any list
      const allApps = [...applications, ...menteeApplications, ...deptApplications];
      const app = allApps.find((a) => a.id === appId);
      if (!app) return;

      const isAHOD = app.student?.ahod_id === user?.id;

      // AHOD should act as HOD when:
      // - current level is 'hod' and HOD is on leave, OR
      // - current level is 'ahod' but HOD is on leave (AHOD was routed as HOD alternate), OR
      // - current level is 'advisor' and BOTH advisor and HOD are on leave (AHOD steps in as HOD final)
      const isActingAsHOD = (
        (app.current_approver_level === 'hod' && app.hodOnLeave && isAHOD) ||
        (app.current_approver_level === 'ahod' && app.hodOnLeave && isAHOD) ||
        (app.current_approver_level === 'advisor' && app.advisorOnLeave && app.hodOnLeave && isAHOD)
      );

      let finalRemarks = remarks || '';
      if (isActingAsHOD) {
        const hodLeaveNote = '[Note: Approved/Rejected by AHOD acting as HOD (HOD on leave / advisor+HOD on leave)]';
        finalRemarks = finalRemarks ? `${finalRemarks}\n\n${hodLeaveNote}` : hodLeaveNote;
      }

      // Force AHOD-level approval when mentor and advisor are the same and both on leave
      const mentorId = app.student?.mentor_id;
      const advisorId = app.student?.advisor_id;
      const ahodId = app.student?.ahod_id;
      const forceAHOD = (type === 'leave') && mentorId && advisorId && String(mentorId) === String(advisorId) && app.mentorOnLeave && app.advisorOnLeave && ahodId && !app.ahodOnLeave && !((app.approvals || []).some((a: any) => String(a.approver_role || '').toLowerCase().trim() === 'ahod'));

      // Decide which role to record the approval as.
      // Prioritize acting-as-HOD, then explicit forced AHOD when both mentor+advisor on leave.
      let approverRoleToRecord = app.current_approver_level;
      if (isActingAsHOD) {
        approverRoleToRecord = 'hod';
      } else if (forceAHOD || (app.current_approver_level === 'mentor' && app.mentorOnLeave && app.advisorOnLeave && isAHOD)) {
        approverRoleToRecord = 'ahod';
      } else {
        approverRoleToRecord = app.current_approver_level;
      }

      const approvalsTableName = getApprovalsTableName(type);
      const applicationsTableName = getApplicationTableName(type);

      const { data: insertedApprovals, error: insertErr } = await supabase.from(approvalsTableName).insert({
        application_id: appId,
        approver_id: user?.id,
        approver_role: approverRoleToRecord,
        action,
        remarks: finalRemarks,
      }).select();
      if (insertErr) {
        console.error('AHOD: approval insert error', { insertErr, appId, approverRoleToRecord, action, finalRemarks });
        throw insertErr;
      }
      const insertedApproval = Array.isArray(insertedApprovals) && insertedApprovals.length > 0 ? insertedApprovals[0] : null;
      console.debug('AHOD: inserted approval', { insertedApproval, appId, approverRoleToRecord, action });

      // When forcing AHOD approval because mentor+advisor are on leave,
      // do NOT create implicit mentor/advisor approvals. Instead, record
      // only the AHOD approval and advance the application to HOD. The
      // UI will render mentor/advisor as 'On Leave' (no approval rows).

      let newCurrentApproverLevel = app.current_approver_level;
      let newStatus = app.status;

      if (action === 'rejected') {
        {
          const { data: updatedData, error: updateErr } = await supabase.from(applicationsTableName).update({ status: 'rejected', current_approver_level: 'completed', updated_at: new Date().toISOString() }).eq('id', appId).select().maybeSingle();
          if (updateErr) {
            console.error('AHOD: application update (rejected) failed', { updateErr, appId });
            throw updateErr;
          }
          console.debug('AHOD: application updated (rejected)', { updatedData, appId });
        }
        newCurrentApproverLevel = 'completed';
        newStatus = 'rejected';
      } else {
        const student = app.student;
        const updateApplication = async (updates: any) => {
          const { data: updatedData, error: updateErr } = await supabase.from(applicationsTableName).update({ ...updates, updated_at: new Date().toISOString() }).eq('id', appId).select().maybeSingle();
          if (updateErr) {
            console.error('AHOD: application update failed', { updateErr, appId, updates });
            throw updateErr;
          }
          console.debug('AHOD: application update result', { updatedData, appId, updates });
          return updatedData;
        };

        if (approverRoleToRecord === 'mentor') {
          // mentor -> advisor -> ahod -> hod
          if (student?.advisor_id) {
            await updateApplication({ status: 'pending', current_approver_level: 'advisor' });
            newCurrentApproverLevel = 'advisor'; newStatus = 'pending';
          } else if (student?.ahod_id) {
            await updateApplication({ status: 'pending', current_approver_level: 'ahod' });
            newCurrentApproverLevel = 'ahod'; newStatus = 'pending';
          } else if (student?.hod_id) {
            await updateApplication({ status: 'pending', current_approver_level: 'hod' });
            newCurrentApproverLevel = 'hod'; newStatus = 'pending';
          } else {
            await updateApplication({ status: 'approved', current_approver_level: 'completed' });
            newCurrentApproverLevel = 'completed'; newStatus = 'approved';
          }
        } else if (approverRoleToRecord === 'advisor') {
          // For gatepass, advisor -> HOD (AHOD is skipped)
          if (type === 'gatepass') {
            if (student?.hod_id) {
              await updateApplication({ status: 'pending', current_approver_level: 'hod' });
              newCurrentApproverLevel = 'hod'; newStatus = 'pending';
            } else {
              await updateApplication({ status: 'approved', current_approver_level: 'completed' });
              newCurrentApproverLevel = 'completed'; newStatus = 'approved';
            }
          } else {
            // default: advisor -> ahod -> hod
            if (student?.ahod_id) {
              await updateApplication({ status: 'pending', current_approver_level: 'ahod' });
              newCurrentApproverLevel = 'ahod'; newStatus = 'pending';
            } else if (student?.hod_id) {
              await updateApplication({ status: 'pending', current_approver_level: 'hod' });
              newCurrentApproverLevel = 'hod'; newStatus = 'pending';
            } else {
              await updateApplication({ status: 'approved', current_approver_level: 'completed' });
              newCurrentApproverLevel = 'completed'; newStatus = 'approved';
            }
          }
        } else if (approverRoleToRecord === 'ahod') {
          if (student?.hod_id) {
            await updateApplication({ status: 'pending', current_approver_level: 'hod' });
            newCurrentApproverLevel = 'hod'; newStatus = 'pending';
          } else {
            await updateApplication({ status: 'approved', current_approver_level: 'completed' });
            newCurrentApproverLevel = 'completed'; newStatus = 'approved';
          }
        } else if (approverRoleToRecord === 'hod') {
          await updateApplication({ status: 'approved', current_approver_level: 'completed' });
          newCurrentApproverLevel = 'completed'; newStatus = 'approved';
        } else {
          await updateApplication({ status: 'approved', current_approver_level: 'completed' });
          newCurrentApproverLevel = 'completed'; newStatus = 'approved';
        }
      }


      // Optimistically update local UI so approver buttons disappear immediately
      try {
        // Fetch authoritative approvals and application state from DB so UI reflects auto-inserts
        const [{ data: refreshedApp }, { data: refreshedApprovals }] = await Promise.all([
          supabase.from(applicationsTableName).select('*').eq('id', appId).maybeSingle(),
          supabase.from(approvalsTableName).select('*').eq('application_id', appId)
        ]);

        const authoritativeApprovals = Array.isArray(refreshedApprovals) ? refreshedApprovals : (refreshedApprovals ? [refreshedApprovals] : []);

        const applyLocalUpdate = (setter: React.Dispatch<React.SetStateAction<any[]>>) => setter((prev: any[]) => prev.map((p: any) => {
          if (p.id !== appId) return p;
          return { ...p, approvals: authoritativeApprovals || [...(p.approvals || []), insertedApproval].filter(Boolean), current_approver_level: (refreshedApp && refreshedApp.current_approver_level) || newCurrentApproverLevel, status: (refreshedApp && refreshedApp.status) || newStatus };
        }));

        applyLocalUpdate(setApplications);
        applyLocalUpdate(setDeptApplications);
        applyLocalUpdate(setMenteeApplications);

        // After optimistic update, still attempt non-fatal certificate creation if fully approved
        if (action === 'approved') {
          const { data: refreshedApp } = await supabase.from(applicationsTableName).select('*').eq('id', appId).maybeSingle();
          if (refreshedApp && String(refreshedApp.status).toLowerCase() === 'approved' && (type === 'od' || type === 'leave')) {
            const attachmentUrl = (app as any).attachment_url || refreshedApp.attachment_url || null;
            const studentId = app.student?.id || refreshedApp.student_id;
            if (attachmentUrl && studentId) {
              const { data: existing } = await supabase.from('certificates').select('id').eq('user_id', studentId).eq('file_url', attachmentUrl).limit(1);
              if (!existing || (existing as any).length === 0) {
                const certPayload: any = {
                  user_id: studentId,
                  description: ((app as any).subject || (app as any).reason || null),
                  file_url: attachmentUrl,
                };
                await supabase.from('certificates').insert(certPayload);
              }
            }
          }
        }
      } catch (err) {
        console.error('Error during optimistic update / certificate creation:', err);
      }

      const actionMessage = isActingAsHOD ? `Application ${action} successfully as Acting HOD!` : `Application ${action} successfully!`;
      alert(actionMessage);
      fetchApplications();
      fetchDeptAndMenteeApplications();
      setProcessingApps(prev => { const c = { ...prev }; delete c[appId]; return c; });
    } catch (error) {
      console.error('Error processing approval:', error);
      alert('Failed to process approval. Please try again.');
      setProcessingApps(prev => { const c = { ...prev }; delete c[appId]; return c; });
    }
  };

  const sidebarItems = [
    { label: 'Dashboard', path: '/ahod-dashboard', icon: <Home className="h-5 w-5" /> },
    { label: 'OD Applications', path: '/ahod/od', icon: <FileText className="h-5 w-5" /> },
    { label: 'Leave Applications', path: '/ahod/leave', icon: <Calendar className="h-5 w-5" /> },
    { label: 'Gatepass Applications', path: '/ahod/gatepass', icon: <CreditCard className="h-5 w-5" /> },
    { label: 'Bonafide Applications', path: '/ahod/bonafide', icon: <Award className="h-5 w-5" /> },
  ];

  const typeConfig = {
    od: { title: 'On Duty', icon: <FileText className="h-8 w-8" /> },
    leave: { title: 'Leave', icon: <Calendar className="h-8 w-8" /> },
    gatepass: { title: 'Gatepass', icon: <CreditCard className="h-8 w-8" /> },
    bonafide: { title: 'Bonafide', icon: <Award className="h-8 w-8" /> },
  };

  // Removed My Applications section - AHOD page will show only Mentees' and Department Applications with approve/reject actions

  return (
    <DashboardLayout sidebarItems={sidebarItems}>
      <div className="max-w-7xl mx-auto px-4 sm:px-6">
        <div className="mb-6 sm:mb-8">
          <div className="flex items-center space-x-3 sm:space-x-4">
            <div className="bg-blue-100 rounded-lg p-2 sm:p-3 text-blue-600 flex-shrink-0">
              {typeConfig[type].icon}
            </div>
            <div>
              <h1 className="text-2xl sm:text-3xl font-bold text-slate-800">
                {typeConfig[type].title} Applications
              </h1>
              <p className="text-sm sm:text-base text-slate-600 mt-1">
                Review and approve department applications
              </p>
            </div>
          </div>
        </div>

        {loading ? (
          <div className="fixed inset-0 z-50 bg-white/90 flex flex-col items-center justify-center">
            <div className="animate-spin rounded-full h-14 w-14 border-b-2 border-blue-600"></div>
            <p className="mt-4 text-slate-600 text-lg">Loading applications...</p>
          </div>
        ) : (
          <div className="space-y-4 sm:space-y-6">
            {/* Top view toggle: Mentees vs Department */}
            <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2 sm:gap-3 w-full sm:w-auto">
                  {type !== 'gatepass' ? (
                    <>
                      <button
                        onClick={() => setView('mentees')}
                        className={`flex-1 sm:flex-none px-3 sm:px-4 py-2 rounded-md text-sm font-medium border transition-colors ${view === 'mentees' ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'}`}
                      >
                        Mentees
                      </button>
                      <button
                        onClick={() => setView('department')}
                        className={`flex-1 sm:flex-none px-3 sm:px-4 py-2 rounded-md text-sm font-medium border transition-colors ${view === 'department' ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'}`}
                      >
                        Department
                      </button>
                    </>
                  ) : (
                    <button
                      onClick={() => setView('department')}
                      className={`px-3 sm:px-4 py-2 rounded-md text-sm font-medium border transition-colors ${'bg-blue-600 text-white border-blue-600'}`}
                    >
                      Department
                    </button>
                  )}
                </div>
            </div>

            {/* Mentees view (hidden for gatepass) */}
            {type !== 'gatepass' && view === 'mentees' && (
              <div>
                <h2 className="text-xl sm:text-2xl font-bold text-slate-800 mb-3 sm:mb-4">Class {typeConfig[type].title} Applications</h2>
                <div className="space-y-3 sm:space-y-4">
                  {menteeApplications.length === 0 ? (
                    <div className="bg-white rounded-xl shadow-lg border border-slate-200 p-12 text-center">
                      <p className="text-slate-500">No mentee applications found</p>
                    </div>
                  ) : (
                    menteeApplications.map((app) => {
                    const isAHOD = app.student.ahod_id === user?.id;
                    const isMentor = app.student.mentor_id === user?.id;
                    const isAdvisor = app.student.advisor_id === user?.id;

                    const isAHODAlsoMentor = isAHOD && isMentor;
                    const lockedForAHODMentor = isAHODAlsoMentor && app.status === 'pending' && app.current_approver_level === 'advisor' && !app.advisorOnLeave;

                    const canApprove =
                      app.status === 'pending' &&
                      !onLeave &&
                      (
                        (isAHODAlsoMentor && app.current_approver_level === 'mentor' && isMentor) ||
                        (!isAHODAlsoMentor && (
                          (app.current_approver_level === 'mentor' && (isMentor || (isAHOD && app.mentorOnLeave && app.advisorOnLeave))) ||
                          (app.current_approver_level === 'advisor' && (
                            isAdvisor || (
                              // AHOD should not act as advisor for gatepass; only for OD/Leave when advisor missing/on-leave
                              isAHOD && (app.advisorOnLeave || !app.student?.advisor_id) && !((['bonafide','gatepass'] as ApplicationType[]).includes(type))
                            )
                          )) ||
                          // When both advisor and HOD are on leave for gatepass, AHOD should act as HOD
                          (app.current_approver_level === 'advisor' && app.advisorOnLeave && app.hodOnLeave && isAHOD) ||
                          ((app.current_approver_level === 'ahod' && isAHOD) && (type !== 'bonafide')) ||
                          (app.current_approver_level === 'hod' && isAHOD && (app.hodOnLeave || !app.student?.hod_id))
                        ))
                      );

                    return (
                      <div key={`mentee-${app.id}`} className="bg-white rounded-xl shadow-lg border border-slate-200 p-4 sm:p-6">
                        <div className="flex flex-col sm:flex-row sm:justify-between sm:items-start mb-3 sm:mb-4 gap-2">
                          <div className="flex-1">
                            <h3 className="text-base sm:text-lg font-bold text-slate-800">{app.student.profile?.name}</h3>
                            <p className="text-xs sm:text-sm text-slate-600 mt-1">{app.student.reg_no} • Year {app.student.year} • Section {app.student.section}</p>
                          </div>
                          <span className={`px-3 py-1 rounded-full text-xs font-medium self-start ${app.status === 'approved' ? 'bg-green-100 text-green-700' : app.status === 'rejected' ? 'bg-red-100 text-red-700' : 'bg-yellow-100 text-yellow-700'}`}>{app.status}</span>
                        </div>

                        <div className="space-y-2 mb-4">
                          {app.mentorOnLeave && (
                            <div className="bg-orange-50 border border-orange-200 rounded-lg px-3 py-2 mb-3">
                              <p className="text-orange-700 text-sm font-medium">
                                ⚠️ Mentor is on leave - Application forwarded to next level
                              </p>
                            </div>
                          )}
                              {app.advisorOnLeave && (
                                <div className="bg-orange-50 border border-orange-200 rounded-lg px-3 py-2 mb-3">
                                  <p className="text-orange-700 text-sm font-medium">
                                ⚠️ {((['bonafide','gatepass'] as ApplicationType[]).includes(type) ? 'Advisor is on leave - Application forwarded to HOD' : 'Advisor is on leave - Application forwarded to AHOD')}
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
                          {app.hodOnLeave && (
                            <div className="bg-orange-50 border border-orange-200 rounded-lg px-3 py-2 mb-3">
                              <p className="text-orange-700 text-sm font-medium">
                                ⚠️ HOD is on leave - Application being handled by AHOD
                              </p>
                            </div>
                          )}
                          {/* Show Subject for OD, Leave */}
                                                    {(app as any).subject && (
                            <div className="flex text-sm">
                              <span className="font-medium text-slate-700 w-24">
                                Subject:
                              </span>
                              <span className="text-slate-600">{(app as any).subject}</span>
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
                                                    {(app as any).from_date && (
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
                          {/* Bonafide-specific fields */}
                          {(app as any).purpose && (
                          <div className="flex text-sm">
                            <span className="font-medium text-slate-700 w-24">
                              Purpose:
                            </span>
                            <span className="text-slate-600">{(app as any).purpose}</span>
                          </div>
                        )}
                        {(app as any).fathers_name && (
                          <div className="flex text-sm">
                            <span className="font-medium text-slate-700 w-24">
                              Father's Name:
                            </span>
                            <span className="text-slate-600">{(app as any).fathers_name}</span>
                          </div>
                        )}
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
                            <span className="font-medium text-slate-700 w-24">Bus:</span>
                            <span className="text-slate-600 capitalize">{(app as any).bus_option === 'college' ? 'College Bus' : 'Out Bus'}{(app as any).bus_fare && ` (${(app as any).bus_fare})`}</span>
                          </div>
                        )}
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
                                onClick={() => {
                                  setCurrentProofUrl(app.attachment_url);
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
                          const levelLabels = {
                            mentor: 'Mentor',
                            advisor: 'Advisor',
                            ahod: 'AHOD',
                            hod: 'HOD',
                            ps: 'PS'
                          };

                          const roleToStudentField = {
                            mentor: 'mentor_id',
                            advisor: 'advisor_id',
                            ahod: 'ahod_id',
                            hod: 'hod_id',
                            ps: 'ps_id',
                          };

                          const getApprovalForRole = (role) => {
                            const normalizedRole = role.toLowerCase().trim();
                            const studentField = roleToStudentField[normalizedRole];

                            const approvals = (app.approvals || []).slice();
                            if (approvals.length === 0) return null;

                            // 1) Prefer exact role match first (most reliable when approver_role is set correctly)
                            const byRoleExact = approvals.filter((a) => String(a.approver_role || '').toLowerCase().trim() === normalizedRole);
                            if (byRoleExact.length > 0) {
                              byRoleExact.sort((x, y) => {
                                const tx = x.created_at ? new Date(x.created_at).getTime() : 0;
                                const ty = y.created_at ? new Date(y.created_at).getTime() : 0;
                                return ty - tx;
                              });
                              return byRoleExact[0];
                            }

                            // 2) Prefer approvals by the assigned staff id for this role.
                            if (studentField && app.student && app.student[studentField]) {
                              const assignedId = String(app.student[studentField]);
                              const byId = approvals.filter((a) => String(a.approver_id) === assignedId);
                              if (byId.length > 0) {
                                // Prefer entries that correctly set approver_role first
                                const byIdExactRole = byId.filter((a) => String(a.approver_role || '').toLowerCase().trim() === normalizedRole);
                                const pick = (arr) => {
                                  arr.sort((x, y) => {
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
                            const escapeRegex = (s) => s.replace(/[-\\/\\^$*+?.()|[\]{}]/g, '\\$&');
                            const roleRegex = new RegExp(`\\b${escapeRegex(normalizedRole)}\\b`);
                            const byRoleContains = approvals.filter((a) => {
                              const r = String(a.approver_role || '').toLowerCase().trim();
                              return roleRegex.test(r);
                            });
                            if (byRoleContains.length > 0) {
                              byRoleContains.sort((x, y) => {
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
                            const studentFieldForRole = roleToStudentField[lvl];
                            const onLeaveFlag = lvl === 'mentor' ? app.mentorOnLeave : lvl === 'advisor' ? app.advisorOnLeave : lvl === 'ahod' ? app.ahodOnLeave : lvl === 'hod' ? app.hodOnLeave : (app.psOnLeave);
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
                                    // Check if AHOD acted for HOD (approver is AHOD but role recorded as HOD)
                                    const ahodActedForHod = type === 'gatepass' && 
                                      lvl === 'hod' && 
                                      rs.approval.approver_id && 
                                      app.student?.ahod_id && 
                                      String(rs.approval.approver_id) === String(app.student.ahod_id);
                                    
                                    const autoApproved = String(rs.approval.remarks || '').indexOf('[Auto-approved]') !== -1 && rs.onLeave;
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

                        {lockedForAHODMentor ? (
                          <div className="mt-3">
                            <div className="inline-block bg-gray-100 text-gray-700 px-3 py-1 rounded-full text-xs sm:text-sm font-medium">Locked — waiting for advisor action</div>
                          </div>
                        ) : (
                          canApprove && (
                            <div className="flex flex-col sm:flex-row gap-2 sm:gap-4">
                              <button onClick={() => { const remarks = prompt('Enter remarks (optional):'); handleApproval(app.id, 'approved', remarks || ''); }} className="flex-1 py-2 px-4 bg-green-600 text-white text-sm rounded-lg hover:bg-green-700 transition-colors font-medium">Approve</button>
                              <button onClick={() => { const remarks = prompt('Enter reason for rejection:'); if (remarks) { handleApproval(app.id, 'rejected', remarks); } }} className="flex-1 py-2 px-4 bg-red-600 text-white text-sm rounded-lg hover:bg-red-700 transition-colors font-medium">Reject</button>
                            </div>
                          )
                        )}
                      </div>
                    );
                  })
                  )}
                </div>
              </div>
            )}

            {/* Department view */}
            {view === 'department' && (
              <div>
                <h2 className="text-xl sm:text-2xl font-bold text-slate-800 mb-3 sm:mb-4">Department Applications</h2>
                <div className="space-y-3 sm:space-y-4">
                  {deptApplications.length === 0 ? (
                    <div className="bg-white rounded-xl shadow-lg border border-slate-200 p-12 text-center">
                      <p className="text-slate-500">No department applications found</p>
                    </div>
                  ) : (
                    deptApplications.map((app) => {
                    const isAHOD = app.student.ahod_id === user?.id;
                    const isMentor = app.student.mentor_id === user?.id;
                    const isAdvisor = app.student.advisor_id === user?.id;

                    const isAHODAlsoMentor = isAHOD && isMentor;
                    const lockedForAHODMentor = isAHODAlsoMentor && app.status === 'pending' && app.current_approver_level !== 'ahod' && (type === 'leave');

                    const canApprove =
                      app.status === 'pending' &&
                      !onLeave &&
                      (
                        (isAHODAlsoMentor ? (app.current_approver_level === 'ahod' && isAHOD) : (
                          (app.current_approver_level === 'mentor' && (isMentor || (isAHOD && app.mentorOnLeave && app.advisorOnLeave))) ||
                          (app.current_approver_level === 'advisor' && (
                            isAdvisor || (
                              isAHOD && (app.advisorOnLeave || !app.student?.advisor_id) && !((['bonafide','gatepass'] as ApplicationType[]).includes(type))
                            )
                          )) ||
                          // When both advisor and HOD are on leave for gatepass, AHOD should act as HOD
                          (app.current_approver_level === 'advisor' && app.advisorOnLeave && app.hodOnLeave && isAHOD) ||
                          ((app.current_approver_level === 'ahod' && isAHOD) && (type !== 'bonafide')) ||
                          (app.current_approver_level === 'hod' && isAHOD && (app.hodOnLeave || !app.student?.hod_id))
                        ))
                      );

                    return (
                      <div key={`dept-${app.id}`} className="bg-white rounded-xl shadow-lg border border-slate-200 p-4 sm:p-6">
                        <div className="flex flex-col sm:flex-row sm:justify-between sm:items-start mb-3 sm:mb-4 gap-2">
                          <div className="flex-1">
                            <h3 className="text-base sm:text-lg font-bold text-slate-800">{app.student.profile?.name}</h3>
                            <p className="text-xs sm:text-sm text-slate-600 mt-1">{app.student.reg_no} • Year {app.student.year} • Section {app.student.section}</p>
                          </div>
                          <span className={`px-3 py-1 rounded-full text-xs font-medium self-start ${app.status === 'approved' ? 'bg-green-100 text-green-700' : app.status === 'rejected' ? 'bg-red-100 text-red-700' : 'bg-yellow-100 text-yellow-700'}`}>{app.status}</span>
                        </div>
                        <div className="space-y-2 mb-4">
                          {app.mentorOnLeave && (
                            <div className="bg-orange-50 border border-orange-200 rounded-lg px-3 py-2 mb-3">
                              <p className="text-orange-700 text-sm font-medium">
                                ⚠️ Mentor is on leave - Application forwarded to next level
                              </p>
                            </div>
                          )}
                          {app.advisorOnLeave && (
                            <div className="bg-orange-50 border border-orange-200 rounded-lg px-3 py-2 mb-3">
                              <p className="text-orange-700 text-sm font-medium">
                                ⚠️ {((['bonafide','gatepass'] as ApplicationType[]).includes(type) ? 'Advisor is on leave - Application forwarded to HOD' : 'Advisor is on leave - Application forwarded to AHOD')}
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
                          {app.hodOnLeave && (
                            <div className="bg-orange-50 border border-orange-200 rounded-lg px-3 py-2 mb-3">
                              <p className="text-orange-700 text-sm font-medium">
                                ⚠️ HOD is on leave - Application being handled by AHOD
                              </p>
                            </div>
                          )}
                          {/* Show Subject for OD, Leave */}
                                                    {(app as any).subject && (
                            <div className="flex text-sm">
                              <span className="font-medium text-slate-700 w-24">
                                Subject:
                              </span>
                              <span className="text-slate-600">{(app as any).subject}</span>
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
                                                    {(app as any).from_date && (
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
                          {/* Bonafide-specific fields */}
                          {(app as any).purpose && (
                          <div className="flex text-sm">
                            <span className="font-medium text-slate-700 w-24">
                              Purpose:
                            </span>
                            <span className="text-slate-600">{(app as any).purpose}</span>
                          </div>
                        )}
                        {(app as any).fathers_name && (
                          <div className="flex text-sm">
                            <span className="font-medium text-slate-700 w-24">
                              Father's Name:
                            </span>
                            <span className="text-slate-600">{(app as any).fathers_name}</span>
                          </div>
                        )}
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
                            <span className="font-medium text-slate-700 w-24">Bus:</span>
                            <span className="text-slate-600 capitalize">{(app as any).bus_option === 'college' ? 'College Bus' : 'Out Bus'}{(app as any).bus_fare && ` (${(app as any).bus_fare})`}</span>
                          </div>
                        )}
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
                                onClick={() => {
                                  setCurrentProofUrl(app.attachment_url);
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
                          const levelLabels = {
                            mentor: 'Mentor',
                            advisor: 'Advisor',
                            ahod: 'AHOD',
                            hod: 'HOD',
                            ps: 'PS'
                          };

                          const roleToStudentField = {
                            mentor: 'mentor_id',
                            advisor: 'advisor_id',
                            ahod: 'ahod_id',
                            hod: 'hod_id',
                            ps: 'ps_id',
                          };

                          const getApprovalForRole = (role: string): any => {
                            const normalizedRole = role.toLowerCase().trim();
                            const studentField = roleToStudentField[normalizedRole as keyof typeof roleToStudentField];

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
                            const studentFieldForRole = roleToStudentField[lvl as keyof typeof roleToStudentField];
                            const onLeaveFlag = lvl === 'mentor' ? app.mentorOnLeave : lvl === 'advisor' ? app.advisorOnLeave : lvl === 'ahod' ? app.ahodOnLeave : lvl === 'hod' ? app.hodOnLeave : app.psOnLeave;
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
                                  const lvlLabel = levelLabels[lvl as keyof typeof levelLabels] || lvl.charAt(0).toUpperCase() + lvl.slice(1);
                                  if (rs.approval) {
                                    const act = String(rs.approval.action || '').toLowerCase().trim();
                                    // Check if AHOD acted for HOD (approver is AHOD but role recorded as HOD)
                                    const ahodActedForHod = type === 'gatepass' && 
                                      lvl === 'hod' && 
                                      rs.approval.approver_id && 
                                      app.student?.ahod_id && 
                                      String(rs.approval.approver_id) === String(app.student.ahod_id);
                                    
                                    return (
                                      <div key={`${app.id}-${idx}`} className="flex items-center text-sm">
                                        {act === 'approved' ? (
                                          <CheckCircle className="h-4 w-4 text-green-500 mr-2" />
                                        ) : act === 'rejected' ? (
                                          <XCircle className="h-4 w-4 text-red-500 mr-2" />
                                        ) : (
                                          <Clock className="h-4 w-4 text-yellow-500 mr-2" />
                                        )}
                                        <span className="capitalize text-slate-700">{lvlLabel}</span>
                                        <span className="text-slate-500 ml-2">
                                          {act === 'approved' ? 'Approved' : act === 'rejected' ? 'Rejected' : 'Pending'}
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
                                      <div key={`${app.id}-${idx}-inferred`} className="flex items-center text-sm">
                                        <CheckCircle className="h-4 w-4 text-green-500 mr-2" />
                                        <span className="capitalize text-slate-700">{lvlLabel}</span>
                                        <span className="text-slate-500 ml-2">Approved (inferred)</span>
                                      </div>
                                    );
                                  }

                                  if (rs.onLeave) {
                                    return (
                                      <div key={`${app.id}-${idx}-leave`} className="flex items-center text-sm">
                                        <span className="inline-block px-2 py-1 rounded-full text-xs font-medium bg-orange-100 text-orange-700">{lvlLabel}</span>
                                        <span className="text-slate-500 ml-2">On Leave</span>
                                      </div>
                                    );
                                  }

                                  return (
                                    <div key={`${app.id}-${idx}-pending`} className="flex items-center text-sm">
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


                        {lockedForAHODMentor ? (
                          <div className="mt-3">
                            <div className="inline-block bg-gray-100 text-gray-700 px-3 py-1 rounded-full text-xs sm:text-sm font-medium">Locked — waiting for advisor action</div>
                          </div>
                        ) : (
                          canApprove && (
                            <div className="flex flex-col sm:flex-row gap-2 sm:gap-4">
                              <button onClick={() => { const remarks = prompt('Enter remarks (optional):'); handleApproval(app.id, 'approved', remarks || ''); }} className="flex-1 py-2 px-4 bg-green-600 text-white text-sm rounded-lg hover:bg-green-700 transition-colors font-medium">Approve</button>
                              <button onClick={() => { const remarks = prompt('Enter reason for rejection:'); if (remarks) { handleApproval(app.id, 'rejected', remarks); } }} className="flex-1 py-2 px-4 bg-red-600 text-white text-sm rounded-lg hover:bg-red-700 transition-colors font-medium">Reject</button>
                            </div>
                          )
                        )}
                      </div>
                    );
                  })
                  )}
                </div>
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
}
