const Database = require('better-sqlite3');
const path = require('path');

const dbPath = path.resolve(process.cwd(), 'firstround.db');
const db = new Database(dbPath, { readonly: true });

console.log('--- DB Tables Counts ---');
const tables = ['users', 'tests', 'questions', 'assessment_questions', 'test_attempts', 'attempt_responses', 'payment_orders', 'payments', 'premium_subscriptions', 'deep_ai_premium_periods', 'deep_ai_credit_ledger', 'deep_ai_sessions'];
for (const t of tables) {
  try {
    const row = db.prepare(`SELECT COUNT(*) as count FROM ${t}`).get();
    console.log(`${t}:`, row.count);
  } catch (e) {
    console.log(`${t}: table missing or error (${e.message})`);
  }
}

console.log('\n--- Tests in DB ---');
const tests = db.prepare('SELECT id, title, accessType, status FROM tests').all();
console.table(tests);

console.log('\n--- Users in DB ---');
const users = db.prepare('SELECT id, email, role, plan, is_premium FROM users').all();
console.table(users);

console.log('\n--- Subscriptions in DB ---');
const subs = db.prepare('SELECT id, userId, razorpaySubscriptionId, status, currentPeriodStart, currentPeriodEnd FROM premium_subscriptions').all();
console.table(subs);

console.log('\n--- Payments in DB ---');
const payments = db.prepare('SELECT id, userId, productType, productId, amount, status FROM payment_orders').all();
console.table(payments);

console.log('\n--- Assessment Questions count ---');
const aq = db.prepare('SELECT COUNT(*) as count FROM assessment_questions').get();
console.log('assessment_questions count:', aq.count);
