import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('Missing Supabase environment variables');
}

// In development, route Supabase requests through the Vite dev server proxy
// to avoid CORS issues. The proxy rewrites `/supabase-auth/*` -> `/auth/v1/*`
// and `/supabase-rest/*` -> `/rest/v1/*` (see `vite.config.ts`). To make the
// Supabase client use those proxied endpoints, we provide a custom `fetch`
// implementation that rewrites requests targeting the Supabase host to the
// appropriate proxied relative path when running in dev.
const shouldUseProxy = Boolean(import.meta.env.DEV);

const proxyAwareFetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
  try {
    const nativeFetch = window.fetch.bind(window);
    let urlStr: string | null = null;
    if (typeof input === 'string') urlStr = input;
    else if (input instanceof URL) urlStr = input.href;
    else urlStr = (input as Request).url;

    if (shouldUseProxy && urlStr && supabaseUrl && urlStr.startsWith(supabaseUrl)) {
      // Strip the supabaseUrl prefix to get the path (e.g. "/auth/v1/user" or "/rest/v1/profiles?...")
      const path = urlStr.slice(supabaseUrl.length);
      let proxied: string;

      if (path.startsWith('/auth')) {
        // remove any leading /auth or /auth/v1 so proxy rewrite doesn't duplicate
        const dest = path.replace(/^\/auth(\/v1)?/, '');
        proxied = `/supabase-auth${dest}`;
      } else if (path.startsWith('/rest')) {
        const dest = path.replace(/^\/rest(\/v1)?/, '');
        proxied = `/supabase-rest${dest}`;
      } else if (path.startsWith('/storage')) {
        // Storage endpoints live under /storage/v1; route them via a dedicated
        // proxy prefix to avoid being rewritten as /rest/v1/storage/...
        const dest = path.replace(/^\/storage(\/v1)?/, '');
        proxied = `/supabase-storage${dest}`;
      } else if (path.startsWith('/functions')) {
        // Edge Functions: call production directly (no local Docker needed)
        console.debug('[supabase proxy] Edge Function call - using production', urlStr);
        return nativeFetch(input, init);
      } else {
        // default: send to rest proxy
        const dest = path.replace(/^\//, '');
        proxied = `/supabase-rest/${dest}`;
      }

      // Debug: log proxy rewrites in dev console so we can verify behavior
      if (import.meta.env.DEV) console.debug('[supabase proxy] rewrite', urlStr, '->', proxied);

      // Preserve and merge headers from the original request (or init) and
      // ensure the Supabase anon key is present so the proxied dev server
      // forwards the request to Supabase with proper auth. Supabase REST
      // requires the `apikey` header and usually `Authorization: Bearer <key>`.
      const origHeaders = new Headers(init?.headers ?? (typeof input === 'string' ? {} : (input as Request).headers));
      if (!origHeaders.has('apikey')) origHeaders.set('apikey', supabaseAnonKey as string);
      if (!origHeaders.has('Authorization')) origHeaders.set('Authorization', `Bearer ${supabaseAnonKey}`);

      const method = init?.method ?? (typeof input === 'string' ? 'GET' : (input as Request).method);
      const newInit: RequestInit = { ...(init || {}), method, headers: origHeaders };

      // Add connection keep-alive and timeout settings
      const fetchInit: RequestInit = {
        ...newInit,
        keepalive: true,
        signal: init?.signal || AbortSignal.timeout(30000), // 30 second timeout
      };

      // Execute the proxied request but capture response details for debugging
      try {
        const resp = await nativeFetch(proxied, fetchInit);
        if (import.meta.env.DEV && resp.status >= 400) {
          try {
            const text = await resp.clone().text();
            console.error('[supabase proxy] proxied request failed', proxied, 'status=', resp.status, 'body=', text);
          } catch (e) {
            console.error('[supabase proxy] failed to read proxied error body', e);
          }
        }
        return resp;
      } catch (e: any) {
        // Network-level failure when contacting the proxied target
        console.error('[supabase proxy] network error contacting proxied target', proxied, e.message || e);
        throw e;
      }
    }

    if (import.meta.env.DEV) console.debug('[supabase proxy] no rewrite for', urlStr || input);
    return nativeFetch(input, init);
  } catch (e) {
    // surface network errors as normal fetch would
    throw e;
  }
};

