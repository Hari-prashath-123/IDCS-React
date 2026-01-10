# Mentor Leave Feature - Setup Guide

## Overview
This feature allows mentor staff to mark themselves as "on leave". When a mentor is on leave:
- New applications from their students are automatically routed to the advisor
- The application history shows "Leave" badge under mentor column
- The advisor column shows "(Acting)" to indicate they're handling mentor's duties

## Database Changes Required

### Step 1: Add `on_leave` column to staff table

Run this SQL in your Supabase SQL Editor:

```sql
ALTER TABLE staff ADD COLUMN IF NOT EXISTS on_leave boolean DEFAULT false;
```

This file is also available at: `scripts/add-staff-leave-column.sql`

## How It Works

### For Staff (Mentor)
1. Log in to staff dashboard
2. Look for the "Leave Status" toggle in the top-right corner
3. Click the toggle to mark yourself as "On Leave" (turns red)
4. Click again to mark yourself as "Active" (turns green)
5. When on leave:
   - You won't receive new applications
   - Applications go directly to the advisor
   - Students see "Leave" status on their applications

### For Students
1. When submitting an application (OD, Leave, Gatepass, or Bonafide):
   - If mentor is on leave, application goes to advisor automatically
   - You'll see a message: "Your mentor is on leave, application sent to advisor"
2. In application history:
   - Mentor column shows orange "Leave" badge when mentor is on leave
   - Advisor column shows blue "(Acting)" label to indicate they're handling mentor duties

### For Advisors
- When a mentor is on leave, you'll receive applications at the "advisor" level
- Applications are routed to you as "current_approver_level: advisor" instead of starting at mentor

## Implementation Details

### Code Changes Made

1. **Database Schema** (`supabase-setup.sql`)
   - Added `on_leave boolean DEFAULT false` to `staff` table

2. **Staff Dashboard** (`src/pages/staff/StaffDashboard.tsx`)
   - Added leave status toggle UI in top-right corner
   - Shows current status: "Active" (green) or "On Leave" (red)
   - Updates `staff.on_leave` field when toggled

3. **Student Application Page** (`src/pages/student/ApplicationPage.tsx`)
   - Checks mentor's `on_leave` status before submitting application
   - Routes to advisor if mentor is on leave
   - Shows "Leave" badge in mentor column when mentor is on leave
   - Shows "(Acting)" label on advisor column header when mentor is on leave
   - Displays notification when submitting if mentor is on leave

## Testing

### Test Scenario 1: Mark Mentor as On Leave
1. Log in as a mentor staff member
2. Go to Staff Dashboard
3. Toggle "Leave Status" to "On Leave"
4. Verify status shows "On Leave" in red

### Test Scenario 2: Student Submits Application with Mentor On Leave
1. Ensure mentor is marked as "On Leave" (from Test Scenario 1)
2. Log in as a student who has that mentor
3. Submit any application (OD, Leave, Gatepass, or Bonafide)
4. Verify you see message: "Your mentor is on leave, application sent to advisor"
5. Check application history - should show "Leave" badge under Mentor column
6. Check that advisor column shows "(Acting)" label

### Test Scenario 3: Advisor Receives Application
1. Log in as the advisor
2. Go to any application page (OD, Leave, Gatepass, or Bonafide)
3. Verify you see the application that was submitted while mentor was on leave
4. Application should be at "advisor" level, not "mentor" level

### Test Scenario 4: Mentor Returns from Leave
1. Log in as mentor
2. Toggle "Leave Status" to "Active"
3. Log in as student and submit new application
4. Verify application goes to mentor (no "on leave" message)
5. Verify new application doesn't show "Leave" badge

## Notes

- The `on_leave` status is stored in the database, so it persists across sessions
- When mentor returns from leave, they need to manually toggle back to "Active"
- Existing applications submitted before mentor went on leave are NOT affected
- Only NEW applications are routed to advisor when mentor is on leave
- This feature works for all 4 application types: OD, Leave, Gatepass, Bonafide
