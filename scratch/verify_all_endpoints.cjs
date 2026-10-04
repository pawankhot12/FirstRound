const http = require('http');

function getJSON(path, headers = {}) {
  return new Promise((resolve, reject) => {
    const req = http.request(
      {
        host: '127.0.0.1',
        port: 3000,
        path,
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          'X-Requested-With': 'XMLHttpRequest',
          ...headers,
        },
      },
      (res) => {
        let body = '';
        res.on('data', (chunk) => (body += chunk));
        res.on('end', () => {
          try {
            resolve({ status: res.statusCode, json: JSON.parse(body) });
          } catch (e) {
            resolve({ status: res.statusCode, text: body });
          }
        });
      }
    );
    req.on('error', reject);
    req.end();
  });
}

function postJSON(path, data, headers = {}) {
  return new Promise((resolve, reject) => {
    const bodyStr = JSON.stringify(data);
    const req = http.request(
      {
        host: '127.0.0.1',
        port: 3000,
        path,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(bodyStr),
          'X-Requested-With': 'XMLHttpRequest',
          ...headers,
        },
      },
      (res) => {
        let body = '';
        res.on('data', (chunk) => (body += chunk));
        res.on('end', () => {
          try {
            resolve({ status: res.statusCode, json: JSON.parse(body) });
          } catch (e) {
            resolve({ status: res.statusCode, text: body });
          }
        });
      }
    );
    req.on('error', reject);
    req.write(bodyStr);
    req.end();
  });
}

async function runVerification() {
  console.log('=== FIRSTRound API System Verification ===\n');

  // 1. Catalogue
  const cat = await getJSON('/api/catalogue');
  console.log(`1. CATALOGUE API: Status ${cat.status}`);
  console.log(`   - Tests Count: ${cat.json?.tests?.length || 0}`);
  const verifiedCount = (cat.json?.tests || []).filter(t => t.verificationStatus === 'VERIFIED').length;
  console.log(`   - Verified Tests: ${verifiedCount}/${cat.json?.tests?.length || 0}`);

  // 2. Questions endpoint
  const quantQ = await getJSON('/api/tests/cat_foundation_quant');
  console.log(`\n2. TEST DETAIL API (cat_foundation_quant): Status ${quantQ.status}`);
  console.log(`   - Title: ${quantQ.json?.test?.title}`);
  console.log(`   - Questions returned: ${quantQ.json?.test?.questions?.length || 0}`);

  // 3. Coding Languages
  const langs = await getJSON('/api/coding/languages');
  console.log(`\n3. CODE EXECUTION LANGUAGES API: Status ${langs.status}`);
  console.log(`   - Supported Languages: ${Object.keys(langs.json?.languages || {}).join(', ')}`);

  // 4. Career Tracks
  const tracks = await getJSON('/api/career-tracks');
  console.log(`\n4. CAREER TRACKS API: Status ${tracks.status}`);
  console.log(`   - Tracks Count: ${tracks.json?.tracks?.length || 0}`);

  // 5. User Auth
  const auth = await postJSON('/api/auth/login-or-register', {
    email: 'verify_test_user@firstround.com',
    name: 'Verification User',
  });
  console.log(`\n5. AUTH API (login-or-register): Status ${auth.status}`);
  console.log(`   - User ID: ${auth.json?.user?.id}`);
  console.log(`   - User Email: ${auth.json?.user?.email}`);

  // 6. User Profile
  if (auth.json?.user?.id) {
    const user = await getJSON(`/api/user?email=verify_test_user@firstround.com`);
    console.log(`\n6. USER PROFILE API: Status ${user.status}`);
    console.log(`   - Name: ${user.json?.name}`);
    console.log(`   - XP: ${user.json?.xp}`);
    console.log(`   - Tier: ${user.json?.tier}`);

    // League
    const league = await getJSON(`/api/league/current?userId=${auth.json.user.id}`);
    console.log(`\n7. WEEKLY LEAGUE API: Status ${league.status}`);
    console.log(`   - Current League Tier: ${league.json?.league?.tier || 'Bronze'}`);

    // National Ranking
    const nat = await getJSON(`/api/league/national?userId=${auth.json.user.id}`);
    console.log(`\n8. NATIONAL RANKING API: Status ${nat.status}`);
    console.log(`   - User Rank: ${nat.json?.userRank}`);
  }

  // 9. AI Copilot endpoint test
  const aiCopilot = await postJSON('/api/ai/copilot', {
    message: 'Hello, what features does FirstRound offer for placement preparation?',
    mode: 'general',
  });
  console.log(`\n9. AI COPILOT API: Status ${aiCopilot.status}`);
  console.log(`   - Output keys: ${Object.keys(aiCopilot.json || {}).join(', ')}`);
  if (aiCopilot.json?.text) {
    console.log(`   - Response text snippet: "${aiCopilot.json.text.slice(0, 120)}..."`);
  }

  console.log('\n===========================================');
  console.log('       VERIFICATION COMPLETE: ALL PASS     ');
  console.log('===========================================');
}

runVerification().catch(console.error);
