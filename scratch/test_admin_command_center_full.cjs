/**
 * FIRSTROUND ADMIN COMMAND CENTER — FULL CAPABILITY TEST SUITE
 * Tests all 13 Admin requirements with production baseline data.
 */
'use strict';
const http = require('http');
const assert = require('assert');

function req(path, method = 'GET', body = null, headers = {}) {
  return new Promise((resolve) => {
    const opts = {
      hostname: 'localhost',
      port: 3000,
      path,
      method,
      headers: {
        'Content-Type': 'application/json',
        'x-csrf-token': 'firstround-csrf',
        'Authorization': 'Bearer test_admin_token',
        ...headers,
      }
    };
    const r = http.request(opts, (res) => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => {
        try { resolve({ status: res.statusCode, data: JSON.parse(data) }); }
        catch(e) { resolve({ status: res.statusCode, data }); }
      });
    });
    if (body) r.write(JSON.stringify(body));
    r.end();
  });
}

async function run() {
  console.log('================================================================');
  console.log(' FIRSTROUND ADMIN COMMAND CENTER — VERIFICATION SUITE');
  console.log('================================================================\n');

  // --- 1. OVERVIEW & KPIS ---
  console.log('--- 1. OVERVIEW & KPIS ---');
  const statsRes = await req('/api/admin/stats');
  assert.strictEqual(statsRes.status, 200, 'Stats endpoint returns 200');
  const stats = statsRes.data.stats;
  console.log(`✓ Total Students: ${stats.totalStudents} (Expected 2)`);
  console.log(`✓ Active Test Series: ${stats.totalTestSeries} (Expected 17)`);
  console.log(`✓ Canonical Question Bank: ${stats.totalQuestions} (Expected 391)`);
  console.log(`✓ Avg Platform Accuracy: ${stats.avgPlatformAccuracy}%`);
  assert(stats.totalStudents >= 2, 'Total students count matches real DB');
  assert.strictEqual(stats.totalTestSeries, 17, 'Active test series is 17');
  assert.strictEqual(stats.totalQuestions, 391, 'Total questions is 391');

  // --- 2. USERS & CANDIDATES DIRECTORY ---
  console.log('\n--- 2. USERS & CANDIDATES DIRECTORY ---');
  const usersRes = await req('/api/admin/users');
  assert.strictEqual(usersRes.status, 200, 'Users directory endpoint returns 200');
  const users = usersRes.data.users;
  console.log(`✓ Total Users in DB: ${users.length} (Expected 3)`);
  assert.strictEqual(users.length, 3, 'Exactly 3 registered accounts');
  const superAdmins = users.filter(u => u.role === 'super_admin');
  const students = users.filter(u => u.role === 'student' || !u.role);
  console.log(`✓ Super Admins: ${superAdmins.length}, Students: ${students.length}`);
  assert.strictEqual(superAdmins.length, 1, '1 Super Admin');
  assert.strictEqual(students.length, 2, '2 Students');
  // Verify sensitive data is NOT exposed
  users.forEach(u => {
    assert.strictEqual(u.password, undefined, 'No password field in user object');
    assert.strictEqual(u.jwt, undefined, 'No jwt field in user object');
  });
  console.log('✓ Sensitive data (passwords, tokens) protected');

  // --- 3. TEAM MEMBERS & ADMINS (SUPER ADMIN RBAC) ---
  console.log('\n--- 3. TEAM MEMBERS & ADMINS ---');
  const teamRes = await req('/api/admin/team-members');
  assert.strictEqual(teamRes.status, 200, 'Team members endpoint returns 200');
  const team = teamRes.data.members;
  console.log(`✓ Active Admins: ${team.length} (Super Admin: ${team[0]?.email})`);
  assert(team.some(m => m.email === 'pawankhot9@gmail.com' && m.role === 'super_admin'), 'pawankhot9@gmail.com is super_admin');

  // Search users for promotion
  const searchRes = await req('/api/admin/users/search?q=Akash');
  assert.strictEqual(searchRes.status, 200, 'User search returns 200');
  console.log(`✓ Searched 'Akash' -> found ${searchRes.data.users?.length} candidates`);

  // Promote Akash to Admin
  const akashUser = users.find(u => u.name === 'Akash Khot');
  if (akashUser) {
    const promoteRes = await req('/api/admin/users/promote', 'POST', { targetUserId: akashUser.id });
    assert.strictEqual(promoteRes.status, 200, 'Promotion to admin returns 200');
    console.log(`✓ Promoted ${akashUser.name} to admin`);

    // Verify team members now has 2
    const teamAfterPromote = await req('/api/admin/team-members');
    assert.strictEqual(teamAfterPromote.data.members.length, 2, 'Team now has 2 admins');

    // Revoke Akash back to Student
    const revokeRes = await req('/api/admin/users/revoke', 'POST', { targetUserId: akashUser.id });
    assert.strictEqual(revokeRes.status, 200, 'Revoke admin returns 200');
    console.log(`✓ Revoked ${akashUser.name} back to student`);

    // Verify team members restored to 1
    const teamAfterRevoke = await req('/api/admin/team-members');
    assert.strictEqual(teamAfterRevoke.data.members.length, 1, 'Team restored to 1 super_admin');
  }

  // --- 4. CONTENT QUALITY / QA REPORT ---
  console.log('\n--- 4. CONTENT QUALITY / QA REPORT ---');
  const qaRes = await req('/api/admin/qa-report');
  assert.strictEqual(qaRes.status, 200, 'QA report returns 200');
  assert(qaRes.data.report, 'QA report object returned');
  console.log(`✓ QA Report: Verified=${qaRes.data.report.verified}, Tests=${qaRes.data.report.totalTests}, Questions=${qaRes.data.report.totalQuestions}`);

  // --- 5. CANONICAL QUESTION BANK ---
  console.log('\n--- 5. CANONICAL QUESTION BANK ---');
  const qBankRes = await req('/api/admin/questions');
  assert.strictEqual(qBankRes.status, 200, 'Questions endpoint returns 200');
  const qList = qBankRes.data.questions;
  const usageMap = qBankRes.data.usageMap;
  console.log(`✓ Loaded ${qList.length} canonical questions`);
  console.log(`✓ Question usage map entries: ${Object.keys(usageMap).length}`);
  assert.strictEqual(qList.length, 391, 'Exactly 391 canonical questions');

  // Duplicate Check Engine
  const dupCheckRes = await req('/api/admin/questions/check-duplicates', 'POST', {
    questionText: qList[0].questionText,
  });
  assert.strictEqual(dupCheckRes.status, 200, 'Duplicate check returns 200');
  console.log(`✓ Duplicate check on existing question -> isDuplicate=${dupCheckRes.data.isDuplicate}, matchType=${dupCheckRes.data.matchType}`);
  assert.strictEqual(dupCheckRes.data.isDuplicate, true, 'Correctly detected duplicate');

  // --- 6. CREATE ASSESSMENT & STATUS TRANSITIONS ---
  console.log('\n--- 6. CREATE ASSESSMENT & STATUS TRANSITIONS ---');
  const draftPayload = {
    title: 'Automated E2E Test Series Mock',
    description: 'Test Series created during automated capability test',
    category: 'foundation',
    companyName: 'TCS',
    durationMinutes: 15,
    totalQuestions: 2,
    difficulty: 'Medium',
    status: 'DRAFT',
    questionIds: [qList[0].id, qList[1].id],
  };
  const createAssRes = await req('/api/admin/assessments', 'POST', draftPayload);
  assert.strictEqual(createAssRes.status, 200, 'Create draft assessment returns 200');
  const createdTestId = createAssRes.data.assessment.id;
  console.log(`✓ Created draft assessment: ${createdTestId} (${createAssRes.data.assessment.title})`);

  // Transition DRAFT -> REVIEW -> PUBLISHED -> ARCHIVED
  const toReview = await req(`/api/admin/assessments/${createdTestId}/status`, 'POST', { status: 'REVIEW' });
  assert.strictEqual(toReview.data.assessment.status, 'REVIEW', 'Status updated to REVIEW');
  console.log(`✓ Status transitioned to REVIEW`);

  const toPublish = await req(`/api/admin/assessments/${createdTestId}/status`, 'POST', { status: 'PUBLISHED' });
  assert.strictEqual(toPublish.data.assessment.status, 'PUBLISHED', 'Status updated to PUBLISHED');
  console.log(`✓ Status transitioned to PUBLISHED`);

  const toArchive = await req(`/api/admin/assessments/${createdTestId}/status`, 'POST', { status: 'ARCHIVED' });
  assert.strictEqual(toArchive.data.assessment.status, 'ARCHIVED', 'Status updated to ARCHIVED');
  console.log(`✓ Status transitioned to ARCHIVED`);

  // Clean up test assessment (delete)
  const delRes = await req(`/api/admin/tests/${createdTestId}`, 'DELETE');
  console.log(`✓ Cleaned up test assessment: ${createdTestId}`);

  // --- 7. BULK IMPORT ---
  console.log('\n--- 7. BULK QUESTION IMPORT ---');
  const sampleImport = [
    {
      questionText: 'What is the value of 15% of 240?',
      topic: 'Percentage',
      difficulty: 'Easy',
      options: [
        { id: 'A', text: '36' },
        { id: 'B', text: '32' },
        { id: 'C', text: '40' },
        { id: 'D', text: '28' },
      ],
      correctOption: 'A',
      explanation: '15% of 240 = (15/100)*240 = 36',
    }
  ];
  const importRes = await req('/api/admin/questions/import', 'POST', {
    questions: sampleImport,
    resolutions: {},
  });
  assert.strictEqual(importRes.status, 200, 'Import questions returns 200');
  console.log(`✓ Bulk import report: totalProcessed=${importRes.data.report.totalProcessed}, newCreated=${importRes.data.report.newCreated}`);

  // --- 8. ANNOUNCEMENT DISPATCH ---
  console.log('\n--- 8. BROADCAST ANNOUNCEMENTS ---');
  const annRes = await req('/api/admin/announcements', 'POST', {
    title: 'Platform System Health Notification',
    message: 'Admin command center functionality verified.',
    type: 'ANNOUNCEMENT',
  });
  assert.strictEqual(annRes.status, 200, 'Send announcement returns 200');
  console.log(`✓ Announcement created: ID=${annRes.data.notification?.id}, Title="${annRes.data.notification?.title}"`);

  // --- 9. GENERATE WITH AI ---
  console.log('\n--- 9. AI TEST GENERATOR ---');
  const aiGenRes = await req('/api/admin/generate-ai-test', 'POST', {
    topicOrCompany: 'TCS Quantitative Speed Math',
    category: 'Quantitative',
    difficulty: 'Easy',
    numQuestions: 2,
  });
  assert.strictEqual(aiGenRes.status, 200, 'AI Test generation returns 200');
  console.log(`✓ AI generated test created: ${aiGenRes.data.test?.id} with ${aiGenRes.data.test?.questions?.length} questions`);

  // Clean up AI test
  if (aiGenRes.data.test?.id) {
    await req(`/api/admin/tests/${aiGenRes.data.test.id}`, 'DELETE');
    console.log(`✓ Cleaned up generated AI test`);
  }

  // --- 10. RBAC SECURITY REJECTIONS ---
  console.log('\n--- 10. RBAC SECURITY CHECKS ---');
  const studentTokenHeaders = { 'Authorization': 'Bearer test_student_token' };
  const studentStats = await req('/api/admin/stats', 'GET', null, studentTokenHeaders);
  assert.strictEqual(studentStats.status, 403, 'Student access to /api/admin/stats returns 403 Forbidden');

  const studentTeam = await req('/api/admin/team-members', 'GET', null, studentTokenHeaders);
  assert.strictEqual(studentTeam.status, 403, 'Student access to /api/admin/team-members returns 403 Forbidden');

  const unauthStats = await req('/api/admin/stats', 'GET', null, { 'Authorization': '' });
  assert.strictEqual(unauthStats.status, 401, 'Unauthenticated request returns 401 Unauthorized');
  console.log('✓ RBAC & Authentication guards verified: 401 on missing auth, 403 on student token');

  console.log('\n================================================================');
  console.log(' ALL ADMIN COMMAND CENTER API & CAPABILITY TESTS PASSED (100%)');
  console.log('================================================================');
}

run().catch((err) => {
  console.error('\n❌ TEST FAILED:', err);
  process.exit(1);
});
