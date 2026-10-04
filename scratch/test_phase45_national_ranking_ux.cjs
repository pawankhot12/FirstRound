const http = require('http');

function makeRequest(method, path, body = null, headers = {}) {
  return new Promise((resolve, reject) => {
    const req = http.request(
      {
        host: '127.0.0.1',
        port: 3000,
        method,
        path,
        headers: {
          'Content-Type': 'application/json',
          ...headers,
        },
      },
      (res) => {
        let data = '';
        res.on('data', (chunk) => (data += chunk));
        res.on('end', () => {
          try {
            const parsed = data ? JSON.parse(data) : {};
            resolve({ status: res.statusCode, data: parsed });
          } catch (e) {
            resolve({ status: res.statusCode, raw: data });
          }
        });
      }
    );
    req.on('error', reject);
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

async function runPhase45Tests() {
  console.log('===========================================================');
  console.log('   PHASE 4.5 — NATIONAL RANKING 2.0 UX REDESIGN TEST      ');
  console.log('===========================================================\n');

  try {
    const timestamp = Date.now();

    // Clean test data from DB at start of suite
    const Database = require('better-sqlite3');
    const path = require('path');
    const db = new Database(path.resolve(__dirname, '../firstround.db'));
    db.prepare("DELETE FROM weekly_standings WHERE userId LIKE 'p45_%'").run();
    db.prepare("DELETE FROM users WHERE email LIKE 'p45_%'").run();
    db.prepare("DELETE FROM test_attempts WHERE userId LIKE 'p45_%'").run();

    // 1. Unranked User Initial State
    console.log('--- Test 1: Brand-New Registered User is Unranked ---');
    const newReg = await makeRequest('POST', '/api/auth/login-or-register', {
      email: `p45_newuser_${timestamp}@example.com`,
      name: 'Unranked Test User',
    });
    const newUser = newReg.data.user;

    const natUnrankedRes = await makeRequest('GET', `/api/league/national?userId=${newUser.id}`);
    console.log('National API Response for New User:', {
      isUnranked: natUnrankedRes.data.isUnranked,
      userExactRank: natUnrankedRes.data.userExactRank,
      userPercentile: natUnrankedRes.data.userPercentile,
    });

    if (natUnrankedRes.data.isUnranked !== true || natUnrankedRes.data.userExactRank !== null) {
      throw new Error('FAIL: New user without exam was not returned as unranked!');
    }
    console.log('✅ Test 1: Brand-new registered user is unranked: PASS\n');

    // 2. Practice-Only User Exclusion
    console.log('--- Test 2: Practice-Only User Excluded from National Ranking ---');
    const pracReg = await makeRequest('POST', '/api/auth/login-or-register', {
      email: `p45_practice_${timestamp}@example.com`,
      name: 'Practice Only Candidate',
    });
    const pracUser = pracReg.data.user;

    await makeRequest('POST', '/api/tests/tcs-nqt-2024-full/submit', {
      userId: pracUser.id,
      mode: 'practice',
      responses: [{ questionId: 'quant_001', selectedOption: 'A', timeSpentSeconds: 15 }],
      timeTakenSeconds: 300,
    });

    const natPracRes = await makeRequest('GET', `/api/league/national?userId=${pracUser.id}`);
    console.log('National API Response for Practice User:', {
      isUnranked: natPracRes.data.isUnranked,
      userExactRank: natPracRes.data.userExactRank,
    });

    if (natPracRes.data.isUnranked !== true) {
      throw new Error('FAIL: Practice-only user appeared in National Ranking!');
    }
    console.log('✅ Test 2: Practice-only user excluded from National Ranking: PASS\n');

    // 3. Exam Mode Entry & Rank Calculation
    console.log('--- Test 3: Official Exam Entry & National Rank Assignment ---');
    const testRes = await makeRequest('GET', '/api/tests/cat_foundation_quant');
    const questions = testRes.data.test?.questions || testRes.data.questions || [];
    const q1 = questions[0] || { id: 'q_quant_001', correctOption: 'A' };

    const subRes = await makeRequest('POST', '/api/tests/cat_foundation_quant/submit', {
      userId: newUser.id,
      mode: 'exam',
      responses: [{ questionId: q1.id, selectedOption: q1.correctOption || 'A', timeSpentSeconds: 15 }],
      timeTakenSeconds: 300,
    });
    console.log('Submit Test Score Points:', subRes.data?.attempt?.scorePoints);

    const natExamRes = await makeRequest('GET', `/api/league/national?userId=${newUser.id}`);
    console.log('National API Response after Exam:', {
      isUnranked: natExamRes.data.isUnranked,
      userExactRank: natExamRes.data.userExactRank,
      totalCandidates: natExamRes.data.totalCandidates,
    });

    if (natExamRes.data.isUnranked !== false) {
      throw new Error('FAIL: User was not ranked after official placement assessment!');
    }
    console.log('✅ Test 3: Official Exam entry & rank assignment: PASS\n');

    // 4. Company Filtering
    console.log('--- Test 4: Company Filter on National Ranking ---');
    const filterAllRes = await makeRequest('GET', '/api/league/national?company=all');
    const filterTcsRes = await makeRequest('GET', '/api/league/national?company=tcs');
    console.log('Company Filter Result:', {
      allCount: filterAllRes.data.totalCandidates,
      tcsCount: filterTcsRes.data.totalCandidates,
    });

    if (typeof filterTcsRes.data.totalCandidates !== 'number') {
      throw new Error('FAIL: Company filter endpoint returned invalid payload!');
    }
    console.log('✅ Test 4: Company filtering on National Ranking: PASS\n');

    console.log('===========================================================');
    console.log('   ALL PHASE 4.5 E2E TESTS PASSED SUCCESSFULLY!   ');
    console.log('===========================================================');
  } catch (err) {
    console.error('\n❌ PHASE 4.5 TEST FAILED:', err.message);
    process.exit(1);
  }
}

runPhase45Tests();
