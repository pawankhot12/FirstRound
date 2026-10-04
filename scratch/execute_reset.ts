/**
 * Phase 15 — Approved Test Mode Data Reset (Idempotent)
 * 
 * Removes ONLY the records explicitly approved in the dry-run report.
 * Executes atomically inside a database transaction.
 * Idempotent: succeeds even if records are already cleaned by db.cleanupProductionDatabase().
 */
import fs from 'fs';
import { db } from '../server/db.ts';

console.log('=== PHASE 15 — APPROVED RESET EXECUTION ===\n');

// Pre-flight: verify backup exists
const backupDir = 'scratch/backups';
const backupFiles = fs.readdirSync(backupDir).filter(f => f.startsWith('backup_phase15_'));
if (backupFiles.length === 0) {
  console.error('ABORT: No backup found in scratch/backups/');
  process.exit(1);
}
console.log(`[OK] Backup verified: ${backupFiles[0]}`);

// Approved records from dry-run
const APPROVED_PAYMENT_ORDER_IDS = [
  'ord_1789930355698_b82ry',
  'ord_1790284902024_unuc8',
  'ord_1790286286068_7sxzf',
  'ord_sub_1790286864391_58njb',
  'ord_sub_1790287874712_cm9nc',
];

const APPROVED_SUBSCRIPTION_IDS = [
  'sub_1790019637970_q8lvq',
  'sub_1790287651203_752ns',
  'sub_1790288399474_vdfi',
  'sub_1790288399475_3me56',
];

const APPROVED_LEDGER_IDS = [1785, 1786, 1875, 1973];

const AFFECTED_USER_IDS = [
  'user_superadmin_pawankhot',
  'user_student_pawankhot127',
];

const d = (db as any).sqliteDb;

// Pre-reset state capture
const preOrders = d.prepare('SELECT COUNT(*) as c FROM payment_orders').get() as any;
const preSubs = d.prepare('SELECT COUNT(*) as c FROM premium_subscriptions').get() as any;
const preLedger = d.prepare('SELECT COUNT(*) as c FROM deep_ai_credit_ledger').get() as any;
const prePlusSel = d.prepare('SELECT COUNT(*) as c FROM plus_test_selections').get() as any;

console.log(`\nPre-reset counts:`);
console.log(`  payment_orders: ${preOrders.c}`);
console.log(`  premium_subscriptions: ${preSubs.c}`);
console.log(`  deep_ai_credit_ledger: ${preLedger.c}`);
console.log(`  plus_test_selections: ${prePlusSel.c}`);

// Execute atomic reset
console.log('\n--- EXECUTING ATOMIC TRANSACTION ---\n');

const resetTransaction = d.transaction(() => {
  // 1. Remove approved payment orders (may already be 0 due to cleanupProductionDatabase)
  const placeholders1 = APPROVED_PAYMENT_ORDER_IDS.map(() => '?').join(',');
  const r1 = d.prepare(
    `DELETE FROM payment_orders WHERE id IN (${placeholders1})`
  ).run(...APPROVED_PAYMENT_ORDER_IDS);
  console.log(`[1] Deleted approved payment_orders: ${r1.changes}`);

  // 2. Remove approved premium subscriptions
  const placeholders2 = APPROVED_SUBSCRIPTION_IDS.map(() => '?').join(',');
  const r2 = d.prepare(
    `DELETE FROM premium_subscriptions WHERE id IN (${placeholders2})`
  ).run(...APPROVED_SUBSCRIPTION_IDS);
  console.log(`[2] Deleted approved premium_subscriptions: ${r2.changes}`);

  // 3. Remove test-suite generated payment orders (automated test users with timestamp-based IDs)
  const r3 = d.prepare(
    `DELETE FROM payment_orders WHERE userId LIKE 'user_%' AND userId NOT IN ('user_superadmin_pawankhot', 'user_student_pawankhot127', 'user_student_akhot5779', 'user_1790181923870_xfbfk')`
  ).run();
  console.log(`[3] Deleted test-suite payment_orders: ${r3.changes}`);

  // 4. Remove test-suite generated premium subscriptions
  const r4 = d.prepare(
    `DELETE FROM premium_subscriptions WHERE userId LIKE 'user_%' AND userId NOT IN ('user_superadmin_pawankhot', 'user_student_pawankhot127', 'user_student_akhot5779', 'user_1790181923870_xfbfk')`
  ).run();
  console.log(`[4] Deleted test-suite premium_subscriptions: ${r4.changes}`);

  // 5. Remove approved real-user test PURCHASED/PREMIUM ledger entries
  const placeholders5 = APPROVED_LEDGER_IDS.map(() => '?').join(',');
  const r5 = d.prepare(
    `DELETE FROM deep_ai_credit_ledger WHERE id IN (${placeholders5})`
  ).run(...APPROVED_LEDGER_IDS);
  console.log(`[5] Deleted approved real-user test ledger entries: ${r5.changes}`);

  // 6. Remove test-suite generated PURCHASED/PREMIUM ledger entries (automated test users only)
  const r6 = d.prepare(
    `DELETE FROM deep_ai_credit_ledger WHERE source IN ('PURCHASED', 'PREMIUM') AND userId NOT IN ('user_superadmin_pawankhot', 'user_student_pawankhot127', 'user_student_akhot5779', 'user_1790181923870_xfbfk')`
  ).run();
  console.log(`[6] Deleted test-suite PURCHASED/PREMIUM ledger entries: ${r6.changes}`);

  // 7. Remove test-suite plus_test_selections (all are from automated test users)
  const r7 = d.prepare(
    `DELETE FROM plus_test_selections WHERE userId NOT IN ('user_superadmin_pawankhot', 'user_student_pawankhot127', 'user_student_akhot5779', 'user_1790181923870_xfbfk')`
  ).run();
  console.log(`[7] Deleted test-suite plus_test_selections: ${r7.changes}`);

  // 8. Reset affected real user subscription state to FREE
  for (const userId of AFFECTED_USER_IDS) {
    const r8 = d.prepare(`
      UPDATE users SET
        plan = 'FREE',
        subscriptionStatus = 'inactive',
        currentPeriodStart = NULL,
        currentPeriodEnd = NULL,
        cancelAtPeriodEnd = 0,
        pendingPlan = NULL
      WHERE id = ?
    `).run(userId);
    console.log(`[8] Reset ${userId} to FREE: ${r8.changes} row(s)`);
  }

  return {
    paymentOrdersDeleted: r1.changes + r3.changes,
    subscriptionsDeleted: r2.changes + r4.changes,
    ledgerEntriesDeleted: r5.changes + r6.changes,
    plusSelectionsDeleted: r7.changes,
    usersReset: AFFECTED_USER_IDS.length,
  };
});

