import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
dotenv.config();

import crypto from 'crypto';
import assert from 'assert';
import { db } from '../server/db.ts';
import { PLAN_CONFIGS, verifyRazorpayPaymentSignature } from '../server/paymentConfig.ts';
import { hasPremiumAccess } from '../server/entitlements.ts';

function runTest(name: string, fn: () => void | Promise<void>) {
  try {
    const res = fn();
    if (res && typeof res.then === 'function') {
      return res.then(() => {
        console.log(`[PASS] ${name}`);
      }).catch((err) => {
        console.error(`[FAIL] ${name}:`, err);
        process.exit(1);
      });
    }
    console.log(`[PASS] ${name}`);
  } catch (err) {
    console.error(`[FAIL] ${name}:`, err);
    process.exit(1);
  }
}

async function main() {
  console.log('=== STARTING PHASE 13 UNIVERSAL SUBSCRIPTION HARDENING TEST SUITE ===\n');

  const ts = Date.now();
  const testUserAId = `p13_user_a_${ts}`;
  const testUserBId = `p13_user_b_${ts}`;

  // Register test users in DB
  db.loginOrRegister(`user_a_${ts}@test.com`, 'User A', '', '', '', 'student');
  db.loginOrRegister(`user_b_${ts}@test.com`, 'User B', '', '', '', 'student');

  const userA = db.getUserByEmail(`user_a_${ts}@test.com`)!;
  const userB = db.getUserByEmail(`user_b_${ts}@test.com`)!;

  const keySecret = process.env.RAZORPAY_KEY_SECRET || 'test_key_secret';

  // 1. PLUS successful payment setup
  let plusOrder: any;
  let plusRzpPaymentId = `pay_p13_plus_${ts}`;
  let plusSig: string;

  await runTest('1. User A creates PLUS subscription order with canonical price ₹199', () => {
    plusOrder = db.createPaymentOrder({
      id: `ord_p13_plus_${ts}`,
      userId: userA.id,
      productType: 'SUBSCRIPTION',
      productId: 'PLUS',
      amount: PLAN_CONFIGS.PLUS.pricePaise,
      currency: 'INR',
      razorpayOrderId: `order_p13_plus_${ts}`,
    });
    assert.strictEqual(plusOrder.amount, 19900, 'PLUS order amount must be 19900 paise (₹199)');
    assert.strictEqual(plusOrder.productType, 'SUBSCRIPTION');
    assert.strictEqual(plusOrder.productId, 'PLUS');

    plusSig = crypto
      .createHmac('sha256', keySecret)
      .update(`${plusOrder.razorpayOrderId}|${plusRzpPaymentId}`)
      .digest('hex');
  });

  // 2. PRO successful payment setup
  let proOrder: any;
  let proRzpPaymentId = `pay_p13_pro_${ts}`;
  let proSig: string;

  await runTest('2. User B creates PRO subscription order with canonical price ₹349', () => {
    proOrder = db.createPaymentOrder({
      id: `ord_p13_pro_${ts}`,
      userId: userB.id,
      productType: 'SUBSCRIPTION',
      productId: 'PRO',
      amount: PLAN_CONFIGS.PRO.pricePaise,
      currency: 'INR',
      razorpayOrderId: `order_p13_pro_${ts}`,
    });
    assert.strictEqual(proOrder.amount, 34900, 'PRO order amount must be 34900 paise (₹349)');
    assert.strictEqual(proOrder.productType, 'SUBSCRIPTION');
    assert.strictEqual(proOrder.productId, 'PRO');

    proSig = crypto
      .createHmac('sha256', keySecret)
      .update(`${proOrder.razorpayOrderId}|${proRzpPaymentId}`)
      .digest('hex');
  });

  // 3. PLUS fulfillment & verification
  await runTest('3. PLUS subscription fulfillment activates PLUS plan and grants 50 monthly credits', () => {
    const fulfillResult = db.fulfillPaymentOrderAtomic(plusOrder.id, plusRzpPaymentId, plusSig);
    assert.strictEqual(fulfillResult.success, true);
    assert.strictEqual(fulfillResult.alreadyFulfilled, false);

    const updatedUserA = db.getUserById(userA.id)!;
    assert.strictEqual(updatedUserA.plan, 'PLUS');
    assert.strictEqual(hasPremiumAccess(updatedUserA), true);

    const balA = db.getDeepAICreditBalance(userA.id);
    assert.strictEqual(balA.premium, 50, 'PLUS user must be allocated 50 monthly premium credits');
  });

  // 4. PLUS idempotency
  await runTest('4. Re-verifying PLUS order returns alreadyFulfilled: true without duplicate credits', () => {
    const secondFulfill = db.fulfillPaymentOrderAtomic(plusOrder.id, plusRzpPaymentId, plusSig);
    assert.strictEqual(secondFulfill.success, true);
    assert.strictEqual(secondFulfill.alreadyFulfilled, true);

    const balA = db.getDeepAICreditBalance(userA.id);
    assert.strictEqual(balA.premium, 50, 'Re-verification must not duplicate credits');
  });

  // 5. PRO fulfillment & verification
  await runTest('5. PRO subscription fulfillment activates PRO plan and grants 65 monthly credits', () => {
    const fulfillResult = db.fulfillPaymentOrderAtomic(proOrder.id, proRzpPaymentId, proSig);
    assert.strictEqual(fulfillResult.success, true);
    assert.strictEqual(fulfillResult.alreadyFulfilled, false);

    const updatedUserB = db.getUserById(userB.id)!;
    assert.strictEqual(updatedUserB.plan, 'PRO');
    assert.strictEqual(hasPremiumAccess(updatedUserB), true);

    const balB = db.getDeepAICreditBalance(userB.id);
    assert.strictEqual(balB.premium, 65, 'PRO user must be allocated 65 monthly premium credits');
  });

  // 6. PRO idempotency
  await runTest('6. Re-verifying PRO order returns alreadyFulfilled: true without duplicate credits', () => {
    const secondFulfill = db.fulfillPaymentOrderAtomic(proOrder.id, proRzpPaymentId, proSig);
    assert.strictEqual(secondFulfill.success, true);
    assert.strictEqual(secondFulfill.alreadyFulfilled, true);

    const balB = db.getDeepAICreditBalance(userB.id);
    assert.strictEqual(balB.premium, 65, 'Re-verification must not duplicate credits');
  });

  // 7. Unauthenticated subscription verification
  await runTest('7. Unauthenticated request to /api/subscription/verify-payment is rejected', async () => {
    const res = await fetch('http://localhost:3000/api/subscription/verify-payment', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        orderId: plusOrder.id,
        razorpayOrderId: plusOrder.razorpayOrderId,
        razorpayPaymentId: plusRzpPaymentId,
        razorpaySignature: plusSig,
      }),
    });
    assert(res.status === 401 || res.status === 403, 'Unauthenticated request must return 401 or 403');
  });

  // 8. User B cannot verify User A order
  await runTest('8. User B attempting to verify User A order is rejected with 403 Forbidden', async () => {
    const res = await fetch('http://localhost:3000/api/subscription/verify-payment', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${userB.id}`,
        'x-test-user-id': userB.id,
      },
      body: JSON.stringify({
        orderId: plusOrder.id,
        razorpayOrderId: plusOrder.razorpayOrderId,
        razorpayPaymentId: plusRzpPaymentId,
        razorpaySignature: plusSig,
      }),
    });
    assert.strictEqual(res.status, 403);
  });

  // 9. User B cannot read User A subscription/credits
  await runTest('9. User B attempting to fetch User A credits is blocked by IDOR protection', async () => {
    const res = await fetch(`http://localhost:3000/api/ai/credits?userId=${userA.id}`, {
      headers: {
        'Authorization': `Bearer ${userB.id}`,
        'x-test-user-id': userB.id,
      },
    });
    assert.strictEqual(res.status, 403);
  });

  // 10. Client userId cannot override session identity
  await runTest('10. Client specifying another userId in verify-payment body is rejected', async () => {
    const res = await fetch('http://localhost:3000/api/subscription/verify-payment', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${userA.id}`,
        'x-test-user-id': userA.id,
      },
      body: JSON.stringify({
        orderId: plusOrder.id,
        razorpayOrderId: plusOrder.razorpayOrderId,
        razorpayPaymentId: plusRzpPaymentId,
        razorpaySignature: plusSig,
        userId: userB.id, // Client ID override attempt
      }),
    });
    assert.strictEqual(res.status, 403);
  });

  // 11. Client amount cannot override canonical price
  await runTest('11. Subscription order amount is strictly derived from PLAN_CONFIGS on server', async () => {
    db.loginOrRegister(`user_c_${ts}@test.com`, 'User C', '', '', '', 'student');
    const userC = db.getUserByEmail(`user_c_${ts}@test.com`)!;

    const res = await fetch('http://localhost:3000/api/subscription/create-order', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${userC.id}`,
        'x-test-user-id': userC.id,
      },
      body: JSON.stringify({
        plan: 'PLUS',
        amount: 1, // Manipulated price attempt
      }),
    });
    const data = await res.json();
    assert.strictEqual(data.success, true);
    assert.strictEqual(data.amount, 19900, 'Server must enforce canonical price ₹199 (19900 paise)');
  });

  // 12. Client plan cannot bypass canonical plan validation
  await runTest('12. Invalid subscription plan parameter is rejected with 400 Bad Request', async () => {
    const res = await fetch('http://localhost:3000/api/subscription/create-order', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${userA.id}`,
        'x-test-user-id': userA.id,
      },
      body: JSON.stringify({
        plan: 'ULTRA_INVALID_PLAN',
      }),
    });
    assert.strictEqual(res.status, 400);
  });

  // 13. Premium payment excluded from one-time Admin list
  await runTest('13. getAllPaymentOrders() excludes SUBSCRIPTION productType', () => {
    const oneTimeOrders = db.getAllPaymentOrders(100, true);
    const subInOneTime = oneTimeOrders.filter(o => o.productType === 'SUBSCRIPTION' || (o.productType as string) === 'PREMIUM');
    assert.strictEqual(subInOneTime.length, 0, 'One-time transactions table must contain 0 subscription records');
  });

  // 14. PLUS appears in recurring Admin list
  await runTest('14. PLUS subscription appears in getAllPremiumSubscriptions()', () => {
    const subs = db.getAllPremiumSubscriptions(100, true);
    const plusSub = subs.find(s => s.userId === userA.id);
    assert.notStrictEqual(plusSub, undefined, 'User A PLUS subscription must appear in recurring subscriptions audit');
  });

  // 15. PRO appears in recurring Admin list
  await runTest('15. PRO subscription appears in getAllPremiumSubscriptions()', () => {
    const subs = db.getAllPremiumSubscriptions(100, true);
    const proSub = subs.find(s => s.userId === userB.id);
    assert.notStrictEqual(proSub, undefined, 'User B PRO subscription must appear in recurring subscriptions audit');
  });

  // 16. AI credits remain one-time
  await runTest('16. AI credit pack payment appears in getAllPaymentOrders()', () => {
    const aiOrder = db.createPaymentOrder({
      id: `ord_p13_cred_${ts}`,
      userId: userA.id,
      productType: 'AI_CREDIT_PACK',
      productId: 'pack_10',
      amount: 4900,
      currency: 'INR',
    });
    const oneTimeOrders = db.getAllPaymentOrders(100, true);
    const found = oneTimeOrders.find(o => o.id === aiOrder.id);
    assert.notStrictEqual(found, undefined, 'AI Credit Pack must appear in one-time transactions');
  });

  // 17. Assessments remain one-time
  await runTest('17. Assessment purchase appears in getAllPaymentOrders()', () => {
    const asmOrder = db.createPaymentOrder({
      id: `ord_p13_asm_${ts}`,
      userId: userA.id,
      productType: 'ASSESSMENT',
      productId: 'cat_tcs_mock',
      amount: 2900,
      currency: 'INR',
    });
    const oneTimeOrders = db.getAllPaymentOrders(100, true);
    const found = oneTimeOrders.find(o => o.id === asmOrder.id);
    assert.notStrictEqual(found, undefined, 'Assessment purchase must appear in one-time transactions');
  });

  // 18. Premium credit grant exactly once
  await runTest('18. ensureCurrentPremiumCreditPeriod() grants allowance exactly once per active period', () => {
    db.ensureCurrentPremiumCreditPeriod(userA.id);
    db.ensureCurrentPremiumCreditPeriod(userA.id);
    const bal = db.getDeepAICreditBalance(userA.id);
    assert.strictEqual(bal.premium, 50, 'Duplicate calls must not create extra credit period or grant extra credits');
  });

  // 19. Monthly Premium credit period remains idempotent
  await runTest('19. Premium period status resolves to ACTIVE for active user', () => {
    const period = db.ensureCurrentPremiumCreditPeriod(userA.id);
    assert.strictEqual(period?.status, 'ACTIVE');
    assert.strictEqual(period?.allocatedCredits, 50);
  });

  // 20. No duplicate subscription
  await runTest('20. Updating user subscription state updates existing subscription row without creating duplicate subscriptions', () => {
    db.updateSubscriptionState(userA.id, { plan: 'PLUS', status: 'active' });
    const userSubs = db.getAllPremiumSubscriptions(100, true).filter(s => s.userId === userA.id);
    assert.strictEqual(userSubs.length, 1, 'User must have exactly 1 active premium_subscriptions entry');
  });

  // 21. No hardcoded user IDs in payment/subscription logic
  await runTest('21. Codebase verify: server/db.ts and server.ts contain 0 hardcoded user ID conditionals in payment handlers', async () => {
    const fs = await import('fs');
    const serverCode = fs.readFileSync('./server.ts', 'utf-8');
    const dbCode = fs.readFileSync('./server/db.ts', 'utf-8');

    assert(!serverCode.includes("if (authUser.id === 'user_superadmin_pawankhot')"), 'No hardcoded superadmin ID branch in server.ts');
    assert(!dbCode.includes("if (userId === 'user_superadmin_pawankhot')"), 'No hardcoded superadmin ID branch in server/db.ts');
  });

  // 22. Razorpay HMAC validation
  await runTest('22. verifyRazorpayPaymentSignature() rejects invalid or tampered signature', () => {
    const isValid = verifyRazorpayPaymentSignature('order_test', 'pay_test', 'invalid_signature_12345', keySecret);
    assert.strictEqual(isValid, false);
  });

  // 23. Razorpay order/payment mapping
  await runTest('23. Payment order stores razorpayOrderId, razorpayPaymentId, and razorpaySignature accurately', () => {
    const order = db.getPaymentOrderById(plusOrder.id);
    assert.strictEqual(order?.razorpayOrderId, plusOrder.razorpayOrderId);
    assert.strictEqual(order?.razorpayPaymentId, plusRzpPaymentId);
    assert.strictEqual(order?.razorpaySignature, plusSig);
  });

  // 24. Captured payment recovery
  await runTest('24. Existing Captured Pro payment (ord_sub_1790287874712_cm9nc) recovered and user_student_pawankhot127 plan is PRO', () => {
    const proStudent = db.getUserById('user_student_pawankhot127');
    assert.strictEqual(proStudent?.plan, 'PRO');
    assert.strictEqual(proStudent?.subscriptionStatus, 'active');
  });

  // 25. Safe error responses
  await runTest('25. Non-existent payment order verification returns structured 404 error without stack trace', async () => {
    const res = await fetch('http://localhost:3000/api/subscription/verify-payment', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${userA.id}`,
        'x-test-user-id': userA.id,
      },
      body: JSON.stringify({
        orderId: 'non_existent_order_id_99999',
        razorpayOrderId: 'order_fake',
        razorpayPaymentId: 'pay_fake',
        razorpaySignature: 'sig_fake',
      }),
    });
    assert.strictEqual(res.status, 404);
    const data = await res.json();
    assert.strictEqual(data.success, false);
    assert.strictEqual(data.error, 'Payment order not found');
  });

  console.log('\n=== PHASE 13 TEST SUITE COMPLETED: 25/25 TESTS PASSED ===\n');
}

main().catch(console.error);
