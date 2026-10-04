import { db } from '../server/db.ts';

const d = (db as any).sqliteDb;

console.log('=== CURRENT DB STATE ===');
console.log('payment_orders:', d.prepare('SELECT COUNT(*) as c FROM payment_orders').get());
console.log('premium_subscriptions:', d.prepare('SELECT COUNT(*) as c FROM premium_subscriptions').get());
console.log('plus_test_selections:', d.prepare('SELECT COUNT(*) as c FROM plus_test_selections').get());

console.log('\n=== LEDGER SUMMARY ===');
console.log('Total ledger:', d.prepare('SELECT COUNT(*) as c FROM deep_ai_credit_ledger').get());
console.log('FREE ledger:', d.prepare("SELECT COUNT(*) as c FROM deep_ai_credit_ledger WHERE source = 'FREE'").get());
console.log('PURCHASED ledger:', d.prepare("SELECT COUNT(*) as c FROM deep_ai_credit_ledger WHERE source = 'PURCHASED'").get());
console.log('PREMIUM ledger:', d.prepare("SELECT COUNT(*) as c FROM deep_ai_credit_ledger WHERE source = 'PREMIUM'").get());

console.log('\nPURCHASED entries:');
const purchased = d.prepare("SELECT id, userId, amount, source FROM deep_ai_credit_ledger WHERE source = 'PURCHASED'").all();
console.log(JSON.stringify(purchased, null, 2));

console.log('\nPREMIUM entries:');
const premium = d.prepare("SELECT id, userId, amount, source FROM deep_ai_credit_ledger WHERE source = 'PREMIUM'").all();
console.log(JSON.stringify(premium, null, 2));

console.log('\n=== USER STATES ===');
const users = d.prepare("SELECT id, plan, subscriptionStatus, currentPeriodStart, currentPeriodEnd, cancelAtPeriodEnd, pendingPlan FROM users WHERE id IN ('user_superadmin_pawankhot', 'user_student_pawankhot127', 'user_student_akhot5779')").all();
console.log(JSON.stringify(users, null, 2));

console.log('\n=== APPROVED LEDGER IDS ===');
for (const lid of [1785, 1786, 1875, 1973]) {
  console.log(`ID ${lid}:`, d.prepare('SELECT * FROM deep_ai_credit_ledger WHERE id = ?').get(lid) || 'NOT FOUND');
}

console.log('\n=== ALL USERS ===');
const allUsers = d.prepare("SELECT id, email, plan, subscriptionStatus FROM users").all();
console.log(JSON.stringify(allUsers, null, 2));

process.exit(0);
