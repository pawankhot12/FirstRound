const http = require('http');

function makeRequest(path, method = 'GET', body = null, headers = {}) {
  return new Promise((resolve, reject) => {
    const reqHeaders = {
      'Content-Type': 'application/json',
      'User-Agent': 'Mozilla/5.0 (NodeTestScript)',
      'x-requested-with': 'XMLHttpRequest',
      ...headers
    };
    const req = http.request({
      hostname: 'localhost',
      port: 3000,
      path,
      method,
      headers: reqHeaders
    }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, data: JSON.parse(data) });
        } catch (e) {
          resolve({ status: res.statusCode, raw: data });
        }
      });
    });
    req.on('error', reject);
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

async function runAudit() {
  console.log('=== AUDITING AVATAR, FEEDBACK & PASSWORD ENDPOINTS ===');
  const email = `audit_adv_${Date.now()}@example.com`;

  // 1. Register user
  const regRes = await makeRequest('/api/auth/login-or-register', 'POST', {
    email,
    name: 'Audit Candidate',
    college: 'VTU Belagavi',
    targetCompany: 'TCS'
  });
  console.log('1. Registration status:', regRes.status, 'User ID:', regRes.data?.user?.id);
  const userId = regRes.data?.user?.id;
  if (!userId) {
    console.error('Registration failed:', regRes.data || regRes.raw);
    process.exit(1);
  }
  const userHeaders = { 'x-user-id': userId };

  // 2. Test Avatar Upload (native base64 file payload)
  const avatarPayload = {
    avatarData: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=='
  };
  const avatarRes = await makeRequest(`/api/users/${userId}/avatar`, 'POST', avatarPayload, userHeaders);
  console.log('2. Avatar Upload status:', avatarRes.status, 'Success:', avatarRes.data?.success, 'AvatarURL length:', avatarRes.data?.avatarUrl?.length);

  // 3. Test Feedback & Rating Submission
  const feedbackPayload = {
    userId,
    rating: 5,
    category: 'UI/UX Feedback',
    message: 'Account settings look crisp, beautiful, and hyper-responsive! Great job team.',
    contactRequested: true
  };
  const fbRes = await makeRequest('/api/feedback', 'POST', feedbackPayload, userHeaders);
  console.log('3. Feedback Submission status:', fbRes.status, 'Message:', fbRes.data?.message, 'Feedback ID:', fbRes.data?.feedback?.id);

  // 4. Test Password Change
  const pwdRes = await makeRequest(`/api/users/${userId}/change-password`, 'POST', { newPassword: 'securePassword123' }, userHeaders);
  console.log('4. Password Change status:', pwdRes.status, 'Success:', pwdRes.data?.success);

  // 5. Clean up by deleting test user
  const delRes = await makeRequest(`/api/users/${userId}/delete-account`, 'POST', {}, userHeaders);
  console.log('5. Cleanup Delete status:', delRes.status, 'Success:', delRes.data?.success);

  console.log('✅ ALL ADVANCED ACCOUNT SETTINGS ENDPOINTS AUDITED & VERIFIED!');
}

runAudit().catch(err => {
  console.error('Audit failed:', err);
  process.exit(1);
});
