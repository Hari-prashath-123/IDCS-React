// Automatic retry logic for Supabase queries to handle ECONNRESET and network errors
// This prevents "read ECONNRESET" and other transient network errors from breaking the app

interface RetryConfig {
  maxRetries?: number;
  retryDelay?: number;
  backoffMultiplier?: number;
  timeout?: number;
}

const DEFAULT_CONFIG: Required<RetryConfig> = {
  maxRetries: 3,
  retryDelay: 1000, // 1 second
  backoffMultiplier: 2,
  timeout: 30000, // 30 seconds
};

/**
 * Wraps a Supabase query with automatic retry logic
 * Handles network errors like ECONNRESET, timeouts, and 5xx errors
 * 
 * Usage:
 * const { data, error } = await withRetry(() => 
 *   supabase.from('students').select('*')
 * );
 */
export async function withRetry<T>(
  queryFn: () => Promise<T>,
  config: RetryConfig = {}
): Promise<T> {
  const { maxRetries, retryDelay, backoffMultiplier, timeout } = {
    ...DEFAULT_CONFIG,
    ...config,
  };

  let lastError: any;
  let currentDelay = retryDelay;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      // Add timeout to prevent hanging requests
      const result = await Promise.race([
        queryFn(),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error('Request timeout')), timeout)
        ),
      ]);

      return result;
    } catch (error: any) {
      lastError = error;

      // Check if error is retryable
      const isRetryable = isRetryableError(error);
      const isLastAttempt = attempt === maxRetries;

      if (!isRetryable || isLastAttempt) {
        console.error(`Query failed after ${attempt + 1} attempts:`, error);
        throw error;
      }

      // Log retry attempt
      console.warn(
        `Query failed (attempt ${attempt + 1}/${maxRetries + 1}), retrying in ${currentDelay}ms...`,
        error.message || error
      );

      // Wait before retrying with exponential backoff
      await delay(currentDelay);
      currentDelay *= backoffMultiplier;
    }
  }

  throw lastError;
}

/**
 * Determines if an error is retryable
 */
function isRetryableError(error: any): boolean {
  if (!error) return false;

  const errorMessage = error.message?.toLowerCase() || '';
  const errorCode = error.code?.toLowerCase() || '';

  // Network errors
  if (
    errorMessage.includes('econnreset') ||
    errorMessage.includes('econnrefused') ||
    errorMessage.includes('etimedout') ||
    errorMessage.includes('network') ||
    errorMessage.includes('timeout') ||
    errorMessage.includes('fetch failed') ||
    errorCode === 'econnreset' ||
    errorCode === 'etimedout'
  ) {
    return true;
  }

  // HTTP 5xx errors (server errors)
  if (error.status >= 500 && error.status < 600) {
    return true;
  }

  // HTTP 429 (rate limiting)
  if (error.status === 429) {
    return true;
  }

  // Supabase specific errors
  if (error.details?.includes('connection') || error.hint?.includes('retry')) {
    return true;
  }

  return false;
}

/**
 * Helper function to delay execution
 */
function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Batch multiple queries with retry logic
 * Useful for parallel queries that should all retry together
 */
export async function withRetryBatch<T extends any[]>(
  queryFns: (() => Promise<T[number]>)[],
  config: RetryConfig = {}
): Promise<T> {
  return withRetry(
    () => Promise.all(queryFns.map(fn => fn())),
    config
  ) as Promise<T>;
}

/**
 * Create a retry-enabled version of a query function
 * Useful for creating reusable query functions
 */
export function createRetryableQuery<TArgs extends any[], TResult>(
  queryFn: (...args: TArgs) => Promise<TResult>,
  config: RetryConfig = {}
): (...args: TArgs) => Promise<TResult> {
  return (...args: TArgs) => withRetry(() => queryFn(...args), config);
}
