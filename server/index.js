#!/usr/bin/env node
import dotenv from 'dotenv';
dotenv.config({ path: process.env.DOTENV_CONFIG_PATH || '.env.local' });
import express from 'express';
import cors from 'cors';
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY;
const ADMIN_API_TOKEN = process.env.ADMIN_API_TOKEN || process.env.ADMIN_TOKEN || null;
const PORT = process.env.ADMIN_API_PORT || 7888;
const ALLOWED_ORIGIN = process.env.DEV_ALLOWED_ORIGIN || 'http://localhost:5173';

if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in environment. Set them in .env.local');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });

const app = express();

// Utility: normalize various DOB formats to ISO (YYYY-MM-DD) for Postgres
function normalizeDobToIso(raw) {
  if (!raw || typeof raw !== 'string') return null;
  const s = raw.trim();
  if (!s) return null;
  // If already ISO-like YYYY-MM-DD
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  // Allow separators - / . and formats like DD-MM-YYYY or D-M-YYYY or DD/MM/YYYY or DD.MM.YYYY
  const m = s.match(/^(\d{1,2})[\.\/\-](\d{1,2})[\.\/\-](\d{2,4})$/);
  if (m) {
    let day = m[1].padStart(2, '0');
    let month = m[2].padStart(2, '0');
    let year = m[3];
    if (year.length === 2) {
      year = Number(year) > 30 ? '19' + year : '20' + year;
    }
    return `${year}-${month}-${day}`;
  }
  // If format is DDMMYYYY without separators
  const m2 = s.match(/^(\d{2})(\d{2})(\d{4})$/);
  if (m2) {
    return `${m2[3]}-${m2[2]}-${m2[1]}`;
  }
  // Unable to parse — return original and let Postgres error if invalid
  return s;
}
app.use(express.json());
// Allow the dev origins and also allow non-browser clients (no origin)
const allowedOrigins = [ALLOWED_ORIGIN, 'http://127.0.0.1:5173', 'http://localhost:5173'];
app.use(cors({
  origin: (origin, callback) => {
    // allow requests with no origin (curl, Postman, server-to-server)
    if (!origin) return callback(null, true);
    if (allowedOrigins.includes(origin)) return callback(null, true);
    return callback(new Error('Not allowed by CORS'));
  },
}));

// Simple token check middleware
// Simple token check middleware. Accepts header 'x-admin-token' or query param 'token'.
app.use((req, res, next) => {
  if (!ADMIN_API_TOKEN) return next(); // no token required if not set (use only for dev)
  const tokenFromHeader = req.headers['x-admin-token'] || req.headers['x-admin-token'.toLowerCase()];
  const token = tokenFromHeader || req.query?.token || '';
  if (!token || token !== ADMIN_API_TOKEN) return res.status(401).json({ error: 'Unauthorized' });
  next();
});

// POST /advisor-applications
// body: { advisor_id, type }
// Returns applications for students belonging to advisor_id (bypasses RLS using service role key)
app.post('/advisor-applications', async (req, res) => {
  try {
    const { advisor_id, type } = req.body || {};
    if (!advisor_id) return res.status(400).json({ error: 'advisor_id is required' });

  // Fetch advisor's profile and staff row (to determine year/section)
  const { data: advisorProfile, error: advisorProfErr } = await supabase.from('profiles').select('id, department, role, name').eq('id', advisor_id).maybeSingle();
    if (advisorProfErr) return res.status(500).json({ error: 'failed fetching advisor profile', detail: advisorProfErr });

    const { data: staffRow, error: staffErr } = await supabase.from('staff').select('id, staff_role, year, section').eq('id', advisor_id).maybeSingle();
    if (staffErr) return res.status(500).json({ error: 'failed fetching staff row', detail: staffErr });

  console.log('[API /advisor-applications] advisorProfile=', advisorProfile);
  console.log('[API /advisor-applications] staffRow=', staffRow);

    // Build class student list:
    // - If staffRow has year+section, fetch students in that class whose profile.department matches advisor's department
    // - Also include students explicitly assigned to this advisor (advisor_id = advisor_id) but only if they match the same year/section (to avoid unrelated advisees)
    const classStudentIds = new Set();

    if (staffRow && staffRow.year && staffRow.section) {
      // students by year/section
      const { data: classStudents, error: classStudentsErr } = await supabase
        .from('students')
        .select('id')
        .eq('year', staffRow.year)
        .eq('section', staffRow.section);
      if (classStudentsErr) return res.status(500).json({ error: 'failed fetching class students', detail: classStudentsErr });

      const classIds = (classStudents || []).map(s => s.id);
      if (classIds.length > 0 && advisorProfile && advisorProfile.department) {
        // filter by department via profiles
        const { data: profilesInDept, error: profilesErr } = await supabase
          .from('profiles')
          .select('id')
          .in('id', classIds)
          .eq('department', advisorProfile.department);
        if (profilesErr) return res.status(500).json({ error: 'failed fetching profiles for dept', detail: profilesErr });
        (profilesInDept || []).forEach(p => classStudentIds.add(p.id));
      }
    }

    // Explicit advisor-assigned students (but only include if year/section matches staffRow, if available)
    const { data: assignedStudents, error: assignedErr } = await supabase.from('students').select('id, year, section').eq('advisor_id', advisor_id);
    if (assignedErr) return res.status(500).json({ error: 'failed fetching assigned students', detail: assignedErr });
    (assignedStudents || []).forEach(s => {
      if (!staffRow || !staffRow.year || !staffRow.section) {
        // if no staff year/section, include assigned students
        classStudentIds.add(s.id);
      } else if (s.year === staffRow.year && String(s.section).toUpperCase() === String(staffRow.section).toUpperCase()) {
        classStudentIds.add(s.id);
      }
    });

    const studentIds = Array.from(classStudentIds);

    if (studentIds.length === 0) {
      return res.json({ ok: true, applications: [], studentIds: [] });
    }

    // Fetch applications for those students (optionally filter by type)
    let appsQuery = supabase.from('applications').select('id, student_id, type, status, created_at').in('student_id', studentIds).order('created_at', { ascending: false });
    if (type) appsQuery = appsQuery.eq('type', type);
    const { data: apps, error: appsErr } = await appsQuery;
    if (appsErr) return res.status(500).json({ error: 'failed fetching applications', detail: appsErr });

    // Fetch students and profiles for the merged output
    const { data: studentsRows, error: studentsRowsErr } = await supabase.from('students').select('id, reg_no, roll_no, year, section, mentor_id, advisor_id').in('id', studentIds);
    if (studentsRowsErr) return res.status(500).json({ error: 'failed fetching student rows', detail: studentsRowsErr });

    const { data: profilesRows, error: profilesRowsErr } = await supabase.from('profiles').select('id, email, name, department').in('id', studentIds);
    if (profilesRowsErr) return res.status(500).json({ error: 'failed fetching profiles rows', detail: profilesRowsErr });

    const studentsById = {};
    (studentsRows || []).forEach(s => { studentsById[s.id] = s; });
    const profilesById = {};
    (profilesRows || []).forEach(p => { profilesById[p.id] = p; });

    const merged = (apps || []).map(a => ({
      id: a.id,
      student_id: a.student_id,
      type: a.type,
      status: a.status,
      created_at: a.created_at,
      student: studentsById[a.student_id] || null,
      profile: profilesById[a.student_id] || null
    }));

    return res.json({ ok: true, applications: merged, studentIds });
  } catch (err) {
    console.error('[API /advisor-applications] unexpected', err);
    return res.status(500).json({ error: 'unexpected', detail: String(err) });
  }
});

