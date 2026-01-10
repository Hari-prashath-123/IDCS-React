import { useState } from 'react';
import { Home, Users, Plus, X, Upload, Calendar } from 'lucide-react';
import DashboardLayout from '../../components/DashboardLayout';
import { useAuth } from '../../contexts/AuthContext';
import { supabase } from '../../lib/supabase';
import { useNavigate } from 'react-router-dom';

interface StudentInfo {
  reg_no: string;
  name: string;
  department: string;
  year: number;
  section: string;
  id: string;
}

export default function GroupODPage() {
  const { profile, user } = useAuth();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  
  // Form fields
  const [reason, setReason] = useState('');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [proofFile, setProofFile] = useState<File | null>(null);
  const [uploadingProof, setUploadingProof] = useState(false);
  
  // Student management
  const [regNoInput, setRegNoInput] = useState('');
  const [students, setStudents] = useState<StudentInfo[]>([]);
  const [searchError, setSearchError] = useState('');

  const sidebarItems = [
    { label: 'Dashboard', path: '/pe-dashboard', icon: <Home className="h-5 w-5" /> },
    { label: 'Group OD', path: '/pe/group-od', icon: <Users className="h-5 w-5" /> },
  ];

  const handleAddStudent = async () => {
    if (!regNoInput.trim()) {
      setSearchError('Please enter a register number');
      return;
    }

    setLoading(true);
    setSearchError('');

    try {
      // Check if already added
      if (students.some(s => s.reg_no.toLowerCase() === regNoInput.trim().toLowerCase())) {
        setSearchError('Student already added');
        setLoading(false);
        return;
      }

      // Fetch student by register number
      const { data: studentData, error: studentError } = await supabase
        .from('students')
        .select('id, reg_no, year, section')
        .eq('reg_no', regNoInput.trim())
        .maybeSingle();

      if (studentError) throw studentError;
      if (!studentData) {
        setSearchError('Student not found');
        setLoading(false);
        return;
      }

      // Fetch profile for name and department
      const { data: profileData, error: profileError } = await supabase
        .from('profiles')
        .select('name, department')
        .eq('id', studentData.id)
        .maybeSingle();

      if (profileError) throw profileError;
      if (!profileData) {
        setSearchError('Student profile not found');
        setLoading(false);
        return;
      }

      const newStudent: StudentInfo = {
        reg_no: studentData.reg_no,
        name: profileData.name,
        department: profileData.department,
        year: studentData.year,
        section: studentData.section,
        id: studentData.id,
      };

      setStudents([...students, newStudent]);
      setRegNoInput('');
      setSearchError('');
    } catch (error) {
      console.error('Error fetching student:', error);
      setSearchError('Error fetching student details');
    } finally {
      setLoading(false);
    }
  };

  const handleRemoveStudent = (regNo: string) => {
    setStudents(students.filter(s => s.reg_no !== regNo));
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setProofFile(e.target.files[0]);
    }
  };

  const handleSubmit = async () => {
    // Validation
    if (!reason.trim()) {
      alert('Please enter a reason for the group OD');
      return;
    }
    if (!fromDate) {
      alert('Please select a from date');
      return;
    }
    if (!toDate) {
      alert('Please select a to date');
      return;
    }
    if (students.length === 0) {
      alert('Please add at least one student');
      return;
    }

    setSubmitting(true);

    try {
      let proofUrl: string | null = null;

      // Upload proof file if provided
      if (proofFile) {
        setUploadingProof(true);
        const fileExt = proofFile.name.split('.').pop();
        const fileName = `${user?.id}-${Date.now()}.${fileExt}`;
        const filePath = `group-od-proofs/${fileName}`;

        const { error: uploadError } = await supabase.storage
          .from('od-bucket')
          .upload(filePath, proofFile);

        if (uploadError) {
          console.error('Upload error:', uploadError);
          throw new Error('Failed to upload proof file');
        }

        const { data: urlData } = supabase.storage
          .from('od-bucket')
          .getPublicUrl(filePath);

        proofUrl = urlData.publicUrl;
        setUploadingProof(false);
      }

      // Create group OD application
      const { data: groupODData, error: groupODError } = await supabase
        .from('group_od_applications')
        .insert({
          created_by: user?.id,
          reason,
          from_date: fromDate,
          to_date: toDate,
          proof_url: proofUrl,
          status: 'pending',
        })
        .select()
        .single();

      if (groupODError) throw groupODError;

      // Create individual OD applications for each student
      const odApplications = students.map(student => ({
        student_id: student.id,
        subject: `Group OD - ${reason.substring(0, 50)}`,
        body: reason,
        from_date: fromDate,
        to_date: toDate,
        attachment_url: proofUrl,
        status: 'pending',
        current_approver_level: 'hod',
        group_od_id: groupODData.id,
      }));

      const { error: odError } = await supabase
        .from('od_applications')
        .insert(odApplications);

      if (odError) throw odError;

      alert('Group OD application submitted successfully!');
      
      // Reset form
      setReason('');
      setFromDate('');
      setToDate('');
      setProofFile(null);
      setStudents([]);
      
      navigate('/pe-dashboard');
    } catch (error) {
      console.error('Error submitting group OD:', error);
      alert('Failed to submit group OD application. Please try again.');
    } finally {
      setSubmitting(false);
      setUploadingProof(false);
    }
  };

  return (
    <DashboardLayout sidebarItems={sidebarItems}>
      <div className="max-w-4xl mx-auto px-4 sm:px-6">
        <div className="mb-6">
          <h1 className="text-2xl sm:text-3xl font-bold text-slate-800">Group OD Application</h1>
          <p className="text-sm sm:text-base text-slate-600 mt-1">
            Apply for group on-duty for multiple students
          </p>
        </div>

        <div className="bg-white rounded-xl shadow-lg border border-slate-200 p-6">
          {/* Reason */}
          <div className="mb-6">
            <label className="block text-sm font-medium text-slate-700 mb-2">
              Reason <span className="text-red-500">*</span>
            </label>
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              rows={4}
              placeholder="Enter reason for group OD"
            />
          </div>

          {/* Date Range */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-6">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">
                From Date <span className="text-red-500">*</span>
              </label>
              <input
                type="date"
                value={fromDate}
                onChange={(e) => setFromDate(e.target.value)}
                className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">
                To Date <span className="text-red-500">*</span>
              </label>
              <input
                type="date"
                value={toDate}
                onChange={(e) => setToDate(e.target.value)}
                min={fromDate}
                className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>

          {/* Proof Upload */}
          <div className="mb-6">
            <label className="block text-sm font-medium text-slate-700 mb-2">
              Upload Proof (Optional)
            </label>
            <div className="flex items-center gap-3">
              <label className="flex items-center gap-2 px-4 py-2 bg-slate-100 border border-slate-300 rounded-lg cursor-pointer hover:bg-slate-200 transition-colors">
                <Upload className="h-4 w-4 text-slate-600" />
                <span className="text-sm text-slate-700">Choose File</span>
                <input
                  type="file"
                  onChange={handleFileChange}
                  accept=".pdf,.jpg,.jpeg,.png"
                  className="hidden"
                />
              </label>
              {proofFile && (
                <span className="text-sm text-slate-600">{proofFile.name}</span>
              )}
            </div>
          </div>

          {/* Add Students */}
          <div className="mb-6">
            <label className="block text-sm font-medium text-slate-700 mb-2">
              Add Students <span className="text-red-500">*</span>
            </label>
            <div className="flex gap-2 mb-3">
              <input
                type="text"
                value={regNoInput}
                onChange={(e) => setRegNoInput(e.target.value)}
                onKeyPress={(e) => e.key === 'Enter' && handleAddStudent()}
                placeholder="Enter register number"
                className="flex-1 border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <button
                onClick={handleAddStudent}
                disabled={loading}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50 flex items-center gap-2"
              >
                <Plus className="h-4 w-4" />
                Add Student
              </button>
            </div>
            {searchError && (
              <p className="text-sm text-red-600 mb-2">{searchError}</p>
            )}

            {/* Students List */}
            {students.length > 0 && (
              <div className="border border-slate-200 rounded-lg overflow-hidden">
                <table className="w-full">
                  <thead className="bg-slate-50">
                    <tr>
                      <th className="px-4 py-3 text-left text-xs font-medium text-slate-700">Reg No</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-slate-700">Name</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-slate-700">Department</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-slate-700">Year</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-slate-700">Section</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-slate-700">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200">
                    {students.map((student) => (
                      <tr key={student.reg_no} className="hover:bg-slate-50">
                        <td className="px-4 py-3 text-sm text-slate-800">{student.reg_no}</td>
                        <td className="px-4 py-3 text-sm text-slate-800">{student.name}</td>
                        <td className="px-4 py-3 text-sm text-slate-600">{student.department}</td>
                        <td className="px-4 py-3 text-sm text-slate-600">{student.year}</td>
                        <td className="px-4 py-3 text-sm text-slate-600">{student.section}</td>
                        <td className="px-4 py-3">
                          <button
                            onClick={() => handleRemoveStudent(student.reg_no)}
                            className="text-red-600 hover:text-red-700"
                          >
                            <X className="h-4 w-4" />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Submit Button */}
          <div className="flex justify-end gap-3">
            <button
              onClick={() => navigate('/pe-dashboard')}
              className="px-6 py-2 border border-slate-300 text-slate-700 rounded-lg text-sm font-medium hover:bg-slate-50"
            >
              Cancel
            </button>
            <button
              onClick={handleSubmit}
              disabled={submitting || uploadingProof}
              className="px-6 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {submitting ? 'Submitting...' : uploadingProof ? 'Uploading...' : 'Submit Group OD'}
            </button>
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}
