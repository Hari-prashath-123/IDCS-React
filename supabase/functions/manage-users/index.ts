import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.38.0'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

interface CreateUserRequest {
  email: string;
  password: string;
  name: string;
  role: string;
  department: string;
  phone?: string;
  year?: number;
  section?: string;
  reg_no?: string;
  roll_no?: string;
  staff_id?: string;
  staff_role?: string;
  designation?: string;
  qualification?: string;
  hod_id?: string;
  ahod_id?: string;
}

serve(async (req) => {
  // Handle CORS
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    // Initialize Supabase Admin Client
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
      {
        auth: {
          autoRefreshToken: false,
          persistSession: false
        }
      }
    )

    // Verify the requester is an admin
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      throw new Error('No authorization header')
    }

    const token = authHeader.replace('Bearer ', '')
    const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(token)
    
    if (authError || !user) {
      throw new Error('Unauthorized')
    }

    // Check if requester is allowed to create users.
    // Allow: admin, principal, hod, ahod (and HODs in IQAC department)
    const { data: profile } = await supabaseAdmin
      .from('profiles')
      .select('role, department')
      .eq('id', user.id)
      .single()

    const allowedRoles = ['admin', 'principal', 'hod', 'ahod']
    const requesterRole = profile?.role
    const requesterDept = profile?.department

    const isAllowed = allowedRoles.includes(requesterRole) || (requesterRole === 'hod' && requesterDept === 'IQAC')
    if (!isAllowed) {
      throw new Error('Only admins, principal, HODs (and IQAC HOD) can create users')
    }

    // Parse request
    const userData: CreateUserRequest = await req.json()
    const { email, password, name, role, department, phone, year, section, reg_no, roll_no, staff_id, staff_role, designation, qualification, hod_id, ahod_id } = userData

    // Create auth user. If the email is already registered we will try to
    // locate an existing profile with that email and reuse its id so we can
    // attach role-specific records (staff/student) to the existing auth user
    // instead of failing.
    let userId: string | null = null;
    try {
      const { data: authData, error: createError } = await supabaseAdmin.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: {
          name,
          role,
          department
        }
      })

      if (createError) throw createError

      userId = authData.user.id
    } catch (createErr: any) {
      console.warn('createUser returned error, attempting to recover by finding existing profile:', createErr?.message || createErr);
      // Try to find an existing profile that already uses this email and reuse its id
      try {
        const { data: existingProfile, error: findErr } = await supabaseAdmin
          .from('profiles')
          .select('id, role')
          .eq('email', email)
          .limit(1)
          .maybeSingle();

        if (findErr) {
          console.error('Failed to lookup profile by email during create recovery:', findErr);
          throw createErr;
        }

        if (existingProfile && existingProfile.id) {
          userId = existingProfile.id;
        } else {
          // No profile found to reuse — rethrow original create error
          throw createErr;
        }
      } catch (innerErr) {
        throw innerErr;
      }
    }

    // Create or update profile (use upsert so we don't fail if a profile
    // already exists for an existing auth user/email). Do NOT include
    // `designation`/`qualification` here because those columns may not
    // exist in the `profiles` table; staff-specific fields are stored in
    // the `staff` table instead.
    const { error: profileError } = await supabaseAdmin
      .from('profiles')
      .upsert({
        id: userId,
        email,
        name,
        role,
        department
      })

    if (profileError) throw profileError

    // Create role-specific record
    if (role === 'student') {
      if (!reg_no || !roll_no || !year || !section) {
        throw new Error('Students require reg_no, roll_no, year, and section')
      }

      const { error: studentError } = await supabaseAdmin
        .from('students')
        .insert({
          id: userId,
          reg_no,
          roll_no,
          year,
          section
        })

      if (studentError) throw studentError

    } else if (['staff', 'mentor', 'advisor', 'lecturer', 'hod', 'ahod'].includes(role)) {
      // All these roles need a staff record
      if (!staff_id || !staff_role) {
        throw new Error('Staff roles require staff_id and staff_role')
      }

      // Include additional optional fields (department, designation, qualification, hod_id, ahod_id)
      const staffInsertPayload: any = {
        id: userId,
        staff_id,
        staff_role,
        year: year || null,
        section: section || null
      };
      if (department) staffInsertPayload.department = department;
      if (typeof (phone) !== 'undefined') staffInsertPayload.phone = phone;
      if (typeof (designation) !== 'undefined') staffInsertPayload.designation = designation;
      if (typeof (qualification) !== 'undefined') staffInsertPayload.qualification = qualification;
      if (typeof (hod_id) !== 'undefined') staffInsertPayload.hod_id = hod_id;
      if (typeof (ahod_id) !== 'undefined') staffInsertPayload.ahod_id = ahod_id;

      const { error: staffError } = await supabaseAdmin
        .from('staff')
        .upsert(staffInsertPayload)

      if (staffError) {
        console.error('Failed to insert staff record:', staffError);
        throw staffError
      }
      // If creating a HOD or AHOD, update other staff in the same department to point to this HOD/AHOD
      try {
        if (role === 'hod' && department) {
          await supabaseAdmin.from('staff').update({ hod_id: userId }).eq('department', department).neq('id', userId);
        }
        if (role === 'ahod' && department) {
          await supabaseAdmin.from('staff').update({ ahod_id: userId }).eq('department', department).neq('id', userId);
        }
      } catch (e) {
        console.warn('Failed to propagate HOD/AHOD to department staff', e);
      }
    }

    return new Response(
      JSON.stringify({ 
        success: true, 
        user: { id: userId, email, name, role } 
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )

  } catch (error) {
    console.error('Error creating user:', error)
    return new Response(
      JSON.stringify({ error: error.message }),
      { 
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    )
  }
})
