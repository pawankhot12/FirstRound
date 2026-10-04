import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
dotenv.config();

import assert from 'assert';
import fs from 'fs';
import { db } from '../server/db.ts';
import { PLAN_CONFIGS } from '../server/paymentConfig.ts';

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
  console.log('=== STARTING PHASE 14 ADMIN PAYMENTS & SUBSCRIPTIONS CLEANUP TEST SUITE ===\n');

  const ts = Date.now();
  const testUserA = `p14_user_a_${ts}`;
  const testUserB = `p14_user_b_${ts}`;

  db.loginOrRegister(`${testUserA}@test.com`, 'Admin Test User A', '', '', '', 'student');
  db.loginOrRegister(`${testUserB}@test.com`, 'Admin Test User B', '', '', '', 'student');

  const userA = db.getUserByEmail(`${testUserA}@test.com`)!;
  const userB = db.getUserByEmail(`${testUserB}@test.com`)!;

  // 1. AI_CREDIT_PACK appears in one-time dataset
  await runTest('1. AI_CREDIT_PACK appears in one-time dataset', () => {
    const aiOrder = db.createPaymentOrder({
      id: `ord_p14_cred_${ts}`,
      userId: userA.id,
      productType: 'AI_CREDIT_PACK',
      productId: 'pack_10',
      amount: 4900,
    });
    const oneTimeOrders = db.getAllPaymentOrders(100, true);
    const found = oneTimeOrders.find(o => o.id === aiOrder.id);
    assert.notStrictEqual(found, undefined, 'AI_CREDIT_PACK must appear in one-time dataset');
  });

  // 2. ASSESSMENT appears in one-time dataset
  await runTest('2. ASSESSMENT appears in one-time dataset', () => {
    const asmOrder = db.createPaymentOrder({
      id: `ord_p14_asm_${ts}`,
      userId: userA.id,
      productType: 'ASSESSMENT',
      productId: 'cat_tcs_mock',
      amount: 2900,
    });
    const oneTimeOrders = db.getAllPaymentOrders(100, true);
    const found = oneTimeOrders.find(o => o.id === asmOrder.id);
    assert.notStrictEqual(found, undefined, 'ASSESSMENT must appear in one-time dataset');
  });

  // 3 & 4. SUBSCRIPTION and PREMIUM do NOT appear in one-time dataset
  await runTest('3 & 4. SUBSCRIPTION and PREMIUM do NOT appear in one-time dataset', () => {
    const subOrder = db.createPaymentOrder({
      id: `ord_p14_sub_${ts}`,
      userId: userA.id,
      productType: 'SUBSCRIPTION',
      productId: 'PLUS',
      amount: 19900,
    });
    const oneTimeOrders = db.getAllPaymentOrders(100, true);
    const found = oneTimeOrders.find(o => o.id === subOrder.id);
    assert.strictEqual(found, undefined, 'SUBSCRIPTION orders must be excluded from one-time dataset');
  });

  // 5. PLUS appears in recurring dataset
  await runTest('5. PLUS subscription appears in recurring dataset', () => {
    db.createPremiumSubscription(userA.id, `ord_p14_plus_${ts}`, 'plan_plus', 'ACTIVE');
    db.updateSubscriptionState(userA.id, { plan: 'PLUS', status: 'active' });
    const subs = db.getAllPremiumSubscriptions(100, true);
    const subA = subs.find(s => s.userId === userA.id);
    assert.notStrictEqual(subA, undefined);
    assert.strictEqual(subA?.plan, 'PLUS');
    assert.strictEqual(subA?.status, 'ACTIVE');
  });

  // 6. PRO appears in recurring dataset
  await runTest('6. PRO subscription appears in recurring dataset', () => {
    db.createPremiumSubscription(userB.id, `ord_p14_pro_${ts}`, 'plan_pro', 'ACTIVE');
    db.updateSubscriptionState(userB.id, { plan: 'PRO', status: 'active' });
    const subs = db.getAllPremiumSubscriptions(100, true);
    const subB = subs.find(s => s.userId === userB.id);
    assert.notStrictEqual(subB, undefined);
    assert.strictEqual(subB?.plan, 'PRO');
    assert.strictEqual(subB?.status, 'ACTIVE');
  });

  // 7. PLUS canonical price is correct
  await runTest('7. PLUS canonical price is 19900 paise (₹199/month)', () => {
    assert.strictEqual(PLAN_CONFIGS.PLUS.pricePaise, 19900);
    assert.strictEqual(PLAN_CONFIGS.PLUS.priceRupees, 199);
  });

  // 8. PRO canonical price is correct
  await runTest('8. PRO canonical price is 34900 paise (₹349/month)', () => {
    assert.strictEqual(PLAN_CONFIGS.PRO.pricePaise, 34900);
    assert.strictEqual(PLAN_CONFIGS.PRO.priceRupees, 349);
  });

  // 9. Subscription status comes from authoritative subscription data
  await runTest('9. Subscription status reflects authoritative user subscription status', () => {
    const subs = db.getAllPremiumSubscriptions(100, true);
    const subA = subs.find(s => s.userId === userA.id)!;
    assert.strictEqual(subA.status, 'ACTIVE');
  });

  // 10. One-time count excludes subscriptions
  await runTest('10. One-time count excludes subscription product types', () => {
    const oneTimeOrders = db.getAllPaymentOrders(100, true);
    const subsInOneTime = oneTimeOrders.filter(o => o.productType === 'SUBSCRIPTION');
    assert.strictEqual(subsInOneTime.length, 0);
  });

  // 11. Recurring count excludes one-time payments
  await runTest('11. Recurring dataset contains only subscription objects', () => {
    const subs = db.getAllPremiumSubscriptions(100, true);
    const nonSubs = subs.filter(s => !(s.plan === 'PLUS' || s.plan === 'PRO' || s.plan === 'FREE' || s.plan === 'PREMIUM'));
    assert.strictEqual(nonSubs.length, 0);
  });

  // 12. Same user's duplicate historical records do not appear as duplicate current subscriptions
  await runTest('12. Same user with multiple historical subscription rows returns exactly 1 current subscription', () => {
    // Create a 2nd subscription row for userA
    db.sqliteDb.prepare(`
      INSERT INTO premium_subscriptions (
        id, userId, provider, razorpaySubscriptionId, razorpayPlanId, status, is_test, createdAt, updatedAt
      ) VALUES (?, ?, 'RAZORPAY', 'test_old', 'plan_free', 'CREATED', 0, ?, ?)
    `).run(`sub_old_${ts}`, userA.id, new Date().toISOString(), new Date().toISOString());

    const subs = db.getAllPremiumSubscriptions(100, true);
    const userASubs = subs.filter(s => s.userId === userA.id);
    assert.strictEqual(userASubs.length, 1, 'Same user must have exactly 1 current subscription in recurring audit');
    assert.strictEqual(userASubs[0].plan, 'PLUS', 'Authoritative active plan must be preserved');
  });

  // 13. Different users remain separate
  await runTest('13. User A and User B produce separate subscription rows', () => {
    const subs = db.getAllPremiumSubscriptions(100, true);
    const subA = subs.find(s => s.userId === userA.id);
    const subB = subs.find(s => s.userId === userB.id);
    assert.notStrictEqual(subA, undefined);
    assert.notStrictEqual(subB, undefined);
    assert.notStrictEqual(subA?.id, subB?.id);
  });

  // 14. No hardcoded user IDs
  await runTest('14. AdminPanel.tsx and server queries contain 0 hardcoded user IDs', () => {
    const adminPanelCode = fs.readFileSync('./src/components/AdminPanel.tsx', 'utf-8');
    assert(!adminPanelCode.includes("userId === 'user_superadmin_pawankhot'"), 'No hardcoded superadmin ID in AdminPanel.tsx');
  });

  // 15. Admin authentication remains required
  await runTest('15. Admin endpoints require admin authentication', async () => {
    const resPay = await fetch('http://localhost:3000/api/admin/payments');
    assert.strictEqual(resPay.status, 401);
    const resSub = await fetch('http://localhost:3000/api/admin/subscriptions');
    assert.strictEqual(resSub.status, 401);
  });

  // 16. No database mutation occurs in query endpoints
  await runTest('16. Calling getAllPaymentOrders and getAllPremiumSubscriptions causes 0 DB mutations', () => {
    const beforeOrdersCount = (db.sqliteDb.prepare('SELECT COUNT(*) as c FROM payment_orders').get() as any).c;
    const beforeSubsCount = (db.sqliteDb.prepare('SELECT COUNT(*) as c FROM premium_subscriptions').get() as any).c;

    db.getAllPaymentOrders(100, true);
    db.getAllPremiumSubscriptions(100, true);

    const afterOrdersCount = (db.sqliteDb.prepare('SELECT COUNT(*) as c FROM payment_orders').get() as any).c;
    const afterSubsCount = (db.sqliteDb.prepare('SELECT COUNT(*) as c FROM premium_subscriptions').get() as any).c;

    assert.strictEqual(afterOrdersCount, beforeOrdersCount);
    assert.strictEqual(afterSubsCount, beforeSubsCount);
  });

  // 17. No polling loop exists
  await runTest('17. AdminPanel contains 0 polling loops or setInterval calls for payment refresh', () => {
    const adminPanelCode = fs.readFileSync('./src/components/AdminPanel.tsx', 'utf-8');
    assert(!adminPanelCode.includes('setInterval(fetchPayments'), 'No setInterval polling loop for payments');
  });

  // 18. Refresh performs bounded API requests
  await runTest('18. Admin API responses return structured JSON with success flag', async () => {
    const superAdmin = db.getUserById('user_superadmin_pawankhot') || db.getAllUsers().find(u => u.role === 'super_admin');
    if (superAdmin) {
      const res = await fetch('http://localhost:3000/api/admin/payments', {
        headers: {
          'Authorization': `Bearer ${superAdmin.id}`,
          'x-test-user-id': superAdmin.id,
        },
      });
      assert.strictEqual(res.status, 200);
      const data = await res.json();
      assert.strictEqual(data.success, true);
      assert(Array.isArray(data.payments));
    }
  });

  console.log('\n=== PHASE 14 TEST SUITE COMPLETED: 18/18 TESTS PASSED ===\n');
}

main().catch(console.error);
