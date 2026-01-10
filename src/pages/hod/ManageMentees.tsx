import { useEffect, useState } from 'react';
import { FileText, Calendar, CreditCard, Award, Home, Users, RefreshCw, X } from 'lucide-react';
import DashboardLayout from '../../components/DashboardLayout';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';

interface Staff {
  id: string;
  staff_id: string;
  staff_role: string;
  profile: {
    name: string;
    email: string;
  } | null;
}

interface Student {
  id: string;
  reg_no: string;
  roll_no: string;
  year: number;
  section: string;
  mentor_id: string | null;
  profile: {
    name: string;
    department: string;
  } | null;
}

export default function ManageMentees() {
  const { user, profile } = useAuth();
  const [staffMembers, setStaffMembers] = useState<Staff[]>([]);
  const [students, setStudents] = useState<Student[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAssignModal, setShowAssignModal] = useState(false);
  const [selectedStaff, setSelectedStaff] = useState<Staff | null>(null);
  const [availableStudents, setAvailableStudents] = useState<Student[]>([]);

  useEffect(() => {
    if (user) {
      fetchStaffMembers();
      fetchStudents();
    }
  }, [user, profile]);

  // Update available students when students data changes or modal opens
  useEffect(() => {
    if (selectedStaff && showAssignModal) {
      const available = students.filter(s => {
        if (!s.mentor_id) return true;
        return s.mentor_id === selectedStaff.id || s.mentor_id === selectedStaff.staff_id;
      });
      setAvailableStudents(available);
    }
  }, [students, selectedStaff, showAssignModal]);

  const fetchStaffMembers = async () => {
    try {
      setLoading(true);

      if (!profile?.department) {
        console.warn('HOD profile missing department');
        setStaffMembers([]);
        return;
      }
      
      // Get all staff in the department (including HOD, AHOD, advisors, mentors, lecturers)
      const { data: profiles, error: profilesError } = await supabase
        .from('profiles')
        .select('id, name, email, role, department')
        .eq('department', profile?.department)
        .in('role', ['staff', 'ahod', 'hod', 'advisor', 'mentor']);

      if (profilesError) throw profilesError;

      const staffIds = profiles?.map(p => p.id) || [];

      if (staffIds.length === 0) {
        setStaffMembers([]);
        return;
      }

      // Get staff details from staff table for the ids we found
      const { data: staffData, error: staffError } = await supabase
        .from('staff')
        .select('id, staff_id, staff_role')
        .in('id', staffIds);

      if (staffError) throw staffError;

      // Build a map of staff rows by id for quick lookup
      const staffById = new Map((staffData || []).map((s: any) => [s.id, s]));

      // Combine profiles and staff rows. If a profile exists but no staff row (common for AHOD/HOD stored only in profiles),
      // create a lightweight entry so AHOD/HOD appear in the list and can be managed.
      const combined = (profiles || []).map((p: any) => {
        const staffRow = staffById.get(p.id);
        if (staffRow) {
          return {
            ...staffRow,
            profile: { name: p.name, email: p.email }
          };
        }
        // no staff row - create a placeholder using profile.role as staff_role
        return {
          id: p.id,
          staff_id: '',
          staff_role: p.role || 'staff',
          profile: { name: p.name, email: p.email }
        } as any;
      });

      setStaffMembers(combined);
    } catch (error) {
      console.error('Error fetching staff members:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchStudents = async () => {
    try {
      setLoading(true);
      if (!profile?.department) {
        console.warn('HOD profile missing department');
        setStudents([]);
        return;
      }

      console.debug('HOD.fetchStudents start', { department: profile.department });

      const { data: studentsData, error: studentsError } = await supabase
        .from('students')
        .select('id, reg_no, roll_no, year, section, mentor_id, department')
        .eq('department', profile?.department)
        .order('roll_no');

      if (studentsError) throw studentsError;

      const studentIds = (studentsData || []).map((s: any) => s.id).filter(Boolean);
      let profilesData: any[] = [];
      if (studentIds.length > 0) {
        const { data: pd, error: pdErr } = await supabase.from('profiles').select('id, name, department').in('id', studentIds);
        if (pdErr) throw pdErr;
        profilesData = pd || [];
      }

      const profilesMap = new Map((profilesData || []).map((p: any) => [p.id, p]));

      const transformedData = (studentsData || []).map((s: any) => ({
        ...s,
        profile: profilesMap.get(s.id) || { name: undefined, department: s.department }
      }));

      console.debug('HOD.fetchStudents fetched', { studentsCount: (studentsData||[]).length, profilesCount: (profilesData||[]).length });

      setStudents(transformedData as any);
    } catch (error) {
      console.error('Error fetching students:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleAssignMentee = (staff: Staff) => {
    if (!profile?.department) {
      alert('Your profile is missing department information. Please contact an administrator.');
      return;
    }
    setSelectedStaff(staff);
    
    // Get students without a mentor or already assigned to this staff
    const available = students.filter(s => {
      if (!s.mentor_id) return true;
      return s.mentor_id === staff.id || s.mentor_id === staff.staff_id;
    });
    setAvailableStudents(available);
    setShowAssignModal(true);
  };

  const handleAddMentee = async (studentId: string) => {
    if (!selectedStaff) return;

    if (!profile?.department) {
      alert('Your profile is missing department information. Please contact an administrator.');
      return;
    }

    try {
      console.log('Assigning mentee:', { studentId, mentorId: selectedStaff.id });
      // Also set AHOD for the student based on department (if present)
      let ahodId = null;
      try {
        const { data: ahodProfiles, error: ahodErr } = await supabase
          .from('profiles')
          .select('id')
          .eq('department', profile?.department)
          .eq('role', 'ahod');
        if (ahodErr) throw ahodErr;
        if (ahodProfiles && ahodProfiles.length > 0) ahodId = ahodProfiles[0].id;
      } catch (e) {
        console.warn('Failed to lookup AHOD for department, continuing without ahod assignment', e);
      }

      const updatePayload: any = { mentor_id: selectedStaff.id };
      if (ahodId) updatePayload.ahod_id = ahodId;

      const { data, error } = await supabase
        .from('students')
        .update(updatePayload)
        .eq('id', studentId)
        .select();

      if (error) {
        console.error('Database error:', error);
        throw error;
      }

      console.log('Update result:', data);

      // Refresh the students data
      await fetchStudents();
      
      alert('Mentee assigned successfully');
    } catch (error: any) {
      console.error('Error assigning mentee:', error);
      alert('Failed to assign mentee: ' + error.message);
    }
  };

  const handleRemoveMentee = async (studentId: string) => {
    if (!confirm('Are you sure you want to remove this mentee assignment?')) return;

    try {
      console.log('Removing mentee:', { studentId });
      
      const { data, error } = await supabase
        .from('students')
        .update({ mentor_id: null })
        .eq('id', studentId)
        .select();

      if (error) {
        console.error('Database error:', error);
        throw error;
      }

      console.log('Remove result:', data);

      // Refresh the students data
      await fetchStudents();
      
      alert('Mentee assignment removed successfully');
    } catch (error: any) {
      console.error('Error removing mentee:', error);
      alert('Failed to remove mentee: ' + error.message);
    }
  };

  const getStaffMentees = (staffId: string) => {
    // staffId is the staff UUID; students.mentor_id may contain either that UUID
    // or the staff's `staff_id` identifier. Look up the staff row to check.
    const staffRow = staffMembers.find(s => s.id === staffId);
    const staffIdentifier = staffRow?.staff_id;
    return students.filter(s => s.mentor_id === staffId || (staffIdentifier && s.mentor_id === staffIdentifier));
  };

  const sidebarItems = [
    { label: 'Dashboard', path: '/hod-dashboard', icon: <Home className="h-5 w-5" /> },
    { label: 'OD Applications', path: '/hod/od', icon: <FileText className="h-5 w-5" /> },
    { label: 'Leave Applications', path: '/hod/leave', icon: <Calendar className="h-5 w-5" /> },
    { label: 'Gatepass Applications', path: '/hod/gatepass', icon: <CreditCard className="h-5 w-5" /> },
    { label: 'Bonafide Applications', path: '/hod/bonafide', icon: <Award className="h-5 w-5" /> },
    { label: 'My Mentees', path: '/hod/mentees', icon: <Users className="h-5 w-5" /> },
    { label: 'Manage Mentees', path: '/hod/manage-mentees', icon: <Users className="h-5 w-5" /> },
  ];

  return (
    <DashboardLayout sidebarItems={sidebarItems}>
      <div className="p-6">
        <div className="mb-6 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div>
            <h1 className="text-xl sm:text-2xl font-bold text-gray-900">Manage Mentee Assignments</h1>
            <p className="text-gray-600 mt-1 text-sm">
              Assign and manage mentees for all staff in {profile?.department}
            </p>
          </div>
          <button
            onClick={() => {
              fetchStaffMembers();
              fetchStudents();
            }}
            disabled={loading}
            className="inline-flex items-center gap-2 px-3 sm:px-4 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors self-start"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </button>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-12">
            <div className="text-gray-500">Loading staff members...</div>
          </div>
        ) : !profile?.department ? (
          <div className="flex items-center justify-center py-12">
            <div className="text-center">
              <div className="text-red-500 text-lg font-semibold mb-2">Department Not Set</div>
              <div className="text-gray-600">Your profile is missing department information. Please contact an administrator to set your department.</div>
            </div>
          </div>
        ) : (
          <>
            {/* Desktop/tablet table */}
            <div className="hidden sm:block bg-white rounded-lg shadow overflow-hidden">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Staff Name</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Email</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Role</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Mentees Count</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {staffMembers.map((staff) => {
                    const mentees = getStaffMentees(staff.id);
                    return (
                      <tr key={staff.id} className="hover:bg-gray-50">
                        <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">{staff.profile?.name}</td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{staff.profile?.email}</td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{staff.staff_role}</td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{mentees.length}</td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm">
                          <button onClick={() => handleAssignMentee(staff)} className="text-blue-600 hover:text-blue-800 font-medium mr-3">Manage Mentees</button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Mobile cards */}
            <div className="sm:hidden space-y-3">
              {staffMembers.map((staff) => {
                const mentees = getStaffMentees(staff.id);
                return (
                  <div key={staff.id} className="bg-white rounded-lg shadow border border-gray-200 p-3">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="text-sm font-semibold text-gray-900 truncate">{staff.profile?.name}</div>
                        <div className="text-xs text-gray-600 truncate">{staff.profile?.email}</div>
                        <div className="mt-1 text-[11px] text-gray-600 flex flex-wrap gap-x-2 gap-y-0.5">
                          <span className="capitalize">{staff.staff_role}</span>
                          <span>•</span>
                          <span>Mentees: {mentees.length}</span>
                        </div>
                      </div>
                      <div className="flex-shrink-0">
                        <button
                          onClick={() => handleAssignMentee(staff)}
                          className="px-3 py-1.5 text-xs bg-blue-600 text-white rounded hover:bg-blue-700"
                        >
                          Manage
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        )}
      </div>

      {/* Assign Mentee Modal */}
      {showAssignModal && selectedStaff && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-none sm:rounded-lg sm:p-6 p-4 w-full mx-0 sm:mx-4 h-[100vh] sm:h-auto sm:max-w-6xl sm:max-h-[90vh] overflow-y-auto flex flex-col">
            <div className="flex justify-between items-center pb-3 sm:mb-4 sm:pb-0 sticky top-0 bg-white border-b sm:border-none">
              <h2 className="text-xl font-bold">
                Manage Mentees for {selectedStaff.profile?.name}
              </h2>
              <button
                onClick={() => {
                  setShowAssignModal(false);
                  setSelectedStaff(null);
                }}
                className="p-1 rounded text-gray-500 hover:text-gray-700"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Current Mentees */}
            <div className="mb-6">
              <h3 className="text-lg font-semibold mb-3">Current Mentees</h3>
              {getStaffMentees(selectedStaff.id).length === 0 ? (
                <p className="text-gray-500 text-sm">No mentees assigned yet.</p>
              ) : (
                <>
                  {/* Desktop table */}
                  <div className="hidden sm:block overflow-x-auto mb-4">
                    <table className="min-w-full divide-y divide-gray-200 text-sm">
                      <thead className="bg-gray-50">
                        <tr>
                          <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Roll No</th>
                          <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Name</th>
                          <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Year</th>
                          <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Section</th>
                          <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Action</th>
                        </tr>
                      </thead>
                      <tbody className="bg-white divide-y divide-gray-200">
                        {getStaffMentees(selectedStaff.id).map((student) => (
                          <tr key={student.id} className="hover:bg-gray-50">
                            <td className="px-4 py-2 whitespace-nowrap">{student.roll_no}</td>
                            <td className="px-4 py-2 whitespace-nowrap">{student.profile?.name}</td>
                            <td className="px-4 py-2 whitespace-nowrap">{student.year}</td>
                            <td className="px-4 py-2 whitespace-nowrap">{student.section}</td>
                            <td className="px-4 py-2 whitespace-nowrap">
                              <button onClick={() => handleRemoveMentee(student.id)} className="text-red-600 hover:text-red-800 font-medium">Remove</button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  {/* Mobile list */}
                  <div className="sm:hidden space-y-2">
                    {getStaffMentees(selectedStaff.id).map((student) => (
                      <div key={student.id} className="border border-gray-200 rounded p-3">
                        <div className="flex justify-between items-start gap-2">
                          <div className="min-w-0">
                            <div className="text-sm font-medium text-gray-900 truncate">{student.profile?.name}</div>
                            <div className="text-xs text-gray-600 mt-0.5">Roll: {student.roll_no}</div>
                            <div className="text-xs text-gray-600 mt-0.5">Year: {student.year} • Section: {student.section}</div>
                          </div>
                          <button onClick={() => handleRemoveMentee(student.id)} className="text-xs px-2 py-1 rounded bg-red-50 text-red-700 hover:bg-red-100">Remove</button>
                        </div>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </div>

            {/* Available Students */}
            <div>
              <h3 className="text-lg font-semibold mb-3">Available Students</h3>
              {availableStudents.filter(s => !s.mentor_id).length === 0 ? (
                <p className="text-gray-500 text-sm">
                  All students in the department have been assigned mentors.
                </p>
              ) : (
                <>
                  {/* Desktop table */}
                  <div className="hidden sm:block overflow-x-auto">
                    <table className="min-w-full divide-y divide-gray-200 text-sm">
                      <thead className="bg-gray-50">
                        <tr>
                          <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Roll No</th>
                          <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Name</th>
                          <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Year</th>
                          <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Section</th>
                          <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Action</th>
                        </tr>
                      </thead>
                      <tbody className="bg-white divide-y divide-gray-200">
                        {availableStudents.filter(s => !s.mentor_id).map((student) => (
                          <tr key={student.id} className="hover:bg-gray-50">
                            <td className="px-4 py-2 whitespace-nowrap">{student.roll_no}</td>
                            <td className="px-4 py-2 whitespace-nowrap">{student.profile?.name}</td>
                            <td className="px-4 py-2 whitespace-nowrap">{student.year}</td>
                            <td className="px-4 py-2 whitespace-nowrap">{student.section}</td>
                            <td className="px-4 py-2 whitespace-nowrap">
                              <button onClick={() => handleAddMentee(student.id)} className="text-blue-600 hover:text-blue-800 font-medium">Assign</button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  {/* Mobile list */}
                  <div className="sm:hidden space-y-2">
                    {availableStudents.filter(s => !s.mentor_id).map((student) => (
                      <div key={student.id} className="border border-gray-200 rounded p-3">
                        <div className="flex justify-between items-start gap-2">
                          <div className="min-w-0">
                            <div className="text-sm font-medium text-gray-900 truncate">{student.profile?.name}</div>
                            <div className="text-xs text-gray-600 mt-0.5">Roll: {student.roll_no}</div>
                            <div className="text-xs text-gray-600 mt-0.5">Year: {student.year} • Section: {student.section}</div>
                          </div>
                          <button onClick={() => handleAddMentee(student.id)} className="text-xs px-2 py-1 rounded bg-blue-600 text-white hover:bg-blue-700">Assign</button>
                        </div>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </div>

            <div className="flex justify-end mt-6">
              <button
                onClick={() => {
                  setShowAssignModal(false);
                  setSelectedStaff(null);
                }}
                className="px-4 py-2 border rounded hover:bg-gray-50"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </DashboardLayout>
  );
}
