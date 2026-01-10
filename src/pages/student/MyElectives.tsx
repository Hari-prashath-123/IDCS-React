import { useEffect, useState } from 'react';
import DashboardLayout from '../../components/DashboardLayout';
import { BookOpen, Home, CalendarDays, CheckCircle } from 'lucide-react';
import api from '../../lib/api';
import { useAuth } from '../../contexts/AuthContext';
import { toast } from 'react-hot-toast';

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
  seats_available: number | null;
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
    const fetchProfileAndElectives = async () => {
      try {
        // Fetch student profile from Django
        const resp = await api.get('/auth/users/me/');
        const user = resp.data;
        setStudentYear(user.year);
        // Determine group
        const dept = user.department;
        let group = "";
        for (const [groupKey, depts] of Object.entries(GROUP_MAPPING)) {
          if (depts.includes(dept)) {
            group = groupKey;
            break;
          }
        }
        setStudentGroup(group);
        // Fetch electives and selections
        if (user.year === 1) {
          fetchElectives(null, dept, 1);
        } else if (group) {
          fetchElectives(group, dept, user.year);
        }
        fetchCurrentSelections();
      } catch (error) {
        setStudentYear(null);
        setElectives([]);
      }
    };
    fetchProfileAndElectives();
  }, [profile]);

  // No polling needed; backend enforces seat logic and state

  const fetchElectives = async (group: string | null, department: string, year?: number) => {
    setLoading(true);
    try {
      // Compose params for API
      const params: any = { is_active: true };
      if (year) params.year = year;
      if (group) params.group = group;
      if (department) params.department = department;
      // GET /electives/?year=...&group=...&department=...
      const resp = await api.get('/electives/', { params });
      setElectives(resp.data || []);
    } catch (error) {
      setElectives([]);
    } finally {
      setLoading(false);
    }
  };

  const fetchCurrentSelections = async () => {
    try {
      const resp = await api.get('/student-electives/');
      const data = resp.data || [];
      const selections: { [parentId: string]: string } = {};
      const submitted: { [parentId: string]: string } = {};
      const locked: { [key: string]: boolean } = {};
      const adminChangedMap: { [key: string]: boolean } = {};
      data.forEach((item: any) => {
        const parentId = item.parent_subject_id;
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
    } catch (error) {
      setSelectedElectives({});
      setSubmittedSelections({});
      setLockedSelections({});
      setAdminChanged({});
    }
  };

  const handleSelectElective = (parentId: string, electiveId: string) => {
    if (lockedSelections[parentId]) {
      toast.error('This selection is locked and cannot be changed.');
      return;
    }
    setSelectedElectives(prev => ({
      ...prev,
      [parentId]: electiveId
    }));
  };

  const handleSubmitSelection = async (parentId: string, isLocking: boolean = false) => {
    if (!selectedElectives[parentId]) return;
    if (lockedSelections[parentId]) {
      toast.error('This selection is already locked and cannot be changed.');
      return;
    }
    setSaving(true);
    try {
      const electiveId = selectedElectives[parentId];
      try {
        await api.post(`/electives/${electiveId}/select/`, isLocking ? { lock: true } : {});
        setSubmittedSelections(prev => ({ ...prev, [parentId]: electiveId }));
        if (isLocking) setLockedSelections(prev => ({ ...prev, [parentId]: true }));
        toast.success(isLocking ? 'Elective selection locked!' : 'Elective selection saved!');
      } catch (e: any) {
        const status = e?.response?.status;
        if (status === 400) {
          toast.error('Seats are full');
        } else {
          toast.error('Failed to save selection');
        }
      }
      // Refresh electives to get updated seat counts
      if (studentYear === 1) {
        fetchElectives(null, profile?.department, 1);
      } else if (studentGroup && profile?.department) {
        fetchElectives(studentGroup, profile?.department, studentYear || undefined);
      }
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