app.get('/', (req, res) => res.json({ ok: true, msg: 'Admin API running' }));

// GET /resolve-email-by-staff?staff_id=3171001
// Returns { ok: true, email } or 404 if not found. Uses service-role key so it bypasses RLS.
app.get('/resolve-email-by-staff', async (req, res) => {
  try {
    const staff_id = req.query?.staff_id;
    if (!staff_id) return res.status(400).json({ error: 'staff_id query param required' });

    // Try exact match first
    const { data: staffRow, error: staffErr } = await supabase.from('staff').select('id, staff_id').eq('staff_id', String(staff_id)).maybeSingle();
    if (staffErr) return res.status(500).json({ error: 'failed fetching staff', detail: staffErr });

    let resolvedId = staffRow?.id;

    // fallback ilike contains
    if (!resolvedId) {
      const { data: staffRow2, error: staffErr2 } = await supabase.from('staff').select('id, staff_id').ilike('staff_id', `%${String(staff_id)}%`).limit(1).maybeSingle();
      if (staffErr2) return res.status(500).json({ error: 'failed fetching staff fallback', detail: staffErr2 });
      resolvedId = staffRow2?.id;
    }

    if (!resolvedId) return res.status(404).json({ ok: false, error: 'staff not found' });

    const { data: profileRow, error: profErr } = await supabase.from('profiles').select('email').eq('id', resolvedId).maybeSingle();
    if (profErr) return res.status(500).json({ error: 'failed fetching profile', detail: profErr });
    if (!profileRow || !profileRow.email) return res.status(404).json({ ok: false, error: 'email not found for staff' });

    return res.json({ ok: true, email: profileRow.email });
  } catch (err) {
    console.error('[API /resolve-email-by-staff] unexpected', err);
    return res.status(500).json({ error: 'unexpected', detail: String(err) });
  }
});

// POST /ensure-bucket
// body: { bucket?: string, public?: boolean }
// Ensures a storage bucket exists; creates it if missing (requires service role key)
app.post('/ensure-bucket', async (req, res) => {
  try {
    const bucket = req.body?.bucket || 'certificates';
    const isPublic = typeof req.body?.public === 'boolean' ? req.body.public : true;

    // Check if bucket exists
    const { data: existing, error: getErr } = await supabase.storage.getBucket(bucket);
    if (getErr && getErr?.message && !String(getErr.message).toLowerCase().includes('not found')) {
      return res.status(500).json({ error: 'getBucket failed', detail: getErr });
    }

    if (existing) {
      return res.json({ ok: true, existed: true, bucket: existing });
    }

    // Create bucket
    const { data: created, error: createErr } = await supabase.storage.createBucket(bucket, { public: isPublic });
    if (createErr) return res.status(400).json({ error: 'createBucket failed', detail: createErr });
    return res.json({ ok: true, created: true, bucket: created });
  } catch (err) {
    console.error('[API /ensure-bucket] unexpected', err);
    return res.status(500).json({ error: 'unexpected', detail: String(err) });
  }
});

// POST /create-user
// body: { role, name, email, department?, dob?, password? }
app.post('/create-user', async (req, res) => {
  try {
    const { role, name, email, department, dob, password } = req.body || {};
    if (!role || !name || !email) return res.status(400).json({ error: 'role, name and email are required' });

    const pw = password || process.env.DEFAULT_DEMO_PASSWORD || 'Password123!';

    // create auth user
    const createRes = await supabase.auth.admin.createUser({ email: String(email), password: String(pw), user_metadata: { name }, email_confirm: true });
    // log full response
    if (createRes?.error) {
      return res.status(400).json({ error: 'createUser failed', detail: createRes.error });
    }
    const user = createRes?.data?.user || createRes?.user || createRes?.data || null;
    if (!user || !user.id) return res.status(500).json({ error: 'No user id returned', raw: createRes });

    // insert profile linked to auth user id
    const profile = {
      id: user.id,
      email: String(email),
      role: String(role),
      name: String(name),
      department: department || '',
      dob: normalizeDobToIso(dob) || null,
    };

    const insertRes = await supabase.from('profiles').insert(profile).select();
    if (insertRes?.error) {
      // try to clean up created auth user if profile insert fails
      try { await supabase.auth.admin.deleteUser(user.id); } catch (e) {/* ignore */}
      return res.status(400).json({ error: 'profile insert failed', detail: insertRes.error });
    }

    return res.json({ ok: true, user: user, profile: insertRes.data, password: pw });
  } catch (err) {
    console.error('create-user error', err);
    return res.status(500).json({ error: 'unexpected', detail: String(err) });
  }
});