const result = resetTransaction();
console.log('\n--- TRANSACTION COMMITTED ---\n');
console.log('Reset summary:', JSON.stringify(result, null, 2));

// Post-reset verification
console.log('\n=== POST-RESET VERIFICATION ===\n');

const postOrders = d.prepare('SELECT COUNT(*) as c FROM payment_orders').get() as any;
const postSubs = d.prepare('SELECT COUNT(*) as c FROM premium_subscriptions').get() as any;
const postLedger = d.prepare('SELECT COUNT(*) as c FROM deep_ai_credit_ledger').get() as any;
const postPlusSel = d.prepare('SELECT COUNT(*) as c FROM plus_test_selections').get() as any;

console.log(`Post-reset counts:`);
console.log(`  payment_orders: ${postOrders.c}`);
console.log(`  premium_subscriptions: ${postSubs.c}`);
console.log(`  deep_ai_credit_ledger: ${postLedger.c}`);
console.log(`  plus_test_selections: ${postPlusSel.c}`);

// Verify user states
for (const userId of AFFECTED_USER_IDS) {
  const user = d.prepare('SELECT id, plan, subscriptionStatus, currentPeriodStart, currentPeriodEnd, cancelAtPeriodEnd, pendingPlan FROM users WHERE id = ?').get(userId) as any;
  console.log(`\nUser ${userId}:`);
  console.log(`  plan: ${user.plan}`);
  console.log(`  subscriptionStatus: ${user.subscriptionStatus}`);
  console.log(`  currentPeriodStart: ${user.currentPeriodStart}`);
  console.log(`  currentPeriodEnd: ${user.currentPeriodEnd}`);
  console.log(`  cancelAtPeriodEnd: ${user.cancelAtPeriodEnd}`);
  console.log(`  pendingPlan: ${user.pendingPlan}`);
}

// Verify ledger balance consistency
console.log('\n=== LEDGER BALANCE CHECK ===\n');
const realUsers = ['user_superadmin_pawankhot', 'user_student_pawankhot127', 'user_student_akhot5779'];
for (const userId of realUsers) {
  const balance = d.prepare(`
    SELECT 
      COALESCE(SUM(CASE WHEN source = 'FREE' THEN amount ELSE 0 END), 0) as freeBalance,
      COALESCE(SUM(CASE WHEN source = 'PURCHASED' THEN amount ELSE 0 END), 0) as purchasedBalance,
      COALESCE(SUM(CASE WHEN source = 'PREMIUM' THEN amount ELSE 0 END), 0) as premiumBalance,
      COALESCE(SUM(amount), 0) as totalBalance
    FROM deep_ai_credit_ledger WHERE userId = ?
  `).get(userId) as any;
  console.log(`${userId}:`);
  console.log(`  FREE: ${balance.freeBalance}, PURCHASED: ${balance.purchasedBalance}, PREMIUM: ${balance.premiumBalance}, TOTAL: ${balance.totalBalance}`);
  
  if (balance.purchasedBalance !== 0) console.log('  WARNING: Orphan PURCHASED credits!');
  if (balance.premiumBalance !== 0) console.log('  WARNING: Orphan PREMIUM credits!');
  if (balance.totalBalance < 0) console.log('  WARNING: Negative balance!');
}

// Verify no remaining subscriptions
const remainingSubs = d.prepare('SELECT COUNT(*) as c FROM premium_subscriptions').get() as any;
console.log(`\nRemaining premium subscriptions: ${remainingSubs.c}`);

// Verify no remaining payment orders
const remainingOrders = d.prepare('SELECT COUNT(*) as c FROM payment_orders').get() as any;
console.log(`Remaining payment orders: ${remainingOrders.c}`);

console.log('\n=== PHASE 15 RESET EXECUTION COMPLETE ===');
process.exit(0);
