import { supabase } from './supabase';

export interface CreateUserData {
  email: string;
  password: string;
  name: string;
  role: string;
  department: string;
  phone?: string;
  // Student fields
  year?: number;
  section?: string;
  reg_no?: string;
  roll_no?: string;
  // Staff fields
  staff_id?: string;
  staff_role?: string;
}

export async function createUser(userData: CreateUserData) {
  const { data: { session } } = await supabase.auth.getSession();
  
  if (!session) {
    throw new Error('Not authenticated');
  }

  console.log('Sending to Edge Function:', userData);

  try {
    // Use native fetch to get more detailed error info
    const response = await fetch(
      `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/manage-users`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${session.access_token}`,
          'Content-Type': 'application/json',
          'apikey': import.meta.env.VITE_SUPABASE_ANON_KEY
        },
        body: JSON.stringify(userData)
      }
    );

    const responseText = await response.text();
    console.log('Raw response:', { status: response.status, body: responseText });

    if (!response.ok) {
      let errorMessage = 'Failed to create user';
      try {
        const errorData = JSON.parse(responseText);
        errorMessage = errorData.error || errorMessage;
      } catch {
        errorMessage = responseText || errorMessage;
      }
      throw new Error(errorMessage);
    }

    const data = JSON.parse(responseText);
    
    if (!data?.success) {
      throw new Error(data?.error || 'Edge Function returned unexpected response');
    }

    return data;
  } catch (err: any) {
    console.error('Error in createUser:', err);
    throw err;
  }
}

export async function createBulkUsers(users: CreateUserData[]) {
  const results = [];
  const errors = [];

  for (const userData of users) {
    try {
      const result = await createUser(userData);
      results.push({ success: true, user: userData.email, data: result });
    } catch (error) {
      errors.push({ success: false, user: userData.email, error: error.message });
    }
  }

  return { results, errors };
}
