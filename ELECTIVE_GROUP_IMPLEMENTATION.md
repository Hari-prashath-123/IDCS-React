# Elective Group Column Implementation

## Overview
Added a new "group" column to the electives table to categorize electives into CG (Common Group), EG (Engineering Group), MG (Management Group), or NONE for regular electives.

## Changes Made

### 1. Database Migration
**File**: `scripts/2025-12-08_add_group_to_electives.sql`

- Added `group` column to `electives` table with CHECK constraint
- Default value: 'NONE'
- Valid values: 'CG', 'EG', 'MG', 'NONE'
- Added index on the group column for better query performance
- Included sample UPDATE queries to migrate existing data based on subject names

**To Apply**:
```bash
# Run this in Supabase SQL Editor
psql -f scripts/2025-12-08_add_group_to_electives.sql
```

Or copy-paste the SQL content directly into Supabase Dashboard > SQL Editor.

### 2. Frontend Updates

#### ViewElectives.tsx
**Location**: `src/pages/principal/electives/ViewElectives.tsx`

**Changes**:
- Added `group?: string` to the Elective interface
- Added `filterGroup` state for filtering by group
- Updated query to include group filter
- Added group filter dropdown in the UI (All Groups, CG, EG, MG, No Group)
- Display group badge in the elective list with color coding:
  - CG: Blue badge
  - EG: Green badge
  - MG: Purple badge
  - NONE: Gray badge
- Updated grid layout from 4 columns to 5 columns to accommodate the group display

#### CreateElectives.tsx
**Location**: `src/pages/principal/electives/CreateElectives.tsx`

**Changes**:
- Added `group: "NONE"` to the elective subjects state initialization
- Updated elective insert payload to include the group field
- Added group selector dropdown in the form with options:
  - No Group (NONE)
  - CG - Common Group
  - EG - Engineering Group
  - MG - Management Group
- Updated form layout from 3 columns to 4 columns
- Updated `addElectiveField()` to initialize new electives with group field

## How to Use

### For Administrators Creating Electives

1. Navigate to **Principal > Electives > Create Electives**
2. Fill in the form as usual:
   - Select Department
   - Select Year
   - Select Parent Elective (PE/EE/OE)
3. For each elective subject:
   - Enter Elective Name
   - Enter Elective Code
   - **Select Group** (CG, EG, MG, or No Group)
   - Assign Staff
4. Click "Create Electives"

### For Viewing Electives

1. Navigate to **Principal > Electives > View Electives**
2. Use the new **Group filter** dropdown to filter by:
   - All Groups (default)
   - CG - Common Group
   - EG - Engineering Group
   - MG - Management Group
   - No Group
3. Each elective now displays a colored badge showing its group

## Group Definitions

- **CG (Common Group)**: Common electives available across multiple departments
- **EG (Engineering Group)**: Engineering-focused electives
- **MG (Management Group)**: Management and business-focused electives
- **NONE**: Regular department-specific electives (default)

## Next Steps for IQAC Poll System

This group column is the foundation for the unified elective poll system. The next steps are:

1. **Execute the migration** to add the group column
2. **Create poll tables** (elective_polls, elective_poll_groups, etc.)
3. **Implement IQAC Create Poll page** for cross-department polls
4. **Implement Student Poll Response page** with group-based selection
5. **Add poll results and statistics pages**

## Testing Checklist

- [ ] Execute migration in Supabase SQL Editor
- [ ] Verify `group` column exists in `electives` table
- [ ] Create new electives with different groups (CG, EG, MG, NONE)
- [ ] Verify group badges display correctly in View Electives
- [ ] Test group filter in View Electives
- [ ] Test combining group filter with year and department filters
- [ ] Update existing electives if needed (manually set groups)

## Migration Notes

The migration includes sample UPDATE queries to automatically categorize existing electives:
- Subjects with "Common" in the name → CG
- Subjects with "Engineering" in the name → EG
- Subjects with "Management" in the name → MG

**Review these before running** and adjust the patterns based on your actual data.

## Database Schema

```sql
-- electives table (updated)
CREATE TABLE electives (
  id UUID PRIMARY KEY,
  sub_name TEXT NOT NULL,
  course_code TEXT NOT NULL,
  parent_subject_id UUID REFERENCES subjects(id),
  staff_id UUID REFERENCES profiles(id),
  year INTEGER NOT NULL,
  department TEXT NOT NULL,
  credits INTEGER DEFAULT 3,
  group TEXT DEFAULT 'NONE' CHECK (group IN ('CG', 'EG', 'MG', 'NONE')),
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_electives_group ON electives(group);
```

## Color Coding Reference

| Group | Color | Tailwind Classes |
|-------|-------|------------------|
| CG | Blue | `bg-blue-100 text-blue-700` |
| EG | Green | `bg-green-100 text-green-700` |
| MG | Purple | `bg-purple-100 text-purple-700` |
| NONE | Gray | `bg-slate-100 text-slate-700` |
