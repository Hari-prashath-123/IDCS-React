import DashboardLayout from '../../components/DashboardLayout';
import { useAuth } from '../../contexts/AuthContext';
import { useNavigate } from 'react-router-dom';
import { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';

export default function IQACDepartmentsPage() {
  const { profile } = useAuth();
  const isIqacHod = !!(profile && (profile.role === 'admin' || (profile.role === 'hod' && profile.department && String(profile.department).toUpperCase() === 'IQAC')));

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

  return (
    <DashboardLayout>
      <div className="max-w-7xl mx-auto p-6">
        <h1 className="text-2xl font-bold mb-2">Departments</h1>
        <ViewNav />
      </div>
    </DashboardLayout>
  );
}

function DepartmentsTable() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState<Array<any>>([]);
  const [editDept, setEditDept] = useState<any | null>(null);
  const [candidates, setCandidates] = useState<Array<any>>([]);
  useEffect(() => {
    let mounted = true;
    async function loadAllCandidates() {
      try {
        const { data } = await supabase.from('profiles').select('id, name, email, role').neq('role', 'student').limit(500);
        if (!mounted) return;
        setCandidates(data || []);
      } catch (e) {
        console.error('Failed to load candidates for Add modal', e);
      }
    }
    loadAllCandidates();
    return () => { mounted = false; };
  }, []);

  // load function so we can call it from event listener as well
  useEffect(() => {
    let mounted = true;
    async function load() {
      setLoading(true);
      try {
        const { data: deptsData, error: deptsErr } = await supabase.from('departments').select('id, name, full_form, code, degree, year').order('name', { ascending: true });
        if (deptsErr) throw deptsErr;
        if (!deptsData || !Array.isArray(deptsData) || deptsData.length === 0) {
          setRows([]);
          return;
        }
        const deptIds = (deptsData as any[]).map(d => d.id);
        const { data: leadsData, error: leadsErr } = await supabase.from('department_leads').select('department_id, hod_id, ahod_id').in('department_id', deptIds);
        if (leadsErr) throw leadsErr;
        const leads = leadsData || [];
        const staffIds = Array.from(new Set(leads.flatMap((l: any) => [l.hod_id, l.ahod_id].filter(Boolean))));
        let profilesMap: Record<string, any> = {};
        if (staffIds.length > 0) {
          const { data: profs } = await supabase.from('profiles').select('id, name, email').in('id', staffIds);
          (profs || []).forEach((p: any) => { profilesMap[p.id] = p; });
        }
        const out = (deptsData as any[]).map(d => {
          const lead = (leads || []).find((l: any) => l.department_id === d.id) || {};
          const hod = lead.hod_id ? profilesMap[lead.hod_id] : undefined;
          const ahod = lead.ahod_id ? profilesMap[lead.ahod_id] : undefined;
          return { id: d.id, name: d.name, full_form: d.full_form, code: d.code, degree: d.degree, year: d.year, hod, hod_id: lead.hod_id || null, ahod, ahod_id: lead.ahod_id || null };
        });
        // fetch candidate profiles for selects (basic list)
        if (staffIds.length === 0) {
          const { data: allProfs } = await supabase.from('profiles').select('id, name, email, role').neq('role', 'student').limit(200);
          setCandidates(allProfs || []);
        } else {
          const { data: allProfs } = await supabase.from('profiles').select('id, name, email, role').neq('role', 'student').limit(200);
          setCandidates(allProfs || []);
        }
        if (mounted) setRows(out);
      } catch (err) {
        console.error('Failed to load departments', err);
      } finally {
        if (mounted) setLoading(false);
      }
    }

    load();

    const handler = () => { load(); };
    window.addEventListener('departments:changed', handler as EventListener);
    return () => { mounted = false; window.removeEventListener('departments:changed', handler as EventListener); };
  }, []);

  if (loading) return <div className="py-6 text-slate-600">Loading departments...</div>;
  if (rows.length === 0) return <div className="py-6 text-slate-600">No departments found.</div>;

  return (
    <>
    <div className="bg-white rounded-lg border border-slate-100 p-4">
      <table className="min-w-full table-auto">
        <thead>
          <tr className="text-left text-sm text-slate-600">
            <th className="px-3 py-2">Department</th>
            <th className="px-3 py-2">HOD</th>
            <th className="px-3 py-2">AHOD</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id} className="border-t">
              <td className="px-3 py-3 align-top font-medium">{r.name}</td>
              <td className="px-3 py-3 align-top text-sm text-slate-700">
                {r.hod ? (
                  <div>
                    <div className="font-medium text-slate-900 cursor-pointer" onClick={() => navigate(`/principal/staff/${r.hod.id}`)}>{r.hod.name}</div>
                    <div className="text-xs text-slate-500">{r.hod.email}</div>
                  </div>
                ) : (
                  <span className="text-slate-500">—</span>
                )}
              </td>
              <td className="px-3 py-3 align-top text-sm text-slate-700">
                {r.ahod ? (
                  <div>
                    <div className="font-medium text-slate-900 cursor-pointer" onClick={() => navigate(`/principal/staff/${r.ahod.id}`)}>{r.ahod.name}</div>
                    <div className="text-xs text-slate-500">{r.ahod.email}</div>
                  </div>
                ) : (
                  <span className="text-slate-500">—</span>
                )}
              </td>
              <td className="px-3 py-3 align-top text-sm text-slate-700">
                <button onClick={() => setEditDept(r)} className="px-2 py-1 text-sm bg-slate-100 rounded">Edit</button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
    {editDept && <EditDepartmentModal dept={editDept} onClose={() => setEditDept(null)} onSaved={() => { window.dispatchEvent(new CustomEvent('departments:changed')); setEditDept(null); }} candidates={candidates} />}
    </>
  );
}

