import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { supabase, Profile, withRetryBatch } from '../lib/supabase';

// Expose supabase client to the browser console in development for debugging RPCs
if (typeof window !== 'undefined' && process.env.NODE_ENV === 'development') {
  // eslint-disable-next-line @typescript-eslint/ban-ts-comment
  // @ts-ignore
  window.supabase = supabase;
}
import { User } from '@supabase/supabase-js';
import { cache, getCacheKey, CACHE_TTL } from '../lib/cache';
import { clearAllCache } from '../lib/cacheInvalidation';

interface AuthContextType {
  user: User | null;
  profile: Profile | null;
  loading: boolean;
  signIn: (identifier: string, password: string) => Promise<Profile | null>;
  signOut: () => Promise<void>;
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

        try {
          const ssKeys: string[] = [];
          for (let i = 0; i < sessionStorage.length; i++) {
            const k = sessionStorage.key(i) || '';
            ssKeys.push(k);
          }
          console.debug('AuthContext: sessionStorage keys', ssKeys);
        } catch (e) {
          console.debug('AuthContext: cannot access sessionStorage', e);
        }
      }
    } catch (e) {
      console.debug('AuthContext: storage inspection failed', e);
    }
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      console.info('AuthContext: getSession returned', !!session);
      try {
        const { data: userData } = await supabase.auth.getUser();
        console.info('AuthContext: auth.getUser returned', !!userData?.user);
        console.info('AuthContext: logged-in user id', userData?.user?.id ?? null);
      } catch (e) {
        console.debug('AuthContext: auth.getUser failed', e);
      }
      setUser(session?.user ?? null);
      if (session?.user) {
        await fetchProfile(session.user.id);
      } else {
        // If Supabase did not return a session, try to recover from storage
        // Check both localStorage and sessionStorage for any keys that contain 'supabase.auth'
        // and attempt to set the session using common token shapes. This is defensive
        // — some mobile browsers partition storage or change UA, producing a reload
        // where `getSession()` may initially return null.
        (async () => {
          try {
            if (typeof window === 'undefined') return;

            const candidates: string[] = [];
            try {
              for (let i = 0; i < localStorage.length; i++) {
                const k = localStorage.key(i) || '';
                if (k.includes('supabase.auth')) candidates.push(k);
              }
            } catch (e) {
              // localStorage access may throw in some browsers/privacy modes
            }

            try {
              for (let i = 0; i < sessionStorage.length; i++) {
                const k = sessionStorage.key(i) || '';
                if (k.includes('supabase.auth')) candidates.push(k);
              }
            } catch (e) {
              // sessionStorage may throw as well
            }

            let restored = null as any;
            for (const key of candidates) {
              try {
                const raw = localStorage.getItem(key) ?? sessionStorage.getItem(key);
                if (!raw) continue;
                let parsed: any = null;
                try {
                  parsed = JSON.parse(raw);
                } catch (e) {
                  // Not JSON — skip
                  continue;
                }

                // Try common shapes:
                // 1) { currentSession: { access_token, refresh_token } }
                // 2) { access_token, refresh_token }
                // 3) nested older forms
                const access = parsed?.currentSession?.access_token || parsed?.access_token || parsed?.currentSession?.accessToken || null;
                const refresh = parsed?.currentSession?.refresh_token || parsed?.refresh_token || parsed?.currentSession?.refreshToken || null;
                if (access && refresh) {
                  // Do not log tokens. Only log presence for debugging.
                  console.info('AuthContext: found stored Supabase auth tokens, attempting restore');
                  const { error: setErr } = await supabase.auth.setSession({ access_token: access, refresh_token: refresh });
                  if (setErr) {
                    console.warn('AuthContext: restore attempt failed:', setErr?.message || setErr);
                    continue;
                  }
                  const { data: { session: s } } = await supabase.auth.getSession();
                  if (s?.user) {
                    restored = s;
                    setUser(s.user);
                    await fetchProfile(s.user.id);
                    break;
                  }
                }
              } catch (e) {
                console.warn('AuthContext: error while attempting to restore session from storage key', key, e);
                continue;
              }
            }

            if (!restored) {
              // No usable token found
              console.info('AuthContext: no stored Supabase session found in storage');
            }
          } finally {
            setLoading(false);
          }
        })();
      }
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      console.info('AuthContext: onAuthStateChange', { event, hasSession: !!session });
      (async () => {
        setUser(session?.user ?? null);
        if (session?.user) {
          await fetchProfile(session.user.id);
        } else {
          setProfile(null);
          setLoading(false);
        }
      })();
    });

    return () => subscription.unsubscribe();
  }, []);

    const refreshProfile = async () => {
      if (!user) return;
      setLoading(true);
      try {
        await fetchProfile(user.id);
      } finally {
        setLoading(false);
      }
    };

  const fetchProfile = async (userId: string): Promise<Profile | null> => {
    try {
      // Check cache first
      const cacheKey = getCacheKey('profile', userId);
      const cachedProfile = cache.get<Profile>(cacheKey);
      
      if (cachedProfile) {
        console.log('Loading profile from cache');
        setProfile(cachedProfile);
        return cachedProfile;
      }

      // Fetch profile and department admin status in parallel with retry logic
      const [profileResult, deptAdminResult] = await withRetryBatch([
        async () => await supabase.from('profiles').select('*').eq('id', userId).maybeSingle(),
        async () => await supabase.from('department_admins').select('department').eq('staff_id', userId).maybeSingle()
      ]);

      if (profileResult.error) throw profileResult.error;
      
      const data = profileResult.data;
      // Attach department admin info if exists
      if (!deptAdminResult.error && deptAdminResult.data) {
        (data as any).is_department_admin = true;
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

        if (sErr) throw sErr;

        if (studentRow) {
          const profileData = Array.isArray(studentRow.profiles)
            ? studentRow.profiles[0]
            : studentRow.profiles;

          if (!profileData || !(profileData as any).email) {
            throw new Error('No email associated with that register number');
          }
          emailToUse = (profileData as any).email;
        } else {
          // Second try: treat identifier as a staff_id and look up the staff table.
          // Try multiple columns commonly used: staff_id or roll_number.
          let staffRow: any = null;
          try {
            const orQuery = `staff_id.eq.${idInput}`;
            console.info('signIn: staff lookup .or query', orQuery);
            const { data: sRow, error: sErr } = await supabase
              .from('staff')
              .select('id, staff_id')
              .or(orQuery)
              .maybeSingle();
            if (sErr) throw sErr;
            staffRow = sRow;
          } catch (e) {
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
