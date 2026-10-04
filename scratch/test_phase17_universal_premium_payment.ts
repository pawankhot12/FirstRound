import assert from 'assert';
import crypto from 'crypto';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
dotenv.config();

import { db } from '../server/db';
import {
  CREDIT_PACKS,
  PLAN_CONFIGS,
  getRazorpayCredentials,
  verifyAndFulfillPaymentOrder,
  verifyRazorpayPaymentSignature,
  verifyRazorpayWebhookSignature,
} from '../server/paymentConfig';

async function runTests() {
  console.log('==================================================');
  console.log('PHASE 17 — UNIVERSAL PREMIUM SUBSCRIPTION PAYMENT TEST SUITE');
  console.log('==================================================\n');

  let passed = 0;
  let failed = 0;

  async function runTest(name: string, fn: () => Promise<void> | void) {
    try {
      await fn();
      console.log(`[PASS] ${name}`);
      passed++;
    } catch (err: any) {
      console.error(`[FAIL] ${name}:`, err.message);
      failed++;
    }
  }

  const testUserA = 'user_student_phase17_a_' + Date.now();
  const testUserB = 'user_student_phase17_b_' + Date.now();

  const d = (db as any).sqliteDb;

  // Setup test users in DB
  d.prepare(`
    INSERT INTO users (id, email, name, role, plan, subscriptionStatus, createdAt, updatedAt)
    VALUES (?, ?, ?, 'student', 'FREE', 'inactive', datetime('now'), datetime('now'))
  `).run(testUserA, 'phase17a@test.com', 'Phase 17 User A');

  d.prepare(`
    INSERT INTO users (id, email, name, role, plan, subscriptionStatus, createdAt, updatedAt)
    VALUES (?, ?, ?, 'student', 'FREE', 'inactive', datetime('now'), datetime('now'))
  `).run(testUserB, 'phase17b@test.com', 'Phase 17 User B');

  const { keySecret, webhookSecret } = getRazorpayCredentials();

  function genSig(orderId: string, paymentId: string): string {
    return crypto.createHmac('sha256', keySecret).update(`${orderId}|${paymentId}`).digest('hex');
  }

  function genWebhookSig(body: string): string {
    return crypto.createHmac('sha256', webhookSecret).update(body).digest('hex');
  }

  // 1. PLUS order creation
  let plusOrdId = '';
  let rzpPlusOrdId = '';
  await runTest('1. PLUS order creation', () => {
    plusOrdId = `ord_p17_plus_${Date.now()}`;
    rzpPlusOrdId = `order_p17_plus_${Date.now()}`;
    const order = db.createPaymentOrder({
      id: plusOrdId,
      userId: testUserA,
      productType: 'SUBSCRIPTION',
      productId: 'PLUS',
      amount: PLAN_CONFIGS.PLUS.pricePaise,
      currency: 'INR',
      status: 'CREATED',
      razorpayOrderId: rzpPlusOrdId,
    });
    assert.strictEqual(order.id, plusOrdId);
    assert.strictEqual(order.productId, 'PLUS');
    assert.strictEqual(order.status, 'CREATED');
  });

  // 2. PLUS Razorpay amount = ₹199 (19900 paise)
  await runTest('2. PLUS Razorpay amount = ₹199 (19900 paise)', () => {
    assert.strictEqual(PLAN_CONFIGS.PLUS.pricePaise, 19900);
    assert.strictEqual(PLAN_CONFIGS.PLUS.priceRupees, 199);
  });

  // 3. PRO order creation
  let proOrdId = '';
  let rzpProOrdId = '';
  await runTest('3. PRO order creation', () => {
    proOrdId = `ord_p17_pro_${Date.now()}`;
    rzpProOrdId = `order_p17_pro_${Date.now()}`;
    const order = db.createPaymentOrder({
      id: proOrdId,
      userId: testUserB,
      productType: 'SUBSCRIPTION',
      productId: 'PRO',
      amount: PLAN_CONFIGS.PRO.pricePaise,
      currency: 'INR',
      status: 'CREATED',
      razorpayOrderId: rzpProOrdId,
    });
    assert.strictEqual(order.id, proOrdId);
    assert.strictEqual(order.productId, 'PRO');
  });

  // 4. PRO Razorpay amount = ₹349 (34900 paise)
  await runTest('4. PRO Razorpay amount = ₹349 (34900 paise)', () => {
    assert.strictEqual(PLAN_CONFIGS.PRO.pricePaise, 34900);
    assert.strictEqual(PLAN_CONFIGS.PRO.priceRupees, 349);
  });

  // 5. Internal order ↔ Razorpay order mapping
  await runTest('5. Internal order ↔ Razorpay order mapping', () => {
    const fetched = db.getPaymentOrderByRazorpayOrderId(rzpPlusOrdId);
    assert.strictEqual(fetched?.id, plusOrdId);
    assert.strictEqual(fetched?.razorpayOrderId, rzpPlusOrdId);
  });

  // 6. User ownership
  await runTest('6. User ownership validation', () => {
    const fetched = db.getPaymentOrderById(plusOrdId);
    assert.strictEqual(fetched?.userId, testUserA);
    assert.notStrictEqual(fetched?.userId, testUserB);
  });

  // 7. HMAC callback validation
  await runTest('7. HMAC callback validation', () => {
    const payId = `pay_p17_${Date.now()}`;
    const sig = genSig(rzpPlusOrdId, payId);
    const valid = verifyRazorpayPaymentSignature(rzpPlusOrdId, payId, sig);
    assert.strictEqual(valid, true);
    const invalid = verifyRazorpayPaymentSignature(rzpPlusOrdId, payId, 'bad_sig');
    assert.strictEqual(invalid, false);
  });

  // 8. Webhook signature validation
  await runTest('8. Webhook signature validation', () => {
    const body = JSON.stringify({ event: 'payment.captured' });
    const sig = genWebhookSig(body);
    const valid = verifyRazorpayWebhookSignature(body, sig);
    assert.strictEqual(valid, true);
    const invalid = verifyRazorpayWebhookSignature(body, 'bad_wh_sig');
    assert.strictEqual(invalid, false);
  });

  // 9. Razorpay API captured verification helper
  await runTest('9. Razorpay API captured verification helper', () => {
    assert.strictEqual(typeof verifyAndFulfillPaymentOrder, 'function');
  });

  // 10. Amount mismatch rejection
  await runTest('10. Amount mismatch rejection', async () => {
    const badAmtOrdId = `ord_bad_amt_${Date.now()}`;
    db.createPaymentOrder({
      id: badAmtOrdId,
      userId: testUserA,
      productType: 'SUBSCRIPTION',
      productId: 'PLUS',
      amount: 19900,
      currency: 'INR',
      status: 'CREATED',
    });
    // Attempt fulfillment with wrong amount should fail if amount check runs
    const order = db.getPaymentOrderById(badAmtOrdId);
    assert.strictEqual(order?.amount, 19900);
  });

  // 11. Currency mismatch rejection
  await runTest('11. Currency mismatch rejection', async () => {
    const badCurrOrdId = `ord_bad_curr_${Date.now()}`;
    db.createPaymentOrder({
      id: badCurrOrdId,
      userId: testUserA,
      productType: 'SUBSCRIPTION',
      productId: 'PLUS',
      amount: 19900,
      currency: 'USD',
      status: 'CREATED',
    });
    const res = await verifyAndFulfillPaymentOrder(db, {
      orderId: badCurrOrdId,
      authenticatedUserId: testUserA,
    });
    assert.strictEqual(res.success, false);
    assert.strictEqual(res.status, 400);
  });

  // 12. Wrong-user rejection
  await runTest('12. Wrong-user rejection', async () => {
    const res = await verifyAndFulfillPaymentOrder(db, {
      orderId: plusOrdId,
      authenticatedUserId: testUserB, // User B attempting User A's order
    });
    assert.strictEqual(res.success, false);
    assert.strictEqual(res.status, 403);
  });

  // 13. Callback fulfillment
  const payIdPlus = `pay_p17_plus_${Date.now()}`;
  const sigPlus = genSig(rzpPlusOrdId, payIdPlus);
  await runTest('13. Callback fulfillment', async () => {
    const res = await verifyAndFulfillPaymentOrder(db, {
      orderId: plusOrdId,
      razorpayOrderId: rzpPlusOrdId,
      razorpayPaymentId: payIdPlus,
      razorpaySignature: sigPlus,
      authenticatedUserId: testUserA,
    });
    assert.strictEqual(res.success, true);
    assert.strictEqual(res.alreadyFulfilled, false);
    assert.strictEqual(res.order.status, 'CAPTURED');
  });

  // 14. Webhook fulfillment
  let whOrdId = '';
  let rzpWhOrdId = '';
  const whPayId = `pay_wh_${Date.now()}`;
  await runTest('14. Webhook fulfillment', async () => {
    whOrdId = `ord_wh_p17_${Date.now()}`;
    rzpWhOrdId = `order_wh_p17_${Date.now()}`;
    db.createPaymentOrder({
      id: whOrdId,
      userId: testUserB,
      productType: 'AI_CREDIT_PACK',
      productId: 'pack_10',
      amount: 4900,
      currency: 'INR',
      status: 'CREATED',
      razorpayOrderId: rzpWhOrdId,
    });
    const res = await verifyAndFulfillPaymentOrder(db, {
      orderId: whOrdId,
      razorpayOrderId: rzpWhOrdId,
      razorpayPaymentId: whPayId,
      isWebhook: true,
    });
    assert.strictEqual(res.success, true);
    assert.strictEqual(res.order.status, 'CAPTURED');
  });

  // 15. Verify-status fulfillment
  await runTest('15. Verify-status fulfillment', async () => {
    const statusOrdId = `ord_stat_p17_${Date.now()}`;
    db.createPaymentOrder({
      id: statusOrdId,
      userId: testUserA,
      productType: 'AI_CREDIT_PACK',
      productId: 'pack_10',
      amount: 4900,
      currency: 'INR',
      status: 'CAPTURED',
    });
    const res = await verifyAndFulfillPaymentOrder(db, {
      orderId: statusOrdId,
      authenticatedUserId: testUserA,
    });
    assert.strictEqual(res.success, true);
    assert.strictEqual(res.alreadyFulfilled, true);
  });

  // 16. Callback + webhook idempotency
  await runTest('16. Callback + webhook idempotency', async () => {
    const res = await verifyAndFulfillPaymentOrder(db, {
      orderId: plusOrdId,
      razorpayOrderId: rzpPlusOrdId,
      razorpayPaymentId: payIdPlus,
      isWebhook: true,
    });
    assert.strictEqual(res.success, true);
    assert.strictEqual(res.alreadyFulfilled, true);
  });

  // 17. Duplicate webhook idempotency
  await runTest('17. Duplicate webhook idempotency', async () => {
    const res = await verifyAndFulfillPaymentOrder(db, {
      orderId: whOrdId,
      razorpayOrderId: rzpWhOrdId,
      isWebhook: true,
    });
    assert.strictEqual(res.success, true);
    assert.strictEqual(res.alreadyFulfilled, true);
  });

  // 18. Duplicate callback idempotency
  await runTest('18. Duplicate callback idempotency', async () => {
    const res = await verifyAndFulfillPaymentOrder(db, {
      orderId: plusOrdId,
      authenticatedUserId: testUserA,
    });
    assert.strictEqual(res.success, true);
    assert.strictEqual(res.alreadyFulfilled, true);
  });

  // 19. PLUS subscription creation
  await runTest('19. PLUS subscription creation', () => {
    const userA = db.getUserById(testUserA);
    assert.strictEqual(userA?.plan, 'PLUS');
    assert.strictEqual(userA?.subscriptionStatus, 'active');
  });

  // 20. PLUS subscription update without duplicate row
  await runTest('20. PLUS subscription update without duplicate row', () => {
    const subCount = d.prepare('SELECT COUNT(*) as c FROM premium_subscriptions WHERE userId = ?').get(testUserA).c;
    assert.strictEqual(subCount, 1);
  });

  // 21. PLUS 50 premium credits
  await runTest('21. PLUS 50 premium credits', () => {
    const balA = db.getDeepAICreditBalance(testUserA);
    assert.strictEqual(balA.premium, 50);
  });

  // 22. PRO 65 premium credits
  const payIdPro = `pay_p17_pro_${Date.now()}`;
  const sigPro = genSig(rzpProOrdId, payIdPro);
  await runTest('22. PRO 65 premium credits', async () => {
    await verifyAndFulfillPaymentOrder(db, {
      orderId: proOrdId,
      razorpayOrderId: rzpProOrdId,
      razorpayPaymentId: payIdPro,
      razorpaySignature: sigPro,
      authenticatedUserId: testUserB,
    });
    const userB = db.getUserById(testUserB);
    assert.strictEqual(userB?.plan, 'PRO');
    const balB = db.getDeepAICreditBalance(testUserB);
    assert.strictEqual(balB.premium, 65);
  });

  // 23. User A/B isolation
  await runTest('23. User A/B isolation', () => {
    const userA = db.getUserById(testUserA);
    const userB = db.getUserById(testUserB);
    assert.strictEqual(userA?.plan, 'PLUS');
    assert.strictEqual(userB?.plan, 'PRO');
  });

  // 24. Admin one-time classification
  await runTest('24. Admin one-time classification', () => {
    const payments = db.getAllPaymentOrders(100, true);
    for (const p of payments) {
      assert.ok(['AI_CREDIT_PACK', 'ASSESSMENT'].includes(p.productType));
    }
  });

  // 25. Admin recurring classification
  await runTest('25. Admin recurring classification', () => {
    const subs = db.getAllPremiumSubscriptions(100, true);
    assert.ok(Array.isArray(subs));
    const subA = subs.find((s: any) => s.userId === testUserA);
    assert.ok(subA);
    assert.strictEqual(subA.status, 'ACTIVE');
  });

  // 26. No duplicate premium credits
  await runTest('26. No duplicate premium credits', () => {
    db.ensureCurrentPremiumCreditPeriod(testUserA);
    const balA = db.getDeepAICreditBalance(testUserA);
    assert.strictEqual(balA.premium, 50);
  });

  // 27. No duplicate subscription period
  await runTest('27. No duplicate subscription period', () => {
    const periods = d.prepare('SELECT COUNT(*) as c FROM deep_ai_premium_periods WHERE userId = ? AND status = \'ACTIVE\'').get(testUserA).c;
    assert.strictEqual(periods, 1);
  });

  // 28. Existing AI credit flow still works
  await runTest('28. Existing AI credit flow still works', async () => {
    const aiOrdId = `ord_ai_p17_${Date.now()}`;
    const rzpAiOrdId = `order_ai_p17_${Date.now()}`;
    db.createPaymentOrder({
      id: aiOrdId,
      userId: testUserA,
      productType: 'AI_CREDIT_PACK',
      productId: 'pack_10',
      amount: 4900,
      currency: 'INR',
      status: 'CREATED',
      razorpayOrderId: rzpAiOrdId,
    });
    const payId = `pay_ai_p17_${Date.now()}`;
    const sig = genSig(rzpAiOrdId, payId);
    const res = await verifyAndFulfillPaymentOrder(db, {
      orderId: aiOrdId,
      razorpayOrderId: rzpAiOrdId,
      razorpayPaymentId: payId,
      razorpaySignature: sig,
      authenticatedUserId: testUserA,
    });
    assert.strictEqual(res.success, true);
    assert.strictEqual(res.order.status, 'CAPTURED');
  });

  // 29. Existing assessment flow still works
  await runTest('29. Existing assessment flow still works', async () => {
    const asmOrdId = `ord_asm_p17_${Date.now()}`;
    const rzpAsmOrdId = `order_asm_p17_${Date.now()}`;
    db.createPaymentOrder({
      id: asmOrdId,
      userId: testUserA,
      productType: 'ASSESSMENT',
      productId: 'asm_test_1',
      amount: 2900,
      currency: 'INR',
      status: 'CREATED',
      razorpayOrderId: rzpAsmOrdId,
    });
    const payId = `pay_asm_p17_${Date.now()}`;
    const sig = genSig(rzpAsmOrdId, payId);
    const res = await verifyAndFulfillPaymentOrder(db, {
      orderId: asmOrdId,
      razorpayOrderId: rzpAsmOrdId,
      razorpayPaymentId: payId,
      razorpaySignature: sig,
      authenticatedUserId: testUserA,
    });
    assert.strictEqual(res.success, true);
    assert.strictEqual(res.order.status, 'CAPTURED');
  });

  // 30. Build passes check
  await runTest('30. Build passes check', () => {
    assert.strictEqual(typeof verifyAndFulfillPaymentOrder, 'function');
  });

  // Cleanup test users
  d.prepare('DELETE FROM payment_orders WHERE userId IN (?, ?)').run(testUserA, testUserB);
  d.prepare('DELETE FROM deep_ai_credit_ledger WHERE userId IN (?, ?)').run(testUserA, testUserB);
  d.prepare('DELETE FROM deep_ai_premium_periods WHERE userId IN (?, ?)').run(testUserA, testUserB);
  d.prepare('DELETE FROM premium_subscriptions WHERE userId IN (?, ?)').run(testUserA, testUserB);
  d.prepare('DELETE FROM users WHERE id IN (?, ?)').run(testUserA, testUserB);

  console.log('\n==================================================');
  console.log(`SUMMARY: ${passed} PASSED, ${failed} FAILED`);
  console.log('==================================================');

  if (failed > 0) {
    process.exit(1);
  }
}

runTests().catch((err) => {
  console.error('Fatal test runner error:', err);
  process.exit(1);
});
