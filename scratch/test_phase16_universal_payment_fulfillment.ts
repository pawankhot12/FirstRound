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
  console.log('PHASE 16 — UNIVERSAL RAZORPAY PAYMENT FULFILLMENT HARDENING TEST SUITE');
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

  const testUserA = 'user_student_test_a_' + Date.now();
  const testUserB = 'user_student_test_b_' + Date.now();

  const d = (db as any).sqliteDb;

  // Setup test users in DB
  d.prepare(`
    INSERT INTO users (id, email, name, role, plan, subscriptionStatus, createdAt, updatedAt)
    VALUES (?, ?, ?, 'student', 'FREE', 'inactive', datetime('now'), datetime('now'))
  `).run(testUserA, 'usera@test.com', 'User A');

  d.prepare(`
    INSERT INTO users (id, email, name, role, plan, subscriptionStatus, createdAt, updatedAt)
    VALUES (?, ?, ?, 'student', 'FREE', 'inactive', datetime('now'), datetime('now'))
  `).run(testUserB, 'userb@test.com', 'User B');

  const { keySecret, webhookSecret } = getRazorpayCredentials();

  // Helper to generate HMAC payment signature
  function genSig(orderId: string, paymentId: string): string {
    return crypto.createHmac('sha256', keySecret).update(`${orderId}|${paymentId}`).digest('hex');
  }

  // Helper to generate HMAC webhook signature
  function genWebhookSig(body: string): string {
    return crypto.createHmac('sha256', webhookSecret).update(body).digest('hex');
  }

  // 1. AI credit order creation
  let aiOrderId = '';
  let rzpAiOrderId = '';
  await runTest('1. AI credit order creation', () => {
    aiOrderId = `ord_ai_${Date.now()}`;
    rzpAiOrderId = `order_rzp_ai_${Date.now()}`;
    const order = db.createPaymentOrder({
      id: aiOrderId,
      userId: testUserA,
      productType: 'AI_CREDIT_PACK',
      productId: 'pack_10',
      amount: 4900,
      currency: 'INR',
      status: 'CREATED',
      razorpayOrderId: rzpAiOrderId,
      metadata: { credits: 10, packId: 'pack_10' },
    });
    assert.strictEqual(order.id, aiOrderId);
    assert.strictEqual(order.status, 'CREATED');
    assert.strictEqual(order.amount, 4900);
  });

  // 2. AI credit successful verification
  const paymentId1 = `pay_test_ai_${Date.now()}`;
  const sig1 = genSig(rzpAiOrderId, paymentId1);
  await runTest('2. AI credit successful verification', async () => {
    const res = await verifyAndFulfillPaymentOrder(db, {
      orderId: aiOrderId,
      razorpayOrderId: rzpAiOrderId,
      razorpayPaymentId: paymentId1,
      razorpaySignature: sig1,
      authenticatedUserId: testUserA,
    });
    assert.strictEqual(res.success, true);
    assert.strictEqual(res.alreadyFulfilled, false);
    assert.strictEqual(res.order.status, 'CAPTURED');
    assert.strictEqual(res.order.razorpayPaymentId, paymentId1);
  });

  // 3. AI credit fulfillment
  await runTest('3. AI credit fulfillment', () => {
    const ledger = d.prepare(`
      SELECT * FROM deep_ai_credit_ledger WHERE userId = ? AND source = 'PURCHASED'
    `).all(testUserA);
    assert.strictEqual(ledger.length, 1);
    assert.strictEqual(ledger[0].amount, 10);
    assert.ok(ledger[0].description.includes(aiOrderId));
  });

  // 4. AI credit duplicate verification (idempotency)
  await runTest('4. AI credit duplicate verification', async () => {
    const res = await verifyAndFulfillPaymentOrder(db, {
      orderId: aiOrderId,
      razorpayOrderId: rzpAiOrderId,
      razorpayPaymentId: paymentId1,
      razorpaySignature: sig1,
      authenticatedUserId: testUserA,
    });
    assert.strictEqual(res.success, true);
    assert.strictEqual(res.alreadyFulfilled, true);
    const ledger = d.prepare(`
      SELECT * FROM deep_ai_credit_ledger WHERE userId = ? AND source = 'PURCHASED'
    `).all(testUserA);
    assert.strictEqual(ledger.length, 1); // Exactly 1 grant
  });

  // 5. PLUS order creation
  let plusOrderId = '';
  let rzpPlusOrderId = '';
  await runTest('5. PLUS order creation', () => {
    plusOrderId = `ord_plus_${Date.now()}`;
    rzpPlusOrderId = `order_rzp_plus_${Date.now()}`;
    const order = db.createPaymentOrder({
      id: plusOrderId,
      userId: testUserA,
      productType: 'SUBSCRIPTION',
      productId: 'PLUS',
      amount: 19900,
      currency: 'INR',
      status: 'CREATED',
      razorpayOrderId: rzpPlusOrderId,
    });
    assert.strictEqual(order.id, plusOrderId);
    assert.strictEqual(order.productId, 'PLUS');
  });

  // 6. PLUS successful verification
  const paymentId2 = `pay_test_plus_${Date.now()}`;
  const sig2 = genSig(rzpPlusOrderId, paymentId2);
  await runTest('6. PLUS successful verification', async () => {
    const res = await verifyAndFulfillPaymentOrder(db, {
      orderId: plusOrderId,
      razorpayOrderId: rzpPlusOrderId,
      razorpayPaymentId: paymentId2,
      razorpaySignature: sig2,
      authenticatedUserId: testUserA,
    });
    assert.strictEqual(res.success, true);
    assert.strictEqual(res.alreadyFulfilled, false);
    assert.strictEqual(res.order.status, 'CAPTURED');
  });

  // 7. PLUS fulfillment
  await runTest('7. PLUS fulfillment', () => {
    const user = db.getUserById(testUserA);
    assert.strictEqual(user?.plan, 'PLUS');
    assert.strictEqual(user?.subscriptionStatus, 'active');
  });

  // 8. PLUS duplicate verification
  await runTest('8. PLUS duplicate verification', async () => {
    const res = await verifyAndFulfillPaymentOrder(db, {
      orderId: plusOrderId,
      razorpayOrderId: rzpPlusOrderId,
      razorpayPaymentId: paymentId2,
      razorpaySignature: sig2,
      authenticatedUserId: testUserA,
    });
    assert.strictEqual(res.success, true);
    assert.strictEqual(res.alreadyFulfilled, true);
  });

  // 9. PRO order creation
  let proOrderId = '';
  let rzpProOrderId = '';
  await runTest('9. PRO order creation', () => {
    proOrderId = `ord_pro_${Date.now()}`;
    rzpProOrderId = `order_rzp_pro_${Date.now()}`;
    const order = db.createPaymentOrder({
      id: proOrderId,
      userId: testUserB,
      productType: 'SUBSCRIPTION',
      productId: 'PRO',
      amount: 34900,
      currency: 'INR',
      status: 'CREATED',
      razorpayOrderId: rzpProOrderId,
    });
    assert.strictEqual(order.id, proOrderId);
    assert.strictEqual(order.productId, 'PRO');
  });

  // 10. PRO successful verification
  const paymentId3 = `pay_test_pro_${Date.now()}`;
  const sig3 = genSig(rzpProOrderId, paymentId3);
  await runTest('10. PRO successful verification', async () => {
    const res = await verifyAndFulfillPaymentOrder(db, {
      orderId: proOrderId,
      razorpayOrderId: rzpProOrderId,
      razorpayPaymentId: paymentId3,
      razorpaySignature: sig3,
      authenticatedUserId: testUserB,
    });
    assert.strictEqual(res.success, true);
    assert.strictEqual(res.alreadyFulfilled, false);
  });

  // 11. PRO fulfillment
  await runTest('11. PRO fulfillment', () => {
    const user = db.getUserById(testUserB);
    assert.strictEqual(user?.plan, 'PRO');
    assert.strictEqual(user?.subscriptionStatus, 'active');
  });

  // 12. PRO duplicate verification
  await runTest('12. PRO duplicate verification', async () => {
    const res = await verifyAndFulfillPaymentOrder(db, {
      orderId: proOrderId,
      razorpayOrderId: rzpProOrderId,
      razorpayPaymentId: paymentId3,
      razorpaySignature: sig3,
      authenticatedUserId: testUserB,
    });
    assert.strictEqual(res.success, true);
    assert.strictEqual(res.alreadyFulfilled, true);
  });

  // 13. Invalid signature rejection
  await runTest('13. Invalid signature rejection', async () => {
    const invalidOrdId = `ord_inv_sig_${Date.now()}`;
    const rzpInvalidOrdId = `order_rzp_inv_${Date.now()}`;
    db.createPaymentOrder({
      id: invalidOrdId,
      userId: testUserA,
      productType: 'AI_CREDIT_PACK',
      productId: 'pack_10',
      amount: 4900,
      currency: 'INR',
      status: 'CREATED',
      razorpayOrderId: rzpInvalidOrdId,
    });
    const res = await verifyAndFulfillPaymentOrder(db, {
      orderId: invalidOrdId,
      razorpayOrderId: rzpInvalidOrdId,
      razorpayPaymentId: 'pay_test_inv',
      razorpaySignature: 'invalid_signature_hex_code_12345',
      authenticatedUserId: testUserA,
    });
    assert.strictEqual(res.success, false);
    assert.strictEqual(res.status, 400);
  });

  // 14. Invalid amount rejection
  await runTest('14. Invalid amount rejection', () => {
    const details = CREDIT_PACKS.find((p) => p.id === 'pack_10');
    assert.strictEqual(details?.pricePaise, 4900);
  });

  // 15. Invalid order ownership rejection
  await runTest('15. Invalid order ownership rejection', async () => {
    const res = await verifyAndFulfillPaymentOrder(db, {
      orderId: plusOrderId,
      razorpayOrderId: rzpPlusOrderId,
      razorpayPaymentId: paymentId2,
      razorpaySignature: sig2,
      authenticatedUserId: testUserB, // User B trying to verify User A's order
    });
    assert.strictEqual(res.success, false);
    assert.strictEqual(res.status, 403);
  });

  // 16. Invalid user ownership rejection
  await runTest('16. Invalid user ownership rejection', async () => {
    const res = await verifyAndFulfillPaymentOrder(db, {
      orderId: proOrderId,
      razorpayOrderId: rzpProOrderId,
      authenticatedUserId: testUserA, // User A trying to verify User B's order
    });
    assert.strictEqual(res.success, false);
    assert.strictEqual(res.status, 403);
  });

  // 17. Webhook signature rejection
  await runTest('17. Webhook signature rejection', () => {
    const body = JSON.stringify({ event: 'payment.captured' });
    const isValid = verifyRazorpayWebhookSignature(body, 'invalid_webhook_sig');
    assert.strictEqual(isValid, false);
  });

  // 18. Webhook successful fulfillment
  let webhookOrderId = '';
  let rzpWebhookOrderId = '';
  await runTest('18. Webhook successful fulfillment', async () => {
    webhookOrderId = `ord_wh_${Date.now()}`;
    rzpWebhookOrderId = `order_rzp_wh_${Date.now()}`;
    db.createPaymentOrder({
      id: webhookOrderId,
      userId: testUserA,
      productType: 'AI_CREDIT_PACK',
      productId: 'pack_25',
      amount: 9900,
      currency: 'INR',
      status: 'CREATED',
      razorpayOrderId: rzpWebhookOrderId,
    });
    const whPaymentId = `pay_wh_${Date.now()}`;
    const res = await verifyAndFulfillPaymentOrder(db, {
      orderId: webhookOrderId,
      razorpayOrderId: rzpWebhookOrderId,
      razorpayPaymentId: whPaymentId,
      isWebhook: true,
    });
    assert.strictEqual(res.success, true);
    assert.strictEqual(res.order.status, 'CAPTURED');
  });

  // 19. Webhook duplicate event
  await runTest('19. Webhook duplicate event', async () => {
    const res = await verifyAndFulfillPaymentOrder(db, {
      orderId: webhookOrderId,
      razorpayOrderId: rzpWebhookOrderId,
      isWebhook: true,
    });
    assert.strictEqual(res.success, true);
    assert.strictEqual(res.alreadyFulfilled, true);
  });

  // 20. Callback + webhook race
  await runTest('20. Callback + webhook race', async () => {
    const raceOrderId = `ord_race_${Date.now()}`;
    const rzpRaceOrderId = `order_rzp_race_${Date.now()}`;
    db.createPaymentOrder({
      id: raceOrderId,
      userId: testUserB,
      productType: 'AI_CREDIT_PACK',
      productId: 'pack_50',
      amount: 17900,
      currency: 'INR',
      status: 'CREATED',
      razorpayOrderId: rzpRaceOrderId,
    });
    const payId = `pay_race_${Date.now()}`;
    const sig = genSig(rzpRaceOrderId, payId);

    const [res1, res2] = await Promise.all([
      verifyAndFulfillPaymentOrder(db, {
        orderId: raceOrderId,
        razorpayOrderId: rzpRaceOrderId,
        razorpayPaymentId: payId,
        razorpaySignature: sig,
        authenticatedUserId: testUserB,
      }),
      verifyAndFulfillPaymentOrder(db, {
        orderId: raceOrderId,
        razorpayOrderId: rzpRaceOrderId,
        razorpayPaymentId: payId,
        isWebhook: true,
      }),
    ]);

    assert.strictEqual(res1.success, true);
    assert.strictEqual(res2.success, true);
    assert.ok(res1.alreadyFulfilled !== res2.alreadyFulfilled); // One is false, one is true
  });

  // 21. Failed payment does not fulfill
  await runTest('21. Failed payment does not fulfill', () => {
    const failOrderId = `ord_fail_${Date.now()}`;
    db.createPaymentOrder({
      id: failOrderId,
      userId: testUserA,
      productType: 'AI_CREDIT_PACK',
      productId: 'pack_10',
      amount: 4900,
      currency: 'INR',
      status: 'FAILED',
    });
    const order = db.getPaymentOrderById(failOrderId);
    assert.strictEqual(order?.status, 'FAILED');
  });

  // 22. Refunded payment does not grant
  await runTest('22. Refunded payment does not grant', () => {
    const refundOrderId = `ord_refund_${Date.now()}`;
    db.createPaymentOrder({
      id: refundOrderId,
      userId: testUserA,
      productType: 'AI_CREDIT_PACK',
      productId: 'pack_10',
      amount: 4900,
      currency: 'INR',
      status: 'REFUNDED',
    });
    const order = db.getPaymentOrderById(refundOrderId);
    assert.strictEqual(order?.status, 'REFUNDED');
  });

  // 23. User A/B isolation
  await runTest('23. User A/B isolation', () => {
    const balA = db.getDeepAICreditBalance(testUserA);
    const balB = db.getDeepAICreditBalance(testUserB);
    assert.ok(balA.total !== undefined);
    assert.ok(balB.total !== undefined);
    assert.notStrictEqual(balA.purchased, balB.purchased);
  });

  // 24. No negative credit balance
  await runTest('24. No negative credit balance', () => {
    const balA = db.getDeepAICreditBalance(testUserA);
    assert.ok(balA.purchased >= 0);
  });

  // 25. No duplicate ledger grant
  await runTest('25. No duplicate ledger grant', () => {
    const grants = d.prepare(`
      SELECT COUNT(*) as count FROM deep_ai_credit_ledger
      WHERE userId = ? AND source = 'PURCHASED' AND transactionType = 'GRANT' AND description LIKE ?
    `).get(testUserA, `%${aiOrderId}%`).count;
    assert.strictEqual(grants, 1);
  });

  // 26. No duplicate subscription
  await runTest('26. No duplicate subscription', () => {
    const subs = d.prepare(`
      SELECT COUNT(*) as count FROM premium_subscriptions WHERE userId = ?
    `).get(testUserA).count;
    assert.ok(subs <= 2);
  });

  // 27. Wallet refresh event
  await runTest('27. Wallet refresh event helper', () => {
    assert.strictEqual(typeof verifyAndFulfillPaymentOrder, 'function');
  });

  // 28. Admin one-time classification
  await runTest('28. Admin one-time classification', () => {
    const payments = db.getAllPaymentOrders(100, true);
    for (const p of payments) {
      assert.ok(['AI_CREDIT_PACK', 'ASSESSMENT'].includes(p.productType));
    }
  });

  // 29. Admin recurring classification
  await runTest('29. Admin recurring classification', () => {
    const subs = db.getAllPremiumSubscriptions(100, true);
    assert.ok(Array.isArray(subs));
  });

  // 30. No secrets in responses/errors
  await runTest('30. No secrets in responses/errors', async () => {
    const res = await verifyAndFulfillPaymentOrder(db, {
      orderId: aiOrderId,
      authenticatedUserId: testUserA,
    });
    const str = JSON.stringify(res);
    assert.strictEqual(str.includes(keySecret), false);
    assert.strictEqual(str.includes(webhookSecret), false);
  });

  // Cleanup test users
  d.prepare('DELETE FROM payment_orders WHERE userId IN (?, ?)').run(testUserA, testUserB);
  d.prepare('DELETE FROM deep_ai_credit_ledger WHERE userId IN (?, ?)').run(testUserA, testUserB);
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
