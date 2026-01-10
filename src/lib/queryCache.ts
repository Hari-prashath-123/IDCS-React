// Advanced query caching with automatic invalidation and persistence
import { supabase } from './supabase';

interface CacheEntry<T> {
  data: T;
  timestamp: number;
  expiresAt: number;
}

interface QueryOptions {
  ttl?: number; // Time to live in milliseconds
  key: string;
  fetchFn: () => Promise<any>;
  staleTime?: number; // Time before data is considered stale
  enabled?: boolean;
}

class QueryCache {
  private cache = new Map<string, CacheEntry<any>>();
  private pendingQueries = new Map<string, Promise<any>>();
  private listeners = new Map<string, Set<(data: any) => void>>();
  
  // Default TTL: 5 minutes
  private readonly DEFAULT_TTL = 5 * 60 * 1000;
  
  constructor() {
    // Load persisted cache from sessionStorage on init
    this.loadFromSession();
    
    // Clean up expired entries every minute
    setInterval(() => this.cleanup(), 60 * 1000);
  }

  private loadFromSession() {
    try {
      const stored = sessionStorage.getItem('queryCache');
      if (stored) {
        const parsed = JSON.parse(stored);
        const now = Date.now();
        
        // Only restore non-expired entries
        Object.entries(parsed).forEach(([key, entry]: [string, any]) => {
          if (entry.expiresAt > now) {
            this.cache.set(key, entry);
          }
        });
      }
    } catch (e) {
      console.debug('Failed to load query cache from session:', e);
    }
  }

  private saveToSession() {
    try {
      const obj: Record<string, any> = {};
      this.cache.forEach((value, key) => {
        obj[key] = value;
      });
      sessionStorage.setItem('queryCache', JSON.stringify(obj));
    } catch (e) {
      console.debug('Failed to save query cache to session:', e);
    }
  }

  private cleanup() {
    const now = Date.now();
    let changed = false;
    
    this.cache.forEach((entry, key) => {
      if (entry.expiresAt < now) {
        this.cache.delete(key);
        changed = true;
      }
    });
    
    if (changed) {
      this.saveToSession();
    }
  }

  async query<T>(options: QueryOptions): Promise<T> {
    const { key, fetchFn, ttl = this.DEFAULT_TTL, staleTime = 0 } = options;
    const now = Date.now();

    // Check cache
    const cached = this.cache.get(key);
    if (cached && cached.expiresAt > now) {
      // If stale time passed, fetch in background but return cached data
      if (staleTime > 0 && now - cached.timestamp > staleTime) {
        this.fetchAndUpdate(key, fetchFn, ttl).catch(() => {});
      }
      return cached.data as T;
    }

    // Check if already fetching
    if (this.pendingQueries.has(key)) {
      return this.pendingQueries.get(key)! as Promise<T>;
    }

    // Fetch new data
    const promise = this.fetchAndUpdate(key, fetchFn, ttl);
    this.pendingQueries.set(key, promise);

    try {
      const data = await promise;
      return data;
    } finally {
      this.pendingQueries.delete(key);
    }
  }

  private async fetchAndUpdate<T>(key: string, fetchFn: () => Promise<T>, ttl: number): Promise<T> {
    try {
      const data = await fetchFn();
      const now = Date.now();
      
      this.cache.set(key, {
        data,
        timestamp: now,
        expiresAt: now + ttl,
      });
      
      this.saveToSession();
      this.notifyListeners(key, data);
      
      return data;
    } catch (error) {
      // On error, return stale data if available
      const cached = this.cache.get(key);
      if (cached) {
        console.debug(`Query ${key} failed, returning stale data`);
        return cached.data as T;
      }
      throw error;
    }
  }

  // Invalidate specific key
  invalidate(key: string | string[]) {
    const keys = Array.isArray(key) ? key : [key];
    keys.forEach(k => {
      this.cache.delete(k);
      this.pendingQueries.delete(k);
    });
    this.saveToSession();
  }

  // Invalidate by pattern
  invalidatePattern(pattern: RegExp) {
    const keysToDelete: string[] = [];
    this.cache.forEach((_, key) => {
      if (pattern.test(key)) {
        keysToDelete.push(key);
      }
    });
    keysToDelete.forEach(k => this.cache.delete(k));
    this.saveToSession();
  }

  // Subscribe to changes
  subscribe(key: string, callback: (data: any) => void) {
    if (!this.listeners.has(key)) {
      this.listeners.set(key, new Set());
    }
    this.listeners.get(key)!.add(callback);

    // Return unsubscribe function
    return () => {
      const listeners = this.listeners.get(key);
      if (listeners) {
        listeners.delete(callback);
        if (listeners.size === 0) {
          this.listeners.delete(key);
        }
      }
    };
  }

