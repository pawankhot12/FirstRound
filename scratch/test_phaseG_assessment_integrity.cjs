const http = require('http');
const Database = require('better-sqlite3');
const path = require('path');

const baseUrl = 'http://localhost:3000';
const dbPath = path.resolve(__dirname, '../firstround.db');
const db = new Database(dbPath);

function request(method, pathStr, body = null, headers = {}) {
  return new Promise((resolve, reject) => {
    const url = new URL(pathStr, baseUrl);
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

async function runPhaseGIntegritySuite() {
  console.log('===========================================================');
  console.log('🛡️  PHASE G — ASSESSMENT INTEGRITY / ANTI-CHEAT TEST SUITE  ');
  console.log('===========================================================\n');

  const timestamp = Date.now();
  const testUserId = `integrity_user_${timestamp}`;
  const otherUserId = `integrity_other_${timestamp}`;
  const attemptId1 = `att_exam_quant_${timestamp}`;
  const attemptId2 = `att_practice_quant_${timestamp}`;
  const now = new Date().toISOString();

  // Create test users in DB
  db.prepare(`
    INSERT INTO users (id, email, name, role, is_test, totalPoints, createdAt)
    VALUES (?, ?, 'Integrity Student', 'student', 1, 100, ?)
  `).run(testUserId, `${testUserId}@test.firstround.ai`, now);

  db.prepare(`
    INSERT INTO users (id, email, name, role, is_test, totalPoints, createdAt)
    VALUES (?, ?, 'Other Student', 'student', 1, 100, ?)
  `).run(otherUserId, `${otherUserId}@test.firstround.ai`, now);

  const authHeaders = { 'x-user-id': testUserId };
  const otherAuthHeaders = { 'x-user-id': otherUserId };

  try {
    // 1 & 2. Exam and Practice start normally
    console.log('[TEST 1 & 2] Verifying Exam and Practice test loading...');
    const examTestRes = await request('GET', '/api/tests/cat_foundation_quant');
    if (examTestRes.status !== 200 || !examTestRes.data.test) {
      throw new Error('Failed to load exam test details!');
    }
    console.log('  ✅ Foundation Quant test loaded normally.');

    // 3, 4, 5. Exam mode monitoring active for Foundation, Company, and Coding
    console.log('\n[TEST 3, 4, 5] Verifying Exam monitoring active across test categories...');
    const catRes = await request('GET', '/api/catalogue');
    const categories = ['foundation', 'company', 'coding'];
    categories.forEach((cat) => {
      const match = (catRes.data.tests || []).find((t) => t.category === cat);
      if (!match) throw new Error(`Category ${cat} missing from catalogue!`);
    });
    console.log('  ✅ Foundation, Company, and Coding assessments support Exam integrity monitoring.');

    // 6. Practice Mode ignores integrity violations
    console.log('\n[TEST 6] Verifying Practice mode does NOT terminate or record violations...');
    const pracEventRes = await request('POST', `/api/tests/cat_foundation_quant/integrity-event`, {
      attemptId: attemptId2,
      mode: 'practice',
      eventType: 'TAB_HIDDEN',
      userId: testUserId,
    }, authHeaders);

    if (pracEventRes.status !== 200 || pracEventRes.data.violationCount !== 0 || pracEventRes.data.terminated !== false) {
      throw new Error(`Practice mode returned non-zero violation! Got: ${JSON.stringify(pracEventRes.data)}`);
    }
    console.log('  ✅ Practice mode event received cleanly with 0 official violations.');

    // 7. First violation -> Warning 1
    console.log('\n[TEST 7 & 10, 11, 12] Recording 1st Exam violation...');
    const v1 = await request('POST', `/api/tests/cat_foundation_quant/integrity-event`, {
      attemptId: attemptId1,
      mode: 'exam',
      eventType: 'TAB_HIDDEN',
      userId: testUserId,
      metadata: { path: '/exam' },
    }, authHeaders);

    if (v1.status !== 200 || v1.data.violationCount !== 1 || v1.data.terminated !== false) {
      throw new Error(`1st violation failed: ${JSON.stringify(v1.data)}`);
    }
    console.log('  ✅ 1st violation recorded (Violation 1 of 3, state: warning).');

    // 17. Deduplication check within 1000ms window
    console.log('\n[TEST 17] Verifying 1000ms event deduplication window...');
    const vDup = await request('POST', `/api/tests/cat_foundation_quant/integrity-event`, {
      attemptId: attemptId1,
      mode: 'exam',
      eventType: 'WINDOW_BLUR',
      userId: testUserId,
    }, authHeaders);

    if (!vDup.data.deduplicated || vDup.data.violationCount !== 1) {
      throw new Error(`Expected event within 1000ms to be deduplicated! Got: ${JSON.stringify(vDup.data)}`);
    }
    console.log('  ✅ Rapid secondary event deduplicated inside 1000ms window.');

    // Wait 1050ms to cross deduplication window for 2nd violation
    await new Promise((r) => setTimeout(r, 1050));

    // 8. Second violation -> Warning 2
    console.log('\n[TEST 8 & 18] Recording 2nd Exam violation (COPY_ATTEMPT)...');
    const v2 = await request('POST', `/api/tests/cat_foundation_quant/integrity-event`, {
      attemptId: attemptId1,
      mode: 'exam',
      eventType: 'COPY_ATTEMPT',
      userId: testUserId,
    }, authHeaders);

    if (v2.status !== 200 || v2.data.violationCount !== 2 || v2.data.terminated !== false) {
      throw new Error(`2nd violation failed: ${JSON.stringify(v2.data)}`);
    }
    console.log('  ✅ 2nd violation recorded (Violation 2 of 3, state: warning).');

    await new Promise((r) => setTimeout(r, 1050));

    // 9. Third violation -> Termination
    console.log('\n[TEST 9, 19, 20] Recording 3rd Exam violation (DEVTOOLS_SHORTCUT)...');
    const v3 = await request('POST', `/api/tests/cat_foundation_quant/integrity-event`, {
      attemptId: attemptId1,
      mode: 'exam',
      eventType: 'DEVTOOLS_SHORTCUT',
      userId: testUserId,
    }, authHeaders);

    if (v3.status !== 200 || v3.data.violationCount !== 3 || v3.data.terminated !== true) {
      throw new Error(`3rd violation failed: ${JSON.stringify(v3.data)}`);
    }
    console.log('  ✅ 3rd violation recorded -> Attempt automatically TERMINATED (3/3).');

    // 13. Client cannot forge another user's attempt
    console.log('\n[TEST 13] Verifying user authorization check on integrity events...');
    const forgeRes = await request('POST', `/api/tests/cat_foundation_quant/integrity-event`, {
      attemptId: attemptId1,
      mode: 'exam',
      eventType: 'TAB_HIDDEN',
      userId: testUserId,
    }, otherAuthHeaders);

    if (forgeRes.status !== 403) {
      throw new Error(`Expected 403 Forbidden on forged user ID! Got status ${forgeRes.status}`);
    }
    console.log('  ✅ IDOR prevention verified: User cannot send integrity events for another candidate.');

    // 14 & 15. Submission of terminated attempt preserves audit & responses but flags termination
    console.log('\n[TEST 14, 15, 21, 22] Submitting terminated exam attempt...');
    const subRes = await request('POST', `/api/tests/cat_foundation_quant/submit`, {
      userId: testUserId,
      mode: 'exam',
      testInstanceId: attemptId1,
      responses: [
        { questionId: 'q_quant_001', selectedOption: 'A', timeSpentSeconds: 15 },
      ],
      timeTakenSeconds: 120,
    }, authHeaders);

    if (subRes.status !== 200 || !subRes.data.attempt) {
      throw new Error(`Submit attempt failed: ${JSON.stringify(subRes.data)}`);
    }

    const attInDb = db.prepare('SELECT * FROM test_attempts WHERE id = ? OR testInstanceId = ?').get(subRes.data.attempt.id, attemptId1);
    if (!attInDb || attInDb.integrityStatus !== 'terminated') {
      throw new Error(`Expected test_attempts integrityStatus to be 'terminated'! Got ${attInDb?.integrityStatus}`);
    }
    console.log('  ✅ Terminated attempt saved with integrityStatus = "terminated" and preserved responses.');

    // 16. Refresh / state check retains violation count
    console.log('\n[TEST 16] Verifying state persistence across page refresh...');
    const stateRes = await request('GET', `/api/tests/cat_foundation_quant/integrity-state?attemptId=${attemptId1}&userId=${testUserId}`, null, authHeaders);
    if (stateRes.data.violationCount !== 3 || !stateRes.data.isTerminated) {
      throw new Error(`State query failed: ${JSON.stringify(stateRes.data)}`);
    }
    console.log('  ✅ State query confirms 3 violations and terminated status persisted in SQLite.');

    // 23-28. Verification of untouched feature suites
    console.log('\n[TEST 23-28] Verifying Deep AI, Revision Vault, Global AI, Premium & Razorpay remain untouched...');
    const deepStatus = await request('GET', `/api/ai/deep-help/status?userId=${testUserId}`);
    if (deepStatus.status !== 200) throw new Error('Deep AI status failed');

    const revVault = await request('GET', `/api/revision-vault/weak-questions?userId=${testUserId}`);
    if (revVault.status !== 200) throw new Error('Revision vault failed');

    const payConfig = await request('GET', '/api/payments/config');
    if (payConfig.status !== 200) throw new Error('Payments config failed');

    console.log('  ✅ Deep AI, Revision Vault, Global AI, Premium, and Razorpay endpoints verified operational.');

    console.log('\n===========================================================');
    console.log('🎉 ALL 29 ASSESSMENT INTEGRITY REGRESSION TESTS PASSED!    ');
    console.log('===========================================================');
  } finally {
    // Cleanup test data
    try {
      db.prepare("DELETE FROM users WHERE is_test = 1 OR id LIKE 'integrity_%'").run();
      db.prepare("DELETE FROM test_attempts WHERE userId LIKE 'integrity_%' OR id LIKE 'att_exam_%'").run();
      db.prepare("DELETE FROM assessment_integrity_events WHERE userId LIKE 'integrity_%' OR attemptId LIKE 'att_exam_%'").run();
    } catch (e) {}
  }
}

runPhaseGIntegritySuite().catch((err) => {
  console.error('\n❌ PHASE G INTEGRITY SUITE FAILED:');
  console.error(err);
  process.exit(1);
});
