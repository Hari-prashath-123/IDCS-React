# Fix: Advisor Cannot Approve When Mentor On Leave

## Problem
When mentor marks themselves as "On Leave":
- ✅ Orange warning message appears for advisor
- ❌ Approve/Reject buttons NOT showing for advisor
- ❌ Advisor cannot take action on applications

## Root Cause
Applications created BEFORE mentor went on leave have `current_approver_level: 'mentor'`. The approval logic only allowed:
1. Mentor to approve if at mentor level
2. Advisor to approve if at advisor level

But it didn't handle the case where:
- Application is at mentor level
- Mentor is on leave
- Advisor should be able to approve

## Solution Implemented

### 1. Updated Approval Logic (`StaffApplicationPage.tsx`)

Added third condition to allow advisor to approve when mentor is on leave:

```typescript
const canApprove =
  app.status === 'pending' &&
  (
    // Mentor can approve if at mentor level and not on leave
    (app.current_approver_level === 'mentor' && isMentor && !onLeave) ||
    // Advisor can approve if at advisor level and not on their own leave
    (app.current_approver_level === 'advisor' && isAdvisor && !onLeave) ||
    // IMPORTANT: Advisor can also approve if at mentor level BUT mentor is on leave
    (app.current_approver_level === 'mentor' && app.mentorOnLeave && isAdvisor && !onLeave)
  );
```

### 2. Enhanced Approval Handler

Added mentor leave status check in approval handler:

```typescript
// Check if mentor is on leave
let mentorIsOnLeave = false;
if (student.mentor_id) {
  const { data: mentorStaff } = await supabase
    .from('staff')
    .select('on_leave')
    .eq('id', student.mentor_id)
    .maybeSingle();
  mentorIsOnLeave = mentorStaff?.on_leave || false;
}

// Determine role correctly
if (student.advisor_id === user?.id) {
  approverRole = 'advisor';  // User is advisor
} else if (student.mentor_id === user?.id) {
  approverRole = 'mentor';   // User is mentor
}
```

### 3. Added Debug Information

Added console logs and UI debug info to help troubleshoot:

```typescript
// Console logging
console.log('Application check:', {
  appId, status, current_approver_level,
  isMentor, isAdvisor, onLeave, mentorOnLeave
});

// UI debug section (visible when buttons don't appear)
{!canApprove && app.status === 'pending' && (
  <div className="bg-blue-50...">
    Debug: Cannot approve because: [reason]
  </div>
)}
```

## How It Works Now

### Scenario 1: New Application (Mentor Already On Leave)
1. Student submits application
2. System checks: mentor on leave?
3. Application created with `current_approver_level: 'advisor'`
4. Advisor sees application at advisor level
5. Approve/Reject buttons enabled ✅

### Scenario 2: Existing Application (Mentor Goes On Leave Later)
1. Application exists with `current_approver_level: 'mentor'`
2. Mentor marks themselves as on leave
3. Advisor logs in
4. System detects: application at mentor level BUT mentor on leave
5. Approve/Reject buttons enabled for advisor ✅
6. When advisor approves:
   - Approval recorded with `approver_role: 'advisor'`
   - Application moves to next level (AHOD or completes)

## Testing

### Test 1: Existing Application + Mentor Goes On Leave
```bash
# 1. Check current state
node scripts/check-all-apps.mjs

# 2. Verify mentor is on leave
node scripts/check-advisor-setup.mjs

# 3. Log in as advisor in browser
# 4. Go to application page
# 5. Should see:
#    - Orange warning: "Mentor is on leave"
#    - Approve/Reject buttons ENABLED
```

### Test 2: New Application While Mentor On Leave
```bash
# 1. Ensure mentor is on leave
# 2. Log in as student
# 3. Submit new application
# 4. Log in as advisor
# 5. Should see application with buttons enabled
```

### Expected Console Output (F12 → Console)
```javascript
Application check: {
  appId: "077034b8",
  status: "pending",
  current_approver_level: "mentor",
  isMentor: false,
  isAdvisor: true,
  onLeave: false,              // Advisor not on leave
  mentorOnLeave: true,         // Mentor IS on leave
  studentMentorId: "4b744f27...",
  studentAdvisorId: "9042e53d...",
  currentUserId: "9042e53d..."
}
Can approve: true  // ✅ Should be true!
```

## Diagnostic Scripts

### Check if advisor_id is set
```bash
node scripts/check-advisor-setup.mjs
```
Shows:
- Student → advisor assignments
- Advisor staff records
- Applications at advisor level
- Mentors on leave

### Check all applications
```bash
node scripts/check-all-apps.mjs
```
Shows all applications with their current_approver_level

## Key Changes Summary

**Files Modified:**
- `src/pages/staff/StaffApplicationPage.tsx`

**Changes:**
1. ✅ Added third condition in `canApprove` logic
2. ✅ Fetch mentor leave status for each application
3. ✅ Show mentor on leave warning in UI
4. ✅ Enable approve/reject for advisor when mentor on leave
5. ✅ Added debug logging and UI indicators
6. ✅ Enhanced approval handler with mentor leave check

## Database State (No Changes Required)

The fix works with existing database structure:
- ✅ `staff.on_leave` column already exists
- ✅ `students.advisor_id` already set
- ✅ `applications.current_approver_level` can remain at 'mentor'
- ✅ Advisor can approve applications at mentor level when mentor on leave

## Complete Workflow

**Mentor On Leave → Advisor Approves:**
1. Mentor: Toggle "On Leave" (red)
2. Advisor: Opens application page
3. Advisor: Sees applications with orange warning
4. Advisor: Sees Approve/Reject buttons ENABLED
5. Advisor: Clicks Approve → Adds remark
6. System: Creates approval record with `approver_role: 'advisor'`
7. System: Moves application to next level
8. Student: Sees approval in application history

**Status Indicators:**
- Mentor column: Orange "Leave" badge
- Advisor column: Green checkmark (after approval)
- Application moves through workflow normally

## Summary

✅ **Fixed**: Advisor can now approve/reject when mentor is on leave
✅ **Works for**: Both new and existing applications
✅ **Handles**: Applications at mentor level when mentor goes on leave later
✅ **Debug**: Console logs and UI indicators help troubleshoot
✅ **No DB changes**: Works with existing database structure
