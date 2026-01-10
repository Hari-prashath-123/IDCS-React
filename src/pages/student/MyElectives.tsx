import { useEffect, useState } from 'react';
import DashboardLayout from '../../components/DashboardLayout';
import { BookOpen, Home, CalendarDays, CheckCircle } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import api from '../../lib/api';
import { useAuth } from '../../contexts/AuthContext';

type Elective = {
  id: string;
  sub_name: string;
  course_code: string;
  parent_subject_id: string;
  staff_id: string;
  department: string;
  year: number;
  group: string;
  seat_count: number | null;
  seats_filled: number;
  is_active: boolean;
  parent_subject?: {
    name: string;
    subject_code: string;
  };
  staff?: {
    name: string;
  };
  blocked_departments?: Array<{ department: string }>;
};

type StudentElectiveSelection = {
  id: string;
  elective_id: string;
  is_locked: boolean;
  locked_at: string | null;
};

type GroupedElectives = {
  [parentId: string]: {
    parent: { name: string; subject_code: string };
    electives: Elective[];
  };
};

const GROUP_MAPPING: { [key: string]: string[] } = {
  CG: ["AI&DS", "CSE", "IT", "AI&ML"],
  EG: ["ECE", "EEE"],
  MG: ["MECH", "CIVIL"]
};

