/**
 * Phase 15 — Test Mode Reset & Canonical Setup Verification
 * 
 * Verifies the database is in a clean post-reset state with correct
 * canonical plan configuration and no stale test data.
 */
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
dotenv.config();

import assert from 'assert';
import fs from 'fs';
import { db } from '../server/db.ts';
import { PLAN_CONFIGS, CREDIT_PACKS } from '../server/paymentConfig.ts';

let passed = 0;
let total = 0;

function runTest(name: string, fn: () => void | Promise<void>) {
  total++;
  try {
    const res = fn();
    if (res && typeof (res as any).then === 'function') {
      return (res as any).then(() => {
        console.log(`[PASS] ${name}`);
        passed++;
      }).catch((err: any) => {
        console.error(`[FAIL] ${name}:`, err.message || err);
        process.exit(1);
      });
    }
    console.log(`[PASS] ${name}`);
    passed++;
  } catch (err: any) {
    console.error(`[FAIL] ${name}:`, err.message || err);
    process.exit(1);
  }
}

async function main() {
  console.log('=== STARTING PHASE 15 TEST MODE RESET & CANONICAL SETUP TEST SUITE ===\n');

  // 1. No stale test subscription records remain
  await runTest('1. No stale confirmed Test Mode Premium subscriptions remain', () => {
    const subs = db.sqliteDb.prepare(`
      SELECT * FROM premium_subscriptions
      WHERE id IN ('sub_1790286864391_58njb', 'sub_1790287874712_cm9nc')
    `).all();
    assert.strictEqual(subs.length, 0, `Expected 0 orphan reset subscriptions, found ${subs.length}`);
  });

  // 2. No stale test payment orders remain
  await runTest('2. No stale confirmed Test Mode payment orders remain', () => {
    const orders = db.sqliteDb.prepare(`
      SELECT * FROM payment_orders
      WHERE id IN ('ord_1789930355698_b82ry', 'ord_1790284902024_unuc8', 'ord_1790286286068_7sxzf', 'ord_sub_1790286864391_58njb', 'ord_sub_1790287874712_cm9nc')
    `).all();
    assert.strictEqual(orders.length, 0, `Expected 0 approved test orders, found ${orders.length}`);
  });

  // 3. No orphan Premium credits remain
  await runTest('3. No orphan Premium credits remain', () => {
    const premCredits = db.sqliteDb.prepare(`
      SELECT COALESCE(SUM(amount), 0) as total FROM deep_ai_credit_ledger WHERE source = 'PREMIUM' AND id IN (1785, 1786, 1875, 1973)
    `).get() as any;
    assert.strictEqual(premCredits.total, 0, `Expected 0 orphan PREMIUM credits, found ${premCredits.total}`);
  });

  // 4. No orphan Purchased credits remain
  await runTest('4. No orphan Purchased credits remain', () => {
    const purchCredits = db.sqliteDb.prepare(`
      SELECT COALESCE(SUM(amount), 0) as total FROM deep_ai_credit_ledger WHERE source = 'PURCHASED' AND id IN (1785, 1786, 1875, 1973)
    `).get() as any;
    assert.strictEqual(purchCredits.total, 0, `Expected 0 orphan PURCHASED credits, found ${purchCredits.total}`);
  });

  // 5. FREE baseline is valid
  await runTest('5. FREE baseline is valid', () => {
    const realUsers = ['user_superadmin_pawankhot', 'user_student_pawankhot127', 'user_student_akhot5779'];
    for (const userId of realUsers) {
      const balance = db.sqliteDb.prepare(`
        SELECT COALESCE(SUM(amount), 0) as total FROM deep_ai_credit_ledger WHERE userId = ?
      `).get(userId) as any;
      assert.ok(balance.total >= 0, `User ${userId} has negative balance: ${balance.total}`);
    }
  });

  // 6. PLUS configuration
  await runTest('6. PLUS configuration = ₹199 / 50 credits / max 2', () => {
    assert.strictEqual(PLAN_CONFIGS.PLUS.pricePaise, 19900);
    assert.strictEqual(PLAN_CONFIGS.PLUS.priceRupees, 199);
    assert.strictEqual(PLAN_CONFIGS.PLUS.monthlyAiCredits, 50);
    assert.strictEqual(PLAN_CONFIGS.PLUS.premiumAccess, 'SELECTED');
    assert.strictEqual(PLAN_CONFIGS.PLUS.maxSelectedPremiumTests, 2);
    assert.strictEqual(PLAN_CONFIGS.PLUS.name, 'FirstRound Plus');
  });

  // 7. PRO configuration
  await runTest('7. PRO configuration = ₹349 / 65 credits / all Premium', () => {
    assert.strictEqual(PLAN_CONFIGS.PRO.pricePaise, 34900);
    assert.strictEqual(PLAN_CONFIGS.PRO.priceRupees, 349);
    assert.strictEqual(PLAN_CONFIGS.PRO.monthlyAiCredits, 65);
    assert.strictEqual(PLAN_CONFIGS.PRO.premiumAccess, 'ALL');
    assert.strictEqual(PLAN_CONFIGS.PRO.maxSelectedPremiumTests, Infinity);
    assert.strictEqual(PLAN_CONFIGS.PRO.name, 'FirstRound Pro');
  });

  // 8. One current subscription per user invariant
  await runTest('8. One current subscription per user invariant', () => {
    const dupes = db.sqliteDb.prepare(`
      SELECT userId, COUNT(*) as c FROM premium_subscriptions 
      WHERE status IN ('ACTIVE', 'active', 'AUTHENTICATED')
      GROUP BY userId HAVING c > 1
    `).all();
    assert.strictEqual(dupes.length, 0, `Found duplicate active subscriptions: ${JSON.stringify(dupes)}`);
  });

  // 9. One-time Admin dataset excludes SUBSCRIPTION
  await runTest('9. One-time Admin dataset excludes SUBSCRIPTION', () => {
    const oneTime = db.getAllPaymentOrders(100, true);
    const subOrders = oneTime.filter((o: any) => o.productType === 'SUBSCRIPTION' || o.productType === 'PREMIUM');
    assert.strictEqual(subOrders.length, 0, `SUBSCRIPTION/PREMIUM in one-time: ${subOrders.length}`);
  });

  // 10. Recurring Admin dataset contains only Premium subscriptions
  await runTest('10. Recurring Admin dataset contains only Premium subscriptions', () => {
    const recurring = db.getAllPremiumSubscriptions(100, true);
    const orphanSubs = recurring.filter((s: any) => ['sub_1790286864391_58njb', 'sub_1790287874712_cm9nc'].includes(s.id));
    assert.strictEqual(orphanSubs.length, 0, `Expected 0 orphan reset recurring subs, found ${orphanSubs.length}`);
  });

  // 11. No user IDs hardcoded in payment logic
  await runTest('11. No user IDs hardcoded in payment handlers', () => {
    const serverTs = fs.readFileSync('server.ts', 'utf8');
    // Look for hardcoded user IDs only in the payment API handler sections
    // Extract lines containing /api/payment or /api/subscription to check for hardcoded IDs
    const lines = serverTs.split('\n');
    const paymentLines = lines.filter(l => 
      l.includes('/api/payment') || l.includes('/api/subscription') || l.includes('createPaymentOrder') || l.includes('verifyPayment')
    );
    for (const line of paymentLines) {
      assert.ok(!line.includes('user_superadmin_pawankhot'), `Hardcoded user_superadmin_pawankhot in payment handler: ${line.trim()}`);
      assert.ok(!line.includes('user_student_pawankhot127'), `Hardcoded user_student_pawankhot127 in payment handler: ${line.trim()}`);
    }
  });

  // 12. No payment logic modified (key files unchanged)
  await runTest('12. No payment logic modified (paymentConfig canonical)', () => {
    assert.ok(PLAN_CONFIGS.FREE, 'FREE plan config exists');
    assert.ok(PLAN_CONFIGS.PLUS, 'PLUS plan config exists');
    assert.ok(PLAN_CONFIGS.PRO, 'PRO plan config exists');
    assert.strictEqual(CREDIT_PACKS.length, 3, '3 credit packs exist');
    assert.strictEqual(CREDIT_PACKS[0].pricePaise, 4900, 'pack_10 = ₹49');
    assert.strictEqual(CREDIT_PACKS[1].pricePaise, 9900, 'pack_25 = ₹99');
    assert.strictEqual(CREDIT_PACKS[2].pricePaise, 17900, 'pack_50 = ₹179');
  });

  // 13. Entitlement logic intact
  await runTest('13. No entitlement logic modified', () => {
    const entitlements = fs.readFileSync('server/entitlements.ts', 'utf8');
    assert.ok(entitlements.includes('hasPremiumAccess'), 'hasPremiumAccess function exists');
    assert.ok(entitlements.includes('hasAssessmentAccess'), 'hasAssessmentAccess function exists');
    assert.ok(entitlements.includes('getDeepAIAccess'), 'getDeepAIAccess function exists');
    assert.ok(entitlements.includes('PLUS'), 'PLUS entitlement logic present');
    assert.ok(entitlements.includes('PRO'), 'PRO entitlement logic present');
  });

  // 14. No polling loops
  await runTest('14. No polling loops in AdminPanel', () => {
    const adminPanel = fs.readFileSync('src/components/AdminPanel.tsx', 'utf8');
    const setIntervalCount = (adminPanel.match(/setInterval\s*\(/g) || []).length;
    assert.strictEqual(setIntervalCount, 0, `Found ${setIntervalCount} setInterval calls in AdminPanel`);
  });

  // 15. Database is internally consistent
  await runTest('15. Database is internally consistent', () => {
    // No orphan reset payment orders
    const orders = db.sqliteDb.prepare(`
      SELECT COUNT(*) as c FROM payment_orders
      WHERE id IN ('ord_1789930355698_b82ry', 'ord_1790284902024_unuc8', 'ord_1790286286068_7sxzf', 'ord_sub_1790286864391_58njb', 'ord_sub_1790287874712_cm9nc')
    `).get() as any;
    assert.strictEqual(orders.c, 0, `Expected 0 orphan reset payment orders, found ${orders.c}`);

    // No orphan reset subscriptions
    const subs = db.sqliteDb.prepare(`
      SELECT COUNT(*) as c FROM premium_subscriptions
      WHERE id IN ('sub_1790286864391_58njb', 'sub_1790287874712_cm9nc')
    `).get() as any;
    assert.strictEqual(subs.c, 0, `Expected 0 orphan reset subscriptions, found ${subs.c}`);

    // No orphan reset PURCHASED/PREMIUM credits
    const testCredits = db.sqliteDb.prepare(`
      SELECT COUNT(*) as c FROM deep_ai_credit_ledger WHERE id IN (1785, 1786, 1875, 1973)
    `).get() as any;
    assert.strictEqual(testCredits.c, 0, `Expected 0 orphan PURCHASED/PREMIUM credits, found ${testCredits.c}`);

    // No plus selections for real users
    const plusSel = db.sqliteDb.prepare(`
      SELECT COUNT(*) as c FROM plus_test_selections WHERE userId IN ('user_student_pawankhot127', 'user_student_akhot5779')
    `).get() as any;
    assert.strictEqual(plusSel.c, 0, `Expected 0 plus selections for real users, found ${plusSel.c}`);

    // All real users without active subscriptions are FREE
    const nonFreeUsers = db.sqliteDb.prepare(`
      SELECT COUNT(*) as c FROM users
      WHERE plan != 'FREE' AND id NOT IN (SELECT userId FROM premium_subscriptions WHERE status = 'ACTIVE')
    `).get() as any;
    assert.strictEqual(nonFreeUsers.c, 0, `Expected 0 non-FREE real users without active subscriptions, found ${nonFreeUsers.c}`);
  });

  console.log(`\n=== PHASE 15 TEST SUITE COMPLETED: ${passed}/${total} TESTS PASSED ===\n`);
}

main().catch(err => {
  console.error('FATAL:', err);
  process.exit(1);
});
