import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { MoreVertical } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import DashboardLayout from '../../components/DashboardLayout';
import { supabase } from '../../lib/supabase';


interface StaffRow {
  id: string;
  staff_id: string;
  staff_role: string;
  year: number | null;
  section: string | null;
  advisorClasses: string[];
  profile: {
    name: string;
    email: string;
    department: string;
    phone_number: string | null;
    role?: string;
  } | null;
}

export default function PrincipalStaffDetails() {
  const navigate = useNavigate();
  const { profile } = useAuth();
  const [staff, setStaff] = useState<StaffRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [departments, setDepartments] = useState<string[]>([]);
  const [filteredStaff, setFilteredStaff] = useState<StaffRow[]>([]);
  // Filters
  const [selectedDept, setSelectedDept] = useState<string>('');
  const [selectedRole, setSelectedRole] = useState<string>('');
  const [search, setSearch] = useState<string>('');
  const [editId, setEditId] = useState<string | null>(null);
  const [editing, setEditing] = useState<any>(null);
  const [saving, setSaving] = useState(false);
  const [openActionsId, setOpenActionsId] = useState<string | null>(null);

  // Simple module-level cache to avoid refetching when navigating to child routes
  // and coming back. TTL is 5 minutes.
  const CACHE_KEY = 'staffDetails_filters_v1';
  const CACHE_TTL_MS = 5 * 60 * 1000;


  useEffect(() => {
    // Restore saved filters (if any) so UI returns to previous state on remount
    try {
      const raw = sessionStorage.getItem(CACHE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed) {
          if (parsed.selectedDept) setSelectedDept(parsed.selectedDept);
          if (parsed.selectedRole) setSelectedRole(parsed.selectedRole);
          if (parsed.search) setSearch(parsed.search);
        }
      }
    } catch (e) {
      // ignore
    }

    fetchStaff();
  }, []);

  useEffect(() => {
    applyFilters();
  }, [staff, selectedDept, selectedRole]);

  // Ensure the currently selected department remains present in the departments list.
  // This prevents the select from showing a value that has no corresponding option
  // (which can make it appear unclickable after edits/cancels).
  useEffect(() => {
    try {
      if (selectedDept) {
        const exists = departments.some(d => d === selectedDept);
        if (!exists) {
          setDepartments(prev => {
            const set = new Set(prev || []);
            set.add(selectedDept);
            return Array.from(set).sort();
          });
        }
      }
    } catch (e) {
      // ignore
    }
  }, [selectedDept, departments]);

  // persist filters so when user navigates to a child route and back, UI state remains
  useEffect(() => {
    try {
      const toSave = { selectedDept, selectedRole, search };
      sessionStorage.setItem(CACHE_KEY, JSON.stringify(toSave));
    } catch (e) {
      // ignore storage errors
    }
  }, [selectedDept, selectedRole, search]);

  useEffect(() => {
    if (!search) {
      const copy = [...staff];
      copy.sort(compareByStaffId);
      return setFilteredStaff(copy);
    }
    const s = search.toLowerCase().trim();
    const filtered = staff.filter(item => (
      (item.profile?.name || '').toLowerCase().includes(s) ||
      (item.profile?.email || '').toLowerCase().includes(s) ||
      (item.staff_id || '').toLowerCase().includes(s)
    ));
    filtered.sort(compareByStaffId);
    setFilteredStaff(filtered);
  }, [search, staff]);

  const fetchStaff = async () => {
    try {
      setLoading(true);
      // Check in-memory/session cache first
      try {
        const rawCache = (window as any).__STAFF_DETAILS_CACHE || null;
        if (rawCache && (Date.now() - rawCache.ts) < CACHE_TTL_MS) {
          const combined = rawCache.data as StaffRow[];
          setStaff(combined);
          // populate departments from cached data
          const depts = Array.from(new Set(
            combined
              .map(s => (s.profile && typeof s.profile.department === 'string') ? s.profile.department : '')
              .filter((d): d is string => !!d && d.trim() !== '')
          ));
          setDepartments(depts.sort());
          // set filtered view (apply existing filters/search)
          const copy = [...combined];
          copy.sort(compareByStaffId);
          setFilteredStaff(copy);
          setLoading(false);
          return;
        }
      } catch (e) {
        // ignore cache errors
      }
      // Parallel fetch all staff data
      const [profilesResult, studentsResult] = await Promise.all([
        supabase
          .from('profiles')
          .select('id, name, email, role, department')
          .in('role', ['staff','ahod','hod']),
        supabase
          .from('students')
          .select('advisor_id, year, section, department')
      ]);

      if (profilesResult.error) throw profilesResult.error;
      const profiles = profilesResult.data || [];

      const ids = profiles.map((p: any) => p.id);
      let staffRows: any[] = [];
      if (ids.length) {
        const { data: sRows, error: sRowsError } = await supabase
          .from('staff')
          .select('id, staff_id, staff_role, year, section, date_of_join')
          .in('id', ids);
        if (sRowsError) throw sRowsError;
        staffRows = sRows || [];
      }
      const byId = new Map(staffRows.map((s) => [s.id, s]));

      // Group students by advisor_id to get advisor classes
      const advisorClassesMap = new Map<string, string[]>();
      (studentsResult.data || []).forEach((student: any) => {
        if (student.advisor_id) {
          const classKey = `${student.year || 'N/A'}-${student.section || 'N/A'}`;
          const existing = advisorClassesMap.get(student.advisor_id) || [];
          if (!existing.includes(classKey)) {
            existing.push(classKey);
            advisorClassesMap.set(student.advisor_id, existing);
          }
        }
      });

      const combined: StaffRow[] = profiles.map((p: any) => {
        const s = byId.get(p.id);
        
        // Use database staff_id if it exists, otherwise generate one
        let staffId = s?.staff_id;
        
        // Only generate if staff_id is completely missing or is clearly not a proper ID
        if (!staffId) {
          staffId = generateStaffId(p.name, p.id);
        }
        
        const advisorClasses = advisorClassesMap.get(p.id) || [];

        return {
          id: p.id,
          staff_id: staffId,
          staff_role: s?.staff_role || p.role || 'staff',
          year: s?.year ?? null,
          section: s?.section ?? null,
          date_of_join: s?.date_of_join ?? null,
          advisorClasses: advisorClasses,
          profile: {
            name: p.name,
            email: p.email,
            department: p.department,
            phone_number: null,
            role: p.role,
          },
        
        };
      });
      // Sort by staff id (numeric part) when possible
      combined.sort(compareByStaffId);
      // Get unique departments
      const depts = Array.from(new Set(
        combined
          .map(s => (s.profile && typeof s.profile.department === 'string') ? s.profile.department : '')
          .filter((d): d is string => !!d && d.trim() !== '')
      ));
      setDepartments(depts.sort());
      setStaff(combined);
      try {
        // store to module-level cache for quick return
        (window as any).__STAFF_DETAILS_CACHE = { data: combined, ts: Date.now() };
      } catch (e) {
        // ignore
      }
    } catch (error) {
      console.error('Error fetching staff:', error);
    } finally {
      setLoading(false);
    }
  };

  const applyFilters = () => {
    let filtered = [...staff];
    if (selectedDept) {
      const sd = selectedDept.toString().trim().toLowerCase();
      filtered = filtered.filter(s => {
        const pdept = (s.profile?.department || '').toString().trim().toLowerCase();
        if (!pdept) return false;
        if (pdept === sd) return true;
        // If selected department contains profile dept (e.g., 'ai&ds' contains 'ai')
        if (sd.includes(pdept)) return true;
        // If profile dept contains selected dept (rare)
        if (pdept.includes(sd)) return true;
        return false;
      });
    }
    if (selectedRole) {
      filtered = filtered.filter(s => {
        const profRole = (s.profile?.role || s.staff_role || '').toString().trim().toLowerCase();
        return profRole === selectedRole.toString().trim().toLowerCase();
      });
    }
    filtered.sort(compareByStaffId);
    setFilteredStaff(filtered);
  };

  // Generate staff ID based on name and UUID when staff_id is missing
  function generateStaffId(name: string, uuid: string): string {
    // Extract first 3 characters of name (alphanumeric only)
    const namePrefix = name.replace(/[^a-zA-Z0-9]/g, '').substring(0, 3).toUpperCase();
    // Extract last 3 digits from UUID
    const uuidDigits = uuid.replace(/[^0-9]/g, '');
    const digits = uuidDigits.substring(uuidDigits.length - 3).padStart(3, '0');
    return `${namePrefix}${digits}`;
  }

  // Staff ID formatting utility
  function formatStaffId(staffId: string) {
    // If already has STF prefix, return as is
    if (staffId.startsWith('STF')) return staffId;
    
    // If it's a 3-digit number like "018", add STF prefix
    if (/^\d{3}$/.test(staffId)) return `STF${staffId}`;
    
    // If it's any number, pad to 3 digits and add STF prefix
    if (/^\d+$/.test(staffId)) return `STF${staffId.padStart(3, '0')}`;
    
    // If it looks like an email, extract meaningful part
    if (staffId.includes('@')) {
      const emailPrefix = staffId.split('@')[0].replace(/[^a-zA-Z0-9]/g, '').substring(0, 6).toUpperCase();
      return `STF${emailPrefix}`;
    }
    
    // If it looks like a generated ID (letters+digits), add STF prefix
    if (/^[A-Z]{2,3}\d{3}$/.test(staffId)) return `STF${staffId}`;
    
    // Extract digits and use them
    const digits = staffId.match(/\d+/g)?.join('') || '';
    if (digits) return `STF${digits.substring(0, 3).padStart(3, '0')}`;
    
    // Last resort: use alphanumeric characters
    const alphanumeric = staffId.replace(/[^a-zA-Z0-9]/g, '').substring(0, 6).toUpperCase();
    return alphanumeric ? `STF${alphanumeric}` : 'STF---';
  }

  // Compare helper to sort staff rows by numeric staff_id when possible
  function compareByStaffId(a: StaffRow, b: StaffRow) {
    const aRaw = String(a.staff_id || a.profile?.name || '');
    const bRaw = String(b.staff_id || b.profile?.name || '');
    const aDigits = aRaw.replace(/\D/g, '');
    const bDigits = bRaw.replace(/\D/g, '');
    const aNum = aDigits ? Number(aDigits) : NaN;
    const bNum = bDigits ? Number(bDigits) : NaN;
    if (!Number.isNaN(aNum) && !Number.isNaN(bNum)) return aNum - bNum;
    if (!Number.isNaN(aNum)) return -1;
    if (!Number.isNaN(bNum)) return 1;
    return aRaw.localeCompare(bRaw);
  }

  return (
    <DashboardLayout>
      <div className="max-w-7xl mx-auto p-4 sm:p-6">
        {/* Filters */}
        <div className="bg-white rounded-lg shadow p-4 mb-6">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-semibold text-gray-700">Filters</h3>
            <button
              onClick={() => navigate('/principal/staff/create')}
              className="inline-flex items-center gap-1 px-3 py-1 bg-indigo-600 text-white text-sm rounded hover:bg-indigo-700 transition-colors"
            >
              Create Staff
            </button>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-4 gap-4 items-end">
            <div>
              <label className="block text-sm text-gray-600 mb-1">Department</label>
              <select
                value={selectedDept}
                onChange={(e) => setSelectedDept(e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
              >
                <option value="">All Departments</option>
                {departments.map((dept) => (
                  <option key={dept} value={dept}>{dept}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm text-gray-600 mb-1">Role</label>
              <select
                value={selectedRole}
                onChange={(e) => setSelectedRole(e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
              >
                <option value="">All Roles</option>
                <option value="hod">HOD</option>
                <option value="ahod">AHOD</option>
                <option value="staff">Staff</option>
              </select>
            </div>
            <div>
              <label className="block text-sm text-gray-600 mb-1">Search</label>
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search by name, email or staff id"
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
              />
            </div>
            <div className="flex items-center">
              <button
                onClick={() => { setSelectedDept(''); setSelectedRole(''); setSearch(''); }}
                className="w-full px-4 py-2 bg-gray-200 text-gray-700 text-sm rounded-lg hover:bg-gray-300 transition-colors"
              >
                Clear
              </button>
            </div>
          </div>
        </div>

        {/* Table and profile card layout */}
        <div className="flex flex-col lg:flex-row gap-8">
          {/* Table section (left) */}
          <div className="flex-1">
            {loading ? (
              <div className="flex items-center justify-center py-12">
                <div className="text-gray-500 text-sm sm:text-base">Loading staff...</div>
              </div>
            ) : filteredStaff.length === 0 ? (
              <div className="bg-gray-50 border border-gray-200 rounded-lg p-6 sm:p-8 text-center">
                <span className="w-10 h-10 sm:w-12 sm:h-12 text-gray-400 mx-auto mb-3">👥</span>
                <p className="text-gray-600 text-sm sm:text-base">No staff members found.</p>
              </div>
            ) : (
              <>
                {/* Desktop Table View */}
                <div className="hidden lg:block bg-white rounded-lg shadow overflow-hidden">
                  <table className="min-w-full divide-y divide-gray-200">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Staff ID</th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Name</th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Department</th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Role</th>
                        
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200">
                      {filteredStaff.map((s) => (
                        <tr key={s.id} className="hover:bg-gray-50">
                          <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                            {s.staff_id ? s.staff_id.replace(/^STF/i, '') : formatStaffId(s.staff_id)}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                            <div className="leading-tight">
                              <div className="font-medium">{s.profile?.name || '-'}</div>
                              {s.advisorClasses.length > 0 && (
                                <div className="mt-1 flex flex-wrap gap-1">
                                  {s.advisorClasses.map((cls, idx) => (
                                    <span key={idx} className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] bg-blue-100 text-blue-800">
                                      {cls}
                                    </span>
                                  ))}
                                </div>
                              )}
                            </div>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{s.profile?.department || '-'}</td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 capitalize">{(s.profile?.role || s.staff_role || '').toString()}</td>
                          
                          <td className="px-6 py-4 whitespace-nowrap text-sm">
                            <div className="relative flex items-center justify-center">
                              <button
                                onClick={() => setOpenActionsId(prev => prev === s.id ? null : s.id)}
                                aria-haspopup="true"
                                aria-expanded={openActionsId === s.id}
                                className="p-1 rounded hover:bg-gray-100"
                                title="Actions"
                              >
                                <MoreVertical className="w-5 h-5 text-gray-600" />
                              </button>

                              {openActionsId === s.id && (
                                <div className="absolute right-0 mt-2 w-40 bg-white border border-gray-200 rounded shadow z-50 flex flex-col">
                                  <button onClick={() => { setOpenActionsId(null); navigate(`/principal/staff/${s.id}`); }} className="w-full text-left px-3 py-2 text-sm hover:bg-gray-50">View</button>
                                  <button onClick={() => { setOpenActionsId(null); setEditId(s.id); setEditing({
                                    name: s.profile?.name || '',
                                    email: s.profile?.email || '',
                                    department: s.profile?.department || '',
                                    phone_number: s.profile?.phone_number || '',
                                    staff_role: s.staff_role || (s.profile && (s.profile.role === 'hod' || s.profile.role === 'ahod') ? s.profile.role : 'lecturer'),
                                    year: s.year ?? null,
                                    section: s.section || '',
                                    staff_id: s.staff_id || '',
                                    date_of_join: s.date_of_join || ''
                                  }); }} className="w-full text-left px-3 py-2 text-sm hover:bg-gray-50">Edit</button>
                                  <button onClick={() => { setOpenActionsId(null); navigate(`${profile?.role === 'hod' ? '/hod' : '/principal'}/staff/${s.id}/timetable`); }} className="w-full text-left px-3 py-2 text-sm hover:bg-gray-50">Timetable</button>
                                  <button onClick={() => { setOpenActionsId(null); navigate(`${profile?.role === 'hod' ? '/hod' : '/principal'}/staff/${s.id}/mentees`); }} className="w-full text-left px-3 py-2 text-sm hover:bg-gray-50">Mentees</button>
                                </div>
                              )}
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {/* Mobile Card View */}
                <div className="lg:hidden space-y-4">
                  {filteredStaff.map((s) => (
                    <div key={s.id} className="bg-white rounded-lg border border-gray-200 p-4">
                      <div className="flex items-start justify-between mb-3">
                        <div className="flex-1 min-w-0">
                          <h3 className="text-sm font-semibold text-gray-900 truncate">{s.profile?.name || '-'}</h3>
                        </div>
                        <div className="relative">
                          <button onClick={() => setOpenActionsId(prev => prev === s.id ? null : s.id)} className="p-1 rounded hover:bg-gray-100" title="Actions">
                            <MoreVertical className="w-5 h-5 text-gray-600" />
                          </button>
                          {openActionsId === s.id && (
                                <div className="absolute right-0 mt-2 w-40 bg-white border border-gray-200 rounded shadow z-50 flex flex-col">
                              <button onClick={() => { setOpenActionsId(null); navigate(`/principal/staff/${s.id}`); }} className="w-full text-left px-3 py-2 text-sm hover:bg-gray-50">View Profile</button>
                              <button onClick={() => { setOpenActionsId(null); setEditId(s.id); setEditing({
                                name: s.profile?.name || '',
                                email: s.profile?.email || '',
                                department: s.profile?.department || '',
                                phone_number: s.profile?.phone_number || '',
                                staff_role: s.staff_role || (s.profile && (s.profile.role === 'hod' || s.profile.role === 'ahod') ? s.profile.role : 'lecturer'),
                                year: s.year ?? null,
                                section: s.section || '',
                                staff_id: s.staff_id || '',
                                date_of_join: s.date_of_join || ''
                              }); }} className="w-full text-left px-3 py-2 text-sm hover:bg-gray-50">Edit</button>
                              <button onClick={() => { setOpenActionsId(null); navigate(`${profile?.role === 'hod' ? '/hod' : '/principal'}/staff/${s.id}/timetable`); }} className="w-full text-left px-3 py-2 text-sm hover:bg-gray-50">Timetable</button>
                              <button onClick={() => { setOpenActionsId(null); navigate(`${profile?.role === 'hod' ? '/hod' : '/principal'}/staff/${s.id}/mentees`); }} className="w-full text-left px-3 py-2 text-sm hover:bg-gray-50">Mentees</button>
                            </div>
                          )}
                        </div>
                      </div>
                        <div className="grid grid-cols-2 gap-2 text-xs mb-3">
                        <div>
                          <span className="text-gray-500">Staff ID:</span>
                          <span className="ml-1 font-medium">{s.staff_id ? s.staff_id.replace(/^STF/i, '') : formatStaffId(s.staff_id)}</span>
                        </div>
                        <div>
                          <span className="text-gray-500">Role:</span>
                          <span className="ml-1 font-medium capitalize">{(s.profile?.role || s.staff_role || '').toString()}</span>
                        </div>
                        <div className="col-span-2">
                          <span className="text-gray-500">Department:</span>
                          <span className="ml-1 font-medium">{s.profile?.department || '-'}</span>
                        </div>
                      </div>
                      {/* Actions are now available via the three-dot menu in the card header */}
                    </div>
                  ))}
                </div>
              </>
            )}
            {/* Edit Modal */}
            {editId && editing && (
              <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
                <div className="bg-white rounded-lg w-full max-w-2xl p-6">
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="text-lg font-semibold">Edit Staff</h3>
                    <button onClick={() => { setEditId(null); setEditing(null); }} className="text-gray-500">Close</button>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-sm text-gray-600 mb-1">Name</label>
                      <input value={editing.name} onChange={(e) => setEditing((p:any)=>({...p, name: e.target.value}))} className="w-full border px-3 py-2 rounded" />
                    </div>
                    <div>
                      <label className="block text-sm text-gray-600 mb-1">Date of join</label>
                      <input type="date" value={editing.date_of_join || ''} onChange={(e) => setEditing((p:any)=>({...p, date_of_join: e.target.value}))} className="w-full border px-3 py-2 rounded" />
                    </div>
                    <div>
                      <label className="block text-sm text-gray-600 mb-1">Email</label>
                      <input value={editing.email} onChange={(e) => setEditing((p:any)=>({...p, email: e.target.value}))} className="w-full border px-3 py-2 rounded" />
                    </div>
                    <div>
                      <label className="block text-sm text-gray-600 mb-1">Department</label>
                      <input value={editing.department} onChange={(e) => setEditing((p:any)=>({...p, department: e.target.value}))} className="w-full border px-3 py-2 rounded" />
                    </div>
                    <div>
                      <label className="block text-sm text-gray-600 mb-1">Phone</label>
                      <input value={editing.phone_number} onChange={(e) => setEditing((p:any)=>({...p, phone_number: e.target.value}))} className="w-full border px-3 py-2 rounded" />
                    </div>
                    <div>
                      <label className="block text-sm text-gray-600 mb-1">Staff Role</label>
                      <select value={editing.staff_role} onChange={(e) => setEditing((p:any)=>({...p, staff_role: e.target.value}))} className="w-full border px-3 py-2 rounded">
                        <option value="lecturer">Lecturer</option>
                        <option value="mentor">Mentor</option>
                        <option value="advisor">Advisor</option>
                        <option value="hod">HOD</option>
                        <option value="ahod">AHOD</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-sm text-gray-600 mb-1">Staff ID</label>
                      <input value={editing.staff_id} onChange={(e) => setEditing((p:any)=>({...p, staff_id: e.target.value}))} className="w-full border px-3 py-2 rounded" />
                    </div>
                    <div>
                      <label className="block text-sm text-gray-600 mb-1">Year</label>
                      <input type="number" value={editing.year ?? ''} onChange={(e) => setEditing((p:any)=>({...p, year: e.target.value ? Number(e.target.value) : null}))} className="w-full border px-3 py-2 rounded" />
                    </div>
                    <div>
                      <label className="block text-sm text-gray-600 mb-1">Section</label>
                      <input value={editing.section} onChange={(e) => setEditing((p:any)=>({...p, section: e.target.value}))} className="w-full border px-3 py-2 rounded" />
                    </div>
                  </div>
                  <div className="mt-4 flex justify-end gap-2">
                    <button onClick={() => { setEditId(null); setEditing(null); }} className="px-4 py-2 bg-gray-200 rounded">Cancel</button>
                    <button disabled={saving} onClick={async () => {
                      if (!editId) return;
                      try {
                        setSaving(true);
                        // update profiles
                        // Ensure profiles.role matches HOD/AHOD or 'staff' for all other staff_roles
                        const profileRole = (editing.staff_role === 'hod' || editing.staff_role === 'ahod') ? editing.staff_role : 'staff';
                        const { error: pErr } = await supabase.from('profiles').update({
                          name: editing.name,
                          email: editing.email,
                          department: editing.department,
                          role: profileRole,
                        }).eq('id', editId);
                        if (pErr) throw pErr;
                        // upsert staff row
                        const staffPayload: any = {
                          id: editId,
                          staff_id: editing.staff_id,
                          // ensure staff_role conforms to DB check constraint
                          staff_role: editing.staff_role === 'staff' ? 'lecturer' : editing.staff_role,
                          year: editing.year,
                          section: editing.section,
                          date_of_join: editing.date_of_join || null,
                        };
                        // try update first
                        const { error: sErr } = await supabase.from('staff').upsert(staffPayload, { onConflict: 'id' });
                        if (sErr) throw sErr;
                        // Reconcile roles in DB: ensure profiles.role and staff.staff_role match intended values
                        try {
                          const intendedProfileRole = profileRole;
                          const intendedStaffRole = staffPayload.staff_role;
                          const [{ data: fetchedProfile }, { data: fetchedStaff }] = await Promise.all([
                            supabase.from('profiles').select('role').eq('id', editId).single(),
                            supabase.from('staff').select('staff_role').eq('id', editId).single(),
                          ]);
                          if (fetchedProfile && fetchedProfile.role !== intendedProfileRole) {
                            await supabase.from('profiles').update({ role: intendedProfileRole }).eq('id', editId);
                          }
                          if (fetchedStaff && fetchedStaff.staff_role !== intendedStaffRole) {
                            await supabase.from('staff').update({ staff_role: intendedStaffRole }).eq('id', editId);
                          }
                        } catch (reconcileErr) {
                          // non-fatal: log and continue
                          console.warn('Failed to reconcile roles after save', reconcileErr);
                        }
                        // refresh list
                        await fetchStaff();
                        setEditId(null);
                        setEditing(null);
                      } catch (e) {
                        console.error('Failed to save staff edits', e);
                        alert('Failed to save changes');
                      } finally {
                        setSaving(false);
                      }
                    }} className="px-4 py-2 bg-indigo-600 text-white rounded">Save</button>
                  </div>
                </div>
              </div>
            )}
            <div className="mt-4 text-sm text-gray-600">Total Staff: {filteredStaff.length}</div>
          </div>

          {/* Profile Card (right) removed as requested */}
        </div>
      </div>
    </DashboardLayout>
  );
}
