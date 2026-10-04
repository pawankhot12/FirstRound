const http = require('http');

function makeRequest(options, postData) {
  return new Promise((resolve, reject) => {
    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => (data += chunk));
      res.on('end', () => {
        try {
          const json = data ? JSON.parse(data) : {};
          resolve({ status: res.statusCode, headers: res.headers, body: json });
        } catch (e) {
          resolve({ status: res.statusCode, headers: res.headers, body: data });
        }
      });
    });
    req.on('error', (err) => reject(err));
    if (postData) req.write(JSON.stringify(postData));
    req.end();
  });
}

async function runSecurityTests() {
  console.log('==================================================');
  console.log('FIRSTROUND — SECURITY REGRESSION TEST SUITE');
  console.log('==================================================\n');

  let passedTests = 0;
  let totalTests = 0;

  function assert(condition, message) {
    totalTests++;
    if (condition) {
      console.log(`[PASS] ${message}`);
      passedTests++;
    } else {
      console.error(`[FAIL] ${message}`);
    }
  }

  // A. Register new candidate profile via sync endpoint (passing full name & email)
  console.log('--- TEST A: Register new account with email + name ---');
  const testCandidateEmail = `secure_student_${Date.now()}@gmail.com`;
  const regRes = await makeRequest(
    {
      hostname: 'localhost',
      port: 3000,
      path: '/api/auth/login-or-register',
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
    },
    { email: testCandidateEmail, name: 'Secure Student Candidate' }
  );
  assert(regRes.status === 200 && regRes.body.user && regRes.body.user.role === 'student', 'Test A: New account created with role=student');
  const newCandidateId = regRes.body.user?.id;

  // B. Sync/Login existing account with name & email
  console.log('\n--- TEST B: Sync/Login registered user ---');
  const loginRes = await makeRequest(
    {
      hostname: 'localhost',
      port: 3000,
      path: '/api/auth/login-or-register',
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
    },
    { email: testCandidateEmail, name: 'Secure Student Candidate' }
  );
  assert(loginRes.status === 200 && loginRes.body.user?.id === newCandidateId, 'Test B: Login/sync returns existing profile without duplicate creation');

  // E. Direct Email-Only Authentication Attempt (Must NOT authenticate)
  console.log('\n--- TEST E: Email-only login attempt (MUST BE REJECTED) ---');
  const directEmailOnlyRes = await makeRequest(
    {
      hostname: 'localhost',
      port: 3000,
      path: '/api/auth/login-or-register',
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
    },
    { email: testCandidateEmail } // No name context
  );
  assert(
    directEmailOnlyRes.status === 400 && directEmailOnlyRes.body.error,
    'Test E: Direct email-only lookup login attempt cleanly rejected with 400 Bad Request'
  );

  // I. Super Admin Authenticated Correctly
  console.log('\n--- TEST I: Super Admin Profile Verification (pawankhot9@gmail.com) ---');
  const superAdminRes = await makeRequest(
    {
      hostname: 'localhost',
      port: 3000,
      path: '/api/auth/login-or-register',
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
    },
    { email: 'pawankhot9@gmail.com', name: 'Pawan Khot' }
  );
  assert(
    superAdminRes.status === 200 && superAdminRes.body.user?.role === 'super_admin',
    'Test I: pawankhot9@gmail.com resolves to role = super_admin'
  );
  const superAdminId = superAdminRes.body.user?.id;

  // J. Attempt Client-Side Role Escalation
  console.log('\n--- TEST J: Client-Side Role Escalation Attempt ---');
  const escalationRes = await makeRequest(
    {
      hostname: 'localhost',
      port: 3000,
      path: '/api/auth/login-or-register',
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
    },
    { email: `escalation_${Date.now()}@gmail.com`, name: 'Hacker User', role: 'super_admin' }
  );
  assert(
    escalationRes.status === 200 && escalationRes.body.user?.role === 'student',
    'Test J: Client payload attempting role=super_admin was overridden server-side to student'
  );

  // K. Student Access to Admin APIs
  console.log('\n--- TEST K: Student Access Restriction to /api/admin/* ---');
  const studentAdminRes = await makeRequest({
    hostname: 'localhost',
    port: 3000,
    path: `/api/admin/users?adminUserId=${newCandidateId}`,
    method: 'GET',
  });
  assert(studentAdminRes.status === 403, 'Test K: Student attempting to access /api/admin/users returned 403 Forbidden');

  // L. Unauthenticated Access to Admin APIs
  console.log('\n--- TEST L: Unauthenticated Access Restriction to /api/admin/* ---');
  const unauthAdminRes = await makeRequest({
    hostname: 'localhost',
    port: 3000,
    path: '/api/admin/users',
    method: 'GET',
  });
  assert(unauthAdminRes.status === 401, 'Test L: Unauthenticated request to /api/admin/users returned 401 Unauthorized');

  // M. Super Admin Cannot Self-Demote Protection
  console.log('\n--- TEST M: Super Admin Self-Demotion Protection ---');
  const demoteRes = await makeRequest(
    {
      hostname: 'localhost',
      port: 3000,
      path: `/api/admin/users/revoke?adminUserId=${superAdminId}`,
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
    },
    { userId: superAdminId }
  );
  assert(
    demoteRes.status === 403 || demoteRes.status === 400 || (demoteRes.body && demoteRes.body.error),
    'Test M: Super Admin self-demotion protection enforced (cannot revoke super admin)'
  );

  // N. Existing Baseline Users & Zero Duplicate Profiles
  console.log('\n--- TEST N: Baseline Users & Duplicate Profile Integrity ---');
  const Database = require('better-sqlite3');
  const path = require('path');
  const db = new Database(path.join(process.cwd(), 'firstround.db'));
  const pawanRows = db.prepare("SELECT * FROM users WHERE LOWER(email) = 'pawankhot9@gmail.com'").all();
  const akhotRows = db.prepare("SELECT * FROM users WHERE LOWER(email) = 'akhot5779@gmail.com'").all();
  const pawan2Rows = db.prepare("SELECT * FROM users WHERE LOWER(email) = 'pawan.khot1272004@gmail.com'").all();

  assert(pawanRows.length === 1 && pawanRows[0].role === 'super_admin', 'Test N1: pawankhot9@gmail.com exists with exactly 1 row & super_admin role');
  assert(akhotRows.length === 1 && akhotRows[0].role === 'student', 'Test N2: akhot5779@gmail.com exists with exactly 1 row & student role');
  assert(pawan2Rows.length === 1 && pawan2Rows[0].role === 'student', 'Test N3: pawan.khot1272004@gmail.com exists with exactly 1 row & student role');

  // O. Zero Credential Exposure
  console.log('\n--- TEST O: Zero Credential Exposure Audit ---');
  const sampleUser = regRes.body.user;
  const leaksCredentials = sampleUser.password || sampleUser.passwordHash || sampleUser.secret || sampleUser.token;
  assert(!leaksCredentials, 'Test O: User profile payload contains ZERO passwords, hashes, tokens, or secrets');

  // Cleanup temporary test accounts
  console.log('\n--- TEARDOWN: Purging temporary security test accounts ---');
  db.prepare("DELETE FROM users WHERE LOWER(email) LIKE 'secure_student_%' OR LOWER(email) LIKE 'escalation_%'").run();
  db.close();
  console.log('[PASS] Teardown complete: Database reset to baseline accounts.');

  console.log('\n==================================================');
  console.log(`SECURITY REGRESSION RESULTS: ${passedTests}/${totalTests} TESTS PASSED`);
  console.log('==================================================\n');

  if (passedTests !== totalTests) {
    process.exit(1);
  }
}

runSecurityTests().catch((err) => {
  console.error('[FAIL] Security test script crashed:', err);
  process.exit(1);
});
