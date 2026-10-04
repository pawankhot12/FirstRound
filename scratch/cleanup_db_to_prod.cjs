const Database = require('better-sqlite3');
const db = new Database('firstround.db');

const prodEmails = ['pawankhot9@gmail.com', 'akhot5779@gmail.com', 'pawan.khot1272004@gmail.com'];
const approvedIds = [
  'cat_foundation_quant',
  'cat_foundation_logical',
  'cat_foundation_verbal',
  'cat_foundation_di',
  'cat_foundation_pseudocode',
  'cat_company_tcs_foundation',
  'cat_company_tcs',
  'cat_company_infosys',
  'cat_company_accenture',
  'cat_company_wipro',
  'cat_company_cognizant',
  'cat_coding_dsa',
  'cat_coding_sql',
  'cat_coding_prog_fundamentals',
  'cat_coding_output_debug',
  'cat_coding_core_cs',
  'cat_coding_mock_01',
];

const testPlaceholders = approvedIds.map(() => '?').join(',');
const emailPlaceholders = prodEmails.map(() => '?').join(',');

db.exec('PRAGMA foreign_keys = OFF;');

db.transaction(() => {
  // Delete test user data
  db.prepare(`DELETE FROM attempt_responses WHERE attemptId IN (SELECT id FROM test_attempts WHERE userId IN (SELECT id FROM users WHERE LOWER(email) NOT IN (${emailPlaceholders})) OR testSeriesId NOT IN (${testPlaceholders}))`).run(...prodEmails, ...approvedIds);
  db.prepare(`DELETE FROM test_attempts WHERE userId IN (SELECT id FROM users WHERE LOWER(email) NOT IN (${emailPlaceholders})) OR testSeriesId NOT IN (${testPlaceholders})`).run(...prodEmails, ...approvedIds);
  db.prepare(`DELETE FROM test_user_history WHERE userId IN (SELECT id FROM users WHERE LOWER(email) NOT IN (${emailPlaceholders}))`).run(...prodEmails);
  db.prepare(`DELETE FROM weekly_standings WHERE userId IN (SELECT id FROM users WHERE LOWER(email) NOT IN (${emailPlaceholders}))`).run(...prodEmails);
  db.prepare(`DELETE FROM bookmarks WHERE userId IN (SELECT id FROM users WHERE LOWER(email) NOT IN (${emailPlaceholders}))`).run(...prodEmails);
  db.prepare(`DELETE FROM coding_submissions WHERE userId IN (SELECT id FROM users WHERE LOWER(email) NOT IN (${emailPlaceholders}))`).run(...prodEmails);
  db.prepare(`DELETE FROM payment_orders WHERE userId IN (SELECT id FROM users WHERE LOWER(email) NOT IN (${emailPlaceholders})) OR is_test = 1`).run(...prodEmails);
  db.prepare(`DELETE FROM premium_subscriptions WHERE userId IN (SELECT id FROM users WHERE LOWER(email) NOT IN (${emailPlaceholders})) OR is_test = 1`).run(...prodEmails);
  db.prepare(`DELETE FROM deep_ai_premium_periods WHERE userId IN (SELECT id FROM users WHERE LOWER(email) NOT IN (${emailPlaceholders})) OR is_test = 1`).run(...prodEmails);
  db.prepare(`DELETE FROM deep_ai_credit_ledger WHERE userId IN (SELECT id FROM users WHERE LOWER(email) NOT IN (${emailPlaceholders})) OR is_test = 1`).run(...prodEmails);
  db.prepare(`DELETE FROM assessment_entitlements WHERE userId IN (SELECT id FROM users WHERE LOWER(email) NOT IN (${emailPlaceholders})) OR assessmentId NOT IN (${testPlaceholders}) OR is_test = 1`).run(...prodEmails, ...approvedIds);
  
  // Delete non-production users
  db.prepare(`DELETE FROM users WHERE LOWER(email) NOT IN (${emailPlaceholders})`).run(...prodEmails);
  
  // Delete non-catalogue tests
  db.prepare(`DELETE FROM questions WHERE testSeriesId NOT IN (${testPlaceholders}) OR is_test = 1`).run(...approvedIds);
  db.prepare(`DELETE FROM tests WHERE id NOT IN (${testPlaceholders}) OR is_test = 1`).run(...approvedIds);
})();

db.exec('PRAGMA foreign_keys = ON;');

console.log('--- CLEANUP COMPLETE ---');
console.log('Real Production Users:', db.prepare('SELECT id, email, role FROM users').all());
console.log('Real Production Student Count:', db.prepare("SELECT COUNT(*) as c FROM users WHERE role NOT IN ('admin', 'super_admin') AND (is_test = 0 OR is_test IS NULL)").get().c);
console.log('Real Production Test Count:', db.prepare("SELECT COUNT(*) as c FROM tests WHERE (is_test = 0 OR is_test IS NULL)").get().c);
console.log('Real Canonical Question Count:', db.prepare("SELECT COUNT(*) as c FROM questions WHERE (is_test = 0 OR is_test IS NULL)").get().c);
db.close();
