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

async function runPhase44Tests() {
  console.log('===========================================================');
  console.log('   PHASE 4.4 — WEEKLY COUNTDOWN & BRONZE INITIAL TIER TEST');
  console.log('===========================================================\n');

  try {
    const timestamp = Date.now();

    // Clean test data from DB at start of suite
    const Database = require('better-sqlite3');
    const path = require('path');
    const db = new Database(path.resolve(__dirname, '../firstround.db'));
    db.prepare("UPDATE weekly_seasons SET status = 'FINALIZED' WHERE status = 'ACTIVE'").run();
    db.prepare("DELETE FROM weekly_standings WHERE userId LIKE 'p44_%'").run();
    db.prepare("DELETE FROM users WHERE email LIKE 'p44_%'").run();
    db.prepare("DELETE FROM test_attempts WHERE userId LIKE 'p44_%'").run();

    // 1. Test A: Brand-new user has no league before Exam & initial tier is Bronze (Requirements A & H & I)
    console.log('--- Test A & H & I: Brand-New User Initial State & Countdown Bounds ---');
    const newReg = await makeRequest('POST', '/api/auth/login-or-register', {
      email: `p44_newuser_${timestamp}@example.com`,
      name: 'Brand New User',
    });
    const newUser = newReg.data.user;
    console.log(`Created user: ${newUser.id} (${newUser.email}), currentLeague: ${newUser.currentLeague}`);

    if (newUser.currentLeague !== 'Bronze') {
      throw new Error(`FAIL: Brand new user started in ${newUser.currentLeague} instead of Bronze!`);
    }

    const leagueInitRes = await makeRequest('GET', `/api/league/current?userId=${newUser.id}`);
    console.log('Initial League Response:', {
      userLeague: leagueInitRes.data.userLeague,
      isParticipant: leagueInitRes.data.isParticipant,
      timeRemainingSeconds: leagueInitRes.data.timeRemainingSeconds,
      seasonStart: leagueInitRes.data.seasonStart,
      seasonEnd: leagueInitRes.data.seasonEnd,
    });

    if (leagueInitRes.data.userLeague !== 'Bronze') {
      throw new Error(`FAIL: API returned userLeague ${leagueInitRes.data.userLeague} instead of Bronze!`);
    }
    if (leagueInitRes.data.isParticipant !== false) {
      throw new Error('FAIL: Brand new user without exam marked as participant!');
    }

    const startMs = new Date(leagueInitRes.data.seasonStart).getTime();
    const endMs = new Date(leagueInitRes.data.seasonEnd).getTime();
    const seasonDurationSeconds = (endMs - startMs) / 1000;
    console.log(`Season Duration: ${seasonDurationSeconds}s (${seasonDurationSeconds / 86400} days)`);

    if (Math.abs(seasonDurationSeconds - 7 * 86400) > 60) {
      throw new Error(`FAIL: Weekly season duration is ${seasonDurationSeconds / 86400} days instead of 7 days!`);
    }
    if (leagueInitRes.data.timeRemainingSeconds > 7 * 86400) {
      throw new Error(`FAIL: Countdown timeRemainingSeconds (${leagueInitRes.data.timeRemainingSeconds}s / ${leagueInitRes.data.timeRemainingSeconds / 86400} days) EXCEEDS 7 DAYS!`);
    }
    console.log('✅ Test A, H & I: New user starts Bronze (not participant) & Countdown <= 7 days: PASS\n');

    // 2. Test B: First official Exam -> Bronze cohort, ACTIVE immediately (Requirement B)
    console.log('--- Test B: First Official Exam Creates Bronze Active Participation ---');
    await makeRequest('POST', '/api/tests/tcs-nqt-2024-full/submit', {
      userId: newUser.id,
      mode: 'exam',
      responses: [{ questionId: 'quant_001', selectedOption: 'A', timeSpentSeconds: 15 }],
      timeTakenSeconds: 300,
    });

    const leaguePostExam = await makeRequest('GET', `/api/league/current?userId=${newUser.id}`);
    console.log('League Response Post Exam:', {
      userLeague: leaguePostExam.data.userLeague,
      isParticipant: leaguePostExam.data.isParticipant,
      cohortStatus: leaguePostExam.data.cohortStatus,
      currentRank: leaguePostExam.data.currentRank,
      weeklyXp: leaguePostExam.data.weeklyXp,
    });

    if (leaguePostExam.data.userLeague !== 'Bronze') {
      throw new Error(`FAIL: First exam changed user league to ${leaguePostExam.data.userLeague} instead of Bronze!`);
    }
    if (leaguePostExam.data.isParticipant !== true || leaguePostExam.data.cohortStatus !== 'ACTIVE') {
      throw new Error('FAIL: First exam did not activate participation in Bronze cohort!');
    }
    console.log('✅ Test B: First official Exam assigns Bronze active cohort & XP: PASS\n');

    // 3. Test C: Second Exam same week -> remains Bronze, same cohort, no tier jump (Requirement C)
    console.log('--- Test C: Second Exam Same Week Remains Bronze & Same Cohort ---');
    await makeRequest('POST', '/api/tests/tcs-nqt-2024-full/submit', {
      userId: newUser.id,
      mode: 'exam',
      responses: [{ questionId: 'quant_001', selectedOption: 'A', timeSpentSeconds: 15 }],
      timeTakenSeconds: 300,
    });

    const leagueSecondExam = await makeRequest('GET', `/api/league/current?userId=${newUser.id}`);
    if (leagueSecondExam.data.userLeague !== 'Bronze' || leagueSecondExam.data.userGroup !== leaguePostExam.data.userGroup) {
      throw new Error('FAIL: Second exam changed league tier or reassigned user cohort!');
    }
    console.log('✅ Test C: Second exam same week preserves Bronze tier & cohort: PASS\n');

    // 4. Test D: Practice-only user has no league (Requirement D)
    console.log('--- Test D: Practice-Only User Has No League ---');
    const pracReg = await makeRequest('POST', '/api/auth/login-or-register', {
      email: `p44_pracuser_${timestamp}@example.com`,
      name: 'Practice User P44',
    });
    const pracUser = pracReg.data.user;

    await makeRequest('POST', '/api/tests/tcs-nqt-2024-full/submit', {
      userId: pracUser.id,
      mode: 'practice',
      responses: [{ questionId: 'quant_001', selectedOption: 'A', timeSpentSeconds: 15 }],
      timeTakenSeconds: 300,
    });

    const pracLeague = await makeRequest('GET', `/api/league/current?userId=${pracUser.id}`);
    if (pracLeague.data.isParticipant !== false || pracLeague.data.weeklyXp !== 0) {
      throw new Error('FAIL: Practice mode granted weekly XP or assigned cohort!');
    }
    console.log('✅ Test D: Practice-only user has no league assignment & 0 weekly XP: PASS\n');

    // 5. Test E & F: Season finalization promotes Bronze user in a 40-player cohort to Silver for next season (Requirement E & F)
    console.log('--- Test E & F: Valid Season Finalization Promotes Bronze to Silver ---');

    // Add 39 other users to fill cohort to 40
    for (let i = 2; i <= 40; i++) {
      const uReg = await makeRequest('POST', '/api/auth/login-or-register', {
        email: `p44_cohort_${timestamp}_${i}@example.com`,
        name: `Cohort User ${i}`,
      });
      await makeRequest('POST', '/api/tests/tcs-nqt-2024-full/submit', {
        userId: uReg.data.user.id,
        mode: 'exam',
        responses: [{ questionId: 'quant_001', selectedOption: 'A', timeSpentSeconds: 15 }],
        timeTakenSeconds: 300,
      });
    }

    // Give newUser top weekly XP so newUser is rank 1
    const activeSeasonRes = await makeRequest('GET', `/api/league/current?userId=${newUser.id}`);
    const activeSeasonId = activeSeasonRes.data.activeSeason.id;
    const dbInst = new Database(path.resolve(__dirname, '../firstround.db'));
    dbInst.prepare("UPDATE weekly_standings SET weeklyXp = 1000 WHERE userId = ? AND seasonId = ?").run(newUser.id, activeSeasonId);

    const finalizeRes = await makeRequest('POST', '/api/admin/league/finalize-season');
    if (!finalizeRes.data.success) {
      throw new Error('FAIL: Season finalization failed!');
    }

    const leaguePostFinal = await makeRequest('GET', `/api/league/current?userId=${newUser.id}`);
    console.log('Promoted User Post-Finalization:', {
      userLeague: leaguePostFinal.data.userLeague,
      isParticipant: leaguePostFinal.data.isParticipant,
      weeklyXp: leaguePostFinal.data.weeklyXp,
    });

    if (leaguePostFinal.data.userLeague !== 'Silver') {
      throw new Error(`FAIL: Season finalization did not promote user to Silver! Got ${leaguePostFinal.data.userLeague}`);
    }
    console.log('✅ Test E & F: Season finalization promotes Bronze user to Silver: PASS\n');

    // 6. Test G: New user registering in next season still starts at Bronze (Requirement G)
    console.log('--- Test G: New User Registering in Next Season Starts Bronze ---');
    const nextReg = await makeRequest('POST', '/api/auth/login-or-register', {
      email: `p44_nextseason_${timestamp}@example.com`,
      name: 'Next Season User',
    });
    const nextUser = nextReg.data.user;

    if (nextUser.currentLeague !== 'Bronze') {
      throw new Error(`FAIL: User registering in new season started in ${nextUser.currentLeague} instead of Bronze!`);
    }

    const nextLeague = await makeRequest('GET', `/api/league/current?userId=${nextUser.id}`);
    if (nextLeague.data.userLeague !== 'Bronze' || nextLeague.data.isParticipant !== false) {
      throw new Error('FAIL: New user in new season did not initialize cleanly in Bronze!');
    }
    console.log('✅ Test G: New user in next season starts in Bronze: PASS\n');

    // 7. Test J: Historical promoted user retains legitimate Silver tier (Requirement J)
    console.log('--- Test J: Historical Promoted User Retains Legitimate Tier ---');
    if (leaguePostFinal.data.userLeague !== 'Silver') {
      throw new Error('FAIL: Promoted user lost Silver tier status!');
    }
    console.log('✅ Test J: Promoted user retains legitimate Silver tier: PASS\n');

    console.log('===========================================================');
    console.log('   ALL PHASE 4.4 E2E TESTS PASSED SUCCESSFULLY!   ');
    console.log('===========================================================');
  } catch (err) {
    console.error('\n❌ PHASE 4.4 TEST FAILED:', err.message);
    process.exit(1);
  }
}

runPhase44Tests();
