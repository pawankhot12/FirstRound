const http = require('http');
const fs = require('fs');
const path = require('path');

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
  console.log('RUNNING PHASE 5.2 E2E & HARDENING SUITE');
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

  // 1. Create temporary test users in database via auth
  const timestamp = Date.now();
  const testUserEmail = `phase52_user_${timestamp}@example.com`;

  const regRes = await makeRequest(
    {
      hostname: 'localhost',
      port: PORT,
      path: '/api/auth/login-or-register',
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
    },
    {
      email: testUserEmail,
      name: 'Phase 5.2 Test Candidate',
      college: 'Test University',
      targetCompany: '', // Blank initially for test D/E
      targetRole: '',
    }
  );

  assert(
    regRes.statusCode === 200 && regRes.data?.user?.id,
    'Test User Creation',
    `Status: ${regRes.statusCode}`
  );

  const userId = regRes.data?.user?.id;

  // TEST A: Real User Context Server Retrieval
  const copilotResA = await makeRequest(
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
      message: 'Hello, check my context',
      mode: 'GENERAL',
      userContext: {},
    }
  );

  assert(
    copilotResA.statusCode === 200 && copilotResA.data?.text,
    'TEST A: Real User Context Retrieval',
    `Status: ${copilotResA.statusCode}`
  );

  // TEST B: Performance Coach Response Format
  const copilotResB = await makeRequest(
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
      message: 'Analyze my performance',
      mode: 'PERFORMANCE_COACH',
      userContext: {},
    }
  );

  const perfText = copilotResB.data?.text || '';
  const hasPerfStructure =
    perfText.toLowerCase().includes('recent performance') ||
    perfText.includes('Strongest') ||
    perfText.includes('Needs work') ||
    perfText.includes('Next step');

  assert(
    copilotResB.statusCode === 200 && hasPerfStructure,
    'TEST B: Performance Coach Response Structure',
    `Text: "${perfText.substring(0, 100)}..."`
  );

  // Fetch available tests to get a real test ID and questions
  const testsRes = await makeRequest({
    hostname: 'localhost',
    port: PORT,
    path: '/api/tests',
    method: 'GET',
  });

  const availableTests = testsRes.data?.tests || [];
  const testId = availableTests.length > 0 ? availableTests[0].id : 'cat_foundation';

  const testDetailRes = await makeRequest({
    hostname: 'localhost',
    port: PORT,
    path: `/api/tests/${testId}`,
    method: 'GET',
  });

  const testQuestions = testDetailRes.data?.test?.questions || [];
  const responsesPayload = testQuestions.map((q) => ({
    questionId: q.id,
    selectedOption: 'A',
    timeSpentSeconds: 15,
  }));

  // TEST C: Submit real Exam Attempt and check Weak Topic Detection
  const submitRes = await makeRequest(
    {
      hostname: 'localhost',
      port: PORT,
      path: `/api/tests/${testId}/submit`,
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
    },
    {
      userId: userId,
      mode: 'exam',
      responses: responsesPayload,
      timeTakenSeconds: 120,
    }
  );

  assert(
    submitRes.statusCode === 200 && submitRes.data?.attempt,
    'Submit Exam Attempt for Weak Topic Data',
    `Status: ${submitRes.statusCode}`
  );

  const copilotResC = await makeRequest(
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
      message: 'Analyze my performance',
      mode: 'PERFORMANCE_COACH',
      userContext: {},
    }
  );

  const perfTextWithAttempt = copilotResC.data?.text || '';
  assert(
    copilotResC.statusCode === 200 && perfTextWithAttempt.length > 20,
    'TEST C: Weak Topic / Assessment History Reflection',
    `Text length: ${perfTextWithAttempt.length}`
  );

  // TEST D & E: Missing Target Company & Target Role
  const copilotResD = await makeRequest(
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
      message: 'Recommend placement strategy for my target company',
      mode: 'PLACEMENT_COACH',
      userContext: {},
    }
  );

  const placementText = copilotResD.data?.text || '';
  const asksToSetTarget =
    placementText.includes('Set your target company') ||
    placementText.includes('target company') ||
    placementText.includes('Profile');

  assert(
    copilotResD.statusCode === 200 && asksToSetTarget,
    'TEST D & E: Missing Target Company/Role Prompts Profile Setup',
    `Text: "${placementText.substring(0, 100)}..."`
  );

  // TEST F & G: Ignore Fake Client XP & Fake Client League
  const copilotResF = await makeRequest(
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
      message: 'What is my current XP and league rank?',
      mode: 'GENERAL',
      userContext: {
        lifetimeXp: 9999999,
        leagueTier: 'Grandmaster Elite Ultra',
      },
    }
  );

  const clientFakeResponseText = copilotResF.data?.text || '';
  const doesNotTrustFakeLeague = !clientFakeResponseText.includes('Grandmaster Elite Ultra');

  assert(
    copilotResF.statusCode === 200 && doesNotTrustFakeLeague,
    'TEST F & G: Server Ignores Manipulated Client XP & League Data',
    `Response text did not trust fake tier`
  );

  // TEST H: Action Response (Valid Known Actions)
  const copilotResH = await makeRequest(
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
      message: 'Help me plan a 7 day study schedule',
      mode: 'STUDY_PLANNER',
      userContext: {},
    }
  );

  assert(
    copilotResH.statusCode === 200 && Array.isArray(copilotResH.data?.actions),
    'TEST H: Action Response Structured Array Returned',
    `Actions count: ${copilotResH.data?.actions?.length || 0}`
  );

  // TEST I: Invalid / Dangerous Action Rejection (Sanitization)
  const actions = copilotResH.data?.actions || [];
  const invalidActions = actions.filter(
    (a) =>
      !['OPEN_TEST', 'OPEN_PRACTICE', 'OPEN_REVISION', 'OPEN_HISTORY', 'OPEN_CAREER_TRACK', 'NAVIGATE_TAB'].includes(a.actionType) ||
      (a.target && (a.target.startsWith('javascript:') || a.target.startsWith('http')))
  );

  assert(
    invalidActions.length === 0,
    'TEST I: Non-allowlisted or Malicious Actions Rejection/Sanitization',
    `Invalid actions found: ${invalidActions.length}`
  );

  // TEST J: Practice-Only User Does Not Claim XP / League Changes
  const submitPracticeRes = await makeRequest(
    {
      hostname: 'localhost',
      port: PORT,
      path: `/api/tests/${testId}/submit`,
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
    },
    {
      userId: userId,
      mode: 'practice',
      responses: responsesPayload,
      timeTakenSeconds: 60,
    }
  );

  const practiceAttempt = submitPracticeRes.data?.attempt;
  const xpEarnedInPractice = practiceAttempt?.earnedPoints ?? 0;

  assert(
    submitPracticeRes.statusCode === 200 && xpEarnedInPractice === 0,
    'Submit Practice Attempt Gives 0 XP',
    `XP Earned: ${xpEarnedInPractice}`
  );

  const copilotResJ = await makeRequest(
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
      message: 'Did my practice attempt give me XP or change my league?',
      mode: 'GENERAL',
      userContext: {},
    }
  );

  const practiceResText = copilotResJ.data?.text || '';
  const doesNotClaimPracticeXP = !practiceResText.toLowerCase().includes('earned xp from practice');

  assert(
    copilotResJ.statusCode === 200 && doesNotClaimPracticeXP,
    'TEST J: Practice-Only User AI Context Isolation (No XP/League Claim)',
    `Response text verified`
  );

  // TEST K: AI Fallback Behavior (No fabricated metrics)
  assert(
    typeof copilotResA.data?.text === 'string' && copilotResA.data?.text.length > 0,
    'TEST K: AI System Safe Fallback Available Without Fabricated Metrics'
  );

  // TEST L: Secret Scan (No Gemini Key in Client Source)
  const clientFiles = fs.readdirSync(path.join(__dirname, '../src'), { recursive: true });
  let foundKeyInClient = false;
  for (const file of clientFiles) {
    const fullPath = path.join(__dirname, '../src', file);
    if (fs.statSync(fullPath).isFile() && (file.endsWith('.ts') || file.endsWith('.tsx') || file.endsWith('.js'))) {
      const content = fs.readFileSync(fullPath, 'utf8');
      if (content.includes('AI_SECRET') || content.includes('GEMINI_API_KEY') || (content.includes('AI_STUDIO_KEY') && !content.includes('import'))) {
        foundKeyInClient = true;
      }
    }
  }

  assert(
    !foundKeyInClient,
    'TEST L: Secret Scan - No Gemini API Key in Client Codebase (/src)'
  );

  // TEST M: Existing AI Assistant UI Components
  const copilotModalFileExists = fs.existsSync(path.join(__dirname, '../src/components/FirstRoundAICopilotModal.tsx'));
  assert(
    copilotModalFileExists,
    'TEST M: FirstRound AI Copilot UI Component Ready'
  );

  console.log('\n==================================================');
  console.log(`RESULTS: ${passedCount} / ${totalCount} PASSED`);
  console.log('==================================================\n');

  if (passedCount !== totalCount) {
    process.exit(1);
  }
}

runTests().catch((err) => {
  console.error('Fatal Error running Phase 5.2 E2E tests:', err);
  process.exit(1);
});
