const http = require('http');
const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');

function makeRequest(method, reqPath, body = null, headers = {}) {
  return new Promise((resolve, reject) => {
    const req = http.request(
      {
        host: '127.0.0.1',
        port: 3000,
        method,
        path: reqPath,
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

async function auditFullApp() {
  console.log('===========================================================');
  console.log('       STARTING FULL FIRSTRound PRODUCTION AUDIT          ');
  console.log('===========================================================\n');

  const auditReport = {
    auth: {},
    dashboard: {},
    testHub: {},
    exam: {},
    practice: {},
    xp: {},
    result: {},
    history: {},
    revisionVault: {},
    league: {},
    nationalRanking: {},
    careerTracks: {},
    profile: {},
    aiAssistant: {},
    notifications: {},
    admin: {},
    coding: {},
    database: {},
    security: {},
    issues: [],
  };

  const dbPath = path.resolve(__dirname, '../firstround.db');
  const db = new Database(dbPath);

  // 1. Database & User Data Integrity Audit
  console.log('--- 1. DATABASE & USER DATA INTEGRITY AUDIT ---');
  const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all();
  auditReport.database.tablesCount = tables.length;
  auditReport.database.tableNames = tables.map((t) => t.name);

  const allUsers = db.prepare('SELECT * FROM users').all();
  const realUsers = allUsers.filter(
    (u) =>
      !u.email.includes('example.com') &&
      !u.email.includes('p4_') &&
      !u.email.includes('p42_') &&
      !u.email.includes('p43_') &&
      !u.email.includes('p44_') &&
      !u.email.includes('p45_') &&
      !u.email.includes('bugfix_')
  );
  const testUsers = allUsers.filter((u) => !realUsers.includes(u));

  auditReport.database.totalUsers = allUsers.length;
  auditReport.database.realUsersCount = realUsers.length;
  auditReport.database.testUsersCount = testUsers.length;
  auditReport.database.realUsers = realUsers.map((u) => ({ id: u.id, email: u.email, name: u.name, role: u.role }));

  console.log(`Total Users: ${allUsers.length} (Real: ${realUsers.length}, Test/Seed/QA: ${testUsers.length})`);

  // Count tests in DB / catalogues
  const testsRes = await makeRequest('GET', '/api/tests');
  const testsList = testsRes.data.tests || [];
  auditReport.testHub.totalTests = testsList.length;
  auditReport.testHub.tests = testsList.map((t) => ({ id: t.id, title: t.title, category: t.category, totalQuestions: t.totalQuestions }));

  console.log(`Total Inventory Assessments: ${testsList.length}`);

  // 2. Auth & Security API Probe
  console.log('\n--- 2. AUTH & SECURITY PROBE ---');
  // Login/Register test
  const timestamp = Date.now();
  const authRes = await makeRequest('POST', '/api/auth/login-or-register', {
    email: `audit_user_${timestamp}@example.com`,
    name: 'Audit User',
  });
  const auditUser = authRes.data.user;
  auditReport.auth.loginRegisterStatus = authRes.status;
  auditReport.auth.returnedUser = auditUser;

  // Security Check: Attempt role escalation via API
  const escalateRes = await makeRequest('PUT', `/api/users/${auditUser?.id}`, {
    role: 'admin',
    email: `audit_user_${timestamp}@example.com`,
  });
  console.log('Role escalation attempt response:', escalateRes.status, escalateRes.data);
  if (escalateRes.data?.user?.role === 'admin') {
    auditReport.issues.push({
      severity: 'CRITICAL',
      area: 'SECURITY',
      file: 'server.ts / server/db.ts',
      description: 'Client can escalate their own role to admin via PUT /api/users/:id!',
      repro: `PUT /api/users/${auditUser?.id} with body { role: 'admin' }`,
    });
  }

  // Security Check: Unauthorized Admin endpoint access
  const adminTestRes = await makeRequest('GET', '/api/admin/overview');
  console.log('Admin overview status without admin secret:', adminTestRes.status);
  if (adminTestRes.status === 200) {
    auditReport.issues.push({
      severity: 'CRITICAL',
      area: 'SECURITY',
      file: 'server.ts',
      description: 'Admin overview endpoint /api/admin/overview allows unauthenticated access!',
      repro: 'GET /api/admin/overview with no headers',
    });
  }

  // Check Supabase key leakage in env / client bundle
  const serverCode = fs.readFileSync(path.resolve(__dirname, '../server.ts'), 'utf8');
  if (serverCode.includes('SUPABASE_SERVICE_ROLE_KEY') && serverCode.includes('/api/config')) {
    auditReport.issues.push({
      severity: 'CRITICAL',
      area: 'SECURITY',
      file: 'server.ts',
      description: 'Supabase Service Role Key exposed to client via /api/config!',
    });
  }

  // 3. Weekly League & National Ranking API Probe
  console.log('\n--- 3. LEAGUE & NATIONAL RANKING PROBE ---');
  const leagueRes = await makeRequest('GET', `/api/league/current?userId=${auditUser?.id}`);
  auditReport.league.currentLeagueRes = leagueRes.data;

  const nationalRes = await makeRequest('GET', `/api/league/national?userId=${auditUser?.id}`);
  auditReport.nationalRanking.nationalRes = nationalRes.data;

  // 4. Career Tracks & Revision Probe
  console.log('\n--- 4. CAREER TRACKS & REVISION PROBE ---');
  const tracksRes = await makeRequest('GET', '/api/career-tracks');
  auditReport.careerTracks.count = tracksRes.data?.tracks?.length || 0;

  const revRes = await makeRequest('GET', `/api/revision-vault/${auditUser?.id}`);
  auditReport.revisionVault.status = revRes.status;

  // 5. AI Assistant Probe
  console.log('\n--- 5. AI ASSISTANT PROBE ---');
  const aiRes = await makeRequest('POST', '/api/ai/doubt', {
    questionId: 'q_quant_001',
    userSelectedOption: 'A',
    studentQuestion: 'How to solve this?',
  });
  console.log('AI Doubt response status:', aiRes.status, 'Response keys:', Object.keys(aiRes.data || {}));
  auditReport.aiAssistant.status = aiRes.status;
  auditReport.aiAssistant.data = aiRes.data;

  // 6. Clean temporary audit user
  db.prepare("DELETE FROM users WHERE email LIKE 'audit_user_%'").run();

  // Save report to scratch file for parsing
  fs.writeFileSync(path.resolve(__dirname, 'audit_raw_report.json'), JSON.stringify(auditReport, null, 2));
  console.log('\n✅ Audit data captured to scratch/audit_raw_report.json');
}

auditFullApp();
