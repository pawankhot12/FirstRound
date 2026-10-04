const Database = require('better-sqlite3');
const path = require('path');
const http = require('http');

const dbPath = path.resolve(process.cwd(), 'firstround.db');
const db = new Database(dbPath);

function request(method, path, body, headers = {}) {
  return new Promise((resolve, reject) => {
    const data = body ? JSON.stringify(body) : null;
    const req = http.request(
      {
        hostname: 'localhost',
        port: 3000,
        path,
        method,
        headers: {
          'Content-Type': 'application/json',
          'X-Requested-With': 'XMLHttpRequest',
          ...(data ? { 'Content-Length': Buffer.byteLength(data) } : {}),
          ...headers,
        },
      },
      (res) => {
        let raw = '';
        res.on('data', (chunk) => (raw += chunk));
        res.on('end', () => {
          try {
            const parsed = JSON.parse(raw);
            resolve({ status: res.statusCode, data: parsed, headers: res.headers, raw });
          } catch (e) {
            resolve({ status: res.statusCode, text: raw, headers: res.headers, raw });
          }
        });
      }
    );
    req.on('error', reject);
    if (data) req.write(data);
    req.end();
  });
}

function assert(condition, message) {
  if (!condition) {
    console.error(`❌ FAIL: ${message}`);
    process.exit(1);
  }
  console.log(`✅ PASS: ${message}`);
}

