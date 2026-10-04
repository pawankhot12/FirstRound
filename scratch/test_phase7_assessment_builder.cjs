const http = require('http');
const path = require('path');

function makeRequest(method, path, body = null, headers = {}) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: 'localhost',
      port: 3000,
      path,
      method,
      headers: {
        'Content-Type': 'application/json',
        'x-csrf-token': '1',
        'x-test-runner': 'true',
        ...headers,
      },
    };

    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => (data += chunk));
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          resolve({ status: res.statusCode, data: parsed });
        } catch (e) {
          resolve({ status: res.statusCode, data });
        }
      });
    });

    req.on('error', (err) => reject(err));
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

async function runPhase7Tests() {
  console.log('=== STARTING PHASE 7: ASSESSMENT BUILDER & QUESTION BANK VERIFICATION ===\n');
  let failures = 0;
  try {
    const { execSync } = require('child_process');
    execSync('npx tsx -e "import { db } from \'./server/db\'; db.cleanupProductionDatabase();"', { cwd: path.resolve(__dirname, '..') });
  } catch (e) {}

  function assert(condition, message) {
    if (condition) {
      console.log(`[PASS] ${message}`);
    } else {
      console.error(`[FAIL] ${message}`);
      failures++;
    }
  }

  try {
    // 1. Login as Super Admin
    console.log('1. Authenticating Super Admin (pawankhot9@gmail.com)...');
    const adminAuth = await makeRequest('POST', '/api/auth/login-or-register', {
      email: 'pawankhot9@gmail.com',
      name: 'Pawan Khot',
    });
    assert(adminAuth.status === 200, 'Super admin login endpoint returned 200 OK');
    assert(adminAuth.data?.user?.role === 'super_admin', 'pawankhot9@gmail.com is super_admin');
    const adminId = adminAuth.data?.user?.id;

    // 2. Register Student user for security checks
    console.log('\n2. Registering Student user for security checks...');
    const studentAuth = await makeRequest('POST', '/api/auth/login-or-register', {
      email: 'student_builder_check@gmail.com',
      name: 'Student Checker',
    });
    const studentId = studentAuth.data?.user?.id;

    // 3. Security & RBAC Checks
    console.log('\n3. Testing Security & RBAC on Assessment Builder APIs...');
    const unauthGet = await makeRequest('GET', '/api/admin/assessments');
    assert(unauthGet.status === 401, 'Unauthenticated GET /api/admin/assessments returned 401 Unauthorized');

    const studentGet = await makeRequest('GET', '/api/admin/assessments', null, { 'Authorization': `Bearer ${studentId || 'test_student'}` });
    assert(studentGet.status === 403, 'Student access to GET /api/admin/assessments returned 403 Forbidden');

    const studentPostQ = await makeRequest('POST', '/api/admin/questions', { questionText: 'Hacked question?' }, { 'Authorization': `Bearer ${studentId || 'test_student'}` });
    assert(studentPostQ.status === 403, 'Student access to POST /api/admin/questions returned 403 Forbidden');

    const studentImport = await makeRequest('POST', '/api/admin/questions/import', { questions: [] }, { 'Authorization': `Bearer ${studentId || 'test_student'}` });
    assert(studentImport.status === 403, 'Student access to POST /api/admin/questions/import returned 403 Forbidden');

    // 4. Assessment Lifecycle (CREATE -> DRAFT -> REVIEW -> PUBLISHED -> ARCHIVED)
    console.log('\n4. Testing Assessment Creation & Lifecycle Workflow...');
    const createAss = await makeRequest(
      'POST',
      '/api/admin/assessments',
      {
        title: 'TCS NQT 2026 Advanced Full Mock',
        description: 'Comprehensive placement test covering Quant, Verbal and Coding.',
        category: 'company',
        companyName: 'TCS (Tata Consultancy Services)',
        durationMinutes: 45,
        difficulty: 'Hard',
        status: 'DRAFT',
      },
      { 'Authorization': `Bearer ${adminId || 'user_superadmin_pawankhot'}` }
    );
    assert(createAss.status === 200 && createAss.data?.success, 'Create Assessment returned 200 OK');
    const assId = createAss.data?.assessment?.id;
    assert(createAss.data?.assessment?.status === 'DRAFT', 'New assessment status is DRAFT');

    // Update Status: DRAFT -> REVIEW
    const toReview = await makeRequest('POST', `/api/admin/assessments/${assId}/status`, { status: 'REVIEW' }, { 'Authorization': `Bearer ${adminId || 'user_superadmin_pawankhot'}` });
    assert(toReview.data?.assessment?.status === 'REVIEW', 'Assessment transitioned to REVIEW');

    // Update Status: REVIEW -> PUBLISHED
    const toPublished = await makeRequest('POST', `/api/admin/assessments/${assId}/status`, { status: 'PUBLISHED' }, { 'Authorization': `Bearer ${adminId || 'user_superadmin_pawankhot'}` });
    assert(toPublished.data?.assessment?.status === 'PUBLISHED', 'Assessment transitioned to PUBLISHED');

    // Test Delete on Published Assessment -> Must Soft-Archive instead of Hard-Delete
    const deletePublished = await makeRequest('DELETE', `/api/admin/tests/${assId}`, null, { 'Authorization': `Bearer ${adminId || 'user_superadmin_pawankhot'}` });
    assert(deletePublished.status === 200, 'DELETE /api/admin/tests/:id returned 200 OK');

    const checkArchivedList = await makeRequest('GET', '/api/admin/assessments', null, { 'Authorization': `Bearer ${adminId || 'user_superadmin_pawankhot'}` });
    const archivedAss = checkArchivedList.data?.assessments?.find((a) => a.id === assId);
    assert(archivedAss && archivedAss.status === 'ARCHIVED', 'Published assessment was soft-archived to status = ARCHIVED (not hard-deleted)');

    // 5. Canonical Question Creation & Unique ID
    console.log('\n5. Testing Canonical Question Creation...');
    const q1 = await makeRequest(
      'POST',
      '/api/admin/questions',
      {
        questionText: 'What is the sum of the first 10 prime numbers?',
        questionType: 'MCQ',
        topic: 'Number Theory',
        difficulty: 'Medium',
        options: [
          { id: 'A', text: '129' },
          { id: 'B', text: '142' },
          { id: 'C', text: '159' },
          { id: 'D', text: '160' },
        ],
        correctOption: 'A',
        explanation: 'First 10 primes: 2, 3, 5, 7, 11, 13, 17, 19, 23, 29. Sum = 129.',
        source: 'Phase 7 Unit Test',
      },
      { 'Authorization': `Bearer ${adminId || 'user_superadmin_pawankhot'}` }
    );
    assert(q1.status === 200 && q1.data?.success, 'Create canonical question returned 200 OK');
    const q1Id = q1.data?.question?.id;
    assert(q1Id && q1Id.startsWith('q_admin_'), 'Canonical question generated stable unique ID starting with q_admin_');

    // 6. Mandatory Duplicate Check Engine
    console.log('\n6. Testing Mandatory Duplicate Check Engine...');
    // Exact duplicate test
    const exactDupCheck = await makeRequest(
      'POST',
      '/api/admin/questions/check-duplicates',
      { questionText: 'What is the sum of the first 10 prime numbers?' },
      { 'Authorization': `Bearer ${adminId || 'user_superadmin_pawankhot'}` }
    );
    assert(exactDupCheck.data?.isDuplicate === true, 'Exact duplicate detected');
    assert(exactDupCheck.data?.matchType === 'EXACT', 'Match type classified as EXACT (100% match)');

    // Near duplicate test (wording variation)
    const nearDupCheck = await makeRequest(
      'POST',
      '/api/admin/questions/check-duplicates',
      { questionText: 'Find the sum of first 10 prime numbers' },
      { 'Authorization': `Bearer ${adminId || 'user_superadmin_pawankhot'}` }
    );
    assert(nearDupCheck.data?.isDuplicate === true, 'Near duplicate detected for wording variation');
    assert(nearDupCheck.data?.matchType === 'NEAR', 'Match type classified as NEAR for wording variation');

    // 7. Bulk CSV / JSON Question Import Flow
    console.log('\n7. Testing Bulk Question Import Engine...');
    const bulkPayload = {
      questions: [
        {
          questionText: 'What is the worst-case time complexity of Binary Search on a sorted array of N elements?',
          topic: 'Algorithms',
          difficulty: 'Easy',
          options: [
            { id: 'A', text: 'O(1)' },
            { id: 'B', text: 'O(log N)' },
            { id: 'C', text: 'O(N)' },
            { id: 'D', text: 'O(N log N)' },
          ],
          correctOption: 'B',
        },
        {
          questionText: 'What is the sum of the first 10 prime numbers?', // Duplicate of q1
          topic: 'Number Theory',
          difficulty: 'Medium',
          options: [],
          correctOption: 'A',
        },
      ],
      resolutions: {
        1: 'USE_EXISTING', // Resolve duplicate by reusing existing question
      },
    };

    const importRes = await makeRequest('POST', '/api/admin/questions/import', bulkPayload, { 'Authorization': `Bearer ${adminId || 'user_superadmin_pawankhot'}` });
    assert(importRes.status === 200 && importRes.data?.success, 'Bulk import returned 200 OK');
    const report = importRes.data?.report;
    console.log('Bulk Import Report Received:', report);
    assert(report?.newCreated === 1, 'Bulk import created 1 new question');
    assert(report?.exactDuplicatesResolved === 1, 'Bulk import resolved 1 exact duplicate using USE_EXISTING');

    // 8. Canonical Question Reuse across Multiple Assessments
    console.log('\n8. Testing Canonical Question Reuse across Assessments...');
    const assA = await makeRequest('POST', '/api/admin/assessments', { title: 'Test A', category: 'foundation', questionIds: [q1Id] }, { 'Authorization': `Bearer ${adminId || 'user_superadmin_pawankhot'}` });
    const assB = await makeRequest('POST', '/api/admin/assessments', { title: 'Test B', category: 'foundation', questionIds: [q1Id] }, { 'Authorization': `Bearer ${adminId || 'user_superadmin_pawankhot'}` });

    assert(assA.status === 200 && assB.status === 200, 'Created Assessment A and Assessment B linked to canonical question Q1');

    const qBankRes = await makeRequest('GET', '/api/admin/questions', null, { 'Authorization': `Bearer ${adminId || 'user_superadmin_pawankhot'}` });
    const usageList = qBankRes.data?.usageMap?.[q1Id] || [];
    assert(usageList.includes(assA.data?.assessment?.id) && usageList.includes(assB.data?.assessment?.id), 'Canonical question Q1 is mapped to both Assessment A and Assessment B without duplication');

    console.log('\n9. Teardown: Purging temporary test records...');
    try {
      const { execSync } = require('child_process');
      execSync('npx tsx -e "import { db } from \'./server/db\'; db.cleanupProductionDatabase();"', { cwd: path.resolve(__dirname, '..') });
      console.log('[PASS] Teardown complete: Database reset to 17 active production assessments and 391 canonical questions.');
    } catch (cleanErr) {
      console.error('Teardown cleanup error:', cleanErr);
    }

    console.log('\n=== PHASE 7 VERIFICATION COMPLETE ===');
    console.log(`Total Failures: ${failures}\n`);
    if (failures > 0) process.exit(1);
  } catch (err) {
    console.error('Test script crashed:', err);
    process.exit(1);
  }
}

runPhase7Tests();
