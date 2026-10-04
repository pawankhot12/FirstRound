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

async function runPhase43Tests() {
  console.log('====================================================');
  console.log('   PHASE 4.3 — REAL USERS ONLY + ACTIVE LEAGUES TEST');
  console.log('====================================================\n');

  // Clean test standings before running test suite
  const Database = require('better-sqlite3');
  const path = require('path');
  const db = new Database(path.resolve(__dirname, '../firstround.db'));
  db.prepare("DELETE FROM weekly_standings WHERE userId LIKE 'user_%' OR userId LIKE 'p43_%'").run();
  db.prepare("DELETE FROM users WHERE email LIKE 'p43_%'").run();
  db.prepare("DELETE FROM test_attempts WHERE userId LIKE 'p43_%'").run();

  try {
    const timestamp = Date.now();

    // 1. Verify Registered but no Exam user -> NOT in league (Requirement H & I)
    console.log('--- Test H & I: Registered User with No Exam is NOT in League ---');
    const noExamUserRes = await makeRequest('POST', '/api/auth/login-or-register', {
      email: `p43_noexam_${timestamp}@example.com`,
      name: 'No Exam User',
    });
    const noExamUser = noExamUserRes.data.user;
    console.log(`Created user: ${noExamUser.id} (${noExamUser.email})`);

    const leagueNoExamRes = await makeRequest('GET', `/api/league/current?userId=${noExamUser.id}`);
    console.log('League response for No Exam User:', {
      isParticipant: leagueNoExamRes.data.isParticipant,
      cohortSize: leagueNoExamRes.data.cohortSize,
      cohortStatus: leagueNoExamRes.data.cohortStatus,
      userGroup: leagueNoExamRes.data.userGroup,
    });
    if (leagueNoExamRes.data.isParticipant !== false || leagueNoExamRes.data.cohortSize !== 0) {
      throw new Error('FAIL: User without an exam was assigned to a league cohort!');
    }
    console.log('✅ Test H & I: Registered user without exam is NOT in league: PASS\n');

    // 2. Verify Practice-only user -> NOT in league (Requirement G)
    console.log('--- Test G: Practice-Only User is NOT in League ---');
    const practiceUserRes = await makeRequest('POST', '/api/auth/login-or-register', {
      email: `p43_practice_${timestamp}@example.com`,
      name: 'Practice Only User',
    });
    const practiceUser = practiceUserRes.data.user;

    await makeRequest('POST', '/api/tests/tcs-nqt-2024-full/submit', {
      userId: practiceUser.id,
      mode: 'practice',
      responses: [{ questionId: 'quant_001', selectedOption: 'A', timeSpentSeconds: 15 }],
      timeTakenSeconds: 300,
    });

    const leaguePracticeRes = await makeRequest('GET', `/api/league/current?userId=${practiceUser.id}`);
    console.log('League response for Practice User:', {
      isParticipant: leaguePracticeRes.data.isParticipant,
      cohortSize: leaguePracticeRes.data.cohortSize,
      weeklyXp: leaguePracticeRes.data.weeklyXp,
    });
    if (leaguePracticeRes.data.isParticipant !== false || leaguePracticeRes.data.weeklyXp !== 0) {
      throw new Error('FAIL: Practice completion created league membership or granted Weekly XP!');
    }
    console.log('✅ Test G: Practice-only user is NOT in league: PASS\n');

    // 3. Test A: 1 Real Test User Completes Exam -> Cohort Size 1, ACTIVE (Requirement A)
    console.log('--- Test A: 1 Real User Completes Exam -> Cohort Size 1, ACTIVE ---');
    const user1Res = await makeRequest('POST', '/api/auth/login-or-register', {
      email: `p43_user1_${timestamp}@example.com`,
      name: 'Real User 1',
    });
    const user1 = user1Res.data.user;

    await makeRequest('POST', '/api/tests/tcs-nqt-2024-full/submit', {
      userId: user1.id,
      mode: 'exam',
      responses: [{ questionId: 'quant_001', selectedOption: 'A', timeSpentSeconds: 15 }],
      timeTakenSeconds: 300,
    });

    const league1Res = await makeRequest('GET', `/api/league/current?userId=${user1.id}`);
    console.log('User 1 League State:', {
      isParticipant: league1Res.data.isParticipant,
      cohortSize: league1Res.data.cohortSize,
      cohortStatus: league1Res.data.cohortStatus,
      movement: league1Res.data.movement,
      currentRank: league1Res.data.currentRank,
    });

    if (
      league1Res.data.isParticipant !== true ||
      league1Res.data.cohortSize !== 1 ||
      league1Res.data.cohortStatus !== 'ACTIVE' ||
      league1Res.data.movement === 'PENDING'
    ) {
      throw new Error(`FAIL: Single player cohort state invalid! Expected ACTIVE/PROMOTE, got status=${league1Res.data.cohortStatus}, movement=${league1Res.data.movement}`);
    }
    console.log('✅ Test A: 1 real test user -> cohort size 1, ACTIVE: PASS\n');

    const activeGroupId = league1Res.data.userGroup;
    const activeSeasonId = league1Res.data.activeSeason.id;

    // 4. Test B: Add 5 more users (total 6 users in same cohort) -> Cohort Size 6, ACTIVE (Requirement B)
    console.log('--- Test B: 6 Real Users in Cohort -> Cohort Size 6, ACTIVE ---');
    const groupUsers = [user1];

    for (let i = 2; i <= 6; i++) {
      const uRes = await makeRequest('POST', '/api/auth/login-or-register', {
        email: `p43_user${i}_${timestamp}@example.com`,
        name: `Real User ${i}`,
      });
      const u = uRes.data.user;
      groupUsers.push(u);

      await makeRequest('POST', '/api/tests/tcs-nqt-2024-full/submit', {
        userId: u.id,
        mode: 'exam',
        responses: [{ questionId: 'quant_001', selectedOption: 'A', timeSpentSeconds: 15 }],
        timeTakenSeconds: 300,
      });
    }

    const cohort6Res = await makeRequest('GET', `/api/league/cohort/${activeSeasonId}/${activeGroupId}`);
    console.log('Cohort endpoint (6 users):', {
      cohortSize: cohort6Res.data.cohortSize,
      status: cohort6Res.data.status,
    });
    if (cohort6Res.data.cohortSize !== 6 || cohort6Res.data.status !== 'ACTIVE') {
      throw new Error(`FAIL: Expected cohortSize 6 and status ACTIVE, got size=${cohort6Res.data.cohortSize}, status=${cohort6Res.data.status}`);
    }
    console.log('✅ Test B: 6 real test users -> cohort size 6, ACTIVE: PASS\n');

    // 5. Test C & D & E: Fill cohort to 40 players, then add 41st player (Requirement C, D, E)
    console.log('--- Test C, D & E: Fill cohort to 40 (FULL), 41st user goes to new ACTIVE cohort ---');
    for (let i = 7; i <= 40; i++) {
      const uRes = await makeRequest('POST', '/api/auth/login-or-register', {
        email: `p43_user${i}_${timestamp}@example.com`,
        name: `Real User ${i}`,
      });
      const u = uRes.data.user;
      groupUsers.push(u);

      await makeRequest('POST', '/api/tests/tcs-nqt-2024-full/submit', {
        userId: u.id,
        mode: 'exam',
        responses: [{ questionId: 'quant_001', selectedOption: 'A', timeSpentSeconds: 15 }],
        timeTakenSeconds: 300,
      });
    }

    const cohort40Res = await makeRequest('GET', `/api/league/cohort/${activeSeasonId}/${activeGroupId}`);
    console.log('Cohort endpoint (40 users):', {
      cohortSize: cohort40Res.data.cohortSize,
      status: cohort40Res.data.status,
    });
    if (cohort40Res.data.cohortSize !== 40 || cohort40Res.data.status !== 'FULL') {
      throw new Error(`FAIL: Expected cohortSize 40 and status FULL, got size=${cohort40Res.data.cohortSize}, status=${cohort40Res.data.status}`);
    }
    console.log('✅ Test C & D: 40 users -> cohort size 40, FULL: PASS');

    // Add 41st user
    const user41Res = await makeRequest('POST', '/api/auth/login-or-register', {
      email: `p43_user41_${timestamp}@example.com`,
      name: 'Real User 41',
    });
    const user41 = user41Res.data.user;

    await makeRequest('POST', '/api/tests/tcs-nqt-2024-full/submit', {
      userId: user41.id,
      mode: 'exam',
      responses: [{ questionId: 'quant_001', selectedOption: 'A', timeSpentSeconds: 15 }],
      timeTakenSeconds: 300,
    });

    const league41Res = await makeRequest('GET', `/api/league/current?userId=${user41.id}`);
    console.log('User 41 League State (New Cohort):', {
      userGroup: league41Res.data.userGroup,
      cohortSize: league41Res.data.cohortSize,
      cohortStatus: league41Res.data.cohortStatus,
    });
    if (
      league41Res.data.userGroup === activeGroupId ||
      league41Res.data.cohortSize !== 1 ||
      league41Res.data.cohortStatus !== 'ACTIVE'
    ) {
      throw new Error('FAIL: 41st user was not assigned to a new underfilled active cohort!');
    }
    console.log('✅ Test E: 41st user goes to new cohort with size 1, ACTIVE immediately: PASS\n');

    // 6. Test F & J: New user later in week fills existing underfilled cohort (cohort 2), existing user never reassigned (Requirement F & J)
    console.log('--- Test F & J: Fills Oldest Available Underfilled Cohort & No Reassignment ---');
    const user42Res = await makeRequest('POST', '/api/auth/login-or-register', {
      email: `p43_user42_${timestamp}@example.com`,
      name: 'Real User 42',
    });
    const user42 = user42Res.data.user;

    await makeRequest('POST', '/api/tests/tcs-nqt-2024-full/submit', {
      userId: user42.id,
      mode: 'exam',
      responses: [{ questionId: 'quant_001', selectedOption: 'A', timeSpentSeconds: 15 }],
      timeTakenSeconds: 300,
    });

    const league42Res = await makeRequest('GET', `/api/league/current?userId=${user42.id}`);
    console.log('User 42 League State:', {
      userGroup: league42Res.data.userGroup,
      cohortSize: league42Res.data.cohortSize,
    });

    // Check User 1 group remains unchanged
    const league1Check = await makeRequest('GET', `/api/league/current?userId=${user1.id}`);
    if (league1Check.data.userGroup !== activeGroupId) {
      throw new Error('FAIL: Existing participant was reassigned!');
    }
    if (league42Res.data.userGroup !== league41Res.data.userGroup || league42Res.data.cohortSize !== 2) {
      throw new Error('FAIL: User 42 did not join existing underfilled cohort!');
    }
    console.log('✅ Test F & J: Fills oldest available underfilled cohort & existing participants preserved: PASS\n');

    // 7. Test K: Season Finalization and Rollover (Requirement K)
    console.log('--- Test K: Season Finalization and Rollover ---');
    const finalizeRes = await makeRequest('POST', '/api/admin/league/finalize-season');
    console.log('Finalization result:', finalizeRes.data);
    if (!finalizeRes.data.success) {
      throw new Error('FAIL: Season finalization failed!');
    }

    const league1PostFinal = await makeRequest('GET', `/api/league/current?userId=${user1.id}`);
    console.log('User 1 Post-Finalization League State:', {
      userLeague: league1PostFinal.data.userLeague,
      isParticipant: league1PostFinal.data.isParticipant,
      weeklyXp: league1PostFinal.data.weeklyXp,
    });
    // User 1 was rank 1 in a 40-player cohort -> promoted to Silver!
    if (league1PostFinal.data.userLeague !== 'Silver' || league1PostFinal.data.weeklyXp !== 0) {
      throw new Error(`FAIL: Season finalization failed! Expected Silver and 0 weeklyXp, got userLeague=${league1PostFinal.data.userLeague}, weeklyXp=${league1PostFinal.data.weeklyXp}`);
    }
    console.log('✅ Test K: Season finalization & promotion rollover: PASS\n');

    console.log('====================================================');
    console.log('   ALL PHASE 4.3 E2E TESTS PASSED SUCCESSFULLY!   ');
    console.log('====================================================');
  } catch (err) {
    console.error('\n❌ PHASE 4.3 TEST FAILED:', err.message);
    process.exit(1);
  }
}

runPhase43Tests();