async function runSuite() {
  console.log('================================================================');
  console.log('🧪 FIRSTROUND — ADMIN DATA ARCHITECTURE & ENTITLEMENT VERIFICATION');
  console.log('================================================================\n');

  const prodAdminHeaders = {
    'Authorization': 'Bearer mock_admin_token',
    'X-Admin-Secret': process.env.ADMIN_SECRET || 'YOUR_ADMIN_SECRET',
  };

  const testAdminHeaders = {
    ...prodAdminHeaders,
    'X-Test-Runner': 'true',
  };

  const testUserPrefix = `arch_test_user_${Date.now()}`;
  const nowIso = new Date().toISOString();

  try {
    // -------------------------------------------------------------
    // 1. Authoritative Question Bank & Assessment Counts
    // -------------------------------------------------------------
    console.log('--- 1. Canonical Question Bank & Production Assessments ---');
    const statsRes = await request('GET', '/api/admin/stats', null, prodAdminHeaders);
    assert(statsRes.status === 200, 'GET /api/admin/stats returns 200');
    assert(statsRes.data.stats.totalTestSeries === 17, `Exact production active test series = 17 (got ${statsRes.data.stats.totalTestSeries})`);
    assert(statsRes.data.stats.totalQuestions === 391, `Exact canonical question bank count = 391 (got ${statsRes.data.stats.totalQuestions})`);

    const qBankRes = await request('GET', '/api/admin/questions', null, prodAdminHeaders);
    assert(qBankRes.status === 200, 'GET /api/admin/questions returns 200');
    assert(Array.isArray(qBankRes.data.questions), 'Canonical questions array returned');
    assert(qBankRes.data.questions.length === 391, `Exact 391 canonical questions returned (got ${qBankRes.data.questions.length})`);

    // Verify 0 canonical questions have 0 usage
    const usageMap = qBankRes.data.usageMap || {};
    let zeroUsageCount = 0;
    let multiUsageCount = 0;
    qBankRes.data.questions.forEach((q) => {
      const usages = usageMap[q.id] || [];
      if (usages.length === 0) zeroUsageCount++;
      if (usages.length > 1) multiUsageCount++;
    });
    assert(zeroUsageCount === 0, `All 391 canonical questions are linked to at least 1 assessment (0 questions unassigned, got ${zeroUsageCount})`);
    assert(multiUsageCount > 0, `Multi-assessment reuse correctly detected (${multiUsageCount} questions reused in 2+ assessments)`);

    // -------------------------------------------------------------
    // 2. AccessType Synchronization & Persistence
    // -------------------------------------------------------------
    console.log('\n--- 2. AccessType Toggle & Persistence ---');
    const testToToggle = 'cat_foundation_quant';
    
    // Toggle to PREMIUM
    const toggleToPremRes = await request('PATCH', `/api/admin/tests/${testToToggle}/access-type`, {
      accessType: 'PREMIUM',
    }, prodAdminHeaders);
    assert(toggleToPremRes.status === 200, 'PATCH /api/admin/tests/:id/access-type returns 200');
    assert(toggleToPremRes.data.test.accessType === 'PREMIUM', 'Test accessType updated to PREMIUM');

    // Verify in /api/catalogue
    const catRes1 = await request('GET', '/api/catalogue');
    const quantTest1 = catRes1.data.tests.find((t) => t.id === testToToggle);
    assert(quantTest1.accessType === 'PREMIUM', 'Catalogue reflects PREMIUM accessType');

    // Toggle back to FREE
    const toggleToFreeRes = await request('PATCH', `/api/admin/tests/${testToToggle}/access-type`, {
      accessType: 'FREE',
    }, prodAdminHeaders);
    assert(toggleToFreeRes.status === 200, 'PATCH /api/admin/tests/:id/access-type back to FREE returns 200');
    assert(toggleToFreeRes.data.test.accessType === 'FREE', 'Test accessType restored to FREE');

    const catRes2 = await request('GET', '/api/catalogue');
    const quantTest2 = catRes2.data.tests.find((t) => t.id === testToToggle);
    assert(quantTest2.accessType === 'FREE', 'Catalogue reflects FREE accessType');

    // -------------------------------------------------------------
    // 3. Two Independent Access Pathways (Premium Sub vs Individual)
    // -------------------------------------------------------------
    console.log('\n--- 3. Two Independent Assessment Access Pathways ---');
    const premiumTestId = 'cat_company_tcs';
    // Ensure cat_company_tcs is marked as PREMIUM for testing
    await request('PATCH', `/api/admin/tests/${premiumTestId}/access-type`, { accessType: 'PREMIUM' }, prodAdminHeaders);

    const otherPremiumTestId = 'cat_company_infosys';
    await request('PATCH', `/api/admin/tests/${otherPremiumTestId}/access-type`, { accessType: 'PREMIUM' }, prodAdminHeaders);

    // 3a. Free candidate without entitlement -> LOCKED
    const freeUser = `${testUserPrefix}_free`;
    db.prepare(`
      INSERT INTO users (id, email, name, role, is_test, createdAt, plan, subscriptionStatus)
      VALUES (?, ?, 'Free Student', 'student', 1, ?, 'FREE', 'inactive')
    `).run(freeUser, `${freeUser}@test.local`, nowIso);

    const freeAccess = await request('GET', `/api/assessments/${premiumTestId}/access?userId=${freeUser}`);
    assert(freeAccess.data.allowed === false, 'Free user without entitlement is locked out of PREMIUM assessment');

    // 3b. Individual entitlement unlocks ONLY that specific assessment
    db.prepare(`
      INSERT INTO assessment_entitlements (userId, assessmentId, grantedAt, grantedBy, is_test)
      VALUES (?, ?, ?, 'PURCHASE', 1)
    `).run(freeUser, premiumTestId, nowIso);

    const entitledAccess = await request('GET', `/api/assessments/${premiumTestId}/access?userId=${freeUser}`);
    assert(entitledAccess.data.allowed === true, 'Entitled free user CAN access the purchased assessment');
    assert(entitledAccess.data.unlockedVia === 'entitlement' || entitledAccess.data.unlockedVia === 'INDIVIDUAL_PURCHASE', 'Unlocked via individual entitlement');

    const otherAccess = await request('GET', `/api/assessments/${otherPremiumTestId}/access?userId=${freeUser}`);
    assert(otherAccess.data.allowed === false, 'Entitled user remains LOCKED OUT of other unpurchased PREMIUM assessments');

    // 3c. Premium subscriber unlocks ALL premium assessments
    const subUser = `${testUserPrefix}_sub`;
    db.prepare(`
      INSERT INTO users (id, email, name, role, is_test, createdAt, plan, subscriptionStatus, subscriptionExpiresAt)
      VALUES (?, ?, 'Subscribed Student', 'student', 1, ?, 'PREMIUM', 'active', ?)
    `).run(subUser, `${subUser}@test.local`, nowIso, new Date(Date.now() + 30 * 24 * 3600 * 1000).toISOString());

    const subAccess1 = await request('GET', `/api/assessments/${premiumTestId}/access?userId=${subUser}`);
    assert(subAccess1.data.allowed === true, 'Premium subscriber can access PREMIUM assessment 1');
    assert(subAccess1.data.unlockedVia === 'subscription' || subAccess1.data.unlockedVia === 'PREMIUM_SUBSCRIPTION', 'Unlocked via premium subscription');

    const subAccess2 = await request('GET', `/api/assessments/${otherPremiumTestId}/access?userId=${subUser}`);
    assert(subAccess2.data.allowed === true, 'Premium subscriber can access PREMIUM assessment 2');

    // -------------------------------------------------------------
    // 4. AI Credits vs Assessment Independence
    // -------------------------------------------------------------
    console.log('\n--- 4. AI Credits Do Not Unlock Assessments ---');
    const creditUser = `${testUserPrefix}_credits_only`;
    db.prepare(`
      INSERT INTO users (id, email, name, role, is_test, createdAt, plan, subscriptionStatus)
      VALUES (?, ?, 'Credit Heavy Student', 'student', 1, ?, 'FREE', 'inactive')
    `).run(creditUser, `${creditUser}@test.local`, nowIso);

    // Grant 100 purchased credits
    db.prepare(`
      INSERT INTO deep_ai_credit_ledger (userId, amount, source, transactionType, description, is_test, createdAt)
      VALUES (?, 100, 'PURCHASED', 'GRANT', 'Test Pack', 1, ?)
    `).run(creditUser, nowIso);

    const creditBalRes = await request('GET', `/api/ai/credits?userId=${creditUser}`);
    assert(creditBalRes.data.total === 106, 'User has 106 AI credits (6 free + 100 purchased)');

    const creditAccessRes = await request('GET', `/api/assessments/${premiumTestId}/access?userId=${creditUser}`);
    assert(creditAccessRes.data.allowed === false, '100 AI credits DO NOT unlock PREMIUM assessments (Independence preserved)');

    // -------------------------------------------------------------
    // 5. Data Provenance & Test Isolation (is_test = 0 vs is_test = 1)
    // -------------------------------------------------------------
    console.log('\n--- 5. Test Data Isolation & Zero Production Contamination ---');
    const testOrderIsoId = `test_ord_iso_${Date.now()}`;
    const testSubIsoId = `test_sub_iso_${Date.now()}`;

    // Create test order and subscription with is_test = 1
    db.prepare(`
      INSERT INTO payment_orders (id, userId, productType, productId, amount, currency, status, is_test, createdAt, updatedAt)
      VALUES (?, ?, 'ASSESSMENT', 'cat_company_tcs', 2900, 'INR', 'CAPTURED', 1, ?, ?)
    `).run(testOrderIsoId, freeUser, nowIso, nowIso);

    db.prepare(`
      INSERT INTO premium_subscriptions (id, userId, provider, status, is_test, createdAt, updatedAt)
      VALUES (?, ?, 'RAZORPAY', 'ACTIVE', 1, ?, ?)
    `).run(testSubIsoId, subUser, nowIso, nowIso);

    // Check admin endpoints: standard prodAdminHeaders should only return is_test = 0
    const adminOrdersRes = await request('GET', '/api/admin/payments', null, prodAdminHeaders);
    const hasTestOrder = adminOrdersRes.data.payments.some((p) => p.id === testOrderIsoId);
    assert(!hasTestOrder, 'Production admin payments excludes is_test = 1 transactions');

    // With X-Test-Runner or includeTest=true, test orders ARE included
    const testRunnerOrdersRes = await request('GET', '/api/admin/payments', null, testAdminHeaders);
    const foundTestOrderInRunner = testRunnerOrdersRes.data.payments.some((p) => p.id === testOrderIsoId);
    assert(foundTestOrderInRunner, 'Test runner admin payments includes is_test = 1 transactions');

    const adminSubsRes = await request('GET', '/api/admin/subscriptions', null, prodAdminHeaders);
    const hasTestSub = adminSubsRes.data.subscriptions.some((s) => s.id === testSubIsoId);
    assert(!hasTestSub, 'Production admin subscriptions excludes is_test = 1 records');

    const testRunnerSubsRes = await request('GET', '/api/admin/subscriptions', null, testAdminHeaders);
    const foundTestSubInRunner = testRunnerSubsRes.data.subscriptions.some((s) => s.id === testSubIsoId);
    assert(foundTestSubInRunner, 'Test runner admin subscriptions includes is_test = 1 records');

    const adminUsersRes = await request('GET', '/api/users', null, prodAdminHeaders);
    const hasTestUser = adminUsersRes.data.users.some((u) => u.id.startsWith(testUserPrefix));
    assert(!hasTestUser, 'Production users directory excludes is_test = 1 users');

    // -------------------------------------------------------------
    // 6. Current User Entitlements API
    // -------------------------------------------------------------
    console.log('\n--- 6. GET /api/users/me/entitlements API ---');
    const meEntRes = await request('GET', '/api/users/me/entitlements', null, {
      'Authorization': `Bearer ${freeUser}`,
      'x-user-id': freeUser,
    });
    assert(meEntRes.status === 200, 'GET /api/users/me/entitlements returns 200');
    assert(Array.isArray(meEntRes.data.entitlements), 'Entitlements array returned');
    assert(meEntRes.data.entitlements.some((e) => e.assessmentId === premiumTestId), 'User entitlement for TCS mock found');

    console.log('\n================================================================');
    console.log('🎉 ALL ADMIN DATA ARCHITECTURE & ENTITLEMENT TESTS PASSED (100%)');
    console.log('================================================================\n');
  } finally {
    // Cleanup any test artifacts
    db.prepare("DELETE FROM users WHERE is_test = 1 OR id LIKE 'arch_test_%'").run();
    db.prepare("DELETE FROM payment_orders WHERE is_test = 1 OR id LIKE 'test_ord_%'").run();
    db.prepare("DELETE FROM premium_subscriptions WHERE is_test = 1 OR id LIKE 'test_sub_%'").run();
    db.prepare("DELETE FROM assessment_entitlements WHERE is_test = 1 OR userId LIKE 'arch_test_%'").run();
    db.prepare("DELETE FROM deep_ai_credit_ledger WHERE is_test = 1 OR userId LIKE 'arch_test_%'").run();
    db.close();
  }
}

runSuite().catch((err) => {
  console.error('Test Suite Error:', err);
  process.exit(1);
});
