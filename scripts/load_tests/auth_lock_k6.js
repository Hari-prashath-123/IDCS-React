import http from 'k6/http';
import { check, sleep } from 'k6';
import { uuidv4 } from 'https://jslib.k6.io/k6-utils/1.2.0/index.js';

export let options = {
  vus: __ENV.K6_VUS ? parseInt(__ENV.K6_VUS) : 200,
  duration: __ENV.K6_DURATION || '1m',
  thresholds: {
    http_req_duration: ['p(95)<3000']
  }
};

const PROXY = __ENV.PROXY_URL || 'http://localhost:4000';

export default function () {
  // Generate a test student UUID per VU to simulate unique students
  const studentId = __ENV.TEST_STUDENT_PREFIX ? `${__ENV.TEST_STUDENT_PREFIX}-${__VU}` : uuidv4();

  // Choose a random elective id from a small static list or env-provided list
  const electiveList = (__ENV.ELECTIVE_IDS || '').split(',').filter(Boolean);
  if (electiveList.length === 0) {
    console.error('No ELECTIVE_IDS provided in env; set ELECTIVE_IDS to comma-separated elective UUIDs');
    return;
  }

  const electiveId = electiveList[Math.floor(Math.random() * electiveList.length)];

  const payload = JSON.stringify({ student_id: studentId, elective_id: electiveId });
  const res = http.post(`${PROXY}/lock`, payload, { headers: { 'Content-Type': 'application/json' } });
  check(res, { 'proxy lock status 200': r => r.status === 200 });

  sleep(Math.random() * 1 + 0.5);
}