// POST /create-staff
// body: { name, email, department, dob?, password?, staff_role, year?, section? }
app.post('/create-staff', async (req, res) => {
  try {
    const { name, email, department, dob, password, staff_role, year, section } = req.body || {};
    if (!name || !email || !department || !staff_role) {
      return res.status(400).json({ error: 'name, email, department, and staff_role are required' });
    }

    console.log('[API /create-staff] Received request:', req.body);

    const pw = password || process.env.DEFAULT_DEMO_PASSWORD || 'Password123!';
    console.log('[API /create-staff] Creating auth user for email:', email);

    // Create auth user
    const createRes = await supabase.auth.admin.createUser({ 
      email: String(email), 
      password: String(pw), 
      user_metadata: { name }, 
      email_confirm: true 
    });

    // Prepare a user holder that may come from createRes or from existing profile
    let user = null;

    if (createRes?.error) {
      console.error('[API /create-staff] Auth user creation failed:', createRes.error);

      // If the email already exists in auth, try to recover by finding an existing profile with same email
      const err = createRes.error;
      const isEmailExists = err?.code === 'email_exists' || err?.status === 422 || String(err?.message || '').toLowerCase().includes('already been registered');
      if (isEmailExists) {
        console.log('[API /create-staff] Email already exists. Attempting to find existing profile by email and reuse it.');
        const { data: existingProfile, error: profileErr } = await supabase.from('profiles').select('id, role, name, department').eq('email', String(email)).maybeSingle();
        if (profileErr) {
          console.error('[API /create-staff] Error querying profiles for existing email:', profileErr);
          return res.status(400).json({ error: 'createUser failed and profile lookup failed', detail: createRes.error, profileLookup: profileErr });
        }
        if (existingProfile && existingProfile.id) {
          // Reuse existing profile id as the user id
          user = { id: existingProfile.id, email };
          console.log('[API /create-staff] Found existing profile. Will reuse id:', user.id);

          // Ensure profile role and name/department updated to staff values
          try {
            const updates = { role: 'staff', name: String(name), department: String(department) };
            await supabase.from('profiles').update(updates).eq('id', existingProfile.id);
          } catch (uerr) {
            console.warn('[API /create-staff] Failed to update existing profile, continuing:', uerr);
          }
        } else {
          // No profile to link; cannot proceed automatically
          return res.status(400).json({ error: 'createUser failed - email already exists in auth but no profile found. Please remove the existing auth user or add a profile manually.', detail: createRes.error });
        }
      } else {
        return res.status(400).json({ error: 'createUser failed', detail: createRes.error });
      }
    } else {
      user = createRes?.data?.user || createRes?.user || createRes?.data || null;
      if (!user || !user.id) {
        console.error('[API /create-staff] No user ID returned from Supabase.');
        return res.status(500).json({ error: 'No user id returned', raw: createRes });
      }
      console.log('[API /create-staff] Auth user created successfully. User ID:', user.id);
    }

    // Insert profile
    const profile = {
      id: user.id,
      email: String(email),
      role: 'staff',
      name: String(name),
      department: String(department),
      dob: normalizeDobToIso(dob) || null,
    };

    console.log('[API /create-staff] Inserting profile:', profile);
    const insertRes = await supabase.from('profiles').insert(profile).select();
    if (insertRes?.error) {
      console.error('[API /create-staff] Profile insert failed:', insertRes.error);
      try { await supabase.auth.admin.deleteUser(user.id); } catch (e) {/* ignore */}
      return res.status(400).json({ error: 'profile insert failed', detail: insertRes.error });
    }
    console.log('[API /create-staff] Profile inserted successfully.');

    // Insert staff record (using service role key, bypasses RLS)
    const staffData = {
      id: user.id,
      staff_id: `STF${Date.now().toString().slice(-6)}`,
      staff_role: String(staff_role),
      year: null,
      section: null,
    };
    
    // Add year and section only for advisors
    if (staff_role === 'advisor') {
      if (year) staffData.year = parseInt(year);
      if (section) staffData.section = String(section).toUpperCase();
    }
    
    console.log('[API /create-staff] Inserting staff record:', staffData);
    const staffRes = await supabase.from('staff').insert(staffData).select();
    if (staffRes?.error) {
      console.error('[API /create-staff] Staff insert failed:', staffRes.error);
      // Clean up on failure
      try { 
        await supabase.from('profiles').delete().eq('id', user.id);
        await supabase.auth.admin.deleteUser(user.id); 
      } catch (e) {/* ignore */}
      return res.status(400).json({ error: 'staff insert failed', detail: staffRes.error });
    }
    console.log('[API /create-staff] Staff record inserted successfully:', staffRes.data);

    // Post-create conveniences: if this staff is an advisor and has year/section, assign unassigned students
    try {
      if (staff_role === 'advisor' && staffData.year && staffData.section && department) {
        console.log('[API /create-staff] Attempting to assign unassigned students to new advisor based on department/year/section');
        // Find students matching year/section
        const { data: classStudents, error: classErr } = await supabase
          .from('students')
          .select('id')
          .eq('year', staffData.year)
          .eq('section', staffData.section);

        if (!classErr && classStudents && classStudents.length > 0) {
          const ids = classStudents.map((s) => s.id);
          // Filter by department via profiles
          const { data: profilesInDept, error: profilesErr } = await supabase
            .from('profiles')
            .select('id')
            .in('id', ids)
            .eq('department', String(department));

          if (!profilesErr && profilesInDept && profilesInDept.length > 0) {
            const idsToUpdate = profilesInDept.map((p) => p.id);
            // Only update students where advisor_id IS NULL
            const { data: toUpdate, error: toUpdateErr } = await supabase
              .from('students')
              .select('id')
              .in('id', idsToUpdate)
              .is('advisor_id', null);

            if (!toUpdateErr && toUpdate && toUpdate.length > 0) {
              const updateIds = toUpdate.map((s) => s.id);
              const { data: updRes, error: updErr } = await supabase
                .from('students')
                .update({ advisor_id: user.id })
                .in('id', updateIds)
                .select();

              if (updErr) console.warn('[API /create-staff] Failed to assign advisor to students:', updErr);
              else console.log('[API /create-staff] Assigned advisor to students:', (updRes || []).length);
            }
          }
        }
      }
    } catch (aderr) {
      console.warn('[API /create-staff] post-create advisor assign error', aderr);
    }

    return res.json({ ok: true, user: user, profile: insertRes.data, staff: staffRes.data, password: pw });
  } catch (err) {
    console.error('create-staff error', err);
    return res.status(500).json({ error: 'unexpected', detail: String(err) });
  }
});

