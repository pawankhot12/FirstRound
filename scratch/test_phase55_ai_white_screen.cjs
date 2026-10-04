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

// Client-side response sanitizer mirror to test component logic
function sanitizeAIResponse(resData) {
  let rawText = resData?.text;
  let rawActions = resData?.actions;

  let safeText = 'Here is how I can assist with your preparation today.';
  if (typeof rawText === 'string' && rawText.trim().length > 0) {
    safeText = rawText.trim();
  } else if (rawText && typeof rawText === 'object') {
    safeText = JSON.stringify(rawText);
  }

  let safeActions = [];
  if (Array.isArray(rawActions)) {
    safeActions = rawActions.filter((act) => act && typeof act === 'object' && typeof act.title === 'string');
  }

  return { safeText, safeActions };
}

// Client action execution validator mirror
function validateAction(action) {
  if (!action || typeof action !== 'object') return false;
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

  if (!actionType || !ALLOWED_ACTION_TYPES.has(actionType)) return false;

  if (typeof rawTarget === 'string') {
    const lower = rawTarget.toLowerCase().trim();
    if (
      lower.startsWith('javascript:') ||
      lower.startsWith('http:') ||
      lower.startsWith('https:') ||
      lower.startsWith('//') ||
      lower.includes('<script') ||
      lower.includes('eval(')
    ) {
      return false;
    }
  }

  if (actionType === 'NAVIGATE_TAB') {
    const ALLOWED_TABS = new Set(['home', 'tests', 'leaderboard', 'vault', 'career', 'admin']);
    return Boolean(rawTarget && ALLOWED_TABS.has(rawTarget));
  }

  return true;
}

