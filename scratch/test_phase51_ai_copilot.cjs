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
            resolve({ status: res.statusCode, data: parsed, raw: data });
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

async function runPhase51Tests() {
  console.log('===========================================================');
  console.log('   PHASE 5.1 — FIRSTROUND AI PLACEMENT COPILOT TEST       ');
  console.log('===========================================================\n');

  try {
    // 1. Placement Coach Query
    console.log('--- Test 1: Placement Coach Mode ---');
    const res1 = await makeRequest('POST', '/api/ai/copilot', {
      message: 'What should I prepare next?',
      mode: 'PLACEMENT_COACH',
      userContext: {
        name: 'Test Candidate',
        targetCompany: 'TCS',
        lifetimeXp: 450,
        level: 2,
        leagueTier: 'Bronze',
      },
    });

    console.log('Placement Coach Status:', res1.status);
    console.log('Placement Coach Payload:', {
      success: res1.data.success,
      mode: res1.data.mode,
      hasText: typeof res1.data.text === 'string' && res1.data.text.length > 0,
      preview: res1.data.text?.substring(0, 100),
    });

    if (res1.status !== 200 || !res1.data.success || !res1.data.text) {
      throw new Error('FAIL: Placement Coach query failed!');
    }
    console.log('✅ Test 1: Placement Coach mode: PASS\n');

    // 2. Performance Coach Query with Real User Context
    console.log('--- Test 2: Performance Coach Mode with User Context ---');
    const res2 = await makeRequest('POST', '/api/ai/copilot', {
      message: 'Analyze my performance',
      mode: 'PERFORMANCE_COACH',
      userContext: {
        name: 'Pawan',
        targetCompany: 'Infosys',
        lifetimeXp: 1250,
        level: 3,
        weeklyXp: 300,
        leagueTier: 'Silver',
      },
    });

    console.log('Performance Coach Payload:', {
      success: res2.data.success,
      mode: res2.data.mode,
      preview: res2.data.text?.substring(0, 120),
    });

    if (res2.status !== 200 || !res2.data.success) {
      throw new Error('FAIL: Performance Coach query failed!');
    }
    console.log('✅ Test 2: Performance Coach mode: PASS\n');

    // 3. Learning Assistant Mode
    console.log('--- Test 3: Learning Assistant Mode ---');
    const res3 = await makeRequest('POST', '/api/ai/copilot', {
      message: 'Explain Time & Work shortcut formulas',
      mode: 'LEARNING_ASSISTANT',
    });

    if (res3.status !== 200 || !res3.data.text) {
      throw new Error('FAIL: Learning Assistant mode failed!');
    }
    console.log('✅ Test 3: Learning Assistant mode: PASS\n');

    // 4. Secret Isolation & Error Payload Verification
    console.log('--- Test 4: Secret Isolation & Error Safety ---');
    const invalidRes = await makeRequest('POST', '/api/ai/copilot', {
      message: null,
    });
    console.log('Invalid Payload Error Status:', invalidRes.status);
    console.log('Error Payload:', invalidRes.data);

    if (invalidRes.status !== 400 || !invalidRes.data.error) {
      throw new Error('FAIL: Invalid request error response not handled safely!');
    }
    if (JSON.stringify(invalidRes.data).includes('GEMINI_API_KEY')) {
      throw new Error('FAIL: API key leaked in error response!');
    }
    console.log('✅ Test 4: Secret isolation & safe error response: PASS\n');

    console.log('===========================================================');
    console.log('   ALL PHASE 5.1 E2E COPILOT TESTS PASSED SUCCESSFULLY!   ');
    console.log('===========================================================');
  } catch (err) {
    console.error('\n❌ PHASE 5.1 TEST FAILED:', err.message);
    process.exit(1);
  }
}

runPhase51Tests();
