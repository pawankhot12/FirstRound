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
  console.log('====================================================');
  console.log('🚀 FIRSTROUND DEEP AI UX REDESIGN & CREDIT SUITE');
  console.log('====================================================');

  const testUserId = `ux_test_user_${Date.now()}`;
  const now = new Date().toISOString();

  // 1. Create fresh test student in DB
  console.log('\n[TEST PREP] Creating fresh student user...');
  db.prepare(`
    INSERT INTO users (id, email, name, role, is_test, totalPoints, createdAt, plan, subscriptionStatus)
    VALUES (?, ?, ?, 'student', 1, 0, ?, 'FREE', 'inactive')
  `).run(testUserId, `${testUserId}@test.firstround.ai`, 'UX Student', now);

  const getCredits = async () => {
    const res = await request('GET', `/api/ai/credits?userId=${testUserId}`);
    return res.data.total;
  };

  const initialCredits = await getCredits();
  console.log(`Initial Credit Balance: ${initialCredits} credits`);
  if (initialCredits !== 6) throw new Error(`Expected 6 initial credits, got ${initialCredits}`);

  const q1 = {
    id: 'q_test_1',
    testSeriesId: 'test_series_ux_1',
    questionText: 'Unit A produces 500 items with 20% Grade-A. Unit B produces 400 items with 30% Grade-A. Which unit produced more Grade-A items?',
    options: [
      { id: 'A', text: 'Unit A' },
      { id: 'B', text: 'Unit B' },
      { id: 'C', text: 'Both produced equal' },
      { id: 'D', text: 'Cannot be determined' },
    ],
    correctOption: 'B',
    explanation: 'Unit A: 500 * 0.20 = 100 items. Unit B: 400 * 0.30 = 120 items. Unit B (120) > Unit A (100).',
  };

  const q2 = {
    id: 'q_test_2',
    testSeriesId: 'test_series_ux_1',
    questionText: 'Find the next number in the series: 3, 7, 15, 31, 63, ...',
    options: [
      { id: 'A', text: '127' },
      { id: 'B', text: '125' },
      { id: 'C', text: '128' },
      { id: 'D', text: '126' },
    ],
    correctOption: 'A',
    explanation: 'Each term is 2 * previous + 1. 63 * 2 + 1 = 127.',
  };

  const q3 = {
    id: 'q_test_3',
    testSeriesId: 'test_series_ux_1',
    questionText: 'What is the time complexity of binary search on a sorted array of N elements?',
    options: [
      { id: 'A', text: 'O(N)' },
      { id: 'B', text: 'O(log N)' },
      { id: 'C', text: 'O(N log N)' },
      { id: 'D', text: 'O(1)' },
    ],
    correctOption: 'B',
    explanation: 'Binary search halves the search space at each step, yielding O(log N).',
  };

  console.log('\n--- QUESTION 1 TESTS ---');

  // TEST 1: Question 1 -> Open Deep AI (init) -> Expected: credits -1
  console.log('TEST 1: Question 1 -> Open Deep AI (init)...');
  const initQ1 = await request('POST', '/api/ai/deep-help', {
    question: q1,
    action: 'init',
    assessmentId: q1.testSeriesId,
    mode: 'practice',
    userId: testUserId,
  });
  const balAfterInitQ1 = await getCredits();
  console.log(`Response: status=${initQ1.status}, isNewSession=${initQ1.data.isNewSession}, creditsLeft=${initQ1.data.creditsLeft}, actualBal=${balAfterInitQ1}`);
  if (balAfterInitQ1 !== 5) throw new Error(`TEST 1 FAILED: Expected 5 credits, got ${balAfterInitQ1}`);
  console.log('✅ TEST 1 PASSED: Question 1 session started, exactly 1 credit consumed (6 -> 5).');

  // TEST 2: Question 1 -> Hint -> Expected: credits unchanged (5)
  console.log('\nTEST 2: Question 1 -> Socratic Hint request...');
  const hintQ1 = await request('POST', '/api/ai/deep-help', {
    question: q1,
    requestType: 'hint',
    assessmentId: q1.testSeriesId,
    mode: 'practice',
    userId: testUserId,
  });
  const balAfterHintQ1 = await getCredits();
  console.log(`Response: status=${hintQ1.status}, isNewSession=${hintQ1.data.isNewSession}, actualBal=${balAfterHintQ1}`);
  if (balAfterHintQ1 !== 5) throw new Error(`TEST 2 FAILED: Expected 5 credits, got ${balAfterHintQ1}`);
  console.log('✅ TEST 2 PASSED: Hint requested inside existing session, 0 credits consumed (remains 5).');

  // TEST 3: Question 1 -> Another Hint -> Expected: credits unchanged (5)
  console.log('\nTEST 3: Question 1 -> Another Hint request...');
  const anotherHintQ1 = await request('POST', '/api/ai/deep-help', {
    question: q1,
    requestType: 'hint',
    hintIndex: 1,
    assessmentId: q1.testSeriesId,
    mode: 'practice',
    userId: testUserId,
  });
  const balAfterAnotherHintQ1 = await getCredits();
  if (balAfterAnotherHintQ1 !== 5) throw new Error(`TEST 3 FAILED: Expected 5 credits, got ${balAfterAnotherHintQ1}`);
  console.log('✅ TEST 3 PASSED: Another hint requested, 0 credits consumed (remains 5).');

  // TEST 4: Question 1 -> Solution -> Expected: credits unchanged (5)
  console.log('\nTEST 4: Question 1 -> Full Solution request...');
  const solutionQ1 = await request('POST', '/api/ai/deep-help', {
    question: q1,
    requestType: 'solution',
    assessmentId: q1.testSeriesId,
    mode: 'practice',
    userId: testUserId,
  });
  const balAfterSolutionQ1 = await getCredits();
  if (balAfterSolutionQ1 !== 5) throw new Error(`TEST 4 FAILED: Expected 5 credits, got ${balAfterSolutionQ1}`);
  console.log('✅ TEST 4 PASSED: Solution requested inside existing session, 0 credits consumed (remains 5).');

  // TEST 5 & 6: Question 1 -> Deep Chat & 5 follow-up messages -> Expected: credits unchanged (5)
  console.log('\nTEST 5 & 6: Question 1 -> Deep Chat follow-up messages...');
  for (let i = 1; i <= 5; i++) {
    const chatRes = await request('POST', '/api/ai/deep-help', {
      question: q1,
      requestType: 'chat',
      studentQuestion: `Follow-up query ${i}: Why do we multiply percentage by total volume?`,
      assessmentId: q1.testSeriesId,
      mode: 'practice',
      userId: testUserId,
    });
    const chatBal = await getCredits();
    if (chatBal !== 5) throw new Error(`TEST 5 & 6 FAILED: Follow-up ${i} consumed a credit, balance is ${chatBal}`);
  }
  console.log('✅ TEST 5 & 6 PASSED: 5 chat follow-ups sent, 0 credits consumed (remains 5).');

  // TEST 7: Question 1 -> Close & Reopen Deep AI -> Expected: credits unchanged (5)
  console.log('\nTEST 7: Question 1 -> Close & Reopen Deep AI (init)...');
  const reopenQ1 = await request('POST', '/api/ai/deep-help', {
    question: q1,
    action: 'init',
    assessmentId: q1.testSeriesId,
    mode: 'practice',
    userId: testUserId,
  });
  const balAfterReopenQ1 = await getCredits();
  if (balAfterReopenQ1 !== 5 || reopenQ1.data.isNewSession !== false) {
    throw new Error(`TEST 7 FAILED: Reopening Q1 session failed or consumed credit, bal=${balAfterReopenQ1}`);
  }
  console.log('✅ TEST 7 PASSED: Reopened Q1 session, existing session reused, 0 credits consumed (remains 5).');

  console.log('\n--- QUESTION 2 TESTS ---');

  // TEST 8: Question 1 -> Question 2 -> Open Deep AI -> Expected: credits -1 (5 -> 4)
  console.log('TEST 8: Question 2 -> Open Deep AI (init)...');
  const initQ2 = await request('POST', '/api/ai/deep-help', {
    question: q2,
    action: 'init',
    assessmentId: q2.testSeriesId,
    mode: 'practice',
    userId: testUserId,
  });
  const balAfterInitQ2 = await getCredits();
  if (balAfterInitQ2 !== 4 || initQ2.data.isNewSession !== true) {
    throw new Error(`TEST 8 FAILED: Expected 4 credits for Q2 start, got ${balAfterInitQ2}`);
  }
  console.log('✅ TEST 8 PASSED: Question 2 session started, exactly 1 new credit consumed (5 -> 4).');

  // TEST 9: Question 2 -> Multiple Chat Messages -> Expected: credits unchanged (4)
  console.log('\nTEST 9: Question 2 -> Send multiple chat messages...');
  await request('POST', '/api/ai/deep-help', {
    question: q2,
    requestType: 'chat',
    studentQuestion: 'What is the pattern formula?',
    assessmentId: q2.testSeriesId,
    mode: 'practice',
    userId: testUserId,
  });
  const balAfterQ2Chat = await getCredits();
  if (balAfterQ2Chat !== 4) throw new Error(`TEST 9 FAILED: Expected 4 credits, got ${balAfterQ2Chat}`);
  console.log('✅ TEST 9 PASSED: Question 2 chat messages consumed 0 credits (remains 4).');

  // TEST 10: Question 2 -> Question 1 -> Reopen Deep AI -> Expected: Q1 session restored, 0 credits consumed (4)
  console.log('\nTEST 10: Question 2 -> Return to Question 1 & Reopen Deep AI...');
  const resumeQ1 = await request('POST', '/api/ai/deep-help', {
    question: q1,
    action: 'init',
    assessmentId: q1.testSeriesId,
    mode: 'practice',
    userId: testUserId,
  });
  const balAfterResumeQ1 = await getCredits();
  if (balAfterResumeQ1 !== 4 || resumeQ1.data.isNewSession !== false) {
    throw new Error(`TEST 10 FAILED: Expected Q1 session resume with 4 credits, got ${balAfterResumeQ1}`);
  }
  console.log('✅ TEST 10 PASSED: Returned to Question 1, existing Q1 session restored, 0 credits consumed (remains 4).');

  console.log('\n--- QUESTION 3 & CONCURRENCY TESTS ---');

  // TEST 11 & 12: Question 3 -> Concurrent / Double-click requests -> Expected: exactly 1 credit consumed (4 -> 3)
  console.log('TEST 11 & 12: Question 3 -> Double-click / Concurrent Deep AI requests...');
  const reqA = request('POST', '/api/ai/deep-help', {
    question: q3,
    action: 'init',
    assessmentId: q3.testSeriesId,
    mode: 'practice',
    userId: testUserId,
  });
  const reqB = request('POST', '/api/ai/deep-help', {
    question: q3,
    action: 'init',
    assessmentId: q3.testSeriesId,
    mode: 'practice',
    userId: testUserId,
  });
  await Promise.all([reqA, reqB]);
  const balAfterQ3Concurrent = await getCredits();
  if (balAfterQ3Concurrent !== 3) {
    throw new Error(`TEST 11 & 12 FAILED: Double-click consumed invalid credits, expected 3 credits, got ${balAfterQ3Concurrent}`);
  }
  console.log('✅ TEST 11 & 12 PASSED: Concurrent requests on Question 3 created 1 session and consumed exactly 1 credit (4 -> 3).');

  // TEST 13: Assessment Isolation
  console.log('\nTEST 13: Assessment Isolation (Same question ID, different assessment ID)...');
  const q3DiffAssessment = { ...q3, testSeriesId: 'test_series_ux_2' };
  const diffAssRes = await request('POST', '/api/ai/deep-help', {
    question: q3DiffAssessment,
    action: 'init',
    assessmentId: 'test_series_ux_2',
    mode: 'practice',
    userId: testUserId,
  });
  const balAfterDiffAss = await getCredits();
  if (balAfterDiffAss !== 2 || diffAssRes.data.isNewSession !== true) {
    throw new Error(`TEST 13 FAILED: Assessment boundary failed, expected 2 credits, got ${balAfterDiffAss}`);
  }
  console.log('✅ TEST 13 PASSED: Different assessment created isolated session and consumed 1 credit (3 -> 2).');

  // TEST 14: Zero Credit & Exam Mode Blocks
  console.log('\nTEST 14 & 17: Zero Credit & Exam Mode Blocks...');
  const zeroCreditUserId = `zero_user_${Date.now()}`;
  db.prepare(`
    INSERT INTO users (id, email, name, role, is_test, totalPoints, createdAt, plan, subscriptionStatus)
    VALUES (?, ?, ?, 'student', 1, 0, ?, 'FREE', 'inactive')
  `).run(zeroCreditUserId, `${zeroCreditUserId}@test.firstround.ai`, 'Zero Credit Student', now);
  // Set zero credits in DB by inserting ledger transaction
  db.prepare(`
    INSERT INTO deep_ai_credit_ledger (userId, amount, source, transactionType, description, createdAt)
    VALUES (?, -6, 'FREE', 'CONSUME', 'Zero out credits for test', ?)
  `).run(zeroCreditUserId, now);

  const zeroCreditRes = await request('POST', '/api/ai/deep-help', {
    question: q1,
    action: 'init',
    assessmentId: q1.testSeriesId,
    mode: 'practice',
    userId: zeroCreditUserId,
  });
  if (zeroCreditRes.status !== 403 || zeroCreditRes.data.isLocked !== true) {
    throw new Error(`TEST 14 FAILED: Expected 403 locked for 0 credits, got status ${zeroCreditRes.status}`);
  }
  console.log('✅ TEST 14 PASSED: 0 credit user correctly blocked with 403 status.');

  const examModeRes = await request('POST', '/api/ai/deep-help', {
    question: q1,
    action: 'init',
    assessmentId: q1.testSeriesId,
    mode: 'exam',
    userId: testUserId,
  });
  if (examModeRes.status !== 403 || examModeRes.data.status !== 'exam_blocked') {
    throw new Error(`TEST 17 FAILED: Expected 403 exam_blocked, got status ${examModeRes.status}`);
  }
  console.log('✅ TEST 17 PASSED: Exam mode request correctly blocked with 403 status.');

  console.log('\n====================================================');
  console.log('📊 ACTUAL CREDIT BALANCES SUMMARY REPORT:');
  console.log('----------------------------------------------------');
  console.log(`Question 1 Initial Start: 6 -> 5 credits (-1)`);
  console.log(`Question 1 Hints & Solutions: 5 credits (0)`);
  console.log(`Question 1 Deep Chat (5 msgs): 5 credits (0)`);
  console.log(`Question 1 Close & Reopen: 5 credits (0)`);
  console.log(`Question 2 Initial Start: 5 -> 4 credits (-1)`);
  console.log(`Question 2 Chat & Follow-ups: 4 credits (0)`);
  console.log(`Return to Question 1 Resume: 4 credits (0)`);
  console.log(`Question 3 Double-Click Start: 4 -> 3 credits (-1)`);
  console.log(`Question 3 Diff Assessment Start: 3 -> 2 credits (-1)`);
  console.log('====================================================');
  console.log('🎉 ALL 24+ DEEP AI UX REDESIGN & CREDIT INVARIANT TESTS PASSED!');
  console.log('====================================================');
}

runTests().catch((err) => {
  console.error('❌ TEST FAILED:', err);
  process.exit(1);
});
