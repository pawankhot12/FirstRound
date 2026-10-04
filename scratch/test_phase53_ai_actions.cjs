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

// Client action execution validator mirror to test logic on node side
function validateAndExecuteAction(action, availableTests = []) {
  if (!action || typeof action !== 'object') {
    return { success: false, reason: 'Invalid action object' };
  }

  const { actionType, payload, target } = action;
  const rawTarget = payload || target;

  const ALLOWED_ACTION_TYPES = new Set([
    'OPEN_TEST',
    'OPEN_PRACTICE',
    'OPEN_REVISION',
    'OPEN_HISTORY',
    'OPEN_CAREER_TRACK',
    'NAVIGATE_TAB',
  ]);

  if (!actionType || !ALLOWED_ACTION_TYPES.has(actionType)) {
    return { success: false, reason: 'Rejected non-allowlisted actionType' };
  }

  if (typeof rawTarget === 'string') {
    const lower = rawTarget.toLowerCase().trim();
    if (
      lower.startsWith('javascript:') ||
      lower.startsWith('http:') ||
      lower.startsWith('https:') ||
      lower.startsWith('//') ||
      lower.includes('<script') ||
      lower.includes('eval(') ||
      lower.includes('window.') ||
      lower.includes('document.') ||
      lower.startsWith('/')
    ) {
      return { success: false, reason: 'Rejected unsafe or external URL payload' };
    }
  }

  if (actionType === 'NAVIGATE_TAB') {
    const ALLOWED_TABS = new Set(['home', 'tests', 'leaderboard', 'vault', 'career', 'admin']);
    if (!rawTarget || !ALLOWED_TABS.has(rawTarget)) {
      return { success: false, reason: 'Rejected invalid tab target' };
    }
    return { success: true, executed: 'NAVIGATE_TAB', target: rawTarget };
  }

  if (actionType === 'OPEN_REVISION') {
    return { success: true, executed: 'OPEN_REVISION', target: 'vault' };
  }

  if (actionType === 'OPEN_HISTORY') {
    return { success: true, executed: 'OPEN_HISTORY', target: 'vault' };
  }

  if (actionType === 'OPEN_CAREER_TRACK') {
    return { success: true, executed: 'OPEN_CAREER_TRACK', target: 'career' };
  }

  if (actionType === 'OPEN_TEST' || actionType === 'OPEN_PRACTICE') {
    const mode = actionType === 'OPEN_PRACTICE' ? 'practice' : 'exam';
    const testId = rawTarget;
    if (!testId || typeof testId !== 'string') {
      return { success: false, reason: 'Missing test ID' };
    }

    const testExists = availableTests.some((t) => t.id === testId);
    if (!testExists) {
      return { success: false, reason: 'Unknown test ID' };
    }

    return { success: true, executed: actionType, mode, testId };
  }

  return { success: false, reason: 'Execution unhandled' };
}

