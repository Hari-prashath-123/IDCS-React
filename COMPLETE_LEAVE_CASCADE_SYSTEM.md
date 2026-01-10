# Complete Cascading Leave Delegation System

## Overview
Full four-tier cascading leave system implemented: Mentor → Advisor → AHOD → HOD

## Complete Approval Logic

### Normal Flow (No Leave)
1. **Mentor** approves at `mentor` level
2. **Advisor** approves at `advisor` level  
3. **AHOD** approves at `ahod` level
4. **HOD** approves at `hod` level → Application APPROVED

### Cascading Leave Overrides

#### Single Staff On Leave
- **Mentor on leave** → Advisor handles applications at `mentor` level
- **Advisor on leave** → AHOD handles applications at `advisor` level
- **AHOD on leave** → HOD handles applications at `ahod` level

#### Multiple Staff On Leave
- **Mentor + Advisor on leave** → AHOD handles at `mentor` level
- **Advisor + AHOD on leave** → HOD handles at `advisor` level
- **Mentor + Advisor + AHOD on leave** → HOD handles at `mentor` level

## Implementation Details

### 1. Student Application Submission (`ApplicationPage.tsx`)

#### State Variables
```typescript
const [mentorOnLeave, setMentorOnLeave] = useState(false);
const [advisorOnLeave, setAdvisorOnLeave] = useState(false);
const [ahodOnLeave, setAhodOnLeave] = useState(false);
```

#### Cascading Leave Check Logic
```typescript
// Check mentor → advisor → AHOD → HOD sequentially
if (mentor on leave) {
  initialApproverLevel = 'advisor';
  
  if (advisor on leave) {
    initialApproverLevel = 'ahod';
    
    if (AHOD on leave) {
      initialApproverLevel = 'hod';
    }
  }
}
```

#### Alert Messages
- No leave: "Application submitted successfully!"
- Mentor leave: "...mentor is on leave. Application sent to advisor"
- Mentor + Advisor leave: "...mentor and advisor are on leave. Application sent to AHOD"
- Mentor + Advisor + AHOD leave: "...mentor, advisor, and AHOD are on leave. Application sent to HOD"

#### UI Indicators
- Table headers show "(Leave)" badge for staff on leave (orange)
- Table headers show "(Acting)" label for staff handling forwarded applications (blue)
- Example: If mentor on leave, Advisor column shows "(Acting)"

### 2. Staff Application Page (`StaffApplicationPage.tsx`)

#### Application Type Extension
```typescript
type Application = {
  // ... existing fields
  mentorOnLeave?: boolean;
  advisorOnLeave?: boolean;
  ahodOnLeave?: boolean;
};
```

#### Complete Approval Logic (10 Conditions)
```typescript
const canApprove =
  app.status === 'pending' &&
  (
    // NORMAL FLOW (4 conditions)
    (app.current_approver_level === 'mentor' && isMentor && !onLeave) ||
    (app.current_approver_level === 'advisor' && isAdvisor && !onLeave) ||
    (app.current_approver_level === 'ahod' && isAHOD && !onLeave) ||
    (app.current_approver_level === 'hod' && isHOD && !onLeave) ||
    
    // SINGLE LEAVE OVERRIDES (3 conditions)
    (app.current_approver_level === 'mentor' && app.mentorOnLeave && isAdvisor && !onLeave) ||
    (app.current_approver_level === 'advisor' && app.advisorOnLeave && isAHOD && !onLeave) ||
    (app.current_approver_level === 'ahod' && app.ahodOnLeave && isHOD && !onLeave) ||
    
    // MULTIPLE LEAVE OVERRIDES (3 conditions)
    (app.current_approver_level === 'mentor' && app.mentorOnLeave && app.advisorOnLeave && isAHOD && !onLeave) ||
    (app.current_approver_level === 'advisor' && app.advisorOnLeave && app.ahodOnLeave && isHOD && !onLeave) ||
    (app.current_approver_level === 'mentor' && app.mentorOnLeave && app.advisorOnLeave && app.ahodOnLeave && isHOD && !onLeave)
  );
```

#### Warning Banners
Three orange warning banners display when applicable:
- ⚠️ Mentor is on leave - Application forwarded to advisor
- ⚠️ Advisor is on leave - Application forwarded to AHOD
- ⚠️ AHOD is on leave - Application forwarded to HOD