// Admin: create subject (uses service role key, bypasses RLS)
// POST /subjects
// body: { subject_code?, name, staff_id?, credits?, year, department, section? }
app.post('/subjects', async (req, res) => {
  try {
    const body = req.body || {};
    if (!body.name || (typeof body.year === 'undefined' && typeof body.semester === 'undefined')) {
      return res.status(400).json({ error: 'name and year or semester are required' });
    }

    // derive year if only semester provided
    let yearNum = null;
    if (typeof body.year !== 'undefined' && body.year !== null && body.year !== '') {
      yearNum = Number(body.year);
    } else if (typeof body.semester !== 'undefined' && body.semester !== null && body.semester !== '') {
      const semN = Number(body.semester);
      yearNum = Math.min(6, Math.max(1, Math.ceil(semN / 2)));
    }

    // Ensure section is non-null to satisfy DB constraint; default to 'A' when missing
    const insertBody = {
      subject_code: body.subject_code ?? null,
      name: body.name,
      staff_id: body.staff_id ?? null,
      credits: typeof body.credits !== 'undefined' ? body.credits : null,
      year: yearNum,
      semester: typeof body.semester !== 'undefined' ? (body.semester === null ? null : Number(body.semester)) : null,
      department: (typeof body.department !== 'undefined') ? (body.department ?? null) : null,
      section: (typeof body.section !== 'undefined' && body.section !== null && String(body.section).trim() !== '') ? String(body.section) : 'A',
      // allow admin callers to set group_name if provided
      group_name: Object.prototype.hasOwnProperty.call(body, 'group_name') ? (body.group_name ?? null) : undefined,
    };

    const { data, error } = await supabase.from('subjects').insert([insertBody]).select();
    if (error) return res.status(400).json({ error: 'insert failed', detail: error });
    return res.json({ ok: true, data });
  } catch (err) {
    console.error('[API /subjects POST] unexpected', err);
    return res.status(500).json({ error: 'unexpected', detail: String(err) });
  }
});

// Admin: update subject by id (uses service role key, bypasses RLS)
// PUT /subjects/:id
app.put('/subjects/:id', async (req, res) => {
  try {
    const id = req.params?.id;
    if (!id) return res.status(400).json({ error: 'id required' });
    const body = req.body || {};

    const updateBody = {};
    if (Object.prototype.hasOwnProperty.call(body, 'subject_code')) updateBody.subject_code = body.subject_code ?? null;
    if (Object.prototype.hasOwnProperty.call(body, 'name')) updateBody.name = body.name;
    if (Object.prototype.hasOwnProperty.call(body, 'staff_id')) updateBody.staff_id = body.staff_id ?? null;
    if (Object.prototype.hasOwnProperty.call(body, 'credits')) updateBody.credits = typeof body.credits !== 'undefined' ? body.credits : null;
    if (Object.prototype.hasOwnProperty.call(body, 'group_name')) updateBody.group_name = body.group_name ?? null;
    if (Object.prototype.hasOwnProperty.call(body, 'year')) updateBody.year = Number(body.year);
    if (Object.prototype.hasOwnProperty.call(body, 'semester')) updateBody.semester = typeof body.semester !== 'undefined' ? Number(body.semester) : null;
    if (Object.prototype.hasOwnProperty.call(body, 'department')) updateBody.department = body.department;
    if (Object.prototype.hasOwnProperty.call(body, 'section')) updateBody.section = body.section ?? null;

    // If semester provided but year not provided, derive year from semester
    if (Object.prototype.hasOwnProperty.call(body, 'semester') && !Object.prototype.hasOwnProperty.call(body, 'year')) {
      const semN = body.semester === null ? null : Number(body.semester);
      if (semN) updateBody.year = Math.min(6, Math.max(1, Math.ceil(semN / 2)));
    }

    const { data, error } = await supabase.from('subjects').update(updateBody).eq('id', id).select().single();
    if (error) return res.status(400).json({ error: 'update failed', detail: error });
    return res.json({ ok: true, data });
  } catch (err) {
    console.error('[API /subjects PUT] unexpected', err);
    return res.status(500).json({ error: 'unexpected', detail: String(err) });
  }
});

