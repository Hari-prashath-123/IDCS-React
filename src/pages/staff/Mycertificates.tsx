import { useEffect, useState, useCallback, useRef } from 'react';
import { X, Eye, UploadCloud, Download, Trash2, Edit } from 'lucide-react';
import DashboardLayout from '../../components/DashboardLayout';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';

interface CertificateItem {
  id: string;
  description: string | null;
  file_url: string;
  certificate_type?: string | null;
  created_at: string;
}

export default function StaffMyCertificates() {
  const { user } = useAuth();
  const [files, setFiles] = useState<File[]>([]);
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [certs, setCerts] = useState<CertificateItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCertModal, setShowCertModal] = useState(false);
  const [currentCertUrl, setCurrentCertUrl] = useState<string | null>(null);
  const [currentCertMeta, setCurrentCertMeta] = useState<any | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const confirmCallbackRef = useRef<(() => void) | null>(null);
  const [confirmTitle, setConfirmTitle] = useState('');
  const [confirmMessage, setConfirmMessage] = useState<string | null>(null);
  const [downloadingAll, setDownloadingAll] = useState(false);
  const certFileInputRefs = useRef<Record<string, HTMLInputElement | null>>({});
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const formRef = useRef<HTMLFormElement | null>(null);

  const extractStoragePathFromUrl = (url?: string | null) => {
    if (!url) return null;
    try {
      const parsed = new URL(url);
      const path = parsed.pathname || parsed.hash || parsed.search || '';

      const storageMarker = '/storage/v1/object/public/';
      const sm = path.indexOf(storageMarker);
      if (sm !== -1) {
        const after = path.substring(sm + storageMarker.length);
        const parts = after.split('/');
        if (parts.length >= 2) {
          parts.shift();
          return decodeURIComponent(parts.join('/'));
        }
      }

      const certIdx = path.indexOf('/certificates/');
      if (certIdx !== -1) {
        return decodeURIComponent(path.substring(certIdx + '/certificates/'.length));
      }

      const asStr = String(url);
      const idx = asStr.indexOf('/certificates/');
      if (idx !== -1) return decodeURIComponent(asStr.substring(idx + '/certificates/'.length));
    } catch (e) {
      // ignore parsing errors
    }
    return null;
  };

  const fetchMyCertificates = useCallback(async () => {
    const authId = user?.id;
    if (!authId) return;
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('certificates')
        .select('id, description, file_url, created_at, certificate_type')
        .eq('user_id', authId)
        .order('created_at', { ascending: false });

      if (error) throw error;
      setCerts((data || []) as CertificateItem[]);
    } catch (e) {
      console.error('Failed to fetch certificates', e);
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    if (user) fetchMyCertificates();
  }, [user, fetchMyCertificates]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    const uploadFiles = files;
    if (!uploadFiles || uploadFiles.length === 0) {
      alert('Please choose a file');
      return;
    }
    const maxBytes = 10 * 1024 * 1024;
    for (const f of uploadFiles) {
      if (f.size > maxBytes) {
        alert(`File "${f.name}" is too large. Maximum allowed size is 10 MB.`);
        return;
      }
    }

    setSubmitting(true);
    try {
      const bucket = 'certificates';
      const staffId = user.id;

      for (const f of uploadFiles) {
        const path = `${staffId}/${Date.now()}-${f.name}`;

        const { error: uploadErr } = await supabase.storage
          .from(bucket)
          .upload(path, f, { cacheControl: '3600', upsert: false });
        if (uploadErr) {
          console.error('Storage upload error', uploadErr);
          throw uploadErr;
        }

        const { data: pub } = supabase.storage.from(bucket).getPublicUrl(path);
        const publicUrl = pub?.publicUrl || '';

        const insertPayload: any = {
          user_id: staffId,
          role: 'staff',
          description: description || null,
          file_url: publicUrl,
          certificate_type: category || null,
        };

        const { error: insertErr } = await supabase.from('certificates').insert(insertPayload);
        if (insertErr) {
          console.error('Insert staff_certificates error', insertErr);
          if ((insertErr as any).message && (insertErr as any).message.includes('row-level security')) {
            throw new Error('Insert failed due to row-level security. Make sure you are signed in and using the correct account.');
          }
          throw insertErr;
        }
      }

      setFiles([]);
      setDescription('');
      setCategory('');
      try { if (fileInputRef.current) fileInputRef.current.value = ''; } catch (err) { console.warn('reset file input error', err); }
      await fetchMyCertificates();
      alert('Certificate(s) uploaded successfully');
    } catch (err: unknown) {
      console.error('Upload failed', err);
      const message = typeof err === 'object' && err && 'message' in err ? String((err as { message?: unknown }).message) : String(err);
      alert('Upload failed: ' + message);
    } finally {
      setSubmitting(false);
    }
  };

  const downloadAllCertificates = async () => {
    if (!certs || certs.length === 0) return;
    setDownloadingAll(true);
    try {
      const eligible = certs.filter((c) => c.file_url && c.file_url.trim() !== '');
      if (eligible.length === 0) {
        alert('No uploaded certificate files to download.');
        return;
      }

      const JSZip = (window as any).JSZip;
      if (!JSZip) {
        const script = document.createElement('script');
        script.src = 'https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js';
        script.async = true;
        document.head.appendChild(script);
        await new Promise((resolve, reject) => {
          script.onload = resolve;
          script.onerror = reject;
        });
      }

      const zip = new (window as any).JSZip();
      for (let idx = 0; idx < eligible.length; idx++) {
        const c = eligible[idx];
        const resp = await fetch(c.file_url);
        const blob = await resp.blob();
        const ext = c.file_url.split('.').pop() || 'pdf';
        const safeDesc = (c.description || `certificate-${idx+1}`).replace(/[^a-zA-Z0-9_\-\. ]/g, '_').trim();
        const filename = `${safeDesc || 'certificate'}.${ext}`;
        zip.file(filename, blob);
      }

      const content = await zip.generateAsync({ type: 'blob' });
      const url = URL.createObjectURL(content);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'my-certificates.zip';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error('Download all failed', err);
      alert('Failed to download certificates');
    } finally {
      setDownloadingAll(false);
    }
  };

  const handleUpdate = async (certId: string, file: File) => {
    if (!user) return;
    setUpdatingId(certId);
    try {
      const cert = certs.find((c) => c.id === certId);
      if (!cert) return;

      const oldPath = extractStoragePathFromUrl(cert.file_url);
      if (oldPath) {
        try {
          await supabase.storage.from('certificates').remove([oldPath]);
        } catch (e) {
          console.warn('Old file removal failed', e);
        }
      }

      const path = `${user.id}/cert-update-${certId}-${Date.now()}-${file.name}`;
      const { error: uploadErr } = await supabase.storage.from('certificates').upload(path, file, { cacheControl: '3600', upsert: false });
      if (uploadErr) throw uploadErr;

      const { data: pub } = supabase.storage.from('certificates').getPublicUrl(path);
      const publicUrl = pub?.publicUrl || '';

      const { error: updateErr } = await supabase
        .from('certificates')
        .update({ file_url: publicUrl })
        .eq('id', certId);
      if (updateErr) throw updateErr;

      await fetchMyCertificates();
      alert('Certificate updated successfully');
    } catch (err) {
      console.error('Update failed', err);
      alert('Update failed');
    } finally {
      setUpdatingId(null);
      try { if (certFileInputRefs.current[certId]) certFileInputRefs.current[certId]!.value = ''; } catch (err) {}
    }
  };

  const handleDelete = async (certId: string) => {
    if (!user) return;
    const cert = certs.find((c) => c.id === certId);
    if (!cert) return;

    setConfirmTitle('Delete Certificate?');
    setConfirmMessage(`Are you sure you want to delete "${cert.description || 'this certificate'}"?`);
    confirmCallbackRef.current = async () => {
      setDeletingId(certId);
      try {
        const oldPath = extractStoragePathFromUrl(cert.file_url);
        if (oldPath) {
          try {
            await supabase.storage.from('certificates').remove([oldPath]);
          } catch (e) {
            console.warn('File removal failed', e);
          }
        }

        const { error } = await supabase.from('certificates').delete().eq('id', certId);
        if (error) throw error;

        await fetchMyCertificates();
        alert('Certificate deleted successfully');
      } catch (err) {
        console.error('Delete failed', err);
        alert('Delete failed');
      } finally {
        setDeletingId(null);
      }
    };
    setConfirmOpen(true);
  };


  return (
    <DashboardLayout>
      <div className="max-w-5xl mx-auto p-4">
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-slate-800">My Certificates</h1>
          <p className="text-slate-600 mt-1">Upload and manage your professional certificates</p>
        </div>

        <form ref={formRef} onSubmit={handleSubmit} className="bg-white rounded-xl border border-slate-200 p-6 mb-6 space-y-4">
          <h2 className="text-lg font-semibold text-slate-800 mb-3">Upload New Certificate</h2>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Certificate File</label>
            <div className="flex items-center gap-3">
              <input
                id="cert-file-input"
                ref={(el) => { fileInputRef.current = el; }}
                type="file"
                accept=".pdf,.png,.jpg,.jpeg"
                multiple
                onChange={(e) => {
                  const incoming = Array.from(e.target.files || []);
                  if (incoming.length === 0) return;

                  const existingKeys = new Set(files.map(f => `${f.name}_${f.size}_${f.lastModified}`));
                  const merged: File[] = [...files];
                  for (const f of incoming) {
                    const key = `${f.name}_${f.size}_${f.lastModified}`;
                    if (!existingKeys.has(key)) {
                      merged.push(f);
                      existingKeys.add(key);
                    }
                  }
                  setFiles(merged);

                  try { if (fileInputRef.current) fileInputRef.current.value = ''; } catch (err) {}
                }}
                className="sr-only"
                required={files.length === 0}
              />

              <label htmlFor="cert-file-input" className="flex-shrink-0 whitespace-nowrap px-4 py-2 bg-white border border-slate-300 rounded-md text-sm text-slate-700 hover:bg-slate-50 cursor-pointer">
                Choose File
              </label>

              <div className="flex items-center gap-2 overflow-x-auto">
                {files.length === 0 ? (
                  <span className="text-sm text-slate-700">No file chosen</span>
                ) : (
                  <div className="flex items-center gap-2">
                    {files.map((f) => {
                      const key = `${f.name}_${f.size}_${f.lastModified}`;
                      return (
                        <div key={key} className="inline-flex items-center gap-2 bg-gray-100 text-slate-700 rounded-full px-3 py-1 text-sm">
                          <span className="truncate max-w-[18ch]">{f.name}</span>
                          <button
                            type="button"
                            aria-label={`Remove ${f.name}`}
                            onClick={() => {
                              setFiles(prev => prev.filter(p => `${p.name}_${p.size}_${p.lastModified}` !== key));
                            }}
                            className="flex items-center justify-center rounded-full w-5 h-5 bg-gray-200 text-gray-600 hover:bg-gray-300"
                          >
                            <X className="w-3 h-3" />
                          </button>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">Description</label>
            <input
              type="text"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="e.g., Python Certification, Workshop Attendance"
              autoComplete="off"
              className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">Category (Optional)</label>
            <input
              type="text"
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              placeholder="e.g., Training, Award, Qualification"
              autoComplete="off"
              className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>

          <div className="pt-2">
            <button
              type="submit"
              disabled={submitting}
              className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50"
            >
              {submitting ? 'Uploading...' : 'Upload Certificate'}
            </button>
          </div>
        </form>

        <div className="mt-8">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-xl font-semibold text-slate-800">My Certificates</h2>
            <div>
              <button
                onClick={downloadAllCertificates}
                disabled={downloadingAll || certs.length === 0}
                className="inline-flex items-center gap-2 px-3 py-1 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50 text-sm"
                title="Download all certificates as ZIP"
              >
                <Download className="w-4 h-4" />
                {downloadingAll ? 'Preparing…' : 'Download All'}
              </button>
            </div>
          </div>
          {loading ? (
            <div className="text-slate-500">Loading...</div>
          ) : certs.length === 0 ? (
            <div className="text-slate-500">No certificates yet.</div>
          ) : (
            <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
              <table className="min-w-full divide-y divide-slate-200 text-sm">
                <thead className="bg-slate-50">
                  <tr>
                    <th className="px-4 py-2 text-left text-slate-600">Description</th>
                    <th className="px-4 py-2 text-left text-slate-600">Category</th>
                    <th className="px-4 py-2 text-left text-slate-600">Uploaded At</th>
                    <th className="px-4 py-2"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {certs.map((c) => (
                    <tr key={c.id} className="hover:bg-slate-50">
                      <td className="px-4 py-2">{c.description || '-'}</td>
                      <td className="px-4 py-2">{c.certificate_type || '-'}</td>
                      <td className="px-4 py-2">{new Date(c.created_at).toLocaleString()}</td>
                      <td className="px-4 py-2 text-right">
                        <div className="flex items-center justify-end gap-3">
                          <button
                            onClick={() => { setCurrentCertUrl(c.file_url); setCurrentCertMeta(c); setShowCertModal(true); }}
                            aria-label="View certificate"
                            title="View certificate"
                            className="p-2 rounded bg-slate-50 text-blue-600 hover:bg-slate-100"
                          >
                            <Eye className="w-4 h-4" />
                          </button>

                          <input
                            ref={(el) => { certFileInputRefs.current[c.id] = el; }}
                            type="file"
                            accept=".pdf,.png,.jpg,.jpeg"
                            className="sr-only"
                            onChange={async (e) => {
                              const f = e.target.files?.[0];
                              if (!f || !user) return;
                              await handleUpdate(c.id, f);
                            }}
                          />
                          <button
                            onClick={() => {
                              setConfirmTitle('Replace certificate?');
                              setConfirmMessage('Are you sure you want to select a new file to replace this certificate?');
                              confirmCallbackRef.current = () => {
                                try { certFileInputRefs.current[c.id]?.click(); } catch (e) { console.error(e); }
                              };
                              setConfirmOpen(true);
                            }}
                            disabled={updatingId === c.id}
                            aria-label="Update certificate"
                            title="Update certificate"
                            className="p-2 rounded bg-slate-50 text-green-600 hover:bg-slate-100 disabled:opacity-50"
                          >
                            <Edit className="w-4 h-4" />
                          </button>

                          <button
                            onClick={() => handleDelete(c.id)}
                            disabled={deletingId === c.id}
                            aria-label="Delete certificate"
                            title="Delete certificate"
                            className="p-2 rounded bg-slate-50 text-red-600 hover:bg-slate-100 disabled:opacity-50"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {showCertModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={() => setShowCertModal(false)}>
          <div className="bg-white rounded-lg max-w-4xl w-full max-h-[90vh] overflow-auto" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between p-4 border-b">
              <h2 className="text-lg font-semibold">
                {currentCertMeta?.description || 'Certificate'}
              </h2>
              <button
                onClick={() => setShowCertModal(false)}
                className="p-2 rounded hover:bg-slate-100"
                aria-label="Close"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-4">
              {currentCertUrl && currentCertUrl.toLowerCase().endsWith('.pdf') ? (
                <iframe src={currentCertUrl} className="w-full h-[70vh]" title="Certificate PDF" />
              ) : (
                <img src={currentCertUrl || ''} alt="Certificate" className="max-w-full h-auto" />
              )}
            </div>
          </div>
        </div>
      )}

      {confirmOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={() => setConfirmOpen(false)}>
          <div className="bg-white rounded-lg max-w-md w-full p-6" onClick={(e) => e.stopPropagation()}>
            <h2 className="text-lg font-semibold mb-3">{confirmTitle}</h2>
            <p className="text-slate-600 mb-6">{confirmMessage}</p>
            <div className="flex justify-end gap-3">
              <button
                onClick={() => setConfirmOpen(false)}
                className="px-4 py-2 bg-slate-200 text-slate-700 rounded hover:bg-slate-300"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  setConfirmOpen(false);
                  confirmCallbackRef.current?.();
                }}
                className="px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </DashboardLayout>
  );
}