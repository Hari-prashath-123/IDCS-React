# User Management Setup

This project uses **Supabase Edge Functions** for user creation in production (deployed on Netlify).

## Files Created:
- `supabase/functions/manage-users/index.ts` - Edge function for creating users
- `src/lib/userManagement.ts` - Frontend helper to call the edge function

## Steps YOU Need to Complete:

### 1. Login to Supabase (using npx - no installation needed)
```powershell
npx supabase login
```

### 2. Link Your Project
```powershell
npx supabase link --project-ref YOUR_PROJECT_REF
```
*Get your project ref from: Supabase Dashboard → Project Settings → General → Reference ID*

### 3. Deploy the Edge Function
```powershell
npx supabase functions deploy manage-users
```

### 4. Done! ✅
**No environment variables needed!** Supabase automatically provides `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` to Edge Functions.

### 5. Update Your Frontend Code

Replace any direct `supabase.auth.admin.createUser()` calls with:

```typescript
import { createUser } from '@/lib/userManagement';

// For creating a single user
await createUser({
  email: 'student@example.com',
  password: 'password123',
  name: 'John Doe',
  role: 'student',
  department: 'CSE',
  year: 2,
  section: 'A',
  reg_no: '2023001',
  roll_no: '23CS001'
});

// For staff
await createUser({
  email: 'staff@example.com',
  password: 'password123',
  name: 'Jane Smith',
  role: 'staff',
  department: 'CSE',
  staff_id: 'STF001',
  staff_role: 'lecturer'
});
```

### 6. Deploy to Netlify

After deploying the edge function, your Netlify site will automatically work because it calls the Supabase Edge Function (which is serverless).

## Testing

Test locally first:
```powershell
npx supabase functions serve manage-users
```

Then test in your app by creating a user through the admin interface.