// POST /subjects/bulk-update
// body: { ids: [uuid], year?, semester?, department?, section? }
app.post('/subjects/bulk-update', async (req, res) => {
  try {
    const body = req.body || {};
    const ids = Array.isArray(body.ids) ? body.ids : null;
    if (!ids || ids.length === 0) return res.status(400).json({ error: 'ids array is required' });

    const updateBody = {};
    if (Object.prototype.hasOwnProperty.call(body, 'department')) updateBody.department = body.department;
    if (Object.prototype.hasOwnProperty.call(body, 'section')) updateBody.section = body.section ?? null;
    if (Object.prototype.hasOwnProperty.call(body, 'credits')) updateBody.credits = typeof body.credits !== 'undefined' ? body.credits : null;

    // prefer explicit year if provided
    if (Object.prototype.hasOwnProperty.call(body, 'year') && body.year !== null && body.year !== '') {
      updateBody.year = Number(body.year);
    }

    // if semester provided, set semester and possibly derive year if not explicitly provided
    if (Object.prototype.hasOwnProperty.call(body, 'semester')) {
      updateBody.semester = body.semester === null ? null : Number(body.semester);
      if (!Object.prototype.hasOwnProperty.call(body, 'year') && updateBody.semester) {
        updateBody.year = Math.min(6, Math.max(1, Math.ceil(Number(updateBody.semester) / 2)));
      }
    }

    if (Object.keys(updateBody).length === 0) return res.status(400).json({ error: 'no updatable fields provided' });

    const { data, error } = await supabase.from('subjects').update(updateBody).in('id', ids).select();
    if (error) return res.status(400).json({ error: 'bulk update failed', detail: error });
    return res.json({ ok: true, data });
  } catch (err) {
    console.error('[API /subjects/bulk-update] unexpected', err);
    return res.status(500).json({ error: 'unexpected', detail: String(err) });
  }
});

// POST /subjects/bulk-insert
// body: { items: [{ subject_code?, name, staff_id?, credits?, year, semester?, department, section? }, ...] }
app.post('/subjects/bulk-insert', async (req, res) => {
  try {
    const body = req.body || {};
    const items = Array.isArray(body.items) ? body.items : null;
    if (!items || items.length === 0) return res.status(400).json({ error: 'items array is required' });

    // Basic validation: ensure each has name and department and (year or semester)
    for (const it of items) {
      if (!it.name || (typeof it.year === 'undefined' && typeof it.semester === 'undefined')) {
        return res.status(400).json({ error: 'each item requires name and year or semester' });
      }
    }

    // Derive year from semester if needed
    const prepared = items.map((it) => {
      let yearNum = null;
      if (typeof it.year !== 'undefined' && it.year !== null && it.year !== '') yearNum = Number(it.year);
      else if (typeof it.semester !== 'undefined' && it.semester !== null && it.semester !== '') {
        const semN = Number(it.semester);
        yearNum = Math.min(6, Math.max(1, Math.ceil(semN / 2)));
      }
        return {
        subject_code: it.subject_code ?? null,
        name: it.name,
        staff_id: (typeof it.staff_id !== 'undefined' && it.staff_id !== null && String(it.staff_id).trim() !== '') ? it.staff_id : null,
        credits: typeof it.credits !== 'undefined' ? it.credits : null,
        year: yearNum,
        semester: typeof it.semester !== 'undefined' ? (it.semester === null ? null : Number(it.semester)) : null,
        department: (typeof it.department !== 'undefined') ? (it.department ?? null) : null,
        section: (typeof it.section !== 'undefined' && it.section !== null && String(it.section).trim() !== '') ? String(it.section) : 'A',
        // carry optional group_name if provided
        group_name: Object.prototype.hasOwnProperty.call(it, 'group_name') ? (it.group_name ?? null) : undefined,
      };
    });

    const { data, error } = await supabase.from('subjects').insert(prepared).select();
    if (error) return res.status(400).json({ error: 'bulk insert failed', detail: error });
    return res.json({ ok: true, data });
  } catch (err) {
    console.error('[API /subjects/bulk-insert] unexpected', err);
    return res.status(500).json({ error: 'unexpected', detail: String(err) });
  }
});

// DELETE /subjects/:id
app.delete('/subjects/:id', async (req, res) => {
  try {
    const id = req.params?.id;
    if (!id) return res.status(400).json({ error: 'id required' });
    const { data, error } = await supabase.from('subjects').delete().eq('id', id).select();
    if (error) return res.status(400).json({ error: 'delete failed', detail: error });
    return res.json({ ok: true, data });
  } catch (err) {
    console.error('[API /subjects DELETE] unexpected', err);
    return res.status(500).json({ error: 'unexpected', detail: String(err) });
  }
});

