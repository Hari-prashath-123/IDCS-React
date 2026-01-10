// Data caching utility with memory and localStorage support
// Dramatically improves performance by avoiding redundant database queries

interface CacheEntry<T> {
  data: T;
  timestamp: number;
  expiresIn: number; // milliseconds
}

class DataCache {
  private memoryCache: Map<string, CacheEntry<any>> = new Map();
  private readonly DEFAULT_TTL = 5 * 60 * 1000; // 5 minutes
  private readonly STORAGE_PREFIX = 'idcs_cache_';

  /**
   * Get cached data by key
   * Checks memory cache first, then localStorage
   */
  get<T>(key: string): T | null {
    // Check memory cache first (fastest)
    const memoryCached = this.memoryCache.get(key);
    if (memoryCached && Date.now() < memoryCached.timestamp + memoryCached.expiresIn) {
      return memoryCached.data as T;
    }

    // Check localStorage (survives page reloads)
    try {
      const stored = localStorage.getItem(this.STORAGE_PREFIX + key);
      if (stored) {
        const entry: CacheEntry<T> = JSON.parse(stored);
        if (Date.now() < entry.timestamp + entry.expiresIn) {
          // Restore to memory cache
          this.memoryCache.set(key, entry);
          return entry.data;
        } else {
          // Expired, remove it
          localStorage.removeItem(this.STORAGE_PREFIX + key);
        }
      }
    } catch (e) {
      console.warn('Cache read error:', e);
    }

    return null;
  }

  /**
   * Set cache data with optional TTL
   */
  set<T>(key: string, data: T, ttl: number = this.DEFAULT_TTL): void {
    const entry: CacheEntry<T> = {
      data,
      timestamp: Date.now(),
      expiresIn: ttl,
    };

    // Store in memory
    this.memoryCache.set(key, entry);

    // Store in localStorage (async, won't block)
    try {
      localStorage.setItem(this.STORAGE_PREFIX + key, JSON.stringify(entry));
    } catch (e) {
      console.warn('Cache write error (quota exceeded?):', e);
      // If quota exceeded, clear old entries
      this.clearExpired();
    }
  }

  /**
   * Invalidate specific cache key
   */
  invalidate(key: string): void {
    this.memoryCache.delete(key);
    try {
      localStorage.removeItem(this.STORAGE_PREFIX + key);
    } catch (e) {
      console.warn('Cache invalidate error:', e);
    }
  }

  /**
   * Invalidate cache keys matching a pattern
   */
  invalidatePattern(pattern: string): void {
    // Clear from memory
    const keysToDelete: string[] = [];
    this.memoryCache.forEach((_, key) => {
      if (key.includes(pattern)) {
        keysToDelete.push(key);
      }
    });
    keysToDelete.forEach(key => this.memoryCache.delete(key));

    // Clear from localStorage
    try {
      const storageKeys = Object.keys(localStorage);
      storageKeys.forEach(storageKey => {
        if (storageKey.startsWith(this.STORAGE_PREFIX) && storageKey.includes(pattern)) {
          localStorage.removeItem(storageKey);
        }
      });
    } catch (e) {
      console.warn('Cache pattern invalidate error:', e);
    }
  }

  /**
   * Clear all expired entries from both caches
   */
  clearExpired(): void {
    const now = Date.now();

    // Clear from memory
    const expiredKeys: string[] = [];
    this.memoryCache.forEach((entry, key) => {
      if (now >= entry.timestamp + entry.expiresIn) {
        expiredKeys.push(key);
      }
    });
    expiredKeys.forEach(key => this.memoryCache.delete(key));

    // Clear from localStorage
    try {
      const storageKeys = Object.keys(localStorage);
      storageKeys.forEach(storageKey => {
        if (storageKey.startsWith(this.STORAGE_PREFIX)) {
          try {
            const entry = JSON.parse(localStorage.getItem(storageKey) || '');
            if (now >= entry.timestamp + entry.expiresIn) {
              localStorage.removeItem(storageKey);
            }
          } catch (e) {
            // Invalid entry, remove it
            localStorage.removeItem(storageKey);
          }
        }
      });
    } catch (e) {
      console.warn('Clear expired error:', e);
    }
  }

  /**
   * Clear all cache
   */
  clear(): void {
    this.memoryCache.clear();
    try {
      const storageKeys = Object.keys(localStorage);
      storageKeys.forEach(key => {
        if (key.startsWith(this.STORAGE_PREFIX)) {
          localStorage.removeItem(key);
        }
      });
    } catch (e) {
      console.warn('Cache clear error:', e);
    }
  }
}

// Singleton instance
export const cache = new DataCache();

// Helper function to generate cache keys
export function getCacheKey(prefix: string, ...args: any[]): string {
  return `${prefix}_${args.map(a => JSON.stringify(a)).join('_')}`;
}

// Predefined TTL values
export const CACHE_TTL = {
  SHORT: 2 * 60 * 1000,     // 2 minutes - frequently changing data
  MEDIUM: 5 * 60 * 1000,    // 5 minutes - default
  LONG: 15 * 60 * 1000,     // 15 minutes - relatively static data
  VERY_LONG: 60 * 60 * 1000 // 1 hour - rarely changing data
};
