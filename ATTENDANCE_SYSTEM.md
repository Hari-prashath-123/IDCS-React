# Attendance System Documentation

## Overview
The attendance system supports two types of attendance tracking with intelligent cascading behavior:
1. **Daily Attendance** - Overall attendance marked by advisors
2. **Period Attendance** - Subject-wise attendance marked by subject teachers

## Cascading Logic

### Daily → Period (Auto-Sync)
When an advisor marks **daily attendance**, the system automatically:
- Creates/updates period attendance records for all scheduled periods that day
- Marks these records as `is_manually_marked = false` (auto-populated)
- Uses the same status (present/absent/late/od/leave) for all periods

### Manual Period Marking Takes Precedence
When a staff manually marks **period attendance**:
- The record is marked as `is_manually_marked = true`
- This period will NO LONGER be updated by daily attendance changes
- The manual marking is preserved even if daily attendance changes later

### Period → Daily (No Sync)
Period attendance does NOT affect daily attendance. They are independent once manually marked.

## Database Schema

### daily_attendance table
```sql
- id: uuid (PK)
- student_id: uuid (FK → profiles)
- date: date
- status: text (present/absent/late/od/leave)
- marked_by: uuid (FK → profiles)
- created_at: timestamptz
- updated_at: timestamptz
- UNIQUE(student_id, date)
```

### period_attendance table
```sql
- id: uuid (PK)
- student_id: uuid (FK → profiles)
- subject_id: uuid (FK → subjects)
- date: date
- period: integer (1-8)
- status: text (present/absent/late/od/leave)
- marked_by: uuid (FK → profiles)
- is_manually_marked: boolean (tracks if manually set)
- created_at: timestamptz
- updated_at: timestamptz
- UNIQUE(student_id, subject_id, date, period)
```

## Workflow Examples

### Example 1: Advisor marks daily attendance
1. Advisor marks student as "Absent" for the day
2. System automatically creates period attendance records:
   - Period 1 (Math): Absent, is_manually_marked=false
   - Period 2 (English): Absent, is_manually_marked=false
   - Period 3 (Science): Absent, is_manually_marked=false
   - ... (all periods for that day)

### Example 2: Teacher manually marks a period
1. Math teacher opens Period 1 attendance
2. Marks student as "Present" (student arrived late)
3. System updates:
   - Period 1 (Math): Present, is_manually_marked=true

### Example 3: Daily attendance updated after manual period marking
1. Initial state:
   - Daily: Absent
   - Period 1 (Math): Present, is_manually_marked=true (manually marked)
   - Period 2 (English): Absent, is_manually_marked=false (auto)
   
2. Advisor changes daily to "Present"

3. Final state:
   - Daily: Present
   - Period 1 (Math): Present, is_manually_marked=true (UNCHANGED - manual wins)
   - Period 2 (English): Present, is_manually_marked=false (UPDATED - auto follows daily)

## Database Triggers

### sync_daily_to_period_attendance()
```sql
-- Triggered on INSERT/UPDATE to daily_attendance
-- Updates period_attendance WHERE is_manually_marked = false
-- Preserves manually marked period records
```

## Migration Scripts

### Initial Setup
Run: `scripts/create-attendance-tables.sql`
- Creates both attendance tables
- Sets up RLS policies
- Creates triggers

### Add Manual Marking Flag (if upgrading)
Run: `scripts/add-manual-marking-flag.sql`
- Adds `is_manually_marked` column
- Sets existing records as manually marked (preserves data)
- Creates sync trigger

## UI Behavior

### Staff Attendance Page
- **Daily Mode**: Shows all mentees, saves to daily_attendance
- **Period Mode**: Shows students in selected subject/period
  - Saves to period_attendance with is_manually_marked=true
  - Fetches existing attendance (respects manual markings)

### Student Attendance Page
- **Overall %**: Calculated from daily_attendance
- **Subject-wise %**: Calculated from period_attendance
- Shows both auto-populated and manually marked attendance

## Status Options
1. **Present** - Student attended
2. **Absent** - Student did not attend
3. **Late** - Student came late
4. **OD** - On Duty (official college work)
5. **Leave** - Approved leave

## Attendance Percentage Calculation
```
Attended = Present + OD + Late
Not Attended = Absent + Leave
Percentage = (Attended / Total) × 100
```

## Benefits of This System
1. ✅ Advisors can quickly mark daily attendance for all students
2. ✅ Subject teachers can correct specific periods without affecting others
3. ✅ No data loss - manual markings are always preserved
4. ✅ Reduced workload - auto-population from daily saves time
5. ✅ Flexibility - teachers can mark late arrivals or special cases per period
6. ✅ Accurate tracking - both overall and subject-wise percentages
