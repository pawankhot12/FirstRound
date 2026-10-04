const Database = require('better-sqlite3');
const path = require('path');
const http = require('http');

const dbPath = path.resolve(process.cwd(), 'firstround.db');
const db = new Database(dbPath);

function request(method, path, body, headers = {}) {
  return new Promise((resolve, reject) => {
    const data = body ? JSON.stringify(body) : null;
    const req = http.request(
      {
        hostname: 'localhost',
        port: 3000,
        path,
        method,
        headers: {
          'Content-Type': 'application/json',
          'X-Requested-With': 'XMLHttpRequest',
          ...(data ? { 'Content-Length': Buffer.byteLength(data) } : {}),
          ...headers,
        },
      },
      (res) => {
        let raw = '';
        res.on('data', (chunk) => (raw += chunk));
        res.on('end', () => {
          try {
            const parsed = JSON.parse(raw);
            resolve({ status: res.statusCode, data: parsed, headers: res.headers });
          } catch (e) {
            resolve({ status: res.statusCode, text: raw, headers: res.headers });
          }
        });
      }
    );
    req.on('error', reject);
    if (data) req.write(data);
    req.end();
  });
}

async function runTests() {
  console.log('🚀 Starting Deep AI Credit Wallet UI & Verification Suite...');
  const testUserId = `wallet_test_user_${Date.now()}`;
  const now = new Date().toISOString();

  // 1. Create fresh student user in DB
  console.log('\n[1] Registering fresh student user...');
  db.prepare(`
    INSERT INTO users (id, email, name, role, totalPoints, createdAt, plan, subscriptionStatus)
    VALUES (?, ?, ?, 'student', 0, ?, 'FREE', 'inactive')
  `).run(testUserId, `${testUserId}@student.firstround.test`, 'Wallet Student', now);
  console.log(`✅ Student created: ID=${testUserId}`);

  // 2. Test GET /api/ai/credits for fresh user (Must be 6 total / 6 free / 0 purchased / 0 premium)
  console.log('\n[2] Testing GET /api/ai/credits for fresh user...');
  const creditsRes = await request('GET', `/api/ai/credits?userId=${testUserId}`);
  console.log('Credits Response:', creditsRes.data);
  if (creditsRes.status !== 200) {
    throw new Error(`GET /api/ai/credits failed: ${JSON.stringify(creditsRes.data)}`);
  }
  if (creditsRes.data.total !== 6 || creditsRes.data.free !== 6 || creditsRes.data.purchased !== 0 || creditsRes.data.premium !== 0) {
    throw new Error(`Unexpected credit balance: ${JSON.stringify(creditsRes.data)}`);
  }
  console.log('✅ Fresh user credit balance verified: 6 total / 6 free / 0 purchased / 0 premium');

  // 3. Use Deep AI on Question 1 -> verify credit drops to 5
  console.log('\n[3] Calling Deep AI on Question 1...');
  const q1 = {
    id: 'q_wallet_quant_1',
    topic: 'Quantitative Aptitude',
    subTopic: 'Time & Work',
    questionText: 'If 4 workers build a wall in 6 days, how many workers build it in 3 days?',
    options: [{ id: 'A', text: '6' }, { id: 'B', text: '8' }, { id: 'C', text: '10' }],
    correctOption: 'B',
  };
  const deepRes1 = await request('POST', '/api/ai/deep-help', {
    userId: testUserId,
    question: q1,
    userSelectedOption: 'A',
    currentStep: 1,
  });
  if (deepRes1.status !== 200 || deepRes1.data.creditsLeft !== 5) {
    throw new Error(`Deep AI call 1 failed: ${JSON.stringify(deepRes1.data)}`);
  }

  const creditsResAfter1 = await request('GET', `/api/ai/credits?userId=${testUserId}`);
  if (creditsResAfter1.data.total !== 5 || creditsResAfter1.data.free !== 5) {
    throw new Error(`Credits after session 1 should be 5, got: ${JSON.stringify(creditsResAfter1.data)}`);
  }
  console.log('✅ Balance after 1 session accurately updated to 5 credits in GET /api/ai/credits');

  // 4. Follow-up query in same session -> verify credit remains 5
  console.log('\n[4] Sending follow-up query in same session...');
  const followupRes = await request('POST', '/api/ai/deep-help', {
    userId: testUserId,
    question: q1,
    userSelectedOption: 'A',
    currentStep: 2,
    followUpQuery: 'Can you show step-by-step calculation?',
  });
  if (followupRes.status !== 200 || followupRes.data.creditsLeft !== 5) {
    throw new Error(`Follow-up should maintain 5 credits, got: ${JSON.stringify(followupRes.data)}`);
  }

  const creditsResAfterFollowup = await request('GET', `/api/ai/credits?userId=${testUserId}`);
  if (creditsResAfterFollowup.data.total !== 5) {
    throw new Error(`Credits after follow-up changed unexpectedly: ${JSON.stringify(creditsResAfterFollowup.data)}`);
  }
  console.log('✅ Follow-up query preserved 5 credits balance');

  // 5. Exhaust credits to 0 and verify wallet breakdown
  console.log('\n[5] Consuming remaining 5 credits to verify 0 balance state...');
  for (let i = 2; i <= 6; i++) {
    const qTest = {
      id: `q_wallet_bulk_${i}`,
      topic: 'Logical Reasoning',
      questionText: `Logic puzzle ${i}`,
      options: [{ id: 'A', text: 'A' }, { id: 'B', text: 'B' }],
      correctOption: 'A',
    };
    await request('POST', '/api/ai/deep-help', {
      userId: testUserId,
      question: qTest,
      currentStep: 1,
    });
  }

  const creditsResZero = await request('GET', `/api/ai/credits?userId=${testUserId}`);
  console.log('Credits Response at Zero:', creditsResZero.data);
  if (creditsResZero.data.total !== 0 || creditsResZero.data.free !== 0 || creditsResZero.data.purchased !== 0 || creditsResZero.data.premium !== 0) {
    throw new Error(`Credits should all be 0, got: ${JSON.stringify(creditsResZero.data)}`);
  }
  console.log('✅ 0 credit breakdown verified: 0 total, 0 free, 0 purchased, 0 premium');

  // 6. Test Premium User with credit breakdown
  console.log('\n[6] Testing Premium user credit ledger and balance...');
  const premUserId = `prem_wallet_user_${Date.now()}`;
  db.prepare(`
    INSERT INTO users (id, email, name, role, totalPoints, createdAt, plan, subscriptionStatus)
    VALUES (?, ?, ?, 'student', 0, ?, 'PREMIUM', 'active')
  `).run(premUserId, `${premUserId}@premium.firstround.test`, 'Premium Student', now);

  // Add 100 PREMIUM credits via ledger
  db.prepare(`
    INSERT INTO deep_ai_credit_ledger (userId, amount, source, transactionType, description, createdAt)
    VALUES (?, 100, 'PREMIUM', 'ADMIN_ADJUST', 'Monthly premium subscription credits', ?)
  `).run(premUserId, now);

  const premCreditsRes = await request('GET', `/api/ai/credits?userId=${premUserId}`);
  console.log('Premium Credits Response:', premCreditsRes.data);
  if (premCreditsRes.data.premium !== 100 || premCreditsRes.data.total !== 106) {
    throw new Error(`Expected 106 total and 100 premium, got: ${JSON.stringify(premCreditsRes.data)}`);
  }
  console.log('✅ Premium user credit wallet breakdown verified: 106 total (6 free + 100 premium)');

  // 7. Verify Exam Mode blockage
  console.log('\n[7] Verifying Exam Mode blockage...');
  const examBlockRes = await request('POST', '/api/ai/deep-help', {
    userId: premUserId,
    mode: 'exam',
    question: q1,
  });
  if (examBlockRes.status !== 403) {
    throw new Error(`Exam mode should be 403, got: ${examBlockRes.status}`);
  }
  console.log('✅ Exam Mode blockage strictly intact (403)');

  // 8. Verify Standard AI Doubt Solver remains free
  console.log('\n[8] Verifying Standard AI Doubt Solver / Copilot...');
  const copilotRes = await request('POST', '/api/ai/ask-doubt', {
    userId: testUserId,
    question: q1,
    studentQuestion: 'What is the formula?',
  });
  if (copilotRes.status !== 200 || !copilotRes.data?.explanation) {
    throw new Error(`Copilot failed: ${JSON.stringify(copilotRes.data)}`);
  }
  console.log('✅ Standard AI Copilot unmetered and operational');

  console.log('\n======================================================');
  console.log('🎉 ALL AI CREDIT WALLET TESTS SUCCESSFULLY PASSED!');
  console.log('======================================================\n');
}

runTests().catch((err) => {
  console.error('❌ Test failed:', err);
  process.exit(1);
});
