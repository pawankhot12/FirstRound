const Database = require('better-sqlite3');
const path = require('path');

const dbPath = process.env.SQLITE_DB_PATH || path.resolve(__dirname, '../firstround.db');
console.log('Auditing Database at:', dbPath);

const db = new Database(dbPath, { readonly: true });

// 1. All Users
const users = db.prepare('SELECT id, name, email, role, is_test, targetCompany, targetRole, totalPoints, totalTestsAttempted, currentStreakDays, createdAt FROM users').all();
console.log(`\n=== USERS COUNT: ${users.length} ===`);
console.table(users);

// 2. is_test distribution
const isTestDist = db.prepare('SELECT is_test, COUNT(*) as count FROM users GROUP BY is_test').all();
console.log('\n=== IS_TEST DISTRIBUTION ===');
console.table(isTestDist);

// 3. Users with attempts count
const userAttempts = db.prepare(`
  SELECT u.id, u.email, u.name, u.totalPoints, COUNT(ta.id) as real_attempts
  FROM users u
  LEFT JOIN test_attempts ta ON ta.userId = u.id
  GROUP BY u.id
`).all();
console.log('\n=== USER ATTEMPTS AUDIT ===');
console.table(userAttempts);

// 4. Test attempts table summary
const attemptsSummary = db.prepare(`
  SELECT is_test, COUNT(*) as count FROM test_attempts GROUP BY is_test
`).all();
console.log('\n=== TEST ATTEMPTS IS_TEST SUMMARY ===');
console.table(attemptsSummary);

// 5. XP distribution vs actual attempt scores
const userXpVsAttempts = db.prepare(`
  SELECT 
    u.id, 
    u.email, 
    u.name, 
    u.totalPoints AS db_user_total_points,
    COUNT(ta.id) AS attempt_count
  FROM users u
  LEFT JOIN test_attempts ta ON ta.userId = u.id AND (ta.is_test = 0 OR ta.is_test IS NULL)
  GROUP BY u.id
`).all();
console.log('\n=== USER XP VS COMPLETED PRODUCTION ATTEMPTS ===');
console.table(userXpVsAttempts);

// 6. Check bookmarks, standings, subscriptions, payments, AI credits for users
const userActivitySummary = db.prepare(`
  SELECT 
    u.id,
    u.email,
    u.name,
    (SELECT COUNT(*) FROM bookmarks b WHERE b.userId = u.id) AS bookmarks_count,
    (SELECT COUNT(*) FROM weekly_standings ws WHERE ws.userId = u.id) AS standings_count,
    (SELECT COUNT(*) FROM premium_subscriptions ps WHERE ps.userId = u.id) AS subscriptions_count,
    (SELECT COUNT(*) FROM payment_orders po WHERE po.userId = u.id) AS payments_count,
    (SELECT COUNT(*) FROM deep_ai_credit_ledger cl WHERE cl.userId = u.id) AS credit_ledger_count
  FROM users u
`).all();
console.log('\n=== USER RELATED RECORDS SUMMARY ===');
console.table(userActivitySummary);

// 7. Inspect row counts of ALL tables in DB
const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'").all();
console.log('\n=== ALL TABLES ROW COUNTS ===');
const tableCounts = tables.map(t => {
  const cnt = db.prepare(`SELECT COUNT(*) as count FROM "${t.name}"`).get().count;
  return { tableName: t.name, rowCount: cnt };
});
console.table(tableCounts);

db.close();
