# Leave Status Fixes - Implementation Summary

## Issues Fixed

### 1. Leave Status Not Persisting After Page Reload
**Problem**: When mentor toggles leave status, it resets after page navigation or reload.

**Solution**: 
- Changed from `.single()` to `.maybeSingle()` in `fetchLeaveStatus()` to handle cases where staff record might not exist
- Added error handling with fallback to `false` if fetch fails
- Leave status is now properly fetched from database on every page load

**Files Modified**: 
- `src/pages/staff/StaffDashboard.tsx`
- `src/pages/staff/StaffApplicationPage.tsx`

### 2. Mentor Can Still Approve/Reject While On Leave
**Problem**: When mentor is on leave, they could still see and approve applications.

**Solution**:
- Added `onLeave` state to `StaffApplicationPage`
- Check leave status before allowing approval/rejection
- Show warning message: "You cannot approve/reject applications while on leave"
- Disable approve/reject buttons with visual indication (opacity and cursor)
- Add orange warning banner at top of page when on leave

**Files Modified**: 
- `src/pages/staff/StaffApplicationPage.tsx`

### 3. Application Not Showing "Leave" Status
**Problem**: Application history didn't show when mentor is on leave.

**Solution**:
- Added mentor leave status check in `ApplicationPage`
- Show orange "Leave" badge in mentor column when mentor is on leave
- Show blue "(Acting)" label on advisor column header
- Display notification when submitting application if mentor is on leave

**Files Modified**: 
- `src/pages/student/ApplicationPage.tsx`

## Code Changes Summary

### StaffDashboard.tsx
```typescript
// Fixed leave status fetch
const fetchLeaveStatus = async () => {
  try {
    const { data, error } = await supabase
      .from('staff')
      .select('on_leave')
      .eq('id', user?.id)
      .maybeSingle();  // Changed from .single()

    if (error) throw error;
    setOnLeave(data?.on_leave || false);
  } catch (error) {
    console.error('Error fetching leave status:', error);
    setOnLeave(false);  // Fallback to false
  }
};
```

### StaffApplicationPage.tsx
```typescript
// Added leave status check
const [onLeave, setOnLeave] = useState(false);

// Fetch leave status on mount
useEffect(() => {
  if (user) {
    fetchApplications();
    fetchLeaveStatus();
  }
}, [user, type]);

// Block approvals when on leave
const handleApproval = async (...) => {
  if (onLeave) {
    alert('You cannot approve/reject applications while on leave...');
    return;
  }
  // ... rest of approval logic
};

// Disable buttons when on leave
<button
  onClick={...}
  disabled={onLeave}
  className={`... ${onLeave ? 'opacity-50 cursor-not-allowed' : ''}`}
>
```

### ApplicationPage.tsx
```typescript
// Track mentor leave status
const [mentorOnLeave, setMentorOnLeave] = useState(false);

// Check mentor leave when fetching student data
const fetchStudentData = async () => {
  // ... fetch student
  if (data?.mentor_id) {
    const { data: mentorStaff } = await supabase
      .from('staff')
      .select('on_leave')
      .eq('id', data.mentor_id)
      .maybeSingle();
    
    setMentorOnLeave(mentorStaff?.on_leave || false);
  }
};

// Show leave badge in approval status
const getApprovalStatus = (app, level) => {
  if (level === 'mentor' && mentorOnLeave && !app.approvals.find(...)) {
    return <span className="...bg-orange-100 text-orange-700">Leave</span>;
  }
  // ... rest of logic
};
```

## Testing Instructions

### Test 1: Leave Status Persistence
1. Log in as mentor staff
2. Go to Staff Dashboard
3. Toggle "Leave Status" to "On Leave" (should turn red)
4. Navigate to any application page (OD, Leave, etc.)
5. Navigate back to Dashboard
6. **Expected**: Status should still show "On Leave" (red)
7. **Expected**: Orange warning banner should appear on application pages

### Test 2: Cannot Approve While On Leave
1. Ensure mentor is marked "On Leave"
2. Navigate to any application page with pending applications
3. Try to click "Approve" or "Reject" button
4. **Expected**: Buttons should be disabled (grayed out)
5. **Expected**: Warning message shows: "You cannot approve/reject applications while on leave"
6. **Expected**: Orange banner at top shows: "⚠️ On Leave - Applications forwarded to advisor"

### Test 3: Applications Route to Advisor
1. Mark mentor as "On Leave"
2. Log in as student who has that mentor
3. Submit a new application (any type)
4. **Expected**: Message shows "Your mentor is on leave, application sent to advisor"
5. Check application history
6. **Expected**: Mentor column shows orange "Leave" badge
7. **Expected**: Advisor column header shows blue "(Acting)" label
8. Log in as advisor
9. **Expected**: Should see the application at advisor level

### Test 4: Return from Leave
1. Log in as mentor
2. Toggle "Leave Status" back to "Active" (should turn green)
3. Refresh page or navigate away and back
4. **Expected**: Status remains "Active" (green)
5. Navigate to application pages
6. **Expected**: No warning banner appears
7. **Expected**: Can approve/reject applications normally
8. Log in as student and submit new application
9. **Expected**: Goes to mentor (no "on leave" message)

## Database Requirements

Make sure you have run this SQL in your Supabase SQL Editor:

```sql
ALTER TABLE staff ADD COLUMN IF NOT EXISTS on_leave boolean DEFAULT false;
```

This file is also available at: `scripts/add-staff-leave-column.sql`

## Summary of Behavior

### When Mentor is Active:
- Toggle shows green "Active"
- Applications come to mentor level
- Mentor can approve/reject normally
- No warnings or badges

### When Mentor is On Leave:
- Toggle shows red "On Leave"
- New applications skip mentor, go directly to advisor
- Mentor **cannot** approve/reject any applications
- Buttons are disabled with warning message
- Orange warning banner appears on application pages
- Student applications show "Leave" badge under mentor column
- Advisor column shows "(Acting)" label
- Student sees notification when submitting

## Notes

- Leave status persists across page reloads and navigation
- Only affects **new** applications submitted while mentor is on leave
- Existing applications already at mentor level remain there (mentor must return from leave to handle them, or they can manually change status)
- Advisors automatically see applications when mentor is on leave
- The feature works for all 4 application types: OD, Leave, Gatepass, Bonafide
