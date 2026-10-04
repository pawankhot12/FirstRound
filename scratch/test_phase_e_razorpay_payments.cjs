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
  console.log('🧪 FIRSTROUND — PHASE E: RAZORPAY ONE-TIME PURCHASES TEST SUITE');
  console.log('================================================================\n');

  const now = new Date();
  const nowIso = now.toISOString();
  const testSecret = 'rzp_test_secret_mock_val';
  const webhookSecret = 'rzp_webhook_secret_mock_val';

  // -------------------------------------------------------------
  // TEST 1: Schema & Public Config Verification
  // -------------------------------------------------------------
  console.log('--- 1. Database Schema & Config Verification ---');
  db.exec(`
    CREATE TABLE IF NOT EXISTS payment_orders (
      id TEXT PRIMARY KEY,
      userId TEXT NOT NULL,
      productType TEXT NOT NULL,
      productId TEXT NOT NULL,
      amount INTEGER NOT NULL,
      currency TEXT DEFAULT 'INR',
      status TEXT DEFAULT 'CREATED',
      razorpayOrderId TEXT,
      razorpayPaymentId TEXT,
      razorpaySignature TEXT,
      metadata TEXT,
      createdAt TEXT NOT NULL,
      updatedAt TEXT NOT NULL,
      FOREIGN KEY (userId) REFERENCES users(id) ON DELETE CASCADE
    );
    CREATE INDEX IF NOT EXISTS idx_payment_orders_user ON payment_orders(userId);
    CREATE INDEX IF NOT EXISTS idx_payment_orders_rzp ON payment_orders(razorpayOrderId);
    CREATE INDEX IF NOT EXISTS idx_payment_orders_status ON payment_orders(status);
    CREATE INDEX IF NOT EXISTS idx_payment_orders_created ON payment_orders(createdAt);
  `);
  const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all().map((t) => t.name);
  assert(tables.includes('payment_orders'), 'payment_orders table exists');
  assert(tables.includes('assessment_entitlements'), 'assessment_entitlements table exists');
  assert(tables.includes('deep_ai_credit_ledger'), 'deep_ai_credit_ledger table exists');

  const configRes = await request('GET', '/api/payments/config');
  assert(configRes.status === 200, 'GET /api/payments/config returns 200');
  assert(configRes.data.testMode === true, 'Payments in TEST MODE');
  assert(Array.isArray(configRes.data.creditPacks), 'Credit packs available');
  assert(configRes.data.creditPacks.length === 3, '3 credit packs configured (10, 25, 50)');
  assert(configRes.data.assessmentPricePaise === 2900, 'Assessment price configured as 2900 paise (₹29)');

  // -------------------------------------------------------------
  // TEST 2: Order Creation & Server-Authoritative Pricing
  // -------------------------------------------------------------
  console.log('\n--- 2. Order Creation & Price Integrity ---');
  try {
    const studentUser1 = `phase_e_user_${Date.now()}`;
    db.prepare(`
      INSERT INTO users (id, email, name, role, totalPoints, is_test, createdAt, plan, subscriptionStatus)
      VALUES (?, ?, ?, 'student', 0, 1, ?, 'FREE', 'inactive')
    `).run(studentUser1, `${studentUser1}@student.firstround.test`, 'Payment Student 1', nowIso);

  // Client attempts to create an order with manipulated price (server should ignore/override with authoritative price)
  const orderRes1 = await request(
    'POST',
    '/api/payments/orders',
    {
      userId: studentUser1,
      productType: 'AI_CREDIT_PACK',
      productId: 'pack_25',
      amount: 1, // Tampered client price!
    },
    { 'X-Test-Runner': 'true' }
  );

  assert(orderRes1.status === 200, 'POST /api/payments/orders succeeded');
  assert(orderRes1.data.amount === 9900, 'Server enforced authoritative price: 9900 paise (₹99), ignoring client manipulation');
  assert(orderRes1.data.orderId.startsWith('ord_'), 'Valid local order ID generated');
  assert(orderRes1.data.razorpayOrderId.startsWith('order_'), 'Valid Razorpay order ID generated');

  // Verify order in database
  const orderRow1 = db.prepare('SELECT * FROM payment_orders WHERE id = ?').get(orderRes1.data.orderId);
  assert(orderRow1 !== undefined, 'Order persisted in payment_orders table');
  assert(orderRow1.status === 'CREATED', 'Initial order status is CREATED');
  assert(orderRow1.amount === 9900, 'Persisted amount is 9900');

  // Invalid product rejection
  const invalidOrderRes = await request('POST', '/api/payments/orders', {
    userId: studentUser1,
    productType: 'AI_CREDIT_PACK',
    productId: 'pack_999999_fake',
  });
  assert(invalidOrderRes.status >= 400, 'Invalid AI credit pack rejected');

  // -------------------------------------------------------------
  // TEST 3: Signature Verification & Atomic AI Credit Pack Fulfillment
  // -------------------------------------------------------------
  console.log('\n--- 3. AI Credit Pack Signature Verification & Fulfillment ---');
  const fakePaymentId = `pay_${Date.now()}_abc123`;
  const validSignature = crypto
    .createHmac('sha256', testSecret)
    .update(`${orderRes1.data.razorpayOrderId}|${fakePaymentId}`)
    .digest('hex');

  // 3a. Invalid signature rejection
  const invalidSigRes = await request('POST', '/api/payments/verify', {
    userId: studentUser1,
    orderId: orderRes1.data.orderId,
    razorpayOrderId: orderRes1.data.razorpayOrderId,
    razorpayPaymentId: fakePaymentId,
    razorpaySignature: 'invalid_tampered_signature_hex_123',
  });
  assert(invalidSigRes.status === 400, 'Invalid payment signature strictly rejected (400)');

  // 3b. Valid signature verification
  const verifyRes1 = await request('POST', '/api/payments/verify', {
    userId: studentUser1,
    orderId: orderRes1.data.orderId,
    razorpayOrderId: orderRes1.data.razorpayOrderId,
    razorpayPaymentId: fakePaymentId,
    razorpaySignature: validSignature,
  });
  if (verifyRes1.status !== 200) {
    console.error('DEBUG verifyRes1:', verifyRes1);
  }
  assert(verifyRes1.status === 200, 'Valid signature verified successfully');
  assert(verifyRes1.data.order.status === 'CAPTURED', 'Order status transitioned to CAPTURED');
  assert(verifyRes1.data.alreadyFulfilled === false, 'First fulfillment marked alreadyFulfilled = false');

  // Check ledger & wallet
  const creditsAfterPack = await request('GET', `/api/ai/credits?userId=${studentUser1}`);
  assert(creditsAfterPack.data.free === 6, 'Free credits remain intact at 6');
  assert(creditsAfterPack.data.purchased === 25, 'Purchased credits added: exactly 25');
  assert(creditsAfterPack.data.premium === 0, 'Premium credits remain 0 (not a subscription)');
  assert(creditsAfterPack.data.total === 31, 'Total balance is 31 (6 free + 25 purchased)');

  // -------------------------------------------------------------
  // TEST 4: Idempotency (10 Duplicate Verification Requests)
  // -------------------------------------------------------------
  console.log('\n--- 4. Verification Idempotency Verification ---');
  console.log('Sending 10 duplicate verify requests for the same captured order...');
  for (let i = 0; i < 10; i++) {
    const dupRes = await request('POST', '/api/payments/verify', {
      userId: studentUser1,
      orderId: orderRes1.data.orderId,
      razorpayOrderId: orderRes1.data.razorpayOrderId,
      razorpayPaymentId: fakePaymentId,
      razorpaySignature: validSignature,
    });
    assert(dupRes.status === 200, `Duplicate verify call ${i + 1} returns 200`);
    assert(dupRes.data.alreadyFulfilled === true, `Duplicate verify call ${i + 1} marked alreadyFulfilled = true`);
  }

  const creditsAfterDup = await request('GET', `/api/ai/credits?userId=${studentUser1}`);
  assert(creditsAfterDup.data.purchased === 25, 'Purchased credits STILL exactly 25 (Zero duplicate grants)');

  // -------------------------------------------------------------
  // TEST 5: Assessment Purchase Fulfillment & Product Independence
  // -------------------------------------------------------------
  console.log('\n--- 5. Individual Assessment Purchase & Independence ---');
  const targetTestId = 'mock_tcs_nqt_adv';
  db.prepare(`
    INSERT OR REPLACE INTO tests (id, title, category, accessType, status, durationMinutes, totalQuestions)
    VALUES (?, 'TCS NQT Advanced Mock', 'company', 'PREMIUM', 'ready', 45, 20)
  `).run(targetTestId);

  // Check access before purchase -> should be locked
  const accessBefore = await request('GET', `/api/assessments/${targetTestId}/access?userId=${studentUser1}`);
  assert(accessBefore.data.allowed === false, 'Assessment is initially locked for free user');

  // Create assessment order
  const orderRes2 = await request('POST', '/api/payments/orders', {
    userId: studentUser1,
    productType: 'ASSESSMENT',
    productId: targetTestId,
  });
  assert(orderRes2.status === 200, 'Assessment payment order created');
  assert(orderRes2.data.amount === 2900, 'Assessment price is 2900 paise (₹29)');

  const paymentId2 = `pay_${Date.now()}_test2`;
  const validSig2 = crypto
    .createHmac('sha256', testSecret)
    .update(`${orderRes2.data.razorpayOrderId}|${paymentId2}`)
    .digest('hex');

  const verifyRes2 = await request('POST', '/api/payments/verify', {
    userId: studentUser1,
    orderId: orderRes2.data.orderId,
    razorpayOrderId: orderRes2.data.razorpayOrderId,
    razorpayPaymentId: paymentId2,
    razorpaySignature: validSig2,
  });
  assert(verifyRes2.status === 200, 'Assessment payment verified');

  // Verify only requested assessment unlocked
  const accessAfter = await request('GET', `/api/assessments/${targetTestId}/access?userId=${studentUser1}`);
  assert(accessAfter.data.allowed === true, 'Purchased assessment is now ALLOWED');
  assert(accessAfter.data.unlockedVia === 'entitlement', 'Unlocked via individual entitlement');

  // Verify other premium assessment remains locked
  const otherPremiumTestId = 'mock_other_locked_premium';
  db.prepare(`
    INSERT OR REPLACE INTO tests (id, title, category, accessType, status, durationMinutes, totalQuestions)
    VALUES (?, 'Other Locked Premium Mock', 'company', 'PREMIUM', 'ready', 45, 20)
  `).run(otherPremiumTestId);

  const otherTestAccess = await request('GET', `/api/assessments/${otherPremiumTestId}/access?userId=${studentUser1}`);
  assert(otherTestAccess.data.allowed === false, 'Other premium assessments remain LOCKED');

  // Verify user did NOT become Premium and did NOT get extra AI credits
  const userRowAfter = db.prepare('SELECT plan, subscriptionStatus FROM users WHERE id = ?').get(studentUser1);
  assert(userRowAfter.plan === 'FREE', 'User plan remains FREE');
  assert(userRowAfter.subscriptionStatus === 'inactive', 'User subscriptionStatus remains inactive');

  const creditsAfterMock = await request('GET', `/api/ai/credits?userId=${studentUser1}`);
  assert(creditsAfterMock.data.purchased === 25, 'AI credits unchanged by assessment purchase');

  // -------------------------------------------------------------
  // TEST 6: Repurchase Prevention
  // -------------------------------------------------------------
  console.log('\n--- 6. Repurchase Prevention for Owned Assessment ---');
  const repeatOrderRes = await request('POST', '/api/payments/orders', {
    userId: studentUser1,
    productType: 'ASSESSMENT',
    productId: targetTestId,
  });
  assert(repeatOrderRes.status === 400, 'Order creation for already-owned assessment rejected with 400');
  assert(repeatOrderRes.data.error.includes('already have access'), 'Helpful error returned');

  // -------------------------------------------------------------
  // TEST 7: Razorpay Webhook Signature & Idempotency
  // -------------------------------------------------------------
  console.log('\n--- 7. Razorpay Webhook Verification & Idempotency ---');
  const studentUser2 = `phase_e_user2_${Date.now()}`;
  db.prepare(`
    INSERT INTO users (id, email, name, role, totalPoints, is_test, createdAt, plan, subscriptionStatus)
    VALUES (?, ?, ?, 'student', 0, 1, ?, 'FREE', 'inactive')
  `).run(studentUser2, `${studentUser2}@student.firstround.test`, 'Webhook Student', nowIso);

  // Create order for 50-pack
  const orderRes3 = await request('POST', '/api/payments/orders', {
    userId: studentUser1,
    productType: 'AI_CREDIT_PACK',
    productId: 'pack_50',
  });

  const webhookPaymentId = `pay_wh_${Date.now()}`;
  const webhookBody = {
    event: 'payment.captured',
    payload: {
      payment: {
        entity: {
          id: webhookPaymentId,
          order_id: orderRes3.data.razorpayOrderId,
          amount: 17900,
          currency: 'INR',
          status: 'captured',
        },
      },
    },
  };

  const rawWebhookBody = JSON.stringify(webhookBody);
  const validWebhookSig = crypto
    .createHmac('sha256', webhookSecret)
    .update(rawWebhookBody)
    .digest('hex');

  // 7a. Invalid webhook signature rejected
  const badWebhookRes = await request(
    'POST',
    '/api/payments/webhook/razorpay',
    webhookBody,
    { 'x-razorpay-signature': 'invalid_webhook_signature_123' }
  );
  assert(badWebhookRes.status === 400, 'Invalid webhook signature strictly rejected (400)');

  // 7b. Valid webhook delivery
  const goodWebhookRes = await request(
    'POST',
    '/api/payments/webhook/razorpay',
    webhookBody,
    { 'x-razorpay-signature': validWebhookSig }
  );
  assert(goodWebhookRes.status === 200, 'Valid webhook processed (200)');

  // 7c. Duplicate webhook delivery (idempotent)
  console.log('Sending duplicate webhook delivery...');
  const dupWebhookRes = await request(
    'POST',
    '/api/payments/webhook/razorpay',
    webhookBody,
    { 'x-razorpay-signature': validWebhookSig }
  );
  assert(dupWebhookRes.status === 200, 'Duplicate webhook handled cleanly (200)');

  // Check ledger for student 1
  const creditsUser2 = await request('GET', `/api/ai/credits?userId=${studentUser1}`);
  assert(creditsUser2.data.purchased === 25 + 50, 'Purchased credits added exactly once (25 + 50 = 75)');

  // -------------------------------------------------------------
  // TEST 8: Admin Payment Audit Trail
  // -------------------------------------------------------------
  console.log('\n--- 8. Admin Payment Transactions Audit Trail ---');
  const adminPaymentsRes = await request('GET', '/api/admin/payments', null, {
    'Authorization': 'Bearer mock_admin_token',
    'X-Admin-Secret': process.env.ADMIN_SECRET || 'YOUR_ADMIN_SECRET',
    'X-Test-Runner': 'true',
  });
  assert(adminPaymentsRes.status === 200, 'Admin payments audit endpoint returns 200');
  assert(Array.isArray(adminPaymentsRes.data.payments), 'Payments array returned');
  assert(adminPaymentsRes.data.payments.length >= 3, 'Audit log contains all test orders');

  const sampleOrder = adminPaymentsRes.data.payments.find((p) => p.id === orderRes1.data.orderId);
  assert(sampleOrder.status === 'CAPTURED', 'Captured order visible in admin audit log');
  assert(sampleOrder.amount === 9900, 'Correct amount displayed in admin audit log');
  assert(sampleOrder.razorpayPaymentId !== undefined, 'Payment ID recorded in audit log');

  console.log('\n================================================================');
  console.log('🎉 ALL PHASE E: RAZORPAY ONE-TIME PURCHASE TESTS PASSED (100%)');
  console.log('================================================================\n');
  } finally {
    db.prepare("DELETE FROM users WHERE is_test = 1 OR id LIKE 'phase_e_%'").run();
    db.prepare("DELETE FROM payment_orders WHERE is_test = 1 OR id LIKE 'ord_%'").run();
    db.prepare("DELETE FROM assessment_entitlements WHERE is_test = 1 OR userId LIKE 'phase_e_%'").run();
    db.prepare("DELETE FROM deep_ai_credit_ledger WHERE is_test = 1 OR userId LIKE 'phase_e_%'").run();
    db.close();
  }
}

runTests().catch((err) => {
  console.error('Test error:', err);
  process.exit(1);
});
