import fs from 'fs';
import path from 'path';
import { db } from '../server/db.ts';

const outPath = path.join(process.cwd(), 'scratch', 'audit_output.json');

const orders = db.sqliteDb.prepare('SELECT id, userId, productType, productId, amount, razorpayOrderId, razorpayPaymentId, status, createdAt, is_test FROM payment_orders ORDER BY createdAt').all();

const subs = db.sqliteDb.prepare('SELECT * FROM premium_subscriptions ORDER BY createdAt').all();

const credits = db.sqliteDb.prepare('SELECT * FROM deep_ai_credit_ledger ORDER BY id').all();

const plusSel = db.sqliteDb.prepare('SELECT * FROM plus_test_selections ORDER BY selectedAt').all();

const users = db.sqliteDb.prepare('SELECT id, email, name, plan, subscriptionStatus, currentPeriodStart, currentPeriodEnd, cancelAtPeriodEnd, pendingPlan FROM users').all();

const result = {
  paymentOrders: orders,
  premiumSubscriptions: subs,
  creditLedger: credits,
  plusTestSelections: plusSel,
  users: users,
};

fs.writeFileSync(outPath, JSON.stringify(result, null, 2));
console.log('AUDIT_DONE: ' + outPath);
