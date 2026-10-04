import fs from 'fs';
import path from 'path';
import { db } from '../server/db.ts';

console.log('=== CREATING PHASE 15 TEST DATA BACKUP ===');

const backupDir = path.join(process.cwd(), 'scratch', 'backups');
if (!fs.existsSync(backupDir)) {
  fs.mkdirSync(backupDir, { recursive: true });
}

const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
const backupPath = path.join(backupDir, `backup_phase15_${timestamp}.json`);

const paymentOrders = db.sqliteDb.prepare('SELECT * FROM payment_orders').all();
const premiumSubs = db.sqliteDb.prepare('SELECT * FROM premium_subscriptions').all();
const testCreditLedger = db.sqliteDb.prepare(`
  SELECT * FROM deep_ai_credit_ledger
  WHERE source IN ('PURCHASED', 'PREMIUM')
`).all();

const affectedUserIds = ['user_superadmin_pawankhot', 'user_student_pawankhot127'];
const affectedUsers = db.sqliteDb.prepare(`
  SELECT id, email, name, plan, subscriptionStatus, currentPeriodStart, currentPeriodEnd, cancelAtPeriodEnd, pendingPlan
  FROM users WHERE id IN ('user_superadmin_pawankhot', 'user_student_pawankhot127')
`).all();

const plusSelections = db.sqliteDb.prepare(`
  SELECT * FROM plus_test_selections WHERE userId IN ('user_superadmin_pawankhot', 'user_student_pawankhot127')
`).all();

const backupData = {
  timestamp: new Date().toISOString(),
  description: 'Phase 15 Test Payment & Subscription Reset Backup',
  paymentOrders,
  premiumSubs,
  testCreditLedger,
  affectedUsers,
  plusSelections,
};

fs.writeFileSync(backupPath, JSON.stringify(backupData, null, 2));

console.log(`Backup saved successfully to: ${backupPath}`);
