import { useEffect, useState } from 'react';
import { RefreshCw, X } from 'lucide-react';
import DashboardLayout from '../../components/DashboardLayout';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';

interface Student {
  id: string;
  reg_no: string;
  roll_no: string;
  year: number;
  section: string;
  mentor_id: string | null;
  profiles?: any;
  profile?: { name?: string; department?: string } | null;
}

export default function ManageMentees() {
  const { profile } = useAuth();
  const [students, setStudents] = useState<Student[]>([]);
  const [staffMembers, setStaffMembers] = useState<any[]>([]);
  const [myStaff, setMyStaff] = useState<any | null>(null);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [availableStudents, setAvailableStudents] = useState<Student[]>([]);
  const [selectedStaff, setSelectedStaff] = useState<any | null>(null);

  useEffect(() => {
    if (profile) fetchStudents();
    if (profile) fetchStaffMembers();
  }, [profile]);

  const fetchStudents = async (): Promise<Student[]> => {
    try {
      setLoading(true);
      // Fetch students for this department directly from students table
      // Fetch students and include the joined profile row to avoid a second large .in(...) request
      const { data: studentsData, error: studentsError } = await supabase
        .from('students')
        .select(`
          id,
          reg_no,
          roll_no,
          year,
          section,
          mentor_id,
          department,
          profiles!students_id_fkey (
            id,
            name,
            department
          )
        `)
        .eq('department', profile?.department)
        .order('roll_no');

      if (studentsError) throw studentsError;

      const transformed = (studentsData || []).map((s: any) => ({
        ...s,
        profile: Array.isArray(s.profiles) ? s.profiles[0] : s.profiles || { name: undefined, department: s.department }
      }));

      const studentsCount = (studentsData || []).length;
      const profilesCount = transformed.filter((t: any) => t.profile && t.profile.name).length;
      console.debug('Staff.ManageMentees fetched students', {
        studentsCount,
        profilesCount,
        sampleStudents: (studentsData || []).slice(0,5).map((s:any)=>({ id: s.id, mentor_id: s.mentor_id })),
        sampleProfiles: transformed.slice(0,5).map((t:any)=>({ id: t.profile?.id, name: t.profile?.name }))
      });

      setStudents(transformed as Student[]);
      return transformed as Student[];
    } catch (err) {
      console.error('Failed to fetch students for ManageMentees:', err);
      return [] as Student[];
    } finally {
      setLoading(false);
    }
  };

  const computeAvailableForStaff = (staff: any, studentsArr: Student[]) => {
    if (!staff) return [] as Student[];
    // If current user is advisor, show only advisor's class unassigned students
    if (myStaff && myStaff.staff_role === 'advisor' && myStaff.year != null && myStaff.section) {
      return studentsArr.filter(s => s.year === myStaff.year && s.section === myStaff.section && !s.mentor_id);
    }
    // Otherwise show selected staff's class unassigned students if available
    if (staff.year != null && staff.section) {
      return studentsArr.filter(s => s.year === staff.year && s.section === staff.section && !s.mentor_id);
    }
    return studentsArr.filter(s => !s.mentor_id);
  };

  const fetchStaffMembers = async () => {
    try {
      const { data: profiles, error: profilesError } = await supabase
        .from('profiles')
        .select('id, name, email, role, department')
        .eq('department', profile?.department)
        .in('role', ['staff','ahod','hod','advisor','mentor']);
      if (profilesError) throw profilesError;

      const staffIds = (profiles || []).map((p: any) => p.id);
      if (staffIds.length === 0) {
        setStaffMembers([]);
        return;
      }

      const { data: staffData, error: staffError } = await supabase
        .from('staff')
        .select('id, staff_id, staff_role, year, section')
        .in('id', staffIds);
      if (staffError) throw staffError;

      const staffById = new Map((staffData || []).map((s: any) => [s.id, s]));
      const combined = (profiles || []).map((p: any) => ({
        ...staffById.get(p.id),
        id: p.id,
        profile: { name: p.name, email: p.email },
        staff_role: (staffById.get(p.id) || {}).staff_role || p.role || 'staff'
      }));
      setStaffMembers(combined as any[]);
      // store the current user's staff row if present
      try {
        const me = (combined || []).find((c: any) => c.id === profile?.id) || null;
        setMyStaff(me);
      } catch (err) {
        // ignore
      }
    } catch (err) {
      console.error('Failed to fetch staff members for ManageMentees:', err);
    }
  };

  const openAssignModal = (staff: any) => {
    // Target staff is `staff` (the row we clicked). Available students depend on current user:
    // - If current user is an advisor with year/section, show the advisor's class students so the advisor can assign them to `staff`.
    // - Otherwise, if the clicked staff has year/section, show that staff's class students.
    // - Fallback: show unassigned students in the department.
    setSelectedStaff(staff);
    let available: Student[] = [];
    if (myStaff && myStaff.staff_role === 'advisor' && myStaff.year != null && myStaff.section) {
      // advisor should see only their class students who are not yet assigned
      available = students.filter(s => s.year === myStaff.year && s.section === myStaff.section && !s.mentor_id);
    } else if (staff && staff.year != null && staff.section) {
      // when not advisor, show selected staff's class students who are unassigned
      available = students.filter(s => s.year === staff.year && s.section === staff.section && !s.mentor_id);
    } else {
      available = students.filter(s => !s.mentor_id);
    }
    setAvailableStudents(available);
    setShowModal(true);
  };

  const handleAssign = async (studentId: string, staffId?: string) => {
    const mentorId = staffId || selectedStaff?.id || profile?.id;
    if (!mentorId) return alert('No mentor selected');
    try {
      console.log('Assigning student', { studentId, mentorId });
      const { data, error } = await supabase.from('students').update({ mentor_id: mentorId }).eq('id', studentId).select();
      if (error) {
        console.error('Assign update error', error);
        alert('Failed to assign: ' + (error.message || JSON.stringify(error)));
        return;
      }
      if (!data || data.length === 0) {
        console.warn('Assign returned no rows', { data });
        alert('Assignment did not return any rows. Check permissions or RLS policies.');
      }
      // Refresh students and recompute available list immediately using fresh data
      const refreshed = await fetchStudents();
      if (selectedStaff) {
        const available = computeAvailableForStaff(selectedStaff, refreshed);
        setAvailableStudents(available);
      }
      alert('Assigned successfully');
    } catch (err: any) {
      console.error('Assign failed', err);
      alert('Failed to assign: ' + (err?.message || String(err)));
    }
  };

  const handleRemove = async (studentId: string) => {
    if (!confirm('Remove this mentee assignment?')) return;
    try {
      const { error } = await supabase.from('students').update({ mentor_id: null }).eq('id', studentId);
      if (error) throw error;
      const refreshed = await fetchStudents();
      if (selectedStaff) {
        const available = computeAvailableForStaff(selectedStaff, refreshed);
        setAvailableStudents(available);
      }
      alert('Removed successfully');
    } catch (err: any) {
      console.error('Remove failed', err);
      alert('Failed to remove: ' + (err?.message || String(err)));
    }
  };

  const getStaffMentees = (staffId: string) => {
    const staffRow = staffMembers.find((st: any) => st.id === staffId);
    const staffIdentifier = staffRow?.staff_id;
    let mentees = students.filter(s => s.mentor_id === staffId || (staffIdentifier && s.mentor_id === staffIdentifier));
    if (myStaff && myStaff.staff_role === 'advisor' && myStaff.year != null && myStaff.section) {
      mentees = mentees.filter(s => s.year === myStaff.year && s.section === myStaff.section);
    }
    console.debug('Staff.getStaffMentees', { staffId, staffIdentifier, menteeCount: mentees.length, menteeSample: mentees.slice(0,5).map(m=>({ id: m.id, name: m.profile?.name, mentor_id: m.mentor_id })) });
    return mentees;
  };

  return (
    <DashboardLayout>
      <div className="p-6">
        <div className="mb-6 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div>
            <h1 className="text-xl sm:text-2xl font-bold text-gray-900">Manage Mentees (Department: {profile?.department})</h1>
            <p className="text-gray-600 mt-1 text-sm">Select a staff in your department to manage their mentees. Advisors will only see students from their assigned class.</p>
          </div>
          <div className="flex gap-2">
            <button onClick={() => { fetchStudents(); fetchStaffMembers(); }} disabled={loading} className="inline-flex items-center gap-2 px-3 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700 disabled:opacity-50">
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
              Refresh
            </button>
          </div>
        </div>

        {/* Staff list */}
        <div className="hidden sm:block bg-white rounded-lg shadow overflow-hidden mb-6">
          <table className="min-w-full divide-y divide-gray-200 text-sm">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Staff Name</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Email</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Role</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Class</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Mentees</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Actions</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {staffMembers.map((st) => {
                const mentees = getStaffMentees(st.id);
                return (
                  <tr key={st.id} className="hover:bg-gray-50">
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">{st.profile?.name}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{st.profile?.email}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{st.staff_role}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{st.year ? `${st.year} / ${st.section || '-'}
                    ` : '-'}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{mentees.length}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm">
                      <button onClick={() => openAssignModal(st)} className="text-blue-600 hover:text-blue-800 font-medium mr-3">Manage Mentees</button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Mobile staff cards */}
        <div className="sm:hidden space-y-3 mb-6">
          {staffMembers.map((st) => {
            const mentees = getStaffMentees(st.id);
            return (
              <div key={st.id} className="bg-white rounded-lg shadow border border-gray-200 p-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="text-sm font-semibold text-gray-900 truncate">{st.profile?.name}</div>
                    <div className="text-xs text-gray-600 truncate">{st.profile?.email}</div>
                    <div className="mt-1 text-[11px] text-gray-600 flex flex-wrap gap-x-2 gap-y-0.5">
                      <span className="capitalize">{st.staff_role}</span>
                      <span>•</span>
                      <span>Mentees: {mentees.length}</span>
                    </div>
                  </div>
                  <div className="flex-shrink-0">
                    <button onClick={() => openAssignModal(st)} className="px-3 py-1.5 text-xs bg-blue-600 text-white rounded hover:bg-blue-700">Manage</button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* Assign Modal */}
        {showModal && selectedStaff && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
            <div className="bg-white rounded-none sm:rounded-lg sm:p-6 p-4 w-full mx-0 sm:mx-4 h-[100vh] sm:h-auto sm:max-w-6xl sm:max-h-[90vh] overflow-y-auto flex flex-col">
              <div className="flex justify-between items-center pb-3 sm:mb-4 sm:pb-0 sticky top-0 bg-white border-b sm:border-none">
                <h2 className="text-xl font-bold">Manage Mentees for {selectedStaff.profile?.name}</h2>
                <button onClick={() => { setShowModal(false); setSelectedStaff(null); }} className="p-1 rounded text-gray-500 hover:text-gray-700"><X className="w-5 h-5" /></button>
              </div>

              {/* Current Mentees */}
              <div className="mb-6">
                <h3 className="text-lg font-semibold mb-3">Current Mentees</h3>
                {getStaffMentees(selectedStaff.id).length === 0 ? (
                  <p className="text-gray-500 text-sm">No mentees assigned yet.</p>
                ) : (
                  <>
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
                              <td className="px-4 py-2 whitespace-nowrap"><button onClick={() => handleRemove(student.id)} className="text-red-600 hover:text-red-800 font-medium">Remove</button></td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>

                    <div className="sm:hidden space-y-2">
                      {getStaffMentees(selectedStaff.id).map((student) => (
                        <div key={student.id} className="border border-gray-200 rounded p-3">
                          <div className="flex justify-between items-start gap-2">
                            <div className="min-w-0">
                              <div className="text-sm font-medium text-gray-900 truncate">{student.profile?.name}</div>
                              <div className="text-xs text-gray-600 mt-0.5">Roll: {student.roll_no}</div>
                              <div className="text-xs text-gray-600 mt-0.5">Year: {student.year} • Section: {student.section}</div>
                            </div>
                            <button onClick={() => handleRemove(student.id)} className="text-xs px-2 py-1 rounded bg-red-50 text-red-700 hover:bg-red-100">Remove</button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </>
                )}
              </div>

              {/* Available Students (advisor's class or fallback) */}
              <div>
                <h3 className="text-lg font-semibold mb-3">Available Students</h3>
                {availableStudents.filter(s => !s.mentor_id).length === 0 ? (
                  <p className="text-gray-500 text-sm">{myStaff && myStaff.year ? 'No students in your class to assign.' : 'No available students.'}</p>
                ) : (
                  <>
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
                              <td className="px-4 py-2 whitespace-nowrap"><button onClick={() => handleAssign(student.id, selectedStaff.id)} className="text-blue-600 hover:text-blue-800 font-medium">Assign</button></td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>

                    <div className="sm:hidden space-y-2">
                      {availableStudents.filter(s => !s.mentor_id).map((student) => (
                        <div key={student.id} className="border border-gray-200 rounded p-3">
                          <div className="flex justify-between items-start gap-2">
                            <div className="min-w-0">
                              <div className="text-sm font-medium text-gray-900 truncate">{student.profile?.name}</div>
                              <div className="text-xs text-gray-600 mt-0.5">Roll: {student.roll_no}</div>
                              <div className="text-xs text-gray-600 mt-0.5">Year: {student.year} • Section: {student.section}</div>
                            </div>
                            <button onClick={() => handleAssign(student.id, selectedStaff.id)} className="text-xs px-2 py-1 rounded bg-blue-600 text-white hover:bg-blue-700">Assign</button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </>
                )}
              </div>

              <div className="flex justify-end mt-6">
                <button onClick={() => { setShowModal(false); setSelectedStaff(null); }} className="px-4 py-2 border rounded hover:bg-gray-50">Close</button>
              </div>
            </div>
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}
