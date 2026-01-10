import { useState, useEffect } from "react";
import { supabase } from "../../../lib/supabase";
import { Plus, X, Power, PowerOff, Edit2, Trash2, CalendarDays } from "lucide-react";
import * as XLSX from 'xlsx';
import { useAuth } from "../../../contexts/AuthContext";

interface Subject {
  id: string;
  name: string;
  subject_code: string;
  department: string;
  year: number;
}

interface CreatedElective {
  id: string;
  sub_name: string;
  course_code: string;
  parent_subject_id: string;
  staff_id: string;
  year: number;
  department: string;
  group: string;
  is_active: boolean;
  seat_count: number | null;
  created_at: string;
  start?: string | null;
  stop?: string | null;
  parent_subject?: {
    name: string;
    subject_code: string;
  };
  staff?: {
    name: string;
  };
}

const GROUP_MAPPING = {
  ALL: ["AI&DS","AI&ML", "CSE", "IT", "ECE", "EEE", "MECH", "CIVIL"],
  CG: ["AI&DS", "CSE", "IT", "AI&ML"],
  EG: ["ECE", "EEE"],
  MG: ["MECH", "CIVIL"]
};

// Helpers to convert between ISO timestamptz and input[type=datetime-local] value
function isoToInputLocal(iso?: string | null) {
  if (!iso) return '';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function inputLocalToIso(input?: string | null) {
  if (!input) return null;
  // input is like '2026-01-07T14:30' (local). Construct Date and convert to ISO.
  const d = new Date(input);
  if (isNaN(d.getTime())) return null;
  return d.toISOString();
}

export default function CreateElectives() {
  const { profile } = useAuth();
  
  // Form state
  const [selectedGroup, setSelectedGroup] = useState<string>("");
  const [selectedDepartments, setSelectedDepartments] = useState<string[]>([]);
  const [year, setYear] = useState<number>(2);
  const [semester, setSemester] = useState<number>(4);
  const [parentSubject, setParentSubject] = useState("");
  const [useNewParent, setUseNewParent] = useState(false);
  const [newParentName, setNewParentName] = useState("");
  const [newParentCredits, setNewParentCredits] = useState("3");
  const [newParentMnemonic, setNewParentMnemonic] = useState("");
  const [electiveSubjects, setElectiveSubjects] = useState([
    { sub_name: "", course_code: "", staff_id: "", staff_name: "", seat_count: "", course_department: 'ALL', blocked_departments: [] as string[] },
  ]);
  
  // Data state
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [staff, setStaff] = useState<any[]>([]);
  const [createdElectives, setCreatedElectives] = useState<CreatedElective[]>([]);
  const [expandedRows, setExpandedRows] = useState<Record<string, boolean>>({});
  
  // UI state
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<"create" | "created">("create");
  const [filterYear, setFilterYear] = useState<number>(2);
  const [editingElective, setEditingElective] = useState<any>(null);
  const [editForm, setEditForm] = useState({
    sub_name: "",
    course_code: "",
    seat_count: "",
    staff_id: "",
  });
  
  // Extended edit form options: allow updating department and blocked departments
  const [editFormOpts, setEditFormOpts] = useState({
    update_department: false,
    department_value: '',
    update_blocked_departments: false,
    blocked_departments: [] as string[],
  });
  // Action confirmation modal state
  const [actionModal, setActionModal] = useState<{
    show: boolean;
    type?: "delete" | "deleteParent" | "toggleAll";
    title?: string;
    message?: string;
    payload?: any;
  }>({ show: false });

  // Elective floating window state
  const [floatingStartTime, setFloatingStartTime] = useState<string>("");
  const [floatingStopTime, setFloatingStopTime] = useState<string>("");
  const [showStartTimePicker, setShowStartTimePicker] = useState(false);
  const [showStopTimePicker, setShowStopTimePicker] = useState(false);

  // Check if user is IQAC HOD
  const isIQACHOD = profile?.role === 'hod' && profile?.department === 'IQAC';

  useEffect(() => {
    fetchCreatedElectives();
    fetchAllStaff(); // Fetch staff for editing
    fetchFloatingTimes();
  }, [filterYear]);

  // Periodically sync electives' `is_active` based on `start` and `stop` timestamps.
  useEffect(() => {
    let mounted = true;
    const tick = async () => {
      try {
        const now = new Date();
        const toActivate: string[] = [];
        const toDeactivate: string[] = [];

        (createdElectives || []).forEach((e) => {
          try {
            const start = e.start ? new Date(e.start) : null;
            const stop = e.stop ? new Date(e.stop) : null;
            const shouldBeActive = start && start <= now && (!stop || stop > now);
            if (shouldBeActive && !e.is_active) toActivate.push(e.id);
            if (stop && stop <= now && e.is_active) toDeactivate.push(e.id);
          } catch (err) {
            // ignore parse errors
          }
        });

        if (toActivate.length > 0) {
          const { error } = await supabase.from('electives').update({ is_active: true }).in('id', toActivate);
          if (error) console.warn('Failed to activate electives by time', error);
        }
        if (toDeactivate.length > 0) {
          const { error } = await supabase.from('electives').update({ is_active: false }).in('id', toDeactivate);
          if (error) console.warn('Failed to deactivate electives by time', error);
        }

        if ((toActivate.length > 0 || toDeactivate.length > 0) && mounted) {
          setCreatedElectives(prev => prev.map(e => {
            if (toActivate.includes(e.id)) return { ...e, is_active: true };
            if (toDeactivate.includes(e.id)) return { ...e, is_active: false };
            return e;
          }));
        }
      } catch (err) {
        console.warn('electives time sync error', err);
      }
    };

    // Run immediately, then every 30 seconds
    tick();
    const iv = window.setInterval(tick, 30000);
    return () => { mounted = false; clearInterval(iv); };
  }, [createdElectives]);

  useEffect(() => {
    if (selectedGroup) {
      // Auto-select departments based on group
      const depts = GROUP_MAPPING[selectedGroup as keyof typeof GROUP_MAPPING] || [];
      setSelectedDepartments(depts);
    }
  }, [selectedGroup]);

  useEffect(() => {
    if (selectedDepartments.length > 0 && year) {
      fetchSubjects();
      fetchStaff();
    } else {
      setSubjects([]);
      setStaff([]);
    }
  }, [selectedDepartments, year]);

  useEffect(() => {
    // default semester when year changes (set to second semester of year)
    if (year) setSemester(Math.min(8, Math.max(1, year * 2)));
  }, [year]);

  // When year is 1, we want to show first-year subjects/staff without requiring group/department
  useEffect(() => {
    if (year === 1) {
      // fetch subjects for year 1 (electives if any) and all staff
      fetchSubjects();
      fetchAllStaff();
    }
  }, [year]);

  const fetchCreatedElectives = async () => {
    if (!isIQACHOD) return;

    const { data, error } = await supabase
      .from("electives")
      .select(`
        *,
        parent_subject:subjects!parent_subject_id(name, subject_code),
        staff:profiles!staff_id(name)
      `)
      .in("group", ["CG", "EG", "MG", "ALL"])
      .eq("year", filterYear)
      .order("parent_subject_id", { ascending: true })
      .order("department", { ascending: true });

    if (!error && data) {
      setCreatedElectives(data);
    }

      // If opted, include department update
      if (editFormOpts.update_department && editFormOpts.department_value) {
        updateObj.department = editFormOpts.department_value;
      }
  };

  const fetchSubjects = async () => {
    // For year 1, don't require department/group filters — fetch all elective parents for year 1
    let deptFilter: string[] | null = null;
    if (year === 1) {
      deptFilter = null;
    } else {
      // If opted, update blocked departments table for these elective ids
      if (editFormOpts.update_blocked_departments) {
        try {
          // electiveIds may not be defined in this scope; guard with typeof.
          if (typeof electiveIds === 'undefined' || !Array.isArray(electiveIds) || electiveIds.length === 0) {
            // nothing to update
          } else {
            const safeElectiveIds = electiveIds.filter(Boolean);
            if (safeElectiveIds.length > 0) {
              // Remove existing blocked entries for these electives
              const { error: delErr } = await supabase
                .from('elective_blocked_departments')
                .delete()
                .in('elective_id', safeElectiveIds);
              if (delErr) throw delErr;

              const b = editFormOpts.blocked_departments || [];
              if (b.length > 0) {
                const rows: any[] = [];
                safeElectiveIds.forEach((id: string) => {
                  b.forEach((d: string) => rows.push({ elective_id: id, department: d }));
                });
                const { error: insErr } = await supabase
                  .from('elective_blocked_departments')
                  .insert(rows);
                if (insErr) console.warn('Failed to insert blocked departments after edit:', insErr);
              }
            }
          }
        } catch (blkErr) {
          console.warn('Failed to update blocked departments during edit:', blkErr);
        }
      }
      if (selectedDepartments.length === 0 || !year) {
        setSubjects([]);
        return;
      }
      // If ALL group is selected, fetch from all departments to find OE subjects
      deptFilter = selectedGroup === 'ALL'
        ? ['AI&DS', 'CSE', 'IT', 'ECE', 'EEE', 'MECH', 'CIVIL', 'ALL']
        : [...selectedDepartments, 'ALL'];
    }

    const builder: any = supabase
      .from("subjects")
      .select("id, name, subject_code, subject_type, department, year")
      .eq("subject_type", "elective")
      .eq("year", year)
      .order("name");

    if (deptFilter) builder.in("department", deptFilter);

    const { data, error } = await builder;

    if (!error && data) {
      const electiveParents = (data as any[]).filter((subject) => {
        const name = subject.name.toUpperCase();
        const code = subject.subject_code?.toUpperCase() || "";
        
        // For ALL group, show only Open Elective (OE) parent subjects (do not include PE/EE)
        if (selectedGroup === 'ALL') {
          const lname = name.toLowerCase();
          const lcode = code.toLowerCase();
          const isOpenName = lname.includes('open elective') || /\boe\b/.test(lname) || lcode.startsWith('oe') || lcode.includes('oe');
          const isProfessionalOrEmerging = lname.includes('professional') || lname.includes('emerging') || lcode.startsWith('pe') || lcode.startsWith('ee');
          return isOpenName && !isProfessionalOrEmerging;
        }
        
        // For other groups, show all elective types
        return (
          name.includes("PE") ||
          name.includes("EE") ||
          name.includes("OE") ||
          name.includes("EMERGING") ||
          name.includes("PROFESSIONAL ELECTIVE") ||
          name.includes("OPEN ELECTIVE") ||
          name.includes("ENGINEERING ELECTIVE") ||
          name.includes("ELECTIVE") ||
          code.includes("PE") ||
          code.includes("EE") ||
          code.includes("OE") ||
          code.includes("EMERGING")
        );
      });
      setSubjects(electiveParents);
    }
  };

  const fetchStaff = async () => {
    // For year 1, allow selection from all staff
    if (year === 1) {
      await fetchAllStaff();
      return;
    }

    if (selectedDepartments.length === 0) {
      setStaff([]);
      return;
    }

    // Fetch candidate staff (by role) then filter client-side so that broader dept values
    // like 'AI' match specific departments like 'AI&DS' or 'AI&ML'. This ensures a HOD
    // whose profile.department is 'AI' appears when selectedDepartments include 'AI&DS'.
    try {
      const { data, error } = await supabase
        .from("profiles")
        .select("id, name, department, role")
        .in("role", ["staff", "ahod", "hod"])
        .order("name");

      if (error) {
        console.debug('fetchStaff profiles error', error);
        setStaff([]);
        return;
      }

      const rows = (data || []) as any[];
      const desired = rows.filter((p: any) => {
        const pdept = (p.department || '').toString().trim();
        if (!pdept) return false;
        // exact match
        if (selectedDepartments.includes(pdept)) return true;
        const pdeptLower = pdept.toLowerCase();
        // match if any selected department contains the profile dept (e.g., 'AI&DS' contains 'AI')
        if (selectedDepartments.some(sd => sd.toLowerCase().includes(pdeptLower))) return true;
        // match if profile dept contains the selected department (rare)
        if (selectedDepartments.some(sd => pdeptLower.includes(sd.toLowerCase()))) return true;
        return false;
      });

      setStaff(desired);
    } catch (err) {
      console.debug('Failed to fetch staff profiles', err);
      setStaff([]);
    }
  };

  const fetchFloatingTimes = async () => {
    try {
      // Derive floating times from electives rows for the selected year.
      // Use earliest start and latest stop across electives as site-wide defaults.
      const { data: starts, error: sErr } = await supabase
        .from('electives')
        .select('start')
        .not('start', 'is', null)
        .eq('year', filterYear)
        .order('start', { ascending: true })
        .limit(1);

      const { data: stops, error: stErr } = await supabase
        .from('electives')
        .select('stop')
        .not('stop', 'is', null)
        .eq('year', filterYear)
        .order('stop', { ascending: false })
        .limit(1);

      if (!sErr && starts && starts.length > 0 && (starts[0] as any).start) {
        setFloatingStartTime(isoToInputLocal((starts[0] as any).start));
      }
      if (!stErr && stops && stops.length > 0 && (stops[0] as any).stop) {
        setFloatingStopTime(isoToInputLocal((stops[0] as any).stop));
      }
    } catch (err) {
      console.error('Error fetching floating times from electives:', err);
    }
  };

  const saveFloatingTime = async (type: 'start' | 'stop', datetime: string, parentId?: string) => {
    try {
      // If a parentId was provided, store start/stop on the electives rows for that parent
      if (parentId) {
        const updateObj: any = {};
        // convert input-local to ISO for DB storage
        if (type === 'start') updateObj.start = inputLocalToIso(datetime);
        else updateObj.stop = inputLocalToIso(datetime);

        const { error } = await supabase
          .from('electives')
          .update(updateObj)
          .eq('parent_subject_id', parentId)
          .eq('year', filterYear);

        if (error) throw error;

        setCreatedElectives(prev => prev.map(e => e.parent_subject_id === parentId ? { ...e, ...(updateObj.start ? { start: updateObj.start } : {}), ...(updateObj.stop ? { stop: updateObj.stop } : {}) } : e));

        // Update the floating picker state so the saved value is visible immediately (use input form)
        if (type === 'start') setFloatingStartTime(datetime || '');
        if (type === 'stop') setFloatingStopTime(datetime || '');

        alert(`${type === 'start' ? 'Start' : 'Stop'} time saved to electives successfully!`);
        if (type === 'start') setShowStartTimePicker(false); else setShowStopTimePicker(false);
        return;
      }
      // No parentId: store as site-wide defaults by updating all electives for the year
      const updateObj: any = {};
      if (type === 'start') updateObj.start = inputLocalToIso(datetime);
      else updateObj.stop = inputLocalToIso(datetime);

      const { error } = await supabase
        .from('electives')
        .update(updateObj)
        .eq('year', filterYear);

      if (error) throw error;

      // Update UI state
      if (type === 'start') setFloatingStartTime(datetime || '');
      if (type === 'stop') setFloatingStopTime(datetime || '');

      alert(`${type === 'start' ? 'Start' : 'Stop'} time saved to electives successfully!`);
      if (type === 'start') setShowStartTimePicker(false); else setShowStopTimePicker(false);
    } catch (err: any) {
      console.error('Error saving floating time:', err);
      alert(`Failed to save ${type} time: ${err?.message || err}`);
    }
  };

  const fetchAllStaff = async () => {
    // Fetch all staff for the edit modal
    const { data, error } = await supabase
      .from("profiles")
      .select("id, name, department, role")
      .in("role", ["staff", "ahod", "hod"])
      .order("name");

    if (!error && data) {
      setStaff(data);
    }
  };

  const addElectiveField = () => {
    setElectiveSubjects([
      ...electiveSubjects,
      { sub_name: "", course_code: "", staff_id: "", staff_name: "", seat_count: "", course_department: 'ALL', blocked_departments: [] as string[] },
    ]);
  };

  const removeElectiveField = (index: number) => {
    setElectiveSubjects(electiveSubjects.filter((_, i) => i !== index));
  };

  const updateElectiveField = (index: number, field: string, value: string) => {
    const updated = [...electiveSubjects];
    updated[index] = { ...updated[index], [field]: value };
    setElectiveSubjects(updated);
  };

  const toggleBlockedDepartmentForElective = (index: number, dept: string) => {
    const updated = [...electiveSubjects];
    const current = new Set(updated[index].blocked_departments || []);
    if (current.has(dept)) current.delete(dept);
    else current.add(dept);
    updated[index] = { ...updated[index], blocked_departments: Array.from(current) };
    setElectiveSubjects(updated);
  };

  const handleImportFile = async (file: File) => {
    try {
      const data = await file.arrayBuffer();
      const workbook = XLSX.read(data, { type: 'array' });
      const sheet = workbook.Sheets[workbook.SheetNames[0]];
      const rows: any[] = XLSX.utils.sheet_to_json(sheet, { defval: '' });

      if (!rows || rows.length === 0) {
        alert('No rows found in the uploaded file');
        return;
      }

      // Normalize header keys to lowercase underscores
      const parsed = rows.map((r) => {
        const obj: any = {};
        for (const key of Object.keys(r)) {
          const k = key.toString().trim().toLowerCase().replace(/\s+/g, '_');
          obj[k] = r[key];
        }
        return obj;
      });

      // Resolve staff_name -> staff_id using site profiles (case-insensitive)
      const staffNames = Array.from(new Set(parsed.map(p => (p.staff_name || '').toString().trim()).filter(Boolean)));
      let staffMapByName: Record<string, string> = {};
      if (staffNames.length > 0) {
        // Fetch all staff names from profiles (roles: staff, ahod, hod)
        const { data: profiles } = await supabase
          .from('profiles')
          .select('id, name')
          .in('role', ['staff', 'ahod', 'hod']);

        const profilesList = profiles || [];
        const nameMap: Record<string, string[]> = {};
        profilesList.forEach((pf: any) => {
          const n = (pf.name || '').toString().trim();
          const key = n.toLowerCase();
          if (!nameMap[key]) nameMap[key] = [];
          nameMap[key].push(pf.id);
        });

        // For each requested staff name, try exact (case-insensitive), then partial includes
        staffNames.forEach((inputName) => {
          const key = inputName.toLowerCase();
          if (nameMap[key] && nameMap[key].length > 0) {
            staffMapByName[inputName] = nameMap[key][0];
          } else {
            // try partial match
            const found = profilesList.find((pf: any) => (pf.name || '').toString().toLowerCase().includes(key) || key.includes((pf.name || '').toString().toLowerCase()));
            if (found) staffMapByName[inputName] = found.id;
          }
        });
      }

      const unmatched: string[] = [];
      const toAdd = parsed.map((p) => {
        const nameInput = (p.staff_name || p.staff || '').toString().trim();
        const staffId = nameInput ? (staffMapByName[nameInput] || '') : '';
        if (nameInput && !staffId) unmatched.push(nameInput);

        return {
          sub_name: (p.sub_name || p.name || '').toString(),
          course_code: (p.course_code || p.code || '').toString(),
          staff_id: staffId,
          seat_count: p.seat_count ? String(p.seat_count) : '',
          course_department: (p.department || p.course_department || 'ALL').toString(),
          blocked_departments: (() => {
            // Collect possible blocked-dept columns (legacy single column or multiple numbered columns)
            const candidates: string[] = [];
            if (p.blocked_departments) candidates.push(p.blocked_departments.toString());
            // gather any keys that look like blocked + department (e.g., blocked_department_1)
            Object.keys(p).forEach((k) => {
              if (/blocked.*department/.test(k)) {
                const v = p[k];
                if (v) candidates.push(v.toString());
              }
            });

            const split = candidates.flatMap((c) => c.split(/[;,|]/).map((s: string) => s.trim()).filter(Boolean));
            const inferred = Array.from(new Set(split));

            // If the imported row specifies a course_department, include it as a blocked dept (unless ALL)
            try {
              const courseDeptRaw = (p.department || p.course_department || '').toString().trim();
              const courseDept = courseDeptRaw || '';
              if (courseDept && courseDept.toUpperCase() !== 'ALL' && !inferred.includes(courseDept)) {
                inferred.push(courseDept);
              }
            } catch (err) {
              /* ignore */
            }

            // Attempt to infer the department that provides this subject from existing `subjects` list.
            // Prefer exact subject code match, then name contains match.
            try {
              const code = (p.course_code || p.code || '').toString().trim().toLowerCase();
              const name = (p.sub_name || p.name || '').toString().trim().toLowerCase();
              let providedDept: string | null = null;
              if (code && subjects && subjects.length > 0) {
                const byCode = subjects.find(s => (s.subject_code || '').toString().toLowerCase() === code);
                if (byCode) providedDept = byCode.department;
              }
              if (!providedDept && name && subjects && subjects.length > 0) {
                // try contains match both ways
                const byName = subjects.find(s => {
                  const sname = (s.name || '').toString().toLowerCase();
                  return (sname && name && (sname.includes(name) || name.includes(sname)));
                });
                if (byName) providedDept = byName.department;
              }

              if (providedDept && providedDept !== 'ALL' && !inferred.includes(providedDept)) {
                inferred.push(providedDept);
              }
            } catch (err) {
              console.debug('Failed to infer providing department during import', err);
            }

            return inferred;
          })(),
        };
      });

      setElectiveSubjects((prev) => {
        const merged = [...prev, ...toAdd];
        if (toAdd.length > 0) {
          // remove any empty placeholder rows (all main fields empty)
          const filtered = merged.filter(r => {
            return Boolean((r.sub_name || '').toString().trim()) || Boolean((r.course_code || '').toString().trim()) || Boolean((r.staff_id || '').toString().trim()) || Boolean((r.seat_count || '').toString().trim());
          });
          return filtered.length > 0 ? filtered : toAdd;
        }
        return merged;
      });
      let msg = `Imported ${toAdd.length} rows into the form.`;
      if (unmatched.length > 0) {
        const uniqueUnmatched = Array.from(new Set(unmatched));
        msg += `\nWarning: ${uniqueUnmatched.length} staff names were not matched: ${uniqueUnmatched.slice(0,10).join(', ')}${uniqueUnmatched.length>10?', ...':''}. Please assign staff manually in the form.`;
      }
      alert(msg);
    } catch (err: any) {
      console.error('Import failed', err);
      alert('Failed to import file: ' + (err?.message || err));
    }
  };

  const handleFileInput = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files && e.target.files[0];
    if (!f) return;
    try {
      await handleImportFile(f);
    } catch (err) {
      console.debug('Import handler threw', err);
    } finally {
      // always reset the input so the same file can be selected again
      try { e.currentTarget.value = ''; } catch (err) { /* ignore */ }
    }
  };

  const toggleElectiveStatus = async (electiveId: string, currentStatus: boolean) => {
    try {
      const { error } = await supabase
        .from("electives")
        .update({ is_active: !currentStatus })
        .eq("id", electiveId);

      if (error) throw error;

      // Update local state
      setCreatedElectives(createdElectives.map(e => 
        e.id === electiveId ? { ...e, is_active: !currentStatus } : e
      ));

      alert(`Elective ${!currentStatus ? 'activated' : 'deactivated'} successfully!`);
    } catch (error: any) {
      console.error("Error updating elective status:", error);
      alert("Failed to update elective status: " + error.message);
    }
  };

  const handleSetStart = async (electiveId: string) => {
    try {
      const now = new Date().toISOString();
      const { error } = await supabase
        .from('electives')
        .update({ start: now })
        .eq('id', electiveId);
      if (error) throw error;
      setCreatedElectives(createdElectives.map(e => e.id === electiveId ? { ...e, start: now } : e));
      alert('Start time saved');
    } catch (err: any) {
      console.error('Failed to set start time', err);
      alert('Failed to set start time: ' + (err?.message || err));
    }
  };

  const handleSetStop = async (electiveId: string) => {
    try {
      const now = new Date().toISOString();
      const { error } = await supabase
        .from('electives')
        .update({ stop: now })
        .eq('id', electiveId);
      if (error) throw error;
      setCreatedElectives(createdElectives.map(e => e.id === electiveId ? { ...e, stop: now } : e));
      alert('Stop time saved');
    } catch (err: any) {
      console.error('Failed to set stop time', err);
      alert('Failed to set stop time: ' + (err?.message || err));
    }
  };

  const toggleAllElectivesInParent = async (parentId: string, newStatus: boolean, skipConfirm = false) => {
    if (!skipConfirm) {
      const verb = newStatus ? 'activate' : 'deactivate';
      setActionModal({
        show: true,
        type: 'toggleAll',
        title: `${newStatus ? 'Activate' : 'Deactivate'} All Electives`,
        message: `Are you sure you want to ${verb} all electives under this parent subject?`,
        payload: { parentId, newStatus }
      });
      return;
    }

    try {
      // Get all elective IDs for this parent subject and year
      const electiveIds = createdElectives
        .filter(e => e.parent_subject_id === parentId)
        .map(e => e.id);

      if (electiveIds.length === 0) return;

      const safeIds = electiveIds.filter(Boolean);
      if (safeIds.length === 0) return;

      const { error } = await supabase
        .from("electives")
        .update({ is_active: newStatus })
        .in("id", safeIds);

      if (error) throw error;

      // Update local state
      setCreatedElectives(createdElectives.map(e => 
        electiveIds.includes(e.id) ? { ...e, is_active: newStatus } : e
      ));

      alert(`All electives ${newStatus ? 'activated' : 'deactivated'} successfully!`);
    } catch (error: any) {
      console.error("Error updating elective status:", error);
      alert("Failed to update elective status: " + error.message);
    }
  };

  const handleEditElective = async (elective: any) => {
    setEditingElective(elective);
    setEditForm({
      sub_name: elective.sub_name,
      course_code: elective.course_code,
      seat_count: elective.seat_count?.toString() || "",
      staff_id: elective.staff_id || "",
    });

    // Prefill department_value with first department if available
    const deptValue = (elective.departments && elective.departments.length > 0) ? elective.departments[0] : '';
    // Fetch existing blocked departments across all elective IDs and union them
    try {
      const electiveIdsForQuery = elective.electiveIds && Array.isArray(elective.electiveIds) ? (elective.electiveIds.filter(Boolean)) : [];
      const { data: blkRows, error: blkErr } = await supabase
        .from('elective_blocked_departments')
        .select('department')
        .in('elective_id', electiveIdsForQuery);

      if (blkErr) throw blkErr;
      const uniqueBlocked = Array.from(new Set((blkRows || []).map((r: any) => r.department)));

      setEditFormOpts({
        update_department: false,
        department_value: deptValue,
        update_blocked_departments: false,
        blocked_departments: uniqueBlocked,
      });
    } catch (err) {
      console.warn('Failed to fetch blocked departments for edit modal', err);
      setEditFormOpts({ update_department: false, department_value: deptValue, update_blocked_departments: false, blocked_departments: [] });
    }
  };

  const handleUpdateElective = async () => {
    if (!editingElective) return;

    try {
      // Update all electives with the same course_code
      const electiveIds = Array.isArray(editingElective?.electiveIds) ? editingElective.electiveIds.filter(Boolean) : [];

      const updateObj: any = {
        sub_name: editForm.sub_name,
        course_code: editForm.course_code.toUpperCase(),
        seat_count: editForm.seat_count ? parseInt(editForm.seat_count) : null,
      };

      // Only include staff_id in the update if a value was explicitly provided in the form.
      // This preserves the existing assigned staff when the field is left blank.
      if (editForm.staff_id && editForm.staff_id.length > 0) {
        updateObj.staff_id = editForm.staff_id;
      }

      const safeIds = electiveIds.filter(Boolean);
      if (safeIds.length === 0) throw new Error('No elective ids to update');
      const { error } = await supabase
        .from("electives")
        .update(updateObj)
        .in("id", safeIds);

      if (error) throw error;

      alert("Elective updated successfully!");
      setEditingElective(null);
      await fetchCreatedElectives();
    } catch (error: any) {
      console.error("Error updating elective:", error);
      alert("Failed to update elective: " + error.message);
    }
  };

  const confirmAction = async () => {
    if (!actionModal.show) return;
    const { type, payload } = actionModal;
    // hide modal first
    setActionModal({ show: false });

    try {
      if (type === 'delete') {
        await handleDeleteElective(payload, true);
      } else if (type === 'deleteParent') {
        await handleDeleteParentElective(payload.parentId, payload.parentName, payload.electives, true);
      } else if (type === 'toggleAll') {
        await toggleAllElectivesInParent(payload.parentId, payload.newStatus, true);
      }
    } catch (err) {
      console.error('Action confirm error', err);
    }
  };

  const handleDeleteElective = async (elective: any, skipConfirm = false) => {
    if (!skipConfirm) {
      setActionModal({
        show: true,
        type: 'delete',
        title: 'Delete Elective',
        message: `Are you sure you want to delete "${elective.sub_name}"? This will remove it from all departments (${elective.departments.join(", ")})`,
        payload: elective,
      });
      return;
    }

    try {
        const electiveIds = Array.isArray(elective.electiveIds) ? elective.electiveIds.filter(Boolean) : [];
        if (electiveIds.length === 0) return;

      const { error } = await supabase
        .from("electives")
        .delete()
        .in("id", electiveIds);

      if (error) throw error;

      alert("Elective deleted successfully!");
      await fetchCreatedElectives();
    } catch (error: any) {
      console.error("Error deleting elective:", error);
      alert("Failed to delete elective: " + error.message);
    }
  };

  const handleDeleteParentElective = async (parentId: string, parentName: string, electives: any[], skipConfirm = false) => {
    const electiveCount = electives.length;
    const electiveNames = electives.map((e: any) => e.sub_name).join(", ");

    if (!skipConfirm) {
      setActionModal({
        show: true,
        type: 'deleteParent',
        title: 'Delete Parent Subject',
        message: `This will permanently delete the parent subject "${parentName}" and its ${electiveCount} sub-elective(s): ${electiveNames}. Are you absolutely sure?`,
        payload: { parentId, parentName, electives },
      });
      return;
    }

    try {
      // Collect all elective IDs from all sub-electives
      const allElectiveIds = electives.flatMap((e: any) => e.electiveIds).filter(Boolean);

      // Delete all sub-electives
      if (allElectiveIds.length > 0) {
        const { error: electivesError } = await supabase
          .from("electives")
          .delete()
          .in("id", allElectiveIds);
        if (electivesError) throw electivesError;
      }

      if (electivesError) throw electivesError;

      // Delete the parent subject from subjects table
      const { error: parentError } = await supabase
        .from("subjects")
        .delete()
        .eq("id", parentId);

      if (parentError) throw parentError;

      alert(`Successfully deleted parent subject "${parentName}" and all ${electiveCount} sub-electives!`);
      await fetchCreatedElectives();
    } catch (error: any) {
      console.error("Error deleting parent elective:", error);
      alert("Failed to delete parent elective: " + error.message);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      // Validate all fields
      if (!(year === 1)) {
        if (!selectedGroup) {
          alert("Please select a group");
          setLoading(false);
          return;
        }
      } else {
        // For year 1, default to group ALL and no department selection
        setSelectedGroup('ALL');
        setSelectedDepartments([]);
      }

      let parentSubjectId = parentSubject;

      // Create new parent subject if needed
      if (useNewParent) {
        if (!newParentName) {
          alert("Please enter parent subject name");
          setLoading(false);
          return;
        }

        // Generate subject code from name and year (e.g., "Professional Elective - I" + Year 2 -> "PEI2")
        const generatedCode = newParentName
          .split(' ')
          .filter(word => word.length > 0)
          .map(word => word[0])
          .join('')
          .toUpperCase()
          .slice(0, 8) + year; // Add year to make it unique

        // Check if subject already exists
        const { data: existingSubject } = await supabase
          .from("subjects")
          .select("id")
          .eq("subject_code", generatedCode)
          .eq("year", year)
          .eq("department", "ALL")
          .maybeSingle();

        if (existingSubject) {
          alert(`A parent elective with code "${generatedCode}" already exists for Year ${year}. Please use a different name or select the existing one.`);
          setLoading(false);
          return;
        }

        // Create parent subject for "ALL" departments at selected year
        const { data: newParent, error: parentError } = await supabase
          .from("subjects")
          .insert({
            name: newParentName,
            subject_code: generatedCode,
            subject_type: "elective",
            department: "ALL",
            year: year,
            semester: semester,
            credits: parseInt(newParentCredits) || 3,
            mnemonic: newParentMnemonic || null,
            section: "ALL",
            staff_id: null,
          })
          .select()
          .single();

        if (parentError) throw parentError;
        parentSubjectId = newParent.id;
      } else if (!parentSubject) {
        alert("Please select a parent subject");
        setLoading(false);
        return;
      }

      // If user typed staff name manually (staff_name present but staff_id empty),
      // try to resolve it against the loaded `staff` list to avoid false "required" errors.
      const resolvedElectives = electiveSubjects.map((e) => {
        const staffId = (e as any).staff_id || '';
        const staffName = ((e as any).staff_name || '').toString().trim();
        if ((!staffId || staffId === '') && staffName) {
          const q = staffName.toLowerCase();
          const found = staff.find((s: any) => {
            const n = (s.name || '').toString().toLowerCase();
            return n === q || n.includes(q) || q.includes(n);
          });
          if (found) return { ...e, staff_id: found.id };
        }
        return e;
      });

      // Use local resolvedElectives for validation and submission (also update UI state)
      setElectiveSubjects(resolvedElectives);

      const invalidElectives = resolvedElectives.filter(
        (e) => !e.sub_name || !e.course_code || !e.staff_id || !e.seat_count
      );

      if (invalidElectives.length > 0) {
        alert("Please fill all elective fields");
        setLoading(false);
        return;
      }

      // Submit logic: handle grouped ALL electives with blocked departments
      // We'll insert each elective individually so we can attach blocked departments
      const createdCount = { created: 0, skipped: 0 };

      for (const elective of electiveSubjects) {
        const base = {
          sub_name: elective.sub_name,
          course_code: elective.course_code,
          parent_subject_id: parentSubjectId,
          // convert empty string to null so Postgres uuid fields are not given ''
          staff_id: elective.staff_id && elective.staff_id.length > 0 ? elective.staff_id : null,
          year: year,
          sem: semester,
          credits: 3,
          is_active: false,
          seat_count: parseInt(elective.seat_count) || null,
        } as any;

        if (year === 1) {
          // Year 1: single ALL department elective
          const { data: existingY1 } = await supabase
            .from('electives')
            .select('id')
            .eq('parent_subject_id', parentSubjectId)
            .eq('course_code', elective.course_code)
            .eq('group', 'ALL')
            .eq('year', 1)
            .maybeSingle();

          let electiveId: string | null = null;
          if (existingY1) {
            createdCount.skipped += 1;
            electiveId = existingY1.id;
          } else {
            const { data: newRow, error: insErr } = await supabase
              .from('electives')
              .insert({ ...base, department: 'ALL', group: 'ALL' })
              .select('id')
              .maybeSingle();
            if (insErr) throw insErr;
            electiveId = newRow?.id || null;
            createdCount.created += 1;
          }
          // No blocked-dept support for year 1 (applies to all students)
          continue;
        }

        if (selectedGroup === 'ALL') {
          // Grouped single elective for ALL departments (department = 'ALL')
          const { data: existing } = await supabase
            .from('electives')
            .select('id')
            .eq('parent_subject_id', parentSubjectId)
            .eq('course_code', elective.course_code)
            .eq('group', 'ALL')
            .eq('year', year)
            .maybeSingle();

          let electiveId: string | null = null;
          if (existing) {
            // Use existing elective id
            electiveId = existing.id;
            createdCount.skipped += 1;
          } else {
            const { data: newRow, error: insErr } = await supabase
              .from('electives')
              .insert({ ...base, department: elective.course_department || 'ALL', group: 'ALL' })
              .select('id')
              .maybeSingle();
            if (insErr) throw insErr;
            electiveId = newRow?.id || null;
            createdCount.created += 1;
          }

          // Insert blocked departments into elective_blocked_departments
          const blocked = elective.blocked_departments || [];
          if (electiveId && blocked.length > 0) {
            const blockedRows = blocked.map((d: string) => ({ elective_id: electiveId, department: d }));
            // Upsert to avoid duplicate constraint errors
            const { error: blkErr } = await supabase
              .from('elective_blocked_departments')
              .upsert(blockedRows, { onConflict: ['elective_id', 'department'] });
            if (blkErr) console.warn('Failed to upsert blocked departments:', blkErr);
          }
        } else {
          // Non-ALL groups: create a group-level elective (department NULL) or keep previous behavior
          const { data: existing } = await supabase
            .from('electives')
            .select('id')
            .eq('parent_subject_id', parentSubjectId)
            .eq('course_code', elective.course_code)
            .eq('group', selectedGroup)
            .eq('year', year)
            .maybeSingle();

          if (existing) {
            createdCount.skipped += 1;
          } else {
            const { error: insErr } = await supabase
              .from('electives')
              .insert({ ...base, department: null, group: selectedGroup });
            if (insErr) throw insErr;
            createdCount.created += 1;
          }
        }
      }

      alert(`Created ${createdCount.created} elective(s); skipped ${createdCount.skipped} existing.`);

      // Reset form
      setSelectedGroup("");
      setSelectedDepartments([]);
      setParentSubject("");
      setUseNewParent(false);
      setNewParentName("");
      setNewParentCredits("3");
      setNewParentMnemonic("");
      setElectiveSubjects([{ sub_name: "", course_code: "", staff_id: "", seat_count: "", course_department: 'ALL', blocked_departments: [] }]);
      setYear(2);
      
      // Refresh created electives and switch to created tab
      await fetchCreatedElectives();
      setActiveTab("created");
    } catch (error: any) {
      console.error("Error creating electives:", error);
      alert("Failed to create electives: " + error.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-2xl font-bold text-slate-800">
          {isIQACHOD ? "IQAC Electives Management" : "Create New Electives"}
        </h2>
        
        {isIQACHOD && (
          <div className="flex gap-2">
            <button
              onClick={() => setActiveTab("created")}
              className={`px-4 py-2 rounded-lg font-medium transition-colors ${
                activeTab === "created"
                  ? "bg-blue-600 text-white"
                  : "bg-slate-100 text-slate-600 hover:bg-slate-200"
              }`}
            >
              Created Electives
            </button>
            <button
              onClick={() => setActiveTab("create")}
              className={`px-4 py-2 rounded-lg font-medium transition-colors ${
                activeTab === "create"
                  ? "bg-blue-600 text-white"
                  : "bg-slate-100 text-slate-600 hover:bg-slate-200"
              }`}
            >
              Create New
            </button>
          </div>
        )}
      </div>

      {activeTab === "create" ? (
        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Step 1: Select Group (skip for IQAC HOD when Year 1) */}
          {!(isIQACHOD && year === 1) && (
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">
                1. Select Group
              </label>
              <select
                value={selectedGroup}
                onChange={(e) => setSelectedGroup(e.target.value)}
                className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                required
              >
                <option value="">Select Group</option>
                <option value="ALL">ALL - All Departments (Open Electives)</option>
                <option value="CG">CG - Common Group (AI&DS, AI&ML, CSE, IT)</option>
                <option value="EG">EG - Engineering Group (ECE, EEE)</option>
                <option value="MG">MG - Management Group (MECH, CIVIL)</option>
              </select>
              {selectedGroup && (
                <p className="mt-2 text-sm text-blue-600">
                  ✓ Selected departments: {selectedDepartments.join(", ")}
                </p>
              )}
            </div>
          )}

          {/* Step 2: Select Year */}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">
              2. Select Year
            </label>
            <select
              value={year}
              onChange={(e) => setYear(Number(e.target.value))}
              className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              required
            >
              <option value={1}>1st Year</option>
              <option value={2}>2nd Year</option>
              <option value={3}>3rd Year</option>
              <option value={4}>4th Year</option>
            </select>
            {isIQACHOD && year === 1 && (
              <p className="mt-2 text-sm text-blue-600">✓ This will apply to all 1st year sections (all students)</p>
            )}
            {/* Semester selection */}
              <div className="mt-3">
                <label className="block text-sm font-medium text-slate-700 mb-2">Semester</label>
                <select
                  value={semester}
                  onChange={(e) => setSemester(Number(e.target.value))}
                  className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  required
                >
                  {(() => {
                    const semMap: Record<number, number[]> = { 1: [1, 2], 2: [3, 4], 3: [5, 6], 4: [7, 8] };
                    const opts = semMap[year] || [1,2,3,4,5,6,7,8];
                    return opts.map((s) => (<option key={s} value={s}>Sem {s}</option>));
                  })()}
                </select>
              </div>
          </div>

          {/* Step 3: Select Parent Subject */}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">
              3. Parent Elective (PE/EE/OE)
            </label>
            
            <div className="space-y-4">
              {/* Toggle between existing and new */}
              <div className="flex gap-4">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="radio"
                    checked={!useNewParent}
                    onChange={() => setUseNewParent(false)}
                    className="w-4 h-4"
                  />
                  <span className="text-sm text-slate-700">Select Existing</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="radio"
                    checked={useNewParent}
                    onChange={() => setUseNewParent(true)}
                    className="w-4 h-4"
                  />
                  <span className="text-sm text-slate-700">Create New</span>
                </label>
              </div>

              {!useNewParent ? (
                <>
                  <select
                    value={parentSubject}
                    onChange={(e) => setParentSubject(e.target.value)}
                    className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    required={!useNewParent}
                  >
                    <option value="">Select Parent Elective</option>
                    {((selectedGroup === 'ALL')
                      ? subjects.filter((subject) => {
                          const name = (subject.name || '').toString().toLowerCase();
                          const code = (subject.subject_code || '').toString().toLowerCase();
                          const isOpenName = name.includes('open elective') || /\boe\b/.test(name) || code.startsWith('oe') || code.includes('oe');
                          const isProfessionalOrEmerging = name.includes('professional') || name.includes('emerging') || code.startsWith('pe') || code.startsWith('ee');
                          return isOpenName && !isProfessionalOrEmerging;
                        })
                      : subjects
                    ).map((subject) => (
                      <option key={subject.id} value={subject.id}>
                        {subject.name} ({subject.subject_code}) - {subject.department}
                      </option>
                    ))}
                  </select>
                  {selectedGroup && year && subjects.length === 0 && (
                    <p className="text-sm text-amber-600">
                      No elective parent subjects found. You can create a new one instead.
                    </p>
                  )}
                  {((!selectedGroup && !(isIQACHOD && year === 1)) || !year) && (
                    <p className="text-sm text-slate-500">
                      Please select Group and Year first to view available parent electives.
                    </p>
                  )}
                </>
              ) : (
                <div className="space-y-3 p-4 bg-blue-50 rounded-lg border border-blue-200">
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">
                      Parent Subject Name *
                    </label>
                    {(() => {
                      const presets: { label: string; mnemonic: string }[] = [];
                      if (year === 2 && semester === 4) {
                        presets.push({ label: 'Emerging Elective I', mnemonic: 'EE-I' });
                      }
                      if (year === 3 && semester === 5) {
                        presets.push({ label: 'Emerging Elective II', mnemonic: 'EE-II' });
                        presets.push({ label: 'Professional Elective I', mnemonic: 'PE-I' });
                        presets.push({ label: 'Open Elective I', mnemonic: 'OE-I' });
                      }
                      if (year === 3 && semester === 6) {
                        presets.push({ label: 'Emerging Elective III', mnemonic: 'EE-III' });
                        presets.push({ label: 'Professional Elective II', mnemonic: 'PE-II' });
                        presets.push({ label: 'Open Elective II', mnemonic: 'OE-II' });
                      }
                      if (year === 4 && semester === 7) {
                        presets.push({ label: 'Professional Elective III', mnemonic: 'PE-III' });
                        presets.push({ label: 'Professional Elective IV', mnemonic: 'PE-IV' });
                        presets.push({ label: 'Management Elective', mnemonic: 'ME' });
                      }

                      if (presets.length === 0) {
                        return (
                          <input
                            type="text"
                            value={newParentName}
                            onChange={(e) => setNewParentName(e.target.value)}
                            placeholder="e.g., Professional Elective - I"
                            className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                            required={useNewParent}
                          />
                        );
                      }

                      const selectedPresetValue = presets.find(p => p.mnemonic === newParentMnemonic) ? newParentMnemonic : (newParentName && !newParentMnemonic ? '__custom__' : '');

                      return (
                        <>
                          <select
                            value={selectedPresetValue}
                            onChange={(e) => {
                              const v = e.target.value;
                              if (v === '__custom__') {
                                setNewParentMnemonic('');
                                setNewParentName('');
                              } else {
                                const found = presets.find(p => p.mnemonic === v);
                                if (found) {
                                  setNewParentName(found.label);
                                  setNewParentMnemonic(found.mnemonic);
                                } else {
                                  setNewParentMnemonic('');
                                }
                              }
                            }}
                            className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent mb-2"
                          >
                            <option value="">Select preset (optional)</option>
                            {presets.map((p) => (
                              <option key={p.mnemonic} value={p.mnemonic}>{p.label} — {p.mnemonic}</option>
                            ))}
                            <option value="__custom__">Custom...</option>
                          </select>

                          {selectedPresetValue === '__custom__' && (
                            <input
                              type="text"
                              value={newParentName}
                              onChange={(e) => setNewParentName(e.target.value)}
                              placeholder="e.g., Professional Elective - I"
                              className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                              required={useNewParent}
                            />
                          )}
                        </>
                      );
                    })()}
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1">
                        Credits *
                      </label>
                      <input
                        type="number"
                        min="1"
                        max="10"
                        value={newParentCredits}
                        onChange={(e) => setNewParentCredits(e.target.value)}
                        placeholder="e.g., 3"
                        className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                        required={useNewParent}
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1">
                        Mnemonic
                      </label>
                      <input
                        type="text"
                        value={newParentMnemonic}
                        onChange={(e) => setNewParentMnemonic(e.target.value.toUpperCase())}
                        placeholder="e.g., PE, EE, OE"
                        className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      />
                    </div>
                  </div>
                  <p className="text-sm text-blue-700">
                    ℹ️ This will create a new parent elective for ALL departments at Year {year}
                  </p>
                  <p className="text-xs text-slate-600">
                    Subject code will be auto-generated from the name
                  </p>
                </div>
              )}
            </div>
          </div>

          {/* Step 4: Create Multiple Sub-Elective Subjects */}
          <div>
            <div className="flex items-center justify-between mb-4">
              <label className="text-sm font-medium text-slate-700">
                4. Create Sub-Elective Subjects
              </label>
              <button
                type="button"
                onClick={addElectiveField}
                className="flex items-center gap-2 px-3 py-1.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors text-sm"
              >
                <Plus className="h-4 w-4" />
                Add Elective
              </button>
            </div>
              {selectedGroup === 'ALL' && (
                <div className="mb-3 flex items-center gap-3">
                  <label className="text-sm font-medium text-slate-700">Import Excel/CSV</label>
                  <label className="inline-flex items-center gap-2 px-3 py-1 bg-white border border-slate-300 rounded cursor-pointer text-sm hover:shadow">
                    <input type="file" accept=".xlsx,.xls,.csv" onChange={handleFileInput} className="hidden" />
                    <span className="text-slate-700">Choose file</span>
                  </label>
                  <a href={`/templates/electives_import_template_with_dropdown_exceljs.xlsx?v=${Date.now()}`} download="electives_import_template_with_dropdown_exceljs.xlsx" className="text-sm text-white bg-indigo-600 hover:bg-indigo-700 px-3 py-1 rounded ml-3">Download template</a>
                </div>
              )}

            <div className="space-y-4">
              {electiveSubjects.map((elective, index) => (
                <div
                  key={index}
                  className="p-4 bg-slate-50 rounded-lg border border-slate-200"
                >
                  <div className="flex items-start gap-4">
                      <div className="flex-1 grid grid-cols-1 md:grid-cols-5 gap-4">
                      <div>
                        <label className="block text-xs font-medium text-slate-600 mb-1">
                          Elective Name
                        </label>
                        <input
                          type="text"
                          value={elective.sub_name}
                          onChange={(e) =>
                            updateElectiveField(index, "sub_name", e.target.value)
                          }
                          placeholder="e.g., Data Mining"
                          className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm"
                          required
                        />
                      </div>

                      <div>
                        <label className="block text-xs font-medium text-slate-600 mb-1">
                          Elective Code
                        </label>
                        <input
                          type="text"
                          value={elective.course_code}
                          onChange={(e) =>
                            updateElectiveField(
                              index,
                              "course_code",
                              e.target.value
                            )
                          }
                          placeholder="e.g., CS301E1"
                          className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm"
                          required
                        />
                      </div>

                      <div>
                        <label className="block text-xs font-medium text-slate-600 mb-1">
                          Seat Count
                        </label>
                        <input
                          type="number"
                          min="1"
                          value={elective.seat_count}
                          onChange={(e) =>
                            updateElectiveField(index, "seat_count", e.target.value)
                          }
                          placeholder="e.g., 60"
                          className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm"
                          required
                        />
                      </div>

                      <div>
                        <label className="block text-xs font-medium text-slate-600 mb-1">
                          Assign Staff
                        </label>
                        <div className="relative">
                          <input
                            type="text"
                            value={(elective as any).staff_name || ((() => {
                              const sid = (elective as any).staff_id;
                              const found = staff.find(s => s.id === sid);
                              return found ? found.name : '';
                            })())}
                            onChange={(e) => updateElectiveField(index, 'staff_name', e.target.value)}
                            placeholder="Type staff name to filter"
                            className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm"
                          />
                          {/* suggestions */}
                          {((elective as any).staff_name || '').length > 0 && (
                            <div className="absolute z-10 left-0 right-0 bg-white border border-slate-200 rounded mt-1 max-h-48 overflow-auto">
                              {(() => {
                                const courseDept = (elective as any).course_department || 'ALL';
                                const q = ((elective as any).staff_name || '').toLowerCase();
                                const filtered = staff.filter((p: any) => {
                                  const name = (p.name||'').toString().toLowerCase();
                                  if (!name.includes(q)) return false;
                                  if (courseDept === 'ALL') return true;
                                  const pdept = (p.department || '').toString().trim();
                                  if (!pdept) return false;
                                  if (pdept === courseDept) return true;
                                  const pdeptLower = pdept.toLowerCase();
                                  const sd = courseDept.toString().trim().toLowerCase();
                                  if (sd.includes(pdeptLower) || pdeptLower.includes(sd)) return true;
                                  return false;
                                }).slice(0,50);
                                if (filtered.length === 0) return <div className="p-2 text-sm text-slate-500">No matching staff</div>;
                                return filtered.map((s) => (
                                  <div key={s.id} className="p-2 hover:bg-slate-50 cursor-pointer text-sm" onMouseDown={(ev) => { ev.preventDefault(); updateElectiveField(index, 'staff_id', s.id); updateElectiveField(index, 'staff_name', s.name); }}>
                                    {s.name} <span className="text-xs text-slate-400">({s.department})</span>
                                  </div>
                                ));
                              })()}
                            </div>
                          )}
                        </div>
                      </div>
                      {selectedGroup === 'ALL' && (
                        <div>
                          <label className="block text-xs font-medium text-slate-600 mb-1">
                            Course Department
                          </label>
                          <select
                            value={(elective as any).course_department || 'ALL'}
                            onChange={(e) => updateElectiveField(index, 'course_department', e.target.value)}
                            className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm"
                            required
                          >
                            <option value="ALL">ALL</option>
                            {GROUP_MAPPING.ALL.map((dept) => (
                              <option key={dept} value={dept}>{dept}</option>
                            ))}
                          </select>
                        </div>
                      )}
                      {selectedGroup === 'ALL' && (
                        <div className="md:col-span-5">
                          <label className="block text-xs font-medium text-slate-600 mb-1">
                            Block Departments (checked depts WILL BE BLOCKED from this ALL-dept elective)
                          </label>
                          <div className="flex flex-wrap gap-2">
                            {GROUP_MAPPING.ALL.map((dept) => (
                              <label key={dept} className="inline-flex items-center gap-2 text-sm bg-slate-50 px-2 py-1 rounded border border-slate-200">
                                <input
                                  type="checkbox"
                                  checked={(elective.blocked_departments || []).includes(dept)}
                                  onChange={() => toggleBlockedDepartmentForElective(index, dept)}
                                  className="w-4 h-4"
                                />
                                <span>{dept}</span>
                              </label>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>

                    <button
                      type="button"
                      onClick={() => removeElectiveField(index)}
                      className="mt-6 p-2 text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                      title="Remove elective"
                    >
                      <X className="h-5 w-5" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
            
            {selectedDepartments.length > 0 && (
              <p className="mt-3 text-sm text-blue-600">
                ℹ️ One elective will be created per subject for the {selectedGroup} group (accessible to: {selectedDepartments.join(", ")})
              </p>
            )}
          </div>

          {/* Submit Button */}
          <div className="flex justify-end">
            <button
              type="submit"
              disabled={loading}
              className="px-4 sm:px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 focus:ring-4 focus:ring-blue-200 font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed w-full sm:w-auto"
            >
              {loading ? "Creating..." : "Create Electives"}
            </button>
          </div>
        </form>
      ) : (
        /* Created Electives Tab */
        <div className="space-y-4">
          {/* Year Filter */}
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 bg-slate-50 p-3 sm:p-4 rounded-lg border border-slate-200">
            <div className="flex items-center gap-3 w-full sm:w-auto">
              <label className="text-sm font-medium text-slate-700">Filter by Year:</label>
              <div className="hidden sm:block text-sm text-slate-600">View created electives for the selected year</div>
            </div>
            <div className="w-full sm:w-auto">
              <select
                value={filterYear}
                onChange={(e) => setFilterYear(Number(e.target.value))}
                className="w-full sm:w-auto px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              >
                <option value={1}>1st Year</option>
                <option value={2}>2nd Year</option>
                <option value={3}>3rd Year</option>
                <option value={4}>4th Year</option>
              </select>
            </div>
            <div className="text-sm text-slate-600 w-full sm:w-auto sm:hidden">View created electives for the selected year</div>
          </div>

          {createdElectives.length === 0 ? (
            <div className="text-center py-12 bg-slate-50 rounded-lg border border-slate-200">
              <p className="text-slate-600">No electives created for Year {filterYear}</p>
            </div>
          ) : (
            <div className="space-y-4">
              {/* Group electives by parent subject and course code */}
              {Object.entries(
                createdElectives.reduce((acc, elective) => {
                  const parentKey = elective.parent_subject_id;
                  if (!acc[parentKey]) {
                    acc[parentKey] = {
                      parent: elective.parent_subject,
                      group: elective.group,
                      electivesByCode: {},
                    };
                  }
                  
                  // Group by course code to deduplicate
                  const codeKey = elective.course_code;
                  if (!acc[parentKey].electivesByCode[codeKey]) {
                    acc[parentKey].electivesByCode[codeKey] = {
                      sub_name: elective.sub_name,
                      course_code: elective.course_code,
                      seat_count: elective.seat_count,
                      staff: elective.staff,
                      staff_id: elective.staff_id || null,
                      group: elective.group,
                      departments: [],
                      electiveIds: [],
                      allActive: true,
                    };
                  }
                  
                  acc[parentKey].electivesByCode[codeKey].departments.push(elective.department);
                  acc[parentKey].electivesByCode[codeKey].electiveIds.push(elective.id);
                  if (!elective.is_active) {
                    acc[parentKey].electivesByCode[codeKey].allActive = false;
                  }
                  
                  return acc;
                }, {} as Record<string, { 
                  parent: any; 
                  group: string;
                  electivesByCode: Record<string, any>;
                }>)
              ).map(([parentId, parentGroup]) => {
                const electives = Object.values(parentGroup.electivesByCode);
                const allInactive = electives.every((e: any) => !e.allActive);
                
                return (
                  <div
                    key={parentId}
                    className="bg-white rounded-lg border border-slate-200 overflow-hidden"
                  >
                    {/* Parent Subject Header */}
                    <div className={`px-4 sm:px-6 py-4 border-b border-slate-200 ${
                      allInactive ? 'bg-slate-50' : 'bg-gradient-to-r from-blue-50 to-indigo-50'
                    }`}>
                      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                        <div className="flex-1">
                          <h3 className="text-lg font-bold text-slate-800">
                            {parentGroup.parent?.name || "Unknown Parent Subject"}
                          </h3>
                          <p className="text-sm text-slate-600 mt-1">
                            Code: {parentGroup.parent?.subject_code} • Year {filterYear} • {electives.length} elective{electives.length !== 1 ? 's' : ''}
                          </p>
                        </div>
                        <div className="flex items-center gap-3 flex-wrap">
                          <span className={`inline-block px-3 py-1 text-sm font-semibold rounded ${
                            allInactive 
                              ? 'bg-slate-200 text-slate-700' 
                              : 'bg-blue-100 text-blue-700'
                          }`}>
                            {allInactive ? 'All Inactive' : 'Active'}
                          </span>
                          <button
                            onClick={() => toggleAllElectivesInParent(parentId, allInactive)}
                            className={`flex items-center gap-2 px-4 py-2 rounded-lg font-medium transition-colors text-sm ${
                              allInactive
                                ? "bg-green-600 text-white hover:bg-green-700"
                                : "bg-red-600 text-white hover:bg-red-700"
                            }`}
                          >
                            {allInactive ? (
                              <>
                                <Power className="h-4 w-4" />
                                Activate All
                              </>
                            ) : (
                              <>
                                <PowerOff className="h-4 w-4" />
                                Deactivate All
                              </>
                            )}
                          </button>
                          <button
                            onClick={() => handleDeleteParentElective(parentId, parentGroup.parent?.name, electives)}
                            className="flex items-center gap-2 px-4 py-2 bg-red-600 text-white rounded-lg font-medium transition-colors text-sm hover:bg-red-700"
                            title="Delete entire parent elective with all sub-electives"
                          >
                            <Trash2 className="h-4 w-4" />
                            Delete All
                          </button>
                          
                          {/* Start Time Button */}
                          <div className="relative">
                            <button
                              onClick={() => {
                                const willOpen = !showStartTimePicker;
                                if (willOpen) {
                                  // Prefill floatingStartTime from this parent's electives (first non-null start)
                                  const parentRows = (createdElectives || []).filter(e => e.parent_subject_id === parentId && e.start);
                                  const firstStart = parentRows.length > 0 ? parentRows[0].start : '';
                                  setFloatingStartTime(isoToInputLocal(firstStart));
                                }
                                setShowStartTimePicker(willOpen);
                              }}
                              className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg font-medium transition-colors text-sm hover:bg-green-700"
                              title="Set start time for elective floating"
                            >
                              <CalendarDays className="h-4 w-4" />
                              Start
                            </button>
                            {showStartTimePicker && (
                              <div className="absolute right-0 mt-2 p-4 bg-white border border-slate-300 rounded-lg shadow-lg z-50 min-w-[250px]">
                                <h4 className="text-sm font-semibold text-slate-700 mb-2">Set Start Time</h4>
                                <input
                                  type="datetime-local"
                                  value={floatingStartTime}
                                  onChange={(e) => setFloatingStartTime(e.target.value)}
                                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm mb-3"
                                />
                                <div className="flex gap-2">
                                  <button
                                    onClick={() => saveFloatingTime('start', floatingStartTime, parentId)}
                                    className="flex-1 px-3 py-2 bg-green-600 text-white rounded-lg text-sm hover:bg-green-700"
                                  >
                                    Save
                                  </button>
                                  <button
                                    onClick={() => setShowStartTimePicker(false)}
                                    className="flex-1 px-3 py-2 bg-slate-300 text-slate-700 rounded-lg text-sm hover:bg-slate-400"
                                  >
                                    Cancel
                                  </button>
                                </div>
                                {floatingStartTime && (
                                  <p className="text-xs text-slate-600 mt-2">
                                    Current: {new Date(floatingStartTime).toLocaleString()}
                                  </p>
                                )}
                              </div>
                            )}
                          </div>
                          
                          {/* Stop Time Button */}
                          <div className="relative">
                            <button
                              onClick={() => {
                                const willOpen = !showStopTimePicker;
                                if (willOpen) {
                                  // Prefill floatingStopTime from this parent's electives (first non-null stop)
                                  const parentRows = (createdElectives || []).filter(e => e.parent_subject_id === parentId && e.stop);
                                  const firstStop = parentRows.length > 0 ? parentRows[0].stop : '';
                                  setFloatingStopTime(isoToInputLocal(firstStop));
                                }
                                setShowStopTimePicker(willOpen);
                              }}
                              className="flex items-center gap-2 px-4 py-2 bg-orange-600 text-white rounded-lg font-medium transition-colors text-sm hover:bg-orange-700"
                              title="Set stop time for elective floating"
                            >
                              <CalendarDays className="h-4 w-4" />
                              Stop
                            </button>
                            {showStopTimePicker && (
                              <div className="absolute right-0 mt-2 p-4 bg-white border border-slate-300 rounded-lg shadow-lg z-50 min-w-[250px]">
                                <h4 className="text-sm font-semibold text-slate-700 mb-2">Set Stop Time</h4>
                                <input
                                  type="datetime-local"
                                  value={floatingStopTime}
                                  onChange={(e) => setFloatingStopTime(e.target.value)}
                                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm mb-3"
                                />
                                <div className="flex gap-2">
                                  <button
                                    onClick={() => saveFloatingTime('stop', floatingStopTime, parentId)}
                                    className="flex-1 px-3 py-2 bg-orange-600 text-white rounded-lg text-sm hover:bg-orange-700"
                                  >
                                    Save
                                  </button>
                                  <button
                                    onClick={() => setShowStopTimePicker(false)}
                                    className="flex-1 px-3 py-2 bg-slate-300 text-slate-700 rounded-lg text-sm hover:bg-slate-400"
                                  >
                                    Cancel
                                  </button>
                                </div>
                                {floatingStopTime && (
                                  <p className="text-xs text-slate-600 mt-2">
                                    Current: {new Date(floatingStopTime).toLocaleString()}
                                  </p>
                                )}
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Electives List */}
                    <div className="divide-y divide-slate-100">
                      {electives.map((elective: any) => (
                        <div
                          key={elective.course_code}
                          className={`p-4 transition-all ${
                            elective.allActive
                              ? "bg-white hover:bg-green-50"
                              : "bg-slate-50 hover:bg-slate-100"
                          }`}
                        >
                          <div className="flex flex-row items-center justify-between gap-3 mb-2">
                            <div className="flex items-center gap-3">
                              <h4 className="font-semibold text-slate-800">
                                {elective.sub_name}
                              </h4>
                              <span className={`inline-block px-2 py-1 text-xs font-semibold rounded ${
                                elective.group === 'CG' 
                                  ? 'bg-blue-100 text-blue-700' 
                                  : elective.group === 'EG' 
                                  ? 'bg-green-100 text-green-700' 
                                  : 'bg-purple-100 text-purple-700'
                              }`}>
                                {elective.group}
                              </span>
                            </div>
                            <div className="flex items-center gap-2">
                              <button
                                onClick={() => handleEditElective(elective)}
                                className="p-1 sm:p-2 text-blue-600 hover:bg-blue-50 rounded-lg transition-colors text-sm"
                                title="Edit elective"
                              >
                                <Edit2 className="h-4 w-4" />
                                <span className="hidden sm:inline ml-2">Edit</span>
                              </button>
                              <button
                                onClick={() => handleDeleteElective(elective)}
                                className="p-1 sm:p-2 text-red-600 hover:bg-red-50 rounded-lg transition-colors text-sm"
                                title="Delete elective"
                              >
                                <Trash2 className="h-4 w-4" />
                                <span className="hidden sm:inline ml-2">Delete</span>
                              </button>
                              <button
                                onClick={() => handleSetStart(elective.id)}
                                className="p-1 sm:p-2 text-green-600 hover:bg-green-50 rounded-lg transition-colors text-sm"
                                title="Set start time"
                              >
                                <Power className="h-4 w-4" />
                                <span className="hidden sm:inline ml-2">Start</span>
                              </button>
                              <button
                                onClick={() => handleSetStop(elective.id)}
                                className="p-1 sm:p-2 text-orange-600 hover:bg-orange-50 rounded-lg transition-colors text-sm"
                                title="Set stop time"
                              >
                                <PowerOff className="h-4 w-4" />
                                <span className="hidden sm:inline ml-2">Stop</span>
                              </button>
                            </div>
                          </div>
                          {/* Mobile friendly stacked details */}
                          <div className="md:hidden text-sm text-slate-600 space-y-2 w-full">
                            <div className="flex justify-between">
                              <div className="font-medium">Code</div>
                              <div className="truncate max-w-[60%] text-right break-words">{elective.course_code}</div>
                            </div>
                            <div className="flex justify-between">
                              <div className="font-medium">Seats</div>
                              <div className="text-right">{elective.seat_count || 'Unlimited'}</div>
                            </div>
                            <div className="flex justify-between">
                              <div className="font-medium">Staff</div>
                              <div className="truncate max-w-[60%] text-right break-words">{elective.staff?.name || 'Not assigned'}</div>
                            </div>
                            <div className="flex justify-between">
                              <div className="font-medium">Start</div>
                              <div className="text-right">{elective.start ? new Date(elective.start).toLocaleString() : '-'}</div>
                            </div>
                            <div className="flex justify-between">
                              <div className="font-medium">Stop</div>
                              <div className="text-right">{elective.stop ? new Date(elective.stop).toLocaleString() : '-'}</div>
                            </div>
                            <div className="flex justify-between items-center">
                              <div className="font-medium">Departments</div>
                              <div className="flex items-center gap-2">
                                <div className="text-right text-xs text-slate-500">{elective.departments.length} items</div>
                                <button
                                  type="button"
                                  onClick={() => setExpandedRows(prev => ({ ...prev, [elective.course_code]: !prev[elective.course_code] }))}
                                  className="text-xs px-2 py-1 bg-slate-100 rounded hover:bg-slate-200"
                                >
                                  {expandedRows[elective.course_code] ? 'Hide' : 'Details'}
                                </button>
                              </div>
                            </div>

                            {expandedRows[elective.course_code] && (
                              <div className="bg-slate-50 p-2 rounded text-xs text-slate-700">
                                {elective.departments.join(', ')}
                              </div>
                            )}
                          </div>

                          {/* Desktop/tablet grid details */}
                          <div className="hidden md:grid grid-cols-1 md:grid-cols-5 gap-3 text-sm text-slate-600">
                            <div>
                              <span className="font-medium">Code:</span> {elective.course_code}
                            </div>
                            <div>
                              <span className="font-medium">Departments:</span>
                              <div className="break-words max-w-full">{elective.departments.join(", ")}</div>
                            </div>
                            <div>
                              <span className="font-medium">Seats:</span> {elective.seat_count || "Unlimited"}
                            </div>
                            <div>
                              <span className="font-medium">Staff:</span> {elective.staff?.name || "Not assigned"}
                            </div>
                            <div>
                              <span className="font-medium">Start:</span> {elective.start ? new Date(elective.start).toLocaleString() : '-'}
                            </div>
                            <div>
                              <span className="font-medium">Stop:</span> {elective.stop ? new Date(elective.stop).toLocaleString() : '-'}
                            </div>
                            <div>
                              <span className={`inline-block px-2 py-1 text-xs font-semibold rounded ${
                                elective.allActive
                                  ? 'bg-green-100 text-green-700'
                                  : 'bg-red-100 text-red-700'
                              }`}>
                                {elective.allActive ? 'Active' : 'Inactive'}
                              </span>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Modals (Edit + Action Confirmation) */}
      <>
        {editingElective && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-xl shadow-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
              <div className="p-6">
                <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 mb-6">
                  <h3 className="text-xl font-bold text-slate-800">Edit Elective</h3>
                  <button
                    onClick={() => setEditingElective(null)}
                    className="p-2 hover:bg-slate-100 rounded-lg transition-colors"
                  >
                    <X className="h-5 w-5" />
                  </button>
                </div>

                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-2">Elective Name *</label>
                    <input
                      type="text"
                      value={editForm.sub_name}
                      onChange={(e) => setEditForm({ ...editForm, sub_name: e.target.value })}
                      className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      placeholder="e.g., Data Mining"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-2">Elective Code *</label>
                    <input
                      type="text"
                      value={editForm.course_code}
                      onChange={(e) => setEditForm({ ...editForm, course_code: e.target.value.toUpperCase() })}
                      className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      placeholder="e.g., CS301E1"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-2">Seat Count</label>
                    <input
                      type="number"
                      min="1"
                      value={editForm.seat_count}
                      onChange={(e) => setEditForm({ ...editForm, seat_count: e.target.value })}
                      className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      placeholder="e.g., 60"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-2">Assign Staff</label>
                    <select
                      value={editForm.staff_id}
                      onChange={(e) => setEditForm({ ...editForm, staff_id: e.target.value })}
                      className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    >
                      <option value="">Select Staff</option>
                      {staff.map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.name} ({s.department})
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                    <p className="text-sm text-blue-800">
                      <strong>Note:</strong> This will update the elective for all departments: {editingElective?.departments?.join(", ")}
                    </p>
                  </div>

                  <div className="mt-4 p-4 border rounded-lg bg-slate-50">
                    <label className="inline-flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={editFormOpts.update_department}
                        onChange={(e) => setEditFormOpts({ ...editFormOpts, update_department: e.target.checked })}
                        className="w-4 h-4"
                      />
                      <span className="text-sm font-medium">Update Department for all these electives</span>
                    </label>

                    {editFormOpts.update_department && (
                      <div className="mt-3">
                        <label className="block text-sm text-slate-700 mb-1">Department</label>
                        <select
                          value={editFormOpts.department_value}
                          onChange={(e) => setEditFormOpts({ ...editFormOpts, department_value: e.target.value })}
                          className="w-full px-3 py-2 border border-slate-300 rounded-lg"
                        >
                          <option value="">Select Department</option>
                          <option value="ALL">ALL</option>
                          {GROUP_MAPPING.ALL.map((d) => (
                            <option key={d} value={d}>{d}</option>
                          ))}
                        </select>
                      </div>
                    )}

                    <hr className="my-3" />

                    <label className="inline-flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={editFormOpts.update_blocked_departments}
                        onChange={(e) => setEditFormOpts({ ...editFormOpts, update_blocked_departments: e.target.checked })}
                        className="w-4 h-4"
                      />
                      <span className="text-sm font-medium">Update Blocked Departments for these electives</span>
                    </label>

                    {editFormOpts.update_blocked_departments && (
                      <div className="mt-3 flex flex-wrap gap-2">
                        {GROUP_MAPPING.ALL.map((dept) => (
                          <label key={dept} className="inline-flex items-center gap-2 text-sm bg-white px-2 py-1 rounded border border-slate-200">
                            <input
                              type="checkbox"
                              checked={(editFormOpts.blocked_departments || []).includes(dept)}
                              onChange={() => {
                                const set = new Set(editFormOpts.blocked_departments || []);
                                if (set.has(dept)) set.delete(dept);
                                else set.add(dept);
                                setEditFormOpts({ ...editFormOpts, blocked_departments: Array.from(set) });
                              }}
                              className="w-4 h-4"
                            />
                            <span>{dept}</span>
                          </label>
                        ))}
                      </div>
                    )}
                  </div>
                </div>

                <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-end gap-3 mt-6">
                  <button
                    onClick={() => setEditingElective(null)}
                    className="px-4 py-2 border border-slate-300 rounded-lg hover:bg-slate-50 transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleUpdateElective}
                    className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
                  >
                    Update Elective
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {actionModal.show && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50 p-4">
            <div className="bg-white rounded-lg shadow-xl max-w-md w-full mx-4">
              <div className="p-6">
                <div className="flex items-center mb-4">
                  <div className="flex-shrink-0 w-12 h-12 bg-yellow-100 rounded-full flex items-center justify-center">
                    {actionModal.type === 'toggleAll' ? (
                      <Power className="w-6 h-6 text-yellow-600" />
                    ) : (
                      <Trash2 className="w-6 h-6 text-red-600" />
                    )}
                  </div>
                  <div className="ml-4">
                    <h3 className="text-lg font-medium text-gray-900">{actionModal.title}</h3>
                    <p className="text-sm text-gray-500">{actionModal.message}</p>
                  </div>
                </div>
                <div className="flex justify-end space-x-3">
                  <button
                    onClick={() => setActionModal({ show: false })}
                    className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 border border-gray-300 rounded-md hover:bg-gray-200 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-gray-500 transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={confirmAction}
                    className="px-4 py-2 text-sm font-medium text-white bg-red-600 border border-transparent rounded-md hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500 transition-colors"
                  >
                    Confirm
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </>
        </div>
      );
    }
