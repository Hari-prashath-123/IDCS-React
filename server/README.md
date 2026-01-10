Admin API
=========

This simple Express server provides a secure local endpoint to create Supabase auth users and corresponding `profiles` rows using the Supabase service role key. Use it for local development or deploy it to a secure environment.

Setup
-----
1. Ensure you have your `.env.local` in the project root with these keys set:

SUPABASE_URL=...
SUPABASE_SERVICE_ROLE_KEY=...
ADMIN_API_TOKEN=some-secret-token (optional, recommended)
DEFAULT_DEMO_PASSWORD=Password123! (optional)
DEV_ALLOWED_ORIGIN=http://localhost:5173 (optional)

2. Run the server:

```powershell
# loads variables from .env.local by default
npm run admin-api
```

Routes
------
POST /create-user
- Body JSON: { role, name, email, department?, dob?, password? }
- Headers: optionally set `x-admin-token: <ADMIN_API_TOKEN>` if ADMIN_API_TOKEN is set

Response: { ok: true, user, profile, password }

Security notes
--------------
- Keep `SUPABASE_SERVICE_ROLE_KEY` secret. Do not expose it to the browser.
- Use `ADMIN_API_TOKEN` in production and restrict allowed origins.
- Deploy the server behind HTTPS.

Example usage from the client (dev)
-----------------------------------
fetch('http://localhost:7888/create-user', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', 'x-admin-token': 'your-token-if-set' },
  body: JSON.stringify({ role: 'hod', name: 'Alice', email: 'alice@example.com' })
}).then(r => r.json()).then(console.log).catch(console.error);