function EditDepartmentModal({ dept, onClose, onSaved, candidates }: { dept: any; onClose: () => void; onSaved: () => void; candidates: any[] }) {
  const [name, setName] = useState(dept.name || '');
  const [fullForm, setFullForm] = useState(dept.full_form || '');
  const [code, setCode] = useState(dept.code || '');
  const [degree, setDegree] = useState(dept.degree || '');
  const [year, setYear] = useState<number | undefined>(dept.year || undefined);
  const [hodId, setHodId] = useState<string | null>(dept.hod_id || null);
  const [ahodId, setAhodId] = useState<string | null>(dept.ahod_id || null);
  const [saving, setSaving] = useState(false);
  const [localCandidates, setLocalCandidates] = useState<any[]>([]);

  useEffect(() => {
    let mounted = true;
    async function loadCandidatesForDept() {
      try {
        // fetch profiles whose department matches this department (case-insensitive)
        const { data } = await supabase.from('profiles').select('id, name, email, role').ilike('department', dept.name || '').neq('role', 'student');
        let list = (data || []).slice();

        // If department has no staff, fall back to showing all non-student staff
        if (list.length === 0) {
          const { data: all } = await supabase.from('profiles').select('id, name, email, role').neq('role', 'student').limit(500);
          list = (all || []).slice();
        }

        // ensure current hod/ahod (if any) are present in options
        const needIds = [hodId, ahodId].filter(Boolean).filter(id => !list.find(c => c.id === id));
        if (needIds.length > 0) {
          const { data: more } = await supabase.from('profiles').select('id, name, email, role').in('id', needIds as string[]).neq('role', 'student');
          (more || []).forEach((p: any) => { if (!list.find((x: any) => x.id === p.id)) list.push(p); });
        }

        if (mounted) setLocalCandidates(list);
      } catch (e) {
        console.error('Failed to load department candidates', e);
        if (mounted) setLocalCandidates(candidates || []);
      }
    }
    loadCandidatesForDept();
    return () => { mounted = false; };
  }, [dept.id]);

  async function handleSave() {
    setSaving(true);
    try {
      // update department
      const updatePayload: any = { name };
      if (fullForm !== undefined) updatePayload.full_form = fullForm || null;
      if (code !== undefined) updatePayload.code = code || null;
      if (degree !== undefined) updatePayload.degree = degree || null;
      if (year !== undefined) updatePayload.year = year || null;
      const { error: deptErr } = await supabase.from('departments').update(updatePayload).eq('id', dept.id);
      if (deptErr) throw deptErr;

      // ensure staff rows exist and update their roles/profiles
      let hodStaffId: string | null = null;
      let ahodStaffId: string | null = null;

      if (hodId) {
        const { data: hodStaff } = await supabase.from('staff').select('id').eq('id', hodId).maybeSingle();
        if (hodStaff && hodStaff.id) {
          hodStaffId = hodStaff.id;
          await supabase.from('staff').update({ staff_role: 'hod' }).eq('id', hodId);
        } else {
          const { error: createErr } = await supabase.from('staff').insert({ id: hodId, staff_id: `HOD_${hodId.substring(0,8)}`, staff_role: 'hod', on_leave: false });
          if (!createErr) hodStaffId = hodId;
        }
        await supabase.from('profiles').update({ role: 'hod', department: name }).eq('id', hodId);
      }

      if (ahodId) {
        const { data: ahodStaff } = await supabase.from('staff').select('id').eq('id', ahodId).maybeSingle();
        if (ahodStaff && ahodStaff.id) {
          ahodStaffId = ahodStaff.id;
          await supabase.from('staff').update({ staff_role: 'ahod' }).eq('id', ahodId);
        } else {
          const { error: createErr } = await supabase.from('staff').insert({ id: ahodId, staff_id: `AHOD_${ahodId.substring(0,8)}`, staff_role: 'ahod', on_leave: false });
          if (!createErr) ahodStaffId = ahodId;
        }
        await supabase.from('profiles').update({ role: 'ahod', department: name }).eq('id', ahodId);
      }

      // upsert department_leads
      const upsertRow: any = { department_id: dept.id, hod_id: hodStaffId, ahod_id: ahodStaffId };
      const { error: upErr } = await supabase.from('department_leads').upsert(upsertRow, { onConflict: 'department_id' }).select();
      if (upErr) throw upErr;

      onSaved();
    } catch (err) {
      console.error('Failed to save department', err);
      alert('Failed to save department');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center">
      <div className="bg-white rounded-lg w-full max-w-lg p-6">
        <h3 className="text-lg font-semibold mb-3">Edit Department</h3>
        <label className="block text-sm text-slate-600 mb-1">Name</label>
        <input value={name} onChange={(e) => setName(e.target.value)} className="w-full border px-3 py-2 rounded mb-3" />
        <label className="block text-sm text-slate-600 mb-1">Full form</label>
        <input value={fullForm || ''} onChange={(e) => setFullForm(e.target.value)} className="w-full border px-3 py-2 rounded mb-3" />
        <label className="block text-sm text-slate-600 mb-1">Code</label>
        <input value={code || ''} onChange={(e) => setCode(e.target.value)} className="w-full border px-3 py-2 rounded mb-3" />
        <label className="block text-sm text-slate-600 mb-1">Degree</label>
        <input value={degree || ''} onChange={(e) => setDegree(e.target.value)} className="w-full border px-3 py-2 rounded mb-3" />
        <label className="block text-sm text-slate-600 mb-1">Year</label>
        <input type="number" value={year ?? ''} onChange={(e) => setYear(e.target.value ? Number(e.target.value) : undefined)} className="w-full border px-3 py-2 rounded mb-3" />

        <label className="block text-sm text-slate-600 mb-1">HOD (optional)</label>
        <select value={hodId || ''} onChange={(e) => setHodId(e.target.value || null)} className="w-full border px-3 py-2 rounded mb-3">
          <option value="">(none)</option>
          {localCandidates.map(c => (
            <option key={c.id} value={c.id}>{c.name} — {c.email}</option>
          ))}
        </select>

        <label className="block text-sm text-slate-600 mb-1">AHOD (optional)</label>
        <select value={ahodId || ''} onChange={(e) => setAhodId(e.target.value || null)} className="w-full border px-3 py-2 rounded mb-3">
          <option value="">(none)</option>
          {localCandidates.map(c => (
            <option key={c.id} value={c.id}>{c.name} — {c.email}</option>
          ))}
        </select>

        <div className="flex justify-end gap-2">
          <button onClick={onClose} className="px-4 py-2 bg-gray-200 rounded">Cancel</button>
          <button onClick={handleSave} disabled={saving} className="px-4 py-2 bg-emerald-600 text-white rounded">{saving ? 'Saving...' : 'Save'}</button>
        </div>
      </div>
    </div>
  );
}

function ViewNav() {
  const [view, setView] = useState<'dept' | 'students' | 'staffs' | 'group'>('dept');
  const [showAdd, setShowAdd] = useState(false);
  const [name, setName] = useState('');
  const [fullForm, setFullForm] = useState('');
  const [code, setCode] = useState('');
  const [degree, setDegree] = useState('');
  const [year, setYear] = useState<number | undefined>(undefined);
  const [hodId, setHodId] = useState<string | null>(null);
  const [ahodId, setAhodId] = useState<string | null>(null);
  const [candidates, setCandidates] = useState<Array<any>>([]);
  return (
    <div>
      <div className="flex items-center gap-3 mb-4">
        <button
          onClick={() => setView('dept')}
          className={`px-3 py-1.5 rounded-md font-medium text-sm ${view === 'dept' ? 'bg-blue-600 text-white' : 'bg-white border border-slate-200 text-slate-700 hover:bg-slate-50'}`}
        >
          Dept
        </button>
        <button
          onClick={() => setView('students')}
          className={`px-3 py-1.5 rounded-md font-medium text-sm ${view === 'students' ? 'bg-blue-600 text-white' : 'bg-white border border-slate-200 text-slate-700 hover:bg-slate-50'}`}
        >
          Students
        </button>
        <button
          onClick={() => setView('staffs')}
          className={`px-3 py-1.5 rounded-md font-medium text-sm ${view === 'staffs' ? 'bg-blue-600 text-white' : 'bg-white border border-slate-200 text-slate-700 hover:bg-slate-50'}`}
        >
          Staffs
        </button>
        <button
          onClick={() => setView('group')}
          className={`px-3 py-1.5 rounded-md font-medium text-sm ${view === 'group' ? 'bg-blue-600 text-white' : 'bg-white border border-slate-200 text-slate-700 hover:bg-slate-50'}`}
        >
          Groups
        </button>
        <div className="ml-auto">
          {view === 'dept' && (
            <button
              onClick={() => setShowAdd(true)}
              className="px-3 py-1.5 rounded-md font-medium text-sm bg-emerald-600 text-white hover:bg-emerald-700"
            >
              Add Department
            </button>
          )}
          {view === 'group' && (
            <button
              onClick={() => window.dispatchEvent(new CustomEvent('groups:create'))}
              className="px-3 py-1.5 rounded-md font-medium text-sm bg-emerald-600 text-white hover:bg-emerald-700"
            >
              Create new group
            </button>
          )}
        </div>
      </div>
      <div>
        {view === 'dept' && <DepartmentsTable />}
        {view === 'students' && (
          <div className="py-6 text-slate-600">Students view placeholder</div>
        )}
        {view === 'staffs' && (
          <div className="py-6 text-slate-600">Staffs view placeholder</div>
        )}
        {view === 'group' && <GroupsTable />}
      </div>
      {showAdd && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center">
          <div className="bg-white rounded-lg w-full max-w-md p-6">
            <h3 className="text-lg font-semibold mb-3">Add Department</h3>
            <input value={name} onChange={(e) => setName(e.target.value)} className="w-full border px-3 py-2 rounded mb-3" placeholder="Department name" />
            <label className="block text-sm text-slate-600 mb-1">Full form (optional)</label>
            <input value={fullForm} onChange={(e) => setFullForm(e.target.value)} className="w-full border px-3 py-2 rounded mb-3" placeholder="e.g. Computer Science and Engineering" />
            <label className="block text-sm text-slate-600 mb-1">Code (optional)</label>
            <input value={code} onChange={(e) => setCode(e.target.value)} className="w-full border px-3 py-2 rounded mb-3" placeholder="e.g. CS" />
            <label className="block text-sm text-slate-600 mb-1">Degree (optional)</label>
            <input value={degree} onChange={(e) => setDegree(e.target.value)} className="w-full border px-3 py-2 rounded mb-3" placeholder="e.g. B.Tech" />
            <label className="block text-sm text-slate-600 mb-1">Year (optional)</label>
            <input type="number" value={year ?? ''} onChange={(e) => setYear(e.target.value ? Number(e.target.value) : undefined)} className="w-full border px-3 py-2 rounded mb-3" placeholder="e.g. 2026" />
            <label className="block text-sm text-slate-600 mb-1">HOD (optional)</label>
            <select value={hodId || ''} onChange={(e) => setHodId(e.target.value || null)} className="w-full border px-3 py-2 rounded mb-3">
              <option value="">(none)</option>
              {candidates.map(c => (
                <option key={c.id} value={c.id}>{c.name} — {c.email}</option>
              ))}
            </select>
            <label className="block text-sm text-slate-600 mb-1">AHOD (optional)</label>
            <select value={ahodId || ''} onChange={(e) => setAhodId(e.target.value || null)} className="w-full border px-3 py-2 rounded mb-3">
              <option value="">(none)</option>
              {candidates.map(c => (
                <option key={c.id} value={c.id}>{c.name} — {c.email}</option>
              ))}
            </select>
            <div className="flex justify-end gap-2">
              <button onClick={() => { setShowAdd(false); setName(''); }} className="px-4 py-2 bg-gray-200 rounded">Cancel</button>
              <button onClick={async () => {
                if (!name || !name.trim()) return;
                try {
                  const deptName = name.trim();
                  // ensure department exists or insert
                  let deptId: string | null = null;
                  const { data: existing } = await supabase.from('departments').select('id').eq('name', deptName).maybeSingle();
                  if (existing && existing.id) deptId = existing.id;
                  else {
                    const { data: ins, error: insErr } = await supabase.from('departments').insert({ name: deptName, full_form: fullForm || null, code: code || null, degree: degree || null, year: year ?? null }).select('id').maybeSingle();
                    if (insErr) throw insErr;
                    deptId = ins?.id || null;
                  }

                  // Prepare hod/ahod staff ids (ensure staff row exists for selected profile ids)
                  let hodStaffId: string | null = null;
                  let ahodStaffId: string | null = null;

                  if (hodId) {
                    // check staff row
                    const { data: hodStaff } = await supabase.from('staff').select('id').eq('id', hodId).maybeSingle();
                    if (hodStaff && hodStaff.id) {
                      hodStaffId = hodStaff.id;
                      await supabase.from('staff').update({ staff_role: 'hod' }).eq('id', hodId);
                    } else {
                      const { error: createErr } = await supabase.from('staff').insert({ id: hodId, staff_id: `HOD_${hodId.substring(0,8)}`, staff_role: 'hod', on_leave: false });
                      if (!createErr) hodStaffId = hodId;
                    }
                    // also update profile role/department
                    await supabase.from('profiles').update({ role: 'hod', department: deptName }).eq('id', hodId);
                  }

                  if (ahodId) {
                    const { data: ahodStaff } = await supabase.from('staff').select('id').eq('id', ahodId).maybeSingle();
                    if (ahodStaff && ahodStaff.id) {
                      ahodStaffId = ahodStaff.id;
                      await supabase.from('staff').update({ staff_role: 'ahod' }).eq('id', ahodId);
                    } else {
                      const { error: createErr } = await supabase.from('staff').insert({ id: ahodId, staff_id: `AHOD_${ahodId.substring(0,8)}`, staff_role: 'ahod', on_leave: false });
                      if (!createErr) ahodStaffId = ahodId;
                    }
                    await supabase.from('profiles').update({ role: 'ahod', department: deptName }).eq('id', ahodId);
                  }

                  if (deptId) {
                    const upsertRow: any = { department_id: deptId, hod_id: hodStaffId, ahod_id: ahodStaffId };
                    const { error: upErr } = await supabase.from('department_leads').upsert(upsertRow, { onConflict: 'department_id' }).select();
                    if (upErr) throw upErr;
                  }

                  window.dispatchEvent(new CustomEvent('departments:changed'));
                  setShowAdd(false);
                  setName('');
                  setFullForm('');
                  setCode('');
                  setDegree('');
                  setYear(undefined);
                  setHodId(null);
                  setAhodId(null);
                } catch (e) {
                  console.error('Failed to add department', e);
                  alert('Failed to add department');
                }
              }} className="px-4 py-2 bg-emerald-600 text-white rounded">Save</button>
            </div>
          </div>
        </div>
      )}
      {/* Create Group modal & view components */}
      
      
    </div>
  );
}

