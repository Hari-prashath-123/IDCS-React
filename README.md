# College Permission Management System

A comprehensive web application for managing college permissions including OD (On Duty), Leave, Gatepass, and Bonafide certificates with a hierarchical approval system.

## Features

### User Roles
- **Student**: Apply for permissions and track application status
- **Staff**: Approve/reject applications as mentor or advisor
- **AHOD**: Department-level approval authority
- **HOD**: Final approval authority for the department

### Application Types
- **OD (On Duty)**: Official duty permissions
- **Leave**: Leave applications
- **Gatepass**: Entry/exit permissions
- **Bonafide**: Certificate requests

### Approval Hierarchy
Applications follow this approval flow:
1. **Mentor** → 2. **Advisor** → 3. **AHOD** → 4. **HOD**

If any level rejects the application, it is fully rejected.

## Technology Stack

- **Frontend**: React 18 + TypeScript + Vite
- **Styling**: Tailwind CSS
- **Routing**: React Router v6
- **Database**: Supabase (PostgreSQL)
- **Authentication**: Supabase Auth
- **Icons**: Lucide React

## Setup Instructions

### Prerequisites
- Node.js 16+ and npm
- A Supabase account and project

### 1. Clone and Install

```bash
npm install
```

### 2. Database Setup

1. Go to your Supabase project dashboard
2. Navigate to the SQL Editor
3. Copy the contents of `supabase-setup.sql`
4. Execute the SQL to create all tables, policies, and indexes

### 3. Create Test Users

In Supabase SQL Editor, create test users for each role:

```sql
-- Create a HOD user
INSERT INTO auth.users (id, email)
VALUES ('UUID_HERE', 'hod@college.edu');

INSERT INTO profiles (id, email, role, name, dob, department)
VALUES ('SAME_UUID', 'hod@college.edu', 'hod', 'Dr. John Smith', '1970-01-01', 'Computer Science');

-- Create an AHOD user
-- Similar pattern...

-- Create Staff users
-- Similar pattern...

-- Create Student users with proper hierarchy links
-- Similar pattern...
```

Or use Supabase Auth UI to sign up users and then manually update their roles in the profiles table.

### 4. Configure Environment

The `.env` file should already contain your Supabase credentials:
- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`

### 5. Run the Application

```bash
npm run dev
```

Visit `http://localhost:5173` to see the application.

## Application Structure

```
src/
├── components/
│   ├── DashboardLayout.tsx    # Reusable dashboard layout
│   └── ProtectedRoute.tsx     # Route protection with role-based access
├── contexts/
│   └── AuthContext.tsx         # Authentication state management
├── lib/
│   └── supabase.ts            # Supabase client and TypeScript types
├── pages/
│   ├── Home.tsx               # Public home page with notice board
│   ├── Login.tsx              # Login page
│   ├── student/
│   │   ├── StudentDashboard.tsx
│   │   └── ApplicationPage.tsx
│   ├── staff/
│   │   ├── StaffDashboard.tsx
│   │   └── StaffApplicationPage.tsx
│   ├── ahod/
│   │   ├── AHODDashboard.tsx
│   │   └── AHODApplicationPage.tsx
│   └── hod/
│       ├── HODDashboard.tsx
│       └── HODApplicationPage.tsx
└── App.tsx                    # Main app with routing
```

## User Workflows

### Student Workflow
1. Login with student credentials
2. View dashboard with today's application status
3. Navigate to OD/Leave/Gatepass/Bonafide pages
4. Fill application form with reason, dates
5. Track application status in history table
6. See approval status from each level (Mentor, Advisor, AHOD, HOD)

### Staff/AHOD/HOD Workflow
1. Login with appropriate credentials
2. View dashboard with pending applications count
3. Navigate to specific application type pages
4. Review student applications
5. Approve or reject with optional remarks
6. Application automatically moves to next level on approval

## Database Schema

### Tables
- **profiles**: Base user information linked to auth.users
- **students**: Extended student data with approval hierarchy
- **staff**: Extended staff data
- **applications**: All permission applications
- **approvals**: Approval history for each application
- **notices**: Announcements for the notice board

### Security
- Row Level Security (RLS) enabled on all tables
- Students can only access their own data
- Staff can only access applications where they are approvers
- AHOD and HOD have department-level access

## Key Features

### For Students
- Modern, intuitive dashboard
- Real-time application status tracking
- Visual approval flow indicators
- Notification system
- Application history with full details

### For Approvers (Staff/AHOD/HOD)
- Pending applications dashboard
- Quick approve/reject actions
- Remarks and feedback system
- Approval history visibility
- Filtered views by application type

### Design Highlights
- Responsive layout for all screen sizes
- Professional blue and neutral color scheme
- Clean, modern UI with Tailwind CSS
- Smooth animations and transitions
- Accessible navigation with sidebar
- Status badges and visual indicators

## Build for Production

```bash
npm run build
```

The production build will be in the `dist/` directory.

## OD Proof Uploads (Storage)

On Duty applications require students to upload a proof document (PDF/Image). These are stored in a public Supabase Storage bucket named `od-proofs`.

During development, ensure the bucket exists by running the local Admin API and then:

```bash
# Start Admin API in one terminal
npm run admin-api

# In another terminal, create the od-proofs bucket
node scripts/ensure-od-proofs-bucket.mjs
```

Notes:
- The bucket is created as public so staff/AHOD/HOD can view proofs via a simple link.
- If you prefer private access, make the bucket private and update the app to use signed URLs when rendering links.

## Security Considerations

- All database operations are protected by Row Level Security
- Authentication required for all dashboards
- Role-based access control on routes
- Approvers can only modify applications in their hierarchy
- Students cannot modify approved/rejected applications

## Support

For issues or questions, contact the system administrator or refer to the Supabase documentation.
