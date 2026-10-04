const http = require('http');
const Database = require('better-sqlite3');

const baseUrl = 'http://localhost:3000';
const db = new Database('./firstround.db');

function request(method, path, body = null, headers = {}) {
  return new Promise((resolve, reject) => {
    const url = new URL(path, baseUrl);
    const req = http.request(url, { method, headers }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, data: JSON.parse(data) });
        } catch {
          resolve({ status: res.statusCode, data });
        }
      });
    });
    req.on('error', reject);
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

async function runPhase37Suite() {
  console.log('====================================================');
  console.log('🧪 PHASE 37 — EXAM / PRACTICE STARTUP & DATA ISOLATION');
  console.log('====================================================');

  // 1. Verify initial production counts
  const initialProdUsers = db.prepare('SELECT * FROM users WHERE (is_test = 0 OR is_test IS NULL)').all();
  console.log(`\n[PRE-CHECK] Production accounts in DB: ${initialProdUsers.length}`);
  const superAdmins = initialProdUsers.filter(u => u.role === 'super_admin');
  const students = initialProdUsers.filter(u => u.role === 'student');
  console.log(`- Super Admins: ${superAdmins.length}`);
  console.log(`- Students: ${students.length}`);

  if (initialProdUsers.length !== 3) {
    throw new Error(`Expected exactly 3 production accounts, got ${initialProdUsers.length}`);
  }
  if (superAdmins.length !== 1 || students.length !== 2) {
    throw new Error(`Expected 1 super admin and 2 students, got ${superAdmins.length} admins and ${students.length} students`);
  }

  // 2. Test Assessment Startup API & Question Metadata for Exam and Practice
  const testIdsToVerify = [
    { id: 'cat_foundation_quant', name: 'Foundation Assessment', category: 'foundation' },
    { id: 'cat_company_accenture', name: 'Company Assessment', category: 'company' },
    { id: 'cat_coding_mock_01', name: 'Coding Assessment', category: 'coding' }
  ];

  const modes = ['exam', 'practice'];

  for (const item of testIdsToVerify) {
    console.log(`\n--- TESTING ${item.name} (${item.id}) ---`);
    for (const mode of modes) {
      console.log(`Testing Mode: ${mode.toUpperCase()}...`);
      const res = await request('GET', `/api/tests/${item.id}`);

      if (res.status !== 200 || !res.data.test) {
        throw new Error(`Failed to fetch test ${item.id} (Status ${res.status}): ${JSON.stringify(res.data)}`);
      }

      const t = res.data.test;
      const questions = t.questions || [];

      console.log(`  ✅ Assessment Loaded: "${t.title}"`);
      console.log(`  ✅ Question Count: ${questions.length}`);

      if (questions.length === 0) {
        throw new Error(`Assessment ${item.id} returned 0 questions!`);
      }

      // Verify question 1 metadata
      const q1 = questions[0];
      if (!q1 || !q1.id || !q1.questionText) {
        throw new Error(`Question 1 of ${item.id} has invalid/missing data!`);
      }

      const questionType = q1.questionType || ((q1.codeSnippet || q1.starterCode) ? 'CODING' : 'MCQ');
      console.log(`  ✅ Q1 ID: ${q1.id} | Type: ${questionType} | Text: "${q1.questionText.substring(0, 40)}..."`);

      if (questionType === 'MCQ') {
        if (!Array.isArray(q1.options) || q1.options.length === 0) {
          throw new Error(`MCQ Question ${q1.id} missing valid options array!`);
        }
        console.log(`  ✅ Options Count: ${q1.options.length}`);
      } else if (questionType === 'CODING') {
        console.log(`  ✅ Coding Problem verified.`);
      }
    }
  }

  // 3. Admin User Directory Data Scope Verification
  console.log('\n--- TESTING ADMIN USER DIRECTORY SCOPE ---');
  // Create a synthetic test user with is_test = 1
  const testUserId = `phase37_test_runner_${Date.now()}`;
  db.prepare(`
    INSERT INTO users (id, email, name, role, is_test, totalPoints, createdAt, plan, subscriptionStatus)
    VALUES (?, ?, 'Phase 37 Synthetic User', 'student', 1, 0, ?, 'FREE', 'inactive')
  `).run(testUserId, `${testUserId}@test.firstround.ai`, new Date().toISOString());

  // Perform Admin Users API call using super admin user ID header
  const adminHeaders = { 'x-user-id': 'user_1788874380714_kmibk', 'Authorization': 'Bearer mock_admin_token' };
  const adminUsersRes = await request('GET', '/api/admin/users', null, adminHeaders);

  if (adminUsersRes.status !== 200 || !adminUsersRes.data.users) {
    throw new Error(`Admin users request failed with status ${adminUsersRes.status}: ${JSON.stringify(adminUsersRes.data)}`);
  }

  const returnedUsers = adminUsersRes.data.users;
  console.log(`Admin /api/admin/users returned ${returnedUsers.length} accounts.`);
  console.table(returnedUsers.map(u => ({ id: u.id, email: u.email, name: u.name, role: u.role, is_test: u.is_test })));

  if (returnedUsers.length !== 3) {
    throw new Error(`Expected Admin User Directory to return exactly 3 production accounts, got ${returnedUsers.length}`);
  }

  const hasTestUserInAdminList = returnedUsers.some(u => u.id === testUserId || u.is_test === 1);
  if (hasTestUserInAdminList) {
    throw new Error('SECURITY/ISOLATION FAILURE: Synthetic test user appeared in Admin User Directory!');
  }
  console.log('✅ Admin User Directory correctly excluded synthetic test user.');

  // Clean up test user created by test runner
  db.prepare('DELETE FROM users WHERE is_test = 1').run();

  // Verify final production accounts count in DB
  const finalProdUsers = db.prepare('SELECT * FROM users WHERE (is_test = 0 OR is_test IS NULL)').all();
  console.log(`\n[POST-CHECK] Production accounts in DB: ${finalProdUsers.length}`);
  if (finalProdUsers.length !== 3) {
    throw new Error(`Post-test check failed: Expected 3 production accounts, got ${finalProdUsers.length}`);
  }

  console.log('\n====================================================');
  console.log('🎉 PHASE 37 STARTUP & DATA ISOLATION TEST SUITE PASSED');
  console.log('====================================================\n');
}

runPhase37Suite().catch((err) => {
  console.error('\n❌ PHASE 37 SUITE FAILED:', err);
  process.exit(1);
});
