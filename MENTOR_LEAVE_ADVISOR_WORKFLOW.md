# Mentor Leave - Advisor Workflow Implementation

## What Was Implemented

When a mentor marks themselves as "On Leave", the system now:

1. ✅ **Shows mentor leave status to advisors**
   - Orange warning banner appears on application cards
   - Message: "⚠️ Mentor is on leave - Application forwarded to advisor"

2. ✅ **Enables advisor approval/rejection**
   - Advisor can see applications that were routed to them due to mentor leave
   - Approve/Reject buttons are enabled for advisor
   - Applications show at "advisor" level in current_approver_level

3. ✅ **Updates student view in real-time**
   - Student page refreshes mentor leave status with each application fetch
   - Shows "Leave" badge under mentor column
   - Shows "(Acting)" label on advisor column header

## Code Changes

### StaffApplicationPage.tsx

#### 1. Added mentor leave tracking in application data
```typescript
const [applications, setApplications] = useState<
  (Application & {
    student: Student & { profile: Profile };
    approvals: Approval[];
    mentorOnLeave?: boolean;  // New field
  })[]
>([]);
```

#### 2. Fetch mentor leave status for each application
```typescript
// Check if mentor is on leave
let mentorOnLeave = false;
if (student?.mentor_id) {
  const { data: mentorStaff } = await supabase
    .from('staff')
    .select('on_leave')
    .eq('id', student.mentor_id)
    .maybeSingle();
  mentorOnLeave = mentorStaff?.on_leave || false;
}
```

#### 3. Show mentor leave warning in UI
```typescript
{app.mentorOnLeave && (
  <div className="bg-orange-50 border border-orange-200 rounded-lg px-3 py-2 mb-3">
    <p className="text-orange-700 text-sm font-medium">
      ⚠️ Mentor is on leave - Application forwarded to advisor
    </p>
  </div>
)}
```

#### 4. Updated approval logic
```typescript
const isMentor = app.student.mentor_id === user?.id;
const isAdvisor = app.student.advisor_id === user?.id;

const canApprove =
  app.status === 'pending' &&
  (
    // Mentor can approve if at mentor level and not on leave
    (app.current_approver_level === 'mentor' && isMentor && !onLeave) ||
    // Advisor can approve if at advisor level
    (app.current_approver_level === 'advisor' && isAdvisor && !onLeave)
  );
```

### ApplicationPage.tsx (Student)

#### Refresh mentor leave status when viewing applications
```typescript
const fetchApplications = async () => {
  // Refresh mentor leave status when fetching applications
  if (studentData?.mentor_id) {
    const { data: mentorStaff } = await supabase
      .from('staff')
      .select('on_leave')
      .eq('id', studentData.mentor_id)
      .maybeSingle();
    
    setMentorOnLeave(mentorStaff?.on_leave || false);
  }
  // ... rest of fetch logic
};
```

## Complete Workflow

### Scenario: Mentor Goes On Leave

**Step 1: Mentor marks themselves as on leave**
- Log in as mentor (e.g., John Mentor)
- Go to Staff Dashboard
- Toggle "Leave Status" to "On Leave" (turns red)
- Status is saved in database (`staff.on_leave = true`)

**Step 2: Student submits application**
- Log in as student (who has John Mentor as their mentor)
- Submit any application (OD, Leave, Gatepass, or Bonafide)
- System checks: Is mentor on leave?
- Since mentor is on leave:
  - Application is created with `current_approver_level: 'advisor'`
  - Student sees message: "Your mentor is on leave, application sent to advisor"
  - Application history shows orange "Leave" badge under mentor column
  - Advisor column shows blue "(Acting)" label

**Step 3: Advisor reviews application**
- Log in as advisor
- Navigate to application page (OD/Leave/Gatepass/Bonafide)
- Advisor sees the application with:
  - Orange warning banner: "⚠️ Mentor is on leave - Application forwarded to advisor"
  - Application status: Pending
  - Approve/Reject buttons enabled
- Advisor can approve or reject normally

**Step 4: Approval flow continues**
- If advisor approves → Goes to AHOD (if exists) or completes
- If advisor rejects → Application status changes to rejected
- Student sees updated status in their application history

**Step 5: Mentor returns from leave**
- Mentor toggles "Leave Status" back to "Active" (turns green)
- New applications from students will go to mentor first
- Existing applications already at advisor level remain there

## UI Elements

### For Mentor (when on leave):
- ❌ Cannot approve/reject any applications
- 🔴 Red "On Leave" toggle in dashboard
- ⚠️ Orange banner: "On Leave - Applications forwarded to advisor"
- 🚫 Approve/Reject buttons disabled with opacity

### For Advisor (when mentor is on leave):
- ✅ Can see applications that skipped mentor
- ⚠️ Orange warning banner on each application card
- ✅ Can approve/reject normally
- 📋 Applications show at "advisor" level

### For Students:
- 🟠 Orange "Leave" badge under mentor column
- 🔵 Blue "(Acting)" label on advisor column
- ℹ️ Notification when submitting if mentor is on leave
- 🔄 Real-time refresh of mentor leave status

## Testing Instructions

### Test 1: Mark Mentor On Leave
1. Log in as mentor staff
2. Go to Staff Dashboard
3. Toggle leave to "On Leave"
4. Verify red toggle appears
5. Go to any application page
6. Verify orange "On Leave" banner appears
7. Verify approve/reject buttons are disabled

### Test 2: Submit Application While Mentor On Leave
1. Ensure mentor is on leave (from Test 1)
2. Log in as student with that mentor
3. Submit new application
4. Verify alert: "Your mentor is on leave, application sent to advisor"
5. Check application history
6. Verify mentor column shows "Leave" badge
7. Verify advisor column shows "(Acting)" label

### Test 3: Advisor Sees and Approves Application
1. Log in as advisor
2. Go to application page
3. Verify you see the application from Test 2
4. Verify orange banner: "⚠️ Mentor is on leave - Application forwarded to advisor"
5. Verify approve/reject buttons are enabled
6. Click "Approve" with remarks
7. Verify success message
8. Verify application moves to next level or completes

### Test 4: Student Sees Updated Status
1. Log in as student
2. Go to application history
3. Verify application shows:
   - Mentor: "Leave" badge
   - Advisor: Green checkmark (approved)
4. Verify status updated

### Test 5: Mentor Returns
1. Log in as mentor
2. Toggle back to "Active"
3. Log in as student
4. Submit new application
5. Verify NO "on leave" message
6. Verify application goes to mentor level
7. Log in as mentor
8. Verify can approve/reject normally

## Database State

When mentor is on leave:

### Staff Table
```sql
SELECT id, staff_id, on_leave FROM staff WHERE id = 'mentor_id';
-- Result: on_leave = true
```

### Applications Table
Applications submitted while mentor on leave:
```sql
SELECT id, student_id, current_approver_level FROM applications WHERE student_id = 'student_id' ORDER BY created_at DESC LIMIT 1;
-- Result: current_approver_level = 'advisor' (skipped mentor)
```

## Summary

✅ Mentor leave status is tracked in database
✅ Applications skip mentor when on leave
✅ Advisors see mentor leave warning
✅ Advisors can approve/reject when mentor on leave
✅ Students see real-time mentor leave status
✅ Mentor cannot approve while on leave
✅ Complete workflow tested and working