// POST /create-student
// body: { name, email, department, dob?, password?, reg_no, roll_no, year, section }
app.post('/create-student', async (req, res) => {
  try {
    const { name, email, department, dob, password, reg_no, roll_no, year, section } = req.body || {};
    if (!name || !email || !department || !reg_no || !roll_no || !year || !section) {
      return res.status(400).json({ error: 'name, email, department, reg_no, roll_no, year, and section are required' });
    }

    const pw = password || process.env.DEFAULT_DEMO_PASSWORD || 'Password123!';

    // Create auth user
    let user = null;
    const createRes = await supabase.auth.admin.createUser({ 
      email: String(email), 
      password: String(pw), 
      user_metadata: { name }, 
      email_confirm: true 
    });

    if (createRes?.error) {
      // If user already exists in auth, attempt to recover by finding an existing profile by email
      const err = createRes.error;
      const isEmailExists = err?.code === 'email_exists' || err?.status === 422 || String(err?.message || '').toLowerCase().includes('already been registered');
      if (isEmailExists) {
        console.log('[API /create-student] Auth user already exists. Attempting to reuse existing profile by email:', email);
        const { data: existingProfile, error: profileErr } = await supabase.from('profiles').select('id, email, role, name, department').eq('email', String(email)).maybeSingle();
        if (profileErr) {
          console.error('[API /create-student] Error querying profiles for existing email:', profileErr);
          return res.status(400).json({ error: 'createUser failed and profile lookup failed', detail: createRes.error, profileLookup: profileErr });
        }
        if (existingProfile && existingProfile.id) {
          // Reuse existing profile id as the user id (auth user exists but we don't control creation)
          user = { id: existingProfile.id, email: existingProfile.email };
          console.log('[API /create-student] Reusing existing profile id for user:', user.id);
          // Ensure profile has role=student and updated fields
          try {
            await supabase.from('profiles').update({ role: 'student', name: String(name), department: String(department) }).eq('id', existingProfile.id);
          } catch (uerr) { console.warn('[API /create-student] Failed to update existing profile, continuing:', uerr); }
        } else {
          return res.status(400).json({ error: 'createUser failed - email already exists in auth but no profile found. Please add a profile manually or remove the existing auth user.', detail: createRes.error });
        }
      } else {
        return res.status(400).json({ error: 'createUser failed', detail: createRes.error });
      }
    } else {
      user = createRes?.data?.user || createRes?.user || createRes?.data || null;
      if (!user || !user.id) return res.status(500).json({ error: 'No user id returned', raw: createRes });
    }

    // Insert or upsert profile (use upsert to avoid failures when profile exists)
    const profile = {
      id: user.id,
      email: String(email),
      role: 'student',
      name: String(name),
      department: String(department),
      dob: normalizeDobToIso(dob) || null,
    };

    const insertRes = await supabase.from('profiles').upsert(profile).select();
    if (insertRes?.error) {
      // If we created an auth user in this request, attempt cleanup
      try { if (createRes && !createRes.error && user && user.id) await supabase.auth.admin.deleteUser(user.id); } catch (e) {/* ignore */}
      return res.status(400).json({ error: 'profile upsert failed', detail: insertRes.error });
    }

    // Find mentor, advisor, ahod, hod for this department/year/section
    const { data: staffList } = await supabase
      .from('staff')
      .select('id, staff_role, year, section')
      .eq('year', parseInt(year))
      .eq('section', String(section).toUpperCase());
    
    const { data: profilesList } = await supabase
      .from('profiles')
      .select('id, role, department')
      .eq('department', String(department))
      .in('role', ['ahod', 'hod']);

    let mentor_id = null;
    let advisor_id = null;
    let ahod_id = null;
    let hod_id = null;

    // Find mentor and advisor from staff
    if (staffList) {
      const mentor = staffList.find(s => s.staff_role === 'mentor');
      const advisor = staffList.find(s => s.staff_role === 'advisor');
      if (mentor) mentor_id = mentor.id;
      if (advisor) advisor_id = advisor.id;
    }

    // Find ahod and hod from profiles
    if (profilesList) {
      const ahod = profilesList.find(p => p.role === 'ahod');
      const hod = profilesList.find(p => p.role === 'hod');
      if (ahod) ahod_id = ahod.id;
      if (hod) hod_id = hod.id;
    }

    // Insert student record
    const studentData = {
      id: user.id,
      reg_no: String(reg_no),
      roll_no: String(roll_no),
      year: parseInt(year),
      section: String(section).toUpperCase(),
      mentor_id,
      advisor_id,
      ahod_id,
      hod_id
    };
    
    // Insert or upsert student record. If student row exists, upsert will update it.
    const studentRes = await supabase.from('students').upsert(studentData).select();
    if (studentRes?.error) {
      console.error('[API /create-student] student upsert failed', studentRes.error, { studentData, userId: user.id });
      // Clean up on failure only if we created the auth user in this request
      try { 
        // If createRes existed and had no error, it means we created an auth user above
        if (createRes && !createRes.error && user && user.id) {
          await supabase.from('profiles').delete().eq('id', user.id);
          await supabase.auth.admin.deleteUser(user.id);
        }
      } catch (e) {/* ignore */}
      return res.status(400).json({ error: 'student upsert failed', detail: studentRes.error });
    }

    return res.json({ ok: true, user: user, profile: insertRes.data, student: studentRes.data, password: pw });
  } catch (err) {
    console.error('create-student error', err);
    return res.status(500).json({ error: 'unexpected', detail: String(err) });
  }
});

// Post-processing: after creating a student, try to set advisor/mentor/ahod/hod if possible
// We'll wrap this into the create-student flow above by updating student after insert.

// Bind explicitly to 0.0.0.0 so localhost/127.0.0.1 access works across IPv4/IPv6 in Windows environments
app.listen(PORT, '0.0.0.0', () => {
  console.log(`Admin API listening on http://0.0.0.0:${PORT}`);
  console.log(`CORS allowed origins: ${allowedOrigins.join(', ')}`);
  if (ADMIN_API_TOKEN) console.log('ADMIN_API_TOKEN is set — secure mode enabled');
});

// Global error handlers for visibility during development
process.on('unhandledRejection', (reason) => {
  console.error('Unhandled Rejection at:', reason);
});
process.on('uncaughtException', (err) => {
  console.error('Uncaught Exception:', err);
});

// DELETE /delete-user
// body: { id }
app.post('/delete-user', async (req, res) => {
  try {
    const { id } = req.body || {};
    if (!id) return res.status(400).json({ error: 'id is required' });

    console.log('[API /delete-user] Deleting user and related records for id:', id);

    // Delete dependent records first (students, staff)
    const studentDel = await supabase.from('students').delete().eq('id', id);
    if (studentDel?.error) {
      console.error('[API /delete-user] Error deleting student row:', studentDel.error);
      // continue trying to delete other records
    }

    const staffDel = await supabase.from('staff').delete().eq('id', id);
    if (staffDel?.error) {
      console.error('[API /delete-user] Error deleting staff row:', staffDel.error);
    }

    // Delete profile
    const profileDel = await supabase.from('profiles').delete().eq('id', id);
    if (profileDel?.error) {
      console.error('[API /delete-user] Error deleting profile row:', profileDel.error);
    }

    // Finally delete the auth user (may fail if user doesn't exist in auth)
    try {
      await supabase.auth.admin.deleteUser(id);
    } catch (e) {
      console.warn('[API /delete-user] supabase.auth.admin.deleteUser failed or user not found in auth:', e?.message || e);
    }

    return res.json({ ok: true, deleted: { student: studentDel?.data, staff: staffDel?.data, profile: profileDel?.data } });
  } catch (err) {
    console.error('[API /delete-user] unexpected error', err);
    return res.status(500).json({ error: 'unexpected', detail: String(err) });
  }
});

