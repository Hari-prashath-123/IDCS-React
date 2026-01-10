import DashboardLayout from '../../components/DashboardLayout';
import { useAuth } from '../../contexts/AuthContext';
import { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { getAdminApiUrl } from '../../lib/adminApi';

// Helper: generate mnemonic from course name (first alnum char of each word)
function generateMnemonic(name?: string) {
  if (!name) return null;
  const parts = String(name).trim().split(/\s+/).filter(Boolean);
  const letters = parts.map(p => {
    const m = p.match(/[A-Za-z0-9]/);
    return m ? m[0].toUpperCase() : '';
  }).filter(Boolean);
  if (letters.length === 0) return null;
  return letters.join('').slice(0, 8);
}

export default function IQACCurriculumPage() {
  const { profile } = useAuth();
  const isIqacHod = !!(profile && (profile.role === 'admin' || (profile.role === 'hod' && profile.department && String(profile.department).toUpperCase() === 'IQAC')));
  const [tab, setTab] = useState<'qp_type' | 'master'>('qp_type');
  const [deptFilter, setDeptFilter] = useState<string | null>(null);
  const [groupDeptMap, setGroupDeptMap] = useState<Record<string, string[]>>({});
  const [showAddModal, setShowAddModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [editingRow, setEditingRow] = useState<any | null>(null);
  const [entries, setEntries] = useState<any[]>([]);
  const [masterRows, setMasterRows] = useState<any[]>([]);
  const [loadingMaster, setLoadingMaster] = useState(false);
  const [showAddMaster, setShowAddMaster] = useState(false);
  const [showEditMaster, setShowEditMaster] = useState(false);
  const [masterEditingRow, setMasterEditingRow] = useState<any | null>(null);

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const { data, error } = await supabase.from('qp_type').select('*').order('id', { ascending: true });
        if (error) {
          console.error('Failed to load qp_type:', error);
          return;
        }
        if (!mounted) return;
        setEntries(data || []);
      } catch (err) {
        console.error(err);
      }
    })();
    // load master rows as well
    (async () => {
      try {
        setLoadingMaster(true);
        const { data, error } = await supabase.from('curriculum_master').select('*').order('sem', { ascending: true }).order('group_name', { ascending: true });
        if (!mounted) return;
        if (error) {
          console.warn('Failed to load curriculum_master:', error.message || error);
        } else {
          setMasterRows(data || []);
        }
      } catch (err) {
        console.error(err);
      } finally {
        if (mounted) setLoadingMaster(false);
      }
    })();
    // load department_groups -> department name mapping for filtering (used by AI&DS view)
    (async () => {
      try {
        const { data: rows, error } = await supabase.from('department_groups').select('name, department_id, sem');
        if (error) {
          console.warn('Failed to load department_groups for mapping', error);
          return;
        }
        const r = rows || [];
        const deptIds = Array.from(new Set(r.map((x: any) => x.department_id).filter(Boolean)));
        let deptMap: Record<string, string> = {};
        if (deptIds.length > 0) {
          const { data: depts } = await supabase.from('departments').select('id, name').in('id', deptIds as string[]);
          (depts || []).forEach((d: any) => { deptMap[d.id] = d.name; });
        }
        const map: Record<string, string[]> = {};
        (r as any[]).forEach((row) => {
          const g = (row.name || '').toString().trim();
          const semKey = (row.sem === null || typeof row.sem === 'undefined') ? '' : String(row.sem).toString().trim();
          const key = `${g}::${semKey}`;
          const dname = deptMap[row.department_id] || row.department_id;
          if (!map[key]) map[key] = [];
          if (dname && !map[key].includes(dname)) map[key].push(dname);
        });
        if (mounted) setGroupDeptMap(map);
      } catch (e) {
        console.error('Failed to load group->dept mapping', e);
      }
    })();
    return () => {
      mounted = false;
    };
  }, []);

  if (!isIqacHod) {
    return (
      <DashboardLayout>
        <div className="min-h-[60vh] flex items-center justify-center">
          <div className="text-center">
            <div className="text-6xl">🚫</div>
            <h2 className="text-2xl font-bold mt-4">Access Denied</h2>
            <p className="text-slate-600 mt-2">This page is only for IQAC HOD users.</p>
          </div>
        </div>
      </DashboardLayout>
    );
  }

  // compute displayed master rows according to department filter (e.g., AI&DS)
  const displayedMasterRows = (() => {
    if (!deptFilter) return masterRows || [];
    const want = String(deptFilter).toUpperCase();
    return (masterRows || []).filter((r) => {
      const g = (r.group_name || '').toString().trim();
      if (!g) return false;
      const gUp = g.toUpperCase();
      // always include ALL and DEPT group rows
      if (gUp === 'ALL' || gUp === 'DEPT') return true;
      const semKey = (r.sem === null || typeof r.sem === 'undefined') ? '' : String(r.sem).toString().trim();
      const key = `${g}::${semKey}`;
      const depts = groupDeptMap[key] || [];
      return depts.some((d: string) => String(d).toUpperCase() === want);
    });
  })();

  const deptButtons = ['AI&DS', 'AI&ML', 'CSE', 'IT', 'MECH', 'CIVIL', 'ECE', 'EEE'];

  return (
    <DashboardLayout>
      <div className="max-w-7xl mx-auto p-6">
        <h1 className="text-2xl font-bold mb-2">Curriculum</h1>

        {/* Top-left nav buttons below heading */}
        <div className="flex items-center gap-3 mb-6">
          <button
            onClick={() => setTab('qp_type')}
            className={`px-3 py-1.5 rounded-md font-medium text-sm transition-colors ${tab === 'qp_type' ? 'bg-blue-600 text-white' : 'bg-white border border-slate-200 text-slate-700 hover:bg-slate-50'}`}
          >
            QP type
          </button>

          <button
            onClick={() => { setTab('master'); setDeptFilter(null); }}
            className={`px-3 py-1.5 rounded-md font-medium text-sm transition-colors ${tab === 'master' && !deptFilter ? 'bg-blue-600 text-white' : 'bg-white border border-slate-200 text-slate-700 hover:bg-slate-50'}`}
          >
            Master
          </button>

          {deptButtons.map(d => (
            <button
              key={d}
              onClick={() => { setTab('master'); setDeptFilter(d); }}
              className={`px-3 py-1.5 rounded-md font-medium text-sm transition-colors ${tab === 'master' && deptFilter === d ? 'bg-blue-600 text-white' : 'bg-white border border-slate-200 text-slate-700 hover:bg-slate-50'}`}
            >
              {d}
            </button>
          ))}
        </div>

        {/* Content area */}
        <div>
          {tab === 'qp_type' && (
            <div>
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-lg font-semibold mb-2">QP type</h2>
                </div>
                <div>
                  <button
                    type="button"
                    className="inline-flex items-center gap-2 px-3 py-2 bg-green-600 hover:bg-green-700 text-white rounded-md text-sm font-medium"
                    onClick={() => setShowAddModal(true)}
                  >
                    + Add type
                  </button>
                </div>
              </div>

              {/* Table showing QP type entries (headings only for now) */}
              <div className="mt-4 overflow-x-auto">
                <table className="min-w-full divide-y divide-slate-200 bg-white rounded-lg shadow-sm">
                  <thead className="bg-slate-50">
                    <tr>
                      <th className="px-4 py-2 text-left text-sm font-medium text-slate-700">QP type</th>
                      <th className="px-4 py-2 text-left text-sm font-medium text-slate-700">Part</th>
                      <th className="px-4 py-2 text-left text-sm font-medium text-slate-700">Type</th>
                      <th className="px-4 py-2 text-left text-sm font-medium text-slate-700">Marks</th>
                      <th className="px-4 py-2 text-left text-sm font-medium text-slate-700">Quest</th>
                      <th className="px-4 py-2 text-left text-sm font-medium text-slate-700">Split</th>
                      <th className="px-4 py-2 text-left text-sm font-medium text-slate-700">Total</th>
                      <th className="px-4 py-2 text-left text-sm font-medium text-slate-700">Description</th>
                      <th className="px-4 py-2 text-left text-sm font-medium text-slate-700">BTL</th>
                      <th className="px-4 py-2 text-left text-sm font-medium text-slate-700">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {entries.length === 0 ? (
                      <tr>
                        <td className="px-4 py-4 text-sm text-slate-500" colSpan={9}>
                          No entries yet. Click "Add type" to create a new QP type.
                        </td>
                      </tr>
                    ) : (
                      entries.map((r, idx) => {
                        const isStart = idx === 0 || entries[idx - 1].qp_type !== r.qp_type;
                        // compute contiguous group length
                        let groupLen = 1;
                        if (isStart) {
                          for (let j = idx + 1; j < entries.length; j++) {
                            if (entries[j].qp_type === r.qp_type) groupLen++; else break;
                          }
                        }
                        const isEnd = idx === entries.length - 1 || entries[idx + 1].qp_type !== r.qp_type;
                        return (
                          <>
                            <tr key={r.id}>
                              {isStart && (
                                <td rowSpan={groupLen} className="px-4 py-3 text-sm text-slate-700 align-middle">
                                  {r.qp_type}
                                </td>
                              )}
                              <td className="px-4 py-3 text-sm text-slate-700">{r.part}</td>
                              <td className="px-4 py-3 text-sm text-slate-700">{r.type}</td>
                              <td className="px-4 py-3 text-sm text-slate-700">{r.marks}</td>
                              <td className="px-4 py-3 text-sm text-slate-700">{r.quest}</td>
                              <td className="px-4 py-3 text-sm text-slate-700">{r.split}</td>
                              <td className="px-4 py-3 text-sm text-slate-700">{r.total}</td>
                              <td className="px-4 py-3 text-sm text-slate-700">{r.description}</td>
                              <td className="px-4 py-3 text-sm text-slate-700">{r.max_btl}</td>
                              {isStart && (
                                <td rowSpan={groupLen} className="px-4 py-3 text-sm text-slate-700 align-middle">
                                  <div className="h-full flex items-center justify-center">
                                    <button
                                      className="text-sm text-blue-600 hover:underline"
                                      onClick={() => {
                                        const groupRows = entries.slice(idx, idx + groupLen);
                                        setEditingRow({ qp_type: r.qp_type, rows: groupRows });
                                        setShowEditModal(true);
                                      }}
                                    >
                                      Edit
                                    </button>
                                  </div>
                                </td>
                              )}
                            </tr>
                            {isEnd && (
                              <tr key={`${r.id}-sep`}>
                                <td colSpan={10} className="py-0">
                                  <div className="border-t border-slate-200 my-2" />
                                </td>
                              </tr>
                            )}
                          </>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}

      {/* Add Type Modal */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white rounded-lg shadow-lg max-w-4xl w-full overflow-y-auto max-h-[90vh]">
            <div className="flex items-center justify-between px-4 py-3 border-b">
              <h3 className="text-lg font-semibold">Add Type — multiple rows</h3>
              <button className="text-slate-500 hover:text-slate-700" onClick={() => setShowAddModal(false)}>Close</button>
            </div>
            <AddTypeForm
              onClose={async (saved: boolean) => {
                setShowAddModal(false);
                if (saved) {
                  // refresh entries
                  const { data } = await supabase.from('qp_type').select('*').order('id', { ascending: true });
                  setEntries(data || []);
                }
              }}
            />
          </div>
        </div>
      )}

      {showEditModal && editingRow && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white rounded-lg shadow-lg max-w-2xl w-full overflow-y-auto max-h-[90vh]">
            <div className="flex items-center justify-between px-4 py-3 border-b">
              <h3 className="text-lg font-semibold">Edit QP Type</h3>
              <button className="text-slate-500 hover:text-slate-700" onClick={() => { setShowEditModal(false); setEditingRow(null); }}>Close</button>
            </div>
            <EditRowForm
              initialData={editingRow}
              onClose={async (saved: boolean) => {
                setShowEditModal(false);
                setEditingRow(null);
                if (saved) {
                  const { data } = await supabase.from('qp_type').select('*').order('id', { ascending: true });
                  setEntries(data || []);
                }
              }}
            />
          </div>
        </div>
      )}

          {tab === 'master' && (
            <div>
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-lg font-semibold mb-2">Master</h2>
                  <p className="text-slate-600">Master data and mappings.</p>
                </div>
                <div>
                  <button onClick={() => setShowAddMaster(true)} className="inline-flex items-center gap-2 px-3 py-2 bg-green-600 hover:bg-green-700 text-white rounded-md text-sm font-medium">+ Add Master</button>
                </div>
              </div>

              <div className="mt-2 overflow-x-auto">
                <table className="min-w-full divide-y divide-slate-200 bg-white rounded-lg shadow-sm">
                  <thead className="bg-slate-50">
                    <tr>
                      <th className="px-3 py-2 text-left text-sm font-medium text-slate-700">Sem</th>
                      <th className="px-3 py-2 text-left text-sm font-medium text-slate-700">Group</th>
                      <th className="px-3 py-2 text-left text-sm font-medium text-slate-700">Class</th>
                      <th className="px-3 py-2 text-left text-sm font-medium text-slate-700">Course</th>
                      <th className="px-3 py-2 text-left text-sm font-medium text-slate-700">Course Code</th>
                      
                      <th className="px-3 py-2 text-left text-sm font-medium text-slate-700">Cat</th>
                      <th className="px-3 py-2 text-left text-sm font-medium text-slate-700">L</th>
                      <th className="px-3 py-2 text-left text-sm font-medium text-slate-700">T</th>
                      <th className="px-3 py-2 text-left text-sm font-medium text-slate-700">P</th>
                      <th className="px-3 py-2 text-left text-sm font-medium text-slate-700">S</th>
                      <th className="px-3 py-2 text-left text-sm font-medium text-slate-700">C</th>
                      <th className="px-3 py-2 text-left text-sm font-medium text-slate-700">INT</th>
                      <th className="px-3 py-2 text-left text-sm font-medium text-slate-700">EXT</th>
                      <th className="px-3 py-2 text-left text-sm font-medium text-slate-700">TTL</th>
                      <th className="px-3 py-2 text-left text-sm font-medium text-slate-700">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {loadingMaster ? (
                      <tr><td colSpan={14} className="px-3 py-4 text-sm text-slate-500">Loading...</td></tr>
                    ) : displayedMasterRows.length === 0 ? (
                      <tr>
                        <td className="px-3 py-4 text-sm text-slate-500" colSpan={14}>
                          No master rows available.
                        </td>
                      </tr>
                    ) : (
                      displayedMasterRows.map((r: any, i: number) => {
                        const isSemStart = i === 0 || displayedMasterRows[i - 1].sem !== r.sem;
                        let semSpan = 1;
                        if (isSemStart) {
                          for (let j = i + 1; j < displayedMasterRows.length; j++) {
                            if (displayedMasterRows[j].sem === r.sem) semSpan++; else break;
                          }
                        }

                        const isGroupStart = i === 0 || displayedMasterRows[i - 1].group_name !== r.group_name;
                        let groupSpan = 1;
                        if (isGroupStart) {
                          for (let j = i + 1; j < displayedMasterRows.length; j++) {
                            if (displayedMasterRows[j].group_name === r.group_name) groupSpan++; else break;
                          }
                        }

                        return (
                          <tr key={r.id}>
                            {isSemStart && (
                              <td rowSpan={semSpan} className="px-3 py-3 text-sm text-slate-700 align-middle">
                                <div className="h-full flex items-center justify-center">{r.sem}</div>
                              </td>
                            )}

                            {isGroupStart && (
                              <td rowSpan={groupSpan} className="px-3 py-3 text-sm text-slate-700 align-middle">
                                <div className="h-full flex items-center">{r.group_name}</div>
                              </td>
                            )}

                            <td className="px-3 py-3 text-sm text-slate-700">{r.class ?? ''}</td>
                            <td className="px-3 py-3 text-sm text-slate-700">{r.course}</td>
                            <td className="px-3 py-3 text-sm text-slate-700">{r.course_code ?? ''}</td>

                            <td className="px-3 py-3 text-sm text-slate-700">{r.cat}</td>
                            <td className="px-3 py-3 text-sm text-slate-700">{r.l}</td>
                            <td className="px-3 py-3 text-sm text-slate-700">{r.t}</td>
                            <td className="px-3 py-3 text-sm text-slate-700">{r.p}</td>
                            <td className="px-3 py-3 text-sm text-slate-700">{r.s}</td>
                            <td className="px-3 py-3 text-sm text-slate-700">{r.c}</td>
                            <td className="px-3 py-3 text-sm text-slate-700">{r.int_marks}</td>
                            <td className="px-3 py-3 text-sm text-slate-700">{r.ext_marks}</td>
                            <td className="px-3 py-3 text-sm text-slate-700">{r.ttl}</td>
                            <td className="px-3 py-3 text-sm text-slate-700">
                              <div className="flex items-center gap-2">
                                <button title="Edit master row" className="px-2 py-1 bg-slate-100 rounded text-sm" onClick={() => { setMasterEditingRow(r); setShowEditMaster(true); }}>
                                  ✏️
                                </button>
                                <button title="Add subject from this master row" className="px-2 py-1 bg-green-100 rounded text-sm text-green-700" onClick={async () => {
                                  try {
                                    await insertSubjectFromMaster(r);
                                    alert('Subject added (attempted).');
                                  } catch (err) {
                                    console.error(err);
                                    alert('Failed to add subject: ' + (err?.message || err));
                                  }
                                }}>
                                  ➕
                                </button>
                                <button title="Delete master row and subjects" className="px-2 py-1 bg-red-100 rounded text-sm text-red-700" onClick={async () => {
                                  if (!confirm('Delete this master row and any subjects created from it? This cannot be undone.')) return;
                                  try {
                                    // Attempt to delete subjects created from this master row.
                                    // Prioritise subject_code match, then fall back to name+semester+group_name.
                                    if (r.course_code && String(r.course_code).trim()) {
                                      const { error: dErr1 } = await supabase.from('subjects').delete().eq('subject_code', String(r.course_code).trim());
                                      if (dErr1) console.warn('Failed deleting subjects by course_code', dErr1);
                                    }

                                    const matchObj: any = {};
                                    if (r.course && String(r.course).trim()) matchObj.name = String(r.course).trim();
                                    if (r.sem && String(r.sem).trim() !== '') matchObj.semester = isNaN(Number(r.sem)) ? r.sem : Number(r.sem);
                                    if (r.group_name && String(r.group_name).trim() !== '') matchObj.group_name = r.group_name;
                                    if (Object.keys(matchObj).length > 0) {
                                      const { error: dErr2 } = await supabase.from('subjects').delete().match(matchObj);
                                      if (dErr2) console.warn('Failed deleting subjects by matchObj', dErr2);
                                    }

                                    // Delete the master row
                                    const { error: mErr } = await supabase.from('curriculum_master').delete().eq('id', r.id);
                                    if (mErr) throw mErr;

                                    // Refresh master rows
                                    const { data } = await supabase.from('curriculum_master').select('*').order('sem', { ascending: true }).order('group_name', { ascending: true });
                                    setMasterRows(data || []);
                                    alert('Master row and related subjects deleted.');
                                  } catch (err) {
                                    console.error('Delete failed', err);
                                    alert('Delete failed: ' + (err?.message || err));
                                  }
                                }}>
                                  🗑️
                                </button>
                              </div>
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>

              {showAddMaster && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
                  <div className="bg-white rounded-lg shadow-lg max-w-4xl w-full overflow-y-auto max-h-[90vh]">
                    <div className="flex items-center justify-between px-4 py-3 border-b">
                      <h3 className="text-lg font-semibold">Add Master — multiple course rows</h3>
                      <button className="text-slate-500 hover:text-slate-700" onClick={() => setShowAddMaster(false)}>Close</button>
                    </div>
                    <AddMasterForm onClose={async (saved: boolean) => {
                      setShowAddMaster(false);
                      if (saved) {
                        const { data } = await supabase.from('curriculum_master').select('*').order('sem', { ascending: true }).order('group_name', { ascending: true });
                        setMasterRows(data || []);
                      }
                    }} />
                  </div>
                </div>
              )}

              {showEditMaster && masterEditingRow && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
                  <div className="bg-white rounded-lg shadow-lg max-w-2xl w-full overflow-y-auto max-h-[90vh]">
                    <div className="flex items-center justify-between px-4 py-3 border-b">
                      <h3 className="text-lg font-semibold">Edit Master Row</h3>
                      <button className="text-slate-500 hover:text-slate-700" onClick={() => { setShowEditMaster(false); setMasterEditingRow(null); }}>Close</button>
                    </div>
                    <EditMasterRowForm
                      initialData={masterEditingRow}
                      onClose={async (saved: boolean) => {
                        setShowEditMaster(false);
                        setMasterEditingRow(null);
                        if (saved) {
                          const { data } = await supabase.from('curriculum_master').select('*').order('sem', { ascending: true }).order('group_name', { ascending: true });
                          setMasterRows(data || []);
                        }
                      }}
                    />
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </DashboardLayout>
  );
}

// AddTypeForm component placed below to keep file self-contained
function AddTypeForm({ onClose }: { onClose: (saved: boolean) => void }) {
  const [setName, setSetName] = useState('');
  const [commonQpType, setCommonQpType] = useState('');
  const [rows, setRows] = useState<Array<any>>([
    { type: '', part: 'A', marks: '', quest: '', split: '', total: '', description: '', max_btl: '' },
  ]);
  const [saving, setSaving] = useState(false);
  
  const addRow = () => setRows((r) => {
    const nextIndex = r.length; // 0-based
    const nextPart = indexToLabel(nextIndex);
    return [...r, { type: '', part: nextPart, marks: '', quest: '', split: '', total: '', description: '', max_btl: '' }];
  });
  
  const indexToLabel = (index: number) => {
    // Convert 0 -> A, 25 -> Z, 26 -> AA, etc.
    let label = '';
    let i = index + 1;
    while (i > 0) {
      const rem = (i - 1) % 26;
      label = String.fromCharCode(65 + rem) + label;
      i = Math.floor((i - 1) / 26);
    }
    return label;
  };
  
  const removeRow = (i: number) => setRows((r) => r.filter((_, idx) => idx !== i));
  const updateRow = (i: number, key: string, value: any) => setRows((r) => r.map((row, idx) => (idx === i ? { ...row, [key]: value } : row)));

  const handleSave = async () => {
    if (!commonQpType) return alert('Enter QP type (common)');
    setSaving(true);
    try {
      const payload = rows.map((row) => ({
        qp_type: commonQpType || setName,
        part: row.part || null,
        type: row.type || null,
        marks: row.marks ? parseInt(row.marks) : null,
        quest: row.quest ? parseInt(row.quest) : null,
        split: row.split || null,
        total: row.total ? parseInt(row.total) : null,
        description: row.description || null,
        max_btl: row.max_btl ? String(row.max_btl) : null,
        
      }));

      const { error } = await supabase.from('qp_type').insert(payload);
      if (error) {
        console.error('Insert error', error);
        alert('Failed to save: ' + error.message);
        setSaving(false);
        return;
      }
      alert('Saved successfully');
      onClose(true);
    } catch (err) {
      console.error(err);
      alert('Save failed');
      setSaving(false);
    }
  };
  
  // on mount: set default commonQpType to next QP number based on existing qp_type values
  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const { data, error } = await supabase.from('qp_type').select('qp_type').limit(1000);
        if (error) return;
        if (!data || !mounted) return;
        let maxN = 0;
        for (const row of data) {
          const v = row.qp_type as string;
          if (!v) continue;
          const m = v.match(/QP\s*(\d+)$/i);
          if (m) {
            const n = parseInt(m[1], 10);
            if (!isNaN(n) && n > maxN) maxN = n;
          }
        }
        const next = maxN + 1 || 1;
        if (mounted) setCommonQpType(`QP ${next}`);
      } catch (err) {
        // ignore
      }
    })();
    return () => { mounted = false; };
  }, []);

  return (
    <div className="p-4">
      <div className="grid grid-cols-2 gap-4 mb-4">
        <div>
          <label className="block text-sm font-medium text-slate-700">QP type (common)</label>
          <input value={commonQpType} onChange={(e) => setCommonQpType(e.target.value)} className="mt-1 block w-full rounded-md border px-3 py-2" />
        </div>
        <div>
          <label className="block text-sm font-medium text-slate-700">QP set name (optional)</label>
          <input value={setName} onChange={(e) => setSetName(e.target.value)} className="mt-1 block w-full rounded-md border px-3 py-2" placeholder="e.g., Model A" />
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-slate-200">
          <thead className="bg-slate-50">
            <tr>
              <th className="px-2 py-2 text-left text-sm font-medium">Part</th>
              <th className="px-2 py-2 text-left text-sm font-medium">Type</th>
              <th className="px-2 py-2 text-left text-sm font-medium">Marks</th>
              <th className="px-2 py-2 text-left text-sm font-medium">Quest</th>
              <th className="px-2 py-2 text-left text-sm font-medium">Split</th>
              <th className="px-2 py-2 text-left text-sm font-medium">Total</th>
              <th className="px-2 py-2 text-left text-sm font-medium">Description</th>
              <th className="px-2 py-2 text-left text-sm font-medium">BTL</th>
              <th className="px-2 py-2 text-left text-sm font-medium">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {rows.map((row, i) => (
              <tr key={i}>
                <td className="px-2 py-2"><input className="w-20 rounded border px-2 py-1" value={row.part} onChange={(e) => updateRow(i, 'part', e.target.value)} /></td>
                <td className="px-2 py-2"><input className="w-28 rounded border px-2 py-1" value={row.type} onChange={(e) => updateRow(i, 'type', e.target.value)} /></td>
                <td className="px-2 py-2"><input className="w-20 rounded border px-2 py-1" value={row.marks} onChange={(e) => updateRow(i, 'marks', e.target.value)} /></td>
                <td className="px-2 py-2"><input className="w-20 rounded border px-2 py-1" value={row.quest} onChange={(e) => updateRow(i, 'quest', e.target.value)} /></td>
                <td className="px-2 py-2"><input className="w-24 rounded border px-2 py-1" value={row.split} onChange={(e) => updateRow(i, 'split', e.target.value)} /></td>
                <td className="px-2 py-2"><input className="w-20 rounded border px-2 py-1" value={row.total} onChange={(e) => updateRow(i, 'total', e.target.value)} /></td>
                <td className="px-2 py-2"><input className="w-48 rounded border px-2 py-1" value={row.description} onChange={(e) => updateRow(i, 'description', e.target.value)} /></td>
                <td className="px-2 py-2"><input className="w-20 rounded border px-2 py-1" value={row.max_btl} onChange={(e) => updateRow(i, 'max_btl', e.target.value)} /></td>
                <td className="px-2 py-2">
                  <button className="text-sm text-red-600" onClick={() => removeRow(i)} disabled={rows.length === 1}>Remove</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="flex items-center gap-3 mt-4">
        <button type="button" className="px-3 py-2 bg-slate-100 rounded" onClick={addRow}>Add Row</button>
        <div className="flex-1" />
        <button type="button" className="px-4 py-2 bg-white border rounded" onClick={() => onClose(false)}>Cancel</button>
        <button type="button" className="px-4 py-2 bg-blue-600 text-white rounded" onClick={handleSave} disabled={saving}>{saving ? 'Saving…' : 'Save'}</button>
      </div>
    </div>
  );
}

// Insert a subject record derived from a curriculum_master row (client-first, admin fallback)
async function insertSubjectFromMaster(r: any, section?: string) {
  const mnemonic = generateMnemonic(r.course);
  // Skip certain course names that should not be added to subjects
  const courseName = (r.course || '').trim();
  const lowerCourse = courseName.toLowerCase();
  if (lowerCourse.includes('engineering science') || lowerCourse.includes('program core') || lowerCourse === 'engineering science or program core') {
    console.debug('Skipping subject insert for special course name:', courseName);
    return; // no-op
  }

  // If master row does not have a course_code, do not add to subjects
  if (!r.course_code || String(r.course_code).trim() === '') {
    console.debug('Skipping subject insert because master row has no course_code:', courseName);
    return;
  }

  // If group is one of the excluded administrative groups, skip adding subjects
  const groupUp = (r.group_name || '').toString().trim().toUpperCase();
  const excludedGroups = ['GRP', 'INST', 'MGE'];
  if (groupUp && (excludedGroups.includes(groupUp) || excludedGroups.some(g => groupUp.startsWith(g)))) {
    console.debug('Skipping subject insert because group is excluded:', groupUp);
    return;
  }
  const deptVal = (r.group_name && String(r.group_name).trim().toUpperCase() === 'ALL') ? 'ALL' : null;
  const subjItem = {
    subject_code: (r.course_code && String(r.course_code).trim()) ? r.course_code : (mnemonic || null),
    mnemonic: mnemonic || null,
    name: courseName || null,
    semester: r.sem && !isNaN(Number(r.sem)) ? Number(r.sem) : null,
    group_name: r.group_name || null,
    department: deptVal,
    subject_type: r.elective ? 'elective' : 'core',
    year: null,
  };
  console.debug('insertSubjectFromMaster payload:', subjItem);

  // Try direct Supabase insert first
  try {
    console.debug('Attempting direct supabase insert for subject:', subjItem);
    const { data: inserted, error } = await supabase.from('subjects').insert([subjItem]).select();
    if (error) {
      console.debug('Supabase insert error:', error);
      throw error;
    }
    console.debug('Supabase insert result:', inserted);
    return;
  } catch (clientErr) {
    console.warn('Direct insert failed, falling back to admin API', clientErr);
    // If error indicates a missing NOT NULL column (eg. year), surface a clearer message
    if (clientErr && clientErr.code === '23502') {
      throw new Error('Insert failed: missing required column in subjects (NOT NULL). Update payload or DB schema. ' + (clientErr.message || ''));
    }
    // Fallback: call admin bulk-insert
    try {
      const url = getAdminApiUrl('/subjects/bulk-insert');
      const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ items: [subjItem] }) });
      if (!res.ok) {
        const txt = await res.text().catch(() => '');
        throw new Error('Admin API bulk-insert failed: ' + res.status + ' ' + res.statusText + ' ' + txt);
      }
      const json = await res.json().catch(() => null);
      if (json && json.error) throw new Error(json.error);
      return;
    } catch (apiErr) {
      console.warn('Admin API fallback failed', apiErr);
      // Network or connection refused will surface as TypeError; rethrow with hint
      if (apiErr instanceof TypeError) {
        throw new Error('Admin API request failed — ensure the admin server is running (npm run admin-api) and reachable. ' + (apiErr.message || ''));
      }
      throw apiErr || clientErr;
    }
  }
}

// Update existing subject rows that correspond to a master row. Do NOT insert new rows.
async function updateSubjectFromMaster(original: any, updated: any) {
  try {
    // Build update payload
    const mnemonic = generateMnemonic(updated.course || updated.name || original.course || original.name);
    const deptVal = ((updated.group_name || original.group_name) && String((updated.group_name || original.group_name)).trim().toUpperCase() === 'ALL') ? 'ALL' : null;
    const updatePayload: any = {
      subject_code: (updated.course_code && String(updated.course_code).trim()) ? updated.course_code : (mnemonic || null),
      mnemonic: mnemonic || null,
      name: updated.course || original.course || null,
      semester: (updated.sem && !isNaN(Number(updated.sem))) ? Number(updated.sem) : (original.sem && !isNaN(Number(original.sem)) ? Number(original.sem) : null),
      group_name: updated.group_name || original.group_name || null,
      department: deptVal,
      subject_type: (typeof updated.elective !== 'undefined') ? (updated.elective ? 'elective' : 'core') : (original.elective ? 'elective' : 'core'),
      year: null,
    };

    // Try match by subject_code (original)
    if (original.course_code && String(original.course_code).trim()) {
      const { data, error } = await supabase.from('subjects').update(updatePayload).eq('subject_code', original.course_code).select();
      if (error) throw error;
      if (data && data.length > 0) return { ok: true, updated: data };
    }

    // Fallback: match by name+semester+group_name
    const matchObj: any = {};
    if (original.course) matchObj.name = original.course;
    if (original.sem) matchObj.semester = isNaN(Number(original.sem)) ? original.sem : Number(original.sem);
    if (original.group_name) matchObj.group_name = original.group_name;
    if (Object.keys(matchObj).length === 0) {
      return { ok: false, message: 'No match criteria available to update subjects' };
    }

    const { data: upd2, error: err2 } = await supabase.from('subjects').update(updatePayload).match(matchObj).select();
    if (err2) throw err2;
    if (upd2 && upd2.length > 0) return { ok: true, updated: upd2 };

    return { ok: false, message: 'No matching subjects found to update' };
  } catch (err) {
    console.warn('updateSubjectFromMaster failed', err);
    return { ok: false, error: err };
  }
}

function EditMasterRowForm({ initialData, onClose }: { initialData: any; onClose: (saved: boolean) => void }) {
  const [sem, setSem] = useState(initialData?.sem || '');
  const [groupName, setGroupName] = useState(initialData?.group_name || '');
  const [klass, setKlass] = useState(initialData?.class || '');
  const [course, setCourse] = useState(initialData?.course || '');
  const [courseCode, setCourseCode] = useState(initialData?.course_code || '');
  const [cat, setCat] = useState(initialData?.cat || '');
  const [l, setL] = useState(initialData?.l ?? '');
  const [t, setT] = useState(initialData?.t ?? '');
  const [p, setP] = useState(initialData?.p ?? '');
  const [s, setS] = useState(initialData?.s ?? '');
  const [c, setC] = useState(initialData?.c ?? '');
  const [intMarks, setIntMarks] = useState(initialData?.int_marks ?? '');
  const [extMarks, setExtMarks] = useState(initialData?.ext_marks ?? '');
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    setSaving(true);
    try {
      const payload: any = {
        sem: sem || null,
        group_name: groupName || null,
        class: klass || null,
        course: course || null,
        course_code: courseCode || null,
        cat: cat || null,
        l: l ? parseInt(String(l)) : null,
        t: t ? parseInt(String(t)) : null,
        p: p ? parseInt(String(p)) : null,
        s: s ? parseInt(String(s)) : null,
        c: c ? Number(c) : null,
        int_marks: intMarks ? parseInt(String(intMarks)) : null,
        ext_marks: extMarks ? parseInt(String(extMarks)) : null,
        ttl: (intMarks && extMarks) ? (Number(intMarks) + Number(extMarks)) : (initialData?.ttl ?? null),
      };

      const { error } = await supabase.from('curriculum_master').update(payload).eq('id', initialData.id);
      if (error) {
        console.error('Update failed', error);
        alert('Update failed: ' + (error.message || error));
        setSaving(false);
        return;
      }

      // Optionally update the corresponding subjects row to reflect changes (do not create duplicates)
      try {
        const res = await updateSubjectFromMaster(initialData, { ...initialData, ...payload });
        if (!res?.ok) {
          console.warn('No subject updated for edited master row', res?.message || res?.error);
        }
      } catch (e) {
        console.warn('Failed to update subject for edited master row', e);
      }

      onClose(true);
    } catch (err) {
      console.error(err);
      alert('Save failed');
      setSaving(false);
    }
  };

  return (
    <div className="p-4">
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-sm font-medium">Sem</label>
          <input value={sem} onChange={e => setSem(e.target.value)} className="mt-1 block w-full rounded border px-2 py-1" />
        </div>
        <div>
          <label className="block text-sm font-medium">Group</label>
          <input value={groupName} onChange={e => setGroupName(e.target.value)} className="mt-1 block w-full rounded border px-2 py-1" />
        </div>
        <div>
          <label className="block text-sm font-medium">Class</label>
          <input value={klass} onChange={e => setKlass(e.target.value)} className="mt-1 block w-full rounded border px-2 py-1" />
        </div>
        <div>
          <label className="block text-sm font-medium">Course</label>
          <input value={course} onChange={e => setCourse(e.target.value)} className="mt-1 block w-full rounded border px-2 py-1" />
        </div>
        <div>
          <label className="block text-sm font-medium">Course Code</label>
          <input value={courseCode} onChange={e => setCourseCode(e.target.value)} className="mt-1 block w-full rounded border px-2 py-1" />
        </div>
        <div>
          <label className="block text-sm font-medium">Cat</label>
          <input value={cat} onChange={e => setCat(e.target.value)} className="mt-1 block w-full rounded border px-2 py-1" />
        </div>
        <div>
          <label className="block text-sm font-medium">L</label>
          <input value={l} onChange={e => setL(e.target.value)} className="mt-1 block w-full rounded border px-2 py-1" />
        </div>
        <div>
          <label className="block text-sm font-medium">T</label>
          <input value={t} onChange={e => setT(e.target.value)} className="mt-1 block w-full rounded border px-2 py-1" />
        </div>
        <div>
          <label className="block text-sm font-medium">P</label>
          <input value={p} onChange={e => setP(e.target.value)} className="mt-1 block w-full rounded border px-2 py-1" />
        </div>
        <div>
          <label className="block text-sm font-medium">S</label>
          <input value={s} onChange={e => setS(e.target.value)} className="mt-1 block w-full rounded border px-2 py-1" />
        </div>
        <div>
          <label className="block text-sm font-medium">C</label>
          <input value={c} onChange={e => setC(e.target.value)} className="mt-1 block w-full rounded border px-2 py-1" />
        </div>
        <div>
          <label className="block text-sm font-medium">INT</label>
          <input value={intMarks} onChange={e => setIntMarks(e.target.value)} className="mt-1 block w-full rounded border px-2 py-1" />
        </div>
        <div>
          <label className="block text-sm font-medium">EXT</label>
          <input value={extMarks} onChange={e => setExtMarks(e.target.value)} className="mt-1 block w-full rounded border px-2 py-1" />
        </div>
      </div>

      <div className="flex items-center gap-3 mt-4">
        <button className="px-4 py-2 bg-white border rounded" onClick={() => onClose(false)}>Cancel</button>
        <button className="px-4 py-2 bg-blue-600 text-white rounded" onClick={handleSave} disabled={saving}>{saving ? 'Saving…' : 'Save'}</button>
      </div>
    </div>
  );
}

function AddMasterForm({ onClose }: { onClose: (saved: boolean) => void }) {
  const [sem, setSem] = useState('');
  const [groups, setGroupsState] = useState<Array<any>>([
    { groupName: '', rows: [ { course: '', course_code: '', class: '', cat: '', l: '', t: '', p: '', s: '', c: '', int_marks: '', ext_marks: '', ttl: '', elective: false } ] }
  ]);
  const [saving, setSaving] = useState(false);
  const { profile } = useAuth();

  const addGroup = () => setGroupsState(g => [...g, { groupName: '', rows: [ { course: '', course_code: '', class: '', cat: '', l: '', t: '', p: '', s: '', c: '', int_marks: '', ext_marks: '', ttl: '' } ] }]);
  const removeGroup = (gi: number) => setGroupsState(g => g.filter((_, idx) => idx !== gi));
  const updateGroupName = (gi: number, value: string) => setGroupsState(g => g.map((grp, idx) => idx === gi ? { ...grp, groupName: value } : grp));
  // no section state; sections removed per UX

  const addCourseRow = (gi: number) => setGroupsState(g => g.map((grp, idx) => idx === gi ? { ...grp, rows: [...grp.rows, { course: '', course_code: '', class: '', cat: '', l: '', t: '', p: '', s: '', c: '', int_marks: '', ext_marks: '', ttl: '' }] } : grp));
  const removeCourseRow = (gi: number, ri: number) => setGroupsState(g => g.map((grp, idx) => idx === gi ? { ...grp, rows: grp.rows.filter((_, j) => j !== ri) } : grp));
  const updateCourseRow = (gi: number, ri: number, key: string, value: any) => setGroupsState(g => g.map((grp, idx) => {
    if (idx !== gi) return grp;
    return {
      ...grp,
      rows: grp.rows.map((row: any, j: number) => {
        if (j !== ri) return row;
        const newRow: any = { ...row, [key]: value };
        // Auto-calc ttl when int_marks or ext_marks change
        if (key === 'int_marks' || key === 'ext_marks') {
          const intVal = key === 'int_marks' ? value : newRow.int_marks;
          const extVal = key === 'ext_marks' ? value : newRow.ext_marks;
          const intN = (intVal === null || intVal === undefined || String(intVal).trim() === '') ? null : parseInt(intVal, 10);
          const extN = (extVal === null || extVal === undefined || String(extVal).trim() === '') ? null : parseInt(extVal, 10);
          if (intN === null && extN === null) {
            newRow.ttl = '';
          } else {
            const a = isNaN(intN as any) ? 0 : intN;
            const b = isNaN(extN as any) ? 0 : extN;
            newRow.ttl = a + b;
          }
        }
        return newRow;
      })
    };
  }));

  async function handleSave() {
    // Allow any column to be empty/null. Only require at least one course row.
    if (!groups || groups.length === 0) return alert('Add at least one group with a course row');
    for (const grp of groups) {
      if (!grp.rows || grp.rows.length === 0) return alert('Add at least one course row for each group');
    }
    setSaving(true);
    try {
      const payload: any[] = [];
      groups.forEach(grp => {
            grp.rows.forEach((r: any) => {
            payload.push({
              sem: sem && sem.trim() ? sem.trim() : null,
              group_name: grp.groupName && String(grp.groupName).trim() ? String(grp.groupName).trim() : null,
              course: r.course || null,
              course_code: r.course_code || null,
              class: r.class || null,
              cat: r.cat || null,
            l: r.l ? parseInt(r.l) : null,
            t: r.t ? parseInt(r.t) : null,
            p: r.p ? parseInt(r.p) : null,
            s: r.s ? parseInt(r.s) : null,
            c: r.c ? Number(r.c) : null,
            int_marks: r.int_marks ? parseInt(r.int_marks) : null,
            ext_marks: r.ext_marks ? parseInt(r.ext_marks) : null,
            ttl: r.ttl ? parseInt(r.ttl) : null,
            created_by: profile?.id || null,
          });
        });
      });

      const { error } = await supabase.from('curriculum_master').insert(payload);
      if (error) {
        console.error('Insert error', error);
        alert('Failed to save: ' + (error.message || error));
        setSaving(false);
        return;
      }

      // Try to also add these courses to `subjects` (best-effort).
      (async () => {
          try {
          const subjItems = [] as any[];
          // Use the in-memory groups/rows so we can read `elective` without persisting it to curriculum_master
          for (const grp of groups) {
            const grpNameUp = (grp.groupName || '').toString().trim().toUpperCase();
            const excludedGroupsOuter = ['GRP', 'INST', 'MGE'];
            if (grpNameUp && (excludedGroupsOuter.includes(grpNameUp) || excludedGroupsOuter.some(g => grpNameUp.startsWith(g)))) {
              console.debug('Skipping entire group because group name is excluded for subjects:', grp.groupName);
              continue;
            }
            for (const r of grp.rows) {
              const courseName = (r.course || '').trim();
              const lowerCourse = courseName.toLowerCase();
              if (lowerCourse.includes('engineering science') || lowerCourse.includes('program core') || lowerCourse === 'engineering science or program core') {
                console.debug('Skipping subject for special course name:', courseName);
                continue;
              }
              // Only add subjects if a course_code is present in the master row
              if (!r.course_code || String(r.course_code).trim() === '') {
                console.debug('Skipping subject creation for master row without course_code:', courseName);
                continue;
              }
              const mnemonic = generateMnemonic(r.course);
              const deptVal = (grp.groupName && String(grp.groupName).trim().toUpperCase() === 'ALL') ? 'ALL' : null;
              subjItems.push({
                subject_code: String(r.course_code).trim(),
                mnemonic: mnemonic || null,
                name: courseName || null,
                semester: sem && !isNaN(Number(sem)) ? Number(sem) : null,
                group_name: grp.groupName || null,
                department: deptVal,
                subject_type: r.elective ? 'elective' : 'core',
                year: null,
              });
            }
          }

          // Try direct Supabase insert first (works when RLS allows IQAC HOD), then fallback to admin API
          try {
            console.debug('Attempting bulk supabase insert for subjects:', subjItems);
            const { data: inserted, error: subErr } = await supabase.from('subjects').insert(subjItems).select();
            if (subErr) {
              console.debug('Supabase bulk insert error:', subErr);
              throw subErr;
            }
            console.debug('Supabase bulk insert result:', inserted);
          } catch (clientErr) {
            console.warn('Supabase client insert failed, attempting admin API bulk-insert', clientErr);
            try {
              const url = getAdminApiUrl('/subjects/bulk-insert');
              const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ items: subjItems }) });
              const json = await res.json();
              if (!res.ok || json?.error) throw new Error(json?.error || 'bulk insert failed');
            } catch (apiErr) {
              console.warn('Admin API bulk-insert also failed', apiErr);
              throw apiErr || clientErr;
            }
          }
        } catch (err) {
          console.warn('Failed to add subjects for master rows (non-fatal)', err);
        }
      })();

      onClose(true);
    } catch (err) {
      console.error(err);
      alert('Save failed');
      setSaving(false);
    }
  }

  return (
    <div className="p-4">
      <div className="mb-4">
        <label className="block text-sm font-medium text-slate-700">Sem (common)</label>
        <input value={sem} onChange={e => setSem(e.target.value)} className="mt-1 block w-full rounded-md border px-3 py-2" />
      </div>

      <div className="space-y-4">
      {groups.map((grp, gi) => (
          <div key={gi} className="border rounded p-3">
            <div className="flex items-center gap-3 mb-2">
                <div className="flex-1">
                <label className="block text-sm font-medium text-slate-700">Group name</label>
                <GroupSelect value={grp.groupName} onChange={(val: string) => updateGroupName(gi, val)} sem={sem} />
              </div>
              {/* Section removed from UI per requirement */}
              <div>
                <button className="px-3 py-1 bg-red-100 text-red-700 rounded" onClick={() => removeGroup(gi)} disabled={groups.length === 1}>Remove Group</button>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-slate-200">
                <thead className="bg-slate-50">
                    <tr>
                    <th className="px-2 py-2 text-left text-sm font-medium">Course</th>
                    <th className="px-2 py-2 text-left text-sm font-medium">Course Code</th>
                    <th className="px-2 py-2 text-left text-sm font-medium">Class</th>
                  <th className="px-2 py-2 text-left text-sm font-medium">Elective</th>
                    <th className="px-2 py-2 text-left text-sm font-medium">Cat</th>
                    <th className="px-2 py-2 text-left text-sm font-medium">L</th>
                    <th className="px-2 py-2 text-left text-sm font-medium">T</th>
                    <th className="px-2 py-2 text-left text-sm font-medium">P</th>
                    <th className="px-2 py-2 text-left text-sm font-medium">S</th>
                    <th className="px-2 py-2 text-left text-sm font-medium">C</th>
                    <th className="px-2 py-2 text-left text-sm font-medium">INT</th>
                    <th className="px-2 py-2 text-left text-sm font-medium">EXT</th>
                    <th className="px-2 py-2 text-left text-sm font-medium">TTL</th>
                    <th className="px-2 py-2 text-left text-sm font-medium">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {grp.rows.map((row: any, ri: number) => (
                    <tr key={ri}>
                      <td className="px-2 py-2"><input className="w-44 rounded border px-2 py-1" value={row.course} onChange={e => updateCourseRow(gi, ri, 'course', e.target.value)} /></td>
                      <td className="px-2 py-2"><input className="w-28 rounded border px-2 py-1" value={row.course_code} onChange={e => updateCourseRow(gi, ri, 'course_code', e.target.value)} /></td>
                      <td className="px-2 py-2"><input className="w-20 rounded border px-2 py-1" value={row.class} onChange={e => updateCourseRow(gi, ri, 'class', e.target.value)} /></td>
                      <td className="px-2 py-2"><input type="checkbox" checked={!!row.elective} onChange={e => updateCourseRow(gi, ri, 'elective', e.target.checked)} /></td>

                      <td className="px-2 py-2"><input className="w-24 rounded border px-2 py-1" value={row.cat} onChange={e => updateCourseRow(gi, ri, 'cat', e.target.value)} /></td>
                      <td className="px-2 py-2"><input className="w-14 rounded border px-2 py-1" value={row.l} onChange={e => updateCourseRow(gi, ri, 'l', e.target.value)} /></td>
                      <td className="px-2 py-2"><input className="w-14 rounded border px-2 py-1" value={row.t} onChange={e => updateCourseRow(gi, ri, 't', e.target.value)} /></td>
                      <td className="px-2 py-2"><input className="w-14 rounded border px-2 py-1" value={row.p} onChange={e => updateCourseRow(gi, ri, 'p', e.target.value)} /></td>
                      <td className="px-2 py-2"><input className="w-14 rounded border px-2 py-1" value={row.s} onChange={e => updateCourseRow(gi, ri, 's', e.target.value)} /></td>
                      <td className="px-2 py-2"><input className="w-16 rounded border px-2 py-1" value={row.c} onChange={e => updateCourseRow(gi, ri, 'c', e.target.value)} /></td>
                      <td className="px-2 py-2"><input className="w-16 rounded border px-2 py-1" value={row.int_marks} onChange={e => updateCourseRow(gi, ri, 'int_marks', e.target.value)} /></td>
                      <td className="px-2 py-2"><input className="w-16 rounded border px-2 py-1" value={row.ext_marks} onChange={e => updateCourseRow(gi, ri, 'ext_marks', e.target.value)} /></td>
                      <td className="px-2 py-2"><input readOnly className="w-16 rounded border px-2 py-1 bg-slate-50" value={row.ttl ?? ''} /></td>
                      <td className="px-2 py-2"><button className="text-sm text-red-600" onClick={() => removeCourseRow(gi, ri)} disabled={grp.rows.length === 1}>Remove</button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="mt-2">
              <button type="button" className="px-3 py-2 bg-slate-100 rounded" onClick={() => addCourseRow(gi)}>Add Course Row</button>
            </div>
          </div>
        ))}
      </div>

      <div className="flex items-center gap-3 mt-4">
        <button type="button" className="px-3 py-2 bg-slate-100 rounded" onClick={addGroup}>Add Group</button>
        <div className="flex-1" />
        <button type="button" className="px-4 py-2 bg-white border rounded" onClick={() => onClose(false)}>Cancel</button>
        <button type="button" className="px-4 py-2 bg-blue-600 text-white rounded" onClick={handleSave} disabled={saving}>{saving ? 'Saving…' : 'Save'}</button>
      </div>
    </div>
  );
}

function GroupSelect({ value, onChange, sem }: { value: string; onChange: (val: string) => void; sem?: string }) {
  const [options, setOptions] = useState<string[]>([]);

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        // fetch name and sem so we can filter client-side by sem if provided
        const { data } = await supabase.from('department_groups').select('name, sem');
        if (!mounted) return;
        const rows = data || [];
        const filtered = rows.filter((d: any) => {
          if (!sem || String(sem).trim() === '') return true;
          // include rows where sem matches the selected sem
          return String(d.sem) === String(sem);
        });
        const names = Array.from(new Set(filtered.map((d: any) => d.name).filter(Boolean)));
        setOptions(names.sort());
      } catch (e) {
        console.error('Failed to load group names', e);
        if (mounted) setOptions([]);
      }
    })();
    return () => { mounted = false; };
  }, [sem]);

  return (
    <select value={value || ''} onChange={(e) => onChange(e.target.value)} className="mt-1 block w-full rounded-md border px-3 py-2">
      <option value="">(select group)</option>
      <option value="ALL">ALL</option>
      <option value="DEPT">DEPT</option>
      <option value="EG">EG</option>
      <option value="CG">CG</option>
      <option value="MG">MG</option>
      {options.filter(n => {
        const up = String(n).toUpperCase();
        return up !== 'ALL' && up !== 'DEPT' && up !== 'EG' && up !== 'CG' && up !== 'MG';
      }).map(n => <option key={n} value={n}>{n}</option>)}
    </select>
  );
}