function GroupsTable() {
  const [loading, setLoading] = useState(true);
  const [groups, setGroups] = useState<any[]>([]);
  const [deletingKey, setDeletingKey] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [editGroup, setEditGroup] = useState<any | null>(null);

  useEffect(() => {
    let mounted = true;
    async function load() {
      setLoading(true);
      try {
        // Attempt to load groups from `department_groups` table; if not present, will surface error
        const { data, error } = await supabase.from('department_groups').select('id, name, department_id, created_by, sem').order('sem', { ascending: true }).order('name', { ascending: true });
        if (error) {
          console.warn('department_groups load failed', error);
          if (mounted) setGroups([]);
        } else {
          const rows = data || [];
          // fetch department names
          const deptIds = Array.from(new Set(rows.map((r: any) => r.department_id).filter(Boolean)));
          let deptMap: Record<string, string> = {};
          if (deptIds.length > 0) {
            const { data: depts } = await supabase.from('departments').select('id, name').in('id', deptIds as string[]);
            (depts || []).forEach((d: any) => { deptMap[d.id] = d.name; });
          }
          // group rows by group name and collect department names
          const grouped: Record<string, { name: string; departments: string[]; department_ids: string[]; sem?: string | null }> = {};
          (rows as any[]).forEach(r => {
            const gname = r.name || 'Unnamed';
            const semKey = r.sem || '';
            const key = `${gname}::${semKey}`;
            const dname = deptMap[r.department_id] || r.department_id;
            if (!grouped[key]) grouped[key] = { name: gname, departments: [], department_ids: [], sem: r.sem || null };
            if (!grouped[key].departments.includes(dname)) grouped[key].departments.push(dname);
            if (!grouped[key].department_ids.includes(r.department_id)) grouped[key].department_ids.push(r.department_id);
          });
          let out = Object.values(grouped).map(g => ({ name: g.name, departments: g.departments, department_ids: g.department_ids, sem: g.sem }));
          out.sort((a, b) => {
            const sa = (a.sem || '').toString();
            const sb = (b.sem || '').toString();
            const cmp = sa.localeCompare(sb, undefined, { numeric: true, sensitivity: 'base' });
            if (cmp !== 0) return cmp;
            return (a.name || '').localeCompare(b.name || '', undefined, { sensitivity: 'base' });
          });
          if (mounted) setGroups(out as any[]);
        }
      } catch (e) {
        console.error('Failed to load groups', e);
        if (mounted) setGroups([]);
      } finally {
        if (mounted) setLoading(false);
      }
    }
    load();
    const handler = () => { load(); };
    window.addEventListener('groups:changed', handler as EventListener);
    const createHandler = () => { setShowCreate(true); };
    window.addEventListener('groups:create', createHandler as EventListener);
    return () => { mounted = false; window.removeEventListener('groups:changed', handler as EventListener); window.removeEventListener('groups:create', createHandler as EventListener); };
  }, []);

  async function deleteGroup(group: any) {
    if (!group || !group.name) return;
    const key = `${group.name}::${group.sem || ''}`;
    if (!confirm(`Delete group "${group.name}"${group.sem ? ' (Sem: ' + group.sem + ')' : ''}? This will remove the group for all listed departments.`)) return;
    try {
      setDeletingKey(key);
      let query: any = supabase.from('department_groups').delete().eq('name', group.name);
      if (group.sem == null || group.sem === '') {
        query = query.is('sem', null);
      } else {
        query = query.eq('sem', group.sem);
      }
      const { error } = await query;
      if (error) {
        console.error('Failed to delete group rows', error);
        alert('Failed to delete group: ' + (error.message || error));
      } else {
        window.dispatchEvent(new CustomEvent('groups:changed'));
      }
    } catch (e) {
      console.error('Delete group error', e);
      alert('Failed to delete group');
    } finally {
      setDeletingKey(null);
    }
  }

  if (loading) return <div className="py-6 text-slate-600">Loading groups...</div>;

  return (
    <div>
      <div className="flex items-center mb-3">
        <h2 className="text-lg font-medium">Department Groups</h2>
      </div>
      {groups.length === 0 ? (
        <div className="py-6 text-slate-600">No groups found.</div>
      ) : (
        <div className="bg-white rounded-lg border border-slate-100 p-4">
          <table className="min-w-full table-auto">
            <thead>
                <tr className="text-left text-sm text-slate-600">
                  <th className="px-3 py-2">Group</th>
                  <th className="px-3 py-2">Sem</th>
                  <th className="px-3 py-2">Departments</th>
                </tr>
            </thead>
            <tbody>
              {groups.map((g: any, idx: number) => (
                <tr key={idx} className="border-t">
                  <td className="px-3 py-3 align-top font-medium">{g.name}</td>
                  <td className="px-3 py-3 align-top text-sm text-slate-700">{g.sem ?? '-'}</td>
                  <td className="px-3 py-3 align-top text-sm text-slate-700 flex items-start justify-between">
                    <div className="flex-1">{Array.isArray(g.departments) ? g.departments.join(', ') : ''}</div>
                    <div className="ml-4 flex items-center gap-2">
                      <button onClick={() => setEditGroup(g)} className="px-2 py-1 text-sm bg-slate-100 rounded">Edit</button>
                      <button onClick={() => deleteGroup(g)} disabled={deletingKey === `${g.name}::${g.sem || ''}`} className="px-2 py-1 text-sm bg-red-100 text-red-700 rounded">
                        {deletingKey === `${g.name}::${g.sem || ''}` ? 'Deleting...' : 'Delete'}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {showCreate && <CreateGroupModal onClose={() => { setShowCreate(false); window.dispatchEvent(new CustomEvent('groups:changed')); }} />}
      {editGroup && <EditGroupModal group={editGroup} onClose={() => { setEditGroup(null); window.dispatchEvent(new CustomEvent('groups:changed')); }} />}
    </div>
  );
}

function CreateGroupModal({ onClose }: { onClose: () => void }) {
  const [groupName, setGroupName] = useState('');
  const [sem, setSem] = useState('');
  const [departments, setDepartments] = useState<any[]>([]);
  const [selected, setSelected] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const { profile } = useAuth();

  useEffect(() => {
    let mounted = true;
    async function loadDepts() {
      try {
        const { data } = await supabase.from('departments').select('id, name').order('name');
        if (!mounted) return;
        setDepartments(data || []);
      } catch (e) {
        console.error('Failed to load departments for group modal', e);
        if (mounted) setDepartments([]);
      }
    }
    loadDepts();
    return () => { mounted = false; };
  }, []);

  function toggleDept(id: string) {
    setSelected(s => s.includes(id) ? s.filter(x => x !== id) : [...s, id]);
  }

  async function handleSave() {
    if (!groupName || !groupName.trim()) return alert('Please enter a group name');
    setSaving(true);
    try {
      // Insert one row per selected department into `department_groups` (department_id column)
      const rows = selected.length === 0 ?
        [{ name: groupName.trim(), sem: sem || null, department_id: null, created_by: profile?.id || null }] :
        selected.map(did => ({ name: groupName.trim(), sem: sem || null, department_id: did, created_by: profile?.id || null }));
      const { data, error } = await supabase.from('department_groups').insert(rows).select();
      if (error) {
        console.error('Failed to create group rows', error);
        alert('Failed to create group. Ensure `department_groups` table exists or ask an admin to add a backend endpoint.');
        return;
      }
      onClose();
      window.dispatchEvent(new CustomEvent('groups:changed'));
    } catch (e) {
      console.error('Failed to create group', e);
      alert('Failed to create group');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center">
      <div className="bg-white rounded-lg w-full max-w-lg p-6">
        <h3 className="text-lg font-semibold mb-3">Create Department Group</h3>
        <label className="block text-sm text-slate-600 mb-1">Sem (common)</label>
        <input value={sem} onChange={(e) => setSem(e.target.value)} className="w-full border px-3 py-2 rounded mb-3" placeholder="e.g. I or 1" />
        <label className="block text-sm text-slate-600 mb-1">Group name</label>
        <input value={groupName} onChange={(e) => setGroupName(e.target.value)} className="w-full border px-3 py-2 rounded mb-3" />
        <label className="block text-sm text-slate-600 mb-2">Select departments (multiple)</label>
        <div className="max-h-56 overflow-auto border rounded p-2 mb-3">
          {departments.length === 0 ? (
            <div className="text-slate-500">No departments available</div>
          ) : (
            departments.map(d => (
              <label key={d.id} className="flex items-center gap-2 mb-1">
                <input type="checkbox" checked={selected.includes(d.id)} onChange={() => toggleDept(d.id)} />
                <span>{d.name}</span>
              </label>
            ))
          )}
        </div>
        <div className="flex justify-end gap-2">
          <button onClick={onClose} className="px-4 py-2 bg-gray-200 rounded">Cancel</button>
          <button onClick={handleSave} disabled={saving} className="px-4 py-2 bg-emerald-600 text-white rounded">{saving ? 'Saving...' : 'Create'}</button>
        </div>
      </div>
    </div>
  );
}

function EditGroupModal({ group, onClose }: { group: any; onClose: () => void }) {
  const [groupName, setGroupName] = useState(group.name || '');
  const [sem, setSem] = useState(group.sem || '');
  const [departments, setDepartments] = useState<any[]>([]);
  const [selected, setSelected] = useState<string[]>(group.department_ids || []);
  const [saving, setSaving] = useState(false);
  const { profile } = useAuth();

  useEffect(() => {
    let mounted = true;
    async function loadDepts() {
      try {
        const { data } = await supabase.from('departments').select('id, name').order('name');
        if (!mounted) return;
        setDepartments(data || []);
      } catch (e) {
        console.error('Failed to load departments for edit modal', e);
        if (mounted) setDepartments([]);
      }
    }
    loadDepts();
    return () => { mounted = false; };
  }, []);

  function toggleDept(id: string) {
    setSelected(s => s.includes(id) ? s.filter(x => x !== id) : [...s, id]);
  }

  async function handleSave() {
    if (!groupName || !groupName.trim()) return alert('Please enter a group name');
    setSaving(true);
    try {
      // Fetch existing rows for this group name
      const { data: existingRows, error: fetchErr } = await supabase.from('department_groups').select('id, department_id, sem').eq('name', group.name);
      if (fetchErr) throw fetchErr;
      const existingIds = (existingRows || []).map((r: any) => r.department_id);
      const toAdd = selected.filter((id) => !existingIds.includes(id));
      const toRemove = existingIds.filter((id) => !selected.includes(id));

      // Update existing rows' name and sem (if changed)
      if (groupName.trim() !== group.name) {
        const { error: updErr } = await supabase.from('department_groups').update({ name: groupName.trim(), sem: sem || null }).eq('name', group.name);
        if (updErr) throw updErr;
      } else {
        // name unchanged — ensure sem is updated for rows with this name
        const { error: semErr } = await supabase.from('department_groups').update({ sem: sem || null }).eq('name', groupName.trim());
        if (semErr) throw semErr;
      }

      // Handle additions/removals. If no departments selected, collapse to one NULL-department row.
      if (selected.length === 0) {
        // delete existing specific-department rows
        if (existingIds.length > 0) {
          const { error: delErr } = await supabase.from('department_groups').delete().eq('name', groupName.trim()).in('department_id', existingIds as string[]);
          if (delErr) throw delErr;
        }
        // ensure a single null-department row exists
        const { data: nullRow, error: insNullErr } = await supabase.from('department_groups').insert([{ name: groupName.trim(), sem: sem || null, department_id: null, created_by: profile?.id || null }]).select();
        if (insNullErr) throw insNullErr;
      } else {
        if (toAdd.length > 0) {
          const rows = toAdd.map(did => ({ name: groupName.trim(), sem: sem || null, department_id: did, created_by: profile?.id || null }));
          const { error: insErr } = await supabase.from('department_groups').insert(rows);
          if (insErr) throw insErr;
        }

        if (toRemove.length > 0) {
          const { error: delErr } = await supabase.from('department_groups').delete().eq('name', groupName.trim()).in('department_id', toRemove as string[]);
          if (delErr) throw delErr;
        }
        // remove any NULL-department row if exists (we now have explicit departments)
        const { error: delNullErr } = await supabase.from('department_groups').delete().eq('name', groupName.trim()).is('department_id', null);
        if (delNullErr) throw delNullErr;
      }

      onClose();
      window.dispatchEvent(new CustomEvent('groups:changed'));
    } catch (e) {
      console.error('Failed to edit group', e);
      alert('Failed to update group');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center">
      <div className="bg-white rounded-lg w-full max-w-lg p-6">
        <h3 className="text-lg font-semibold mb-3">Edit Department Group</h3>
        <label className="block text-sm text-slate-600 mb-1">Sem (common)</label>
        <input value={sem} onChange={(e) => setSem(e.target.value)} className="w-full border px-3 py-2 rounded mb-3" placeholder="e.g. I or 1" />
        <label className="block text-sm text-slate-600 mb-1">Group name</label>
        <input value={groupName} onChange={(e) => setGroupName(e.target.value)} className="w-full border px-3 py-2 rounded mb-3" />
        <label className="block text-sm text-slate-600 mb-2">Select departments (multiple)</label>
        <div className="max-h-56 overflow-auto border rounded p-2 mb-3">
          {departments.length === 0 ? (
            <div className="text-slate-500">No departments available</div>
          ) : (
            departments.map(d => (
              <label key={d.id} className="flex items-center gap-2 mb-1">
                <input type="checkbox" checked={selected.includes(d.id)} onChange={() => toggleDept(d.id)} />
                <span>{d.name}</span>
              </label>
            ))
          )}
        </div>
        <div className="flex justify-end gap-2">
          <button onClick={onClose} className="px-4 py-2 bg-gray-200 rounded">Cancel</button>
          <button onClick={handleSave} disabled={saving} className="px-4 py-2 bg-emerald-600 text-white rounded">{saving ? 'Saving...' : 'Save'}</button>
        </div>
      </div>
    </div>
  );
}

