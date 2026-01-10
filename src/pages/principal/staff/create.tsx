import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import DashboardLayout from '../../../components/DashboardLayout';
import { supabase } from '../../../lib/supabase';
import { createUser } from '../../../lib/userManagement';
import * as XLSX from 'xlsx';

export default function PrincipalCreateStaff() {
  const navigate = useNavigate();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [staffId, setStaffId] = useState('');
  const [designation, setDesignation] = useState('');
  const [qualification, setQualification] = useState('');
  const [staffRole, setStaffRole] = useState<'mentor'|'advisor'|'lecturer'>('mentor');
  const [department, setDepartment] = useState('');
  const [dob, setDob] = useState('');
  const [dateOfJoin, setDateOfJoin] = useState('');
  const [year, setYear] = useState<number | ''>('' as any);
  const [section, setSection] = useState('');
  const [sections, setSections] = useState<string[]>([]);
  
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [departments, setDepartments] = useState<string[]>([]);
  const [refreshingDepartments, setRefreshingDepartments] = useState(false);
  const [useDefaultPassword, setUseDefaultPassword] = useState(true);
  const DEFAULT_PASSWORD = 'Password123!';
  const [importing, setImporting] = useState(false);
  const [importLog, setImportLog] = useState<string[]>([]);
  const [parsedRows, setParsedRows] = useState<any[] | null>(null);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [authDebug, setAuthDebug] = useState<{ loggedIn: boolean; userId?: string | null; accessToken?: string | null }>({ loggedIn: false, userId: null, accessToken: null });
  let fileInputRef: HTMLInputElement | null = null;

  const makeDummyEmail = (id: string) => {
    try {
      const rawHost = (typeof window !== 'undefined' && window.location && window.location.hostname) ? String(window.location.hostname).split(':')[0] : '';
      const host = rawHost && rawHost.includes('.') ? rawHost : 'idcs.netlify.app';
      const localId = String(id).replace(/[^a-zA-Z0-9._+-]/g, '').toLowerCase();
      return `${localId}@${host}`;
    } catch (e) {
      return `${String(id).replace(/[^a-zA-Z0-9._+-]/g, '')}@idcs.netlify.app`;
    }
  };

  const downloadTemplate = () => {
    const wb = XLSX.utils.book_new();
    const headers = [['id','name','dept','role','designation','qualification','date of joining']];
    const ws = XLSX.utils.aoa_to_sheet(headers);
    // add a sample row showing DD-MM-YY format for date-of-joining
    XLSX.utils.sheet_add_aoa(ws, [['','Dr. A. Example','CSE','mentor','Assistant Professor','Ph.D.','06-01-26']], { origin: -1 });
    XLSX.utils.book_append_sheet(wb, ws, 'Template');
    XLSX.writeFile(wb, 'staff_import_template.xlsx');
  };

  

  // Parse file and show preview (do not perform DB writes here)
  const onImportFile = async (file?: File | null) => {
    if (!file) return;
    setImporting(true);
    setImportLog([]);
    try {
      const data = await file.arrayBuffer();
      const workbook = XLSX.read(data, { type: 'array' });
      const sheet = workbook.Sheets[workbook.SheetNames[0]];
      const rows: any[] = XLSX.utils.sheet_to_json(sheet, { defval: null });
      const parsed = rows.map((r: any, idx: number) => {
        // normalize a display string for date_of_join in DD-MM-YY
        const rawDate = (
          r['date of joining'] ?? r['date_of_join'] ?? r['date of join'] ?? r['data of joining'] ?? r['Date of Joining'] ?? r['DateOfJoining'] ?? r['Date_Of_Joining'] ?? null
        );
        let display_date_of_join: string | null = null;
        try {
          if (rawDate instanceof Date) {
            const d = rawDate;
            display_date_of_join = `${String(d.getDate()).padStart(2,'0')}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getFullYear()).slice(-2)}`;
          } else if (typeof rawDate === 'number' && (XLSX as any)?.SSF?.parse_date_code) {
            const d = (XLSX as any).SSF.parse_date_code(rawDate);
            if (d) {
              const dt = new Date(Date.UTC(d.y, d.m-1, d.d));
              display_date_of_join = `${String(dt.getUTCDate()).padStart(2,'0')}-${String(dt.getUTCMonth()+1).padStart(2,'0')}-${String(dt.getUTCFullYear()).slice(-2)}`;
            }
          } else if (rawDate != null) {
            const s = String(rawDate).trim();
            const dmMatch = s.match(/^(\d{1,2})[-\/](\d{1,2})[-\/](\d{2,4})$/);
            if (dmMatch) {
              let day = Number(dmMatch[1]);
              let month = Number(dmMatch[2]);
              let year = Number(dmMatch[3]);
              if (year < 100) year += 2000;
              const dt = new Date(year, month-1, day);
              if (!isNaN(dt.getTime())) display_date_of_join = `${String(dt.getDate()).padStart(2,'0')}-${String(dt.getMonth()+1).padStart(2,'0')}-${String(dt.getFullYear()).slice(-2)}`;
            } else {
              const pd = new Date(s);
              if (!isNaN(pd.getTime())) display_date_of_join = `${String(pd.getDate()).padStart(2,'0')}-${String(pd.getMonth()+1).padStart(2,'0')}-${String(pd.getFullYear()).slice(-2)}`;
            }
          }
        } catch (e) {
          console.warn('Failed to compute display_date_of_join', rawDate, e);
        }

        return {
          _row: idx+1,
          id: r.id ?? r.ID ?? null,
          name: (r.name ?? r.Name ?? null),
          email: (r.email ?? r.Email ?? null),
          dept: (r.dept ?? r.department ?? null),
          role: (r.role ?? r.Role ?? null),
          designation: (r.designation ?? null),
          qualification: (r.qualification ?? r.Qualification ?? r.education ?? null),
          // keep raw parsed value for later DB normalization
          date_of_join: (
            r['date of joining'] ?? r['date_of_join'] ?? r['date of join'] ?? r['data of joining'] ?? r['Date of Joining'] ?? r['DateOfJoining'] ?? r['Date_Of_Joining'] ?? null
          ),
          display_date_of_join
        };
      });
      setParsedRows(parsed);
      setPreviewOpen(true);
    } catch (err) {
      console.error('Failed to parse XLSX', err);
      alert('Failed to parse XLSX file');
    } finally {
      setImporting(false);
      try { const el = document.getElementById('staff-import-file') as HTMLInputElement | null; if (el) el.value = ''; } catch (e) {}
    }
  };

  // Perform the import using the parsedRows; allow null fields
  const performImport = async () => {
    if (!parsedRows || parsedRows.length === 0) return alert('No rows to import');
    setImporting(true);
    const results: string[] = [];
    for (let i = 0; i < parsedRows.length; i++) {
      const r = parsedRows[i];
      try {
        const inputId = r.id ?? null;
        const isUuid = typeof inputId === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(inputId);
        const uid = isUuid ? inputId : ((typeof crypto !== 'undefined' && (crypto as any).randomUUID) ? (crypto as any).randomUUID() : `local-${Date.now()}-${Math.floor(Math.random()*10000)}`);
        let chosenUid = uid;
        // determine staff_id (if inputId is non-UUID treat as staff_id)
        const staffIdForRow = (inputId && !isUuid) ? String(inputId) : uid.substring(0,8);

        // Prepare fragments to use if edge creation fails
        const providedEmail = (r.email != null && String(r.email).trim() !== '') ? String(r.email).trim() : null;
        const dummyEmail = makeDummyEmail(staffIdForRow || uid.substring(0,8));

        const staffFragment: any = { staff_id: staffIdForRow };
        if (r.role != null && String(r.role).trim() !== '') staffFragment.staff_role = String(r.role).trim();
        if (r.dept != null && String(r.dept).trim() !== '') staffFragment.department = String(r.dept).trim();
        if (r.designation != null && String(r.designation).trim() !== '') staffFragment.designation = String(r.designation).trim();
        if (r.qualification != null && String(r.qualification).trim() !== '') staffFragment.qualification = String(r.qualification).trim();
        // parse possible join date from imported cell and normalize to YYYY-MM-DD
        if (r.date_of_join != null) {
          try {
            let parsedDate: string | null = null;
            // If Excel provided a Date object
            if (r.date_of_join instanceof Date) {
              parsedDate = r.date_of_join.toISOString().slice(0,10);
            } else if (typeof r.date_of_join === 'number' && (XLSX as any)?.SSF?.parse_date_code) {
              // Excel serial date number
              const d = (XLSX as any).SSF.parse_date_code(r.date_of_join);
              if (d) parsedDate = new Date(Date.UTC(d.y, d.m-1, d.d)).toISOString().slice(0,10);
            } else {
              // Accept DD-MM-YY, DD-MM-YYYY, and variants with / separators
              const s = String(r.date_of_join).trim();
              const dmMatch = s.match(/^(\d{1,2})[-\/](\d{1,2})[-\/](\d{2,4})$/);
              if (dmMatch) {
                let day = Number(dmMatch[1]);
                let month = Number(dmMatch[2]);
                let year = Number(dmMatch[3]);
                if (year < 100) {
                  // map two-digit year -> 2000+ (e.g., 26 -> 2026)
                  year += 2000;
                }
                const dt = new Date(year, month-1, day);
                if (!isNaN(dt.getTime())) parsedDate = dt.toISOString().slice(0,10);
              } else {
                // fallback to Date parse
                const pd = new Date(s);
                if (!isNaN(pd.getTime())) parsedDate = pd.toISOString().slice(0,10);
              }
            }
            if (parsedDate) staffFragment.date_of_join = parsedDate;
          } catch (e) {
            console.warn('Failed to parse date_of_join for import row', r._row, r.date_of_join, e);
          }
        }

        // look up hod/ahod now so we can include in userData
        if (r.dept != null && String(r.dept).trim()) {
          const deptName = String(r.dept).trim();
          try {
            const { data: hodRows } = await supabase.from('profiles').select('id').eq('role', 'hod').eq('department', deptName).limit(1);
            const hodId = (hodRows && hodRows.length) ? hodRows[0].id : undefined;
            if (hodId) staffFragment.hod_id = hodId;
          } catch (e) {
            console.warn('Failed to lookup HOD for department', r.dept, e);
          }
          try {
            const { data: ahodRows } = await supabase.from('profiles').select('id').eq('role', 'ahod').eq('department', deptName).limit(1);
            const ahodId = (ahodRows && ahodRows.length) ? ahodRows[0].id : undefined;
            if (ahodId) staffFragment.ahod_id = ahodId;
          } catch (e) {
            console.warn('Failed to lookup AHOD for department', r.dept, e);
          }
        }

        // If staff_id already exists, we'll update that staff (do not skip);
        // record existing staff id to prefer when reusing UIDs later
        let existingStaffByStaffId: any = null;
        try {
          const { data: existingStaff, error: exErr } = await supabase.from('staff').select('id').eq('staff_id', staffIdForRow).limit(1).maybeSingle();
          if (!exErr && existingStaff && (existingStaff as any).id) {
            existingStaffByStaffId = (existingStaff as any).id;
          }
        } catch (e) {
          console.warn('Failed to check existing staff by staff_id', e);
        }

        try {
          const { data: existingStudent, error: stErr } = await supabase.from('students').select('id').eq('reg_no', staffIdForRow).limit(1).maybeSingle();
          if (!stErr && existingStudent && (existingStudent as any).id) {
            results.push(`SKIP row ${r._row}: student with reg_no ${staffIdForRow} already exists (id: ${(existingStudent as any).id})`);
            continue;
          }
        } catch (e) {
          console.warn('Failed to check existing students by reg_no', e);
        }

        const emailForAuth = providedEmail || dummyEmail;
        const userData: any = {
          name: r.name ? String(r.name) : undefined,
          email: emailForAuth,
          department: r.dept ? String(r.dept) : undefined,
          password: DEFAULT_PASSWORD,
          role: 'staff',
          staff_id: staffFragment.staff_id,
          staff_role: staffFragment.staff_role || 'staff',
          hod_id: staffFragment.hod_id,
          ahod_id: staffFragment.ahod_id,
          designation: staffFragment.designation ?? null,
          qualification: staffFragment.qualification ?? null,
          reg_no: staffFragment.staff_id
        };
        if (staffFragment.date_of_join) userData.date_of_join = staffFragment.date_of_join;
        // If the staff_id or profile already exists, prefer updating that
        // existing record instead of creating a new auth user. Check for an
        // existing profile by email and prefer that UID. If none found but a
        // staff exists with the same staff_id, prefer that staff's UID.
        let skipCreateAuth = false;
        if (providedEmail) {
          try {
            const { data: existingProfileByEmail } = await supabase.from('profiles').select('id').eq('email', providedEmail).limit(1).maybeSingle();
            if (existingProfileByEmail && (existingProfileByEmail as any).id) {
              chosenUid = (existingProfileByEmail as any).id;
              results.push(`RECOVER row ${r._row}: reusing existing profile id ${chosenUid} for email ${providedEmail}`);
              skipCreateAuth = true;
            }
          } catch (e) {
            console.warn('Failed to lookup existing profile by email before createUser', e);
          }
        }
        if (!skipCreateAuth && existingStaffByStaffId) {
          chosenUid = existingStaffByStaffId;
          results.push(`FOUND existing staff row ${r._row}: will update id ${chosenUid} for staff_id ${staffIdForRow}`);
          skipCreateAuth = true;
        }

        // Try creating auth+profile via edge function only when we didn't find
        // an existing profile/staff to update.
        if (!skipCreateAuth) {
          try {
            const res = await createUser(userData);
            const createdUserId = res?.user?.id ?? null;
            if (createdUserId) {
              results.push(`OK auth created row ${r._row}: ${emailForAuth}${!providedEmail ? ' (dummy)' : ''}`);
              // attempt to ensure profile and staff rows exist and DOJ is set for the newly created user
              try {
                const profUpsert: any = { id: createdUserId };
                if (r.name != null && String(r.name).trim() !== '') profUpsert.name = String(r.name).trim();
                profUpsert.email = providedEmail || dummyEmail;
                profUpsert.reg_no = staffIdForRow;
                if (r.dept != null && String(r.dept).trim() !== '') profUpsert.department = String(r.dept).trim();
                if (dob) profUpsert.dob = dob;
                await supabase.from('profiles').upsert(profUpsert);

                const staffUpsert: any = { id: createdUserId, staff_id: staffIdForRow };
                if (staffFragment.staff_role) staffUpsert.staff_role = staffFragment.staff_role;
                if (staffFragment.department) staffUpsert.department = staffFragment.department;
                if (staffFragment.designation) staffUpsert.designation = staffFragment.designation;
                if (staffFragment.qualification) staffUpsert.qualification = staffFragment.qualification;
                if (staffFragment.hod_id) staffUpsert.hod_id = staffFragment.hod_id;
                if (staffFragment.ahod_id) staffUpsert.ahod_id = staffFragment.ahod_id;
                if (staffFragment.date_of_join) staffUpsert.date_of_join = staffFragment.date_of_join;
                await supabase.from('staff').upsert(staffUpsert);
              } catch (e) {
                console.warn('Failed to upsert profile/staff after createUser', e);
              }
              results.push(`OK row ${r._row}: ${createdUserId}${inputId && !isUuid ? ` (staff_id:${inputId})` : ''}`);
              continue; // edge created profile/staff; skip local upsert to avoid duplicate ids
            } else {
              results.push(`ERR createUser row ${r._row}: Edge function returned no user id`);
            }
          } catch (e: any) {
            const errMsg = e?.message || String(e);
            console.warn('createUser failed for import row, falling back to local upsert', emailForAuth, e);
            results.push(`ERR createUser row ${r._row}: ${errMsg}`);
          }
        }

        // Edge function failed; try to recover by reusing an existing profile
        // that may already be present for the provided email to keep UIDs
        // consistent. If none found, fall back to a generated uid (may
        // result in mismatched auth/profile ids later).
        // chosenUid is already initialized above; prefer existing profile by email when present
        if (providedEmail) {
          try {
            const { data: existingProfile } = await supabase.from('profiles').select('id').eq('email', providedEmail).limit(1).maybeSingle();
            if (existingProfile && (existingProfile as any).id) {
              chosenUid = (existingProfile as any).id;
              results.push(`RECOVER row ${r._row}: reusing existing profile id ${chosenUid} for email ${providedEmail}`);
            }
          } catch (e) {
            console.warn('Failed to lookup existing profile by email during fallback', e);
          }
        }
        // If we didn't find an existing profile by email but a staff exists with
        // the provided staff_id, prefer updating that staff's id.
        if (!providedEmail && existingStaffByStaffId) {
          chosenUid = existingStaffByStaffId;
          results.push(`FOUND existing staff row ${r._row}: will update id ${chosenUid} for staff_id ${staffIdForRow}`);
        } else if (providedEmail && !chosenUid && existingStaffByStaffId) {
          // providedEmail was truthy but no profile found by email; still allow
          // matching by staff_id to update existing staff
          chosenUid = existingStaffByStaffId;
          results.push(`FOUND existing staff row ${r._row}: will update id ${chosenUid} for staff_id ${staffIdForRow}`);
        }

        const profilePayload: any = { id: chosenUid, role: 'staff' };
        profilePayload.reg_no = staffIdForRow;
        if (r.name != null && String(r.name).trim() !== '') profilePayload.name = String(r.name).trim();
        if (r.dept != null && String(r.dept).trim() !== '') profilePayload.department = String(r.dept).trim();
        // only set email on payload if provided; otherwise avoid overwriting existing email with a dummy
        if (providedEmail) profilePayload.email = providedEmail;

        // Track whether we inserted/updated profile or staff so we can decide
        // whether to send invites and whether to mark the row as SKIP
        let profileInserted = false;
        let profileUpdated = false;
        let profileUpdatedFields: string[] = [];
        let staffInserted = false;
        let staffUpdated = false;
        let staffUpdatedFields: string[] = [];

        // If profile exists, update only changed fields; otherwise insert
        try {
          const { data: existingProfile } = await supabase.from('profiles').select('id, name, email, department, reg_no, dob').eq('id', chosenUid).maybeSingle();
          if (existingProfile && existingProfile.id) {
            const profileUpdate: any = {};
            if (profilePayload.name && profilePayload.name !== existingProfile.name) profileUpdate.name = profilePayload.name;
            if (profilePayload.email && profilePayload.email !== existingProfile.email) profileUpdate.email = profilePayload.email;
            if (profilePayload.department && profilePayload.department !== existingProfile.department) profileUpdate.department = profilePayload.department;
            if (profilePayload.reg_no && profilePayload.reg_no !== existingProfile.reg_no) profileUpdate.reg_no = profilePayload.reg_no;
            if (dob && dob !== existingProfile.dob) profileUpdate.dob = dob;
            if (Object.keys(profileUpdate).length > 0) {
              const { error: pUpErr } = await supabase.from('profiles').update(profileUpdate).eq('id', chosenUid);
              if (pUpErr) throw pUpErr;
              profileUpdated = true;
              profileUpdatedFields = Object.keys(profileUpdate);
              results.push(`UPDATED profile row ${r._row}: ${chosenUid} fields: ${profileUpdatedFields.join(', ')}`);
            }
            else {
              // no profile changes
            }
          } else {
            // insert new profile — ensure an email exists (use dummy if none provided)
            if (!profilePayload.email) profilePayload.email = providedEmail || dummyEmail;
            const { error: pInsErr } = await supabase.from('profiles').insert(profilePayload);
            if (pInsErr) throw pInsErr;
            profileInserted = true;
            results.push(`INSERT profile row ${r._row}: ${chosenUid}`);
          }
        } catch (pe) {
          throw pe;
        }

        const staffPayload: any = { id: chosenUid };
        staffPayload.staff_id = staffIdForRow;
        if (staffFragment.staff_role) staffPayload.staff_role = staffFragment.staff_role;
        if (staffFragment.department) staffPayload.department = staffFragment.department;
        if (staffFragment.designation) staffPayload.designation = staffFragment.designation;
        if (staffFragment.qualification) staffPayload.qualification = staffFragment.qualification;
        if (staffFragment.hod_id) staffPayload.hod_id = staffFragment.hod_id;
        if (staffFragment.ahod_id) staffPayload.ahod_id = staffFragment.ahod_id;
        if (staffFragment.date_of_join) staffPayload.date_of_join = staffFragment.date_of_join;

        // If staff row exists, update only changed fields; otherwise insert
        try {
          const { data: existingStaff } = await supabase.from('staff').select('id, staff_id, staff_role, department, designation, qualification, hod_id, ahod_id, date_of_join').eq('id', chosenUid).maybeSingle();
          if (existingStaff && existingStaff.id) {
            const staffUpdate: any = {};
            if (staffPayload.staff_id && staffPayload.staff_id !== existingStaff.staff_id) staffUpdate.staff_id = staffPayload.staff_id;
            if (staffPayload.staff_role && staffPayload.staff_role !== existingStaff.staff_role) staffUpdate.staff_role = staffPayload.staff_role;
            if (staffPayload.department && staffPayload.department !== existingStaff.department) staffUpdate.department = staffPayload.department;
            if (staffPayload.designation && staffPayload.designation !== existingStaff.designation) staffUpdate.designation = staffPayload.designation;
            if (staffPayload.qualification && staffPayload.qualification !== existingStaff.qualification) staffUpdate.qualification = staffPayload.qualification;
            if (staffPayload.hod_id && staffPayload.hod_id !== existingStaff.hod_id) staffUpdate.hod_id = staffPayload.hod_id;
            if (staffPayload.ahod_id && staffPayload.ahod_id !== existingStaff.ahod_id) staffUpdate.ahod_id = staffPayload.ahod_id;
            if (staffPayload.date_of_join && staffPayload.date_of_join !== existingStaff.date_of_join) staffUpdate.date_of_join = staffPayload.date_of_join;
            if (Object.keys(staffUpdate).length > 0) {
              const { error: sUpErr } = await supabase.from('staff').update(staffUpdate).eq('id', chosenUid);
              if (sUpErr) throw sUpErr;
              staffUpdated = true;
              staffUpdatedFields = Object.keys(staffUpdate);
              results.push(`UPDATED staff row ${r._row}: ${chosenUid} fields: ${staffUpdatedFields.join(', ')}`);
            }
            else {
              // no staff changes
            }
          } else {
            const { error: sInsErr } = await supabase.from('staff').insert(staffPayload);
            if (sInsErr) throw sInsErr;
            staffInserted = true;
            results.push(`INSERT staff row ${r._row}: ${chosenUid}`);
          }
        } catch (se) {
          throw se;
        }
        // Determine whether any action was taken; if nothing changed, SKIP the row entirely
        const anyInsertedOrUpdated = profileInserted || profileUpdated || staffInserted || staffUpdated;
        if (!anyInsertedOrUpdated) {
          results.push(`SKIP row ${r._row}: ${chosenUid} no changes`);
        } else {
          // Send invite only when profile inserted OR profile email changed OR staff inserted
          if (providedEmail && (profileInserted || (profileUpdated && profileUpdatedFields.includes('email')) || staffInserted)) {
            try {
              await supabase.auth.signInWithOtp({ email: providedEmail });
              results.push(`OK invite sent row ${r._row}: ${providedEmail}`);
            } catch (e2) {
              console.warn('Failed to send invite magic link', e2);
              results.push(`ERR auth invite row ${r._row}: ${e2?.message || String(e2)}`);
            }
          } else {
            results.push(`NOTE auth row ${r._row}: invite not sent`);
          }

          results.push(`OK row ${r._row}: ${chosenUid}${inputId && !isUuid ? ` (staff_id:${inputId})` : ''}`);
        }
      } catch (e: any) {
        console.error('Import row failed', e);
        results.push(`ERR row ${r._row}: ${e?.message || String(e)}`);
      }
    }
    setImportLog(results);
    setPreviewOpen(false);
    setParsedRows(null);
    setImporting(false);
    alert('Import completed — check import log for details.');
  };
  const loadDepartments = async () => {
    try {
      const { data } = await supabase.from('departments').select('name');
      setDepartments((data || []).map((d: any) => d.name).filter(Boolean));
    } catch (e) {
      console.warn('Failed to load departments', e);
    }
  };

  useEffect(() => {
    let mounted = true;
    if (mounted) loadDepartments();

    // fetch auth session info for debug
    (async () => {
      try {
        const { data: sessionRes } = await supabase.auth.getSession();
        const session = (sessionRes as any)?.session ?? null;
        if (!mounted) return;
        setAuthDebug({ loggedIn: !!session, userId: session?.user?.id ?? null, accessToken: session?.access_token ?? null });
      } catch (e) {
        console.warn('Failed to get session for debug', e);
      }
    })();
    return () => { mounted = false; };
  }, []);

  const refreshDepartments = async () => {
    setRefreshingDepartments(true);
    try {
      // clear any previous preview/import state so new files show correctly
      setParsedRows(null);
      setPreviewOpen(false);
      setImportLog([]);
      // reset the hidden file input so selecting the same file triggers change
      try { const el = document.getElementById('staff-import-file') as HTMLInputElement | null; if (el) el.value = ''; } catch (e) {}
      await loadDepartments();
    } finally {
      setRefreshingDepartments(false);
    }
  };

  useEffect(() => {
    let mounted = true;
    const loadSections = async () => {
      if (!year) {
        setSections([]);
        return;
      }
      try {
        const yrNum = Number(year);
        const { data, error } = await supabase.from('students').select('section').neq('section', null).eq('year', yrNum);
        if (error) {
          console.warn('Failed to load sections for year', yrNum, error);
          if (mounted) setSections([]);
          return;
        }
        const secs = Array.from(new Set((data || []).map((r: any) => r.section))).filter(Boolean) as string[];
        if (mounted) setSections(secs.sort());
      } catch (e) {
        console.warn('Error loading sections', e);
        if (mounted) setSections([]);
      }
    };
    loadSections();
    return () => { mounted = false; };
  }, [year]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!name) return setError('Name is required');
    setCreating(true);
    try {
      // Determine staff id to use for auth/reg_no
      const genStaffId = staffId && String(staffId).trim() ? String(staffId).trim() : `STF${Date.now().toString().slice(-6)}`;

      // resolve HOD/AHOD for the department (if provided)
      let hodId: string | undefined;
      let ahodId: string | undefined;
      if (department && department.trim()) {
        try {
          const { data: hodRows } = await supabase.from('profiles').select('id').eq('role', 'hod').eq('department', department.trim()).limit(1);
          hodId = (hodRows && hodRows.length) ? hodRows[0].id : undefined;
        } catch (e) {
          console.warn('Failed to lookup HOD for department', department, e);
        }
        try {
          const { data: ahodRows } = await supabase.from('profiles').select('id').eq('role', 'ahod').eq('department', department.trim()).limit(1);
          ahodId = (ahodRows && ahodRows.length) ? ahodRows[0].id : undefined;
        } catch (e) {
          console.warn('Failed to lookup AHOD for department', department, e);
        }
      }

      // Determine an email to use for auth: prefer provided email, otherwise generate a dummy one using staff id
      const emailToUse = (email && String(email).includes('@')) ? String(email).trim() : makeDummyEmail(genStaffId);

      // Attempt to create auth user via edge function; fall back to magic-link only for real emails
      try {
        const userData: any = {
          name: name.trim(),
          email: emailToUse,
          department: department.trim() || '',
          password: DEFAULT_PASSWORD,
          role: staffRole === 'hod' || staffRole === 'ahod' ? staffRole : 'staff',
          staff_id: genStaffId,
          reg_no: genStaffId,
          staff_role: staffRole,
          hod_id: hodId,
          ahod_id: ahodId,
          designation: designation || null,
          qualification: qualification || null
        };
        if (staffRole === 'advisor') {
          if (year) userData.year = year;
          if (section) userData.section = String(section).trim().toUpperCase();
        }

        try {
          const res = await createUser(userData);
          const createdUserId = res?.user?.id ?? res?.data?.user?.id ?? res?.data?.id ?? null;
          if (createdUserId) {
            navigate('/principal/staff-details');
            return;
          }
          // If edge function didn't return a user id, treat as failure and fall through to fallback
          console.warn('createUser returned no user id, falling back to upsert+invite', res);
          throw new Error('createUser did not create auth user');
        } catch (e) {
          throw e;
        }
      } catch (e: any) {
        const errMsg = e?.message || String(e);
        console.warn('createUser failed on manual create; falling back to magic-link invite', e);
        setError(`Auth creation failed: ${errMsg}`);
        // If the admin provided a real email, try magic-link invite; otherwise continue without invite
        if (email && String(email).includes('@')) {
          try {
            await supabase.auth.signInWithOtp({ email: String(email).trim() });
            // proceed to upsert profile/staff and show success message
          } catch (siErr) {
            console.warn('Failed to send magic link after createUser failure', siErr);
            setError((prev) => `${prev || ''} | invite failed: ${siErr?.message || String(siErr)}`);
            throw siErr;
          }
        }
      }

      // generate id — but first try to reuse an existing profile id if an auth/profile
      // already exists for the email we attempted to create. This keeps auth and
      // profile UIDs consistent.
      let uid = (typeof crypto !== 'undefined' && (crypto as any).randomUUID) ? (crypto as any).randomUUID() : `local-${Date.now()}-${Math.floor(Math.random()*10000)}`;
      if (emailToUse && String(emailToUse).includes('@')) {
        try {
          const { data: existingProfile } = await supabase.from('profiles').select('id').eq('email', String(emailToUse).trim()).limit(1).maybeSingle();
          if (existingProfile && (existingProfile as any).id) {
            uid = (existingProfile as any).id;
            setInfo((prev) => (prev ? prev + ' ' : '') + `Reused existing profile id ${uid}`);
          }
        } catch (e) {
          console.warn('Failed to lookup existing profile by email during fallback create', e);
        }
      }

      const finalStaffId = (typeof genStaffId !== 'undefined' && genStaffId) ? genStaffId : (staffId && String(staffId).trim() ? String(staffId).trim() : uid.substring(0,8));
      const profilePayload: any = { id: uid, name, role: 'staff' };
      profilePayload.reg_no = finalStaffId;
      // ensure profile email contains the real or dummy email used for auth
      if (typeof (email) !== 'undefined' && (email && String(email).trim() !== '')) {
        profilePayload.email = String(email).trim();
      } else {
        profilePayload.email = makeDummyEmail(finalStaffId);
      }
      if (department) profilePayload.department = department;
      if (dob) profilePayload.dob = dob;

      // upsert profile
      const { error: pErr } = await supabase.from('profiles').upsert(profilePayload);
      if (pErr) throw pErr;

      const staffPayload: any = { id: uid, staff_id: finalStaffId, staff_role: staffRole };
      if (dateOfJoin) staffPayload.date_of_join = dateOfJoin;
      if (year) staffPayload.year = year;
      if (section) staffPayload.section = section;
      if (department) staffPayload.department = department;
      if (designation) staffPayload.designation = designation;
      if (qualification) staffPayload.qualification = qualification;
      // set hod/ahod ids on staff record based on chosen department
      if (department && department.trim()) {
        try {
          const { data: hodRows } = await supabase.from('profiles').select('id').eq('role', 'hod').eq('department', department.trim()).limit(1);
          const hodId = (hodRows && hodRows.length) ? hodRows[0].id : undefined;
          if (hodId) staffPayload.hod_id = hodId;
        } catch (e) {
          console.warn('Failed to lookup HOD for department', department, e);
        }
        try {
          const { data: ahodRows } = await supabase.from('profiles').select('id').eq('role', 'ahod').eq('department', department.trim()).limit(1);
          const ahodId = (ahodRows && ahodRows.length) ? ahodRows[0].id : undefined;
          if (ahodId) staffPayload.ahod_id = ahodId;
        } catch (e) {
          console.warn('Failed to lookup AHOD for department', department, e);
        }
      }

      const { error: sErr } = await supabase.from('staff').upsert(staffPayload);
      if (sErr) throw sErr;

      // If email provided, send a magic link (OTP) to allow the user to set up auth
      if (email && String(email).includes('@')) {
        try {
          // supabase.auth.signInWithOtp sends a magic link / OTP email and does not
          // replace the current session of the logged-in admin. This allows creating
          // an auth entry without a server-side service key.
          const { error: otpErr } = await supabase.auth.signInWithOtp({ email: String(email).trim() });
          if (otpErr) {
            console.warn('Failed to send magic link:', otpErr);
            setInfo(null);
            setError('Created profile/staff but failed to send invite email.');
            navigate('/principal/staff-details');
            return;
          }
          setInfo('Profile created and invitation email sent to the user.');
        } catch (e) {
          console.warn('signInWithOtp failed', e);
          setError('Created profile/staff but failed to send invite email.');
          navigate('/principal/staff-details');
          return;
        }
      }

      navigate('/principal/staff-details');
    } catch (err: any) {
      console.error('Create staff failed', err);
      setError(err?.message || 'Failed to create staff');
    } finally {
      setCreating(false);
    }
  };

  return (
    <DashboardLayout>
      <div className="max-w-3xl mx-auto">
        <div className="mb-6 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">Create Staff</h1>
            <p className="text-sm text-slate-600">Add a new staff profile and staff record.</p>
          </div>
          <div>
            <button onClick={() => navigate('/principal/staff-details')} className="px-3 py-1 bg-gray-200 rounded">Back</button>
          </div>
        </div>

        <div className="mb-6">
          <div className="flex items-center gap-3 flex-wrap">
            <a className="px-3 py-2 bg-blue-600 text-white rounded text-sm" href={`/templates/staff_import_template_with_dropdown_exceljs.xlsx?v=${Date.now()}`}>Template</a>
            <button onClick={refreshDepartments} disabled={refreshingDepartments} className="px-3 py-2 bg-white border border-slate-300 rounded text-sm hover:bg-slate-50">
              {refreshingDepartments ? 'Refreshing...' : 'Refresh'}
            </button>
            <input id="staff-import-file" className="hidden" type="file" accept=".xlsx,.xls" onChange={(e) => onImportFile(e.target.files?.[0] ?? null)} />
            <label htmlFor="staff-import-file" className="px-3 py-2 bg-white border border-slate-300 rounded text-sm cursor-pointer hover:bg-slate-50">Import</label>
            <span className="text-sm text-slate-500">Template columns: id, name, dept, role, designation, qualification, date of joining</span>
          </div>
          
          {importLog && importLog.length > 0 && (
            <div className="mt-2 text-xs">
              <strong>Import log:</strong>
              <ul className="list-disc ml-5">
                {importLog.map((l, idx) => <li key={idx}>{l}</li>)}
              </ul>
            </div>
          )}

          {previewOpen && parsedRows && (
            <div className="mt-4 p-3 border rounded bg-white">
              <div className="flex items-center justify-between mb-2">
                <strong>Import Preview</strong>
                <div className="flex items-center gap-2">
                  <button onClick={() => { setParsedRows(null); setPreviewOpen(false); setImportLog([]); }} className="px-3 py-1 border rounded bg-white">Cancel</button>
                  <button onClick={performImport} disabled={importing} className="px-3 py-1 bg-green-600 text-white rounded">{importing ? 'Importing...' : 'Confirm Import'}</button>
                </div>
              </div>
              <div className="overflow-x-auto">
                {/* Desktop/tablet view */}
                <table className="w-full text-sm border-collapse hidden md:table">
                  <thead>
                    <tr className="text-left bg-slate-100">
                      <th className="p-2 border">#</th>
                      <th className="p-2 border">ID</th>
                      <th className="p-2 border">Name</th>
                      <th className="p-2 border">Email</th>
                      <th className="p-2 border">Dept</th>
                      <th className="p-2 border">Role</th>
                      <th className="p-2 border">Designation</th>
                      <th className="p-2 border">Qualification</th>
                        <th className="p-2 border">Date of joining</th>
                    </tr>
                  </thead>
                  <tbody>
                    {parsedRows.map((r, idx) => (
                      <tr key={idx} className="odd:bg-white even:bg-slate-50">
                        <td className="p-2 border align-top">{r._row}</td>
                        <td className="p-2 border align-top">{r.id ?? ''}</td>
                        <td className="p-2 border align-top">{r.name ?? ''}</td>
                        <td className="p-2 border align-top">{r.email ?? ''}</td>
                        <td className="p-2 border align-top">{r.dept ?? ''}</td>
                        <td className="p-2 border align-top">{r.role ?? ''}</td>
                        <td className="p-2 border align-top">{r.designation ?? ''}</td>
                          <td className="p-2 border align-top">{r.qualification ?? ''}</td>
                          <td className="p-2 border align-top">{r.display_date_of_join ?? (r.date_of_join ?? '')}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>

                {/* Mobile stacked view */}
                <div className="flex flex-col gap-3 md:hidden">
                  {parsedRows.map((r, idx) => (
                    <div key={idx} className="p-3 border rounded bg-white">
                      <div className="flex justify-between text-sm mb-1"><span className="font-semibold">Row</span><span>{r._row}</span></div>
                      <div className="grid grid-cols-2 gap-2 text-sm">
                        <div><span className="font-medium">ID</span><div className="text-slate-700">{r.id ?? ''}</div></div>
                        <div><span className="font-medium">Name</span><div className="text-slate-700">{r.name ?? ''}</div></div>
                        <div><span className="font-medium">Email</span><div className="text-slate-700">{r.email ?? ''}</div></div>
                        <div><span className="font-medium">Dept</span><div className="text-slate-700">{r.dept ?? ''}</div></div>
                        <div><span className="font-medium">Role</span><div className="text-slate-700">{r.role ?? ''}</div></div>
                        <div><span className="font-medium">Designation</span><div className="text-slate-700">{r.designation ?? ''}</div></div>
                        <div className="col-span-2"><span className="font-medium">Qualification</span><div className="text-slate-700">{r.qualification ?? ''}</div></div>
                        <div className="col-span-2"><span className="font-medium">Date of joining</span><div className="text-slate-700">{r.display_date_of_join ?? (r.date_of_join ?? '')}</div></div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>

        <form onSubmit={handleSubmit} className="bg-white p-6 rounded-lg border border-slate-200 space-y-4">
          {error && <div className="text-sm text-red-600">{error}</div>}

          <div>
            <label className="block text-sm text-slate-600 mb-1">Name *</label>
            <input value={name} onChange={(e) => setName(e.target.value)} className="w-full px-3 py-2 border rounded" />
          </div>

          <div>
            <label className="block text-sm text-slate-600 mb-1">Staff ID (optional)</label>
            <input value={staffId} onChange={(e) => setStaffId(e.target.value)} placeholder="e.g., STF123" className="w-full px-3 py-2 border rounded" />
          </div>

          <div>
            <label className="block text-sm text-slate-600 mb-1">Email</label>
            <input value={email} onChange={(e) => setEmail(e.target.value)} className="w-full px-3 py-2 border rounded" />
          </div>

          <div>
            <label className="block text-sm text-slate-600 mb-1">Designation</label>
            <input value={designation} onChange={(e) => setDesignation(e.target.value)} className="w-full px-3 py-2 border rounded" />
          </div>

          <div>
            <label className="block text-sm text-slate-600 mb-1">Qualification</label>
            <input value={qualification} onChange={(e) => setQualification(e.target.value)} className="w-full px-3 py-2 border rounded" />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <div>
                <label className="block text-sm text-slate-600 mb-1">Role</label>
                <select value={staffRole} onChange={(e) => setStaffRole(e.target.value as any)} className="w-full px-3 py-2 border rounded">
                  <option value="mentor">Mentor</option>
                  <option value="advisor">Advisor</option>
                  <option value="lecturer">Lecturer</option>
                  <option value="hod">HOD</option>
                  <option value="ahod">AHOD</option>
                </select>
              </div>
            <div>
              <label className="block text-sm text-slate-600 mb-1">Department</label>
              <select value={department} onChange={(e) => setDepartment(e.target.value)} className="w-full px-3 py-2 border rounded">
                <option value="">— Select —</option>
                {departments.map((d) => <option key={d} value={d}>{d}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm text-slate-600 mb-1">Date of birth</label>
              <input type="date" value={dob} onChange={(e) => setDob(e.target.value)} className="w-full px-3 py-2 border rounded" />
            </div>
            <div>
              <label className="block text-sm text-slate-600 mb-1">Date of join (optional)</label>
              <input type="date" value={dateOfJoin} onChange={(e) => setDateOfJoin(e.target.value)} className="w-full px-3 py-2 border rounded" />
            </div>
          </div>

          {staffRole === 'advisor' && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 p-3 bg-blue-50 rounded">
              <div>
                <label className="block text-sm text-slate-700 font-medium mb-1">Year *</label>
                <select value={year as any} onChange={(e) => setYear(Number(e.target.value))} className="w-full px-3 py-2 border rounded">
                  <option value="">— Select —</option>
                  <option value={1}>Year 1</option>
                  <option value={2}>Year 2</option>
                  <option value={3}>Year 3</option>
                  <option value={4}>Year 4</option>
                </select>
              </div>
              <div>
                <label className="block text-sm text-slate-700 font-medium mb-1">Section *</label>
                {sections && sections.length > 0 ? (
                  <select value={section} onChange={(e) => setSection(e.target.value)} className="w-full px-3 py-2 border rounded">
                    <option value="">— Select Section —</option>
                    {sections.map((s) => <option key={s} value={s}>{s}</option>)}
                  </select>
                ) : (
                  <input value={section} onChange={(e) => setSection(e.target.value)} className="w-full px-3 py-2 border rounded" />
                )}
              </div>
            </div>
          )}

          

          <div className="flex items-center gap-3">
            <button type="submit" disabled={creating} className="w-full sm:w-auto px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-200 disabled:opacity-50">{creating ? 'Creating...' : 'Create Staff'}</button>
            <button type="button" onClick={() => { setName(''); setEmail(''); setStaffId(''); setStaffRole('mentor'); setDepartment(''); setDob(''); setYear('' as any); setSection(''); }} className="px-3 py-2 border rounded">Reset</button>
          </div>
        </form>
      </div>
    </DashboardLayout>
  );
}
