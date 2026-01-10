require('dotenv').config();
const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const rateLimit = require('express-rate-limit');
const { createClient } = require('@supabase/supabase-js');

const app = express();
app.use(helmet());
app.use(express.json());
app.use(cors({ origin: process.env.DEV_ALLOWED_ORIGIN || '*' }));

// Basic rate limiter to avoid floods during tests
const limiter = rateLimit({
  windowMs: 1000, // 1s
  max: 200, // max 200 requests per IP per second
  standardHeaders: true,
  legacyHeaders: false
});
app.use(limiter);

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const PROXY_API_KEY = process.env.PROXY_API_KEY;
if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in environment');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false }
});

// Simple health check
app.get('/health', (req, res) => res.json({ ok: true }));

// API key middleware for protecting the lock endpoint
const requireApiKey = (req, res, next) => {
  // If no PROXY_API_KEY set, fallback to open proxy (use only in controlled env)
  if (!PROXY_API_KEY) return next();
  const key = req.get('x-api-key') || req.headers['x-api-key'];
  if (!key || key !== PROXY_API_KEY) return res.status(401).json({ error: 'invalid api key' });
  return next();
};

// Protected lock endpoint (for controlled testing)
app.post('/lock', requireApiKey, async (req, res) => {
  const { student_id, elective_id } = req.body || {};
  if (!student_id || !elective_id) return res.status(400).json({ error: 'student_id and elective_id required' });

  try {
    const { data, error } = await supabase.rpc('lock_student_elective', {
      p_student_id: student_id,
      p_elective_id: elective_id
    });

    if (error) {
      return res.status(500).json({ success: false, error: error.message || error });
    }

    return res.json(data);
  } catch (err) {
    console.error('Proxy error:', err);
    return res.status(500).json({ success: false, error: String(err) });
  }
});

const PORT = process.env.PROXY_PORT || 4000;
app.listen(PORT, () => console.log(`Proxy-lock server listening on port ${PORT}`));
