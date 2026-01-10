import { useState, useEffect, useCallback } from 'react';
import { cache, CACHE_TTL } from '../lib/cache';

interface UseCachedDataOptions<T> {
  cacheKey: string;
  fetchFn: () => Promise<T>;
  ttl?: number;
  enabled?: boolean;
  dependencies?: any[];
}

interface UseCachedDataReturn<T> {
  data: T | null;
  loading: boolean;
  error: Error | null;
  refetch: () => Promise<void>;
}

/**
 * Custom hook for fetching data with automatic caching
 * Usage:
 * 
 * const { data, loading, error, refetch } = useCachedData({
 *   cacheKey: 'students_all',
 *   fetchFn: async () => {
 *     const { data } = await supabase.from('students').select('*');
 *     return data;
 *   },
 *   ttl: CACHE_TTL.MEDIUM
 * });
 */
export function useCachedData<T>({
  cacheKey,
  fetchFn,
  ttl = CACHE_TTL.MEDIUM,
  enabled = true,
  dependencies = []
}: UseCachedDataOptions<T>): UseCachedDataReturn<T> {
  const [data, setData] = useState<T | null>(() => {
    // Try to load from cache immediately
    return cache.get<T>(cacheKey);
  });
  const [loading, setLoading] = useState<boolean>(!data);
  const [error, setError] = useState<Error | null>(null);

  const fetchData = useCallback(async (skipCache: boolean = false) => {
    if (!enabled) return;

    try {
      setLoading(true);
      setError(null);

      // Check cache first unless explicitly skipping
      if (!skipCache) {
        const cached = cache.get<T>(cacheKey);
        if (cached) {
          setData(cached);
          setLoading(false);
          return;
        }
      }

      // Fetch fresh data
      const result = await fetchFn();
      
      // Store in cache
      cache.set(cacheKey, result, ttl);
      
      setData(result);
    } catch (err) {
      console.error('Error fetching data:', err);
      setError(err as Error);
    } finally {
      setLoading(false);
    }
  }, [cacheKey, fetchFn, ttl, enabled]);

  const refetch = useCallback(async () => {
    await fetchData(true); // Skip cache on manual refetch
  }, [fetchData]);

  useEffect(() => {
    fetchData();
  }, [fetchData, ...dependencies]);

  return { data, loading, error, refetch };
}

/**
 * Batch fetch multiple related data sources in parallel with caching
 */
export async function batchFetchWithCache<T>(
  fetches: Array<{
    cacheKey: string;
    fetchFn: () => Promise<T>;
    ttl?: number;
  }>
): Promise<T[]> {
  const results = await Promise.all(
    fetches.map(async ({ cacheKey, fetchFn, ttl = CACHE_TTL.MEDIUM }) => {
      // Check cache first
      const cached = cache.get<T>(cacheKey);
      if (cached) {
        return cached;
      }

      // Fetch and cache
      const result = await fetchFn();
      cache.set(cacheKey, result, ttl);
      return result;
    })
  );

  return results;
}
