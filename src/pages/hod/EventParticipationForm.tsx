import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Upload, X, FileText } from 'lucide-react';
import DashboardLayout from '../../components/DashboardLayout';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';

export default function EventParticipationForm() {
  const navigate = useNavigate();
  const { user, profile } = useAuth();
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [staffData, setStaffData] = useState<any>(null);
  const [proofFiles, setProofFiles] = useState<File[]>([]);
  const [uploadingFiles, setUploadingFiles] = useState(false);
  const [hodForms, setHodForms] = useState<any[]>([]);
  const [loadingHodForms, setLoadingHodForms] = useState(false);
  const [selectedForm, setSelectedForm] = useState<any>(null);

  const [form, setForm] = useState({
    event_title: '',
    mode_of_event: 'offline',
    date_from: '',
    date_to: '',
    nature_of_event: 'Seminar',
    nature_other: '',
    platform: '',
    expected_outcome: '',
    purpose: '',
    is_applying_financial_support: false,
    head_to_be_considered: '',
    already_claimed_amount: '',
    amount_proposed: '',
  });

  useEffect(() => {
    fetchStaffData();
    fetchHodForms();
  }, [user]);

  const fetchHodForms = async () => {
    if (!user) return;
    try {
      setLoadingHodForms(true);
      const { data, error } = await supabase
        .from('event_participation_forms')
        .select('*')
        .eq('staff_id', user.id)
        .order('created_at', { ascending: false });

      if (error) throw error;
      setHodForms(data || []);
    } catch (e) {
      console.error('Failed to fetch HOD forms', e);
    } finally {
      setLoadingHodForms(false);
    }
  };

  const fetchStaffData = async () => {
    if (!user) return;
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('staff')
        .select('*, profiles!staff_id_fkey(name)')
        .eq('id', user.id)
        .single();

      if (error) throw error;
      setStaffData(data);
    } catch (e) {
      console.error('Failed to fetch staff data', e);
    } finally {
      setLoading(false);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      const filesArray = Array.from(e.target.files);
      setProofFiles([...proofFiles, ...filesArray]);
    }
  };

  const removeFile = (index: number) => {
    setProofFiles(proofFiles.filter((_, i) => i !== index));
  };

  const uploadProofFiles = async () => {
    if (proofFiles.length === 0) return [];

    setUploadingFiles(true);
    const uploadedUrls: string[] = [];

    try {
      for (const file of proofFiles) {
        const fileExt = file.name.split('.').pop();
        const fileName = `${user?.id}-${Date.now()}-${Math.random().toString(36).substring(7)}.${fileExt}`;
        const filePath = `event-participation/${fileName}`;

        const { error: uploadError } = await supabase.storage
          .from('certificates')
          .upload(filePath, file);

        if (uploadError) throw uploadError;

        const { data: urlData } = supabase.storage
          .from('certificates')
          .getPublicUrl(filePath);

        uploadedUrls.push(urlData.publicUrl);
      }
    } catch (e) {
      console.error('Failed to upload files', e);
      throw e;
    } finally {
      setUploadingFiles(false);
    }

    return uploadedUrls;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !staffData) return;

    try {
      setSubmitting(true);

      // Upload proof files
      const proofUrls = await uploadProofFiles();

      // Prepare the data
      const eventData = {
        staff_id: user.id,
        staff_name: staffData.profiles?.name || profile?.name || '',
        faculty_id: staffData.staff_id,
        date_of_joining: staffData.date_of_joining || null,
        department: staffData.department || profile?.department || '',
        event_title: form.event_title,
        mode_of_event: form.mode_of_event,
        date_from: form.date_from,
        date_to: form.date_to,
        nature_of_event: form.nature_of_event === 'others' ? form.nature_other : form.nature_of_event,
        platform: form.mode_of_event === 'online' || form.mode_of_event === 'hybrid' ? form.platform : null,
        expected_outcome: form.expected_outcome,
        purpose: form.purpose,
        proof_urls: proofUrls,
        is_applying_financial_support: form.is_applying_financial_support,
        head_to_be_considered: form.is_applying_financial_support ? form.head_to_be_considered : null,
        already_claimed_amount: form.is_applying_financial_support ? parseFloat(form.already_claimed_amount) || 0 : null,
        amount_proposed: form.is_applying_financial_support ? parseFloat(form.amount_proposed) || 0 : null,
        status: 'pending',
        created_at: new Date().toISOString(),
      };

      const { error } = await supabase
        .from('event_participation_forms')
        .insert(eventData);

      if (error) throw error;

      alert('Event participation form submitted successfully!');
      const statusPath = profile?.role === 'ahod' ? '/ahod/event-participation-status' 
        : profile?.role === 'hod' ? '/hod/event-participation' 
        : '/staff/event-participation-status';
      navigate(statusPath);
    } catch (e: any) {
      console.error('Failed to submit form', e);
      alert('Failed to submit form: ' + (e.message || 'Unknown error'));
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center min-h-screen">
          <div className="text-slate-600">Loading...</div>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="max-w-4xl mx-auto px-4 sm:px-6 py-6">
        <h1 className="text-2xl font-bold text-slate-800 mb-6">Event Participation Form</h1>

        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Event Information Section */}
          <div className="bg-white rounded-xl border border-slate-200 p-6">
            <h2 className="text-lg font-semibold text-slate-800 mb-4">Event Information</h2>
            
            <div className="space-y-4">
              {/* Read-only fields */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Name of the Faculty</label>
                  <input
                    type="text"
                    value={staffData?.profiles?.name || profile?.name || ''}
                    disabled
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg bg-slate-50 text-slate-600"
                  />
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Faculty ID</label>
                  <input
                    type="text"
                    value={staffData?.staff_id || ''}
                    disabled
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg bg-slate-50 text-slate-600"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Date of Joining</label>
                  <input
                    type="text"
                    value={staffData?.date_of_joining ? new Date(staffData.date_of_joining).toLocaleDateString() : '-'}
                    disabled
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg bg-slate-50 text-slate-600"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Department</label>
                  <input
                    type="text"
                    value={staffData?.department || profile?.department || ''}
                    disabled
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg bg-slate-50 text-slate-600"
                  />
                </div>
              </div>

              {/* Editable fields */}
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Event Title <span className="text-red-500">*</span></label>
                <input
                  type="text"
                  value={form.event_title}
                  onChange={(e) => setForm({ ...form, event_title: e.target.value })}
                  required
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Mode of Event <span className="text-red-500">*</span></label>
                  <select
                    value={form.mode_of_event}
                    onChange={(e) => setForm({ ...form, mode_of_event: e.target.value })}
                    required
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="offline">Offline</option>
                    <option value="online">Online</option>
                    <option value="hybrid">Hybrid</option>
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Nature of Event <span className="text-red-500">*</span></label>
                  <select
                    value={form.nature_of_event}
                    onChange={(e) => setForm({ ...form, nature_of_event: e.target.value })}
                    required
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="Seminar">Seminar</option>
                    <option value="FDP">FDP</option>
                    <option value="Workshop">Workshop</option>
                    <option value="STTP">STTP</option>
                    <option value="Conference">Conference</option>
                    <option value="Online Courses">Online Courses</option>
                    <option value="others">Others</option>
                  </select>
                </div>
              </div>

              {form.nature_of_event === 'others' && (
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Specify Nature of Event <span className="text-red-500">*</span></label>
                  <input
                    type="text"
                    value={form.nature_other}
                    onChange={(e) => setForm({ ...form, nature_other: e.target.value })}
                    required
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Date From <span className="text-red-500">*</span></label>
                  <input
                    type="date"
                    value={form.date_from}
                    onChange={(e) => setForm({ ...form, date_from: e.target.value })}
                    required
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Date To <span className="text-red-500">*</span></label>
                  <input
                    type="date"
                    value={form.date_to}
                    onChange={(e) => setForm({ ...form, date_to: e.target.value })}
                    required
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>

              {(form.mode_of_event === 'online' || form.mode_of_event === 'hybrid') && (
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Platform <span className="text-red-500">*</span></label>
                  <input
                    type="text"
                    value={form.platform}
                    onChange={(e) => setForm({ ...form, platform: e.target.value })}
                    required
                    placeholder="e.g., Zoom, Google Meet, MS Teams"
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              )}

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Purpose <span className="text-red-500">*</span></label>
                <input
                  type="text"
                  value={form.purpose}
                  onChange={(e) => setForm({ ...form, purpose: e.target.value })}
                  required
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Expected Outcome of the Event <span className="text-red-500">*</span></label>
                <textarea
                  value={form.expected_outcome}
                  onChange={(e) => setForm({ ...form, expected_outcome: e.target.value })}
                  required
                  rows={4}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                />
              </div>

              {/* File Upload */}
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Proof (Upload Files)</label>
                <div className="border-2 border-dashed border-slate-300 rounded-lg p-4">
                  <input
                    type="file"
                    multiple
                    onChange={handleFileChange}
                    className="hidden"
                    id="proof-upload"
                    accept=".pdf,.jpg,.jpeg,.png,.doc,.docx"
                  />
                  <label
                    htmlFor="proof-upload"
                    className="flex flex-col items-center justify-center cursor-pointer"
                  >
                    <Upload className="w-8 h-8 text-slate-400 mb-2" />
                    <span className="text-sm text-slate-600">Click to upload files</span>
                    <span className="text-xs text-slate-500 mt-1">PDF, JPG, PNG, DOC, DOCX</span>
                  </label>
                </div>

                {proofFiles.length > 0 && (
                  <div className="mt-3 space-y-2">
                    {proofFiles.map((file, index) => (
                      <div key={index} className="flex items-center justify-between bg-slate-50 px-3 py-2 rounded">
                        <div className="flex items-center gap-2">
                          <FileText className="w-4 h-4 text-slate-600" />
                          <span className="text-sm text-slate-700">{file.name}</span>
                        </div>
                        <button
                          type="button"
                          onClick={() => removeFile(index)}
                          className="text-red-500 hover:text-red-700"
                        >
                          <X className="w-4 h-4" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Financial Information Section */}
          <div className="bg-white rounded-xl border border-slate-200 p-6">
            <h2 className="text-lg font-semibold text-slate-800 mb-4">Financial Information</h2>
            
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">Is Applying for Financial Support? <span className="text-red-500">*</span></label>
                <div className="flex gap-4">
                  <label className="flex items-center">
                    <input
                      type="radio"
                      checked={form.is_applying_financial_support === true}
                      onChange={() => setForm({ ...form, is_applying_financial_support: true })}
                      className="mr-2"
                    />
                    <span className="text-sm text-slate-700">Yes</span>
                  </label>
                  <label className="flex items-center">
                    <input
                      type="radio"
                      checked={form.is_applying_financial_support === false}
                      onChange={() => setForm({ ...form, is_applying_financial_support: false })}
                      className="mr-2"
                    />
                    <span className="text-sm text-slate-700">No</span>
                  </label>
                </div>
              </div>

              {form.is_applying_financial_support && (
                <>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Head under to be Considered <span className="text-red-500">*</span></label>
                    <select
                      value={form.head_to_be_considered}
                      onChange={(e) => setForm({ ...form, head_to_be_considered: e.target.value })}
                      required
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                    >
                      <option value="">Select Head</option>
                      <option value="Workshop">Workshop</option>
                      <option value="Conference">Conference</option>
                      <option value="Special">Special</option>
                    </select>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1">Already Claimed Amount (Current AY) <span className="text-red-500">*</span></label>
                      <input
                        type="number"
                        value={form.already_claimed_amount}
                        onChange={(e) => setForm({ ...form, already_claimed_amount: e.target.value })}
                        required
                        min="0"
                        step="0.01"
                        placeholder="0.00"
                        className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1">Amount Proposed <span className="text-red-500">*</span></label>
                      <input
                        type="number"
                        value={form.amount_proposed}
                        onChange={(e) => setForm({ ...form, amount_proposed: e.target.value })}
                        required
                        min="0"
                        step="0.01"
                        placeholder="0.00"
                        className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                      />
                    </div>
                  </div>
                </>
              )}
            </div>
          </div>

          {/* Submit Button */}
          <div className="flex justify-end gap-3">
            <button
              type="button"
              onClick={() => navigate(-1)}
              className="px-6 py-2 border border-slate-300 text-slate-700 rounded-lg hover:bg-slate-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting || uploadingFiles}
              className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-slate-300 disabled:cursor-not-allowed"
            >
              {submitting || uploadingFiles ? 'Submitting...' : 'Submit Form'}
            </button>
          </div>
        </form>

        {/* Form Status Section - HOD sees approvals from IQAC and Principal */}
        <div className="mt-8 bg-white rounded-xl border border-slate-200 p-6">
          <h2 className="text-lg font-semibold text-slate-800 mb-4">My Submitted Forms — Status</h2>

          {loadingHodForms ? (
            <div className="text-slate-600">Loading submissions...</div>
          ) : hodForms.length === 0 ? (
            <div className="text-slate-600">You have not submitted any event participation forms yet.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-slate-600">
                    <th className="py-2">Event Title</th>
                    <th className="py-2">Submitted On</th>
                    <th className="py-2">Status</th>
                    <th className="py-2">IQAC Remarks</th>
                    <th className="py-2">Principal Remarks</th>
                    <th className="py-2">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {hodForms.map((f: any) => (
                    <tr key={f.id} className="border-t">
                      <td className="py-2 pr-4">{f.event_title}</td>
                      <td className="py-2 pr-4">{f.created_at ? new Date(f.created_at).toLocaleString() : '-'}</td>
                      <td className="py-2 pr-4">
                        {f.status === 'pending' && <span className="px-2 py-1 rounded bg-slate-100 text-slate-700">Pending</span>}
                        {f.status === 'hod_approved' && <span className="px-2 py-1 rounded bg-green-100 text-green-800">HOD Approved</span>}
                        {f.status === 'hod_rejected' && <span className="px-2 py-1 rounded bg-red-100 text-red-800">HOD Rejected</span>}
                        {f.status === 'iqac_approved' && <span className="px-2 py-1 rounded bg-green-100 text-green-800">IQAC Approved</span>}
                        {f.status === 'iqac_rejected' && <span className="px-2 py-1 rounded bg-red-100 text-red-800">IQAC Rejected</span>}
                        {f.status === 'principal_approved' && <span className="px-2 py-1 rounded bg-green-100 text-green-800">Principal Approved</span>}
                        {f.status === 'principal_rejected' && <span className="px-2 py-1 rounded bg-red-100 text-red-800">Principal Rejected</span>}
                      </td>
                      <td className="py-2 pr-4">{f.iqac_remarks || '-'}</td>
                      <td className="py-2 pr-4">{f.principal_remarks || '-'}</td>
                      <td className="py-2">
                        <button
                          type="button"
                          onClick={() => setSelectedForm(f)}
                          className="px-3 py-1 bg-blue-600 text-white rounded-lg text-sm"
                        >
                          View
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Details Modal */}
        {selectedForm && (
          <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
            <div className="bg-white rounded-lg max-w-2xl w-full p-6">
              <div className="flex justify-between items-start">
                <h3 className="text-lg font-semibold">Submission Details</h3>
                <button onClick={() => setSelectedForm(null)} className="text-slate-600">Close</button>
              </div>

              <div className="mt-4 space-y-3 text-sm text-slate-700">
                <div><strong>Event Title:</strong> {selectedForm.event_title}</div>
                <div><strong>Dates:</strong> {selectedForm.date_from} to {selectedForm.date_to}</div>
                <div><strong>Mode:</strong> {selectedForm.mode_of_event}</div>
                <div><strong>Purpose:</strong> {selectedForm.purpose}</div>
                <div><strong>Expected Outcome:</strong> {selectedForm.expected_outcome}</div>
                <div><strong>Financial Support:</strong> {selectedForm.is_applying_financial_support ? 'Yes' : 'No'}</div>
                <div><strong>IQAC Remarks:</strong> {selectedForm.iqac_remarks || '-'}</div>
                <div><strong>Principal Remarks:</strong> {selectedForm.principal_remarks || '-'}</div>
                <div>
                  <strong>Proofs:</strong>
                  <div className="mt-2 space-y-1">
                    {(selectedForm.proof_urls || []).map((u: string, i: number) => (
                      <div key={i}><a href={u} target="_blank" rel="noreferrer" className="text-blue-600">Document {i + 1}</a></div>
                    ))}
                    {(!selectedForm.proof_urls || selectedForm.proof_urls.length === 0) && <div>-</div>}
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}
