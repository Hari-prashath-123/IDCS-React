import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { supabase, Profile, withRetryBatch } from '../lib/supabase';

// Expose supabase client to the browser console in development for debugging RPCs
if (typeof window !== 'undefined' && process.env.NODE_ENV === 'development') {
  // eslint-disable-next-line @typescript-eslint/ban-ts-comment
  import authService from '../lib/authService';
  import type { User } from '../lib/apiTypes';
  window.supabase = supabase;
}
    user: User | null;
    loading: boolean;
    signIn: (identifier: string, password: string) => Promise<User | null>;
    signOut: () => void;
    refreshProfile: () => Promise<User | null | void>;
  profile: Profile | null;
  loading: boolean;
  signIn: (identifier: string, password: string) => Promise<Profile | null>;
  refreshProfile: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    console.info('AuthContext: initializing auth effect');
    try {
      if (typeof window !== 'undefined') {
        try {
          const lsKeys: string[] = [];
          for (let i = 0; i < localStorage.length; i++) {
            const k = localStorage.key(i) || '';
            lsKeys.push(k);
          }
          console.debug('AuthContext: localStorage keys', lsKeys);
        } catch (e) {
          console.debug('AuthContext: cannot access localStorage', e);
        }

                continue;
      console.info('AuthContext: onAuthStateChange', { event, hasSession: !!session });
        (data as any).department_admin_for = deptAdminResult.data.department;
      }
      
      // Cache the profile
      cache.set(cacheKey, data as Profile, CACHE_TTL.LONG);
      
      setProfile(data);
      console.log('Profile loaded:', data?.role, data?.department);
      return data;
    } catch (error) {
      console.error('Error fetching profile:', error);
      return null;
    }
  };

  const signIn = async (identifier: string, password: string) => {
    try {
      setLoading(true);
      // Accept either an email address or a register number (reg_no) or staff id.
      const idInput = identifier?.toString().trim();
      if (!idInput) throw new Error('Identifier is empty');
      let emailToUse = identifier;
      if (!idInput.includes('@')) {
        console.info('signIn: lookup by identifier (trimmed)', idInput);
        // First try: treat as reg_no — find corresponding profile email
        const { data: studentRow, error: sErr } = await supabase
          .from('students')
          .select('id, profiles!students_id_fkey(email)')
          .eq('reg_no', idInput)
          .maybeSingle();
    const signOut = () => {
      try {
        setUser(null);
        authService.logout();
      } catch (e) {
        console.error('Error in signOut:', e);
        setUser(null);
      }
    };
            console.warn('staff lookup by or(...) failed, trying direct eq', e);
            const { data: sRow2, error: sErr2 } = await supabase
              .from('staff')
              .select('id, staff_id')
              .eq('staff_id', idInput);
            if (sErr2) throw sErr2;
            staffRow = (sRow2 && sRow2.length > 0) ? sRow2[0] : null;
          }

          console.info('signIn: staffRow result', staffRow);
          if (staffRow && staffRow.id) {
            // staff.id typically maps to profiles.id (profile row for that staff)
            const { data: profileRow, error: profErr } = await supabase
              .from('profiles')
              .select('id, email')
              .eq('id', staffRow.id)
              .maybeSingle();

            if (profErr) throw profErr;
            console.info('signIn: profileRow for staff', profileRow);
            if (profileRow && (profileRow as any).email) {
              emailToUse = (profileRow as any).email;
            } else {
              throw new Error('No email associated with that staff id');
            }
          } else {
            // As a fallback, try the admin API which uses the service role key and bypasses RLS.
            // Try both a relative path (if proxied) and localhost:7888 which is the default dev port.
            try {
              const tryUrls = [`/resolve-email-by-staff?staff_id=${encodeURIComponent(idInput)}`, `http://localhost:7888/resolve-email-by-staff?staff_id=${encodeURIComponent(idInput)}`];
              let resolvedEmail: string | null = null;
              // If a dev admin token is available in Vite env, include it in the header.
              const adminToken = typeof import.meta !== 'undefined' && (import.meta as any).env && (import.meta as any).env.VITE_ADMIN_TOKEN
                ? (import.meta as any).env.VITE_ADMIN_TOKEN
                : null;

              for (const url of tryUrls) {
                try {
                  console.info('signIn: attempting admin API fallback', url);
                  const fetchOpts: RequestInit = { method: 'GET' };
                  if (adminToken) {
                    fetchOpts.headers = { 'x-admin-token': String(adminToken) };
                    console.info('signIn: including VITE_ADMIN_TOKEN in admin API call (dev only)');
                  }
                      // First try calling a DB RPC (recommended): rpc_resolve_email_by_staff
                      try {
                        const { data: rpcData, error: rpcErr } = await supabase.rpc('rpc_resolve_email_by_staff', { p_staff_id: idInput });
                        if (!rpcErr && rpcData) {
                          // rpc returns scalar email (text)
                          resolvedEmail = rpcData as unknown as string;
                          console.info('signIn: resolved email via RPC', resolvedEmail);
                          break;
                        }
                      } catch (e) {
                        // ignore rpc failure and fall back to HTTP admin API
                        console.debug('signIn: rpc resolve call failed (will try admin API)', e);
                      }

                      const resp = await fetch(url, fetchOpts);
                      if (!resp.ok) {
                        console.warn('signIn: admin API fallback returned non-ok', url, resp.status);
                        continue;
                      }
                      const j = await resp.json();
                      if (j && j.ok && j.email) {
                        resolvedEmail = j.email;
                        break;
                      }
                } catch (e) {
                  console.debug('signIn: admin API call failed for', url, e);
                  continue;
                }
              }

              if (resolvedEmail) {
                console.info('signIn: resolved email via admin API', resolvedEmail);
                emailToUse = resolvedEmail;
              } else {
                throw new Error('No account found for that register number or staff id');
              }
            } catch (e) {
              throw new Error('No account found for that register number or staff id');
            }
          }
        }
      }

      const { data, error } = await supabase.auth.signInWithPassword({
        email: emailToUse,
        password,
      });
      if (error) {
        // If the auth service returned the upstream DB error, surface a clearer message
        try {
          const msg = (error as any)?.message || '';
          if (msg.includes('Database error querying schema') || msg.includes('unexpected_failure')) {
            console.error('Auth service returned database error:', error);
            throw new Error('Authentication service unavailable (database error). Please contact the project administrator or Supabase support.');
          }
        } catch (e) {
          // fall through to throw original
        }
        throw error;
      }

      const userFromData = data?.user ?? null;
      setUser(userFromData);
      if (userFromData) {
        // ensure profile is loaded before returning so callers can navigate safely
        const loadedProfile = await fetchProfile(userFromData.id);
        console.log('signIn completed, profile loaded:', loadedProfile?.role, loadedProfile?.department);
        // Return the loaded profile for immediate use
        setLoading(false);
        return loadedProfile;
      } else {
        setLoading(false);
        return null;
      }
    } catch (err) {
      setLoading(false);
      throw err;
    }
  };

  const signOut = async () => {
    try {
      // Clear state immediately for faster UI response
      setUser(null);
      setProfile(null);
      
      // Clear all cached data on logout
      clearAllCache();
      
      const { error } = await supabase.auth.signOut();
      if (error) throw error;
      
      // Additional cleanup for Edge browser
      if (typeof window !== 'undefined' && navigator.userAgent.includes('Edg')) {
        // Clear any cached auth data
        localStorage.removeItem('supabase.auth.token');
        sessionStorage.clear();
      }
    } catch (error) {
      console.error('Error in signOut:', error);
      // Even if signOut fails, clear local state
      setUser(null);
      setProfile(null);
      throw error;
    }
  };

  return (
    <AuthContext.Provider value={{ user, profile, loading, signIn, signOut, refreshProfile }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