### 3. AHOD Application Page (`AHODApplicationPage.tsx`)

#### Same Logic Applied
- Fetches mentor, advisor, and AHOD leave status
- Shows warning banners
- Applies same 3-override canApprove logic specific to AHOD view

### 4. Leave Status Fetching

#### In fetchApplications()
```typescript
// For each application, check all relevant leave statuses
for (const app of apps) {
  // Check mentor leave
  const { data: mentorStaff } = await supabase
    .from('staff')
    .select('on_leave')
    .eq('id', app.student.mentor_id)
    .maybeSingle();
  app.mentorOnLeave = mentorStaff?.on_leave || false;
  
  // Check advisor leave
  const { data: advisorStaff } = await supabase
    .from('staff')
    .select('on_leave')
    .eq('id', app.student.advisor_id)
    .maybeSingle();
  app.advisorOnLeave = advisorStaff?.on_leave || false;
  
  // Check AHOD leave
  const { data: ahodStaff } = await supabase
    .from('staff')
    .select('on_leave')
    .eq('id', app.student.ahod_id)
    .maybeSingle();
  app.ahodOnLeave = ahodStaff?.on_leave || false;
}
```

## Testing Scenarios

### Scenario 1: Mentor On Leave
**Steps:**
1. Mark mentor as on leave
2. Submit new application as student
3. Verify application goes to `advisor` level (not `mentor`)
4. Verify existing applications at `mentor` level show approve buttons for advisor
5. Check warning banner: "Mentor is on leave - Application forwarded to advisor"

**Expected Results:**
- ✅ New apps go directly to advisor
- ✅ Advisor can approve apps at mentor level
- ✅ Orange warning banner displays
- ✅ Student table shows Advisor with "(Acting)" label

### Scenario 2: Mentor + Advisor On Leave
**Steps:**
1. Mark both mentor and advisor as on leave
2. Submit new application as student
3. Verify application goes to `ahod` level
4. Login as AHOD
5. Verify approve buttons appear

**Expected Results:**
- ✅ New apps go directly to AHOD
- ✅ AHOD can approve apps at mentor level
- ✅ Two orange warning banners display
- ✅ Student table shows AHOD with "(Acting)" label

### Scenario 3: All Three (Mentor + Advisor + AHOD) On Leave
**Steps:**
1. Mark mentor, advisor, and AHOD as on leave
2. Submit new application as student
3. Verify application goes to `hod` level
4. Login as HOD
5. Verify approve buttons appear

**Expected Results:**
- ✅ New apps go directly to HOD
- ✅ HOD can approve apps at mentor level
- ✅ Three orange warning banners display
- ✅ Student table shows HOD with "(Acting)" label
- ✅ Alert: "...mentor, advisor, and AHOD are on leave. Application sent to HOD"

### Scenario 4: AHOD On Leave (Advisor Active)
**Steps:**
1. Mark only AHOD as on leave
2. Submit application (goes through normal flow to AHOD level)
3. Login as HOD
4. Verify HOD can approve application at `ahod` level

**Expected Results:**
- ✅ HOD sees application with approve buttons
- ✅ Warning banner: "AHOD is on leave - Application forwarded to HOD"
- ✅ After HOD approval, application marked as APPROVED (final level)

### Scenario 5: Sequential Leave Changes
**Steps:**
1. Submit application with all staff active (at mentor level)
2. Mark mentor on leave → Advisor should see approve buttons
3. Mark advisor on leave → AHOD should see approve buttons
4. Mark AHOD on leave → HOD should see approve buttons

**Expected Results:**
- ✅ Approval authority cascades up as each staff goes on leave
- ✅ Correct warning banners appear
- ✅ Debug logs show correct `canApprove` calculations

## Database Schema

### staff Table
```sql
staff (
  id UUID PRIMARY KEY,
  staff_id VARCHAR UNIQUE,
  on_leave BOOLEAN DEFAULT FALSE,
  -- ... other fields
)
```

### RLS Policy
```sql
CREATE POLICY "Staff can update own data"
ON staff FOR UPDATE
TO authenticated
USING (id = auth.uid())
WITH CHECK (id = auth.uid());
```