  private notifyListeners(key: string, data: any) {
    const listeners = this.listeners.get(key);
    if (listeners) {
      listeners.forEach(callback => callback(data));
    }
  }

  // Get cached data without fetching
  getCached<T>(key: string): T | null {
    const cached = this.cache.get(key);
    if (cached && cached.expiresAt > Date.now()) {
      return cached.data as T;
    }
    return null;
  }

  // Clear all cache
  clear() {
    this.cache.clear();
    this.pendingQueries.clear();
    sessionStorage.removeItem('queryCache');
  }

  // Prefetch data
  async prefetch<T>(key: string, fetchFn: () => Promise<T>, ttl?: number): Promise<void> {
    await this.query({ key, fetchFn, ttl });
  }
}

// Singleton instance
export const queryCache = new QueryCache();

// React hook for using cached queries
export function useCachedQuery<T>(options: QueryOptions & { enabled?: boolean }) {
  const [data, setData] = React.useState<T | null>(() => 
    queryCache.getCached<T>(options.key)
  );
  const [loading, setLoading] = React.useState(!data);
  const [error, setError] = React.useState<Error | null>(null);

  React.useEffect(() => {
    if (options.enabled === false) return;

    let mounted = true;

    const fetchData = async () => {
      try {
        setLoading(true);
        const result = await queryCache.query<T>(options);
        if (mounted) {
          setData(result);
          setError(null);
        }
      } catch (err) {
        if (mounted) {
          setError(err as Error);
        }
      } finally {
        if (mounted) {
          setLoading(false);
        }
      }
    };

    fetchData();

    // Subscribe to updates
    const unsubscribe = queryCache.subscribe(options.key, (newData) => {
      if (mounted) {
        setData(newData);
      }
    });

    return () => {
      mounted = false;
      unsubscribe();
    };
  }, [options.key, options.enabled]);

  const refetch = React.useCallback(async () => {
    queryCache.invalidate(options.key);
    try {
      setLoading(true);
      const result = await queryCache.query<T>(options);
      setData(result);
      setError(null);
    } catch (err) {
      setError(err as Error);
    } finally {
      setLoading(false);
    }
  }, [options.key]);

  return { data, loading, error, refetch };
}

// Common query keys
export const QueryKeys = {
  profile: (userId: string) => `profile:${userId}`,
  students: (filters?: string) => `students${filters ? `:${filters}` : ''}`,
  staff: (filters?: string) => `staff${filters ? `:${filters}` : ''}`,
  applications: (type: string, userId?: string) => `applications:${type}${userId ? `:${userId}` : ''}`,
  approvals: (type: string, userId?: string) => `approvals:${type}${userId ? `:${userId}` : ''}`,
  attendance: (studentId: string, date?: string) => `attendance:${studentId}${date ? `:${date}` : ''}`,
  subjects: (filters?: string) => `subjects${filters ? `:${filters}` : ''}`,
  departments: () => 'departments',
  notices: (userId?: string) => `notices${userId ? `:${userId}` : ''}`,
  dashboard: (role: string, userId: string) => `dashboard:${role}:${userId}`,
};

// Auto-invalidation on mutations
export function setupAutoInvalidation() {
  // Invalidate applications when approvals change
  const channels: any[] = [];

  ['od_applications', 'leave_applications', 'gatepass_applications', 'bonafide_applications'].forEach(table => {
    const channel = supabase.channel(`cache-invalidation-${table}`)
      .on('postgres_changes', { event: '*', schema: 'public', table }, () => {
        const type = table.replace('_applications', '');
        queryCache.invalidatePattern(new RegExp(`^applications:${type}`));
      })
      .subscribe();
    channels.push(channel);
  });

  ['od_approvals', 'leave_approvals', 'gatepass_approvals', 'bonafide_approvals'].forEach(table => {
    const channel = supabase.channel(`cache-invalidation-${table}`)
      .on('postgres_changes', { event: '*', schema: 'public', table }, () => {
        const type = table.replace('_approvals', '');
        queryCache.invalidatePattern(new RegExp(`^(applications|approvals):${type}`));
      })
      .subscribe();
    channels.push(channel);
  });

  // Invalidate students/staff on changes
  const studentsChannel = supabase.channel('cache-invalidation-students')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'students' }, () => {
      queryCache.invalidatePattern(/^students/);
    })
    .subscribe();
  channels.push(studentsChannel);

  const staffChannel = supabase.channel('cache-invalidation-staff')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'staff' }, () => {
      queryCache.invalidatePattern(/^staff/);
    })
    .subscribe();
  channels.push(staffChannel);

  return () => {
    channels.forEach(ch => ch.unsubscribe());
  };
}

// Add React import at top
import React from 'react';
