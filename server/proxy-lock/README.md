# Proxy-lock server

Lightweight Express server that forwards lock requests to Supabase using the `SUPABASE_SERVICE_ROLE_KEY`.

Setup

1. Install dependencies:

```bash
cd server/proxy-lock
npm install
```

2. Create `.env` (or export env vars). Example `.env`:

```
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key
DEV_ALLOWED_ORIGIN=http://localhost:5173
PROXY_PORT=4000
```

3. Run server:

```bash
node index.js
```

Usage (testing)

- Health: `GET /health`
- Lock: `POST /lock` with JSON body `{ "student_id": "<uuid>", "elective_id": "<uuid>" }`

Security / Notes

- Only use this proxy in controlled test environments. Protect it with authentication in non-test environments.
- The proxy reduces the number of direct client DB connections and centralizes service-role usage.
