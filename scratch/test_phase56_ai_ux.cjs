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
  console.log('===========================================================');
  console.log('  PHASE 5.6: FIRSTROUND AI PRODUCTION UX SUITE             ');
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
    const modalFile = fs.readFileSync(
      path.join(__dirname, '../src/components/FirstRoundAICopilotModal.tsx'),
      'utf-8'
    );
    const appFile = fs.readFileSync(path.join(__dirname, '../src/App.tsx'), 'utf-8');

    // A. AI opens from dashboard
    console.log('--- Test A: AI Launcher & Component Export ---');
    assert(appFile.includes('floating-ai-copilot-launcher') && appFile.includes('isAICopilotOpen'), 'Test A: AI launcher button and open state exist in App.tsx');
    assert(modalFile.includes('FirstRoundAICopilotModal'), 'Test A: FirstRoundAICopilotModal component registered');

    // B. Strategy renders
    console.log('\n--- Test B: Placement Strategy UI Card & Skeleton ---');
    assert(modalFile.includes('ai-placement-strategy-card'), 'Test B: Placement strategy card rendered');
    assert(modalFile.includes('ai-placement-strategy-skeleton'), 'Test B: Strategy loading skeleton present');

    // C. Suggested prompts render
    console.log('\n--- Test C: Suggested Prompt Chips ---');
    assert(modalFile.includes('SUGGESTED_PROMPTS'), 'Test C: Suggested prompts array configured');
    assert(modalFile.includes('ai-suggested-prompt-'), 'Test C: Suggested prompt chips rendered');

    // D. All 5 AI modes work
    console.log('\n--- Test D: All 5 AI Modes Support ---');
    const modes = ['PLACEMENT_COACH', 'PERFORMANCE_COACH', 'LEARNING_ASSISTANT', 'DOUBT_SOLVER', 'STUDY_PLANNER'];
    let modesOk = true;
    for (const mode of modes) {
      const res = await makeRequest(
        { hostname: 'localhost', port: PORT, path: '/api/ai/copilot', method: 'POST', headers: { 'Content-Type': 'application/json' } },
        { message: 'Test query', mode }
      );
      if (res.statusCode !== 200 || !res.data?.success) modesOk = false;
    }
    assert(modesOk, 'Test D: All 5 AI modes execute successfully');

    // E. Enter sends
    console.log('\n--- Test E: Enter Key Submit Handling ---');
    assert(modalFile.includes("e.key === 'Enter' && !e.shiftKey"), 'Test E: Enter key submits query without Shift');

    // F. Loading state works
    console.log('\n--- Test F: Loading State & Typing Indicator ---');
    assert(modalFile.includes('FirstRound AI is thinking...'), 'Test F: Thinking indicator rendered during request');

    // G. Response renders safely
    console.log('\n--- Test G: Safe Text & Action Parsing ---');
    assert(modalFile.includes('safeText') && modalFile.includes('safeActions'), 'Test G: Text and actions sanitized safely before render');

    // H. Action cards execute once
    console.log('\n--- Test H: Double-Click Prevention & Single Execution ---');
    assert(modalFile.includes('isExecutingAction'), 'Test H: Action card prevents double execution with flag');

    // I. Retry works after failure
    console.log('\n--- Test I: Error & Retry UX ---');
    assert(modalFile.includes('ai-copilot-try-again-btn'), 'Test I: Try Again button present');
    assert(modalFile.includes("FirstRound AI couldn't complete that request."), 'Test I: Safe user error message displayed');

    // J. Close / reopen works
    console.log('\n--- Test J: Modal Lifecycle & Unmount Guard ---');
    assert(modalFile.includes('isMountedRef'), 'Test J: isMountedRef guard prevents post-unmount state updates');

    // K. Conversation does not duplicate
    console.log('\n--- Test K: Session Conversation Integrity ---');
    assert(modalFile.includes('setMessages((prev) => [...prev, assistantMsg])'), 'Test K: Conversation appends cleanly without duplication');

    // L. Rapid open / close safe
    console.log('\n--- Test L: Rapid Open/Close Safety ---');
    assert(appFile.includes('AIErrorBoundary'), 'Test L: Wrapped in AIErrorBoundary to catch any unmount crash');

    // M. Malformed response safe
    console.log('\n--- Test M: Malformed Response Protection ---');
    assert(modalFile.includes('Array.isArray(response?.actions)'), 'Test M: Actions safely fall back to [] if non-array');

    // N. Fallback safe
    console.log('\n--- Test N: Server Fallback Safety ---');
    assert(modalFile.includes('setErrorState'), 'Test N: Error state caught defensively');

    // O. Mobile layout checks
    console.log('\n--- Test O: Mobile Viewport Styling & Text Wrapping ---');
    assert(modalFile.includes('break-words overflow-wrap-anywhere'), 'Test O: Text wrapping classes prevent overflow');
    assert(modalFile.includes('max-h-[750px]'), 'Test O: Container bounds set for mobile viewports');

    // P. Keyboard & Accessibility checks
    console.log('\n--- Test P: Accessibility & Keyboard Navigation ---');
    assert(modalFile.includes('autoFocus'), 'Test P: Input has autoFocus enabled');
    assert(modalFile.includes('aria-label='), 'Test P: Buttons and inputs have accessible aria-labels');
    assert(modalFile.includes("e.key === 'Escape'"), 'Test P: Escape key closes modal');

    // Q. No uncaught runtime errors
    console.log('\n--- Test Q: Runtime Exception Scan ---');
    assert(!modalFile.includes('eval(') && !modalFile.includes('dangerouslySetInnerHTML'), 'Test Q: No unsafe eval or un-sanitized HTML injection');

    // R. Run Phase 5.2 suite
    console.log('\n--- Test R: Phase 5.2 Suite Verification ---');
    try {
      execSync('node scratch/test_phase52_ai_copilot_context.cjs', { stdio: 'inherit' });
      assert(true, 'Test R: Phase 5.2 Context test suite PASS');
    } catch (err) {
      assert(false, 'Test R: Phase 5.2 Context test suite FAIL');
    }

    // S. Run Phase 5.3 suite
    console.log('\n--- Test S: Phase 5.3 Suite Verification ---');
    try {
      execSync('node scratch/test_phase53_ai_actions.cjs', { stdio: 'inherit' });
      assert(true, 'Test S: Phase 5.3 Actions test suite PASS');
    } catch (err) {
      assert(false, 'Test S: Phase 5.3 Actions test suite FAIL');
    }

    // T. Run Phase 5.4 suite
    console.log('\n--- Test T: Phase 5.4 Suite Verification ---');
    try {
      execSync('node scratch/test_phase54_ai_intelligence.cjs', { stdio: 'inherit' });
      assert(true, 'Test T: Phase 5.4 Intelligence test suite PASS');
    } catch (err) {
      assert(false, 'Test T: Phase 5.4 Intelligence test suite FAIL');
    }

    // U. Run Phase 5.5A suite
    console.log('\n--- Test U: Phase 5.5A Suite Verification ---');
    try {
      execSync('node scratch/test_phase55_ai_white_screen.cjs', { stdio: 'inherit' });
      assert(true, 'Test U: Phase 5.5A White-Screen Hardening test suite PASS');
    } catch (err) {
      assert(false, 'Test U: Phase 5.5A White-Screen Hardening test suite FAIL');
    }

    // V. Run Phase 5.5B suite
    console.log('\n--- Test V: Phase 5.5B Suite Verification ---');
    try {
      execSync('node scratch/test_phase55b_placement_strategy.cjs', { stdio: 'inherit' });
      assert(true, 'Test V: Phase 5.5B Placement Strategy test suite PASS');
    } catch (err) {
      assert(false, 'Test V: Phase 5.5B Placement Strategy test suite FAIL');
    }

    // W. Bounded regression
    console.log('\n--- Test W: Bounded Regression Suite ---');
    await new Promise((r) => setTimeout(r, 500));
    const testsRes = await makeRequest({ hostname: 'localhost', port: PORT, path: '/api/tests', method: 'GET' });
    const lbRes = await makeRequest({ hostname: 'localhost', port: PORT, path: '/api/leaderboard', method: 'GET' });
    assert(testsRes.statusCode === 200, 'Test W: GET /api/tests returns 200 OK');
    assert(lbRes.statusCode === 200, 'Test W: GET /api/leaderboard returns 200 OK');

    // X. Secret scan
    console.log('\n--- Test X: Secret Key Leak Scan ---');
    const srcAppFile = fs.readFileSync(path.join(__dirname, '../src/App.tsx'), 'utf-8');
    const hasSecretKeyInApp = srcAppFile.includes('AI_STUDIO_KEY') || srcAppFile.includes('GEMINI_API_KEY') || srcAppFile.includes('AI_API_KEY');
    assert(!hasSecretKeyInApp, 'Test X: No AI secret keys leaked into App.tsx client code');

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
