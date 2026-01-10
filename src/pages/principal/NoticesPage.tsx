import { useEffect, useState } from 'react';
import DashboardLayout from '../../components/DashboardLayout';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { MessageSquare, PlusCircle, Users, GraduationCap, FileText, Calendar, Target, Trash2, Edit, Eye } from 'lucide-react';

interface Notice {
  id: string;
  title: string;
  description: string;
  attachment_url?: string;
  attachment_name?: string;
  target_audience: 'all' | 'staff' | 'students' | 'department';
  target_departments?: string[];
  is_active: boolean;
  created_at: string;
  created_by: string;
}

export default function PrincipalNoticesPage() {
  const { user, profile } = useAuth();
  const [loading, setLoading] = useState(true);
  const [notices, setNotices] = useState<Notice[]>([]);
  const [departments, setDepartments] = useState<string[]>([]);
  
  // Form states
  const [showForm, setShowForm] = useState(false);
  const [editingNotice, setEditingNotice] = useState<Notice | null>(null);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [targetAudience, setTargetAudience] = useState<'all' | 'staff' | 'students' | 'department'>('all');
  const [selectedDepartments, setSelectedDepartments] = useState<string[]>([]);
  const [attachment, setAttachment] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<'create' | 'manage'>('create');

  useEffect(() => {
    if (!profile || !user) return;
    loadNotices();
    loadDepartments();
  }, [profile, user]);

  const loadNotices = async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('notices')
        .select('*')
        .eq('created_by', user?.id)
        .order('created_at', { ascending: false });
      
      if (error) throw error;
      setNotices(data || []);
    } catch (err: any) {
      console.error('Error loading notices:', err);
      setError('Failed to load notices');
    } finally {
      setLoading(false);
    }
  };

  const loadDepartments = async () => {
    try {
      const { data } = await supabase
        .from('profiles')
        .select('department')
        .in('role', ['staff', 'hod', 'ahod', 'student'])
        .not('department', 'is', null);
      
      const uniqueDepts = Array.from(new Set(data?.map(d => d.department).filter(Boolean))) as string[];
      setDepartments(uniqueDepts.sort());
    } catch (err) {
      console.error('Error loading departments:', err);
    }
  };

  const uploadAttachment = async (file: File): Promise<{ url: string; name: string } | null> => {
    try {
      const fileExt = file.name.split('.').pop();
      const fileName = `${Math.random()}.${fileExt}`;
      const filePath = `notices/${fileName}`;

      const { error: uploadError } = await supabase.storage
        .from('attachments')
        .upload(filePath, file);

      if (uploadError) throw uploadError;

      const { data: { publicUrl } } = supabase.storage
        .from('attachments')
        .getPublicUrl(filePath);

      return { url: publicUrl, name: file.name };
    } catch (err) {
      console.error('Error uploading attachment:', err);
      return null;
    }
  };

  const handleSubmit = async () => {
    if (!title.trim()) {
      setError('Please provide a title');
      return;
    }

    if (targetAudience === 'department' && selectedDepartments.length === 0) {
      setError('Please select at least one department');
      return;
    }

    setSaving(true);
    setError(null);

    try {
      let attachmentData = null;
      if (attachment) {
        attachmentData = await uploadAttachment(attachment);
        if (!attachmentData) {
          throw new Error('Failed to upload attachment');
        }
      }

      const noticeData = {
        title: title.trim(),
        description: description.trim(),
        target_audience: targetAudience,
        target_departments: targetAudience === 'department' ? selectedDepartments : null,
        attachment_url: attachmentData?.url || null,
        attachment_name: attachmentData?.name || null,
        is_active: true,
        created_by: user?.id,
      };

      if (editingNotice) {
        // Update existing notice
        const { error } = await supabase
          .from('notices')
          .update(noticeData)
          .eq('id', editingNotice.id);
        
        if (error) throw error;
      } else {
        // Create new notice
        const { error } = await supabase
          .from('notices')
          .insert([noticeData]);
        
        if (error) throw error;
      }

      // Reset form
      setTitle('');
      setDescription('');
      setTargetAudience('all');
      setSelectedDepartments([]);
      setAttachment(null);
      setEditingNotice(null);
      setShowForm(false);
      
      // Reload notices
      loadNotices();
    } catch (err: any) {
      console.error('Error saving notice:', err);
      setError(err.message || 'Failed to save notice');
    } finally {
      setSaving(false);
    }
  };

  const handleEdit = (notice: Notice) => {
    setEditingNotice(notice);
    setTitle(notice.title);
    setDescription(notice.description);
    setTargetAudience(notice.target_audience);
    setSelectedDepartments(notice.target_departments || []);
    setShowForm(true);
  };

  const handleDelete = async (noticeId: string) => {
    if (!confirm('Are you sure you want to delete this notice?')) return;

    try {
      const { error } = await supabase
        .from('notices')
        .delete()
        .eq('id', noticeId);
      
      if (error) throw error;
      loadNotices();
    } catch (err: any) {
      console.error('Error deleting notice:', err);
      setError('Failed to delete notice');
    }
  };

  const toggleActive = async (noticeId: string, currentStatus: boolean) => {
    try {
      const { error } = await supabase
        .from('notices')
        .update({ is_active: !currentStatus })
        .eq('id', noticeId);
      
      if (error) throw error;
      loadNotices();
    } catch (err: any) {
      console.error('Error updating notice status:', err);
      setError('Failed to update notice status');
    }
  };

  const resetForm = () => {
    setTitle('');
    setDescription('');
    setTargetAudience('all');
    setSelectedDepartments([]);
    setAttachment(null);
    setEditingNotice(null);
    setShowForm(false);
    setError(null);
  };

  const getAudienceDisplay = (notice: Notice) => {
    switch (notice.target_audience) {
      case 'all':
        return 'Everyone';
      case 'staff':
        return 'All Staff';
      case 'students':
        return 'All Students';
      case 'department':
        return `Departments: ${(notice.target_departments || []).join(', ')}`;
      default:
        return 'Unknown';
    }
  };

  const getAudienceIcon = (audience: string) => {
    switch (audience) {
      case 'all':
        return <Users className="h-4 w-4 text-blue-600" />;
      case 'staff':
        return <Users className="h-4 w-4 text-green-600" />;
      case 'students':
        return <GraduationCap className="h-4 w-4 text-purple-600" />;
      case 'department':
        return <Target className="h-4 w-4 text-orange-600" />;
      default:
        return <Users className="h-4 w-4 text-gray-600" />;
    }
  };

  return (
    <DashboardLayout>
      <div className="max-w-7xl mx-auto">
        <div className="mb-6 flex items-center gap-3">
          <div className="bg-blue-100 text-blue-600 p-3 rounded-lg">
            <MessageSquare className="h-6 w-6" />
          </div>
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold text-slate-800">Digital Circulars & Announcements</h1>
            <p className="text-slate-600 mt-1 text-sm sm:text-base">Create and manage notices for staff and students</p>
          </div>
        </div>

        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-4">
          <div className="flex gap-2 w-full sm:w-auto">
            <button 
              onClick={() => setViewMode('create')} 
              className={`flex-1 sm:flex-none px-4 py-2 rounded-lg font-medium ${viewMode==='create'?'bg-blue-600 text-white':'bg-slate-100 text-slate-700 hover:bg-slate-200'}`}
            >
              Create Notice
            </button>
            <button 
              onClick={() => setViewMode('manage')} 
              className={`flex-1 sm:flex-none px-4 py-2 rounded-lg font-medium ${viewMode==='manage'?'bg-blue-600 text-white':'bg-slate-100 text-slate-700 hover:bg-slate-200'}`}
            >
              Manage Notices
            </button>
          </div>
        </div>

        {viewMode === 'create' && (
          <div className="bg-white rounded-xl shadow-lg border border-slate-200 p-6 mb-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-semibold text-slate-800">
                {editingNotice ? 'Edit Notice' : 'Create New Notice'}
              </h2>
              {showForm && (
                <button
                  onClick={resetForm}
                  className="text-slate-500 hover:text-slate-700"
                >
                  Cancel
                </button>
              )}
            </div>
            
            {!showForm ? (
              <button
                onClick={() => setShowForm(true)}
                className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
              >
                <PlusCircle className="h-4 w-4" />
                Create Notice
              </button>
            ) : (
              <div className="space-y-4">
                {error && (
                  <div className="p-3 bg-red-50 border border-red-200 text-red-700 rounded-lg text-sm">
                    {error}
                  </div>
                )}

                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">Title *</label>
                  <input 
                    value={title} 
                    onChange={e => setTitle(e.target.value)} 
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500" 
                    placeholder="Enter notice title"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">Description</label>
                  <textarea 
                    value={description} 
                    onChange={e => setDescription(e.target.value)} 
                    rows={4}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500" 
                    placeholder="Enter detailed description"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">Target Audience *</label>
                  <select 
                    value={targetAudience} 
                    onChange={e => setTargetAudience(e.target.value as any)}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="all">Everyone (All Staff & Students)</option>
                    <option value="staff">Staff Only</option>
                    <option value="students">Students Only</option>
                    <option value="department">Specific Departments</option>
                  </select>
                </div>

                {targetAudience === 'department' && (
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-2">Select Departments *</label>
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 max-h-32 overflow-y-auto border border-slate-200 rounded-lg p-3">
                      {departments.map(dept => (
                        <label key={dept} className="flex items-center gap-2">
                          <input
                            type="checkbox"
                            checked={selectedDepartments.includes(dept)}
                            onChange={e => {
                              if (e.target.checked) {
                                setSelectedDepartments([...selectedDepartments, dept]);
                              } else {
                                setSelectedDepartments(selectedDepartments.filter(d => d !== dept));
                              }
                            }}
                            className="rounded border-slate-300"
                          />
                          <span className="text-sm">{dept}</span>
                        </label>
                      ))}
                    </div>
                  </div>
                )}

                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">Attachment (Optional)</label>
                  <input 
                    type="file"
                    accept=".pdf,.jpg,.jpeg,.png,.doc,.docx"
                    onChange={e => setAttachment(e.target.files?.[0] || null)}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                  <p className="text-xs text-slate-500 mt-1">Supported formats: PDF, Images, Word documents</p>
                </div>

                <div className="flex justify-end gap-3">
                  <button
                    onClick={resetForm}
                    className="px-4 py-2 bg-slate-100 text-slate-700 rounded-lg hover:bg-slate-200 transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleSubmit}
                    disabled={saving}
                    className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  >
                    {saving ? 'Saving...' : editingNotice ? 'Update Notice' : 'Create Notice'}
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {viewMode === 'manage' && (
          <div className="bg-white rounded-xl shadow-lg border border-slate-200 p-6">
            <h2 className="text-xl font-semibold text-slate-800 mb-4">Manage Notices</h2>
            
            {loading ? (
              <div className="py-12 text-center">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto mb-3"></div>
                <p className="text-slate-600">Loading notices...</p>
              </div>
            ) : notices.length === 0 ? (
              <div className="py-12 text-center text-slate-500">
                <FileText className="h-12 w-12 mx-auto mb-3 opacity-50" />
                <p>No notices created yet</p>
              </div>
            ) : (
              <div className="space-y-4">
                {notices.map(notice => (
                  <div key={notice.id} className="border border-slate-200 rounded-lg p-4">
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <div className="flex items-center gap-3 mb-2">
                          <h3 className="text-lg font-semibold text-slate-900">{notice.title}</h3>
                          <span className={`px-2 py-1 text-xs font-medium rounded-full ${
                            notice.is_active ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-800'
                          }`}>
                            {notice.is_active ? 'Active' : 'Inactive'}
                          </span>
                        </div>
                        
                        {notice.description && (
                          <p className="text-slate-600 mb-2">{notice.description}</p>
                        )}
                        
                        <div className="flex items-center gap-4 text-sm text-slate-500">
                          <div className="flex items-center gap-1">
                            {getAudienceIcon(notice.target_audience)}
                            <span>{getAudienceDisplay(notice)}</span>
                          </div>
                          <div className="flex items-center gap-1">
                            <Calendar className="h-4 w-4" />
                            <span>{new Date(notice.created_at).toLocaleDateString()}</span>
                          </div>
                          {notice.attachment_url && (
                            <div className="flex items-center gap-1">
                              <FileText className="h-4 w-4" />
                              <a 
                                href={notice.attachment_url} 
                                target="_blank" 
                                rel="noopener noreferrer"
                                className="text-blue-600 hover:text-blue-800"
                              >
                                {notice.attachment_name}
                              </a>
                            </div>
                          )}
                        </div>
                      </div>
                      
                      <div className="flex items-center gap-2 ml-4">
                        <button
                          onClick={() => toggleActive(notice.id, notice.is_active)}
                          className={`p-2 rounded-lg transition-colors ${
                            notice.is_active 
                              ? 'text-green-600 hover:bg-green-50' 
                              : 'text-gray-600 hover:bg-gray-50'
                          }`}
                          title={notice.is_active ? 'Deactivate' : 'Activate'}
                        >
                          <Eye className="h-4 w-4" />
                        </button>
                        <button
                          onClick={() => handleEdit(notice)}
                          className="p-2 text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                          title="Edit"
                        >
                          <Edit className="h-4 w-4" />
                        </button>
                        <button
                          onClick={() => handleDelete(notice.id)}
                          className="p-2 text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                          title="Delete"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}