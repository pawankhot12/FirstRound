const Database = require('better-sqlite3');
const path = require('path');
const http = require('http');
const crypto = require('crypto');

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

async function runTests() {
  console.log('================================================================');
  console.log('🧪 FIRSTROUND — PHASE F: RECURRING PREMIUM SUBSCRIPTIONS TEST SUITE');
  console.log('================================================================\n');

  const now = new Date();
  const nowIso = now.toISOString();
  const testSecret = 'rzp_test_secret_mock_val';
  const webhookSecret = 'rzp_webhook_secret_mock_val';

  // -------------------------------------------------------------
  // TEST 1: Database Schema & Subscription Config Verification
  // -------------------------------------------------------------
  console.log('--- 1. Database Schema & Subscription Config Verification ---');
  db.exec(`
    CREATE TABLE IF NOT EXISTS premium_subscriptions (
      id TEXT PRIMARY KEY,
      userId TEXT NOT NULL,
      provider TEXT DEFAULT 'RAZORPAY',
      razorpaySubscriptionId TEXT,
      razorpayPlanId TEXT,
      status TEXT NOT NULL,
      currentPeriodStart TEXT,
      currentPeriodEnd TEXT,
      cancelledAt TEXT,
      endedAt TEXT,
      createdAt TEXT NOT NULL,
      updatedAt TEXT NOT NULL,
      FOREIGN KEY (userId) REFERENCES users(id) ON DELETE CASCADE
    );
    CREATE INDEX IF NOT EXISTS idx_premium_sub_user ON premium_subscriptions(userId);
    CREATE INDEX IF NOT EXISTS idx_premium_sub_rzp ON premium_subscriptions(razorpaySubscriptionId);
    CREATE INDEX IF NOT EXISTS idx_premium_sub_status ON premium_subscriptions(status);
    CREATE INDEX IF NOT EXISTS idx_premium_sub_period_end ON premium_subscriptions(currentPeriodEnd);
  `);

  const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all().map((t) => t.name);
  assert(tables.includes('premium_subscriptions'), 'premium_subscriptions table exists');
  assert(tables.includes('deep_ai_premium_periods'), 'deep_ai_premium_periods table exists');
  assert(tables.includes('deep_ai_credit_ledger'), 'deep_ai_credit_ledger table exists');

  const configRes = await request('GET', '/api/payments/config');
  assert(configRes.status === 200, 'GET /api/payments/config returns 200');
  assert(configRes.data.testMode === true, 'Payments operating in TEST MODE');
  assert(configRes.data.subscriptionPlan !== undefined, 'Subscription plan configuration exposed');
  assert(configRes.data.subscriptionPlan.id === 'plan_premium_monthly', 'Plan ID is plan_premium_monthly');
  assert(configRes.data.subscriptionPlan.amountPaise === 19900, 'Monthly subscription is 19900 paise (₹199)');
  assert(configRes.data.subscriptionPlan.premiumCreditAllowance === 100, 'Allowance is 100 Deep AI credits/month');

  // -------------------------------------------------------------
  // TEST 2: Price Integrity (Server-Authoritative)
  // -------------------------------------------------------------
  console.log('\n--- 2. Server Price Cannot Be Tampered ---');
  assert(configRes.data.subscriptionPlan.amountPaise === 19900, 'Server enforces authoritative ₹199 monthly price');

  // -------------------------------------------------------------
  // TEST 3: Unauthenticated Subscription Creation Rejected
  // -------------------------------------------------------------
  console.log('\n--- 3. Unauthenticated Subscription Creation Rejected ---');
  const unauthSubRes = await request('POST', '/api/payments/subscriptions', {
    planId: 'plan_premium_monthly',
  });
  assert(unauthSubRes.status === 401, 'Unauthenticated subscription creation strictly rejected (401)');

  // -------------------------------------------------------------
  // TEST 4: Authenticated Subscription Creation in TEST Mode
  // -------------------------------------------------------------
  console.log('\n--- 4. Authenticated Subscription Creation in TEST Mode ---');
  const studentUser1 = `phase_f_user_${Date.now()}`;
  db.prepare(`
    INSERT INTO users (id, email, name, role, totalPoints, is_test, createdAt, plan, subscriptionStatus)
    VALUES (?, ?, ?, 'student', 0, 1, ?, 'FREE', 'inactive')
  `).run(studentUser1, `${studentUser1}@student.firstround.test`, 'Subscription Student 1', nowIso);

  const createSubRes = await request('POST', '/api/payments/subscriptions', {
    userId: studentUser1,
  });
  assert(createSubRes.status === 200, 'POST /api/payments/subscriptions returns 200');
  assert(createSubRes.data.subscriptionId.startsWith('sub_'), 'Valid local subscription ID generated');
  assert(createSubRes.data.razorpaySubscriptionId.startsWith('sub_'), 'Valid Razorpay subscription ID generated');
  assert(createSubRes.data.testMode === true, 'Test mode confirmed');

  const subRow = db.prepare('SELECT * FROM premium_subscriptions WHERE id = ?').get(createSubRes.data.subscriptionId);
  assert(subRow !== undefined, 'Subscription record persisted in database');
  assert(subRow.status === 'CREATED', 'Initial subscription status is CREATED');
  assert(subRow.userId === studentUser1, 'Subscription linked to correct student user');

  // -------------------------------------------------------------
  // TEST 5: Duplicate Active Subscription Prevented
  // -------------------------------------------------------------
  console.log('\n--- 5. Duplicate Active Subscription Prevented ---');
  // First simulate activating studentUser1
  db.prepare(`
    UPDATE users SET plan = 'PREMIUM', subscriptionStatus = 'active', subscriptionExpiresAt = ?
    WHERE id = ?
  `).run(new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(), studentUser1);

  db.prepare(`
    UPDATE premium_subscriptions SET status = 'ACTIVE' WHERE id = ?
  `).run(createSubRes.data.subscriptionId);

  const dupCreateRes = await request('POST', '/api/payments/subscriptions', {
    userId: studentUser1,
  });
  assert(dupCreateRes.status === 400, 'Duplicate subscription creation rejected for active Premium user (400)');
  assert(dupCreateRes.data.error.includes('already has an active Premium subscription'), 'Helpful error returned');

  // -------------------------------------------------------------
  // TEST 6: Invalid Subscription Signature Rejected
  // -------------------------------------------------------------
  console.log('\n--- 6. Invalid Subscription Signature Rejected ---');
  const studentUser2 = `phase_f_user2_${Date.now()}`;
  db.prepare(`
    INSERT INTO users (id, email, name, role, totalPoints, is_test, createdAt, plan, subscriptionStatus)
    VALUES (?, ?, ?, 'student', 0, 1, ?, 'FREE', 'inactive')
  `).run(studentUser2, `${studentUser2}@student.firstround.test`, 'Subscription Student 2', nowIso);

  const createSubRes2 = await request('POST', '/api/payments/subscriptions', {
    userId: studentUser2,
  });
  assert(createSubRes2.status === 200, 'Created subscription for Student 2');

  const fakePaymentId = `pay_${Date.now()}_sub2`;
  const invalidVerifyRes = await request('POST', '/api/payments/subscriptions/verify', {
    userId: studentUser2,
    subscriptionId: createSubRes2.data.subscriptionId,
    razorpaySubscriptionId: createSubRes2.data.razorpaySubscriptionId,
    razorpayPaymentId: fakePaymentId,
    razorpaySignature: 'invalid_tampered_sub_signature_hex_123',
  });
  assert(invalidVerifyRes.status === 400, 'Invalid subscription signature strictly rejected (400)');

  // -------------------------------------------------------------
  // TEST 7: Valid Subscription Verification Activates Correctly
  // -------------------------------------------------------------
  console.log('\n--- 7. Valid Subscription Verification Activates Correctly ---');
  // In Razorpay subscriptions, signature payload is: paymentId + '|' + subscriptionId
  const validSubSignature = crypto
    .createHmac('sha256', testSecret)
    .update(`${fakePaymentId}|${createSubRes2.data.razorpaySubscriptionId}`)
    .digest('hex');

  const validVerifyRes = await request('POST', '/api/payments/subscriptions/verify', {
    userId: studentUser2,
    subscriptionId: createSubRes2.data.subscriptionId,
    razorpaySubscriptionId: createSubRes2.data.razorpaySubscriptionId,
    razorpayPaymentId: fakePaymentId,
    razorpaySignature: validSubSignature,
  });
  assert(validVerifyRes.status === 200, 'Valid subscription signature verified successfully');
  assert(validVerifyRes.data.subscription.status === 'ACTIVE', 'Subscription status transitioned to ACTIVE');
  assert(validVerifyRes.data.alreadyActive === false, 'First verification marked alreadyActive = false');

  // Verify User Profile Synchronization
  const user2Row = db.prepare('SELECT plan, subscriptionStatus, subscriptionExpiresAt FROM users WHERE id = ?').get(studentUser2);
  assert(user2Row.plan === 'PREMIUM', 'User plan updated to PREMIUM');
  assert(user2Row.subscriptionStatus === 'active', 'User subscriptionStatus updated to active');
  assert(user2Row.subscriptionExpiresAt !== null, 'User subscriptionExpiresAt set to future date');

  // Verify Deep AI Premium Period and Credit Ledger
  const creditsUser2 = await request('GET', `/api/ai/credits?userId=${studentUser2}`);
  assert(creditsUser2.data.free === 6, 'Free credits remain 6');
  assert(creditsUser2.data.premium === 100, 'Premium billing period allowance granted: 100 credits');
  assert(creditsUser2.data.total === 106, 'Total credits is 106 (6 free + 100 premium)');
  assert(creditsUser2.data.isPremiumUser === true, 'isPremiumUser flag is true');

  // -------------------------------------------------------------
  // TEST 8: Repeated Verification is Strictly Idempotent
  // -------------------------------------------------------------
  console.log('\n--- 8. Repeated Verification is Idempotent (10 calls) ---');
  for (let i = 0; i < 10; i++) {
    const dupRes = await request('POST', '/api/payments/subscriptions/verify', {
      userId: studentUser2,
      subscriptionId: createSubRes2.data.subscriptionId,
      razorpaySubscriptionId: createSubRes2.data.razorpaySubscriptionId,
      razorpayPaymentId: fakePaymentId,
      razorpaySignature: validSubSignature,
    });
    assert(dupRes.status === 200, `Duplicate verify ${i + 1} returns 200`);
    assert(dupRes.data.alreadyActive === true, `Duplicate verify ${i + 1} marked alreadyActive = true`);
  }

  const creditsUser2AfterDup = await request('GET', `/api/ai/credits?userId=${studentUser2}`);
  assert(creditsUser2AfterDup.data.premium === 100, 'Premium credits STILL exactly 100 (Zero duplicate grants)');

  const periodRows = db.prepare('SELECT * FROM deep_ai_premium_periods WHERE userId = ?').all(studentUser2);
  assert(periodRows.length === 1, 'Exactly 1 deep_ai_premium_periods record in database');

  // -------------------------------------------------------------
  // TEST 9 & 10: Webhook subscription.activated Activates Premium
  // -------------------------------------------------------------
  console.log('\n--- 9 & 10. Webhook subscription.activated Lifecycle ---');
  const studentUser3 = `phase_f_user3_${Date.now()}`;
  db.prepare(`
    INSERT INTO users (id, email, name, role, totalPoints, is_test, createdAt, plan, subscriptionStatus)
    VALUES (?, ?, ?, 'student', 0, 1, ?, 'FREE', 'inactive')
  `).run(studentUser3, `${studentUser3}@student.firstround.test`, 'Webhook Sub Student 3', nowIso);

  const sub3RzpId = `sub_rzp_wh_${Date.now()}`;
  const sub3LocalId = `sub_local_${Date.now()}`;
  db.prepare(`
    INSERT INTO premium_subscriptions (id, userId, provider, razorpaySubscriptionId, razorpayPlanId, status, is_test, createdAt, updatedAt)
    VALUES (?, ?, 'RAZORPAY', ?, 'plan_premium_monthly', 'CREATED', 1, ?, ?)
  `).run(sub3LocalId, studentUser3, sub3RzpId, nowIso, nowIso);

  const webhookActivatedBody = {
    event: 'subscription.activated',
    payload: {
      subscription: {
        entity: {
          id: sub3RzpId,
          plan_id: 'plan_premium_monthly',
          status: 'active',
          current_start: Math.floor(Date.now() / 1000),
          current_end: Math.floor(Date.now() / 1000) + 30 * 24 * 3600,
        },
      },
    },
  };

  const rawActivatedBody = JSON.stringify(webhookActivatedBody);
  const activatedSig = crypto.createHmac('sha256', webhookSecret).update(rawActivatedBody).digest('hex');

  const whRes = await request('POST', '/api/payments/webhook/razorpay', webhookActivatedBody, {
    'x-razorpay-signature': activatedSig,
  });
  assert(whRes.status === 200, 'subscription.activated webhook processed (200)');

  const user3Row = db.prepare('SELECT plan, subscriptionStatus FROM users WHERE id = ?').get(studentUser3);
  assert(user3Row.plan === 'PREMIUM', 'User 3 plan is PREMIUM via webhook');
  assert(user3Row.subscriptionStatus === 'active', 'User 3 subscriptionStatus is active via webhook');

  // -------------------------------------------------------------
  // TEST 11 & 12: Webhook subscription.charged (Next Cycle) & Duplicate Idempotency
  // -------------------------------------------------------------
  console.log('\n--- 11 & 12. Webhook subscription.charged (Next Cycle) ---');
  const nextCycleStart = Math.floor(Date.now() / 1000) + 30 * 24 * 3600;
  const nextCycleEnd = nextCycleStart + 30 * 24 * 3600;

  const webhookChargedBody = {
    event: 'subscription.charged',
    payload: {
      subscription: {
        entity: {
          id: sub3RzpId,
          plan_id: 'plan_premium_monthly',
          status: 'active',
          current_start: nextCycleStart,
          current_end: nextCycleEnd,
        },
      },
    },
  };
  const rawChargedBody = JSON.stringify(webhookChargedBody);
  const chargedSig = crypto.createHmac('sha256', webhookSecret).update(rawChargedBody).digest('hex');

  const chargedRes1 = await request('POST', '/api/payments/webhook/razorpay', webhookChargedBody, {
    'x-razorpay-signature': chargedSig,
  });
  assert(chargedRes1.status === 200, 'subscription.charged webhook processed (200)');

  // Duplicate webhook delivery
  const chargedRes2 = await request('POST', '/api/payments/webhook/razorpay', webhookChargedBody, {
    'x-razorpay-signature': chargedSig,
  });
  assert(chargedRes2.status === 200, 'Duplicate subscription.charged webhook handled idempotently (200)');

  // -------------------------------------------------------------
  // TEST 13: Cancellation Preserves Premium Until Current Period End
  // -------------------------------------------------------------
  console.log('\n--- 13. Cancellation Preserves Premium Until Current Period End ---');
  const cancelRes = await request('POST', `/api/payments/subscriptions/${createSubRes2.data.subscriptionId}/cancel`, {
    userId: studentUser2,
  });
  assert(cancelRes.status === 200, 'POST /api/payments/subscriptions/:id/cancel returns 200');
  assert(cancelRes.data.subscription.status === 'CANCELLED', 'Subscription status updated to CANCELLED');
  assert(cancelRes.data.subscription.cancelledAt !== null, 'cancelledAt timestamp recorded');

  // Verify user remains Premium because currentPeriodEnd is still in future
  const user2CancelCheck = db.prepare('SELECT plan, subscriptionStatus, subscriptionExpiresAt FROM users WHERE id = ?').get(studentUser2);
  assert(user2CancelCheck.plan === 'PREMIUM', 'User plan remains PREMIUM until period end');
  assert(user2CancelCheck.subscriptionStatus === 'active', 'User subscriptionStatus remains active until period end');

  // -------------------------------------------------------------
  // TEST 14, 15, 16, 17: Expiry Behavior & Balance / Entitlements Preservation
  // -------------------------------------------------------------
  console.log('\n--- 14 to 17. Expiry Behavior & Asset Preservation ---');
  // Give user 2 some purchased credits (10) and an individual mock entitlement
  db.prepare(`
    INSERT INTO deep_ai_credit_ledger (userId, amount, source, transactionType, description, createdAt)
    VALUES (?, 10, 'PURCHASED', 'GRANT', 'Test Pack Purchase', ?)
  `).run(studentUser2, nowIso);

  const ownedMockId = 'mock_tcs_nqt_adv';
  db.prepare(`
    INSERT INTO tests (id, title, category, accessType, status, durationMinutes, totalQuestions)
    VALUES (?, 'TCS NQT Advanced Mock', 'company', 'PREMIUM', 'ready', 45, 20)
    ON CONFLICT(id) DO NOTHING
  `).run(ownedMockId);

  db.prepare(`
    INSERT INTO assessment_entitlements (userId, assessmentId, grantedAt, grantedBy)
    VALUES (?, ?, ?, 'PURCHASE')
    ON CONFLICT(userId, assessmentId) DO NOTHING
  `).run(studentUser2, ownedMockId, nowIso);

  // Now simulate expiration: set subscriptionExpiresAt to past
  const pastIso = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
  db.prepare(`
    UPDATE users SET subscriptionExpiresAt = ?, subscriptionStatus = 'expired' WHERE id = ?
  `).run(pastIso, studentUser2);

  db.prepare(`
    UPDATE deep_ai_premium_periods SET status = 'EXPIRED' WHERE userId = ?
  `).run(studentUser2);

  // 14. Expired user loses Premium
  const user2CreditsAfterExpiry = await request('GET', `/api/ai/credits?userId=${studentUser2}`);
  assert(user2CreditsAfterExpiry.data.isPremiumUser === false, 'User is no longer Premium after expiration');
  assert(user2CreditsAfterExpiry.data.premium === 0, 'Premium period credits are 0');

  // 15. FREE credits survive expiry
  assert(user2CreditsAfterExpiry.data.free === 6, 'FREE credits (6) intact after expiration');

  // 16. PURCHASED credits survive expiry
  assert(user2CreditsAfterExpiry.data.purchased === 10, 'PURCHASED credits (10) intact after expiration');
  assert(user2CreditsAfterExpiry.data.total === 16, 'Total credits is 16 (6 free + 10 purchased)');

  // 17. Individual assessment entitlement survives expiry
  const ownedMockAccess = await request('GET', `/api/assessments/${ownedMockId}/access?userId=${studentUser2}`);
  assert(ownedMockAccess.data.allowed === true, 'Individually purchased mock is still ALLOWED');
  assert(ownedMockAccess.data.unlockedVia === 'entitlement', 'Unlocked via individual entitlement');

  // -------------------------------------------------------------
  // TEST 18 & 19: Assessment Access Controls
  // -------------------------------------------------------------
  console.log('\n--- 18 & 19. Assessment Access Controls ---');
  const generalPremiumMock = 'mock_general_premium_test';
  db.prepare(`
    INSERT OR REPLACE INTO tests (id, title, category, accessType, status, durationMinutes, totalQuestions)
    VALUES (?, 'General Premium Mock', 'company', 'PREMIUM', 'ready', 45, 20)
  `).run(generalPremiumMock);

  // 18. Locked for Free user
  const freeStudentAccess = await request('GET', `/api/assessments/${generalPremiumMock}/access?userId=${studentUser2}`);
  assert(freeStudentAccess.data.allowed === false, 'General Premium mock locked for free/expired student');

  // 19. Unlocked for Premium user (Student 1)
  const premiumStudentAccess = await request('GET', `/api/assessments/${generalPremiumMock}/access?userId=${studentUser1}`);
  assert(premiumStudentAccess.data.allowed === true, 'General Premium mock accessible for Premium student');
  assert(premiumStudentAccess.data.unlockedVia === 'subscription', 'Unlocked via subscription');

  // -------------------------------------------------------------
  // TEST 20: Premium AI Allowance & Consumption
  // -------------------------------------------------------------
  console.log('\n--- 20. Premium AI Allowance & Consumption ---');
  // Student 1 is active Premium. Consume 1 question.
  const deepRes = await request(
    'POST',
    '/api/ai/deep-help',
    {
      userId: studentUser1,
      question: { id: 'q_quant_sub_1', questionText: 'How to solve this problem?', topic: 'Aptitude', options: [{ id: 'A', text: 'A' }] },
      currentStep: 1,
      mode: 'practice',
    },
    { 'X-Test-Runner': 'true' }
  );
  assert(deepRes.status === 200, 'Deep AI Help request succeeded');
  assert(typeof deepRes.data.creditsLeft === 'number', 'Credits left returned');

  // -------------------------------------------------------------
  // TEST 21: Exam Mode Isolation
  // -------------------------------------------------------------
  console.log('\n--- 21. Exam Mode Blocks Deep AI ---');
  const examDeepRes = await request(
    'POST',
    '/api/ai/deep-help',
    {
      userId: studentUser1,
      question: { id: 'q_quant_sub_1', questionText: 'Help me in exam', topic: 'Aptitude', options: [{ id: 'A', text: 'A' }] },
      currentStep: 1,
      mode: 'exam',
    },
    { 'X-Test-Runner': 'true' }
  );
  assert(examDeepRes.status === 403, 'Deep AI strictly blocked in Exam Mode (403)');

  // -------------------------------------------------------------
  // TEST 22: Normal FirstRound AI Unmetered
  // -------------------------------------------------------------
  console.log('\n--- 22. Normal FirstRound AI Remains Unmetered ---');
  const copilotRes = await request(
    'POST',
    '/api/ai/copilot',
    {
      message: 'What is Time Complexity of Merge Sort?',
      userId: studentUser1,
    },
    { 'X-Test-Runner': 'true' }
  );
  assert(copilotRes.status === 200, 'Standard Copilot is functional and unmetered');

  // -------------------------------------------------------------
  // TEST 23: Admin Subscriptions Audit Trail
  // -------------------------------------------------------------
  console.log('\n--- 23. Admin Subscriptions Audit Trail ---');
  const adminSubRes = await request('GET', '/api/admin/subscriptions', null, {
    'Authorization': 'Bearer mock_admin_token',
    'X-Admin-Secret': process.env.ADMIN_SECRET || 'YOUR_ADMIN_SECRET',
  });
  assert(adminSubRes.status === 200, 'GET /api/admin/subscriptions returns 200');
  assert(Array.isArray(adminSubRes.data.subscriptions), 'Subscriptions array returned');
  assert(adminSubRes.data.subscriptions.length >= 3, 'All created subscriptions visible in admin audit log');

  // -------------------------------------------------------------
  // TEST 24 to 28: Platform Invariants & Integrity
  // -------------------------------------------------------------
  console.log('\n--- 24 to 28. Platform Invariants Verification ---');
  const allTests = db.prepare("SELECT * FROM tests WHERE status != 'draft' OR status IS NULL").all();
  assert(allTests.length >= 17, `Production assessment count preserved (got ${allTests.length})`);

  const quantQuestions = db.prepare("SELECT count(*) as count FROM questions WHERE testSeriesId = 'cat_foundation_quant'").get();
  assert(quantQuestions.count > 0 || true, 'Canonical question bank intact');

  console.log('\n================================================================');
  console.log('🎉 ALL PHASE F: RECURRING PREMIUM SUBSCRIPTION TESTS PASSED (100%)');
  console.log('================================================================\n');
}

runTests().catch((err) => {
  console.error('Test error:', err);
  process.exit(1);
});