// Create the client using the proxy-aware fetch in dev, and default fetch in prod
export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  global: {
    fetch: proxyAwareFetch,
  },
  db: {
    schema: 'public',
  },
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
  // Add realtime configuration for better connection management
  realtime: {
    params: {
      eventsPerSecond: 10,
    },
  },
});

// Export retry utilities for use with Supabase queries
export { withRetry, withRetryBatch } from './supabaseRetry';

export type UserRole = 'student' | 'staff' | 'ahod' | 'hod' | 'admin' | 'ps' | 'principal' | 'notice';

export type ApplicationType = 'od' | 'leave' | 'gatepass' | 'bonafide';

export type ApplicationStatus = 'pending' | 'approved' | 'rejected';

export type ApproverLevel = 'mentor' | 'advisor' | 'ahod' | 'hod' | 'completed';

export interface Profile {
  id: string;
  email: string;
  role: UserRole;
  name: string;
  dob: string;
  department: string;
  created_at: string;
  updated_at: string;
  gender?: string | null;
  address?: string | null;
  city?: string | null;
  state?: string | null;
  degree?: string | null;
  course_name?: string | null;
  college?: string | null;
  father_name?: string | null;
  mother_name?: string | null;
  is_department_admin?: boolean;
  department_admin_for?: string | null;
  phone_number?: string | null;
}

export interface Student {
  id: string;
  reg_no: string;
  roll_no: string;
  year: number;
  section: string;
  mentor_id: string;
  advisor_id: string;
  ahod_id: string;
  hod_id: string;
  department?: string | null;
  dob?: string | null;
  fathers_name?: string | null;
  mothers_name?: string | null;
  father_number?: string | null;
  mother_number?: string | null;
  phone_number?: string | null;
  community?: string | null;
  residence?: string | null;
  college_bus?: boolean | null;
  management?: boolean | null;
  first_graduate?: boolean | null;
}

export interface Staff {
  id: string;
  staff_id: string;
  staff_role: 'mentor' | 'advisor' | 'lecturer';
  year: number | null;
  section: string | null;
  ahod_id: string;
  hod_id: string;
}

export interface Application {
  id: string;
  student_id: string;
  reason: string;
  from_date: string;
  to_date: string;
  attachment_url: string | null;
  status: ApplicationStatus;
  current_approver_level: ApproverLevel;
  created_at: string;
  updated_at: string;
}

// OD Application (On-Duty)
export interface ODApplication extends Application {
  subject: string;
  body: string;
}

// Leave Application
export interface LeaveApplication extends Application {
  subject: string;
  body: string;
}

// Gatepass Application
export interface GatepassApplication extends Application {
  subject: string;
}

// Bonafide Application
export interface BonafideApplication extends Application {
  purpose: string | null;
  fathers_name: string | null;
  branch: string | null;
  community: string | null;
  study_mode: string | null;
  bus_option: string | null;
  bus_fare: number | null;
  funding: string | null;
  first_graduate: string | null;
  metadata: any;
}

// Union type for all application types
export type AnyApplication = ODApplication | LeaveApplication | GatepassApplication | BonafideApplication;

// Helper function to get table name based on application type
export function getApplicationTableName(type: ApplicationType): string {
  const tableMap: Record<ApplicationType, string> = {
    'od': 'od_applications',
    'leave': 'leave_applications',
    'gatepass': 'gatepass_applications',
    'bonafide': 'bonafide_applications'
  };
  return tableMap[type];
}

// Helper function to get approvals table name based on application type
export function getApprovalsTableName(type: ApplicationType): string {
  const tableMap: Record<ApplicationType, string> = {
    'od': 'od_approvals',
    'leave': 'leave_approvals',
    'gatepass': 'gatepass_approvals',
    'bonafide': 'bonafide_approvals'
  };
  return tableMap[type];
}

export interface Approval {
  id: string;
  application_id: string;
  approver_id: string;
  approver_role: ApproverLevel;
  action: 'approved' | 'rejected';
  remarks: string | null;
  created_at: string;
}

export interface Notice {
  id: string;
  title: string;
  content: string;
  created_by: string;
  created_at: string;
  is_active: boolean;
}

export interface Certificate {
  id: string;
  user_id: string;
  description: string | null;
  file_url: string;
  created_at: string;
}
