import { useEffect, useState } from 'react';
import DashboardLayout from '../../components/DashboardLayout';
import { supabase } from '../../lib/supabase';
import { getAdminApiUrl } from '../../lib/adminApi';
import { createUser } from '../../lib/userManagement';
import { useAuth } from '../../contexts/AuthContext';

interface ProfileRow {
  id: string;
  email: string;
  role: string;
  name: string;
  department: string;
}

interface StudentRow {
  id: string;
  reg_no: string;
  roll_no: string;
  year: number;
  section: string;
}

interface YearRow {
  id: string;
  department: string;
  year_number: number;
}

interface SectionRow {
  id: string;
  department: string;
  year_number: number;
  section_name: string;
}

export default function Create() {
  const { profile } = useAuth();
  const [loading, setLoading] = useState(true);
  const [departments, setDepartments] = useState<string[]>([]);
  const [profiles, setProfiles] = useState<ProfileRow[]>([]);
  const [students, setStudents] = useState<Record<string, StudentRow>>({});
  const [years, setYears] = useState<YearRow[]>([]);
  const [sections, setSections] = useState<SectionRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  // form state
  const [newDeptName, setNewDeptName] = useState('');
  const [hodId, setHodId] = useState<string>('');
  const [ahodId, setAhodId] = useState<string>('');
  const [submitting, setSubmitting] = useState(false);
  // years and sections state
  const [selectedYears, setSelectedYears] = useState<number[]>([]);
  const [newSection, setNewSection] = useState('');
  const [sectionYear, setSectionYear] = useState<number>(1);
  // create HOD/AHOD state
  const [newHodName, setNewHodName] = useState('');
  const [newHodEmail, setNewHodEmail] = useState('');
  const [newHodDob, setNewHodDob] = useState('');
  const [creatingHod, setCreatingHod] = useState(false);

  const [newAhodName, setNewAhodName] = useState('');
  const [newAhodEmail, setNewAhodEmail] = useState('');
  const [newAhodDob, setNewAhodDob] = useState('');
  const [creatingAhod, setCreatingAhod] = useState(false);

  // create Staff state
  const [newStaffName, setNewStaffName] = useState('');
  const [newStaffEmail, setNewStaffEmail] = useState('');
  const [newStaffDob, setNewStaffDob] = useState('');
  const [newStaffRole, setNewStaffRole] = useState<'mentor' | 'advisor' | 'lecturer'>('mentor');
  const [newStaffDepartment, setNewStaffDepartment] = useState('');
  const [newStaffYear, setNewStaffYear] = useState<number>(1);
  const [newStaffSection, setNewStaffSection] = useState('');
  const [creatingStaff, setCreatingStaff] = useState(false);
  // staff import state
  const [staffImportFile, setStaffImportFile] = useState<File | null>(null);
  const [staffImportDept, setStaffImportDept] = useState('');
  const [staffImportLog, setStaffImportLog] = useState<string[]>([]);
  const [importingStaff, setImportingStaff] = useState(false);

  // create Student state
  const [newStudentName, setNewStudentName] = useState('');
  const [newStudentEmail, setNewStudentEmail] = useState('');
  const [newStudentDob, setNewStudentDob] = useState('');
  const [newStudentRegNo, setNewStudentRegNo] = useState('');
  const [newStudentRollNo, setNewStudentRollNo] = useState('');
  const [newStudentDepartment, setNewStudentDepartment] = useState('');
  const [newStudentYear, setNewStudentYear] = useState<number>(1);
  const [newStudentSection, setNewStudentSection] = useState('');
  const [creatingStudent, setCreatingStudent] = useState(false);

  useEffect(() => {
    if (!profile) return;
    const fetchAll = async () => {
      setLoading(true);
      try {
        const { data: pData, error: pErr } = await supabase
          .from('profiles')
          .select('id, email, role, name, department')
          .order('department', { ascending: true });
        if (pErr) throw pErr;

        const { data: sData, error: sErr } = await supabase
          .from('students')
          .select('id, reg_no, roll_no, year, section');
        if (sErr) throw sErr;

        const { data: yData, error: yErr } = await supabase
          .from('years')
          .select('*')
          .order('department', { ascending: true })
          .order('year_number', { ascending: true });
        if (yErr) throw yErr;

        const { data: secData, error: secErr } = await supabase
          .from('sections')
          .select('*')
          .order('department', { ascending: true })
          .order('year_number', { ascending: true })
          .order('section_name', { ascending: true });
        if (secErr) throw secErr;

        const studentMap: Record<string, StudentRow> = {};
        (sData || []).forEach((s: any) => {
          studentMap[s.id] = s;
        });

        const deps = Array.from(new Set((pData || []).map((p: any) => p.department))).sort();

        setProfiles(pData || []);
        setStudents(studentMap);
        setYears(yData || []);
        setSections(secData || []);
        setDepartments(deps as string[]);
      } catch (err: any) {
        console.error('Error fetching departments data:', err);
        setError(err.message || String(err));
      } finally {
        setLoading(false);
      }
    };

    fetchAll();
  }, [profile]);

  const resetForm = () => {
    setNewDeptName('');
    setHodId('');
    setAhodId('');
    setSelectedYears([]);
    setNewSection('');
    setSectionYear(1);
  };

  const handleToggleYear = (year: number) => {
    setSelectedYears((prev) =>
      prev.includes(year) ? prev.filter((y) => y !== year) : [...prev, year]
    );
  };

  const handleAddSection = async () => {
    if (!newDeptName.trim()) return setError('Please enter department name first');
    if (!newSection.trim()) return setError('Section name is required');
    setError(null);
    try {
      const { error } = await supabase
        .from('sections')
        .insert({
          department: newDeptName.trim(),
          year_number: sectionYear,
          section_name: newSection.trim().toUpperCase()
        });
      if (error) throw error;

      // Refresh sections
      const { data: secData } = await supabase
        .from('sections')
        .select('*')
        .order('department', { ascending: true })
        .order('year_number', { ascending: true })
        .order('section_name', { ascending: true });
      setSections(secData || []);
      setNewSection('');
      alert('Section added successfully!');
    } catch (err: any) {
      console.error('Error adding section:', err);
      setError(err.message || String(err));
    }
  };

  const handleCreateHod = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!newHodName.trim() || !newHodEmail.trim()) return setError('HOD name and email are required');
    setCreatingHod(true);
    setError(null);
    try {
      const genStaffId = `STF${Date.now().toString().slice(-6)}`;
      const defaultPassword = 'Password123!';
      
      // Use Edge Function to create HOD
      const userData = {
        name: newHodName.trim(),
        email: newHodEmail.trim(),
        department: '',
        password: defaultPassword,
        role: 'hod',  // Role in profiles table
        staff_id: genStaffId,
        staff_role: 'hod'  // Staff role in staff table
      };
      
      const result = await createUser(userData);
      console.log('HOD created successfully:', result);
      
      // refresh profiles
      const { data: pData } = await supabase.from('profiles').select('id, email, role, name, department').order('department', { ascending: true });
      setProfiles(pData || []);
      const deps = Array.from(new Set((pData || []).map((p: any) => p.department))).sort();
      setDepartments(deps as string[]);
      setNewHodName('');
      setNewHodEmail('');
      setNewHodDob('');
      alert(`HOD created successfully!\nEmail: ${newHodEmail.trim()}\nPassword: ${defaultPassword}\n(User can now log in)`);
    } catch (err: any) {
      console.error('Error creating HOD:', err);
      setError(err.message || String(err));
    } finally {
      setCreatingHod(false);
    }
  };

  const handleCreateAhod = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!newAhodName.trim() || !newAhodEmail.trim()) return setError('AHOD name and email are required');
    setCreatingAhod(true);
    setError(null);
    try {
      const genStaffId = `STF${Date.now().toString().slice(-6)}`;
      const defaultPassword = 'Password123!';
      
      // Use Edge Function to create AHOD
      const userData = {
        name: newAhodName.trim(),
        email: newAhodEmail.trim(),
        department: '',
        password: defaultPassword,
        role: 'ahod',  // Role in profiles table
        staff_id: genStaffId,
        staff_role: 'ahod'  // Staff role in staff table
      };
      
      const result = await createUser(userData);
      console.log('AHOD created successfully:', result);
      
      // refresh profiles
      const { data: pData } = await supabase.from('profiles').select('id, email, role, name, department').order('department', { ascending: true });
      setProfiles(pData || []);
      const deps = Array.from(new Set((pData || []).map((p: any) => p.department))).sort();
      setDepartments(deps as string[]);
      setNewAhodName('');
      setNewAhodEmail('');
      setNewAhodDob('');
      alert(`AHOD created successfully!\nEmail: ${newAhodEmail.trim()}\nPassword: ${defaultPassword}\n(User can now log in)`);
    } catch (err: any) {
      console.error('Error creating AHOD:', err);
      setError(err.message || String(err));
    } finally {
      setCreatingAhod(false);
    }
  };

  const handleCreateStaff = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!newStaffName.trim() || !newStaffEmail.trim()) return setError('Staff name and email are required');
    if (!newStaffDepartment.trim()) return setError('Department is required for staff');
    
    // Validate advisor requirements
    if (newStaffRole === 'advisor') {
      if (!newStaffYear) return setError('Year is required for advisors');
      if (!newStaffSection.trim()) return setError('Section is required for advisors');
    }

    setCreatingStaff(true);
    setError(null);
    try {
      const genStaffId = `STF${Date.now().toString().slice(-6)}`;
      const dobVal = newStaffDob || '1990-01-01';
      
      // Use Edge Function to create staff
      const userData: any = {
        name: newStaffName.trim(),
        email: newStaffEmail.trim(),
        department: newStaffDepartment.trim(),
        password: dobVal.replace(/-/g, ''),
        role: 'staff',
        staff_id: genStaffId,
        staff_role: newStaffRole
      };
      
      // Add year and section only for advisors
      if (newStaffRole === 'advisor') {
        userData.year = newStaffYear;
        userData.section = newStaffSection.trim().toUpperCase();
      }
      
      const result = await createUser(userData);
      console.log('Staff created successfully:', result);
      
      // refresh profiles
      const { data: pData } = await supabase.from('profiles').select('id, email, role, name, department').order('department', { ascending: true });
      setProfiles(pData || []);
      const deps = Array.from(new Set((pData || []).map((p: any) => p.department))).sort();
      setDepartments(deps as string[]);
      
      setNewStaffName('');
      setNewStaffEmail('');
      setNewStaffDob('');
      setNewStaffRole('mentor');
      setNewStaffDepartment('');
      setNewStaffYear(1);
      setNewStaffSection('');
      
      alert(`Staff created successfully!\nEmail: ${newStaffEmail.trim()}\nPassword: ${defaultPassword}\nRole: ${newStaffRole}\n(User can now log in)`);
    } catch (err: any) {
      console.error('Error creating staff:', err);
      setError(err.message || String(err));
    } finally {
      setCreatingStaff(false);
    }
  };

  const handleCreateStudent = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!newStudentName.trim() || !newStudentEmail.trim()) return setError('Student name and email are required');
    if (!newStudentDepartment.trim()) return setError('Department is required');
    if (!newStudentRegNo.trim() || !newStudentRollNo.trim()) return setError('Registration number and Roll number are required');
    if (!newStudentYear || !newStudentSection.trim()) return setError('Year and section are required');

    setCreatingStudent(true);
    setError(null);
    try {
      const defaultPassword = 'Password123!';

      // Use Edge Function to create student
      const userData = {
        name: newStudentName.trim(),
        email: newStudentEmail.trim(),
        department: newStudentDepartment.trim(),
        password: defaultPassword,
        role: 'student',
        reg_no: newStudentRegNo.trim(),
        roll_no: newStudentRollNo.trim(),
        year: newStudentYear,
        section: newStudentSection.trim().toUpperCase()
      };      const result = await createUser(userData);
      console.log('Student created successfully:', result);
      
      // refresh profiles and students
      const { data: pData } = await supabase.from('profiles').select('id, email, role, name, department').order('department', { ascending: true });
      setProfiles(pData || []);
      
      const { data: sData } = await supabase.from('students').select('id, reg_no, roll_no, year, section');
      const studentMap: Record<string, StudentRow> = {};
      (sData || []).forEach((s: any) => {
        studentMap[s.id] = s;
      });
      setStudents(studentMap);
      
      const deps = Array.from(new Set((pData || []).map((p: any) => p.department))).sort();
      setDepartments(deps as string[]);
      
      setNewStudentName('');
      setNewStudentEmail('');
      setNewStudentDob('');
      setNewStudentRegNo('');
      setNewStudentRollNo('');
      setNewStudentDepartment('');
      setNewStudentYear(1);
      setNewStudentSection('');
      
      alert(`Student created successfully!\nEmail: ${newStudentEmail.trim()}\nPassword: ${defaultPassword}\nReg No: ${newStudentRegNo}\n(User can now log in)`);
    } catch (err: any) {
      console.error('Error creating student:', err);
      setError(err.message || String(err));
    } finally {
      setCreatingStudent(false);
    }
  };

  const handleCreateDepartment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newDeptName.trim()) return setError('Department name is required');
    setSubmitting(true);
    setError(null);
    try {
      // update sequentially to satisfy typings
      if (hodId) {
        const { error } = await supabase.from('profiles').update({ department: newDeptName, role: 'hod' }).eq('id', hodId).select();
        if (error) throw error;
      }
      if (ahodId) {
        const { error } = await supabase.from('profiles').update({ department: newDeptName, role: 'ahod' }).eq('id', ahodId).select();
        if (error) throw error;
      }
      // Note: assigning staff and students during department creation removed.

      // Add selected years
      if (selectedYears.length > 0) {
        const yearInserts = selectedYears.map(year => ({
          department: newDeptName.trim(),
          year_number: year
        }));
        const { error } = await supabase.from('years').insert(yearInserts);
        if (error && !error.message.includes('duplicate')) throw error;
      }

      // Insert into departments table (if not exists) and get id
      const deptName = newDeptName.trim();
      let deptId: string | null = null;
      const { data: existingDept } = await supabase.from('departments').select('id').eq('name', deptName).maybeSingle();
      if (existingDept && existingDept.id) {
        deptId = existingDept.id;
      } else {
        const { data: insDept, error: insErr } = await supabase.from('departments').insert({ name: deptName }).select('id').maybeSingle();
        if (insErr) throw insErr;
        deptId = insDept?.id || null;
      }

      // Upsert department_leads mapping HOD/AHOD (map profile id to staff.id when possible)
      if (deptId) {
        // resolve staff ids from selected profile ids (staff row may or may not exist)
        let hodStaffId: string | null = null;
        let ahodStaffId: string | null = null;

        // Ensure HOD has a staff entry
        if (hodId) {
          const { data: hodStaff } = await supabase.from('staff').select('id').eq('id', hodId).maybeSingle();
          if (hodStaff && hodStaff.id) {
            hodStaffId = hodStaff.id;
            // Update staff role if needed
            await supabase.from('staff').update({ staff_role: 'hod' }).eq('id', hodId);
          } else {
            // Create staff entry for HOD
            const { error: hodStaffErr } = await supabase.from('staff').insert({
              id: hodId,
              staff_id: `HOD_${hodId.slice(0, 8)}`,
              staff_role: 'hod',
              on_leave: false
            });
            if (!hodStaffErr) {
              hodStaffId = hodId;
            }
          }
        }

        // Ensure AHOD has a staff entry
        if (ahodId) {
          const { data: ahodStaff } = await supabase.from('staff').select('id').eq('id', ahodId).maybeSingle();
          if (ahodStaff && ahodStaff.id) {
            ahodStaffId = ahodStaff.id;
            // Update staff role if needed
            await supabase.from('staff').update({ staff_role: 'ahod' }).eq('id', ahodId);
          } else {
            // Create staff entry for AHOD
            const { error: ahodStaffErr } = await supabase.from('staff').insert({
              id: ahodId,
              staff_id: `AHOD_${ahodId.slice(0, 8)}`,
              staff_role: 'ahod',
              on_leave: false
            });
            if (!ahodStaffErr) {
              ahodStaffId = ahodId;
            }
          }
        }

        const upsertRow: any = { department_id: deptId, hod_id: hodStaffId, ahod_id: ahodStaffId };
        const { error: upErr } = await supabase.from('department_leads').upsert(upsertRow, { onConflict: 'department_id' }).select();
        if (upErr) throw upErr;
      }

      // refresh data
      const { data: pData } = await supabase.from('profiles').select('id, email, role, name, department').order('department', { ascending: true });
      setProfiles(pData || []);
      const deps = Array.from(new Set((pData || []).map((p: any) => p.department))).sort();
      setDepartments(deps as string[]);

      // Refresh years
      const { data: yData } = await supabase.from('years').select('*').order('department', { ascending: true }).order('year_number', { ascending: true });
      setYears(yData || []);

      resetForm();
      alert('Department created successfully!');
    } catch (err: any) {
      console.error('Error creating department:', err);
      setError(err.message || String(err));
    } finally {
      setSubmitting(false);
    }
  };

  const sidebarItems = [
    { label: 'Dashboard', path: '/admin-dashboard', icon: null },
  ];

  return (
    <DashboardLayout sidebarItems={sidebarItems}>
      <div className="max-w-7xl mx-auto">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-slate-800">Departments</h1>
          <p className="text-slate-600 mt-1">List of departments and their HOD/AHOD/staff/students</p>
        </div>

        {/* Quick create HOD / AHOD */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
          <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-4">
            <h3 className="text-md font-medium mb-2">Create HOD</h3>
            <form onSubmit={handleCreateHod} className="space-y-2">
              <input value={newHodName} onChange={(e) => setNewHodName(e.target.value)} placeholder="Name" className="w-full px-3 py-2 border rounded" />
              <input value={newHodEmail} onChange={(e) => setNewHodEmail(e.target.value)} placeholder="Email" className="w-full px-3 py-2 border rounded" />
              <label className="block text-sm text-slate-600">Date of birth</label>
              <input type="date" value={newHodDob} onChange={(e) => setNewHodDob(e.target.value)} className="w-full px-3 py-2 border rounded" />
              {/* Department will be assigned via the Create Department form; leave blank here */}
              <div className="flex items-center space-x-2">
                <button type="submit" disabled={creatingHod} className="py-2 px-3 bg-green-600 text-white rounded">{creatingHod ? 'Creating...' : 'Create HOD'}</button>
                <button type="button" onClick={() => { setNewHodName(''); setNewHodEmail(''); setNewHodDob(''); }} className="py-2 px-3 border rounded">Reset</button>
              </div>
            </form>
          </div>

          <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-4">
            <h3 className="text-md font-medium mb-2">Create AHOD</h3>
            <form onSubmit={handleCreateAhod} className="space-y-2">
              <input value={newAhodName} onChange={(e) => setNewAhodName(e.target.value)} placeholder="Name" className="w-full px-3 py-2 border rounded" />
              <input value={newAhodEmail} onChange={(e) => setNewAhodEmail(e.target.value)} placeholder="Email" className="w-full px-3 py-2 border rounded" />
              <label className="block text-sm text-slate-600">Date of birth</label>
              <input type="date" value={newAhodDob} onChange={(e) => setNewAhodDob(e.target.value)} className="w-full px-3 py-2 border rounded" />
              {/* Department will be assigned via the Create Department form; leave blank here */}
              <div className="flex items-center space-x-2">
                <button type="submit" disabled={creatingAhod} className="py-2 px-3 bg-green-600 text-white rounded">{creatingAhod ? 'Creating...' : 'Create AHOD'}</button>
                <button type="button" onClick={() => { setNewAhodName(''); setNewAhodEmail(''); setNewAhodDob(''); }} className="py-2 px-3 border rounded">Reset</button>
              </div>
            </form>
          </div>
        </div>

        {/* Create Staff */}
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-4 mb-6">
          <h3 className="text-md font-medium mb-3">Create Staff (Mentor/Advisor/Lecturer)</h3>
          <form onSubmit={handleCreateStaff} className="space-y-3">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                <label className="block text-sm text-slate-600 mb-1">Name *</label>
                <input 
                  value={newStaffName} 
                  onChange={(e) => setNewStaffName(e.target.value)} 
                  placeholder="Staff Name" 
                  className="w-full px-3 py-2 border rounded" 
                />
              </div>
              <div>
                <label className="block text-sm text-slate-600 mb-1">Email *</label>
                <input 
                  value={newStaffEmail} 
                  onChange={(e) => setNewStaffEmail(e.target.value)} 
                  placeholder="Email" 
                  className="w-full px-3 py-2 border rounded" 
                />
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <div>
                <label className="block text-sm text-slate-600 mb-1">Staff Role *</label>
                <select 
                  value={newStaffRole} 
                  onChange={(e) => setNewStaffRole(e.target.value as 'mentor' | 'advisor' | 'lecturer')} 
                  className="w-full px-3 py-2 border rounded"
                >
                  <option value="mentor">Mentor</option>
                  <option value="advisor">Advisor</option>
                  <option value="lecturer">Lecturer</option>
                </select>
              </div>
              <div>
                <label className="block text-sm text-slate-600 mb-1">Department *</label>
                <select 
                  value={newStaffDepartment} 
                  onChange={(e) => setNewStaffDepartment(e.target.value)} 
                  className="w-full px-3 py-2 border rounded"
                >
                  <option value="">— Select Department —</option>
                  {departments.map((dept) => (
                    <option key={dept} value={dept}>{dept}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm text-slate-600 mb-1">Date of birth</label>
                <input 
                  type="date" 
                  value={newStaffDob} 
                  onChange={(e) => setNewStaffDob(e.target.value)} 
                  className="w-full px-3 py-2 border rounded" 
                />
              </div>
            </div>

            {/* Show Year and Section only for Advisor */}
            {newStaffRole === 'advisor' && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 p-3 bg-blue-50 rounded">
                <div>
                  <label className="block text-sm text-slate-700 font-medium mb-1">Year * (Required for Advisor)</label>
                  <select 
                    value={newStaffYear} 
                    onChange={(e) => setNewStaffYear(Number(e.target.value))} 
                    className="w-full px-3 py-2 border rounded"
                  >
                    <option value={1}>Year 1</option>
                    <option value={2}>Year 2</option>
                    <option value={3}>Year 3</option>
                    <option value={4}>Year 4</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm text-slate-700 font-medium mb-1">Section * (Required for Advisor)</label>
                  <input 
                    value={newStaffSection} 
                    onChange={(e) => setNewStaffSection(e.target.value)} 
                    placeholder="e.g., A, B, C" 
                    className="w-full px-3 py-2 border rounded" 
                  />
                </div>
              </div>
            )}

            <div className="flex items-center space-x-2">
              <button type="submit" disabled={creatingStaff} className="py-2 px-4 bg-blue-600 text-white rounded hover:bg-blue-700">
                {creatingStaff ? 'Creating...' : 'Create Staff'}
              </button>
              <button 
                type="button" 
                onClick={() => { 
                  setNewStaffName(''); 
                  setNewStaffEmail(''); 
                  setNewStaffDob(''); 
                  setNewStaffRole('mentor'); 
                  setNewStaffDepartment(''); 
                  setNewStaffYear(1); 
                  setNewStaffSection(''); 
                }} 
                className="py-2 px-4 border rounded hover:bg-slate-50"
              >
                Reset
              </button>
            </div>
          </form>
        </div>

        {/* Import Staff CSV */}
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-4 mb-6">
          <h3 className="text-md font-medium mb-3">Import Staff (CSV)</h3>
          <p className="text-sm text-slate-600 mb-3">CSV columns supported: `name`, `email` (optional), `register_no` (optional). Missing emails will be generated as `first.last@krct.ac.in`. Select department to assign to all imported staff.</p>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-3">
            <div>
              <label className="block text-sm text-slate-600 mb-1">Department</label>
              <select value={staffImportDept} onChange={(e) => setStaffImportDept(e.target.value)} className="w-full px-3 py-2 border rounded">
                <option value="">— Select Department —</option>
                {departments.map((dept) => (
                  <option key={dept} value={dept}>{dept}</option>
                ))}
              </select>
            </div>
            <div className="md:col-span-2">
              <label className="block text-sm text-slate-600 mb-1">CSV file</label>
              <input type="file" accept=".csv,text/csv" onChange={(e) => setStaffImportFile(e.target.files ? e.target.files[0] : null)} className="w-full" />
            </div>
          </div>

          <div className="flex items-center space-x-2 mb-3">
            <button type="button" disabled={!staffImportFile || !staffImportDept || importingStaff} onClick={async () => {
              if (!staffImportFile) return setError('Please choose a CSV file');
              if (!staffImportDept) return setError('Please select a department');
              setImportingStaff(true);
              setStaffImportLog([]);
              setError(null);
              try {
                const text = await staffImportFile.text();
                const lines = text.split(/\r?\n/).filter(l => l.trim() !== '');
                if (lines.length <= 1) throw new Error('CSV appears empty');
                const header = lines[0].split(',').map(h => h.trim().replace(/\"/g, '').toLowerCase());
                const rows = lines.slice(1).map(l => l.split(',').map(c => c.trim().replace(/^"|"$/g, '')));
                const adminUrl = getAdminApiUrl('/create-staff');
                const adminToken = (import.meta as any).env?.VITE_ADMIN_TOKEN || '';
                const results: string[] = [];
                for (let i = 0; i < rows.length; i++) {
                  const row = rows[i];
                  if (row.length === 0 || row.join('').trim() === '') continue;
                  // Map common headers
                  const obj: any = {};
                  header.forEach((h, idx) => { obj[h] = row[idx] || ''; });
                  // Determine name
                  const name = obj['names'] || obj['name'] || obj['full_name'] || obj['names.'] || row[1] || '';
                  if (!name || String(name).trim() === '') { results.push(`SKIP row ${i+2}: missing name`); continue; }
                  // Determine email
                  let email = obj['email'] || obj['e-mail'] || '';
                  if (!email || !String(email).includes('@')) {
                    // generate from name: first.last@krct.ac.in
                    const slug = String(name).toLowerCase().replace(/[^a-z0-9\s\.\-]/g, '').replace(/\s+/g, '.');
                    email = `${slug}@krct.ac.in`;
                  }
                  const body: any = {
                    name: String(name).trim(),
                    email: String(email).trim(),
                    department: staffImportDept,
                    dob: '1990-01-01',
                    password: 'Password123!',
                    staff_role: 'lecturer'
                  };
                  try {
                    try {
                      const resp = await fetch(adminUrl, { method: 'POST', headers: { 'Content-Type': 'application/json', ...(adminToken ? { 'x-admin-token': adminToken } : {}) }, body: JSON.stringify(body) });
                      const json = await resp.json();
                      if (resp.ok && json.ok) {
                        results.push(`OK: ${email}`);
                        continue;
                      }
                      console.warn('Admin import returned non-ok, falling back to DB insert for', email, json);
                    } catch (apiErr) {
                      console.warn('Admin API import failed, falling back to DB insert for', email, apiErr);
                    }

                    // Fallback DB insert: create profile + staff record
                    let uid = (typeof crypto !== 'undefined' && (crypto as any).randomUUID) ? (crypto as any).randomUUID() : `local-${Date.now()}-${Math.floor(Math.random()*10000)}`;
                    // Create or update profile for this email to avoid duplicate key errors
                    const { data: existingProfileRow, error: exProf } = await supabase.from('profiles').select('id').eq('email', String(email).trim()).maybeSingle();
                    if (exProf) {
                      results.push(`ERR: ${email} -> ${exProf.message || JSON.stringify(exProf)}`);
                      continue;
                    }
                    if (existingProfileRow && existingProfileRow.id) {
                      uid = existingProfileRow.id;
                      const { error: upErr } = await supabase.from('profiles').update({ name: String(name).trim(), role: 'staff', department: staffImportDept, dob: '1990-01-01' }).eq('id', uid);
                      if (upErr) {
                        results.push(`ERR: ${email} -> ${upErr.message || JSON.stringify(upErr)}`);
                        continue;
                      }
                    } else {
                      const { error: pErr } = await supabase.from('profiles').insert({ id: uid, email: String(email).trim(), name: String(name).trim(), role: 'staff', department: staffImportDept, dob: '1990-01-01' }).select();
                      if (pErr) {
                        results.push(`ERR: ${email} -> ${pErr.message || JSON.stringify(pErr)}`);
                        continue;
                      }
                    }

                    // Ensure staff row exists with staff_role
                    const { data: sExistImp, error: sExistErr } = await supabase.from('staff').select('id').eq('id', uid).maybeSingle();
                    if (sExistErr) {
                      results.push(`ERR: ${email} -> ${sExistErr.message || JSON.stringify(sExistErr)}`);
                      continue;
                    }
                    if (!sExistImp) {
                      const genStaffIdImp = `STF${Date.now().toString().slice(-6)}`;
                      const { error: sErr } = await supabase.from('staff').insert({ id: uid, staff_id: genStaffIdImp, staff_role: 'lecturer', on_leave: false }).select();
                      if (sErr) {
                        results.push(`ERR: ${email} -> ${sErr.message || JSON.stringify(sErr)}`);
                        continue;
                      }
                    } else {
                      const { error: sUpErr } = await supabase.from('staff').update({ staff_role: 'lecturer', on_leave: false }).eq('id', uid);
                      if (sUpErr) {
                        results.push(`ERR: ${email} -> ${sUpErr.message || JSON.stringify(sUpErr)}`);
                        continue;
                      }
                    }
                    results.push(`OK (db): ${email}`);
                  } catch (e: any) {
                    results.push(`ERR: ${email} -> ${String(e.message || e)}`);
                  }
                }
                setStaffImportLog(results);
              } catch (err: any) {
                setError(err.message || String(err));
              } finally {
                setImportingStaff(false);
              }
            }} className="py-2 px-4 bg-indigo-600 text-white rounded hover:bg-indigo-700 disabled:opacity-50">{importingStaff ? 'Importing...' : 'Import Staff'}</button>

            <button type="button" onClick={() => { setStaffImportFile(null); setStaffImportDept(''); setStaffImportLog([]); }} className="py-2 px-4 border rounded">Reset</button>
          </div>

          {staffImportLog.length > 0 && (
            <div className="bg-slate-50 border border-slate-200 p-3 rounded text-sm">
              <h4 className="font-medium mb-2">Import log</h4>
              <div className="max-h-48 overflow-auto">
                {staffImportLog.map((l, idx) => (<div key={idx} className={l.startsWith('OK') ? 'text-green-700' : l.startsWith('SKIP') ? 'text-yellow-700' : 'text-red-700'}>{l}</div>))}
              </div>
            </div>
          )}
        </div>

        {/* Create Student */}
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-4 mb-6">
          <h3 className="text-md font-medium mb-3">Create Student</h3>
          <form onSubmit={handleCreateStudent} className="space-y-3">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <div>
                <label className="block text-sm text-slate-600 mb-1">Name *</label>
                <input 
                  value={newStudentName} 
                  onChange={(e) => setNewStudentName(e.target.value)} 
                  placeholder="Student Name" 
                  className="w-full px-3 py-2 border rounded" 
                />
              </div>
              <div>
                <label className="block text-sm text-slate-600 mb-1">Email *</label>
                <input 
                  value={newStudentEmail} 
                  onChange={(e) => setNewStudentEmail(e.target.value)} 
                  placeholder="Email" 
                  className="w-full px-3 py-2 border rounded" 
                />
              </div>
              <div>
                <label className="block text-sm text-slate-600 mb-1">Date of Birth</label>
                <input 
                  type="date" 
                  value={newStudentDob} 
                  onChange={(e) => setNewStudentDob(e.target.value)} 
                  className="w-full px-3 py-2 border rounded" 
                />
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                <label className="block text-sm text-slate-600 mb-1">Registration Number *</label>
                <input 
                  value={newStudentRegNo} 
                  onChange={(e) => setNewStudentRegNo(e.target.value)} 
                  placeholder="e.g., REG2025001" 
                  className="w-full px-3 py-2 border rounded" 
                />
              </div>
              <div>
                <label className="block text-sm text-slate-600 mb-1">Roll Number *</label>
                <input 
                  value={newStudentRollNo} 
                  onChange={(e) => setNewStudentRollNo(e.target.value)} 
                  placeholder="e.g., 101" 
                  className="w-full px-3 py-2 border rounded" 
                />
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <div>
                <label className="block text-sm text-slate-600 mb-1">Department *</label>
                <select 
                  value={newStudentDepartment} 
                  onChange={(e) => setNewStudentDepartment(e.target.value)} 
                  className="w-full px-3 py-2 border rounded"
                >
                  <option value="">— Select Department —</option>
                  {departments.map((dept) => (
                    <option key={dept} value={dept}>{dept}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm text-slate-600 mb-1">Year *</label>
                <select 
                  value={newStudentYear} 
                  onChange={(e) => setNewStudentYear(Number(e.target.value))} 
                  className="w-full px-3 py-2 border rounded"
                >
                  <option value={1}>Year 1</option>
                  <option value={2}>Year 2</option>
                  <option value={3}>Year 3</option>
                  <option value={4}>Year 4</option>
                </select>
              </div>
              <div>
                <label className="block text-sm text-slate-600 mb-1">Section *</label>
                <input 
                  value={newStudentSection} 
                  onChange={(e) => setNewStudentSection(e.target.value)} 
                  placeholder="e.g., A, B, C" 
                  className="w-full px-3 py-2 border rounded" 
                />
              </div>
            </div>

            <div className="flex items-center space-x-2">
              <button type="submit" disabled={creatingStudent} className="py-2 px-4 bg-purple-600 text-white rounded hover:bg-purple-700">
                {creatingStudent ? 'Creating...' : 'Create Student'}
              </button>
              <button 
                type="button" 
                onClick={() => { 
                  setNewStudentName(''); 
                  setNewStudentEmail(''); 
                  setNewStudentDob(''); 
                  setNewStudentRegNo(''); 
                  setNewStudentRollNo(''); 
                  setNewStudentDepartment(''); 
                  setNewStudentYear(1); 
                  setNewStudentSection(''); 
                }} 
                className="py-2 px-4 border rounded hover:bg-slate-50"
              >
                Reset
              </button>
            </div>
          </form>
        </div>

        {/* Create department form */}
        <div className="bg-white rounded-xl shadow-lg border border-slate-200 p-6 mb-6">
          <h2 className="text-lg font-semibold mb-4">Create Department</h2>
          {error && <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-2 rounded mb-4">{error}</div>}
          <form onSubmit={handleCreateDepartment} className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="md:col-span-1">
                <label className="block text-sm font-medium text-slate-700 mb-2">Department name</label>
                <input value={newDeptName} onChange={(e) => setNewDeptName(e.target.value)} className="w-full px-3 py-2 border rounded" placeholder="e.g., CSE" />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">HOD (optional)</label>
                <select value={hodId} onChange={(e) => setHodId(e.target.value)} className="w-full px-3 py-2 border rounded">
                  <option value="">— select HOD —</option>
                  {profiles.filter(p => String(p.role).toLowerCase() === 'hod').map((p) => (
                    <option key={p.id} value={p.id}>{p.name} — {p.email}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">AHOD (optional)</label>
                <select value={ahodId} onChange={(e) => setAhodId(e.target.value)} className="w-full px-3 py-2 border rounded">
                  <option value="">— select AHOD —</option>
                  {profiles.filter(p => String(p.role).toLowerCase() === 'ahod').map((p) => (
                    <option key={p.id} value={p.id}>{p.name} — {p.email}</option>
                  ))}
                </select>
              </div>
            </div>

            {/* Years Selection */}
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">Select Years for this Department</label>
              <div className="flex gap-2 flex-wrap">
                {[1, 2, 3, 4].map((year) => (
                  <label key={year} className="flex items-center space-x-2 px-4 py-2 border rounded cursor-pointer hover:bg-slate-50">
                    <input
                      type="checkbox"
                      checked={selectedYears.includes(year)}
                      onChange={() => handleToggleYear(year)}
                      className="form-checkbox h-4 w-4 text-blue-600"
                    />
                    <span className="text-sm">Year {year}</span>
                  </label>
                ))}
              </div>
            </div>

            {/* Add Sections */}
            <div className="border-t pt-4">
              <label className="block text-sm font-medium text-slate-700 mb-2">Add Section (after entering department name)</label>
              <div className="flex gap-2 items-end">
                <div className="flex-1">
                  <label className="block text-xs text-slate-600 mb-1">Year</label>
                  <select value={sectionYear} onChange={(e) => setSectionYear(Number(e.target.value))} className="w-full px-3 py-2 border rounded">
                    <option value={1}>Year 1</option>
                    <option value={2}>Year 2</option>
                    <option value={3}>Year 3</option>
                    <option value={4}>Year 4</option>
                  </select>
                </div>
                <div className="flex-1">
                  <label className="block text-xs text-slate-600 mb-1">Section Name</label>
                  <input
                    value={newSection}
                    onChange={(e) => setNewSection(e.target.value)}
                    className="w-full px-3 py-2 border rounded"
                    placeholder="e.g., A, B, C"
                  />
                </div>
                <button
                  type="button"
                  onClick={handleAddSection}
                  className="py-2 px-4 bg-green-600 text-white rounded hover:bg-green-700"
                >
                  Add Section
                </button>
              </div>
              {sections.filter(s => s.department === newDeptName.trim()).length > 0 && (
                <div className="mt-2 text-sm text-slate-600">
                  <span className="font-medium">Current sections: </span>
                  {sections
                    .filter(s => s.department === newDeptName.trim())
                    .map(s => `Year ${s.year_number}-${s.section_name}`)
                    .join(', ')}
                </div>
              )}
            </div>

            {/* Assign staff/students removed from department creation form */}

            <div className="flex items-center space-x-2">
              <button type="submit" disabled={submitting} className="py-2 px-4 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50">
                {submitting ? 'Creating...' : 'Create Department'}
              </button>
              <button type="button" onClick={resetForm} className="py-2 px-4 border rounded">Reset</button>
            </div>
          </form>
        </div>

        {/* Departments listing removed from this page (kept creation forms only) */}
      </div>
    </DashboardLayout>
  );
}
