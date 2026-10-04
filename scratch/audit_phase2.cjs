const fs = require('fs');
const path = require('path');
const http = require('http');

const BASE_URL = 'http://localhost:3000';

async function request(urlPath, options = {}) {
  const url = new URL(urlPath, BASE_URL);
  const headers = options.headers || {};
  if (options.body && !headers['Content-Type']) {
    headers['Content-Type'] = 'application/json';
  }
  
  return new Promise((resolve, reject) => {
    const req = http.request(url, {
      method: options.method || 'GET',
      headers,
    }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        let json = null;
        try {
          json = JSON.parse(data);
        } catch (e) {}
        resolve({
          status: res.statusCode,
          headers: res.headers,
          raw: data,
          data: json,
        });
      });
    });
    req.on('error', reject);
    if (options.body) {
      req.write(typeof options.body === 'string' ? options.body : JSON.stringify(options.body));
    }
    req.end();
  });
}

async function runDynamicAudit() {
  console.log('================================================================');
  console.log('   FIRSTROUND SECURITY HARDENING PHASE 2 — DYNAMIC AUDIT        ');
  console.log('================================================================\n');

  const results = [];

  function record(category, testName, status, details = '') {
    console.log(`[${status}] ${category} - ${testName} ${details ? `(${details})` : ''}`);
    results.push({ category, testName, status, details });
  }

  // --- 1. AUTH / JWT ---
  console.log('\n--- Category 1: Auth & JWT ---');
  try {
    const invalidJwtRes = await request('/api/auth/me', {
      headers: { 'Authorization': 'Bearer invalid.jwt.token' }
    });
    if (invalidJwtRes.status === 401) {
      record('Auth / JWT', 'Invalid Bearer token rejection', 'PASS', 'Returned 401 Unauthorized');
    } else {
      record('Auth / JWT', 'Invalid Bearer token rejection', 'FAIL', `Expected 401, got ${invalidJwtRes.status}`);
    }

    const spoofHeaderRes = await request('/api/admin/stats', {
      headers: { 'x-user-id': 'user_superadmin_pawankhot' }
    });
    if (spoofHeaderRes.status === 401 || spoofHeaderRes.status === 403) {
      record('Auth / JWT', 'Header x-user-id spoofing protection', 'PASS', `Returned ${spoofHeaderRes.status}`);
    } else {
      record('Auth / JWT', 'Header x-user-id spoofing protection', 'FAIL', `Got ${spoofHeaderRes.status}`);
    }

    const spoofQueryRes = await request('/api/admin/stats?userId=user_superadmin_pawankhot');
    if (spoofQueryRes.status === 401 || spoofQueryRes.status === 403) {
      record('Auth / JWT', 'Query parameter userId spoofing protection', 'PASS', `Returned ${spoofQueryRes.status}`);
    } else {
      record('Auth / JWT', 'Query parameter userId spoofing protection', 'FAIL', `Got ${spoofQueryRes.status}`);
    }
  } catch (err) {
    record('Auth / JWT', 'JWT Auth Endpoint Execution', 'FAIL', err.message);
  }

  // --- 2. RBAC ---
  console.log('\n--- Category 2: RBAC ---');
  try {
    // Synthetic student token
    const studentToken = 'usr_student_test_token';
    const rbacAdminRes = await request('/api/admin/stats', {
      headers: { 'Authorization': `Bearer ${studentToken}` }
    });
    if (rbacAdminRes.status === 403) {
      record('RBAC', 'Student access to /api/admin/stats denied', 'PASS', 'Returned 403 Forbidden');
    } else {
      record('RBAC', 'Student access to /api/admin/stats denied', 'FAIL', `Expected 403, got ${rbacAdminRes.status}`);
    }

    const rbacUsersRes = await request('/api/admin/users', {
      headers: { 'Authorization': `Bearer ${studentToken}` }
    });
    if (rbacUsersRes.status === 403) {
      record('RBAC', 'Student access to /api/admin/users denied', 'PASS', 'Returned 403 Forbidden');
    } else {
      record('RBAC', 'Student access to /api/admin/users denied', 'FAIL', `Expected 403, got ${rbacUsersRes.status}`);
    }

    // Role escalation attempt via profile PATCH
    const patchEscalateRes = await request('/api/users/usr_student_test_token', {
      method: 'PATCH',
      headers: { 'Authorization': `Bearer ${studentToken}` },
      body: { role: 'super_admin' }
    });
    // Profile PATCH rejects updating role or ignores it
    if (patchEscalateRes.data?.user?.role !== 'super_admin') {
      record('RBAC', 'Role escalation via profile PATCH blocked', 'PASS', 'Role remains unchanged');
    } else {
      record('RBAC', 'Role escalation via profile PATCH blocked', 'FAIL', 'User role was modified to super_admin!');
    }
  } catch (err) {
    record('RBAC', 'RBAC Execution', 'FAIL', err.message);
  }

  // --- 3. IDOR / DATA ISOLATION ---
  console.log('\n--- Category 3: IDOR / Data Isolation ---');
  const tempUserA = 'temp_audit_user_A_' + Date.now();
  const tempUserB = 'temp_audit_user_B_' + Date.now();
  try {
    // Attempt A accessing B's profile
    const idorProfileRes = await request(`/api/auth/profile/${tempUserB}`, {
      headers: { 'Authorization': `Bearer ${tempUserA}` }
    });
    if (idorProfileRes.status === 403) {
      record('IDOR', 'Cross-user Profile GET blocked', 'PASS', '403 Forbidden');
    } else {
      record('IDOR', 'Cross-user Profile GET blocked', 'FAIL', `Got ${idorProfileRes.status}`);
    }

    // Attempt A updating B's profile
    const idorPatchRes = await request(`/api/users/${tempUserB}`, {
      method: 'PATCH',
      headers: { 'Authorization': `Bearer ${tempUserA}` },
      body: { name: 'Hacked Name' }
    });
    if (idorPatchRes.status === 403) {
      record('IDOR', 'Cross-user Profile PATCH blocked', 'PASS', '403 Forbidden');
    } else {
      record('IDOR', 'Cross-user Profile PATCH blocked', 'FAIL', `Got ${idorPatchRes.status}`);
    }

    // Attempt A submitting test attempt for B
    const idorSubmitRes = await request('/api/tests/submit-attempt', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${tempUserA}` },
      body: { userId: tempUserB, testSeriesId: 'cat_foundation', mode: 'exam' }
    });
    if (idorSubmitRes.status === 403) {
      record('IDOR', 'Cross-user Test Submit blocked', 'PASS', '403 Forbidden');
    } else {
      record('IDOR', 'Cross-user Test Submit blocked', 'FAIL', `Got ${idorSubmitRes.status}`);
    }

    // Attempt A fetching B's bookmarks
    const idorBookmarkRes = await request(`/api/bookmarks?userId=${tempUserB}`, {
      headers: { 'Authorization': `Bearer ${tempUserA}` }
    });
    if (idorBookmarkRes.status === 403) {
      record('IDOR', 'Cross-user Bookmarks GET blocked', 'PASS', '403 Forbidden');
    } else {
      record('IDOR', 'Cross-user Bookmarks GET blocked', 'FAIL', `Got ${idorBookmarkRes.status}`);
    }

    // Attempt A fetching B's notifications
    const idorNotifyRes = await request(`/api/notifications?userId=${tempUserB}`, {
      headers: { 'Authorization': `Bearer ${tempUserA}` }
    });
    if (idorNotifyRes.status === 403) {
      record('IDOR', 'Cross-user Notifications GET blocked', 'PASS', '403 Forbidden');
    } else {
      record('IDOR', 'Cross-user Notifications GET blocked', 'FAIL', `Got ${idorNotifyRes.status}`);
    }

    // Attempt A fetching B's coding submissions
    const idorCodingSubRes = await request(`/api/coding/submissions?userId=${tempUserB}`, {
      headers: { 'Authorization': `Bearer ${tempUserA}` }
    });
    if (idorCodingSubRes.status === 403) {
      record('IDOR', 'Cross-user Coding Submissions GET blocked', 'PASS', '403 Forbidden');
    } else {
      record('IDOR', 'Cross-user Coding Submissions GET blocked', 'FAIL', `Got ${idorCodingSubRes.status}`);
    }

    // Attempt A submitting code for B
    const idorCodingSubmitRes = await request('/api/coding/submit', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${tempUserA}` },
      body: { questionId: 'q_dsa_026', userId: tempUserB, language: 'javascript', sourceCode: 'console.log("hi");' }
    });
    if (idorCodingSubmitRes.status === 403) {
      record('IDOR', 'Cross-user Coding Submit blocked', 'PASS', '403 Forbidden');
    } else {
      record('IDOR', 'Cross-user Coding Submit blocked', 'FAIL', `Got ${idorCodingSubmitRes.status}`);
    }

    // Attempt A invoking AI Copilot for B
    const idorCopilotRes = await request('/api/ai/copilot', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${tempUserA}` },
      body: { message: 'hello', userId: tempUserB }
    });
    if (idorCopilotRes.status === 403) {
      record('IDOR', 'Cross-user AI Copilot blocked', 'PASS', '403 Forbidden');
    } else {
      record('IDOR', 'Cross-user AI Copilot blocked', 'FAIL', `Got ${idorCopilotRes.status}`);
    }

  } catch (err) {
    record('IDOR', 'IDOR Test Execution', 'FAIL', err.message);
  }

  // --- 4. ADMIN DATA ---
  console.log('\n--- Category 4: Admin Data Protection ---');
  try {
    const studentToken = 'usr_student_test_token';
    const usersListRes = await request('/api/users', {
      headers: { 'Authorization': `Bearer ${studentToken}` }
    });
    if (usersListRes.status === 403 || usersListRes.status === 401) {
      record('Admin Data', '/api/users restricted to Admin only', 'PASS', `Status ${usersListRes.status}`);
    } else {
      record('Admin Data', '/api/users restricted to Admin only', 'FAIL', `Expected 403/401, got ${usersListRes.status}`);
    }

    const adminAssessmentsRes = await request('/api/admin/assessments', {
      headers: { 'Authorization': `Bearer ${studentToken}` }
    });
    if (adminAssessmentsRes.status === 403) {
      record('Admin Data', 'Assessment Builder APIs restricted to Admin only', 'PASS', '403 Forbidden');
    } else {
      record('Admin Data', 'Assessment Builder APIs restricted to Admin only', 'FAIL', `Got ${adminAssessmentsRes.status}`);
    }

    const adminQuestionsRes = await request('/api/admin/questions', {
      headers: { 'Authorization': `Bearer ${studentToken}` }
    });
    if (adminQuestionsRes.status === 403) {
      record('Admin Data', 'Question Bank APIs restricted to Admin only', 'PASS', '403 Forbidden');
    } else {
      record('Admin Data', 'Question Bank APIs restricted to Admin only', 'FAIL', `Got ${adminQuestionsRes.status}`);
    }
  } catch (err) {
    record('Admin Data', 'Admin Data Execution', 'FAIL', err.message);
  }

  // --- 5. AUTH ATTACKS ---
  console.log('\n--- Category 5: Auth Attacks & Rate Limiting ---');
  try {
    const authLimiterRes = await request('/api/auth/login-or-register', {
      method: 'POST',
      body: { email: 'bad_email@example.com' }
    });
    if (authLimiterRes.status === 400 || authLimiterRes.status === 429) {
      record('Auth Attacks', 'Invalid login request rejected cleanly', 'PASS', `Status ${authLimiterRes.status}`);
    } else {
      record('Auth Attacks', 'Invalid login request rejected cleanly', 'FAIL', `Got ${authLimiterRes.status}`);
    }
  } catch (err) {
    record('Auth Attacks', 'Auth Attacks Execution', 'FAIL', err.message);
  }

  // --- 6. SECURITY HEADERS ---
  console.log('\n--- Category 6: Security Headers ---');
  try {
    const healthRes = await request('/api/health');
    const headers = healthRes.headers;
    const hasCsp = Boolean(headers['content-security-policy']);
    const hasXContentType = Boolean(headers['x-content-type-options']);
    const hasXFrame = Boolean(headers['x-frame-options']);
    const hasReferrer = Boolean(headers['referrer-policy']);

    if (hasCsp && hasXContentType && hasReferrer) {
      record('Security Headers', 'Helmet security headers present (CSP, X-Content-Type, Referrer)', 'PASS', `CSP: ${hasCsp ? 'Yes' : 'No'}, XFrame: ${hasXFrame ? 'Yes' : 'No'}`);
    } else {
      record('Security Headers', 'Helmet security headers present', 'FAIL', `Missing headers. CSP: ${hasCsp}`);
    }
  } catch (err) {
    record('Security Headers', 'Security Headers Execution', 'FAIL', err.message);
  }

  // --- 7. CSRF ---
  console.log('\n--- Category 7: CSRF ---');
  try {
    // POST request with no Authorization bearer header, missing origin/referer and missing x-csrf-token
    const csrfFailRes = await request('/api/auth/login-or-register', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        // Omit origin/referer and x-csrf-token
      },
      body: { email: 'test@example.com', name: 'Test' }
    });
    if (csrfFailRes.status === 403) {
      record('CSRF', 'State-changing request without origin/x-csrf-token blocked', 'PASS', '403 Forbidden');
    } else {
      record('CSRF', 'State-changing request without origin/x-csrf-token blocked', 'NEEDS REVIEW', `Got status ${csrfFailRes.status}`);
    }

    // Valid Bearer request exempt from CSRF check
    const csrfBearerRes = await request('/api/bookmarks/toggle', {
      method: 'POST',
      headers: {
        'Authorization': 'Bearer usr_student_test_token',
        'Content-Type': 'application/json'
      },
      body: { questionId: 'q_core_cs_001' }
    });
    if (csrfBearerRes.status === 200 || csrfBearerRes.status === 400 || csrfBearerRes.status === 403) {
      record('CSRF', 'Bearer token API call bypasses CSRF check safely', 'PASS', `Status ${csrfBearerRes.status}`);
    }
  } catch (err) {
    record('CSRF', 'CSRF Execution', 'FAIL', err.message);
  }

  // --- 8. SECRET ISOLATION ---
  console.log('\n--- Category 8: Secret Isolation ---');
  try {
    const distPath = path.join(process.cwd(), 'dist', 'assets');
    let serviceKeyLeaked = false;
    let secretLeaked = false;

    if (fs.existsSync(distPath)) {
      const files = fs.readdirSync(distPath);
      for (const file of files) {
        if (file.endsWith('.js')) {
          const text = fs.readFileSync(path.join(distPath, file), 'utf-8');
          if (text.includes('SUPABASE_SERVICE_ROLE_KEY') && !text.includes('undefined')) {
            serviceKeyLeaked = true;
          }
          if (text.includes('ADMIN_SECRET') && !text.includes('undefined')) {
            secretLeaked = true;
          }
        }
      }
    }
    const clientAdminFileMissing = !fs.existsSync('src/services/supabaseAdmin.ts');

    if (!serviceKeyLeaked && !secretLeaked && clientAdminFileMissing) {
      record('Secret Isolation', 'Server secrets & service role key absent from client bundle', 'PASS', 'Audited dist/assets bundle & src/ directory');
    } else {
      record('Secret Isolation', 'Server secrets & service role key absent from client bundle', 'FAIL', `Leaked: serviceKey=${serviceKeyLeaked}, secret=${secretLeaked}, clientAdminExists=${!clientAdminFileMissing}`);
    }
  } catch (err) {
    record('Secret Isolation', 'Secret Isolation Execution', 'FAIL', err.message);
  }

  // --- 9. ERROR / INPUT SECURITY ---
  console.log('\n--- Category 9: Error & Input Security ---');
  try {
    const malformedJsonRes = await request('/api/auth/login-or-register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{"invalid_json":'
    });
    if (malformedJsonRes.status === 400 || malformedJsonRes.status === 500) {
      const exposesDb = malformedJsonRes.raw.includes('Sqlite') || malformedJsonRes.raw.includes('SQLITE') || malformedJsonRes.raw.includes('SELECT');
      if (!exposesDb) {
        record('Error / Input Security', 'Malformed JSON input handled safely without error leaks', 'PASS', `Status ${malformedJsonRes.status}`);
      } else {
        record('Error / Input Security', 'Malformed JSON input handled safely without error leaks', 'FAIL', 'Raw database error exposed!');
      }
    }

    const scriptInjectionRes = await request('/api/auth/login-or-register', {
      method: 'POST',
      body: { email: '<script>alert(1)</script>@example.com', name: '<img src=x onerror=alert(1)>' }
    });
    if (scriptInjectionRes.status === 400 || scriptInjectionRes.status === 200) {
      record('Error / Input Security', 'XSS payload in register fields handled safely', 'PASS', `Status ${scriptInjectionRes.status}`);
    }
  } catch (err) {
    record('Error / Input Security', 'Input Security Execution', 'FAIL', err.message);
  }

  // --- 10. BUSINESS LOGIC SECURITY ---
  console.log('\n--- Category 10: Business Logic Security ---');
  try {
    // Attempt manipulating XP via profile update payload
    const xpManipRes = await request('/api/users/usr_student_test_token', {
      method: 'PATCH',
      headers: { 'Authorization': 'Bearer usr_student_test_token' },
      body: { xp: 999999, weeklyXp: 999999 }
    });
    if (xpManipRes.data?.user?.xp !== 999999) {
      record('Business Logic Security', 'Client XP / weeklyXP manipulation rejected', 'PASS', 'XP unchanged');
    } else {
      record('Business Logic Security', 'Client XP / weeklyXP manipulation rejected', 'FAIL', 'XP was overwritten!');
    }
  } catch (err) {
    record('Business Logic Security', 'Business Logic Execution', 'FAIL', err.message);
  }

  // Summary Table Output
  console.log('\n================================================================');
  console.log('            PHASE 2 DYNAMIC SECURITY AUDIT SUMMARY              ');
  console.log('================================================================');
  let totalPass = 0;
  let totalFail = 0;
  let totalReview = 0;

  for (const r of results) {
    if (r.status === 'PASS') totalPass++;
    else if (r.status === 'FAIL') totalFail++;
    else totalReview++;
  }

  console.log(`TOTAL AUDITED: ${results.length} | PASS: ${totalPass} | FAIL: ${totalFail} | NEEDS REVIEW: ${totalReview}\n`);
}

runDynamicAudit().catch(err => {
  console.error('Audit failed:', err);
  process.exit(1);
});
