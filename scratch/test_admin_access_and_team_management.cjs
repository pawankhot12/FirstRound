const http = require('http');

function makeRequest(method, path, body = null, headers = {}) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: 'localhost',
      port: 3000,
      path,
      method,
      headers: {
        'Content-Type': 'application/json',
        ...headers,
      },
    };

    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => (data += chunk));
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          resolve({ status: res.statusCode, data: parsed });
        } catch (e) {
          resolve({ status: res.statusCode, data });
        }
      });
    });

    req.on('error', (err) => reject(err));
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

async function runTests() {
  console.log('=== STARTING ADMIN ACCESS & TEAM MANAGEMENT VERIFICATION ===\n');
  let failures = 0;

  function assert(condition, message) {
    if (condition) {
      console.log(`[PASS] ${message}`);
    } else {
      console.error(`[FAIL] ${message}`);
      failures++;
    }
  }

  try {
    // 1. Check pawankhot9@gmail.com resolves to super_admin on login
    console.log('1. Testing pawankhot9@gmail.com Super Admin resolution...');
    const superAdminAuth = await makeRequest('POST', '/api/auth/login-or-register', {
      email: 'pawankhot9@gmail.com',
      name: 'Pawan Khot',
    });
    assert(superAdminAuth.status === 200, 'Super admin login endpoint returned 200 OK');
    assert(superAdminAuth.data?.user?.role === 'super_admin', 'pawankhot9@gmail.com resolves to role = super_admin');
    const superAdminUser = superAdminAuth.data?.user;

    // 2. Register normal student
    console.log('\n2. Testing normal student registration & API protection...');
    const studentAuth = await makeRequest('POST', '/api/auth/login-or-register', {
      email: 'test_student_admin_audit@firstround.ai',
      name: 'Test Student',
      role: 'admin', // Escalation attempt in registration payload!
    });
    assert(studentAuth.status === 200, 'Student registration returned 200 OK');
    assert(studentAuth.data?.user?.role === 'student', 'Role escalation rejected in registration; forced to student');
    const studentUser = studentAuth.data?.user;

    // Direct access to admin endpoint without header
    const unauthStats = await makeRequest('GET', '/api/admin/stats');
    assert(unauthStats.status === 401, 'Unauthenticated GET /api/admin/stats returned 401 Unauthorized');

    // Access to admin endpoint with student x-user-id
    const studentStats = await makeRequest('GET', '/api/admin/stats', null, {
      'x-user-id': studentUser.id,
    });
    assert(studentStats.status === 403, 'Student access to GET /api/admin/stats returned 403 Forbidden');

    // Access to super admin endpoint with student x-user-id
    const studentTeam = await makeRequest('GET', '/api/admin/team-members', null, {
      'x-user-id': studentUser.id,
    });
    assert(studentTeam.status === 403, 'Student access to GET /api/admin/team-members returned 403 Forbidden');

    // 3. Super Admin access to Admin APIs
    console.log('\n3. Testing Super Admin access to Admin APIs...');
    const superAdminStats = await makeRequest('GET', '/api/admin/stats', null, {
      'x-user-id': superAdminUser.id,
    });
    assert(superAdminStats.status === 200, 'Super Admin access to /api/admin/stats returned 200 OK');

    const superAdminTeam = await makeRequest('GET', '/api/admin/team-members', null, {
      'x-user-id': superAdminUser.id,
    });
    assert(superAdminTeam.status === 200, 'Super Admin access to /api/admin/team-members returned 200 OK');
    assert(Array.isArray(superAdminTeam.data?.members), 'Team members array returned');
    assert(
      superAdminTeam.data.members.some((m) => m.email === 'pawankhot9@gmail.com' && m.role === 'super_admin'),
      'pawankhot9@gmail.com present in team members as super_admin'
    );

    // 4. Promote student to Admin
    console.log('\n4. Testing student promotion to Admin...');
    const promoteRes = await makeRequest(
      'POST',
      '/api/admin/users/promote',
      { targetUserId: studentUser.id },
      { 'x-user-id': superAdminUser.id }
    );
    assert(promoteRes.status === 200, 'Promote user returned 200 OK');
    assert(promoteRes.data?.user?.role === 'admin', 'Promoted user now has role = admin');

    // Check newly promoted admin can access admin stats but NOT team management
    const newAdminStats = await makeRequest('GET', '/api/admin/stats', null, {
      'x-user-id': studentUser.id,
    });
    assert(newAdminStats.status === 200, 'Promoted admin can access GET /api/admin/stats');

    const newAdminTeam = await makeRequest('GET', '/api/admin/team-members', null, {
      'x-user-id': studentUser.id,
    });
    assert(newAdminTeam.status === 403, 'Regular admin cannot access Super Admin endpoint /api/admin/team-members');

    // 5. Admin cannot promote or revoke admins
    console.log('\n5. Testing admin restriction from promoting/revoking admins...');
    const adminPromoteAttempt = await makeRequest(
      'POST',
      '/api/admin/users/promote',
      { targetUserId: studentUser.id },
      { 'x-user-id': studentUser.id }
    );
    assert(adminPromoteAttempt.status === 403, 'Regular admin cannot invoke /api/admin/users/promote (403 Forbidden)');

    // Admin cannot modify Super Admin
    const adminModifySuperAttempt = await makeRequest(
      'POST',
      '/api/admin/users/revoke',
      { targetUserId: superAdminUser.id },
      { 'x-user-id': studentUser.id }
    );
    assert(adminModifySuperAttempt.status === 403, 'Regular admin cannot revoke Super Admin (403 Forbidden)');

    // 6. Super Admin cannot self-demote or demote pawankhot9@gmail.com
    console.log('\n6. Testing Super Admin self-demotion protection...');
    const selfDemoteRes = await makeRequest(
      'POST',
      '/api/admin/users/revoke',
      { targetUserId: superAdminUser.id },
      { 'x-user-id': superAdminUser.id }
    );
    assert(selfDemoteRes.status === 403, 'Super Admin self-demotion rejected with 403 Forbidden');

    // 7. Revoke Admin access back to Student
    console.log('\n7. Testing revocation of Admin access...');
    const revokeRes = await makeRequest(
      'POST',
      '/api/admin/users/revoke',
      { targetUserId: studentUser.id },
      { 'x-user-id': superAdminUser.id }
    );
    assert(revokeRes.status === 200, 'Revoke admin returned 200 OK');
    assert(revokeRes.data?.user?.role === 'student', 'Revoked user role reset to student');

    // Verify revoked student loses admin access
    const revokedStats = await makeRequest('GET', '/api/admin/stats', null, {
      'x-user-id': studentUser.id,
    });
    assert(revokedStats.status === 403, 'Revoked user access to GET /api/admin/stats returned 403 Forbidden');

    // 8. Session & Profile updates check
    console.log('\n8. Testing session persistence & profile role tamper protection...');
    const profileUpdateRes = await makeRequest(
      'PATCH',
      `/api/users/${studentUser.id}`,
      { name: 'Hacked Admin Name', role: 'super_admin' }
    );
    assert(profileUpdateRes.status === 200, 'Profile update endpoint returned 200 OK');
    assert(profileUpdateRes.data?.user?.role === 'student', 'Profile update ignored role tamper payload');

    const freshLookup = await makeRequest('GET', `/api/auth/profile/${studentUser.id}`);
    assert(freshLookup.data?.user?.role === 'student', 'Re-fetching user confirms role remains student');

    console.log('\n=== VERIFICATION COMPLETE ===');
    console.log(`Total Failures: ${failures}`);
    if (failures > 0) process.exit(1);
  } catch (err) {
    console.error('Test execution error:', err);
    process.exit(1);
  }
}

runTests();
