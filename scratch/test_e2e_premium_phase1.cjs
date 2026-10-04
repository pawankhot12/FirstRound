const http = require('http');
const Database = require('better-sqlite3');
const path = require('path');

const db = new Database(path.resolve(__dirname, '../firstround.db'));
const allUsers = db.prepare('SELECT id, email, role FROM users').all();
const superAdminUser = allUsers.find(u => u.email.toLowerCase() === 'pawankhot9@gmail.com');
const studentUser = allUsers.find(u => u.email.toLowerCase() === 'akhot5779@gmail.com');

console.log('Super Admin User:', superAdminUser);
console.log('Student User:', studentUser);

function api(path, method = 'GET', body = null, headers = {}) {
  return new Promise((resolve, reject) => {
    const dataString = body ? JSON.stringify(body) : '';
    const req = http.request(
      {
        hostname: 'localhost',
        port: 3000,
        path,
        method,
        headers: {
          'Content-Type': 'application/json',
          'x-requested-with': 'XMLHttpRequest',
          ...(body ? { 'Content-Length': Buffer.byteLength(dataString) } : {}),
          ...headers,
        },
      },
      (res) => {
        let raw = '';
        res.on('data', (chunk) => (raw += chunk));
        res.on('end', () => {
          try {
            resolve({ status: res.statusCode, json: JSON.parse(raw) });
          } catch (e) {
            resolve({ status: res.statusCode, text: raw });
          }
        });
      }
    );
    req.on('error', reject);
    if (body) req.write(dataString);
    req.end();
  });
}

