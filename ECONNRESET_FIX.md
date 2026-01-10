# Fixing ECONNRESET and Network Errors

## Problem
The application was experiencing frequent `read ECONNRESET` errors:
```
[vite] http proxy error: /rest/v1/profiles?...
Error: read ECONNRESET
```

These errors occur when:
- Network connections are dropped unexpectedly
- Supabase connection pool is exhausted
- Requests timeout
- Transient network issues

## Solution Implemented

### 1. Automatic Retry Logic (`src/lib/supabaseRetry.ts`)

Added intelligent retry wrapper for Supabase queries:
- **Automatic retries** (3 attempts by default)
- **Exponential backoff** (1s, 2s, 4s delays)
- **Timeout protection** (30 second limit)
- **Smart error detection** (only retries transient errors)

### 2. Enhanced Connection Management

Updated `src/lib/supabase.ts`:
- Added `keepalive: true` to maintain connections
- Set 30-second timeouts for all requests
- Better error logging

### 3. Updated AuthContext

Critical auth queries now use retry logic:
```typescript
const [profileResult, deptAdminResult] = await withRetryBatch([
  () => supabase.from('profiles').select('*').eq('id', userId).maybeSingle(),
  () => supabase.from('department_admins').select('department').eq('staff_id', userId).maybeSingle()
]);
```

## How to Use Retry Logic

### Basic Usage

```typescript
import { withRetry } from '../lib/supabase';

// Wrap any Supabase query with withRetry
const { data, error } = await withRetry(() =>
  supabase.from('students').select('*')
);
```

### Batch Queries

```typescript
import { withRetryBatch } from '../lib/supabase';

const [students, profiles, attendance] = await withRetryBatch([
  () => supabase.from('students').select('*'),
  () => supabase.from('profiles').select('*'),
  () => supabase.from('daily_attendance').select('*')
]);
```

### Custom Retry Configuration

```typescript
const { data, error } = await withRetry(
  () => supabase.from('large_table').select('*'),
  {
    maxRetries: 5,        // Try 5 times (default: 3)
    retryDelay: 2000,     // Wait 2s initially (default: 1s)
    backoffMultiplier: 3, // Increase delay 3x each time (default: 2)
    timeout: 60000        // 60s timeout (default: 30s)
  }
);
```

### Create Reusable Retry Functions

```typescript
import { createRetryableQuery } from '../lib/supabaseRetry';

const fetchStudents = createRetryableQuery(
  async (department: string, year: number) => {
    return supabase
      .from('students')
      .select('*')
      .eq('department', department)
      .eq('year', year);
  }
);

// Use it
const { data, error } = await fetchStudents('AI&DS', 2);
```

## What Gets Retried

✅ **Retryable Errors:**
- `ECONNRESET` - Connection reset
- `ETIMEDOUT` - Timeout
- `ECONNREFUSED` - Connection refused
- Network errors
- HTTP 5xx (server errors)
- HTTP 429 (rate limiting)
- Request timeouts

❌ **Not Retried:**
- HTTP 4xx (client errors like 401, 403, 404)
- Validation errors
- Permission errors
- Data not found errors

## Recommended Patterns

### For Critical Data (Auth, Profiles)
```typescript
// Use withRetryBatch for parallel queries
const results = await withRetryBatch([
  () => query1(),
  () => query2(),
]);
```

### For Large Dataset Fetches
```typescript
// Use custom config with higher timeout
const { data } = await withRetry(
  () => supabase.from('attendance').select('*').limit(1000),
  { timeout: 60000 } // 60 seconds for large queries
);
```

### For User-Initiated Actions
```typescript
// Standard retry is fine
const { error } = await withRetry(() =>
  supabase.from('students').update({ name: 'New Name' }).eq('id', studentId)
);
```

## Migration Guide

To add retry logic to existing code:

**Before:**
```typescript
const { data, error } = await supabase
  .from('students')
  .select('*');
```

**After:**
```typescript
const { data, error } = await withRetry(() =>
  supabase.from('students').select('*')
);
```

## Monitoring

All retry attempts are logged to console:
```
Query failed (attempt 1/4), retrying in 1000ms... ECONNRESET
Query failed (attempt 2/4), retrying in 2000ms... ECONNRESET
✓ Query succeeded on attempt 3
```

## Performance Impact

- **No impact on successful queries** - only activates on errors
- **Faster recovery** - automatic retry vs manual page refresh
- **Better UX** - users don't see errors from transient issues
- **Cache integration** - cached data served while retrying

## Files Updated

1. `src/lib/supabaseRetry.ts` - New retry logic
2. `src/lib/supabase.ts` - Connection management + exports
3. `src/contexts/AuthContext.tsx` - Critical auth queries
4. Documentation - This guide

## Next Steps

Consider adding retry logic to:
- Dashboard data fetching
- Application list queries  
- Attendance bulk operations
- Any query that frequently fails with ECONNRESET
