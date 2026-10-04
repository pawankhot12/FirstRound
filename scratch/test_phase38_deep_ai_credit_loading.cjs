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
      res.on('data', chunk => data += chunk);
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

async function runPhase38Suite() {
  console.log('====================================================');
  console.log('🧪 PHASE 38 — DEEP AI CREDIT LOADING & INVARIANT SUITE');
  console.log('====================================================');

  const testUserId = `phase38_credit_test_${Date.now()}`;
  const now = new Date().toISOString();

  // Create isolated test user with is_test = 1
  db.prepare(`
    INSERT INTO users (id, email, name, role, is_test, totalPoints, createdAt, plan, subscriptionStatus)
    VALUES (?, ?, 'Phase 38 Student', 'student', 1, 0, ?, 'FREE', 'inactive')
  `).run(testUserId, `${testUserId}@test.firstround.ai`, now);

  const authHeaders = { 'x-user-id': testUserId };

  try {
    // 1. Credit API returns successfully & valid format
    console.log('\n[TEST 1] Testing GET /api/ai/credits endpoint...');
    const creditsRes = await request('GET', `/api/ai/credits?userId=${testUserId}`, null, authHeaders);
    if (creditsRes.status !== 200 || !creditsRes.data.success) {
      throw new Error(`Credit API failed (Status ${creditsRes.status}): ${JSON.stringify(creditsRes.data)}`);
    }
    const cData = creditsRes.data;
    console.log('  ✅ Credit API returned valid JSON:', cData);
    if (cData.total !== 6 || cData.free !== 6) {
      throw new Error(`Expected initial 6 free credits, got total=${cData.total}, free=${cData.free}`);
    }

    // 2. Status API returns valid format
    console.log('\n[TEST 2] Testing GET /api/ai/deep-help/status endpoint...');
    const statusRes = await request('GET', `/api/ai/deep-help/status?userId=${testUserId}&mode=practice`, null, authHeaders);
    if (statusRes.status !== 200 || !statusRes.data.success) {
      throw new Error(`Status API failed (Status ${statusRes.status}): ${JSON.stringify(statusRes.data)}`);
    }
    console.log('  ✅ Deep AI status API returned:', statusRes.data);
    if (!statusRes.data.eligible) {
      throw new Error('Expected 6-credit user to be eligible in Practice Mode');
    }

    // 3. Verify opening Practice mode does NOT consume credit
    console.log('\n[TEST 3] Verifying Practice mode hydration does NOT consume credit...');
    const afterHydrationCredits = await request('GET', `/api/ai/credits?userId=${testUserId}`, null, authHeaders);
    if (afterHydrationCredits.data.total !== 6) {
      throw new Error(`Opening Practice mode consumed a credit! Expected 6, got ${afterHydrationCredits.data.total}`);
    }
    console.log('  ✅ 6 credits remain intact after hydration.');

    // 4. Test clicking Deep AI on Question 1 consumes exactly 1 credit
    console.log('\n[TEST 4] Test clicking Deep AI on Q1 consumes exactly 1 credit...');
    const q1Payload = {
      question: { id: 'q_phase38_1', questionText: 'What is 2+2?' },
      action: 'init',
      requestType: 'init',
      assessmentId: 'cat_foundation_quant',
      mode: 'practice'
    };
    const initRes = await request('POST', '/api/ai/deep-help', q1Payload, authHeaders);
    if (initRes.status !== 200 || !initRes.data.success) {
      throw new Error(`Deep AI init failed: ${JSON.stringify(initRes.data)}`);
    }
    console.log('  ✅ Deep AI session created:', initRes.data);
    if (initRes.data.creditsLeft !== 5) {
      throw new Error(`Expected 5 credits left after Q1 init, got ${initRes.data.creditsLeft}`);
    }

    // 5. Follow-ups (Hint, Solution, Chat) on Q1 consume 0 additional credits
    console.log('\n[TEST 5] Follow-ups on Q1 (Hint, Solution, Chat) consume 0 credits...');
    const hintRes = await request('POST', '/api/ai/deep-help', { ...q1Payload, requestType: 'hint', action: 'query' }, authHeaders);
    if (hintRes.data.creditsLeft !== 5) throw new Error(`Hint consumed credit! Got ${hintRes.data.creditsLeft}`);

    const solRes = await request('POST', '/api/ai/deep-help', { ...q1Payload, requestType: 'solution', action: 'query' }, authHeaders);
    if (solRes.data.creditsLeft !== 5) throw new Error(`Solution consumed credit! Got ${solRes.data.creditsLeft}`);

    const chatRes = await request('POST', '/api/ai/deep-help', { ...q1Payload, requestType: 'chat', studentQuestion: 'Why?', action: 'query' }, authHeaders);
    if (chatRes.data.creditsLeft !== 5) throw new Error(`Chat consumed credit! Got ${chatRes.data.creditsLeft}`);
    console.log('  ✅ Q1 follow-ups (Hint, Solution, Chat) consumed 0 extra credits.');

    // 6. Reopening Q1 consumes 0 credits
    console.log('\n[TEST 6] Reopening Q1 consumes 0 credits...');
    const reopenRes = await request('POST', '/api/ai/deep-help', q1Payload, authHeaders);
    if (reopenRes.data.creditsLeft !== 5) throw new Error(`Reopening Q1 consumed credit! Got ${reopenRes.data.creditsLeft}`);
    console.log('  ✅ Reopening Q1 consumed 0 credits.');

    // 7. Moving to Q2 and opening Deep AI consumes 1 new credit (5 -> 4)
    console.log('\n[TEST 7] Moving to Q2 and opening Deep AI consumes 1 new credit (5 -> 4)...');
    const q2Payload = { ...q1Payload, question: { id: 'q_phase38_2', questionText: 'What is 3+3?' } };
    const q2Res = await request('POST', '/api/ai/deep-help', q2Payload, authHeaders);
    if (q2Res.data.creditsLeft !== 4) throw new Error(`Expected 4 credits left after Q2, got ${q2Res.data.creditsLeft}`);
    console.log('  ✅ Q2 consumed 1 new credit. 4 credits left.');

    // 8. Exam mode remains strictly blocked
    console.log('\n[TEST 8] Verifying Exam mode is strictly blocked...');
    const examRes = await request('POST', '/api/ai/deep-help', { ...q1Payload, mode: 'exam' }, authHeaders);
    if (examRes.status !== 403 || !examRes.data.isLocked) {
      throw new Error(`Exam mode was not blocked! Status: ${examRes.status}`);
    }
    console.log('  ✅ Exam mode correctly blocked with 403.');

    // 9. Zero credit user sees locked state
    console.log('\n[TEST 9] Zero-credit user sees locked state...');
    const zeroUserId = `phase38_zero_${Date.now()}`;
    db.prepare(`
      INSERT INTO users (id, email, name, role, is_test, totalPoints, createdAt, plan, subscriptionStatus)
      VALUES (?, ?, 'Zero Student', 'student', 1, 0, ?, 'FREE', 'inactive')
    `).run(zeroUserId, `${zeroUserId}@test.firstround.ai`, now);
    db.prepare(`
      INSERT INTO deep_ai_credit_ledger (userId, amount, transactionType, source, description, createdAt)
      VALUES (?, -6, 'DEBIT', 'FREE', 'zero_init', ?)
    `).run(zeroUserId, now);

    const zeroStatusRes = await request('GET', `/api/ai/deep-help/status?userId=${zeroUserId}&mode=practice`, null, { 'x-user-id': zeroUserId });
    if (zeroStatusRes.data.status !== 'locked' || zeroStatusRes.data.remainingCredits !== 0) {
      throw new Error(`Zero-credit user status mismatch: ${JSON.stringify(zeroStatusRes.data)}`);
    }
    console.log('  ✅ Zero-credit user correctly returned locked status with 0 credits.');

    // 10. Concurrent requests double-click protection
    console.log('\n[TEST 10] Testing concurrent request session protection...');
    const q3Payload = { ...q1Payload, question: { id: 'q_phase38_3', questionText: 'Concurrent test' } };
    const [c1, c2] = await Promise.all([
      request('POST', '/api/ai/deep-help', q3Payload, authHeaders),
      request('POST', '/api/ai/deep-help', q3Payload, authHeaders),
    ]);
    if (c1.data.creditsLeft !== 3 || c2.data.creditsLeft !== 3) {
      throw new Error(`Concurrent requests broke atomic session! C1 credits=${c1.data.creditsLeft}, C2 credits=${c2.data.creditsLeft}`);
    }
    console.log('  ✅ Concurrent requests safely resulted in 1 credit deduction (4 -> 3).');

    // Clean up test users
    db.prepare("DELETE FROM users WHERE is_test = 1").run();
    db.prepare("DELETE FROM deep_ai_credit_ledger WHERE description = 'zero_init'").run();

    console.log('\n====================================================');
    console.log('🎉 PHASE 38 DEEP AI CREDIT LOADING SUITE PASSED');
    console.log('====================================================\n');
  } catch (err) {
    db.prepare('DELETE FROM users WHERE is_test = 1').run();
    throw err;
  }
}

runPhase38Suite().catch((err) => {
  console.error('\n❌ PHASE 38 SUITE FAILED:', err);
  process.exit(1);
});