function EditRowForm({ initialData, onClose }: { initialData: any; onClose: (saved: boolean) => void }) {
  const [commonQpType, setCommonQpType] = useState(initialData?.qp_type || '');
  const [setName, setSetName] = useState('');
  const initialRows = (initialData && initialData.rows) || (initialData ? [initialData] : []);
  const [rows, setRows] = useState<Array<any>>(initialRows.map((row: any, idx: number) => ({
    id: row.id,
    type: row.type || '',
    part: row.part || (idx === 0 ? 'A' : undefined),
    marks: row.marks ?? '',
    quest: row.quest ?? '',
    split: row.split || '',
    total: row.total ?? '',
    description: row.description || '',
    max_btl: row.max_btl ?? '',
  })));
  const [savingRow, setSavingRow] = useState(false);

  const indexToLabel = (index: number) => {
    let label = '';
    let i = index + 1;
    while (i > 0) {
      const rem = (i - 1) % 26;
      label = String.fromCharCode(65 + rem) + label;
      i = Math.floor((i - 1) / 26);
    }
    return label;
  };

  const addRow = () => setRows((r) => {
    const nextIndex = r.length;
    const nextPart = indexToLabel(nextIndex);
    return [...r, { type: '', part: nextPart, marks: '', quest: '', split: '', total: '', description: '', max_btl: '' }];
  });

  const removeRow = (i: number) => setRows((r) => r.filter((_, idx) => idx !== i));
  const updateRow = (i: number, key: string, value: any) => setRows((r) => r.map((row, idx) => (idx === i ? { ...row, [key]: value } : row)));

  const handleSave = async () => {
    if (!commonQpType) return alert('Enter QP type (common)');
    setSavingRow(true);
    try {
      const updates: Array<Promise<any>> = [];
      const inserts: any[] = [];
      for (const row of rows) {
        const payload: any = {
          qp_type: commonQpType || setName,
          part: row.part || null,
          type: row.type || null,
          marks: row.marks ? parseInt(row.marks) : null,
          quest: row.quest ? parseInt(row.quest) : null,
          split: row.split || null,
          total: row.total ? parseInt(row.total) : null,
          description: row.description || null,
          max_btl: row.max_btl ? String(row.max_btl) : null,
        };
        if (row.id) {
          updates.push(supabase.from('qp_type').update(payload).eq('id', row.id));
        } else {
          inserts.push(payload);
        }
      }

      // run updates
      if (updates.length) {
        await Promise.all(updates);
      }
      if (inserts.length) {
        const { error } = await supabase.from('qp_type').insert(inserts);
        if (error) throw error;
      }

      onClose(true);
    } catch (err: any) {
      console.error('Edit save error', err);
      alert('Save failed: ' + (err?.message || String(err)));
      setSavingRow(false);
    }
  };

  return (
    <div className="p-4">
      <div className="grid grid-cols-2 gap-4 mb-4">
        <div>
          <label className="block text-sm font-medium text-slate-700">QP type (common)</label>
          <input value={commonQpType} onChange={(e) => setCommonQpType(e.target.value)} className="mt-1 block w-full rounded-md border px-3 py-2" />
        </div>
        <div>
          <label className="block text-sm font-medium text-slate-700">QP set name (optional)</label>
          <input value={setName} onChange={(e) => setSetName(e.target.value)} className="mt-1 block w-full rounded-md border px-3 py-2" placeholder="e.g., Model A" />
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-slate-200">
          <thead className="bg-slate-50">
            <tr>
              <th className="px-2 py-2 text-left text-sm font-medium">Part</th>
              <th className="px-2 py-2 text-left text-sm font-medium">Type</th>
              <th className="px-2 py-2 text-left text-sm font-medium">Marks</th>
              <th className="px-2 py-2 text-left text-sm font-medium">Quest</th>
              <th className="px-2 py-2 text-left text-sm font-medium">Split</th>
              <th className="px-2 py-2 text-left text-sm font-medium">Total</th>
              <th className="px-2 py-2 text-left text-sm font-medium">Description</th>
              <th className="px-2 py-2 text-left text-sm font-medium">BTL</th>
              <th className="px-2 py-2 text-left text-sm font-medium">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {rows.map((row, i) => (
              <tr key={i}>
                <td className="px-2 py-2"><input className="w-20 rounded border px-2 py-1" value={row.part} onChange={(e) => updateRow(i, 'part', e.target.value)} /></td>
                <td className="px-2 py-2"><input className="w-28 rounded border px-2 py-1" value={row.type} onChange={(e) => updateRow(i, 'type', e.target.value)} /></td>
                <td className="px-2 py-2"><input className="w-20 rounded border px-2 py-1" value={row.marks} onChange={(e) => updateRow(i, 'marks', e.target.value)} /></td>
                <td className="px-2 py-2"><input className="w-20 rounded border px-2 py-1" value={row.quest} onChange={(e) => updateRow(i, 'quest', e.target.value)} /></td>
                <td className="px-2 py-2"><input className="w-24 rounded border px-2 py-1" value={row.split} onChange={(e) => updateRow(i, 'split', e.target.value)} /></td>
                <td className="px-2 py-2"><input className="w-20 rounded border px-2 py-1" value={row.total} onChange={(e) => updateRow(i, 'total', e.target.value)} /></td>
                <td className="px-2 py-2"><input className="w-48 rounded border px-2 py-1" value={row.description} onChange={(e) => updateRow(i, 'description', e.target.value)} /></td>
                <td className="px-2 py-2"><input className="w-20 rounded border px-2 py-1" value={row.max_btl} onChange={(e) => updateRow(i, 'max_btl', e.target.value)} /></td>
                <td className="px-2 py-2">
                  <button className="text-sm text-red-600" onClick={() => removeRow(i)} disabled={rows.length === 1}>Remove</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="flex items-center gap-3 mt-4">
        <button type="button" className="px-3 py-2 bg-slate-100 rounded" onClick={addRow}>Add Row</button>
        <div className="flex-1" />
        <button type="button" className="px-4 py-2 bg-white border rounded" onClick={() => onClose(false)}>Cancel</button>
        <button type="button" className="px-4 py-2 bg-blue-600 text-white rounded" onClick={handleSave} disabled={savingRow}>{savingRow ? 'Saving…' : 'Save'}</button>
      </div>
    </div>
  );
}