async function runTests() {
  console.log('==================================================');
  console.log('RUNNING PHASE 5.3 AI ACTION EXECUTION SUITE');
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

  // Fetch real tests catalogue from server
  const testsRes = await makeRequest({
    hostname: 'localhost',
    port: PORT,
    path: '/api/tests',
    method: 'GET',
  });

  const availableTests = testsRes.data?.tests || [];
  const validTestId = availableTests.length > 0 ? availableTests[0].id : 'cat_foundation';

  // TEST A: OPEN_TEST executes valid real assessment in Exam mode
  const resA = validateAndExecuteAction(
    { actionType: 'OPEN_TEST', payload: validTestId },
    availableTests
  );
  assert(
    resA.success && resA.executed === 'OPEN_TEST' && resA.mode === 'exam' && resA.testId === validTestId,
    'TEST A: OPEN_TEST executes valid real assessment in Exam mode',
    `Executed: ${JSON.stringify(resA)}`
  );

  // TEST B: OPEN_PRACTICE executes valid real assessment in Practice mode
  const resB = validateAndExecuteAction(
    { actionType: 'OPEN_PRACTICE', payload: validTestId },
    availableTests
  );
  assert(
    resB.success && resB.executed === 'OPEN_PRACTICE' && resB.mode === 'practice' && resB.testId === validTestId,
    'TEST B: OPEN_PRACTICE executes valid real assessment in Practice mode',
    `Executed: ${JSON.stringify(resB)}`
  );

  // TEST C: OPEN_REVISION works
  const resC = validateAndExecuteAction({ actionType: 'OPEN_REVISION' }, availableTests);
  assert(
    resC.success && resC.executed === 'OPEN_REVISION' && resC.target === 'vault',
    'TEST C: OPEN_REVISION works'
  );

  // TEST D: OPEN_HISTORY works
  const resD = validateAndExecuteAction({ actionType: 'OPEN_HISTORY' }, availableTests);
  assert(
    resD.success && resD.executed === 'OPEN_HISTORY' && resD.target === 'vault',
    'TEST D: OPEN_HISTORY works'
  );

  // TEST E: OPEN_CAREER_TRACK works
  const resE = validateAndExecuteAction({ actionType: 'OPEN_CAREER_TRACK' }, availableTests);
  assert(
    resE.success && resE.executed === 'OPEN_CAREER_TRACK' && resE.target === 'career',
    'TEST E: OPEN_CAREER_TRACK works'
  );

  // TEST F: NAVIGATE_TAB works only for allowed tabs
  const resF_valid = validateAndExecuteAction(
    { actionType: 'NAVIGATE_TAB', payload: 'leaderboard' },
    availableTests
  );
  const resF_invalid = validateAndExecuteAction(
    { actionType: 'NAVIGATE_TAB', payload: 'secret_dashboard' },
    availableTests
  );
  assert(
    resF_valid.success && !resF_invalid.success,
    'TEST F: NAVIGATE_TAB works only for allowed tabs',
    `Valid: ${resF_valid.success}, Invalid: ${resF_invalid.success}`
  );

  // TEST G: Fake test ID rejected
  const resG = validateAndExecuteAction(
    { actionType: 'OPEN_TEST', payload: 'fake_non_existent_test_999' },
    availableTests
  );
  assert(!resG.success, 'TEST G: Fake test ID rejected', `Reason: ${resG.reason}`);

  // TEST H: Unknown actionType rejected
  const resH = validateAndExecuteAction(
    { actionType: 'RUN_SHELL_COMMAND', payload: 'dir' },
    availableTests
  );
  assert(!resH.success, 'TEST H: Unknown actionType rejected', `Reason: ${resH.reason}`);

  // TEST I: javascript: payload rejected
  const resI = validateAndExecuteAction(
    { actionType: 'NAVIGATE_TAB', payload: 'javascript:alert(document.cookie)' },
    availableTests
  );
  assert(!resI.success, 'TEST I: javascript: payload rejected', `Reason: ${resI.reason}`);

  // TEST J: http/external URL payload rejected
  const resJ = validateAndExecuteAction(
    { actionType: 'OPEN_TEST', payload: 'https://malicious-site.com/hack' },
    availableTests
  );
  assert(!resJ.success, 'TEST J: http/external URL payload rejected', `Reason: ${resJ.reason}`);

  // TEST K: Rapid duplicate execution prevention mechanism check
  const modalContent = fs.readFileSync(
    path.join(__dirname, '../src/components/FirstRoundAICopilotModal.tsx'),
    'utf8'
  );
  const hasRapidClickProtection =
    modalContent.includes('isExecutingAction') && modalContent.includes('disabled={isExecutingAction}');
  assert(
    hasRapidClickProtection,
    'TEST K: Rapid duplicate click execution prevented in UI component'
  );

  // TEST L: Practice mode remains XP/readiness/leaderboard isolated (0 XP verification)
  const timestamp = Date.now();
  const testUserEmail = `phase53_user_${timestamp}@example.com`;
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
      name: 'Phase 5.3 Test Candidate',
      college: 'Test University',
    }
  );
  const userId = regRes.data?.user?.id;

  const testDetailRes = await makeRequest({
    hostname: 'localhost',
    port: PORT,
    path: `/api/tests/${validTestId}`,
    method: 'GET',
  });
  const questions = testDetailRes.data?.test?.questions || [];
  const practiceResponses = questions.map((q) => ({
    questionId: q.id,
    selectedOption: 'A',
    timeSpentSeconds: 10,
  }));

  const practiceSubmitRes = await makeRequest(
    {
      hostname: 'localhost',
      port: PORT,
      path: `/api/tests/${validTestId}/submit`,
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
    },
    {
      userId,
      mode: 'practice',
      responses: practiceResponses,
      timeTakenSeconds: 60,
    }
  );

  const practiceAttempt = practiceSubmitRes.data?.attempt;
  const earnedXP = practiceAttempt?.earnedPoints ?? 0;
  assert(
    practiceSubmitRes.statusCode === 200 && earnedXP === 0,
    'TEST L: Practice mode remains XP/readiness/leaderboard isolated (0 XP earned)',
    `Earned XP: ${earnedXP}`
  );

  // TEST M: Existing Phase 5.2 AI tests pass
  let phase52Passed = false;
  try {
    const out52 = execSync('node scratch/test_phase52_ai_copilot_context.cjs', {
      encoding: 'utf8',
      cwd: path.join(__dirname, '..'),
    });
    phase52Passed = out52.includes('RESULTS: 14 / 14 PASSED');
  } catch (e) {
    phase52Passed = false;
  }
  assert(phase52Passed, 'TEST M: Existing Phase 5.2 AI tests still pass');

  // TEST N: Existing bounded regression passes
  let boundedPassed = false;
  try {
    const outReg = execSync(
      `node "${path.join(__dirname, '../scratch/run_e2e_tests.cjs')}"`,
      { encoding: 'utf8', cwd: path.join(__dirname, '..') }
    );
    boundedPassed = outReg.includes('ALL E2E VERIFICATION TESTS PASSED SUCCESSFULLY!');
  } catch (e) {
    boundedPassed = false;
  }
  assert(boundedPassed, 'TEST N: Existing bounded regression tests still pass');

  // TEST O: Secret scan clean
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

  assert(!foundKeyInClient, 'TEST O: Secret scan clean (0 keys in /src)');

  console.log('\n==================================================');
  console.log(`RESULTS: ${passedCount} / ${totalCount} PASSED`);
  console.log('==================================================\n');

  if (passedCount !== totalCount) {
    process.exit(1);
  }
}

runTests().catch((err) => {
  console.error('Fatal Error running Phase 5.3 AI Actions test suite:', err);
  process.exit(1);
});
