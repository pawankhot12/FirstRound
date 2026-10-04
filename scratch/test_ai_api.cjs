const http = require('http');

function makeRequest(path, method, body, headers = {}) {
  return new Promise((resolve, reject) => {
    const dataString = body ? JSON.stringify(body) : '';
    const req = http.request(
      {
        hostname: 'localhost',
        port: 3000,
        path,
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

async function testAI() {
  console.log('--- 1. Testing GET /api/ai/placement-strategy ---');
  const stratRes = await makeRequest('/api/ai/placement-strategy?userId=usr_student1', 'GET');
  console.log('Placement Strategy Status:', stratRes.status);
  console.log('Placement Strategy Data:', JSON.stringify(stratRes.json, null, 2));

  console.log('\n--- 2. Testing POST /api/ai/copilot across modes ---');
  const modes = ['PLACEMENT_COACH', 'PERFORMANCE_COACH', 'LEARNING_ASSISTANT', 'DOUBT_SOLVER', 'STUDY_PLANNER'];

  for (const mode of modes) {
    const res = await makeRequest('/api/ai/copilot', 'POST', {
      message: 'What should I work on today?',
      mode,
      userId: 'usr_student1',
    }, {
      'x-requested-with': 'XMLHttpRequest',
    });
    console.log(`\nMode [${mode}] Status:`, res.status);
    console.log(`Mode [${mode}] Response Shape:`, {
      hasText: typeof res.json?.text === 'string',
      textType: typeof res.json?.text,
      mode: res.json?.mode,
      actionsCount: res.json?.actions?.length,
      actions: res.json?.actions,
    });
  }
}

testAI().catch(console.error);
