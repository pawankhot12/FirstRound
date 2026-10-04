const http = require('http');
const Database = require('better-sqlite3');

const BASE_URL = 'http://localhost:3000';

function request(method, path, data = null, headers = {}) {
  return new Promise((resolve, reject) => {
    const url = new URL(path, BASE_URL);
    const options = {
      method,
      hostname: url.hostname,
      port: url.port,
      path: url.pathname + url.search,
      headers: {
        'Content-Type': 'application/json',
        ...headers,
      },
    };

    const req = http.request(options, (res) => {
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
    });

    req.on('error', reject);
    if (data) req.write(JSON.stringify(data));
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
  console.log('🧪 FIRSTROUND — FINAL ADMIN + EXPLORE UI & DATA CLEANUP SUITE');
  console.log('================================================================\n');

  const db = new Database('firstround.db');
  const prodAdminHeaders = {
    'Authorization': 'Bearer mock_admin_token',
    'X-Admin-Secret': process.env.ADMIN_SECRET || 'YOUR_ADMIN_SECRET',
  };

  const testUserPrefix = `final_test_user_${Date.now()}`;
  const nowIso = new Date().toISOString();

  try {
    // -------------------------------------------------------------
    // A, B, C: Production Data Inventory Metrics
    // -------------------------------------------------------------
    console.log('--- 1. Production Metrics & Provenance ---');
    const statsRes = await request('GET', '/api/admin/stats', null, prodAdminHeaders);
    assert(statsRes.status === 200, 'GET /api/admin/stats returns 200');
    assert(statsRes.data.stats.totalStudents === 2, `Production student count = 2 (got ${statsRes.data.stats.totalStudents})`);
    assert(statsRes.data.stats.totalTestSeries === 17, `Production active test series = 17 (got ${statsRes.data.stats.totalTestSeries})`);
    assert(statsRes.data.stats.totalQuestions === 391, `Canonical question bank count = 391 (got ${statsRes.data.stats.totalQuestions})`);

    const usersRes = await request('GET', '/api/users', null, prodAdminHeaders);
    assert(usersRes.status === 200, 'GET /api/users returns 200');
    const prodStudents = usersRes.data.users.filter((u) => u.role === 'student' || !u.role);
    assert(prodStudents.length === 2, `User directory contains exactly 2 production students (got ${prodStudents.length})`);

    // -------------------------------------------------------------
    // E & F: Single Source of Truth AccessType Toggle & Catalogue Sync
    // -------------------------------------------------------------
    console.log('\n--- 2. AccessType Single Source of Truth & Catalogue Sync ---');
    const testToToggle = 'cat_foundation_quant';

    // Toggle to PREMIUM
    const toggleToPremRes = await request('PATCH', `/api/admin/tests/${testToToggle}/access-type`, {
      accessType: 'PREMIUM',
    }, prodAdminHeaders);
    assert(toggleToPremRes.status === 200, 'PATCH /api/admin/tests/:id/access-type returns 200');
    assert(toggleToPremRes.data.test.accessType === 'PREMIUM', 'Test accessType updated to PREMIUM in SQLite');

    // Verify in GET /api/catalogue
    const catRes1 = await request('GET', '/api/catalogue');
    const quantTest1 = catRes1.data.tests.find((t) => t.id === testToToggle);
    assert(quantTest1.accessType === 'PREMIUM', 'GET /api/catalogue reflects PREMIUM accessType');

    // Toggle back to FREE
    const toggleToFreeRes = await request('PATCH', `/api/admin/tests/${testToToggle}/access-type`, {
      accessType: 'FREE',
    }, prodAdminHeaders);
    assert(toggleToFreeRes.status === 200, 'PATCH /api/admin/tests/:id/access-type back to FREE returns 200');
    assert(toggleToFreeRes.data.test.accessType === 'FREE', 'Test accessType restored to FREE in SQLite');

    const catRes2 = await request('GET', '/api/catalogue');
    const quantTest2 = catRes2.data.tests.find((t) => t.id === testToToggle);
    assert(quantTest2.accessType === 'FREE', 'GET /api/catalogue reflects FREE accessType');

    // -------------------------------------------------------------
    // G, H, I, J: Assessment Access Pathways & AI Credit Independence
    // -------------------------------------------------------------
    console.log('\n--- 3. Assessment Access Pathways & AI Credit Independence ---');
    const premiumTestId = 'cat_company_tcs';
    const otherPremiumTestId = 'cat_company_infosys';

    // Ensure tests are marked PREMIUM
    await request('PATCH', `/api/admin/tests/${premiumTestId}/access-type`, { accessType: 'PREMIUM' }, prodAdminHeaders);
    await request('PATCH', `/api/admin/tests/${otherPremiumTestId}/access-type`, { accessType: 'PREMIUM' }, prodAdminHeaders);

    // Free user without entitlement -> LOCKED
    const freeUser = `${testUserPrefix}_free`;
    db.prepare(`
      INSERT INTO users (id, email, name, role, is_test, createdAt, plan, subscriptionStatus)
      VALUES (?, ?, 'Free Student', 'student', 1, ?, 'FREE', 'inactive')
    `).run(freeUser, `${freeUser}@test.local`, nowIso);

    const freeAccess = await request('GET', `/api/assessments/${premiumTestId}/access?userId=${freeUser}`);
    assert(freeAccess.data.allowed === false, 'Free candidate without entitlement is LOCKED OUT');

    // Individual entitlement -> UNLOCKED ONLY THAT ASSESSMENT
    db.prepare(`
      INSERT INTO assessment_entitlements (userId, assessmentId, grantedAt, grantedBy, is_test)
      VALUES (?, ?, ?, 'PURCHASE', 1)
    `).run(freeUser, premiumTestId, nowIso);

    const entitledAccess = await request('GET', `/api/assessments/${premiumTestId}/access?userId=${freeUser}`);
    assert(entitledAccess.data.allowed === true, 'Entitled free candidate CAN access purchased assessment');
    assert(entitledAccess.data.unlockedVia === 'entitlement', 'Unlocked via individual entitlement');

    const otherAccess = await request('GET', `/api/assessments/${otherPremiumTestId}/access?userId=${freeUser}`);
    assert(otherAccess.data.allowed === false, 'Entitled candidate remains LOCKED OUT of other unpurchased PREMIUM assessments');

    // Premium Subscriber -> UNLOCKED ALL
    const subUser = `${testUserPrefix}_sub`;
    db.prepare(`
      INSERT INTO users (id, email, name, role, is_test, createdAt, plan, subscriptionStatus, subscriptionExpiresAt)
      VALUES (?, ?, 'Subscribed Student', 'student', 1, ?, 'PREMIUM', 'active', ?)
    `).run(subUser, `${subUser}@test.local`, nowIso, new Date(Date.now() + 30 * 24 * 3600 * 1000).toISOString());

    const subAccess1 = await request('GET', `/api/assessments/${premiumTestId}/access?userId=${subUser}`);
    assert(subAccess1.data.allowed === true, 'Premium subscriber can access PREMIUM assessment 1');
    assert(subAccess1.data.unlockedVia === 'subscription', 'Unlocked via premium subscription');

    const subAccess2 = await request('GET', `/api/assessments/${otherPremiumTestId}/access?userId=${subUser}`);
    assert(subAccess2.data.allowed === true, 'Premium subscriber can access PREMIUM assessment 2');

    // AI Credit Independence
    const creditUser = `${testUserPrefix}_credit`;
    db.prepare(`
      INSERT INTO users (id, email, name, role, is_test, createdAt, plan, subscriptionStatus)
      VALUES (?, ?, 'Credit Heavy Student', 'student', 1, ?, 'FREE', 'inactive')
    `).run(creditUser, `${creditUser}@test.local`, nowIso);

    db.prepare(`
      INSERT INTO deep_ai_credit_ledger (userId, amount, source, transactionType, description, is_test, createdAt)
      VALUES (?, 100, 'PURCHASED', 'GRANT', 'Test Pack', 1, ?)
    `).run(creditUser, nowIso);

    const creditAccess = await request('GET', `/api/assessments/${premiumTestId}/access?userId=${creditUser}`);
    assert(creditAccess.data.allowed === false, '100 AI credits DO NOT unlock PREMIUM assessment (Independence verified)');

    // -------------------------------------------------------------
    // K: Canonical Question Bank Mapping
    // -------------------------------------------------------------
    console.log('\n--- 4. Question Bank Mapping & Zero Unlinked Questions ---');
    const qBankRes = await request('GET', '/api/admin/questions', null, prodAdminHeaders);
    assert(qBankRes.status === 200, 'GET /api/admin/questions returns 200');
    assert(qBankRes.data.questions.length === 391, `Exact 391 canonical questions returned (got ${qBankRes.data.questions.length})`);

    const usageMap = qBankRes.data.usageMap || {};
    let zeroUsageCount = 0;
    qBankRes.data.questions.forEach((q) => {
      const usages = usageMap[q.id] || [];
      if (usages.length === 0) zeroUsageCount++;
    });
    assert(zeroUsageCount === 0, `All 391 canonical questions are linked to at least 1 assessment (0 unlinked)`);

    // -------------------------------------------------------------
    // L, M, N & Security (O): Test Data Isolation & Security Guardrail
    // -------------------------------------------------------------
    console.log('\n--- 5. Test Data Isolation & Security ---');
    // Test orders & subscriptions with is_test = 1
    const testOrdId = `test_ord_${Date.now()}`;
    const testSubId = `test_sub_${Date.now()}`;

    db.prepare(`
      INSERT INTO payment_orders (id, userId, productType, productId, amount, currency, status, is_test, createdAt, updatedAt)
      VALUES (?, ?, 'ASSESSMENT', 'cat_company_tcs', 2900, 'INR', 'CAPTURED', 1, ?, ?)
    `).run(testOrdId, freeUser, nowIso, nowIso);

    db.prepare(`
      INSERT INTO premium_subscriptions (id, userId, provider, status, is_test, createdAt, updatedAt)
      VALUES (?, ?, 'RAZORPAY', 'ACTIVE', 1, ?, ?)
    `).run(testSubId, subUser, nowIso, nowIso);

    // Production admin requests without X-Test-Runner return ONLY production data
    const prodPaymentsRes = await request('GET', '/api/admin/payments', null, prodAdminHeaders);
    const hasTestOrdInProd = prodPaymentsRes.data.payments.some((p) => p.id === testOrdId);
    assert(!hasTestOrdInProd, 'Production payments API excludes is_test = 1 records');

    const prodSubsRes = await request('GET', '/api/admin/subscriptions', null, prodAdminHeaders);
    const hasTestSubInProd = prodSubsRes.data.subscriptions.some((s) => s.id === testSubId);
    assert(!hasTestSubInProd, 'Production subscriptions API excludes is_test = 1 records');

    // Security check: Unauthenticated or non-admin request cannot access admin payments/subscriptions even with ?includeTest=true
    const unauthPaymentRes = await request('GET', '/api/admin/payments?includeTest=true');
    assert(unauthPaymentRes.status === 401 || unauthPaymentRes.status === 403, 'Unauthenticated includeTest attempt strictly blocked (401/403)');

    console.log('\n================================================================');
    console.log('🎉 ALL FINAL ADMIN & EXPLORE REGRESSION TESTS PASSED (100%)');
    console.log('================================================================\n');
  } finally {
    db.prepare("DELETE FROM users WHERE is_test = 1 OR id LIKE 'final_test_%'").run();
    db.prepare("DELETE FROM payment_orders WHERE is_test = 1 OR id LIKE 'test_ord_%'").run();
    db.prepare("DELETE FROM premium_subscriptions WHERE is_test = 1 OR id LIKE 'test_sub_%'").run();
    db.prepare("DELETE FROM assessment_entitlements WHERE is_test = 1 OR userId LIKE 'final_test_%'").run();
    db.prepare("DELETE FROM deep_ai_credit_ledger WHERE is_test = 1 OR userId LIKE 'final_test_%'").run();
    db.close();
  }
}

runSuite().catch((err) => {
  console.error('Test Suite Error:', err);
  process.exit(1);
});