export default function MyElectives() {
  const { profile } = useAuth();
  const [electives, setElectives] = useState<Elective[]>([]);
  const [selectedElectives, setSelectedElectives] = useState<{ [parentId: string]: string }>({});
  const [submittedSelections, setSubmittedSelections] = useState<{ [parentId: string]: string }>({});
  const [lockedSelections, setLockedSelections] = useState<{ [parentId: string]: boolean }>({});
  const [adminChanged, setAdminChanged] = useState<{ [parentId: string]: boolean }>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [studentGroup, setStudentGroup] = useState<string>("");
  const [studentYear, setStudentYear] = useState<number | null>(null);

  const sidebarItems = [
    { label: 'Dashboard', path: '/student-dashboard', icon: <Home className="h-5 w-5" /> },
    { label: 'My Electives', path: '/student/electives', icon: <BookOpen className="h-5 w-5" /> },
    { label: 'Attendance', path: '/student/attendance', icon: <CalendarDays className="h-5 w-5" /> },
  ];

  useEffect(() => {
    if (!profile) return;
    
    const initializeStudent = async () => {
      // Fetch student's year from students table
      const { data: studentData, error } = await supabase
        .from('students')
        .select('year')
        .eq('id', profile.id)
        .single();
      
      if (error) {
        console.error('Error fetching student year:', error);
      } else if (studentData) {
        setStudentYear(studentData.year);
        console.log('Student year from students table:', studentData.year);
      }
      
      // Determine student's group based on department
      const dept = profile.department;
      let group = "";
      for (const [groupKey, depts] of Object.entries(GROUP_MAPPING)) {
        if (depts.includes(dept)) {
          group = groupKey;
          break;
        }
      }

      console.log('Student department:', dept, 'Detected group:', group, 'Year:', studentData?.year);
      setStudentGroup(group);

      // For first year students, don't match by group/department — fetch all year=1 electives
      if (studentData?.year === 1) {
        fetchElectives(null, dept, 1);
        fetchCurrentSelections();
      } else if (group) {
        fetchElectives(group, dept, studentData?.year);
        fetchCurrentSelections();
      }
    };
    
    initializeStudent();
  }, [profile]);

  // Polling loop for elective seat updates to avoid per-client realtime websocket
  useEffect(() => {
    if (!profile) return;

    const POLL_INTERVAL_MS = 8000; // 8 seconds
    let interval: number | undefined;

    const shouldPoll = () => {
      // Only poll when page is visible to reduce unnecessary load
      if (typeof document !== 'undefined' && document.hidden) return false;
      // Ensure we have either year or group info
      if (studentYear === 1) return true;
      if (!studentGroup || !profile?.department) return false;
      return true;
    };

    const pollOnce = () => {
      if (!shouldPoll()) return;
      if (studentYear === 1) {
        fetchElectives(null, profile.department, 1);
        fetchCurrentSelections();
      } else {
        fetchElectives(studentGroup, profile.department, studentYear || undefined);
        fetchCurrentSelections();
      }
    };

    // Initial poll
    pollOnce();

    // Setup interval
    interval = window.setInterval(() => {
      pollOnce();
    }, POLL_INTERVAL_MS);

    // Visibility change handler to immediately poll when user returns
    const onVisibility = () => {
      if (!document.hidden) pollOnce();
    };
    document.addEventListener('visibilitychange', onVisibility);

    return () => {
      if (interval) clearInterval(interval);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [studentGroup, profile?.department, studentYear]);

  const fetchElectives = async (group: string | null, department: string, year?: number) => {
    setLoading(true);
    try {
      console.log('Fetching electives with:', { group, department, year: year || 'ANY', is_active: true });
      
      // Query electives - no department filter needed since department is NULL
      // One row per elective serves all departments in the group
      let query = supabase
        .from('electives')
        .select(`
          *,
          parent_subject:subjects!parent_subject_id(name, subject_code),
          staff:profiles!staff_id(name, department),
          blocked_departments:elective_blocked_departments(department)
        `)
        .eq('is_active', true);

      // For Year 1 students, ignore group/department — fetch all electives for year=1
      if (year === 1) {
        query = query.eq('year', 1);
      } else {
        // Use group filtering (includes ALL)
        query = query.in('group', [group, 'ALL']);
      }
      
      // Only filter by year if student has a year set
      if (year) {
        query = query.eq('year', year);
      }
      
      query = query
        .order('parent_subject_id', { ascending: true })
        .order('sub_name', { ascending: true });

      const { data, error } = await query;

      if (error) {
        console.error('Error fetching electives:', error);
        throw error;
      }
      
      // Filter electives so the student only sees electives intended for their department
      const filteredElectives = (data || []).filter((elective: any) => {
        // Always include Year 1 electives when requested
        if (year === 1) return true;

        // Exclude if this elective has blocked departments that include the student's department
        const blocked = (elective.blocked_departments || []).map((b: any) => b.department);
        if (blocked.length > 0 && blocked.includes(department)) return false;

        // For group='ALL' electives: show to all students except those in blocked departments
        if (elective.group === 'ALL') return true;

        // If elective row has no department (null), it's a group-level elective — include it
        if (elective.department === null || elective.department === undefined) return true;

        // If elective is explicitly for ALL departments, include it
        if (elective.department === 'ALL') return true;

        // Otherwise only include if elective.department matches student's department
        return elective.department === department;
      });

      console.log('Fetched electives count:', (data || []).length, 'After dept filter:', filteredElectives.length);
      setElectives(filteredElectives);
    } catch (error) {
      console.error('Error fetching electives:', error);
      setElectives([]);
    } finally {
      setLoading(false);
    }
  };

  const fetchCurrentSelections = async () => {
    if (!profile) return;
    
    try {
      const { data, error } = await supabase
        .from('student_electives')
        .select('id, elective_id, is_locked, locked_at, admin_changed, admin_changed_at, electives(parent_subject_id)')
        .eq('student_id', profile.id);

      if (!error && data) {
        const selections: { [parentId: string]: string } = {};
        const submitted: { [parentId: string]: string } = {};
        const locked: { [key: string]: boolean } = {};
        const adminChangedMap: { [key: string]: boolean } = {};
        
        data.forEach((item: any) => {
          const parentId = item.electives?.parent_subject_id;
          if (parentId) {
            selections[parentId] = item.elective_id;
            submitted[parentId] = item.elective_id;
            locked[parentId] = item.is_locked || false;
            adminChangedMap[parentId] = item.admin_changed || false;
          }
        });
        
        setSelectedElectives(selections);
        setSubmittedSelections(submitted);
        setLockedSelections(locked);
        setAdminChanged(adminChangedMap);
      }
    } catch (error) {
      console.error('Error fetching selections:', error);
    }
  };

  const handleSelectElective = (parentId: string, electiveId: string) => {
    // Don't allow changes if selection is locked
    if (lockedSelections[parentId]) {
      alert('This selection is locked and cannot be changed.');
      return;
    }
    
    setSelectedElectives(prev => ({
      ...prev,
      [parentId]: electiveId
    }));
  };

  const handleSubmitSelection = async (parentId: string, isLocking: boolean = false) => {
    if (!profile || !selectedElectives[parentId]) return;
    
    // Check if already locked
    if (lockedSelections[parentId]) {
      alert('This selection is already locked and cannot be changed.');
      return;
    }
    
    setSaving(true);
    try {
      const electiveId = selectedElectives[parentId];
      
      if (isLocking) {
        // Use the RPC function with row-level locking
        const { data, error } = await supabase
          .rpc('lock_student_elective', {
            p_student_id: profile.id,
            p_elective_id: electiveId
          });
        
        if (error) throw error;
        
        if (!data.success) {
          throw new Error(data.error);
        }
        
        setSubmittedSelections(prev => ({
          ...prev,
          [parentId]: electiveId
        }));
        
        setLockedSelections(prev => ({
          ...prev,
          [parentId]: true
        }));
        
        alert(data.message || 'Elective selection locked successfully! You cannot change this selection anymore.');
      } else {
        // For non-locking saves, send a request to the backend selection endpoint.
        try {
          const resp = await api.post('/electives/select/', {
            student_id: profile.id,
            elective_id: electiveId,
          });

          setSubmittedSelections(prev => ({
            ...prev,
            [parentId]: electiveId
          }));

          alert(resp.data?.message || 'Elective selection saved successfully!');
        } catch (e: any) {
          const status = e?.response?.status;
          const serverMsg = e?.response?.data?.message || e?.response?.data?.detail || e?.message;
          if (status === 400 || status === 409) {
            // Show backend message (e.g., 'Seats full') directly to the user
            alert(serverMsg || 'Seats full');
          } else {
            throw e;
          }
        }
      }
      
      // Refresh electives to get updated seat counts
      if (studentYear === 1) {
        fetchElectives(null, profile.department, 1);
      } else if (studentGroup && profile.department) {
        fetchElectives(studentGroup, profile.department, studentYear || undefined);
      }
    } catch (error: any) {
      console.error('Error saving selection:', error);
      alert('Failed to save selection: ' + error.message);
    } finally {
      setSaving(false);
    }
  };

  // Group electives by parent subject
  const groupedElectives: GroupedElectives = electives.reduce((acc, elective) => {
    const parentId = elective.parent_subject_id;
    if (!acc[parentId]) {
      acc[parentId] = {
        parent: elective.parent_subject || { name: 'Unknown', subject_code: '' },
        electives: []
      };
    }
    acc[parentId].electives.push(elective);
    return acc;
  }, {} as GroupedElectives);

  return (
    <DashboardLayout sidebarItems={sidebarItems}>
      <div className="max-w-5xl mx-auto">
        <div className="flex justify-between items-center mb-6">
          <div>
            <h2 className="text-2xl font-bold text-gray-800">My Electives</h2>
            <p className="text-sm text-slate-600 mt-1">
              Select one elective from each group • Group: <span className="font-semibold text-blue-600">{studentGroup || 'N/A'}</span> • 
              Dept: <span className="font-semibold">{profile?.department}</span> • 
              Year: <span className="font-semibold">{studentYear || 'N/A'}</span>
            </p>
          </div>
        </div>

        {loading ? (
          <div className="text-center py-12">
            <div className="inline-block h-8 w-8 animate-spin rounded-full border-4 border-solid border-blue-600 border-r-transparent"></div>
            <p className="mt-4 text-slate-600">Loading electives...</p>
          </div>
        ) : (!studentGroup && studentYear !== 1) ? (
          <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-6 text-center">
            <p className="text-yellow-800 font-semibold mb-2">Your department is not assigned to any elective group.</p>
            <p className="text-sm text-yellow-700">Department: {profile?.department}</p>
          </div>
        ) : Object.keys(groupedElectives).length === 0 ? (
          <div className="bg-slate-50 border border-slate-200 rounded-lg p-6">
            <p className="text-slate-800 font-semibold mb-3 text-center">No active electives available</p>
            <div className="text-sm text-slate-600 space-y-1">
              <p>• Group: <strong>{studentGroup}</strong></p>
              <p>• Department: <strong>{profile?.department}</strong></p>
              <p>• Year: <strong>{profile?.year || 'Not set'}</strong></p>
              <p className="mt-3 text-slate-500 italic">
                The IQAC HOD may not have activated electives for your department yet, or electives may be created for a different year.
              </p>
            </div>
          </div>
        ) : (
          <div className="space-y-6">
            {Object.entries(groupedElectives).map(([parentId, group]) => {
              const isSubmitted = !!submittedSelections[parentId];
              const isLocked = lockedSelections[parentId] || false;
              const selectedId = selectedElectives[parentId];
              
              return (
                <div key={parentId} className="bg-white rounded-lg border border-slate-200 overflow-hidden shadow-sm">
                  {/* Parent Subject Header */}
                  <div className="bg-gradient-to-r from-blue-50 to-indigo-50 px-6 py-4 border-b border-slate-200">
                    <div className="flex items-center justify-between">
                      <div>
                        <h3 className="text-lg font-bold text-slate-800">
                          {group.parent.name}
                        </h3>
                        <p className="text-sm text-slate-600 mt-1">
                          Code: {group.parent.subject_code} • Select ONE elective
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        {isLocked && (
                          <div className="flex items-center gap-2 px-3 py-1 bg-green-100 text-green-700 rounded-full text-sm font-semibold">
                            <CheckCircle className="h-4 w-4" />
                            Your Selected Course
                          </div>
                        )}
                        {adminChanged[parentId] && (
                          <div className="flex items-center gap-2 px-3 py-1 bg-amber-100 text-amber-700 rounded-full text-sm font-semibold">
                            ⚠️ Changed by IQAC HOD
                          </div>
                        )}
                        {isSubmitted && !isLocked && (
                          <div className="flex items-center gap-2 px-3 py-1 bg-blue-100 text-blue-700 rounded-full text-sm font-semibold">
                            💾 Saved
                          </div>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Electives List */}
                  <div className="p-6">
                    <div className="space-y-3">
                      {group.electives.map((elective) => {
                        const isFull = elective.seat_count !== null && elective.seats_filled >= elective.seat_count;
                        const isCurrentSelection = selectedId === elective.id;
                        // Do not block selection client-side when seats appear full; rely on backend enforcement
                        const canSelect = true;
                        
                        return (
                          <label
                            key={elective.id}
                            className={`flex items-start gap-4 p-4 border-2 rounded-lg transition-all ${
                              isLocked && isCurrentSelection
                                ? 'border-green-500 bg-green-50 cursor-not-allowed'
                                : isLocked
                                ? 'opacity-60 cursor-not-allowed'
                                : 'cursor-pointer'
                            } ${
                              !isLocked && isCurrentSelection
                                ? 'border-blue-500 bg-blue-50'
                                : isFull
                                ? 'border-red-200 bg-red-50'
                                : 'border-slate-200 hover:border-blue-300 hover:bg-slate-50'
                            }`}
                          >
                            <input
                              type="radio"
                              name={`elective-${parentId}`}
                              value={elective.id}
                              checked={isCurrentSelection}
                              onChange={() => handleSelectElective(parentId, elective.id)}
                              disabled={isLocked}
                              className="mt-1 h-5 w-5 text-blue-600 focus:ring-blue-500 disabled:opacity-50"
                            />
                            <div className="flex-1">
                              <div className="flex items-center gap-3 mb-2 flex-wrap">
                                <h4 className="font-semibold text-slate-800">
                                  {elective.sub_name}
                                </h4>
                                <span className="px-2 py-1 bg-slate-100 text-slate-700 text-xs font-medium rounded">
                                  {elective.course_code}
                                </span>
                                {isLocked && isCurrentSelection && (
                                  <span className="px-2 py-1 bg-green-600 text-white text-xs font-bold rounded">
                                    ✓ SELECTED
                                  </span>
                                )}
                                {isFull && !isCurrentSelection && (
                                  <span className="px-2 py-1 bg-red-100 text-red-700 text-xs font-bold rounded">
                                    FULL
                                  </span>
                                )}
                              </div>
                              <div className="grid grid-cols-2 gap-3 text-sm text-slate-600">
                                <div>
                                  <span className="font-medium">Staff:</span> {elective.staff?.name || 'TBA'}
                                </div>
                                <div>
                                  <span className="font-medium">Seats:</span>{' '}
                                  {elective.seat_count !== null ? (
                                    <span className={isFull ? 'text-red-600 font-semibold' : ''}>
                                      {elective.seat_count - elective.seats_filled}/{elective.seat_count}
                                    </span>
                                  ) : (
                                    'Unlimited'
                                  )}
                                </div>
                              </div>
                            </div>
                          </label>
                        );
                      })}
                    </div>

                    {/* Action Buttons */}
                    <div className="mt-4 flex justify-end gap-3">
                      {!isLocked && (
                        <button
                          onClick={() => {
                            if (window.confirm('Are you sure you want to save and lock this selection? You will NOT be able to change it after locking.')) {
                              handleSubmitSelection(parentId, true);
                            }
                          }}
                          disabled={!selectedId || saving}
                          className="px-6 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 focus:ring-4 focus:ring-green-200 font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          {saving ? 'Saving...' : 'LOCK'}
                        </button>
                      )}
                      {isLocked && (
                        <div className="text-sm text-slate-600 italic">
                          Your selection is locked and cannot be changed.
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}
