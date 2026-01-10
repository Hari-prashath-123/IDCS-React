import DashboardLayout from "../../components/DashboardLayout";
import { useAuth } from "../../contexts/AuthContext";
import { useState, useEffect } from "react";
import { supabase } from "../../lib/supabase";
import { useNavigate } from "react-router-dom";

export default function HOdCurriculum() {
  const { profile } = useAuth();
  const navigate = useNavigate();
  const [tab, setTab] = useState<'qp_type' | 'master'>('qp_type');
  const [qpTypes, setQpTypes] = useState<any[]>([]);
  const [masterRows, setMasterRows] = useState<any[]>([]);
  const [deptFilter, setDeptFilter] = useState<string | null>(null);
  const [deptFilterId, setDeptFilterId] = useState<string | null>(null);
  const [hodDepartments, setHodDepartments] = useState<Array<{ id: string; name: string }>>([]);
  const [groupDeptMap, setGroupDeptMap] = useState<Record<string, string[]>>({});
  const [departmentGroupsRows, setDepartmentGroupsRows] = useState<any[]>([]);
  const [loadingQp, setLoadingQp] = useState(false);
  const [loadingMaster, setLoadingMaster] = useState(false);

  useEffect(() => {
    if (profile?.department === "IQAC") {
      navigate("/iqac/curriculum");
    }
  }, [profile, navigate]);

  useEffect(() => {
    let mounted = true;

    // load qp types
    (async () => {
      try {
        setLoadingQp(true);
        const { data, error } = await supabase.from('qp_type').select('*').order('id', { ascending: true });
        if (!mounted) return;
        if (!error) setQpTypes(data || []);
      } catch (e) {
        console.error('Failed to load qp_type', e);
      } finally {
        if (mounted) setLoadingQp(false);
      }
    })();

    // load master rows
    (async () => {
      try {
        setLoadingMaster(true);
        const { data, error } = await supabase.from('curriculum_master').select('*').order('sem', { ascending: true }).order('group_name', { ascending: true });
        if (!mounted) return;
        if (!error) setMasterRows(data || []);
      } catch (e) {
        console.error('Failed to load curriculum_master', e);
      } finally {
        if (mounted) setLoadingMaster(false);
      }
    })();

    // load department_leads for this HOD
    (async () => {
      try {
        if (!profile?.id) return;
        const { data: leads } = await supabase
          .from('department_leads')
          .select('department_id, departments(name)')
          .eq('hod_id', profile.id);
        const depts = (leads || []).map((l: any) => ({ id: l.department_id, name: (l.departments && l.departments.name) || '' }));
        if (depts.length > 0) setHodDepartments(depts);
      } catch (e) {
        console.debug('Could not load department_leads for HOD curriculum', e);
      }
    })();

    // load department_groups mapping
    (async () => {
      try {
        const { data: rows } = await supabase.from('department_groups').select('name, department_id, sem');
        const r = rows || [];
        setDepartmentGroupsRows(r as any[]);
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
        console.debug('Failed to load department_groups mapping', e);
      }
    })();

    return () => { mounted = false; };
  }, [profile?.id]);

  // compute displayed master rows outside JSX
  const displayedMasterRows = (() => {
    if (!deptFilter && !deptFilterId) return masterRows || [];
    const want = deptFilter ? String(deptFilter).toUpperCase() : '';
    const allowedGroups = new Set<string>();
    if (deptFilterId) {
      (departmentGroupsRows || []).forEach((gr) => {
        if (gr.department_id === deptFilterId && gr.name) allowedGroups.add(String(gr.name).trim());
      });
    }

    return (masterRows || []).filter((r) => {
      const g = (r.group_name || '').toString().trim();
      if (!g) return false;
      const gUp = g.toUpperCase();
      if (gUp === 'ALL' || gUp === 'DEPT') return true;
      const tokens = g.split(/[\\/,&]|\s+/).map((t: string) => t.trim().toUpperCase()).filter(Boolean);
      if (want && tokens.includes(want)) return true;
      if (allowedGroups.has(g)) return true;
      const semKey = (r.sem === null || typeof r.sem === 'undefined') ? '' : String(r.sem).toString().trim();
      const key = `${g}::${semKey}`;
      const depts = groupDeptMap[key] || [];
      return depts.some((d: string) => deptFilter ? String(d).toUpperCase() === want : false);
    });
  })();

  return (
    <DashboardLayout>
      <div className="max-w-7xl mx-auto p-6">
        <h1 className="text-2xl font-semibold mb-4">Curriculum</h1>

        <div className="flex items-center gap-3 mb-6">
          <button
            onClick={() => setTab('qp_type')}
            className={`px-3 py-1.5 rounded-md font-medium text-sm transition-colors ${tab === 'qp_type' ? 'bg-blue-600 text-white' : 'bg-white border border-slate-200 text-slate-700 hover:bg-slate-50'}`}
          >
            QP type
          </button>

          <button
            onClick={() => setTab('master')}
            className={`px-3 py-1.5 rounded-md font-medium text-sm transition-colors ${tab === 'master' ? 'bg-blue-600 text-white' : 'bg-white border border-slate-200 text-slate-700 hover:bg-slate-50'}`}
          >
            Master
          </button>

          {hodDepartments.map(d => (
            <button
              key={d.id}
              onClick={() => { setTab('master'); setDeptFilter(d.name); setDeptFilterId(d.id); }}
              className={`px-3 py-1.5 rounded-md font-medium text-sm transition-colors ${tab === 'master' && deptFilterId === d.id ? 'bg-blue-600 text-white' : 'bg-white border border-slate-200 text-slate-700 hover:bg-slate-50'}`}
            >
              {d.name || 'Department'}
            </button>
          ))}
        </div>

        <div>
          {tab === 'qp_type' && (
            <div>
              <div className="mb-3">
                <h2 className="text-lg font-semibold">QP type</h2>
                <p className="text-slate-600">Question paper types and parts.</p>
              </div>

              <div className="mt-2 overflow-x-auto">
                <table className="min-w-full divide-y divide-slate-200 bg-white rounded-lg shadow-sm">
                  <thead className="bg-slate-50">
                    <tr>
                      <th className="px-4 py-2 text-left text-sm font-medium text-slate-700">QP type</th>
                      <th className="px-4 py-2 text-left text-sm font-medium text-slate-700">Part</th>
                      <th className="px-4 py-2 text-left text-sm font-medium text-slate-700">Type</th>
                      <th className="px-4 py-2 text-left text-sm font-medium text-slate-700">Marks</th>
                      <th className="px-4 py-2 text-left text-sm font-medium text-slate-700">Quest</th>
                      <th className="px-4 py-2 text-left text-sm font-medium text-slate-700">Total</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {loadingQp ? (
                      <tr><td colSpan={6} className="px-4 py-4 text-sm text-slate-500">Loading...</td></tr>
                    ) : qpTypes.length === 0 ? (
                      <tr><td colSpan={6} className="px-4 py-4 text-sm text-slate-500">No QP types yet.</td></tr>
                    ) : (
                      qpTypes.map((r: any) => (
                        <tr key={r.id}>
                          <td className="px-4 py-3 text-sm text-slate-700">{r.qp_type}</td>
                          <td className="px-4 py-3 text-sm text-slate-700">{r.part}</td>
                          <td className="px-4 py-3 text-sm text-slate-700">{r.type}</td>
                          <td className="px-4 py-3 text-sm text-slate-700">{r.marks}</td>
                          <td className="px-4 py-3 text-sm text-slate-700">{r.quest}</td>
                          <td className="px-4 py-3 text-sm text-slate-700">{r.total}</td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {tab === 'master' && (
            <div>
              <div className="mb-3">
                <h2 className="text-lg font-semibold">Master</h2>
                <p className="text-slate-600">Master curriculum rows.</p>
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
                      <th className="px-3 py-2 text-left text-sm font-medium text-slate-700">C</th>
                      <th className="px-3 py-2 text-left text-sm font-medium text-slate-700">INT</th>
                      <th className="px-3 py-2 text-left text-sm font-medium text-slate-700">EXT</th>
                      <th className="px-3 py-2 text-left text-sm font-medium text-slate-700">TTL</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {loadingMaster ? (
                      <tr><td colSpan={9} className="px-3 py-4 text-sm text-slate-500">Loading...</td></tr>
                    ) : displayedMasterRows.length === 0 ? (
                      <tr><td colSpan={9} className="px-3 py-4 text-sm text-slate-500">No master rows available.</td></tr>
                    ) : (
                      displayedMasterRows.map((r: any) => (
                        <tr key={r.id}>
                          <td className="px-3 py-3 text-sm text-slate-700">{r.sem}</td>
                          <td className="px-3 py-3 text-sm text-slate-700">{r.group_name}</td>
                          <td className="px-3 py-3 text-sm text-slate-700">{r.class ?? ''}</td>
                          <td className="px-3 py-3 text-sm text-slate-700">{r.course}</td>
                          <td className="px-3 py-3 text-sm text-slate-700">{r.course_code ?? ''}</td>
                          <td className="px-3 py-3 text-sm text-slate-700">{r.c}</td>
                          <td className="px-3 py-3 text-sm text-slate-700">{r.int_marks}</td>
                          <td className="px-3 py-3 text-sm text-slate-700">{r.ext_marks}</td>
                          <td className="px-3 py-3 text-sm text-slate-700">{r.ttl}</td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      </div>
    </DashboardLayout>
  );
}
