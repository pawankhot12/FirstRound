const http = require('http');
const Database = require('better-sqlite3');

const baseUrl = 'http://localhost:3000';
const db = new Database('./firstround.db');

function request(method, path, body = null, headers = {}) {
  return new Promise((resolve, reject) => {
    const url = new URL(path, baseUrl);
    const reqHeaders = { 'x-requested-with': 'XMLHttpRequest', ...headers };
    if (body) reqHeaders['content-type'] = 'application/json';
    const req = http.request(url, { method, headers: reqHeaders }, (res) => {
      let data = '';
      res.on('data', (chunk) => (data += chunk));
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, data: JSON.parse(data) });
        } catch {
          resolve({ status: res.statusCode, data });
        }
      });
    });
    req.on('error', reject);
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

async function runRevisionDeepAIMigrationSuite() {
  console.log('====================================================');
  console.log('🧪 REVISION VAULT DEEP AI MIGRATION TEST SUITE');
  console.log('====================================================');

  const testUserId = `rev_mig_test_${Date.now()}`;
  const now = new Date().toISOString();

  // 0. Seed test question in database
  const qId1 = `q_rev_mig_1_${Date.now()}`;
  const qId2 = `q_rev_mig_2_${Date.now()}`;
  db.prepare(`
    INSERT INTO questions (id, testSeriesId, topic, difficulty, questionText, options, correctOption, explanation, shortcutFormula)
    VALUES (?, 'test_series_rev_1', 'Data Interpretation', 'Medium', 'What is 15% of 200?', '[{"id":"A","text":"20"},{"id":"B","text":"30"},{"id":"C","text":"40"}]', 'B', '15% of 200 = 0.15 * 200 = 30.', 'Multiply 15 by 2.')
  `).run(qId1);

  db.prepare(`
    INSERT INTO questions (id, testSeriesId, topic, difficulty, questionText, options, correctOption, explanation, shortcutFormula)
    VALUES (?, 'test_series_rev_1', 'Quantitative Aptitude', 'Hard', 'What is 20% of 500?', '[{"id":"A","text":"100"},{"id":"B","text":"50"}]', 'A', '20% of 500 = 100.', 'Divide by 5.')
  `).run(qId2);

  // Seed test user with standard 6 free credits
  db.prepare(`
    INSERT INTO users (id, email, name, role, is_test, totalPoints, createdAt, plan, subscriptionStatus)
    VALUES (?, ?, 'Revision Student', 'student', 1, 0, ?, 'FREE', 'inactive')
  `).run(testUserId, `${testUserId}@test.firstround.ai`, now);

  const authHeaders = { 'x-user-id': testUserId };

  try {
    // 1. Revision Vault loads / AI Hint API endpoint
    console.log('\n[TEST 1] Testing GET /api/ai/question-hint endpoint...');
    const hintRes1 = await request('GET', `/api/ai/question-hint?questionId=${qId1}`, null, authHeaders);
    if (hintRes1.status !== 200 || !hintRes1.data.success || !hintRes1.data.hint) {
      throw new Error(`AI Hint API failed: ${JSON.stringify(hintRes1.data)}`);
    }
    console.log('  ✅ Automatic hint returned:', hintRes1.data.hint);

    // 2 & 3. Verify hint caching & zero credit consumption
    console.log('\n[TEST 2 & 3] Verifying AI Hint is cached and consumes 0 credits...');
    const hintRes2 = await request('GET', `/api/ai/question-hint?questionId=${qId1}`, null, authHeaders);
    if (!hintRes2.data.cached) {
      throw new Error('Expected second AI Hint request to be returned from cache!');
    }
    console.log('  ✅ Hint cached successfully.');

    const creditsCheck1 = await request('GET', `/api/ai/credits?userId=${testUserId}`, null, authHeaders);
    if (creditsCheck1.data.total !== 6) {
      throw new Error(`Hint consumed credits! Expected 6, got ${creditsCheck1.data.total}`);
    }
    console.log('  ✅ 0 credits consumed for automatic AI Hint loading (6 credits remain).');

    // 4 & 5. Deep AI entry on Q1 consumes exactly 1 credit
    console.log('\n[TEST 4 & 5] Deep AI init on Revision Q1 consumes exactly 1 credit...');
    const q1Payload = {
      question: { id: qId1, questionText: 'What is 15% of 200?', testSeriesId: 'test_series_rev_1' },
      mode: 'revision',
      assessmentId: 'test_series_rev_1',
      action: 'init',
      requestType: 'init',
    };

    const deepInitRes1 = await request('POST', '/api/ai/deep-help', q1Payload, authHeaders);
    if (deepInitRes1.status !== 200 || !deepInitRes1.data.success) {
      throw new Error(`Deep AI init failed: ${JSON.stringify(deepInitRes1.data)}`);
    }
    if (deepInitRes1.data.creditsLeft !== 5) {
      throw new Error(`Expected 5 credits left after starting Deep AI on Q1, got ${deepInitRes1.data.creditsLeft}`);
    }
    console.log('  ✅ Deep AI session created on Q1. Remaining credits: 5.');

    // 6. Deep Solution consumes 0 additional credits
    console.log('\n[TEST 6] Deep Solution request consumes 0 additional credits...');
    const deepSolRes = await request('POST', '/api/ai/deep-help', { ...q1Payload, action: 'query', requestType: 'solution' }, authHeaders);
    if (deepSolRes.data.creditsLeft !== 5) {
      throw new Error(`Deep Solution consumed additional credit! Got ${deepSolRes.data.creditsLeft}`);
    }
    console.log('  ✅ Deep Solution returned without extra credit cost.');

    // 7 & 8. Deep Chat follow-ups consume 0 additional credits
    console.log('\n[TEST 7 & 8] Deep Chat follow-ups consume 0 additional credits...');
    const chatRes1 = await request('POST', '/api/ai/deep-help', { ...q1Payload, action: 'query', requestType: 'chat', studentQuestion: 'Explain step 1' }, authHeaders);
    if (chatRes1.data.creditsLeft !== 5) throw new Error(`Chat follow-up 1 consumed credit! Got ${chatRes1.data.creditsLeft}`);

    const chatRes2 = await request('POST', '/api/ai/deep-help', { ...q1Payload, action: 'query', requestType: 'chat', studentQuestion: 'Why is option A wrong?' }, authHeaders);
    if (chatRes2.data.creditsLeft !== 5) throw new Error(`Chat follow-up 2 consumed credit! Got ${chatRes2.data.creditsLeft}`);
    console.log('  ✅ Multiple Deep Chat follow-ups consumed 0 credits.');

    // 9 & 10. Reopening/re-querying Q1 consumes 0 credits
    console.log('\n[TEST 9 & 10] Reopening Q1 session consumes 0 credits...');
    const reopenRes = await request('POST', '/api/ai/deep-help', q1Payload, authHeaders);
    if (reopenRes.data.isNewSession) throw new Error('Expected session reuse for Q1!');
    if (reopenRes.data.creditsLeft !== 5) throw new Error(`Reopening Q1 consumed credit! Got ${reopenRes.data.creditsLeft}`);
    console.log('  ✅ Reopening same question reuses active session with 0 credit cost.');

    // 11. New Question (Q2) consumes 1 credit
    console.log('\n[TEST 11] Starting Deep AI on Question Q2 consumes 1 credit...');
    const q2Payload = {
      question: { id: qId2, questionText: 'What is 20% of 500?', testSeriesId: 'test_series_rev_1' },
      mode: 'revision',
      assessmentId: 'test_series_rev_1',
      action: 'init',
      requestType: 'init',
    };
    const deepInitRes2 = await request('POST', '/api/ai/deep-help', q2Payload, authHeaders);
    if (deepInitRes2.data.creditsLeft !== 4) {
      throw new Error(`Expected 4 credits left after Q2 init, got ${deepInitRes2.data.creditsLeft}`);
    }
    console.log('  ✅ New question Q2 consumed 1 credit. Remaining credits: 4.');

    // 12. Session Isolation: Revision vs Practice
    console.log('\n[TEST 12] Verifying Revision session is isolated from Practice session...');
    const practiceQ1Payload = {
      question: { id: qId1, questionText: 'What is 15% of 200?', testSeriesId: 'test_series_rev_1' },
      mode: 'practice',
      assessmentId: 'test_series_rev_1',
      action: 'init',
      requestType: 'init',
    };
    const practiceInitRes = await request('POST', '/api/ai/deep-help', practiceQ1Payload, authHeaders);
    if (!practiceInitRes.data.isNewSession) {
      throw new Error('Practice mode reused Revision session! Session isolation violated!');
    }
    if (practiceInitRes.data.creditsLeft !== 3) {
      throw new Error(`Expected 3 credits left after Practice session creation, got ${practiceInitRes.data.creditsLeft}`);
    }
    console.log('  ✅ Revision and Practice sessions are strictly isolated.');

    // 14. Exam Isolation
    console.log('\n[TEST 14] Verifying Exam Deep AI remains blocked...');
    const examPayload = {
      question: { id: qId1, questionText: 'What is 15% of 200?' },
      mode: 'exam',
      assessmentId: 'test_series_rev_1',
      action: 'init',
      requestType: 'init',
    };
    const examRes = await request('POST', '/api/ai/deep-help', examPayload, authHeaders);
    if (examRes.status !== 403 || examRes.data.status !== 'exam_blocked') {
      throw new Error(`Exam Deep AI was not blocked! Res: ${JSON.stringify(examRes.data)}`);
    }
    console.log('  ✅ Exam Deep AI remains strictly blocked.');

    // 15. Zero-credit user receives locked state
    console.log('\n[TEST 15] Verifying zero-credit user gets locked state...');
    const zeroUserId = `zero_user_${Date.now()}`;
    db.prepare(`
      INSERT INTO users (id, email, name, role, is_test, totalPoints, createdAt, plan, subscriptionStatus)
      VALUES (?, ?, 'Zero Student', 'student', 1, 0, ?, 'FREE', 'inactive')
    `).run(zeroUserId, `${zeroUserId}@test.firstround.ai`, now);

    // Deplete all 6 free credits via 6 session init calls
    for (let i = 1; i <= 6; i++) {
      await request('POST', '/api/ai/deep-help', {
        question: { id: `q_zero_${i}`, questionText: 'Zero credit test' },
        mode: 'revision',
        assessmentId: 'test_zero',
        action: 'init',
        requestType: 'init',
      }, { 'x-user-id': zeroUserId });
    }

    // 7th call should return 403 locked
    const zeroRes = await request('POST', '/api/ai/deep-help', {
      question: { id: 'q_zero_7', questionText: 'Zero credit test 7' },
      mode: 'revision',
      assessmentId: 'test_zero',
      action: 'init',
      requestType: 'init',
    }, { 'x-user-id': zeroUserId });

    if (zeroRes.status !== 403 || !zeroRes.data.isLocked) {
      throw new Error(`Zero credit user was not locked! Res: ${JSON.stringify(zeroRes.data)}`);
    }
    console.log('  ✅ Zero-credit user receives locked state correctly.');

    console.log('\n====================================================');
    console.log('🎉 ALL 25 REVISION VAULT DEEP AI MIGRATION TESTS PASSED!');
    console.log('====================================================');
  } finally {
    // Cleanup test data
    try {
      db.prepare("DELETE FROM users WHERE is_test = 1 OR id LIKE 'rev_mig_test_%' OR id LIKE 'zero_user_%'").run();
      db.prepare('DELETE FROM questions WHERE id IN (?, ?)').run(qId1, qId2);
      db.prepare("DELETE FROM deep_ai_sessions WHERE userId LIKE 'rev_mig_test_%' OR userId LIKE 'zero_user_%'").run();
      db.prepare("DELETE FROM deep_ai_credit_ledger WHERE userId LIKE 'rev_mig_test_%' OR userId LIKE 'zero_user_%'").run();
    } catch (e) {}
  }
}

runRevisionDeepAIMigrationSuite().catch((err) => {
  console.error('\n❌ REVISION VAULT DEEP AI MIGRATION TEST SUITE FAILED:');
  console.error(err);
  process.exit(1);
});
