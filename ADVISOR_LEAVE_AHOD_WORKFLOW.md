# Advisor Leave → AHOD Workflow Implementation

## Overview
This document describes the implementation of cascading leave delegation from Advisor to AHOD, extending the mentor leave system.

## Complete Cascading Leave System
When staff members are on leave, applications are automatically forwarded to the next approval level:
1. **Mentor on leave** → Applications go to **Advisor**
2. **Advisor on leave** → Applications go to **AHOD**
3. **AHOD on leave** → Applications go to **HOD** (future enhancement)

## Changes Made

### 1. Student Application Page (`src/pages/student/ApplicationPage.tsx`)

#### State Management
```typescript
const [advisorOnLeave, setAdvisorOnLeave] = useState(false);
```

#### Application Submission Logic
```typescript
// Check both mentor and advisor leave status sequentially
let mentorOnLeave = false;
let advisorOnLeave = false;

if (mentorOnLeave && studentData.advisor_id) {
  // Check if advisor is also on leave
  const { data: advisorStaff } = await supabase
    .from('staff')
    .select('on_leave')
    .eq('id', studentData.advisor_id)
    .maybeSingle();
  
  if (advisorStaff?.on_leave) {
    advisorOnLeave = true;
    initialApproverLevel = 'ahod';
    alert('Your mentor and advisor are on leave. Application will be sent to AHOD for approval.');
  } else {
    initialApproverLevel = 'advisor';
    alert('Your mentor is on leave. Application will be sent to advisor for approval.');
  }
}
```

#### UI Indicators
- **Advisor Column Header**: Shows "(Leave)" badge when advisor is on leave
- **AHOD Column Header**: Shows "(Acting)" label when advisor is on leave
- **Application History**: Displays "Leave" badge in advisor column when advisor is on leave

### 2. Staff Application Page (`src/pages/staff/StaffApplicationPage.tsx`)

#### Type Definitions
```typescript
type Application = {
  // ... other fields
  mentorOnLeave?: boolean;
  advisorOnLeave?: boolean;
};

let approverRole: 'mentor' | 'advisor' | 'ahod' | 'hod' = 'mentor';
```

#### Fetching Advisor Leave Status
```typescript
const fetchApplications = async () => {
  // ... fetch applications
  
  // For each application, fetch mentor and advisor leave status
  const enrichedApps = await Promise.all(
    apps.map(async (app) => {
      let mentorOnLeave = false;
      let advisorOnLeave = false;
      
      // Fetch mentor leave status
      if (app.student.mentor_id) {
        const { data: mentorStaff } = await supabase
          .from('staff')
          .select('on_leave')
          .eq('id', app.student.mentor_id)
          .maybeSingle();
        mentorOnLeave = mentorStaff?.on_leave || false;
      }
      
      // Fetch advisor leave status
      if (app.student.advisor_id) {
        const { data: advisorStaff } = await supabase
          .from('staff')
          .select('on_leave')
          .eq('id', app.student.advisor_id)
          .maybeSingle();
        advisorOnLeave = advisorStaff?.on_leave || false;
      }
      
      return { ...app, mentorOnLeave, advisorOnLeave };
    })
  );
};
```

#### Enhanced Approval Logic
```typescript
const canApprove =
  app.status === 'pending' &&
  (
    // Normal flow: Mentor can approve at mentor level
    (app.current_approver_level === 'mentor' && isMentor && !onLeave) ||
    // Normal flow: Advisor can approve at advisor level
    (app.current_approver_level === 'advisor' && isAdvisor && !onLeave) ||
    // Normal flow: AHOD can approve at ahod level
    (app.current_approver_level === 'ahod' && isAHOD && !onLeave) ||
    // Override: Advisor approves at mentor level when mentor on leave
    (app.current_approver_level === 'mentor' && app.mentorOnLeave && isAdvisor && !onLeave) ||
    // Override: AHOD approves at advisor level when advisor on leave
    (app.current_approver_level === 'advisor' && app.advisorOnLeave && isAHOD && !onLeave)
  );
```

#### Approval Handler Updates
```typescript
const handleApproval = async (appId: string, action: 'approved' | 'rejected', remarks?: string) => {
  // Determine approver role
  if (student.hod_id === user?.id) {
    approverRole = 'hod';
  } else if (student.ahod_id === user?.id) {
    approverRole = 'ahod';
  } else if (student.advisor_id === user?.id) {
    approverRole = 'advisor';
  } else if (student.mentor_id === user?.id) {
    approverRole = 'mentor';
  }
  
  // Determine next level after approval
  let nextLevel: 'advisor' | 'ahod' | 'hod' | 'completed' = 'completed';
  
  if (approverRole === 'mentor') {
    nextLevel = 'advisor';
  } else if (approverRole === 'advisor') {
    nextLevel = 'ahod';
  } else if (approverRole === 'ahod') {
    nextLevel = 'hod';
  }
  
  const isLastApprover = 
    (approverRole === 'advisor' && !student.ahod_id) ||
    (approverRole === 'ahod' && !student.hod_id) ||
    approverRole === 'hod';
};
```

