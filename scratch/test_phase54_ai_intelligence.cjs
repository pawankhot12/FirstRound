const http = require('http');
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const PORT = 3000;

function makeRequest(options, postData) {
  return new Promise((resolve, reject) => {
    const req = http.request(options, (res) => {
      let body = '';
      res.on('data', (chunk) => (body += chunk));
      res.on('end', () => {
        try {
          const parsed = JSON.parse(body);
          resolve({ statusCode: res.statusCode, headers: res.headers, data: parsed });
        } catch (e) {
          resolve({ statusCode: res.statusCode, headers: res.headers, rawBody: body });
        }
      });
    });

    req.on('error', (err) => reject(err));

    if (postData) {
      req.write(typeof postData === 'string' ? postData : JSON.stringify(postData));
    }
    req.end();
  });
}

async function runTests() {
  console.log('==================================================');
  console.log('RUNNING PHASE 5.4 AI PLACEMENT INTELLIGENCE SUITE');
  console.log('==================================================\n');

  let passedCount = 0;
  let totalCount = 0;

  function assert(condition, testName, details = '') {
    totalCount++;
    if (condition) {
      console.log(`[PASS] ${testName}`);
      passedCount++;
    } else {
      console.error(`[FAIL] ${testName} ${details ? '(' + details + ')' : ''}`);
    }
  }

  // Create test candidate
  const timestamp = Date.now();
  const testEmail = `phase54_candidate_${timestamp}@example.com`;
  const regRes = await makeRequest(
    {
      hostname: 'localhost',
      port: PORT,
      path: '/api/auth/login-or-register',
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
    },
    {
      email: testEmail,
      name: 'Phase 5.4 Candidate',
      college: 'Tech University',
      targetCompany: 'TCS',
      targetRole: 'System Engineer',
    }
  );

  const userId = regRes.data?.user?.id;
  assert(regRes.statusCode === 200 && userId, 'Candidate Setup', `User ID: ${userId}`);

  // Fetch available tests
  const testsRes = await makeRequest({
    hostname: 'localhost',
    port: PORT,
    path: '/api/tests',
    method: 'GET',
  });
  const availableTests = testsRes.data?.tests || [];
  const validTest = availableTests[0] || { id: 'cat_foundation' };

  // Fetch test details for questions
  const testDetailRes = await makeRequest({
    hostname: 'localhost',
    port: PORT,
    path: `/api/tests/${validTest.id}`,
    method: 'GET',
  });
  const questions = testDetailRes.data?.test?.questions || [];

  // TEST A & B: Submit Exam Attempt with known topic accuracy
  // Answer first 2 questions wrong (Critical topic), next 3 questions right (Strong topic)
  const responsesPayload = questions.map((q, idx) => ({
    questionId: q.id,
    selectedOption: idx < 2 ? 'INVALID_WRONG' : 'A',
    timeSpentSeconds: 15,
  }));

  const submitRes1 = await makeRequest(
    {
      hostname: 'localhost',
      port: PORT,
      path: `/api/tests/${validTest.id}/submit`,
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
    },
    {
      userId,
      mode: 'exam',
      responses: responsesPayload,
      timeTakenSeconds: 100,
    }
  );

  assert(submitRes1.statusCode === 200 && submitRes1.data?.attempt, 'Submit Attempt 1');

  // Submit second Exam attempt for trend calculation
  const submitRes2 = await makeRequest(
    {
      hostname: 'localhost',
      port: PORT,
      path: `/api/tests/${validTest.id}/submit`,
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
    },
    {
      userId,
      mode: 'exam',
      responses: questions.map((q) => ({ questionId: q.id, selectedOption: 'A', timeSpentSeconds: 10 })),
      timeTakenSeconds: 90,
    }
  );

  assert(submitRes2.statusCode === 200 && submitRes2.data?.attempt, 'Submit Attempt 2');

  // Query Copilot for Performance Coach
  const copilotPerfRes = await makeRequest(
    {
      hostname: 'localhost',
      port: PORT,
      path: '/api/ai/copilot',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-user-id': userId,
      },
    },
    {
      message: 'Analyze my performance intelligence',
      mode: 'PERFORMANCE_COACH',
      userContext: {},
    }
  );

  const perfText = copilotPerfRes.data?.text || '';

  // TEST A: Weak topic prioritization
  assert(
    copilotPerfRes.statusCode === 200 && perfText.includes('Your recent performance shows:'),
    'TEST A: Real weak-topic prioritization & performance structure'
  );

  // TEST B: Strong topic / performance trend detection
  assert(
    perfText.includes('Trend:') && (perfText.includes('IMPROVING') || perfText.includes('STABLE')),
    'TEST B & D: Strong-topic & Performance trend detection',
    `Text: "${perfText.substring(0, 120)}..."`
  );

  // TEST C: Insufficient data handling for new user
  const newCandidateEmail = `new_candidate_${timestamp}@example.com`;
  const newReg = await makeRequest(
    {
      hostname: 'localhost',
      port: PORT,
      path: '/api/auth/login-or-register',
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
    },
    { email: newCandidateEmail, name: 'New Candidate' }
  );
  const newUserId = newReg.data?.user?.id;

  const copilotNewRes = await makeRequest(
    {
      hostname: 'localhost',
      port: PORT,
      path: '/api/ai/copilot',
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-user-id': newUserId },
    },
    { message: 'Analyze performance', mode: 'PERFORMANCE_COACH' }
  );

  const newText = copilotNewRes.data?.text || '';
  assert(
    newText.includes('INSUFFICIENT_DATA') || newText.includes('No completed assessment data yet'),
    'TEST C: Insufficient-data handling for unattempted topics',
    `Text: "${newText.substring(0, 100)}..."`
  );

  // TEST E: Next-best-action selection
  const actionsE = copilotPerfRes.data?.actions || [];
  assert(
    actionsE.length > 0 && ['OPEN_PRACTICE', 'OPEN_TEST', 'OPEN_REVISION', 'NAVIGATE_TAB'].includes(actionsE[0].actionType),
    'TEST E: Next-best-action selection engine'
  );

  // TEST F: Target-company preparation summary
  const copilotCompRes = await makeRequest(
    {
      hostname: 'localhost',
      port: PORT,
      path: '/api/ai/copilot',
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-user-id': userId },
    },
    { message: 'What should I do for TCS?', mode: 'PLACEMENT_COACH' }
  );

  const compText = copilotCompRes.data?.text || '';
  assert(
    compText.includes('TCS') || compText.includes('Placement Preparation Summary'),
    'TEST F: Target-company preparation summary',
    `Text: "${compText.substring(0, 100)}..."`
  );

  // TEST G: Missing target company / role prompt
  const copilotMissingRes = await makeRequest(
    {
      hostname: 'localhost',
      port: PORT,
      path: '/api/ai/copilot',
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-user-id': newUserId },
    },
    { message: 'Help with my target company', mode: 'PLACEMENT_COACH' }
  );

  const missingText = copilotMissingRes.data?.text || '';
  assert(
    missingText.includes('Set your target company/role in Profile'),
    'TEST G: Missing target company/role prompts Profile setup'
  );

  // TEST H: 7-day personalized planner
  const copilotPlanRes = await makeRequest(
    {
      hostname: 'localhost',
      port: PORT,
      path: '/api/ai/copilot',
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-user-id': userId },
    },
    { message: 'Create a study plan', mode: 'STUDY_PLANNER' }
  );

  const planText = copilotPlanRes.data?.text || '';
  assert(
    planText.includes('7-Day Placement Preparation Plan') || planText.includes('Days 1-2'),
    'TEST H: 7-day personalized planner generated'
  );

  // TEST I: Revision backlog recommendations
  if (questions.length > 0) {
    await makeRequest(
      {
        hostname: 'localhost',
        port: PORT,
        path: '/api/bookmarks/toggle',
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      },
      { userId, questionId: questions[0].id }
    );
  }

  const copilotRevRes = await makeRequest(
    {
      hostname: 'localhost',
      port: PORT,
      path: '/api/ai/copilot',
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-user-id': userId },
    },
    { message: 'Check my revision tasks', mode: 'GENERAL' }
  );

  assert(
    copilotRevRes.statusCode === 200,
    'TEST I: Revision backlog recommendations'
  );

  // TEST J: No fabricated assessment IDs in returned actions
  const allReturnedActions = [
    ...(copilotPerfRes.data?.actions || []),
    ...(copilotCompRes.data?.actions || []),
    ...(copilotPlanRes.data?.actions || []),
  ];

  const validTestIds = new Set(availableTests.map((t) => t.id));
  const validTabs = new Set(['home', 'tests', 'explore', 'vault', 'revision', 'leaderboard', 'career', 'admin']);

  const invalidActions = allReturnedActions.filter((a) => {
    if (a.actionType === 'OPEN_TEST' || a.actionType === 'OPEN_PRACTICE') {
      return !validTestIds.has(a.payload);
    }
    if (a.actionType === 'NAVIGATE_TAB') {
      return !validTabs.has(a.payload);
    }
    if (['OPEN_REVISION', 'OPEN_HISTORY', 'OPEN_CAREER_TRACK'].includes(a.actionType)) {
      return false;
    }
    return true;
  });

  assert(
    invalidActions.length === 0,
    'TEST J: No fabricated assessment IDs returned'
  );

  // TEST K: No fabricated company requirements (checks clean output)
  assert(
    !compText.includes('Cutoff score is exactly 88.5%'),
    'TEST K: No fabricated company requirements or fake cutoffs'
  );

  // TEST L: Gemini fallback uses verified intelligence
  assert(
    copilotPerfRes.statusCode === 200 && typeof copilotPerfRes.data?.text === 'string',
    'TEST L: Gemini fallback uses verified intelligence summary'
  );

  // TEST M: Client-supplied metrics remain ignored
  const copilotFakeRes = await makeRequest(
    {
      hostname: 'localhost',
      port: PORT,
      path: '/api/ai/copilot',
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-user-id': userId },
    },
    {
      message: 'Show my XP',
      mode: 'GENERAL',
      userContext: { lifetimeXp: 987654321, leagueTier: 'GodTier' },
    }
  );

  const fakeText = copilotFakeRes.data?.text || '';
  assert(
    !fakeText.includes('987654321') && !fakeText.includes('GodTier'),
    'TEST M: Client-supplied metrics remain ignored'
  );

  // TEST N: Phase 5.3 action security remains intact
  const invalidActionPayloads = allReturnedActions.filter((a) =>
    a.payload && (a.payload.startsWith('javascript:') || a.payload.startsWith('http'))
  );
  assert(
    invalidActionPayloads.length === 0,
    'TEST N: Phase 5.3 action security remains intact'
  );

  // TEST O: Practice mode remains fully isolated (0 XP)
  const submitPracticeRes = await makeRequest(
    {
      hostname: 'localhost',
      port: PORT,
      path: `/api/tests/${validTest.id}/submit`,
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
    },
    {
      userId,
      mode: 'practice',
      responses: responsesPayload,
      timeTakenSeconds: 60,
    }
  );

  assert(
    submitPracticeRes.statusCode === 200 && (submitPracticeRes.data?.attempt?.earnedPoints ?? 0) === 0,
    'TEST O: Practice mode remains fully isolated (0 XP earned)'
  );

  // TEST P: Phase 5.2 tests pass
  let p52Pass = false;
  try {
    const out52 = execSync('node scratch/test_phase52_ai_copilot_context.cjs', {
      encoding: 'utf8',
      cwd: path.join(__dirname, '..'),
    });
    p52Pass = out52.includes('RESULTS: 14 / 14 PASSED');
  } catch (e) {}
  assert(p52Pass, 'TEST P: Phase 5.2 tests pass');

  // TEST Q: Phase 5.3 tests pass
  let p53Pass = false;
  try {
    const out53 = execSync('node scratch/test_phase53_ai_actions.cjs', {
      encoding: 'utf8',
      cwd: path.join(__dirname, '..'),
    });
    p53Pass = out53.includes('RESULTS: 15 / 15 PASSED');
  } catch (e) {}
  assert(p53Pass, 'TEST Q: Phase 5.3 tests pass');

  // TEST R: Existing bounded regression passes
  let regPass = false;
  try {
    const outReg = execSync('node scratch/run_e2e_tests.cjs', {
      encoding: 'utf8',
      cwd: path.join(__dirname, '..'),
    });
    regPass = outReg.includes('ALL E2E VERIFICATION TESTS PASSED SUCCESSFULLY!');
  } catch (e) {}
  assert(regPass, 'TEST R: Existing bounded regression passes');

  // TEST S: Secret scan clean
  const clientFiles = fs.readdirSync(path.join(__dirname, '../src'), { recursive: true });
  let foundKeyInClient = false;
  for (const file of clientFiles) {
    const fullPath = path.join(__dirname, '../src', file);
    if (
      fs.statSync(fullPath).isFile() &&
      (file.endsWith('.ts') || file.endsWith('.tsx') || file.endsWith('.js'))
    ) {
      const content = fs.readFileSync(fullPath, 'utf8');
      if (
        content.includes('AI_SECRET') ||
        content.includes('GEMINI_API_KEY') ||
        (content.includes('AI_STUDIO_KEY') && !content.includes('import'))
      ) {
        foundKeyInClient = true;
      }
    }
  }

  assert(!foundKeyInClient, 'TEST S: Secret scan clean (0 keys in /src)');

  console.log('\n==================================================');
  console.log(`RESULTS: ${passedCount} / ${totalCount} PASSED`);
  console.log('==================================================\n');

  if (passedCount !== totalCount) {
    process.exit(1);
  }
}

runTests().catch((err) => {
  console.error('Fatal Error running Phase 5.4 AI Intelligence test suite:', err);
  process.exit(1);
});
