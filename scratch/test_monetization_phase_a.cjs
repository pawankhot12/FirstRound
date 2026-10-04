const Database = require('better-sqlite3');
const path = require('path');
const http = require('http');

const dbPath = path.resolve(process.cwd(), 'firstround.db');
const db = new Database(dbPath);

function assert(condition, message) {
  if (!condition) {
    console.error(`❌ FAIL: ${message}`);
    process.exit(1);
  }
  console.log(`✅ PASS: ${message}`);
}

async function makeRequest(options, postData = null) {
  return new Promise((resolve, reject) => {
    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => (data += chunk));
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, headers: res.headers, body: JSON.parse(data) });
        } catch (e) {
          resolve({ status: res.statusCode, headers: res.headers, body: data });
        }
      });
    });
    req.on('error', reject);
    if (postData) {
      req.write(typeof postData === 'string' ? postData : JSON.stringify(postData));
    }
    req.end();
  });
}

async function runTests() {
  console.log('========================================================');
  console.log('🧪 FIRSTROUND — PREMIUM MONETIZATION PHASE A TEST SUITE');
  console.log('========================================================\n');

  // 1. Check Tables Exist
  console.log('--- 1. Database Schema Verification ---');
  const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all().map(t => t.name);
  assert(tables.includes('deep_ai_credit_ledger'), 'deep_ai_credit_ledger table exists');
  assert(tables.includes('assessment_entitlements'), 'assessment_entitlements table exists');
  assert(tables.includes('deep_ai_sessions'), 'deep_ai_sessions table exists');

  // 2. Test User Creation & 6 Initial Free Credits
  console.log('\n--- 2. Initial Credit Wallet & Idempotency ---');
  const testUserId = `test_monetize_user_${Date.now()}`;
  const now = new Date().toISOString();
  db.prepare(`
    INSERT INTO users (id, email, name, role, totalPoints, createdAt, plan, subscriptionStatus)
    VALUES (?, ?, ?, 'student', 0, ?, 'FREE', 'inactive')
  `).run(testUserId, `${testUserId}@student.firstround.test`, 'Monetization Student', now);

  // Call API to fetch credits (which calls ensureInitialUserCredits)
  const creditsRes = await makeRequest({
    hostname: 'localhost',
    port: 3000,
    path: `/api/ai/credits?userId=${testUserId}`,
    method: 'GET',
    headers: { 'x-user-id': testUserId }
  });

  assert(creditsRes.status === 200, 'GET /api/ai/credits returns 200');
  assert(creditsRes.body.total === 6, 'Newly created student has exactly 6 total credits');
  assert(creditsRes.body.free === 6, 'All 6 initial credits are FREE source');
  assert(creditsRes.body.purchased === 0, 'Purchased credits initialized to 0');
  assert(creditsRes.body.premium === 0, 'Premium credits initialized to 0');

  // Check ledger entry
  const ledgerRes = await makeRequest({
    hostname: 'localhost',
    port: 3000,
    path: `/api/ai/credits/ledger?userId=${testUserId}`,
    method: 'GET',
    headers: { 'x-user-id': testUserId }
  });
  assert(ledgerRes.status === 200, 'GET /api/ai/credits/ledger returns 200');
  assert(ledgerRes.body.ledger.length === 1, 'Ledger has exactly 1 initial welcome grant entry');
  assert(ledgerRes.body.ledger[0].amount === 6, 'Initial grant amount is 6');
  assert(ledgerRes.body.ledger[0].source === 'FREE', 'Initial grant source is FREE');
  assert(ledgerRes.body.ledger[0].transactionType === 'GRANT', 'Initial grant transactionType is GRANT');

  // 3. Test Deep AI Help in Practice Mode (Session Reuse & Credit Consumption)
  console.log('\n--- 3. Deep AI Practice Mode & Session Logic ---');
  const dummyQuestion = {
    id: 'q_test_monetize_01',
    testSeriesId: 'cat_foundation_quant',
    questionText: 'What is 15% of 240?',
    options: ['36', '40', '32', '30'],
    correctOption: 'A',
    explanation: '15% of 240 = 0.15 * 240 = 36.'
  };

  // First call for question 1 -> consumes 1 credit
  const deepHelp1 = await makeRequest({
    hostname: 'localhost',
    port: 3000,
    path: '/api/ai/deep-help',
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-user-id': testUserId,
      'x-requested-with': 'XMLHttpRequest'
    }
  }, {
    userId: testUserId,
    question: dummyQuestion,
    mode: 'practice',
    assessmentId: 'cat_foundation_quant',
    currentStep: 1
  });

  assert(deepHelp1.status === 200, 'POST /api/ai/deep-help succeeded for practice question 1');
  assert(deepHelp1.body.isNewSession === true, 'First interaction marked as isNewSession: true');
  assert(deepHelp1.body.creditsLeft === 5, 'Credits deducted from 6 -> 5');

  // Second call for same question -> multi-turn follow-up (SAME session, 0 credits deducted)
  const deepHelp2 = await makeRequest({
    hostname: 'localhost',
    port: 3000,
    path: '/api/ai/deep-help',
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-user-id': testUserId,
      'x-requested-with': 'XMLHttpRequest'
    }
  }, {
    userId: testUserId,
    question: dummyQuestion,
    mode: 'practice',
    assessmentId: 'cat_foundation_quant',
    studentQuestion: 'Can you explain step 2 further?',
    currentStep: 2
  });

  assert(deepHelp2.status === 200, 'Follow-up question succeeded');
  assert(deepHelp2.body.isNewSession === false, 'Follow-up in same question marked as isNewSession: false');
  assert(deepHelp2.body.creditsLeft === 5, 'Credits remain 5 (no duplicate credit charge)');

  // 4. Test Strict Exam Mode Block
  console.log('\n--- 4. Exam Mode Strict Blocking ---');
  const examDeepHelp = await makeRequest({
    hostname: 'localhost',
    port: 3000,
    path: '/api/ai/deep-help',
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-user-id': testUserId,
      'x-requested-with': 'XMLHttpRequest'
    }
  }, {
    userId: testUserId,
    question: dummyQuestion,
    mode: 'exam',
    assessmentId: 'cat_foundation_quant',
    currentStep: 1
  });

  assert(examDeepHelp.status === 403, 'Exam mode Deep AI strictly returns 403 Forbidden');
  assert(examDeepHelp.body.status === 'exam_blocked', 'Status returns exam_blocked');
  assert(examDeepHelp.body.error.includes('Exam Mode'), 'Error mentions Exam Mode integrity');

  // 5. Test Priority Consumption & 0 Credit Lock
  console.log('\n--- 5. Priority Consumption & Credit Exhaustion ---');
  // Consume remaining 5 credits using 5 different questions
  for (let i = 2; i <= 6; i++) {
    const q = { ...dummyQuestion, id: `q_test_monetize_0${i}` };
    const res = await makeRequest({
      hostname: 'localhost',
      port: 3000,
      path: '/api/ai/deep-help',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-user-id': testUserId,
        'x-requested-with': 'XMLHttpRequest'
      }
    }, {
      userId: testUserId,
      question: q,
      mode: 'practice',
      assessmentId: 'cat_foundation_quant',
      currentStep: 1
    });
    assert(res.status === 200, `Question ${i} consumed credit, creditsLeft = ${res.body.creditsLeft}`);
  }

  // Verify wallet is now 0
  const balZero = await makeRequest({
    hostname: 'localhost',
    port: 3000,
    path: `/api/ai/credits?userId=${testUserId}`,
    method: 'GET',
    headers: { 'x-user-id': testUserId }
  });
  assert(balZero.body.total === 0, 'Wallet total is now 0 credits');

  // Attempting 7th question on 0 credits -> must return 403 locked
  const q7 = { ...dummyQuestion, id: 'q_test_monetize_07' };
  const lockedHelp = await makeRequest({
    hostname: 'localhost',
    port: 3000,
    path: '/api/ai/deep-help',
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-user-id': testUserId,
      'x-requested-with': 'XMLHttpRequest'
    }
  }, {
    userId: testUserId,
    question: q7,
    mode: 'practice',
    assessmentId: 'cat_foundation_quant',
    currentStep: 1
  });

  assert(lockedHelp.status === 403, '7th question returns 403 Locked on 0 credits');
  assert(lockedHelp.body.isLocked === true, 'isLocked is true on 0 credits');

  // 6. Test Assessment Entitlement Architecture
  console.log('\n--- 6. Assessment Entitlements & Mock Unlock ---');
  // Set cat_company_tcs to PREMIUM
  db.prepare("UPDATE tests SET accessType = 'PREMIUM' WHERE id = 'cat_company_tcs'").run();

  // Check access for testUserId -> should be forbidden
  const accessCheck1 = await makeRequest({
    hostname: 'localhost',
    port: 3000,
    path: '/api/assessments/cat_company_tcs/access',
    method: 'GET',
    headers: { 'x-user-id': testUserId }
  });
  assert(accessCheck1.body.allowed === false, 'Non-entitled user has allowed: false for PREMIUM test');

  // Grant individual entitlement to testUserId for cat_company_tcs
  const grantRes = await makeRequest({
    hostname: 'localhost',
    port: 3000,
    path: `/api/admin/users/${testUserId}/entitlements`,
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-user-id': 'pawankhot9@gmail.com',
      'x-requested-with': 'XMLHttpRequest'
    }
  }, {
    assessmentId: 'cat_company_tcs',
    grantedBy: 'PURCHASE'
  });
  assert(grantRes.status === 200, 'Admin granted individual assessment entitlement');

  // Check access again -> should be allowed with unlockedVia: 'entitlement'
  const accessCheck2 = await makeRequest({
    hostname: 'localhost',
    port: 3000,
    path: '/api/assessments/cat_company_tcs/access',
    method: 'GET',
    headers: { 'x-user-id': testUserId }
  });
  assert(accessCheck2.body.allowed === true, 'Entitled user now has allowed: true for cat_company_tcs');
  assert(accessCheck2.body.unlockedVia === 'entitlement', 'Unlocked via individual entitlement');

  // Other premium assessments remain locked
  db.prepare("UPDATE tests SET accessType = 'PREMIUM' WHERE id = 'cat_company_infosys'").run();
  const accessCheck3 = await makeRequest({
    hostname: 'localhost',
    port: 3000,
    path: '/api/assessments/cat_company_infosys/access',
    method: 'GET',
    headers: { 'x-user-id': testUserId }
  });
  assert(accessCheck3.body.allowed === false, 'cat_company_infosys remains locked for individual entitlement holder');

  // 7. Test Admin Credit Adjustment (Refill credits)
  console.log('\n--- 7. Admin Credit Adjustment & Purchased Priority ---');
  const adjustRes = await makeRequest({
    hostname: 'localhost',
    port: 3000,
    path: `/api/admin/users/${testUserId}/credits/adjust`,
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-user-id': 'pawankhot9@gmail.com',
      'x-requested-with': 'XMLHttpRequest'
    }
  }, {
    amount: 10,
    source: 'PURCHASED',
    description: '10 Pack Purchase'
  });
  assert(adjustRes.status === 200, 'Admin successfully adjusted credits');
  assert(adjustRes.body.balance.total === 10, 'Total credits now 10');
  assert(adjustRes.body.balance.purchased === 10, 'Purchased credits is 10');

  // Now q7 should succeed using PURCHASED credit
  const deepHelpPurchased = await makeRequest({
    hostname: 'localhost',
    port: 3000,
    path: '/api/ai/deep-help',
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-user-id': testUserId,
      'x-requested-with': 'XMLHttpRequest'
    }
  }, {
    userId: testUserId,
    question: q7,
    mode: 'practice',
    assessmentId: 'cat_foundation_quant',
    currentStep: 1
  });
  assert(deepHelpPurchased.status === 200, 'Question 7 succeeded after purchased credit grant');
  assert(deepHelpPurchased.body.creditsLeft === 9, 'Credits left is 9');

  // Clean up test user
  console.log('\n--- 8. Cleanup ---');
  db.prepare('DELETE FROM deep_ai_credit_ledger WHERE userId = ?').run(testUserId);
  db.prepare('DELETE FROM deep_ai_sessions WHERE userId = ?').run(testUserId);
  db.prepare('DELETE FROM assessment_entitlements WHERE userId = ?').run(testUserId);
  db.prepare('DELETE FROM users WHERE id = ?').run(testUserId);
  // Restore tests accessType to FREE
  db.prepare("UPDATE tests SET accessType = 'FREE' WHERE id IN ('cat_company_tcs', 'cat_company_infosys')").run();
  console.log('✅ Cleaned up temporary test data.');

  console.log('\n========================================================');
  console.log('🎉 ALL MONETIZATION PHASE A TESTS PASSED PERFECTLY!');
  console.log('========================================================\n');
}

runTests().catch((e) => {
  console.error('Unhandled test failure:', e);
  process.exit(1);
});
