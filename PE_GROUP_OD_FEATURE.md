# PE Department Group OD Feature - Implementation Guide

## Overview
The Physical Education (PE) department has a specialized portal separate from the standard HOD/AHOD portals. The PE HOD and AHOD can apply for Group OD (On-Duty) applications for multiple students across different departments.

## Features Implemented

### 1. PE Department Portal Structure
- **Location**: `src/pages/pe/`
- **Files Created**:
  - `PEDashboard.tsx` - Main dashboard for PE HOD/AHOD
  - `GroupOD.tsx` - Group OD application form

### 2. Group OD Application Process

#### For PE HOD/AHOD:
1. Navigate to `/pe/group-od`
2. Enter the reason for group OD
3. Select from date and to date
4. Upload proof (optional - PDF, JPG, JPEG, PNG)
5. Add students one by one by entering their register numbers:
   - System fetches and displays:
     - Student name
     - Department
     - Year
     - Section
   - Students can be from any department
6. Submit the group OD application

#### What Happens on Submission:
- A single `group_od_applications` record is created
- Individual OD applications are created for each student
- Each OD application is linked to the group OD via `group_od_id`
- All OD applications are set to `current_approver_level: 'hod'`
- Applications are routed directly to each student's respective HOD for approval

### 3. For Department HODs:
- Group OD applications appear in the HOD's OD Applications page
- Group OD applications are marked with a purple "Group OD" badge
- HODs can approve/reject individual applications as normal
- The badge includes a users icon to indicate group status

## Database Schema

### New Table: `group_od_applications`
```sql
CREATE TABLE group_od_applications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_by UUID REFERENCES auth.users(id) NOT NULL,
  reason TEXT NOT NULL,
  from_date DATE NOT NULL,
  to_date DATE NOT NULL,
  proof_url TEXT,
  status TEXT DEFAULT 'pending',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
```

### Modified Table: `od_applications`
- Added column: `group_od_id UUID REFERENCES group_od_applications(id)`

### RLS Policies:
- PE HOD/AHOD can create, view, and update their own group OD applications
- Department HODs can view group OD applications through existing student-based policies

## Routing

### New Routes:
- `/pe-dashboard` - PE Department dashboard (HOD/AHOD only)
- `/pe/group-od` - Group OD application form (HOD/AHOD only)

### Access Control:
- Only users with role `hod` or `ahod` AND department `Physical Education` can access PE portal
- Dashboard redirect logic automatically routes PE department HOD/AHOD to `/pe-dashboard`

## File Changes Summary

### New Files:
1. `src/pages/pe/PEDashboard.tsx` - PE dashboard with navigation
2. `src/pages/pe/GroupOD.tsx` - Group OD application form with student search
3. `scripts/2026-01-08_add_group_od.sql` - Database migration script

### Modified Files:
1. `src/App.tsx`:
   - Added PE dashboard imports
   - Added PE routes
   - Modified `DashboardRedirect` to route PE users to PE portal
   
2. `src/pages/hod/HODApplicationPage.tsx`:
   - Added `Users` icon import
   - Added Group OD badge to application cards (both mentees and department views)
   - Badge shows when `type === 'od'` and `group_od_id` exists

## Setup Instructions

### 1. Run Database Migration:
```bash
# Connect to your Supabase project and run:
psql -f scripts/2026-01-08_add_group_od.sql
```

Or use Supabase SQL Editor to execute the migration file.

### 2. Create Storage Bucket (if not exists):
The code uses the existing `od-bucket` storage bucket with a new folder `group-od-proofs/`.
Ensure the bucket exists and has appropriate policies.

### 3. Test the Feature:
1. Login as PE HOD or PE AHOD
2. Navigate to Group OD page
3. Fill out the form and add test students
4. Submit and verify:
   - Group OD record created
   - Individual OD applications created
   - Applications appear in respective department HOD pages with badge

## UI/UX Features

### Group OD Form:
- Clean, user-friendly interface
- Real-time student information display as they're added
- Remove student functionality
- File upload with visual feedback
- Form validation before submission
- Loading states during submission

### Group OD Badge:
- Purple background (#EDE9FE / #7C3AED)
- Users icon indicator
- Appears on OD applications that are part of a group
- Visible in both "Mentees" and "Department" views for HODs

## Workflow Diagram

```
PE HOD/AHOD
    |
    v
Fill Group OD Form
    |
    v
Add Students (any dept)
    |
    v
Submit
    |
    v
group_od_applications created
    |
    v
Individual od_applications created
    |
    v
Routed to each student's HOD
    |
    v
HOD sees application with "Group OD" badge
    |
    v
HOD Approves/Rejects
```

## Future Enhancements (Optional)

1. **Group OD Status Dashboard**: Show overall status of group OD (how many approved/rejected/pending)
2. **Bulk Actions**: Allow HODs to approve all students from a group OD at once
3. **Group OD History**: View all past group OD applications with status breakdown
4. **Notifications**: Notify PE HOD when all applications in a group are processed
5. **Comments**: Add ability for HODs to add comments visible across the group

## Troubleshooting

### Issue: PE users still seeing standard HOD dashboard
**Solution**: Ensure the `DashboardRedirect` function check is working:
```typescript
if ((profile.role === 'hod' || profile.role === 'ahod') && 
    profile.department === 'Physical Education') {
  return <Navigate to="/pe-dashboard" replace />;
}
```

### Issue: Students not being found by register number
**Solution**: Check that:
- Student has a profile entry with matching ID
- Register number matches exactly (case-insensitive search)
- Student record exists in `students` table

### Issue: Group OD badge not showing
**Solution**: Verify:
- `group_od_id` is properly set in `od_applications` table
- HOD is viewing the OD applications page (type === 'od')
- Users icon is imported in HODApplicationPage.tsx

## Notes

- PE department no longer has access to standard HOD pages (OD, Leave, Bonafide, Gatepass, Certificates, Students, Subjects)
- Group OD applications skip mentor and advisor approval levels
- Each student's application is independent - approval/rejection doesn't affect others
- Proof file upload is optional but recommended for documentation
