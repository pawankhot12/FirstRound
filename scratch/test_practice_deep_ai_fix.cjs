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
  console.log('🚀 Starting Practice Deep AI Fix & Monetization Regression Tests...');
  const testUserId = `practice_user_${Date.now()}`;
  const now = new Date().toISOString();

  // 1. Create fresh student user in DB
  console.log('\n[1] Registering fresh student user...');
  db.prepare(`
    INSERT INTO users (id, email, name, role, totalPoints, createdAt, plan, subscriptionStatus)
    VALUES (?, ?, ?, 'student', 0, ?, 'FREE', 'inactive')
  `).run(testUserId, `${testUserId}@student.firstround.test`, 'Practice Student', now);
  console.log(`✅ Student created: ID=${testUserId}`);

  // 2. Verify Initial Credit Status (Must be 6, NOT 999)
  console.log('\n[2] Checking initial Deep AI credit balance (must be 6, never 999)...');
  const statusRes = await request('GET', `/api/ai/deep-help/status?userId=${testUserId}`);
  console.log('Status Response:', statusRes.data);
  if (statusRes.data.remainingCredits !== 6) {
    throw new Error(`Expected remainingCredits=6, got ${statusRes.data.remainingCredits}`);
  }
  if (statusRes.data.status !== 'eligible') {
    throw new Error(`Expected status='eligible', got ${statusRes.data.status}`);
  }
  console.log('✅ Real credit balance verified: exactly 6 credits');

  // 3. Question 1: First Deep AI invocation
  console.log('\n[3] Calling Deep AI on Question 1 (new session)...');
  const q1 = {
    id: 'q_quant_test_1',
    topic: 'Quantitative Aptitude',
    subTopic: 'Time & Work',
    questionText: 'If 6 men can do a piece of work in 12 days, how many men are needed to do it in 8 days?',
    options: [
      { id: 'A', text: '8' },
      { id: 'B', text: '9' },
      { id: 'C', text: '10' },
      { id: 'D', text: '12' },
    ],
    correctOption: 'B',
  };

  const ask1Res = await request('POST', '/api/ai/deep-help', {
    userId: testUserId,
    question: q1,
    userSelectedOption: 'A',
    currentStep: 1,
  });
  console.log('Deep AI Response 1:', {
    explanation: ask1Res.data?.explanation?.slice(0, 60) + '...',
    creditsLeft: ask1Res.data?.creditsLeft,
    sessionId: ask1Res.data?.sessionId,
  });
  if (ask1Res.status !== 200) {
    throw new Error(`Ask 1 failed: ${JSON.stringify(ask1Res)}`);
  }
  if (ask1Res.data.creditsLeft !== 5) {
    throw new Error(`Expected creditsLeft=5, got ${ask1Res.data.creditsLeft}`);
  }
  console.log('✅ Consumed 1 credit. Remaining: 5 credits');

  // 4. Question 1: Follow-up in the same session (Must NOT consume credit)
  console.log('\n[4] Sending follow-up in same Question 1 session (should NOT consume credit)...');
  const ask1FollowupRes = await request('POST', '/api/ai/deep-help', {
    userId: testUserId,
    question: q1,
    userSelectedOption: 'A',
    currentStep: 2,
    followUpQuery: 'Why is it inversely proportional?',
  });
  if (ask1FollowupRes.status !== 200) {
    throw new Error(`Follow-up failed: ${JSON.stringify(ask1FollowupRes)}`);
  }
  if (ask1FollowupRes.data.creditsLeft !== 5) {
    throw new Error(`Expected creditsLeft=5 after follow-up, got ${ask1FollowupRes.data.creditsLeft}`);
  }
  console.log('✅ Follow-up in same session did NOT consume extra credit. Remaining: 5 credits');

  // 5. Question 2: New question invocation (Must consume 1 credit -> 4 remaining)
  console.log('\n[5] Calling Deep AI on Question 2 (new session)...');
  const q2 = {
    id: 'q_quant_test_2',
    topic: 'Quantitative Aptitude',
    subTopic: 'Percentages',
    questionText: 'A price increased by 20% and then decreased by 20%. What is the net percentage change?',
    options: [
      { id: 'A', text: '0%' },
      { id: 'B', text: '4% decrease' },
      { id: 'C', text: '4% increase' },
      { id: 'D', text: '2% decrease' },
    ],
    correctOption: 'B',
  };
  const ask2Res = await request('POST', '/api/ai/deep-help', {
    userId: testUserId,
    question: q2,
    userSelectedOption: 'A',
    currentStep: 1,
  });
  if (ask2Res.status !== 200 || ask2Res.data.creditsLeft !== 4) {
    throw new Error(`Expected creditsLeft=4 for Q2, got ${ask2Res.data?.creditsLeft}`);
  }
  console.log('✅ Q2 consumed 1 credit. Remaining: 4 credits');

  // 6. Exhaust remaining credits to 0 and verify locked status
  console.log('\n[6] Consuming remaining 4 credits to verify 0 balance behavior...');
  for (let i = 3; i <= 6; i++) {
    const qTest = {
      id: `q_test_bulk_${i}`,
      topic: 'Logic',
      questionText: `Test question ${i}`,
      options: [{ id: 'A', text: 'Option A' }, { id: 'B', text: 'Option B' }],
      correctOption: 'A',
    };
    const res = await request('POST', '/api/ai/deep-help', {
      userId: testUserId,
      question: qTest,
      currentStep: 1,
    });
    if (res.status !== 200) throw new Error(`Step ${i} failed: ${JSON.stringify(res)}`);
  }

  const statusAtZero = await request('GET', `/api/ai/deep-help/status?userId=${testUserId}`);
  console.log('Status at 0 credits:', statusAtZero.data);
  if (statusAtZero.data.remainingCredits !== 0 || statusAtZero.data.status !== 'locked') {
    throw new Error(`Expected remainingCredits=0 and status='locked', got ${JSON.stringify(statusAtZero.data)}`);
  }
  console.log('✅ 0 credits balance verified: locked status returned for free user');

  // 7. Exam Mode Isolation Verification (Deep AI MUST be blocked in Exam mode)
  console.log('\n[7] Testing Exam Mode blockage (Must return 403 exam_blocked)...');
  const examRes = await request('POST', '/api/ai/deep-help', {
    userId: testUserId,
    mode: 'exam',
    question: q1,
    userSelectedOption: 'A',
  });
  if (examRes.status !== 403 || (examRes.data.status !== 'exam_blocked' && examRes.data.code !== 'exam_blocked')) {
    throw new Error(`Expected 403 exam_blocked in exam mode, got ${examRes.status} ${JSON.stringify(examRes.data)}`);
  }
  console.log('✅ Exam Mode isolation strictly verified: 403 exam_blocked');

  // 8. Verify Standard AI Doubt Solver / Copilot is unaffected and free
  console.log('\n[8] Verifying Standard AI Doubt Solver / Copilot is unaffected and unmetered...');
  const copilotRes = await request('POST', '/api/ai/ask-doubt', {
    userId: testUserId,
    question: q1,
    userSelectedOption: 'A',
    studentQuestion: 'Can you explain the formula in simple terms?',
  });
  if (copilotRes.status !== 200 || !copilotRes.data?.explanation) {
    throw new Error(`Copilot / ask-doubt failed: ${JSON.stringify(copilotRes.data)}`);
  }
  console.log('✅ Standard AI Doubt solver remains fully functional, unaffected, and unmetered.');

  console.log('\n========================================');
  console.log('🎉 ALL PRACTICE DEEP AI FIX TESTS PASSED!');
  console.log('========================================\n');
}

runTests().catch((err) => {
  console.error('❌ Test failed:', err);
  process.exit(1);
});