async function runTests() {
  console.log('===============================================================');
  console.log('FIRSTROUND — LIVE E2E PREMIUM FOUNDATION PHASE 1 VERIFICATION');
  console.log('===============================================================\n');

  let passed = 0;
  let total = 0;

  function assert(cond, msg, extra = '') {
    total++;
    if (cond) {
      console.log(`[PASS] ${msg}`);
      passed++;
    } else {
      console.error(`[FAIL] ${msg} ${extra ? '- ' + JSON.stringify(extra) : ''}`);
      process.exitCode = 1;
    }
  }

  // 1. Health check
  const health = await api('/api/health');
  assert(health.status === 200 && health.json?.status === 'ok', 'Server is healthy');

  // Scenario A: Free User -> Free Assessment Access
  console.log('\n--- Scenario A: Free User Access to Free Assessment ---');
  const freeTestRes = await api('/api/tests/cat_foundation_quant', 'GET', null, {
    'x-user-id': studentUser.id,
  });
  assert(freeTestRes.status === 200, 'Free user gets 200 OK for free assessment', freeTestRes);
  assert(freeTestRes.json?.test?.id === 'cat_foundation_quant', 'Free test payload returned');
  assert(freeTestRes.json?.test?.accessType === 'FREE' || !freeTestRes.json?.test?.accessType, 'Test accessType is FREE');

  // Scenario B: Submit Free Assessment Attempt
  console.log('\n--- Scenario B: Free User Submits Free Assessment ---');
  const quantTest = freeTestRes.json?.test;
  const firstQ = quantTest?.questions?.[0];
  const submitFreeRes = await api('/api/tests/cat_foundation_quant/submit', 'POST', {
    userId: studentUser.id,
    mode: 'exam',
    responses: firstQ ? [{ questionId: firstQ.id, selectedOption: firstQ.correctOption || 'A', timeSpentSeconds: 30 }] : [],
    timeTakenSeconds: 30,
  }, { 'x-user-id': studentUser.id });
  assert(submitFreeRes.status === 200 && submitFreeRes.json?.success, 'Free user successfully submits free assessment', submitFreeRes);

  // Scenario C: Create or set a temporary PREMIUM assessment
  console.log('\n--- Scenario C: Setting Assessment to PREMIUM & Enforcing Lock ---');
  const setPremTestRes = await api('/api/admin/tests/cat_foundation_quant/access-type', 'POST', {
    accessType: 'PREMIUM'
  }, { 'x-user-id': superAdminUser.id });
  assert(setPremTestRes.status === 200 && setPremTestRes.json?.test?.accessType === 'PREMIUM', 'Super Admin sets cat_foundation_quant to PREMIUM', setPremTestRes);

  // Scenario D: Free User attempts direct API access to PREMIUM assessment
  console.log('\n--- Scenario D: Free User direct API on PREMIUM Assessment (Must 403) ---');
  const blockedGet = await api('/api/tests/cat_foundation_quant', 'GET', null, {
    'x-user-id': studentUser.id,
  });
  assert(blockedGet.status === 403, 'Free user receives 403 Forbidden on PREMIUM test', blockedGet);
  assert(blockedGet.json?.isLocked === true, 'Response contains isLocked: true');
  assert(blockedGet.json?.test?.questions === undefined, 'Question contents are stripped for locked preview');

  const blockedVisit = await api('/api/tests/history/visit', 'POST', {
    userId: studentUser.id,
    testId: 'cat_foundation_quant',
    mode: 'exam'
  }, { 'x-user-id': studentUser.id });
  assert(blockedVisit.status === 403, 'Free user visit to PREMIUM test is 403 Forbidden', blockedVisit);

  const blockedStart = await api('/api/tests/history/start', 'POST', {
    userId: studentUser.id,
    testId: 'cat_foundation_quant',
    mode: 'exam'
  }, { 'x-user-id': studentUser.id });
  assert(blockedStart.status === 403, 'Free user start on PREMIUM test is 403 Forbidden', blockedStart);

  const blockedSubmit = await api('/api/tests/cat_foundation_quant/submit', 'POST', {
    userId: studentUser.id,
    mode: 'exam',
    responses: []
  }, { 'x-user-id': studentUser.id });
  assert(blockedSubmit.status === 403, 'Free user submit to PREMIUM test is 403 Forbidden', blockedSubmit);

  // Scenario E: Admin Preview of PREMIUM assessment
  console.log('\n--- Scenario E: Admin Preview of PREMIUM Assessment ---');
  const adminGetPrem = await api('/api/tests/cat_foundation_quant', 'GET', null, {
    'x-user-id': superAdminUser.id,
  });
  assert(adminGetPrem.status === 200, 'Admin receives 200 OK on PREMIUM assessment (Admin Preview)', adminGetPrem);
  assert(Array.isArray(adminGetPrem.json?.test?.questions), 'Admin receives full questions');

  // Scenario F: Granting PREMIUM Entitlement to Student User
  console.log('\n--- Scenario F: Granting PREMIUM Entitlement & Unlocking Assessment ---');
  const grantSubRes = await api(`/api/admin/users/${studentUser.id}/subscription`, 'POST', {
    plan: 'PREMIUM',
    subscriptionStatus: 'active',
    subscriptionExpiresAt: new Date(Date.now() + 86400000 * 30).toISOString(),
  }, { 'x-user-id': superAdminUser.id });
  assert(grantSubRes.status === 200 && grantSubRes.json?.user?.plan === 'PREMIUM', 'User plan updated to PREMIUM', grantSubRes);
  assert(grantSubRes.json?.user?.isPremium === true, 'User isPremium computed as true');

  // Now the student user can access the PREMIUM assessment
  const unlockedGet = await api('/api/tests/cat_foundation_quant', 'GET', null, {
    'x-user-id': studentUser.id,
  });
  assert(unlockedGet.status === 200, 'Premium user now receives 200 OK on PREMIUM test', unlockedGet);
  assert(Array.isArray(unlockedGet.json?.test?.questions), 'Premium user receives questions payload');

  // Scenario G: Deep AI Entitlement & Usage Architecture
  console.log('\n--- Scenario G: Deep AI Help Entitlement (Status & Help Endpoints) ---');
  const deepStatusPrem = await api(`/api/ai/deep-help/status?userId=${studentUser.id}`, 'GET', null, {
    'x-user-id': studentUser.id,
  });
  assert(deepStatusPrem.status === 200 && deepStatusPrem.json?.eligible === true, 'Deep AI status is eligible for Premium user', deepStatusPrem);

  const deepHelpRes = await api('/api/ai/deep-help', 'POST', {
    userId: studentUser.id,
    question: {
      id: 'q_test_1',
      questionText: 'What is the time complexity of binary search?',
      options: [{ id: 'A', text: 'O(log n)' }, { id: 'B', text: 'O(n)' }],
      correctOption: 'A',
      explanation: 'Binary search divides the search space in half at each step.',
      topic: 'DSA',
      difficulty: 'Easy'
    },
    userSelectedOption: 'A',
    currentStep: 1
  }, { 'x-user-id': studentUser.id });
  assert(deepHelpRes.status === 200 && deepHelpRes.json?.success === true, 'Deep AI Help returns 200 OK for Premium user', deepHelpRes);
  assert(Array.isArray(deepHelpRes.json?.hints), 'Deep AI Help returns structured hints');
  assert(Array.isArray(deepHelpRes.json?.stepByStep), 'Deep AI Help returns stepByStep reasoning');

  // Check Deep AI status again to verify recorded usage
  const deepStatusAfter = await api(`/api/ai/deep-help/status?userId=${studentUser.id}`, 'GET', null, {
    'x-user-id': studentUser.id,
  });
  assert(deepStatusAfter.json?.currentUsage?.requestCount >= 1, 'Deep AI usage request count tracked', deepStatusAfter);

  // Revert user to FREE and test Deep AI Lock
  console.log('\n--- Scenario H: Free User Deep AI Locking & Normal AI Free Preservation ---');
  await api(`/api/admin/users/${studentUser.id}/subscription`, 'POST', {
    plan: 'FREE',
    subscriptionStatus: 'inactive',
    subscriptionExpiresAt: null,
  }, { 'x-user-id': superAdminUser.id });

  const deepStatusFree = await api(`/api/ai/deep-help/status?userId=${studentUser.id}`, 'GET', null, {
    'x-user-id': studentUser.id,
  });
  assert(deepStatusFree.json?.eligible === false && deepStatusFree.json?.status === 'locked', 'Deep AI status is locked for Free user', deepStatusFree);

  const deepHelpBlocked = await api('/api/ai/deep-help', 'POST', {
    userId: studentUser.id,
    question: { id: 'q_test_1', questionText: 'Sample?', options: [], correctOption: 'A' },
  }, { 'x-user-id': studentUser.id });
  assert(deepHelpBlocked.status === 403 && deepHelpBlocked.json?.isLocked === true, 'Free user calling Deep AI receives 403 Forbidden with isLocked: true', deepHelpBlocked);

  // Verify normal AI Copilot and Ask Doubt remain 100% FREE for Free user
  const normalDoubtRes = await api('/api/ai/ask-doubt', 'POST', {
    question: {
      id: 'q_test_1',
      questionText: 'What is 2+2?',
      options: [{ id: 'A', text: '4' }],
      correctOption: 'A',
      explanation: 'Basic math',
    }
  }, { 'x-user-id': studentUser.id });
  assert(normalDoubtRes.status === 200 && normalDoubtRes.json?.success === true, 'Normal AI Doubt Solver remains 100% FREE for Free user', normalDoubtRes);

  const normalCopilotRes = await api('/api/ai/copilot', 'POST', {
    userId: studentUser.id,
    message: 'Hello FirstRound AI',
    mode: 'chat'
  }, { 'x-user-id': studentUser.id });
  assert(normalCopilotRes.status === 200 && normalCopilotRes.json?.success === true, 'FirstRound AI Placement Copilot remains 100% FREE for Free user', normalCopilotRes);

  // Scenario I: Clean up - Restore cat_foundation_quant to FREE
  console.log('\n--- Scenario I: Clean Up & State Restoration ---');
  const restoreTestRes = await api('/api/admin/tests/cat_foundation_quant/access-type', 'POST', {
    accessType: 'FREE'
  }, { 'x-user-id': superAdminUser.id });
  assert(restoreTestRes.status === 200 && restoreTestRes.json?.test?.accessType === 'FREE', 'cat_foundation_quant restored to FREE', restoreTestRes);

  console.log('\n===============================================================');
  console.log(`FINAL RESULTS: ${passed}/${total} TESTS PASSED`);
  console.log('===============================================================');

  if (passed === total) {
    console.log('\n🎉 ALL LIVE E2E TESTS PASSED WITH 100% SUCCESS!');
  }
}

runTests().catch((err) => {
  console.error('Fatal error running tests:', err);
  process.exit(1);
});
