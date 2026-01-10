import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { FileText, Calendar, CreditCard, Award, Home, Users, RefreshCw, UserPlus, X, ClipboardCheck } from 'lucide-react';
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
  profile: {
    name: string;
    department: string;
  } | null;
}

export default function MyMentees() {
  const navigate = useNavigate();
  const { user, profile } = useAuth();
  const [mentees, setMentees] = useState<Student[]>([]);
  const [availableStudents, setAvailableStudents] = useState<Student[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddModal, setShowAddModal] = useState(false);
  const [staffRole, setStaffRole] = useState<string | null>(null);

  // Determine the base path based on the user role
  const getBasePath = () => {
    if (profile?.role === 'hod') return '/hod';
    if (profile?.role === 'ahod') return '/ahod';
    return '/staff';
  };

  const basePath = getBasePath();

  const isHOD = profile?.role === 'hod';
  const canManageMentees = isHOD;

  useEffect(() => {
    if (user) {
      fetchStaffRole();
      fetchMentees();
      if (canManageMentees) {
        fetchAvailableStudents();
      }
    }
  }, [user, canManageMentees]);

  const fetchStaffRole = async () => {
    try {
      const { data, error } = await supabase
        .from('staff')
        .select('staff_role')
        .eq('id', user?.id)
        .maybeSingle();

      if (error) throw error;
      setStaffRole(data?.staff_role || null);
    } catch (error) {
      console.error('Error fetching staff role:', error);
    }
  };

  const fetchMentees = async () => {
    try {
      setLoading(true);
      console.log('[MyMentees] Fetching mentees for user:', user?.id);
      
      const { data, error } = await supabase
        .from('students')
        .select(`
          id,
          reg_no,
          roll_no,
          year,
          section,
          mentor_id,
          profiles!students_id_fkey (
            name,
            department
          )
        `)
        .eq('mentor_id', user?.id)
        .order('roll_no');

      if (error) throw error;
      
      console.log('[MyMentees] Mentees data:', data);
      
      const transformedData = (data || []).map(item => ({
        ...item,
        profile: Array.isArray(item.profiles) ? item.profiles[0] : item.profiles
      }));
      
      setMentees(transformedData as any);
    } catch (error) {
      console.error('[MyMentees] Error fetching mentees:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchAvailableStudents = async () => {
    try {
      if (!profile?.department) return;

      // Get all students in the same department without a mentor or with current user as mentor
      const { data, error } = await supabase
        .from('students')
        .select(`
          id,
          reg_no,
          roll_no,
          year,
          section,
          mentor_id,
          profiles!students_id_fkey (
            name,
            department
          )
        `)
        .order('roll_no');

      if (error) throw error;

      // Filter by department and no mentor (client-side filtering)
      const filteredData = (data || []).filter(item => {
        const studentProfile = Array.isArray(item.profiles) ? item.profiles[0] : item.profiles;
        return studentProfile?.department === profile.department && !item.mentor_id;
      });

      const transformedData = filteredData.map(item => ({
        ...item,
        profile: Array.isArray(item.profiles) ? item.profiles[0] : item.profiles
      }));

      setAvailableStudents(transformedData as any);
    } catch (error) {
      console.error('[MyMentees] Error fetching available students:', error);
    }
  };

  const handleAddMentee = async (studentId: string) => {
    try {
      const { error } = await supabase
        .from('students')
        .update({ mentor_id: user?.id })
        .eq('id', studentId);

      if (error) throw error;

      alert('Mentee added successfully');
      fetchMentees();
      fetchAvailableStudents();
    } catch (error: any) {
      console.error('Error adding mentee:', error);
      alert('Failed to add mentee: ' + error.message);
    }
  };

  const handleRemoveMentee = async (studentId: string) => {
    if (!confirm('Are you sure you want to remove this mentee?')) return;

    try {
      const { error } = await supabase
        .from('students')
        .update({ mentor_id: null })
        .eq('id', studentId);

      if (error) throw error;

      alert('Mentee removed successfully');
      fetchMentees();
      fetchAvailableStudents();
    } catch (error: any) {
      console.error('Error removing mentee:', error);
      alert('Failed to remove mentee: ' + error.message);
    }
  };

  const sidebarItems = [
    { label: 'Dashboard', path: `${basePath === '/staff' ? '/staff-dashboard' : basePath === '/hod' ? '/hod-dashboard' : '/ahod-dashboard'}`, icon: <Home className="w-5 h-5" /> },
    { label: 'OD Applications', path: `${basePath}/od`, icon: <FileText className="w-5 h-5" /> },
    { label: 'Leave Applications', path: `${basePath}/leave`, icon: <Calendar className="w-5 h-5" /> },
    { label: 'Gatepass Applications', path: `${basePath}/gatepass`, icon: <CreditCard className="w-5 h-5" /> },
    { label: 'Bonafide Applications', path: `${basePath}/bonafide`, icon: <Award className="w-5 h-5" /> },
    { label: 'Attendance', path: '/staff/attendance', icon: <ClipboardCheck className="w-5 h-5" /> },
    { label: 'My Mentees', path: `${basePath}/mentees`, icon: <Users className="w-5 h-5" /> },
    ...(staffRole === 'advisor' && basePath === '/staff' ? [{ label: 'My Students', path: '/staff/students', icon: <Users className="w-5 h-5" /> }] : []),
  ];

  return (
    <DashboardLayout sidebarItems={sidebarItems}>
      <div className="p-4 sm:p-6">
        <div className="mb-4 sm:mb-6 flex flex-col sm:flex-row sm:justify-between sm:items-center gap-4">
          <div>
            <h1 className="text-xl sm:text-2xl font-bold text-gray-900">My Mentees</h1>
            <p className="text-sm sm:text-base text-gray-600 mt-1">
              {canManageMentees 
                ? `Manage mentee assignments for ${profile?.department}` 
                : `View your mentee students from ${profile?.department}`}
            </p>
          </div>
          <div className="flex gap-2 sm:gap-3">
            <button
              onClick={() => {
                fetchMentees();
                if (canManageMentees) fetchAvailableStudents();
              }}
              disabled={loading}
              className="flex items-center justify-center gap-2 px-3 sm:px-4 py-2 bg-gray-600 text-white text-sm rounded-lg hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex-1 sm:flex-none"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
              <span className="sm:inline">Refresh</span>
            </button>
            {canManageMentees && (
              <button
                onClick={() => setShowAddModal(true)}
                className="flex items-center justify-center gap-2 px-3 sm:px-4 py-2 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700 transition-colors flex-1 sm:flex-none"
              >
                <UserPlus className="w-4 h-4" />
                <span>Add</span>
              </button>
            )}
          </div>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-12">
            <div className="text-gray-500 text-sm sm:text-base">Loading mentees...</div>
          </div>
        ) : mentees.length === 0 ? (
          <div className="bg-gray-50 border border-gray-200 rounded-lg p-6 sm:p-8 text-center">
            <Users className="w-10 h-10 sm:w-12 sm:h-12 text-gray-400 mx-auto mb-3" />
            <p className="text-gray-600 text-sm sm:text-base">
              {canManageMentees 
                ? 'No mentees assigned yet.' 
                : 'You have no mentees assigned to you yet.'}
            </p>
            {canManageMentees && (
              <button
                onClick={() => setShowAddModal(true)}
                className="mt-4 text-blue-600 hover:text-blue-800 font-medium text-sm sm:text-base"
              >
                Add your first mentee
              </button>
            )}
          </div>
        ) : (
          <>
            {/* Desktop Table View */}
            <div className="hidden lg:block bg-white rounded-lg shadow overflow-hidden">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Roll No
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Reg No
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Name
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Year
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Section
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Department
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Profile
                    </th>
                    {canManageMentees && (
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Actions
                      </th>
                    )}
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                      {mentees.map((mentee) => (
                    <tr key={mentee.id} className="hover:bg-gray-50">
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                        {mentee.roll_no}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                        {mentee.reg_no}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                        {mentee.profile?.name}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        {mentee.year}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        {mentee.section}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        {mentee.profile?.department}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm">
                        <button
                          onClick={() => navigate(`/staff/student-profile/${mentee.id}`)}
                          className="px-3 py-1 bg-blue-600 text-white text-sm rounded-md hover:bg-blue-700"
                        >
                          View
                        </button>
                      </td>
                      {canManageMentees && (
                        <td className="px-6 py-4 whitespace-nowrap text-sm">
                          <button
                            onClick={() => handleRemoveMentee(mentee.id)}
                            className="text-red-600 hover:text-red-800 font-medium"
                          >
                            Remove
                          </button>
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Mobile Card View */}
            <div className="lg:hidden space-y-4">
              {/* Common Info Header */}
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
                <div className="text-sm">
                  <span className="text-blue-600 font-medium">Department:</span>
                  <span className="text-blue-900 ml-1">{profile?.department}</span>
                </div>
              </div>

              {/* Mentee Cards */}
              <div className="space-y-2">
                      {mentees.map((mentee) => (
                  <div key={mentee.id} className="bg-white rounded-lg border border-gray-200 p-3">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1 min-w-0">
                        <h3 className="text-sm font-semibold text-gray-900 truncate">{mentee.profile?.name}</h3>
                        <div className="flex flex-wrap gap-x-3 gap-y-1 mt-1 text-xs text-gray-600">
                          <span>Roll: {mentee.roll_no}</span>
                          <span>•</span>
                          <span>Reg: {mentee.reg_no}</span>
                          <span>•</span>
                          <span>Y{mentee.year}-{mentee.section}</span>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => navigate(`/staff/student-profile/${mentee.id}`)}
                          className="text-blue-600 hover:text-blue-800 text-xs font-medium whitespace-nowrap flex-shrink-0"
                        >
                          View
                        </button>
                        {canManageMentees && (
                          <button
                            onClick={() => handleRemoveMentee(mentee.id)}
                            className="text-red-600 hover:text-red-800 text-xs font-medium whitespace-nowrap flex-shrink-0"
                          >
                            Remove
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </>
        )}

        <div className="mt-4 text-sm text-gray-600">
          Total Mentees: {mentees.length}
        </div>
      </div>

      {/* Add Mentee Modal */}
      {showAddModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg p-4 sm:p-6 max-w-4xl w-full max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-lg sm:text-xl font-bold">Add Mentee</h2>
              <button
                onClick={() => setShowAddModal(false)}
                className="text-gray-500 hover:text-gray-700"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {availableStudents.length === 0 ? (
              <p className="text-gray-600 text-center py-8 text-sm sm:text-base">
                No available students in your department without a mentor.
              </p>
            ) : (
              <>
                {/* Desktop Table */}
                <div className="hidden sm:block overflow-x-auto">
                  <table className="min-w-full divide-y divide-gray-200">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                          Roll No
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                          Name
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                          Year
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                          Section
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                          Action
                        </th>
                      </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200">
                      {availableStudents.map((student) => (
                        <tr key={student.id} className="hover:bg-gray-50">
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                            {student.roll_no}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                            {student.profile?.name}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                            {student.year}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                            {student.section}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm">
                            <button
                              onClick={() => {
                                handleAddMentee(student.id);
                                setShowAddModal(false);
                              }}
                              className="text-blue-600 hover:text-blue-800 font-medium"
                            >
                              Add
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {/* Mobile Card List */}
                <div className="sm:hidden space-y-2 max-h-96 overflow-y-auto">
                  {availableStudents.map((student) => (
                    <div key={student.id} className="bg-gray-50 rounded-lg border border-gray-200 p-3">
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex-1 min-w-0">
                          <h3 className="text-sm font-semibold text-gray-900 truncate">{student.profile?.name}</h3>
                          <div className="flex gap-3 mt-1 text-xs text-gray-600">
                            <span>Roll: {student.roll_no}</span>
                            <span>•</span>
                            <span>Y{student.year}-{student.section}</span>
                          </div>
                        </div>
                        <button
                          onClick={() => {
                            handleAddMentee(student.id);
                            setShowAddModal(false);
                          }}
                          className="text-blue-600 hover:text-blue-800 text-xs font-medium whitespace-nowrap flex-shrink-0"
                        >
                          Add
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </>
            )}

            <div className="flex justify-end mt-6">
              <button
                onClick={() => setShowAddModal(false)}
                className="px-4 py-2 border rounded hover:bg-gray-50 text-sm"
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
