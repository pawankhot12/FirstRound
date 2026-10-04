const http = require('http');

function makeRequest(urlPath, method, body, headers = {}) {
  return new Promise((resolve, reject) => {
    const dataString = body ? JSON.stringify(body) : '';
    const req = http.request(
      {
        hostname: 'localhost',
        port: 3000,
        path: urlPath,
        method,
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(dataString),
          ...headers,
        },
      },
      (res) => {
        let raw = '';
        res.on('data', (chunk) => (raw += chunk));
        res.on('end', () => {
          try {
            resolve({ status: res.statusCode, json: JSON.parse(raw) });
          } catch (e) {
            resolve({ status: res.statusCode, text: raw });
          }
        });
      }
    );
    req.on('error', reject);
    if (body) req.write(dataString);
    req.end();
  });
}

async function runPhase57Tests() {
  console.log('=== PHASE 5.7 NATURAL AI CONVERSATION VERIFICATION ===\n');

  let passCount = 0;
  let totalCount = 0;

  function assert(id, description, condition, details = '') {
    totalCount++;
    if (condition) {
      passCount++;
      console.log(`[PASS] ${id}: ${description}`);
    } else {
      console.error(`[FAIL] ${id}: ${description} - ${details}`);
    }
  }

  // 1. Natural Greeting — "hi"
  const greetingRes = await makeRequest('/api/ai/copilot', 'POST', {
    message: 'hi',
    userId: 'usr_student1',
  });
  const greetingText = greetingRes.json?.text || '';
  const hasReportHeaders =
    greetingText.includes('Completed Exams:') ||
    greetingText.includes('Biggest Gap:') ||
    greetingText.includes('Next Best Action:') ||
    greetingText.includes('Lifetime XP:') ||
    greetingText.includes('League Tier:');
  assert(
    '1a',
    '"hi" returns 200 with natural greeting',
    greetingRes.status === 200 && greetingText.length > 0,
    `status=${greetingRes.status}, text=${greetingText.substring(0, 100)}`
  );
  assert(
    '1b',
    '"hi" contains Hey/Hello greeting',
    /hey|hello|hi there|good to see/i.test(greetingText),
    greetingText.substring(0, 100)
  );
  assert(
    '1c',
    '"hi" does NOT contain rigid report headers',
    !hasReportHeaders,
    greetingText.substring(0, 200)
  );

  // 2. Casual message doesn't trigger report
  const casualRes = await makeRequest('/api/ai/copilot', 'POST', {
    message: 'hey there',
    userId: 'usr_student1',
  });
  const casualText = casualRes.json?.text || '';
  const casualHasReport =
    casualText.includes('Completed Exams:') ||
    casualText.includes('Biggest Gap:') ||
    casualText.includes('Weekly XP:');
  assert(
    '2',
    'Casual "hey there" does NOT trigger report format',
    casualRes.status === 200 && !casualHasReport,
    casualText.substring(0, 200)
  );

  // 3. Intent Detection: Performance
  const perfRes = await makeRequest('/api/ai/copilot', 'POST', {
    message: 'how am I doing?',
    userId: 'usr_student1',
  });
  assert(
    '3',
    'Performance intent returns valid response',
    perfRes.status === 200 && typeof perfRes.json?.text === 'string' && perfRes.json.text.length > 10,
    `status=${perfRes.status}`
  );

  // 4. Intent Detection: Placement
  const placeRes = await makeRequest('/api/ai/copilot', 'POST', {
    message: 'prepare me for Wipro',
    userId: 'usr_student1',
  });
  assert(
    '4',
    'Placement intent returns valid response',
    placeRes.status === 200 && typeof placeRes.json?.text === 'string' && placeRes.json.text.length > 10,
    `status=${placeRes.status}`
  );

  // 5. Intent Detection: Learning / Doubt
  const learnRes = await makeRequest('/api/ai/copilot', 'POST', {
    message: 'explain normalization',
    userId: 'usr_student1',
  });
  assert(
    '5',
    'Learning intent returns valid response',
    learnRes.status === 200 && typeof learnRes.json?.text === 'string',
    `status=${learnRes.status}`
  );

  // 6. Intent Detection: Study Planning
  const planRes = await makeRequest('/api/ai/copilot', 'POST', {
    message: 'make me a 7-day study plan',
    userId: 'usr_student1',
  });
  assert(
    '6',
    'Study planning intent returns valid response',
    planRes.status === 200 && typeof planRes.json?.text === 'string',
    `status=${planRes.status}`
  );

  // 7. Intent Detection: Next Action
  const nextRes = await makeRequest('/api/ai/copilot', 'POST', {
    message: 'what should I do today?',
    userId: 'usr_student1',
  });
  assert(
    '7',
    'Next action intent returns valid response',
    nextRes.status === 200 && typeof nextRes.json?.text === 'string',
    `status=${nextRes.status}`
  );

  // 8. Follow-up Context with History
  const followUpRes = await makeRequest('/api/ai/copilot', 'POST', {
    message: 'tell me more about that',
    userId: 'usr_student1',
    history: [
      { sender: 'user', text: 'why am I weak in Tables?' },
      { sender: 'assistant', text: 'Your recent attempts show Tables accuracy is below 50%.' },
    ],
  });
  assert(
    '8',
    'Follow-up message with history returns context-aware response',
    followUpRes.status === 200 && typeof followUpRes.json?.text === 'string',
    `status=${followUpRes.status}`
  );

  // 9. Action Filtering: Zero Revision Vault
  const actions = nextRes.json?.actions || [];
  const hasZeroRevision = actions.some(
    (a) => a.label && (/0 items/i.test(a.label) || (a.actionType === 'OPEN_REVISION' && a.label.includes('0')))
  );
  assert(
    '9',
    'No action contains "(0 items)" or zero-item revision vault',
    !hasZeroRevision,
    JSON.stringify(actions)
  );

  // 10. Greeting text does NOT contain raw ### headers
  const hasRawHeaders = /^#{1,3}\s/m.test(greetingText);
  assert(
    '10',
    'Greeting text does NOT contain raw ### headers',
    !hasRawHeaders,
    greetingText.substring(0, 200)
  );

  // 11. API Health Check (regression)
  const healthRes = await makeRequest('/api/health', 'GET');
  assert(
    '11',
    'Health endpoint returns ok (regression)',
    healthRes.status === 200 && healthRes.json?.status === 'ok'
  );

  // 12. Tests endpoint works (regression)
  const testsRes = await makeRequest('/api/tests', 'GET');
  assert(
    '12',
    'Tests endpoint returns data (regression)',
    testsRes.status === 200 && Array.isArray(testsRes.json?.tests)
  );

  // 13. Placement strategy endpoint works (regression)
  const stratRes = await makeRequest('/api/ai/placement-strategy?userId=usr_student1', 'GET');
  assert(
    '13',
    'Placement strategy endpoint works (regression)',
    stratRes.status === 200 && stratRes.json?.strategy
  );

  // 14. Secret scan: no API keys in responses
  const allResponseTexts = [
    greetingText,
    casualText,
    perfRes.json?.text,
    placeRes.json?.text,
    learnRes.json?.text,
    planRes.json?.text,
  ].filter(Boolean).join(' ');
  const hasSecrets =
    /AIza[0-9A-Za-z_-]{35}/i.test(allResponseTexts) ||
    /sk-[a-zA-Z0-9]{20,}/i.test(allResponseTexts) ||
    /GEMINI_API_KEY/i.test(allResponseTexts);
  assert(
    '14',
    'No API keys or secrets leaked in AI responses',
    !hasSecrets,
    'Scanned all response texts'
  );

  // SUMMARY
  console.log(`\nRESULTS: ${passCount}/${totalCount} tests passed.`);
  if (passCount === totalCount) {
    console.log('SUCCESS: Phase 5.7 Natural AI Conversation verification PASSED!');
  } else {
    console.error('FAILURE: Some tests failed.');
    process.exit(1);
  }
}

runPhase57Tests().catch((err) => {
  console.error(err);
  process.exit(1);
});
