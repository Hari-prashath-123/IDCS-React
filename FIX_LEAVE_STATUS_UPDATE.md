# FIX: Leave Status Not Updating in Database

## Problem
When staff toggles leave status, the UI updates but the database value doesn't change to TRUE/FALSE.

## Root Cause
The `staff` table has **Row Level Security (RLS)** enabled, but there's **no UPDATE policy** that allows staff members to update their own record.

## Solution
Add an UPDATE policy to allow staff to update their own `staff` record.

## Steps to Fix

### Step 1: Run SQL in Supabase
Go to your Supabase SQL Editor and run this SQL:

```sql
DROP POLICY IF EXISTS "Staff can update own data" ON staff;

CREATE POLICY "Staff can update own data"
  ON staff FOR UPDATE
  TO authenticated
  USING (id = auth.uid())
  WITH CHECK (id = auth.uid());
```

**Where to run it:**
1. Go to: https://supabase.com/dashboard/project/dtdwtbwgialaxgfzpfzj/sql/new
2. Paste the SQL above
3. Click "Run" or press Ctrl+Enter

### Step 2: Test the Fix
1. Log in as a staff member (mentor)
2. Go to Staff Dashboard
3. Toggle "Leave Status" to "On Leave"
4. Check browser console for logs (F12 → Console)
5. You should see:
   ```
   Updating leave status: { userId: "...", currentStatus: false, newStatus: true }
   Update result: { data: [...], error: null }
   ```
6. Refresh the page - status should still show "On Leave"

### Step 3: Verify in Database
1. Go to Supabase Table Editor → `staff` table
2. Find the staff member's row
3. Check that `on_leave` column is now `true`

## Additional Debug Info

If you still have issues, check the browser console after toggling. The updated code logs:
- Current user ID
- Current status
- New status
- Database update result
- Any errors

## Files Updated

### `src/pages/staff/StaffDashboard.tsx`
Added detailed logging to the `handleLeaveToggle` function:
- Logs user ID and status changes
- Returns data from update to verify row was affected
- Shows error if no staff record found
- Shows detailed error message in alert

### `supabase-setup.sql`
Added the UPDATE policy for future reference

### `scripts/add-staff-update-policy.sql`
Standalone SQL file with just the policy (easy to copy/paste)

## Why This Happened

Supabase uses Row Level Security (RLS) to control data access. The staff table had:
- ✅ SELECT policy (can read staff data)
- ❌ No UPDATE policy (cannot update staff data)

Without an UPDATE policy, even though staff members can view their own record, they cannot modify it - including the `on_leave` field.

The new policy allows staff to update **only their own record** (where `id = auth.uid()`), maintaining security while enabling the leave toggle feature.

## Test After Fix

```bash
# Test with the diagnostic script
node scripts/test-leave-column.mjs
```

This will show if updates work with the service role key (which bypasses RLS).

Then test in the UI to confirm the policy works for authenticated users.