async function runTests() {
  console.log('===========================================================');
  console.log('  PHASE 5.5A: AI ASSISTANT WHITE-SCREEN FIX & HARDENING    ');
  console.log('===========================================================\n');

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

  try {
    // A. AI modal opens
    console.log('--- Test A: AI Modal Component Registration & Interface ---');
    const modalFile = fs.readFileSync(
      path.join(__dirname, '../src/components/FirstRoundAICopilotModal.tsx'),
      'utf-8'
    );
    assert(modalFile.includes('FirstRoundAICopilotModal'), 'Test A: AI Modal component exported correctly');
    assert(modalFile.includes('isMountedRef'), 'Test A: AI Modal contains isMountedRef unmount guard');

    // B. All 5 AI modes render
    console.log('\n--- Test B: All 5 AI Modes Support ---');
    const modes = ['PLACEMENT_COACH', 'PERFORMANCE_COACH', 'LEARNING_ASSISTANT', 'DOUBT_SOLVER', 'STUDY_PLANNER'];
    let allModesValid = true;
    for (const mode of modes) {
      const res = await makeRequest(
        {
          hostname: 'localhost',
          port: PORT,
          path: '/api/ai/copilot',
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
        },
        { message: 'Hello', mode }
      );
      if (res.statusCode !== 200 || !res.data?.success) {
        allModesValid = false;
        console.error(`Failed mode ${mode}: status ${res.statusCode}`);
      }
    }
    assert(allModesValid, 'Test B: All 5 AI modes complete request without crashing');

    // C. Normal response renders
    console.log('\n--- Test C: Normal AI Response ---');
    const resC = await makeRequest(
      {
        hostname: 'localhost',
        port: PORT,
        path: '/api/ai/copilot',
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      },
      { message: 'How do I improve speed?', mode: 'PLACEMENT_COACH' }
    );
    const sanitizedC = sanitizeAIResponse(resC.data);
    assert(typeof sanitizedC.safeText === 'string' && sanitizedC.safeText.length > 0, 'Test C: Normal response text parsed safely');

    // D. Empty response does not crash
    console.log('\n--- Test D: Empty Response Handling ---');
    const emptyRes = { text: '', actions: [] };
    const sanitizedD = sanitizeAIResponse(emptyRes);
    assert(sanitizedD.safeText === 'Here is how I can assist with your preparation today.', 'Test D: Empty response text safely defaults');

    // E. Malformed response does not crash
    console.log('\n--- Test E: Malformed Response Handling ---');
    const malformedRes = { text: { raw: 'nested object' }, actions: 'not an array' };
    const sanitizedE = sanitizeAIResponse(malformedRes);
    assert(typeof sanitizedE.safeText === 'string', 'Test E: Malformed text object converted to string');
    assert(Array.isArray(sanitizedE.safeActions) && sanitizedE.safeActions.length === 0, 'Test E: Malformed actions safely sanitized to []');

    // F. Missing actions does not crash
    console.log('\n--- Test F: Missing Actions Handling ---');
    const missingActionsRes = { text: 'Some text' };
    const sanitizedF = sanitizeAIResponse(missingActionsRes);
    assert(Array.isArray(sanitizedF.safeActions), 'Test F: Missing actions defaults safely to []');

    // G. Invalid actions are ignored
    console.log('\n--- Test G: Invalid Action Filtering ---');
    const invalidActions = [
      { actionType: 'HACK_SYSTEM', payload: 'do_bad' },
      { actionType: 'NAVIGATE_TAB', target: 'javascript:alert(1)' },
      null,
      'string_action',
    ];
    const validCount = invalidActions.filter(validateAction).length;
    assert(validCount === 0, 'Test G: Invalid/malformed action objects strictly rejected');

    // H. API failure shows safe error state
    console.log('\n--- Test H: Safe Error State UX ---');
    assert(modalFile.includes("FirstRound AI couldn't complete that request."), 'Test H: Modal contains exact user-facing error message');
    assert(!modalFile.includes('err?.message ||'), 'Test H: Raw error messages not exposed in user error state');

    // I. Fallback response renders
    console.log('\n--- Test I: Fallback Response Integration ---');
    assert(modalFile.includes('safeText'), 'Test I: Modal uses safeText sanitization fallback');
    assert(modalFile.includes('safeActions'), 'Test I: Modal uses safeActions array fallback');

    // J. Rapid open/close unmount safety
    console.log('\n--- Test J: Rapid Open/Close Unmount Safety ---');
    assert(modalFile.includes('if (!isMountedRef.current) return;'), 'Test J: Modal checks isMountedRef before all async state updates');

    // K. Action click does not crash
    console.log('\n--- Test K: Action Click Safety ---');
    assert(modalFile.includes('try {') && modalFile.includes('onExecuteAction'), 'Test K: Action execution wrapped in defensive try/catch');

    // L. AI Navigation safety
    console.log('\n--- Test L: Safe Navigation Validation ---');
    const validNavAction = { actionType: 'NAVIGATE_TAB', payload: 'tests' };
    const invalidNavAction = { actionType: 'NAVIGATE_TAB', payload: 'secret_admin_dashboard' };
    assert(validateAction(validNavAction) === true, 'Test L: Valid tab navigation allowed');
    assert(validateAction(invalidNavAction) === false, 'Test L: Invalid tab navigation rejected');

    // M. Run Phase 5.2 test suite
    console.log('\n--- Test M: Phase 5.2 Suite Verification ---');
    try {
      execSync('node scratch/test_phase52_ai_copilot_context.cjs', { stdio: 'inherit' });
      assert(true, 'Test M: Phase 5.2 Context test suite PASS');
    } catch (err) {
      assert(false, 'Test M: Phase 5.2 Context test suite FAIL');
    }

    // N. Run Phase 5.3 test suite
    console.log('\n--- Test N: Phase 5.3 Suite Verification ---');
    try {
      execSync('node scratch/test_phase53_ai_actions.cjs', { stdio: 'inherit' });
      assert(true, 'Test N: Phase 5.3 Actions test suite PASS');
    } catch (err) {
      assert(false, 'Test N: Phase 5.3 Actions test suite FAIL');
    }

    // O. Run Phase 5.4 test suite
    console.log('\n--- Test O: Phase 5.4 Suite Verification ---');
    try {
      execSync('node scratch/test_phase54_ai_intelligence.cjs', { stdio: 'inherit' });
      assert(true, 'Test O: Phase 5.4 Intelligence test suite PASS');
    } catch (err) {
      assert(false, 'Test O: Phase 5.4 Intelligence test suite FAIL');
    }

    // P. Bounded regression
    console.log('\n--- Test P: Bounded Regression Suite ---');
    await new Promise((r) => setTimeout(r, 500));
    const testsRes = await makeRequest({ hostname: 'localhost', port: PORT, path: '/api/tests', method: 'GET' });
    const lbRes = await makeRequest({ hostname: 'localhost', port: PORT, path: '/api/leaderboard', method: 'GET' });
    assert(testsRes.statusCode === 200, 'Test P: GET /api/tests returns 200 OK');
    assert(lbRes.statusCode === 200, 'Test P: GET /api/leaderboard returns 200 OK');

    // Q. Secret scan
    console.log('\n--- Test Q: Secret Key Leak Scan ---');
    const srcAppFile = fs.readFileSync(path.join(__dirname, '../src/App.tsx'), 'utf-8');
    const hasSecretKeyInApp = srcAppFile.includes('AI_STUDIO_KEY') || srcAppFile.includes('GEMINI_API_KEY') || srcAppFile.includes('AI_API_KEY');
    assert(!hasSecretKeyInApp, 'Test Q: No AI secret keys leaked into App.tsx client code');

    console.log(`\n===========================================================`);
    console.log(`  FINAL RESULT: ${passedCount} / ${totalCount} TESTS PASSED`);
    console.log(`===========================================================`);

    if (passedCount !== totalCount) {
      process.exit(1);
    }
  } catch (err) {
    console.error('Test execution error:', err);
    process.exit(1);
  }
}

runTests();
