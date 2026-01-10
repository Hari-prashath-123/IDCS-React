import http from 'k6/http';
import { check, sleep } from 'k6';

export let options = {
  vus: __ENV.K6_VUS ? parseInt(__ENV.K6_VUS) : 800,
  duration: __ENV.K6_DURATION || '2m',
  thresholds: {
    http_req_duration: ['p(95)<2000']
  }
};

const BASE = __ENV.SUPABASE_URL || 'https://dtdwtbwgialaxgfzpfzj.supabase.co';
const ANON_KEY = __ENV.SUPABASE_ANON_KEY;
const SERVICE_ROLE = __ENV.SUPABASE_SERVICE_ROLE_KEY; // only for controlled testing

// Helper to get electives (public)
function fetchElectives() {
  const url = `${BASE}/rest/v1/electives?is_active=eq.true&select=id,sub_name,seat_count,seats_filled,course_code`;
  const res = http.get(url, { headers: { apikey: ANON_KEY, Authorization: `Bearer ${ANON_KEY}` } });
  check(res, { 'fetched electives': r => r.status === 200 });
  return res.json();
}

// Helper to call the RPC lock function using service role (dangerous - use in test only)
function callLockRPC(studentId, electiveId) {
  if (!SERVICE_ROLE) return null;
  const url = `${BASE}/rpc/lock_student_elective`;
  const payload = JSON.stringify({ p_student_id: studentId, p_elective_id: electiveId });
  const res = http.post(url, payload, { headers: { apikey: SERVICE_ROLE, Authorization: `Bearer ${SERVICE_ROLE}`, 'Content-Type': 'application/json' } });
  return res;
}

export default function () {
  // 1) fetch list of electives
  const electives = fetchElectives();
  if (!electives || electives.length === 0) {
    sleep(1);
    return;
  }

  // pick a random elective
  const pick = electives[Math.floor(Math.random() * electives.length)];

  // 2) optionally call RPC lock (use SERVICE_ROLE carefully)
  if (SERVICE_ROLE) {
    // For realistic testing you'd use a per-student UUID (supply via env list or generate deterministic mapping)
    const testStudentId = __ENV.TEST_STUDENT_ID || '00000000-0000-0000-0000-000000000000';
    const rpcRes = callLockRPC(testStudentId, pick.id);
    if (rpcRes) {
      check(rpcRes, { 'rpc status 200': r => r.status === 200 });
    }
  }

  sleep(0.5);
}