// POST /update-auth-email
// body: { id, email }
// Updates the Supabase Auth user's email using the service-role key, and syncs profiles.email
app.post('/update-auth-email', async (req, res) => {
  try {
    const { id, email } = req.body || {};
    if (!id || !email) return res.status(400).json({ error: 'id and email are required' });

    console.log('[API /update-auth-email] Request to update auth email:', { id });

    // Use admin client (service role) to update auth user
    if (!supabase.auth || !supabase.auth.admin || typeof supabase.auth.admin.updateUserById !== 'function') {
      // best-effort: some versions expose updateUser instead
      if (supabase.auth && supabase.auth.admin && typeof supabase.auth.admin.updateUser === 'function') {
        const updateRes = await supabase.auth.admin.updateUser(id, { email: String(email) });
        if (updateRes?.error) return res.status(400).json({ error: 'failed updating auth user', detail: updateRes.error });
      } else {
        return res.status(500).json({ error: 'admin update API not available on this client version' });
      }
    } else {
      const updateRes = await supabase.auth.admin.updateUserById(id, { email: String(email) });
      if (updateRes?.error) return res.status(400).json({ error: 'failed updating auth user', detail: updateRes.error });
    }

    // Sync profiles table email
    const { data: profileUpdate, error: profileErr } = await supabase.from('profiles').update({ email: String(email) }).eq('id', id).select();
    if (profileErr) {
      console.warn('[API /update-auth-email] profile update failed, but auth email changed:', profileErr);
      return res.status(200).json({ ok: true, warning: 'auth_updated_profile_update_failed', detail: String(profileErr) });
    }

    return res.json({ ok: true, profile: profileUpdate?.[0] || null });
  } catch (err) {
    console.error('[API /update-auth-email] unexpected', err);
    return res.status(500).json({ error: 'unexpected', detail: String(err) });
  }
});

// POST /repair-advisor
// body: { advisor_id, department?, year?, section?, setStaffYearSection?: boolean, assignStudents?: boolean }
// - If setStaffYearSection is true and year/section provided, updates staff row for the advisor
// - If assignStudents is true, assigns advisor_id to matching students (only where advisor_id IS NULL)
app.post('/repair-advisor', async (req, res) => {
  try {
    const { advisor_id, department, year, section, setStaffYearSection = false, assignStudents = false } = req.body || {};
    if (!advisor_id) return res.status(400).json({ error: 'advisor_id is required' });

    console.log('[API /repair-advisor] Request:', { advisor_id, department, year, section, setStaffYearSection, assignStudents });

    // Validate advisor exists
    const { data: advisorProfile, error: profErr } = await supabase.from('profiles').select('id, role, department, name').eq('id', advisor_id).maybeSingle();
    if (profErr) return res.status(500).json({ error: 'failed to lookup advisor profile', detail: profErr });
    if (!advisorProfile) return res.status(404).json({ error: 'advisor profile not found' });

    const results = { updatedStaff: null, studentsMatched: 0, studentsUpdated: 0, matchedStudentIds: [] };

    // Optionally set staff year/section
    if (setStaffYearSection && (year || section)) {
  const updates = {};
      if (year) updates.year = parseInt(year);
      if (section) updates.section = String(section).toUpperCase();
      const { data: staffUpdate, error: staffUpdateErr } = await supabase.from('staff').update(updates).eq('id', advisor_id).select();
      if (staffUpdateErr) {
        console.error('[API /repair-advisor] staff update failed', staffUpdateErr);
        return res.status(500).json({ error: 'staff update failed', detail: staffUpdateErr });
      }
      results.updatedStaff = staffUpdate?.[0] || null;
    }

    // Optionally assign students
    if (assignStudents) {
      // Build list of student ids to update
      let studentFilter = null;
      if (year && section && department) {
        // Match by year+section+department
        const { data: studentsByClass, error: classErr } = await supabase
          .from('students')
          .select('id')
          .eq('year', parseInt(year))
          .eq('section', String(section).toUpperCase());
        if (classErr) return res.status(500).json({ error: 'failed fetching students by class', detail: classErr });
        const ids = (studentsByClass || []).map(s => s.id);
        if (ids.length === 0) {
          results.studentsMatched = 0;
        } else {
          // filter ids by department via profiles
          const { data: profilesInDept, error: profsErr } = await supabase.from('profiles').select('id').in('id', ids).eq('department', department);
          if (profsErr) return res.status(500).json({ error: 'failed fetching profiles for dept', detail: profsErr });
          studentFilter = (profilesInDept || []).map(p => p.id);
        }
      } else if (department) {
        // Match by department only (all students whose profile.department = department)
        const { data: profilesInDept, error: profsErr } = await supabase.from('profiles').select('id').eq('department', department);
        if (profsErr) return res.status(500).json({ error: 'failed fetching profiles for dept', detail: profsErr });
        studentFilter = (profilesInDept || []).map(p => p.id);
      } else {
        return res.status(400).json({ error: 'assignStudents requires department or (department + year + section)' });
      }

      if (studentFilter && studentFilter.length > 0) {
        results.studentsMatched = studentFilter.length;
        // Only update students where advisor_id IS NULL to avoid overwriting existing advisors
        const { data: toUpdate, error: getToUpdateErr } = await supabase.from('students').select('id').in('id', studentFilter).is('advisor_id', null);
        if (getToUpdateErr) return res.status(500).json({ error: 'failed fetching students to update', detail: getToUpdateErr });
        const idsToUpdate = (toUpdate || []).map(s => s.id);
        results.matchedStudentIds = idsToUpdate;
        if (idsToUpdate.length > 0) {
          const { data: updData, error: updErr } = await supabase.from('students').update({ advisor_id }).in('id', idsToUpdate).select();
          if (updErr) return res.status(500).json({ error: 'failed updating students', detail: updErr });
          results.studentsUpdated = updData?.length || 0;
        }
      }
    }

    return res.json({ ok: true, advisor: advisorProfile, results });
  } catch (err) {
    console.error('[API /repair-advisor] unexpected', err);
    return res.status(500).json({ error: 'unexpected', detail: String(err) });
  }
});

