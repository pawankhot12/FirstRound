const http = require('http');

function makeRequest(options, postData) {
  return new Promise((resolve, reject) => {
    const headers = { 'x-csrf-token': '1', 'x-test-runner': 'true', ...(options.headers || {}) };
    const req = http.request({ ...options, headers }, (res) => {
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

async function runTest() {
  console.log('=== STARTING USER DIRECTORY AUTO-DISCOVERY E2E TEST ===\n');

  // 1. Authenticate Super Admin
  console.log('1. Authenticating Super Admin (pawankhot9@gmail.com)...');
  const loginRes = await makeRequest(
    {
      hostname: 'localhost',
      port: 3000,
      path: '/api/auth/login-or-register',
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-test-runner': 'true' },
    },
    { email: 'pawankhot9@gmail.com', name: 'Pawan Khot' }
  );

  if (loginRes.status !== 200 || !loginRes.body.user) {
    throw new Error('Super admin login failed: ' + JSON.stringify(loginRes.body));
  }
  const superAdminId = loginRes.body.user.id;
  console.log('[PASS] Super admin authenticated. ID:', superAdminId);

  // 2. Fetch User Directory (All Roles)
  console.log('\n2. Fetching User Directory (All Roles)...');
  const dirRes = await makeRequest({
    hostname: 'localhost',
    port: 3000,
    path: `/api/admin/users`,
    method: 'GET',
    headers: { 'Authorization': `Bearer ${superAdminId}` },
  });

  if (dirRes.status !== 200 || !dirRes.body.success) {
    throw new Error('Failed to fetch user directory: ' + JSON.stringify(dirRes.body));
  }
  const initialUsers = dirRes.body.users;
  console.log(`[PASS] User Directory returned ${initialUsers.length} accounts.`);
  console.log('Accounts:', initialUsers.map((u) => `${u.name || u.email} (${u.email}) [${u.role}]`).join(', '));

  if (initialUsers.length < 3) {
    throw new Error(`Expected at least 3 authorized accounts, found ${initialUsers.length}`);
  }

  // 3. Test Role Filtering (Students only)
  console.log('\n3. Testing Role Filter: role=student...');
  const studentRes = await makeRequest({
    hostname: 'localhost',
    port: 3000,
    path: `/api/admin/users?role=student`,
    method: 'GET',
    headers: { 'Authorization': `Bearer ${superAdminId}` },
  });
  if (studentRes.status !== 200 || !studentRes.body.success) {
    throw new Error('Failed to filter users by role=student');
  }
  const studentUsers = studentRes.body.users;
  console.log(`[PASS] Filter role=student returned ${studentUsers.length} candidates.`);
  if (!studentUsers.every((u) => u.role === 'student' || !u.role)) {
    throw new Error('Non-student account found in student role filter!');
  }

  // 4. Test Search Query Filtering (q=akhot)
  console.log('\n4. Testing Search Query Filter: q=akhot...');
  const searchRes = await makeRequest({
    hostname: 'localhost',
    port: 3000,
    path: `/api/admin/users?q=akhot`,
    method: 'GET',
    headers: { 'Authorization': `Bearer ${superAdminId}` },
  });
  if (searchRes.status !== 200 || !searchRes.body.success) {
    throw new Error('Failed to search users by query q=akhot');
  }
  const searchUsers = searchRes.body.users;
  console.log(`[PASS] Query q=akhot returned ${searchUsers.length} account(s).`);
  if (searchUsers.length !== 1 || searchUsers[0].email !== 'akhot5779@gmail.com') {
    throw new Error('Search query q=akhot did not return expected user akhot5779@gmail.com!');
  }

  // 5. Test Auto-Discovery: Register new candidate
  const testCandidateEmail = `auto_student_${Date.now()}@gmail.com`;
  const testCandidateName = 'Auto Discovered Candidate';
  console.log(`\n5. Registering new future candidate: ${testCandidateEmail}...`);

  const regRes = await makeRequest(
    {
      hostname: 'localhost',
      port: 3000,
      path: '/api/auth/login-or-register',
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
    },
    { email: testCandidateEmail, name: testCandidateName }
  );

  if (regRes.status !== 200 || !regRes.body.user) {
    throw new Error('Registration of new test candidate failed: ' + JSON.stringify(regRes.body));
  }
  const newCandidateId = regRes.body.user.id;
  console.log('[PASS] Registered new candidate. ID:', newCandidateId);

  // 6. Verify User Directory Auto-Discovery
  console.log('\n6. Re-fetching User Directory to verify dynamic auto-discovery...');
  const dirAfterRes = await makeRequest({
    hostname: 'localhost',
    port: 3000,
    path: `/api/admin/users`,
    method: 'GET',
    headers: { 'Authorization': `Bearer ${superAdminId}` },
  });

  const updatedUsers = dirAfterRes.body.users;
  const foundNewCandidate = updatedUsers.find((u) => u.email === testCandidateEmail);

  if (!foundNewCandidate) {
    throw new Error('AUTO-DISCOVERY FAILED: Newly registered candidate was NOT found in Admin User Directory!');
  }
  console.log(`[PASS] AUTO-DISCOVERY SUCCESSFUL! Newly registered candidate '${foundNewCandidate.name}' (${foundNewCandidate.email}) automatically detected in User Directory! Total accounts now: ${updatedUsers.length}.`);

  // 7. Security Check: Verify sensitive credentials (passwords/hashes) are NOT exposed in user objects
  console.log('\n7. Verifying Credential Security (Zero sensitive data exposure)...');
  const sensitiveExposed = updatedUsers.some((u) => u.password || u.passwordHash || u.token || u.secret);
  if (sensitiveExposed) {
    throw new Error('SECURITY VIOLATION: User object contains sensitive credentials/passwords!');
  }
  console.log('[PASS] Zero sensitive credentials exposed in API response.');

  // 8. Teardown: Clean up test candidate from DB
  console.log('\n8. Teardown: Cleaning up test candidate account...');
  const Database = require('better-sqlite3');
  const path = require('path');
  const dbPath = path.join(process.cwd(), 'firstround.db');
  const db = new Database(dbPath);
  db.prepare('DELETE FROM users WHERE id = ?').run(newCandidateId);
  db.close();
  console.log('[PASS] Teardown complete. Production database reset to baseline accounts.');

  console.log('\n=== ALL USER DIRECTORY AUTO-DISCOVERY TESTS PASSED (0 FAILURES) ===');
}

runTest().catch((err) => {
  console.error('\n[FAIL] Test script failed:', err.message);
  process.exit(1);
});
