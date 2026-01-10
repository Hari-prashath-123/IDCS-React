import { useEffect, useState, useCallback, useRef } from 'react';
import { X, Eye, UploadCloud } from 'lucide-react';
import DashboardLayout from '../../components/DashboardLayout';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';

interface CertificateItem {
  id: string;
  description: string | null;
  file_url: string;
  od_application_id?: string | null;
  certificate_type?: string | null;
  created_at: string;
}

export default function CertificateUpload() {
  const { user } = useAuth();
  const [files, setFiles] = useState<File[]>([]);
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState<'event' | 'exam' | 'course' | null>(null);
  const [eventCollege, setEventCollege] = useState('');
  const [certificateType, setCertificateType] = useState<'participation' | 'award' | 'winner'>('participation');
  const [examName, setExamName] = useState('');
  const [courseName, setCourseName] = useState('');
  const [odApplicationId, setOdApplicationId] = useState<string | null>(null);
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
  const [approvedODs, setApprovedODs] = useState<Array<any>>([]);
  const odFileInputRefs = useRef<Record<string, HTMLInputElement | null>>({});
  const certFileInputRefs = useRef<Record<string, HTMLInputElement | null>>({});
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const extractStoragePathFromUrl = (url?: string | null) => {
    if (!url) return null;
    try {
      // Try parsing as a URL to more reliably extract the path
      const parsed = new URL(url);
      const path = parsed.pathname || parsed.hash || parsed.search || '';

      // Common Supabase public URL: /storage/v1/object/public/<bucket>/<path>
      const storageMarker = '/storage/v1/object/public/';
      const sm = path.indexOf(storageMarker);
      if (sm !== -1) {
        const after = path.substring(sm + storageMarker.length);
        // after === '<bucket>/<object-path>'
        const parts = after.split('/');
        if (parts.length >= 2) {
          // remove the bucket name
          parts.shift();
          return decodeURIComponent(parts.join('/'));
        }
      }

      // Fallback: look for '/certificates/' segment anywhere in the pathname
      const certIdx = path.indexOf('/certificates/');
      if (certIdx !== -1) {
        return decodeURIComponent(path.substring(certIdx + '/certificates/'.length));
      }

      // As a last resort, inspect the full URL string for the certificates segment
      const asStr = String(url);
      const idx = asStr.indexOf('/certificates/');
      if (idx !== -1) return decodeURIComponent(asStr.substring(idx + '/certificates/'.length));
    } catch (e) {
      // ignore parsing errors and fall through to null
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
        .select('id, description, file_url, created_at, od_application_id, certificate_type')
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

  // Load JSZip at runtime from CDN if not available locally.
  const getJSZip = async (): Promise<any> => {
    // If already available on window, use it
    if ((window as any).JSZip) return (window as any).JSZip;

    // Try dynamic import first (will only work if package is installed)
    try {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const mod = await import('jszip');
      const ctor = mod?.default || mod;
      (window as any).JSZip = ctor;
      return ctor;
    } catch (err) {
      // ignore and fall through to CDN loader
    }

    // Load from jsDelivr CDN as a fallback
    return new Promise((resolve, reject) => {
      const existing = (window as any).JSZip;
      if (existing) return resolve(existing);
      const script = document.createElement('script');
      script.src = 'https://cdn.jsdelivr.net/npm/jszip@3.10.1/dist/jszip.min.js';
      script.async = true;
      script.onload = () => {
        const w = (window as any).JSZip;
        if (w) resolve(w);
        else reject(new Error('JSZip not available after CDN load'));
      };
      script.onerror = () => reject(new Error('Failed to load JSZip from CDN'));
      document.head.appendChild(script);
    });
  };

  const downloadAllCertificates = async () => {
    if (!certs || certs.length === 0) return;
    const items = certs.filter(c => c.file_url && c.file_url.trim() !== '');
    if (items.length === 0) {
      alert('No uploaded certificate files to download.');
      return;
    }
    setDownloadingAll(true);
    try {
      const JSZipCtor = await getJSZip();
      const zip = new JSZipCtor();
      // fetch each file and add to zip
      await Promise.all(items.map(async (c, idx) => {
        try {
          const resp = await fetch(c.file_url!, { mode: 'cors' });
          if (!resp.ok) throw new Error(`Failed to fetch ${c.file_url}`);
          const blob = await resp.blob();
          const extMatch = (c.file_url || '').match(/\.([a-z0-9]+)(?:\?|$)/i);
          const ext = extMatch ? extMatch[1] : (blob.type ? blob.type.split('/').pop() : 'bin');
          // build filename: description or fallback to timestamp-name
          const safeDesc = (c.description || `certificate-${idx+1}`).replace(/[^a-zA-Z0-9_\-\. ]/g, '_').trim();
          const filename = `${safeDesc || 'certificate'}.${ext}`;
          const arrayBuffer = await blob.arrayBuffer();
          zip.file(filename, arrayBuffer);
        } catch (err) {
          console.warn('Failed to add to zip', err);
        }
      }));

      const content = await zip.generateAsync({ type: 'blob' });
      const url = URL.createObjectURL(content);
      const a = document.createElement('a');
      const now = new Date().toISOString().replace(/[:.]/g, '-');
      a.href = url;
      a.download = `certificates-${now}.zip`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error('Download all failed', err);
      alert('Failed to download all certificates: ' + String(err));
    } finally {
      setDownloadingAll(false);
    }
  };

  const fetchApprovedODs = useCallback(async () => {
    const authId = user?.id;
    if (!authId) return;
    try {
      const { data, error } = await supabase
        .from('od_applications')
        .select('*')
        .eq('student_id', authId)
        .eq('status', 'approved')
        .order('created_at', { ascending: false });

      if (error) throw error;
      setApprovedODs(data || []);
    } catch (e) {
      console.error('Failed to fetch approved OD applications', e);
      setApprovedODs([]);
    }
  }, [user]);

  useEffect(() => {
    if (user) fetchMyCertificates();
    if (user) fetchApprovedODs();
  }, [user, fetchMyCertificates, fetchApprovedODs]);

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const formRef = useRef<HTMLFormElement | null>(null);

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
      const studentId = user.id;

      for (const f of uploadFiles) {
        const path = odApplicationId ? `${user.id}/od-${odApplicationId}-${Date.now()}-${f.name}` : `${user.id}/${Date.now()}-${f.name}`;

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
          user_id: studentId,
          role: 'student',
          description: description || null,
          file_url: publicUrl,
        };

        if (odApplicationId) insertPayload.od_application_id = odApplicationId;

        // Attach category-specific metadata if provided (do not insert 'category' field
        // because the certificates table may not have that column in some schemas)
        if (category === 'event') {
          if (eventCollege) insertPayload.event_college = eventCollege;
          if (certificateType) insertPayload.certificate_type = certificateType;
        }
        if (category === 'exam' && examName) insertPayload.exam_name = examName;
        if (category === 'course' && courseName) insertPayload.course_name = courseName;

        const { error: insertErr } = await supabase.from('certificates').insert(insertPayload);
        if (insertErr) {
          console.error('Insert certificates error', insertErr);
          if ((insertErr as any).message && (insertErr as any).message.includes('row-level security')) {
            throw new Error('Insert failed due to row-level security. Make sure you are signed in and using the correct account.');
          }
          throw insertErr;
        }
      }

      setFiles([]);
      setDescription('');
      setCategory(null);
      setOdApplicationId(null);
      setEventCollege('');
      setCertificateType('participation');
      setExamName('');
      setCourseName('');
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

  const openFormForEvent = (od: any) => {
    // Prefill the main form with event details so the student can complete and upload
    setCategory('event');
    setDescription(od.subject || od.reason || `OD ${od.id}`);
    setEventCollege(od.college || od.institute || '');
    setCertificateType('participation');
    setOdApplicationId(od.id);
    // Scroll the form into view so user can fill remaining fields and upload
    setTimeout(() => {
      try { formRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' }); } catch (e) {}
    }, 50);
  };

  return (
    <DashboardLayout>
      <div className="max-w-3xl mx-auto">
        <h1 className="text-2xl font-bold text-slate-800 mb-4">Upload Certificate</h1>
        <p className="text-slate-600 mb-6">Submit your certificate file with a short note. Your mentor, advisor, and HOD will be able to view it.</p>

        <form ref={(el) => { formRef.current = el; }} onSubmit={handleSubmit} className="bg-white rounded-xl border border-slate-200 p-6 shadow-sm space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Category</label>
            <div className="flex items-center space-x-4">
              <label className="inline-flex items-center space-x-2">
                <input
                  type="checkbox"
                  checked={category === 'event'}
                  onChange={(e) => setCategory(e.target.checked ? 'event' : null)}
                />
                <span className="text-sm">Event</span>
              </label>
              <label className="inline-flex items-center space-x-2">
                <input
                  type="checkbox"
                  checked={category === 'exam'}
                  onChange={(e) => setCategory(e.target.checked ? 'exam' : null)}
                />
                <span className="text-sm">Exam</span>
              </label>
              <label className="inline-flex items-center space-x-2">
                <input
                  type="checkbox"
                  checked={category === 'course'}
                  onChange={(e) => setCategory(e.target.checked ? 'course' : null)}
                />
                <span className="text-sm">Course</span>
              </label>
            </div>
          </div>

          {/* Event Category */}
          {category === 'event' && (
            <div className="space-y-3">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">College / Institute Name</label>
                <input
                  type="text"
                  value={eventCollege}
                  onChange={(e) => setEventCollege(e.target.value)}
                  placeholder="e.g., ABC Institute of Technology"
                  className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">Certificate Type</label>
                <div className="flex items-center space-x-4">
                    <label className="inline-flex items-center space-x-2">
                      <input type="radio" name="cert-type" checked={certificateType === 'participation'} onChange={() => setCertificateType('participation')} />
                      <span className="text-sm">Participation</span>
                    </label>
                    <label className="inline-flex items-center space-x-2">
                      <input type="radio" name="cert-type" checked={certificateType === 'award'} onChange={() => setCertificateType('award')} />
                      <span className="text-sm">Award</span>
                    </label>
                    <label className="inline-flex items-center space-x-2">
                      <input type="radio" name="cert-type" checked={certificateType === 'winner'} onChange={() => setCertificateType('winner')} />
                      <span className="text-sm">Winner</span>
                    </label>
                  </div>
              </div>
            </div>
          )}

          {/* Exam Category */}
          {category === 'exam' && (
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">Exam Name</label>
              <input
                type="text"
                value={examName}
                onChange={(e) => setExamName(e.target.value)}
                placeholder="e.g., University Semester Exam"
                className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>
          )}

          {/* Course Category */}
          {category === 'course' && (
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">Course Name</label>
              <input
                type="text"
                value={courseName}
                onChange={(e) => setCourseName(e.target.value)}
                placeholder="e.g., Data Structures"
                className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>
          )}

          {/* Final Upload Section (always visible) */}
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

                  // Merge with existing files and avoid duplicates by name+size+lastModified
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

                  // Reset native input value so same file can be selected again if user removed it
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

          {/* Approved OD forms are shown in a separate Events section below the form */}

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">Description</label>
            <input
              type="text"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder=""
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
              {submitting ? 'Submitting...' : 'Submit'}
            </button>
          </div>
        </form>

        {/* Events: Approved OD forms (separate from the upload form) */}
        {approvedODs.length > 0 && (
          <div className="mt-6 bg-white rounded-xl border border-slate-200 p-4">
            <h2 className="text-lg font-semibold text-slate-800 mb-3">Events</h2>
            <div className="space-y-3">
              {approvedODs
                .filter((od: any) => {
                  // hide events that already have a certificate (either by od_application_id or matching file_url)
                  return !certs.some((c) => (c.od_application_id && c.od_application_id === od.id) || c.file_url === od.attachment_url);
                })
                .map((od: any) => {
                const hasCert = certs.some(c => c.file_url === od.attachment_url);
                const noCert = Boolean(od.no_certificate);
                return (
                  <div key={od.id} className="flex items-center justify-between gap-3">
                    <div className="flex-1">
                      <div className="text-sm font-medium text-slate-800">{od.subject || od.reason || `OD ${od.id}`}</div>
                      <div className="text-sm text-slate-500">{od.from_date ? new Date(od.from_date).toLocaleDateString() : ''}{od.to_date ? ` — ${new Date(od.to_date).toLocaleDateString()}` : ''}</div>
                      {od.attachment_url && (
                        <div className="mt-1 text-sm">
                          <button
                            onClick={() => {
                              setCurrentCertUrl(od.attachment_url);
                              setCurrentCertMeta({
                                description: od.subject || od.reason || `OD ${od.id}`,
                                from_date: od.from_date,
                                to_date: od.to_date,
                                event_college: od.college || od.institute || od.event_college || null,
                                exam_name: od.exam_name || null,
                                course_name: od.course_name || null,
                                attachment_url: od.attachment_url,
                              });
                              setShowCertModal(true);
                            }}
                            aria-label="View proof"
                            title="View proof"
                            className="p-2 rounded bg-slate-50 text-blue-600 hover:bg-slate-100"
                          >
                            <Eye className="w-4 h-4" />
                          </button>
                        </div>
                      )}
                    </div>
                    <div className="flex-shrink-0 flex items-center gap-3">
                      {/* No Certificate toggle */}
                      <label className="inline-flex items-center space-x-2">
                        <input
                          type="checkbox"
                          checked={noCert}
                          onChange={async (e) => {
                            if (!user) return;
                            const setNo = e.target.checked;
                            try {
                              // Update od_applications with no_certificate flag
                              const { error: updErr } = await supabase.from('od_applications').update({ no_certificate: setNo }).eq('id', od.id);
                              if (updErr) { console.error('Failed to update OD no_certificate', updErr); alert('Failed to update event'); return; }

                              // If setting no certificate, create a stub certificate row so it appears in "My Certificates"
                              if (setNo) {
                                try {
                                  const { data: existing } = await supabase.from('certificates').select('id').eq('od_application_id', od.id).eq('user_id', user.id).limit(1);
                                  if (!existing || (Array.isArray(existing) && existing.length === 0)) {
                                    const payload: any = {
                                      user_id: user.id,
                                      role: 'student',
                                      description: 'No Certificate',
                                      file_url: '',
                                      od_application_id: od.id,
                                    };
                                    const { error: insertErr } = await supabase.from('certificates').insert(payload);
                                    if (insertErr) {
                                      console.error('Failed to insert no-certificate row', insertErr);
                                      alert('Failed to mark as no-certificate');
                                      // still refresh lists below
                                    }
                                  }
                                } catch (ie) {
                                  console.error('Error ensuring no-certificate row', ie);
                                }
                              } else {
                                // Removing the no-certificate flag: delete any placeholder certificate rows for this OD
                                try {
                                  const { error: delErr } = await supabase.from('certificates').delete().eq('od_application_id', od.id).eq('user_id', user.id);
                                  if (delErr) {
                                    console.error('Failed to remove no-certificate row', delErr);
                                    alert('Failed to remove no-certificate record');
                                  }
                                } catch (de) {
                                  console.error('Error deleting no-certificate row', de);
                                }
                              }

                              await fetchApprovedODs();
                              await fetchMyCertificates();
                              if (setNo) {
                                alert('Marked event as having no certificate');
                              } else {
                                alert('Unmarked event as having a certificate (you can upload now)');
                              }
                            } catch (err) {
                              console.error('Error toggling no_certificate', err);
                              alert('Failed to update event');
                            }
                          }}
                        />
                        <span className="text-sm">No Certificate</span>
                      </label>

                      {hasCert ? (
                        <span className="inline-block px-3 py-1 rounded-full bg-green-100 text-green-700 text-sm">Certificate uploaded</span>
                      ) : noCert ? (
                        <span className="inline-block px-3 py-1 rounded-full bg-yellow-100 text-yellow-700 text-sm">Marked no certificate</span>
                      ) : (
                        <>
                          <input
                            ref={(el) => { odFileInputRefs.current[od.id] = el; }}
                            type="file"
                            accept=".pdf,.png,.jpg,.jpeg"
                            className="sr-only"
                            onChange={async (e) => {
                              if (od.no_certificate) return; // safety
                              const f = e.target.files?.[0];
                              if (!f || !user) return;
                              try {
                                const path = `${user.id}/od-${od.id}-${Date.now()}-${f.name}`;
                                const { error: uploadErr } = await supabase.storage.from('certificates').upload(path, f, { cacheControl: '3600', upsert: false });
                                if (uploadErr) { console.error('Upload error', uploadErr); alert('Upload failed'); return; }
                                const { data: pub } = supabase.storage.from('certificates').getPublicUrl(path);
                                const publicUrl = pub?.publicUrl || '';
                                const payload: any = { user_id: user.id, role: 'student', description: od.subject || od.reason || `OD ${od.id}`, file_url: publicUrl, od_application_id: od.id };
                                const { error: insertErr } = await supabase.from('certificates').insert(payload);
                                if (insertErr) { console.error('Insert error', insertErr); alert('Failed to save certificate'); return; }
                                await fetchMyCertificates();
                                await fetchApprovedODs();
                                alert('Certificate uploaded for OD');
                              } catch (err) {
                                console.error('OD upload failed', err);
                                alert('Upload failed');
                              } finally {
                                try { if (odFileInputRefs.current[od.id]) odFileInputRefs.current[od.id]!.value = ''; } catch (err) { console.warn('reset od file input error', err); }
                              }
                            }}
                          />
                          <button onClick={() => openFormForEvent(od)} className="px-3 py-1 bg-blue-600 text-white rounded hover:bg-blue-700 text-sm">Upload Certificate</button>
                        </>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

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
                {downloadingAll ? 'Preparing…' : 'Download all'}
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
                    <th className="px-4 py-2 text-left text-slate-600">Uploaded At</th>
                    <th className="px-4 py-2"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {certs.map((c) => (
                    <tr key={c.id} className="hover:bg-slate-50">
                      <td className="px-4 py-2">{c.description || '-'}</td>
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

                          {/* Hidden file input for updating certificate */}
                          <input
                            ref={(el) => { certFileInputRefs.current[c.id] = el; }}
                            type="file"
                            accept=".pdf,.png,.jpg,.jpeg"
                            className="sr-only"
                            onChange={async (e) => {
                              const f = e.target.files?.[0];
                              if (!f || !user) return;
                              setUpdatingId(c.id);
                              try {
                                const path = `${user.id}/cert-update-${c.id}-${Date.now()}-${f.name}`;
                                const { error: uploadErr } = await supabase.storage.from('certificates').upload(path, f, { cacheControl: '3600', upsert: false });
                                if (uploadErr) { console.error('Update upload error', uploadErr); alert('Upload failed'); return; }
                                const { data: pub } = supabase.storage.from('certificates').getPublicUrl(path);
                                const publicUrl = pub?.publicUrl || '';

                                const { error: updateErr } = await supabase.from('certificates').update({ file_url: publicUrl }).eq('id', c.id);
                                if (updateErr) { console.error('Failed to update certificate row', updateErr); alert('Failed to update certificate record'); return; }

                                await fetchMyCertificates();
                                alert('Certificate updated');
                              } catch (err) {
                                console.error('Certificate update failed', err);
                                alert('Update failed');
                              } finally {
                                setUpdatingId(null);
                                try { if (certFileInputRefs.current[c.id]) certFileInputRefs.current[c.id]!.value = ''; } catch (err) { console.warn('reset cert file input error', err); }
                              }
                            }}
                          />

                          <button
                            onClick={() => {
                              setConfirmTitle('Update certificate');
                              setConfirmMessage('Select a file to replace this certificate?');
                              confirmCallbackRef.current = () => { certFileInputRefs.current[c.id]?.click(); };
                              setConfirmOpen(true);
                            }}
                            disabled={Boolean(updatingId)}
                            aria-label="Update certificate"
                            title="Update certificate"
                            className="p-2 bg-emerald-600 text-white rounded hover:bg-emerald-700 disabled:opacity-50"
                          >
                            <UploadCloud className={updatingId === c.id ? 'w-4 h-4 animate-spin' : 'w-4 h-4'} />
                          </button>
                          <button
                            disabled={deletingId === c.id}
                            aria-label="Delete certificate"
                            onClick={() => {
                              setConfirmTitle('Delete certificate');
                              setConfirmMessage('Delete this certificate? This cannot be undone.');
                              confirmCallbackRef.current = () => {
                                // run async deletion inside an IIFE
                                (async () => {
                                  setDeletingId(c.id);
                                  try {
                                    const path = extractStoragePathFromUrl(c.file_url);
                                    if (path) {
                                      const { error: remErr } = await supabase.storage.from('certificates').remove([path]);
                                      if (remErr) {
                                        console.warn('Failed to remove storage object', remErr);
                                        alert('Warning: failed to remove storage object. Proceeding to delete database record.');
                                      }
                                    } else {
                                      console.warn('Could not derive storage path from file_url, skipping storage removal');
                                    }

                                    const { error: delErr } = await supabase.from('certificates').delete().eq('id', c.id);
                                    if (delErr) {
                                      console.error('Failed to delete certificate row', delErr);
                                      const msg = (delErr as any)?.message || String(delErr);
                                      alert('Failed to delete certificate: ' + msg);
                                      return;
                                    }

                                    await fetchMyCertificates();
                                    alert('Certificate deleted');
                                  } catch (err) {
                                    console.error('Delete failed', err);
                                    alert('Delete failed: ' + (err && typeof err === 'object' && 'message' in err ? String((err as any).message) : String(err)));
                                  } finally {
                                    setDeletingId(null);
                                  }
                                })();
                              };
                              setConfirmOpen(true);
                            }}
                            className="p-2 bg-red-50 text-red-600 rounded hover:bg-red-100 disabled:opacity-50"
                          >
                            <X className="w-4 h-4" />
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

        {showCertModal && currentCertUrl && (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-75 p-4"
            onClick={() => setShowCertModal(false)}
          >
            <div className="relative max-w-4xl max-h-[90vh] w-full">
              <button
                onClick={() => setShowCertModal(false)}
                className="absolute -top-10 right-0 text-white hover:text-gray-300 transition-colors"
              >
                <X className="h-8 w-8" />
              </button>
              <div
                className="bg-white rounded-lg overflow-hidden shadow-2xl"
                onClick={(e) => e.stopPropagation()}
              >
                <div className="p-4 border-b border-slate-100">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <div className="text-sm font-medium text-slate-800">{currentCertMeta?.description || 'Certificate'}</div>
                      <div className="text-xs text-slate-500">
                        {currentCertMeta?.created_at ? new Date(currentCertMeta.created_at).toLocaleString() : (
                          currentCertMeta?.from_date ? `${new Date(currentCertMeta.from_date).toLocaleDateString()}${currentCertMeta?.to_date ? ` — ${new Date(currentCertMeta.to_date).toLocaleDateString()}` : ''}` : ''
                        )}
                      </div>
                      {currentCertMeta?.certificate_type && <div className="text-xs text-slate-500 mt-1">Type: {currentCertMeta.certificate_type}</div>}
                      {currentCertMeta?.event_college && <div className="text-xs text-slate-500 mt-1">College: {currentCertMeta.event_college}</div>}
                      {currentCertMeta?.exam_name && <div className="text-xs text-slate-500 mt-1">Exam: {currentCertMeta.exam_name}</div>}
                      {currentCertMeta?.course_name && <div className="text-xs text-slate-500 mt-1">Course: {currentCertMeta.course_name}</div>}
                      {/* OD ID removed from view per request */}
                    </div>
                    <div className="text-xs text-slate-500">{currentCertMeta?.student_id ? `Student: ${currentCertMeta.student_id}` : ''}</div>
                  </div>
                </div>
                <div className="p-4">
                  {currentCertUrl && currentCertUrl.match(/\.(jpg|jpeg|png|gif|webp)$/i) ? (
                    <img
                      src={currentCertUrl}
                      alt="Certificate document"
                      className="w-full h-auto max-h-[60vh] object-contain"
                    />
                  ) : currentCertUrl ? (
                    <iframe
                      src={currentCertUrl}
                      className="w-full h-[60vh]"
                      title="Certificate document"
                    />
                  ) : (
                    <div className="py-12 text-center text-slate-500">No certificate file available</div>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Confirmation dialog used for view/update actions */}
        {confirmOpen && (
          <div className="fixed inset-0 z-60 flex items-center justify-center bg-black bg-opacity-50 p-4">
            <div className="bg-white rounded-lg shadow-xl max-w-md w-full p-6" onClick={(e) => e.stopPropagation()}>
              <h3 className="text-lg font-medium text-slate-800 mb-2">{confirmTitle}</h3>
              {confirmMessage && <p className="text-sm text-slate-600 mb-4">{confirmMessage}</p>}
              <div className="flex justify-end gap-3">
                <button onClick={() => { setConfirmOpen(false); confirmCallbackRef.current = null; }} className="px-3 py-1 bg-slate-100 rounded">Cancel</button>
                <button onClick={() => { try { confirmCallbackRef.current && confirmCallbackRef.current(); } finally { setConfirmOpen(false); confirmCallbackRef.current = null; } }} className="px-3 py-1 bg-blue-600 text-white rounded">Confirm</button>
              </div>
            </div>
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}