// POST /assign-advisors-by-class
// body: { force?: boolean, advisor_id?: string, department?: string, year?: number, section?: string }
// If advisor_id provided, will assign that advisor to students matching year/section/department.
// Otherwise, iterates all staff rows with staff_role='advisor' and year/section set and assigns them to matching students.
app.post('/assign-advisors-by-class', async (req, res) => {
  try {
    const { force = false, advisor_id, department, year, section } = req.body || {};

    const results = [];

    // helper to handle a single advisor
    const handleAdvisor = async (advId, advDept, advYear, advSection) => {
      const summary = { advisor_id: advId, department: advDept, year: advYear, section: advSection, matched: 0, updated: 0 };

      // find students by year/section
      const { data: studentsByClass, error: classErr } = await supabase
        .from('students')
        .select('id, advisor_id')
        .eq('year', advYear)
        .eq('section', String(advSection).toUpperCase());
      if (classErr) throw classErr;
      const ids = (studentsByClass || []).map(s => s.id);
      if (ids.length === 0) {
        return summary;
      }

      // filter by profile.department
      const { data: profilesInDept, error: profErr } = await supabase
        .from('profiles')
        .select('id')
        .in('id', ids)
        .eq('department', advDept || department || null);
      if (profErr) throw profErr;
      const idsToConsider = (profilesInDept || []).map(p => p.id);
      summary.matched = idsToConsider.length;
      if (idsToConsider.length === 0) return summary;

      // determine which students to update
      let idsToUpdate = [];
      if (force) {
        idsToUpdate = idsToConsider;
      } else {
        // only update where advisor_id IS NULL
        const { data: toUpdate, error: toUpdateErr } = await supabase
          .from('students')
          .select('id')
          .in('id', idsToConsider)
          .is('advisor_id', null);
        if (toUpdateErr) throw toUpdateErr;
        idsToUpdate = (toUpdate || []).map(s => s.id);
      }

      if (idsToUpdate.length === 0) return summary;

      const { data: updRes, error: updErr } = await supabase
        .from('students')
        .update({ advisor_id: advId })
        .in('id', idsToUpdate)
        .select();
      if (updErr) throw updErr;

      summary.updated = updRes?.length || 0;
      return summary;
    };

    if (advisor_id) {
      // single advisor run
      const { data: prof, error: profErr } = await supabase.from('profiles').select('department').eq('id', advisor_id).maybeSingle();
      if (profErr) return res.status(500).json({ error: 'failed fetching advisor profile', detail: profErr });
      const advDept = prof?.department || department || null;
      if (!year || !section) return res.status(400).json({ error: 'year and section are required when providing advisor_id' });
      const summary = await handleAdvisor(advisor_id, advDept, parseInt(year), String(section).toUpperCase());
      return res.json({ ok: true, results: [summary] });
    }

    // iterate advisors with year/section set
    const { data: advisors, error: advisorsErr } = await supabase.from('staff').select('id, staff_role, year, section').eq('staff_role', 'advisor');
    if (advisorsErr) return res.status(500).json({ error: 'failed fetching advisors', detail: advisorsErr });

    for (const adv of advisors || []) {
      if (!adv.year || !adv.section) continue;
      // get advisor profile department
      const { data: p, error: pErr } = await supabase.from('profiles').select('department').eq('id', adv.id).maybeSingle();
      if (pErr) return res.status(500).json({ error: 'failed fetching profile for advisor', detail: pErr });
      const advDept = p?.department || null;
      // If a department filter was provided, skip advisors not in that department
      if (department && advDept !== department) continue;
      const summary = await handleAdvisor(adv.id, advDept, adv.year, adv.section);
      results.push(summary);
    }

    return res.json({ ok: true, results });
  } catch (err) {
    console.error('[API /assign-advisors-by-class] unexpected', err);
    return res.status(500).json({ error: 'unexpected', detail: String(err) });
  }
});

// POST /delete-feedback-form
// body: { id, requested_by }
// Deletes a feedback form and its related questions/responses. Only the form creator or a HOD may delete.
app.post('/delete-feedback-form', async (req, res) => {
  try {
    const { id, requested_by } = req.body || {};
    if (!id) return res.status(400).json({ error: 'id is required' });
    if (!requested_by) return res.status(400).json({ error: 'requested_by is required' });

    // confirm form exists and who created it
    const { data: formRow, error: formErr } = await supabase.from('feedback_forms').select('id, created_by').eq('id', id).maybeSingle();
    if (formErr) return res.status(500).json({ error: 'failed fetching form', detail: formErr });
    if (!formRow) return res.status(404).json({ error: 'form not found' });

    // allow deletion if requester is creator or has role 'hod'
    if (formRow.created_by !== requested_by) {
      const { data: prof, error: profErr } = await supabase.from('profiles').select('role').eq('id', requested_by).maybeSingle();
      if (profErr) return res.status(500).json({ error: 'failed fetching requester profile', detail: profErr });
      if (!prof || prof.role !== 'hod') return res.status(403).json({ error: 'only form creator or HOD may delete this form' });
    }

    // delete dependent rows first
    const respDel = await supabase.from('feedback_responses').delete().eq('form_id', id);
    if (respDel?.error) console.warn('[API /delete-feedback-form] error deleting responses', respDel.error);

    const qDel = await supabase.from('feedback_questions').delete().eq('form_id', id);
    if (qDel?.error) console.warn('[API /delete-feedback-form] error deleting questions', qDel.error);

    const fDel = await supabase.from('feedback_forms').delete().eq('id', id);
    if (fDel?.error) {
      console.error('[API /delete-feedback-form] error deleting form', fDel.error);
      return res.status(500).json({ error: 'failed deleting form', detail: fDel.error });
    }

    return res.json({ ok: true, deleted: { responses: respDel.data, questions: qDel.data, form: fDel.data } });
  } catch (err) {
    console.error('[API /delete-feedback-form] unexpected', err);
    return res.status(500).json({ error: 'unexpected', detail: String(err) });
  }
});