## Debug Tools

### Console Logging
All approval logic includes detailed console logs:
```javascript
console.log('Application check:', {
  appId: app.id.slice(0, 8),
  current_approver_level,
  isMentor, isAdvisor, isAHOD, isHOD,
  mentorOnLeave, advisorOnLeave, ahodOnLeave,
  canApprove
});
```

### Diagnostic Scripts
- `scripts/check-db.mjs` - View all applications and staff leave status
- `scripts/debug-ahod-approval.mjs` - AHOD-specific diagnostics

## Key Features

### 1. Real-Time Leave Checks
- Leave status checked on every application fetch
- No caching - always current state
- Prevents stale data issues

### 2. Flexible Routing
- Applications can skip levels based on leave status
- Example: Goes straight from submission to `hod` level if all prior staff on leave

### 3. Clear Visual Feedback
- Orange badges for staff on leave
- Blue labels for acting staff
- Warning banners explain routing
- Alert messages inform users

### 4. Robust Logic
- Handles all combinations of leave states
- Self-documenting with comments
- Extensible for future levels

### 5. Leave Status Protection
- Staff on leave cannot approve applications
- Must toggle leave status back to active first
- Prevents accidental approvals

## Files Modified

### Student Pages
- `src/pages/student/ApplicationPage.tsx` - Submission + history view

### Staff Pages  
- `src/pages/staff/StaffApplicationPage.tsx` - Unified staff approval page
- `src/pages/staff/StaffDashboard.tsx` - Leave toggle interface

### AHOD Pages
- `src/pages/ahod/AHODApplicationPage.tsx` - AHOD-specific approval page
- `src/pages/ahod/AHODDashboard.tsx` - Dashboard (counts)

### Database
- `supabase-setup.sql` - Schema with on_leave column and RLS policies

## Future Enhancements

### 1. Automatic Reassignment
When staff returns from leave, optionally reassign applications back to proper level

### 2. Leave History Tracking
```sql
CREATE TABLE leave_history (
  id UUID PRIMARY KEY,
  staff_id UUID REFERENCES staff(id),
  leave_start TIMESTAMP,
  leave_end TIMESTAMP,
  reason TEXT
);
```

### 3. Leave Notifications
- Email notifications when applications forwarded due to leave
- Dashboard alerts for acting staff

### 4. Bulk Leave Management
- Admin interface to manage multiple staff leave statuses
- Calendar view of leave schedules

### 5. Temporary Delegation
- Allow staff to designate specific deputy instead of automatic cascade
- More flexible than automatic routing

## Troubleshooting

### Issue: Approve buttons not appearing
**Check:**
1. Is the staff member's ID matching the student's assigned staff ID?
2. Is the staff member on leave themselves?
3. Check console logs for `canApprove` calculation
4. Verify leave status in database: `SELECT * FROM staff WHERE on_leave = true`

### Issue: Application stuck at wrong level
**Fix:**
1. Check `current_approver_level` in database
2. Manually update if needed: `UPDATE applications SET current_approver_level = 'correct_level'`
3. Consider adding migration script to auto-fix

### Issue: Warning banners not showing
**Check:**
1. Is leave status being fetched in `fetchApplications()`?
2. Check browser console for fetch errors
3. Verify RLS policies allow reading staff leave status

## Success Metrics

✅ **Complete 4-Tier Cascade**: Mentor → Advisor → AHOD → HOD
✅ **10 Approval Conditions**: 4 normal + 6 override scenarios
✅ **Zero Compilation Errors**: All TypeScript checks pass
✅ **Comprehensive UI Feedback**: Badges, labels, banners, alerts
✅ **Real-Time Leave Tracking**: Always current, no caching
✅ **Debug Instrumentation**: Console logs + diagnostic scripts
✅ **RLS Security**: Staff can only update own leave status
✅ **User-Friendly**: Clear messages explain routing decisions

## Related Documentation
- `MENTOR_LEAVE_ADVISOR_WORKFLOW.md` - Original mentor leave implementation
- `ADVISOR_LEAVE_AHOD_WORKFLOW.md` - Advisor leave extension
- `FIX_ADVISOR_APPROVAL_WHEN_MENTOR_ON_LEAVE.md` - Bug fixes
- Current file - Complete system documentation