#### UI Warning Banners
```typescript
{app.advisorOnLeave && (
  <div className="bg-orange-50 border border-orange-200 rounded-lg px-3 py-2 mb-3">
    <p className="text-orange-700 text-sm font-medium">
      ⚠️ Advisor is on leave - Application forwarded to AHOD
    </p>
  </div>
)}
```

## User Experience Flow

### Scenario: Both Mentor and Advisor on Leave

1. **Student submits application**
   - System checks mentor status → on leave
   - System checks advisor status → on leave
   - Application goes directly to AHOD
   - Student sees alert: "Your mentor and advisor are on leave. Application will be sent to AHOD for approval."

2. **AHOD views applications**
   - Sees application with TWO orange warning banners:
     - ⚠️ Mentor is on leave - Application forwarded to advisor
     - ⚠️ Advisor is on leave - Application forwarded to AHOD
   - Can approve or reject with full authority
   - Debug panel shows: `current_approver_level: 'advisor'`, `advisorOnLeave: true`, `canApprove: true`

3. **Student checks application history**
   - Mentor column shows: "Leave" badge (orange)
   - Advisor column shows: "Leave" badge (orange)
   - AHOD column shows: "(Acting)" label (blue) + pending/approved icon

## Testing Checklist

### Test Case 1: Advisor Leave (Mentor Active)
- [ ] Mark advisor as on leave in StaffDashboard
- [ ] Submit new application as student
- [ ] Verify application goes to advisor level (normal flow)
- [ ] Mark advisor on leave
- [ ] Verify AHOD can now approve the application
- [ ] Check UI shows advisor leave warning

### Test Case 2: Both Mentor and Advisor on Leave
- [ ] Mark both mentor and advisor on leave
- [ ] Submit new application as student
- [ ] Verify application goes directly to AHOD (`current_approver_level: 'ahod'`)
- [ ] Check alert message mentions both on leave
- [ ] Login as AHOD
- [ ] Verify can approve application
- [ ] Check both warning banners display

### Test Case 3: Sequential Leave Changes
- [ ] Submit application with mentor active
- [ ] Mark mentor on leave
- [ ] Verify advisor can approve
- [ ] Mark advisor on leave (before approval)
- [ ] Verify AHOD can now approve
- [ ] Approve as AHOD
- [ ] Check approval history shows correct approver_role

## Database Considerations

### No Schema Changes Required
The existing `staff.on_leave` column handles both mentor and advisor leave status.

### Application State
- `current_approver_level`: Tracks where application currently sits
- Can skip levels when submitting (e.g., go straight to 'ahod' if both mentor and advisor on leave)
- Leave checks happen:
  1. At submission time (determines initial level)
  2. At display time (determines who can approve)
  3. At approval time (validates approver role)

## Debug Tools

### Console Logging
```typescript
console.log('Application check:', {
  appId: app.id.slice(0, 8),
  current_approver_level: app.current_approver_level,
  isMentor, isAdvisor, isAHOD,
  mentorOnLeave: app.mentorOnLeave,
  advisorOnLeave: app.advisorOnLeave,
  canApprove
});
```

### UI Debug Panel
Shows real-time approval logic state for troubleshooting.

## Future Enhancements

### AHOD Leave → HOD Forwarding
Extend the pattern one more level:
- Add HOD leave toggle in HOD dashboard
- Check AHOD leave status at submission
- Allow HOD to approve when AHOD on leave

### Automatic Reversion
When staff returns from leave (toggles to active), consider:
- Option to automatically reassign pending applications back to proper level
- Or keep at current level until next submission

### Leave History/Audit
- Track leave periods in separate table
- Show leave duration in UI
- Generate reports on application routing due to leave

## Related Files
- `src/pages/student/ApplicationPage.tsx` - Student submission and history
- `src/pages/staff/StaffApplicationPage.tsx` - Staff approval interface
- `src/pages/staff/StaffDashboard.tsx` - Leave toggle interface
- `supabase-setup.sql` - Database schema with `staff.on_leave` column
- `MENTOR_LEAVE_ADVISOR_WORKFLOW.md` - Original mentor leave documentation
- `FIX_ADVISOR_APPROVAL_WHEN_MENTOR_ON_LEAVE.md` - Mentor leave bug fixes

## Key Takeaways
1. **Cascading checks**: Always check each level sequentially (mentor → advisor → ahod)
2. **Five approval conditions**: Normal 3 levels + 2 override conditions for leave
3. **Real-time checks**: Leave status checked at every fetch, not cached
4. **Clear UI feedback**: Warning banners and badges keep users informed
5. **Flexible routing**: Applications can skip levels based on leave status
