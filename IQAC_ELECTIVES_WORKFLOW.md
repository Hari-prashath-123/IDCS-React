# IQAC Electives Workflow Implementation

## Overview
Updated the Create Electives page for IQAC department HOD with a new workflow:
1. Select Group (CG/EG/MG) → Auto-select departments
2. Select Year
3. Select Parent Subject
4. Create Multiple Sub-Elective Subjects
5. View/Manage Created Electives with Active/Deactive buttons

## Changes Made

### 1. Database Migrations

#### `scripts/2025-12-08_add_group_to_electives.sql`
- Adds `group` column to `electives` table
- Values: CG, EG, MG, NONE
- Includes CHECK constraint and index

#### `scripts/2025-12-08_add_is_active_to_electives.sql`
- Adds `is_active` BOOLEAN column (default: true)
- Allows IQAC HOD to activate/deactivate electives
- Includes index for performance

### 2. Frontend Changes

#### `src/pages/principal/electives/CreateElectives.tsx`

**New Features:**
- **Group Selection with Auto-Department Mapping:**
  - CG → AI&DS, CSE, IT
  - EG → ECE, EEE
  - MG → ME, CIVIL

- **Two-Tab Interface:**
  1. **Create Tab:** New elective creation form
  2. **Created Tab:** Manage existing electives

- **Form Workflow:**
  ```
  1. Select Group → Auto-populates departments
  2. Select Year (2nd/3rd/4th)
  3. Select Parent Subject (PE/EE/OE)
  4. Add Multiple Electives (Name, Code, Staff)
  5. Submit → Creates for ALL departments in group
  ```

- **Created Electives Management:**
  - Lists all IQAC-created electives (CG/EG/MG)
  - Color-coded by group (Blue/Green/Purple)
  - Status badges (Active/Inactive)
  - Activate/Deactivate buttons
  - Shows department, year, staff, parent subject

**Key Changes:**
- Removed single department selection
- Added group-based multi-department creation
- Auto-selects departments based on group
- Creates same electives across all departments in group
- Added created electives view with toggle functionality

### 3. Group Mapping Configuration

```typescript
const GROUP_MAPPING = {
  CG: ["AI&DS", "CSE", "IT"],
  EG: ["ECE", "EEE"],
  MG: ["ME", CIVIL"]
};
```

### 4. UI Components

**Create Tab:**
- Step-by-step numbered workflow
- Auto-department selection indicator
- Info message showing selected departments
- Staff dropdown shows department names
- Simplified 3-column layout (Name, Code, Staff)

**Created Tab:**
- Card layout with color-coded borders
- Active (green) vs Inactive (gray) styling
- Group badges (CG/EG/MG)
- Status badges (Active/Inactive)
- Activate/Deactivate buttons with icons
- Comprehensive elective details

## Database Schema Updates

### `electives` table - New Columns

```sql
-- Group column
group TEXT DEFAULT 'NONE' CHECK (group IN ('CG', 'EG', 'MG', 'NONE'))

-- Active status column
is_active BOOLEAN DEFAULT true
```

### Indexes Added
- `idx_electives_group` on `group`
- `idx_electives_is_active` on `is_active`

## Usage Instructions

### For IQAC HOD:

1. **Create New Electives:**
   - Go to Create Electives page
   - Click "Create New" tab
   - Select Group (CG/EG/MG)
   - System auto-selects departments
   - Select Year
   - Select Parent Subject
   - Add multiple electives (Name, Code, Staff)
   - Click "Create Electives"
   - Electives created for ALL departments in group

2. **Manage Created Electives:**
   - Click "Created Electives" tab
   - View all IQAC electives with status
   - Click "Activate" to enable elective
   - Click "Deactivate" to disable elective

### Migration Steps:

1. **Run Database Migrations in Supabase:**
   ```sql
   -- First migration: Add group column
   -- Run: scripts/2025-12-08_add_group_to_electives.sql
   
   -- Second migration: Add is_active column
   -- Run: scripts/2025-12-08_add_is_active_to_electives.sql
   ```

2. **Test the Workflow:**
   - Login as IQAC HOD
   - Navigate to Create Electives
   - Test group selection and auto-department
   - Create test electives
   - Verify created in all departments
   - Test activate/deactivate functionality

## Benefits

1. **Efficiency:** Create electives once for multiple departments
2. **Consistency:** Same electives across department groups
3. **Control:** Activate/deactivate without deletion
4. **Visibility:** Clear view of all created electives
5. **Organization:** Group-based categorization

## Technical Details

- **Multi-department Insert:** Uses `flatMap` to create entries for each department
- **Auto-selection:** `useEffect` watches group changes
- **Status Toggle:** Updates `is_active` flag in database
- **Real-time Refresh:** Fetches created electives after submission
- **Tab Switch:** Automatically switches to "Created" tab after creation

## Next Steps

1. Execute both SQL migrations
2. Test IQAC HOD workflow end-to-end
3. Verify electives appear in student selection
4. Test activate/deactivate functionality
5. Validate staff assignment across departments
