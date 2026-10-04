const Database = require('better-sqlite3');
const path = require('path');

const dbPath = path.resolve(__dirname, '../firstround.db');
const db = new Database(dbPath);

console.log('--- Cleaning Up Test Data for Phase 4.3 ---');

// 1. Identify test users
const testUsers = db.prepare(`
  SELECT id, email, name FROM users
  WHERE email LIKE 'cohort_user_%'
     OR email LIKE 'p1_%'
     OR email LIKE 'p2_%'
     OR email LIKE 'p3_%'
     OR email LIKE 'p4_%'
     OR email LIKE 'p42_%'
     OR email LIKE 'p43_%'
     OR email LIKE 'practice_l2_%'
     OR email LIKE 'exam_l2_%'
     OR email LIKE 'rt_%'
     OR email LIKE 'rt2_%'
     OR email LIKE 'hack_%'
     OR email LIKE 'hack2_%'
     OR email LIKE 'scorecheck_%'
     OR email LIKE 'e2e_%'
     OR email LIKE 'uuid_verify_%'
     OR email LIKE 'dup_prevent_%'
     OR email LIKE 'session_ref_%'
     OR email LIKE 'clean_auth_%'
     OR email LIKE 'google_user_%'
     OR email LIKE 'existing_user_%'
`).all();

console.log(`Found ${testUsers.length} test user accounts to delete.`);

if (testUsers.length > 0) {
  const ids = testUsers.map((u) => u.id);
  const placeholders = ids.map(() => '?').join(',');

  db.prepare(`DELETE FROM weekly_standings WHERE userId IN (${placeholders})`).run(...ids);
  db.prepare(`DELETE FROM attempt_responses WHERE attemptId IN (SELECT id FROM test_attempts WHERE userId IN (${placeholders}))`).run(...ids);
  db.prepare(`DELETE FROM test_attempts WHERE userId IN (${placeholders})`).run(...ids);
  db.prepare(`DELETE FROM test_user_history WHERE userId IN (${placeholders})`).run(...ids);
  db.prepare(`DELETE FROM bookmarks WHERE userId IN (${placeholders})`).run(...ids);
  db.prepare(`DELETE FROM coding_submissions WHERE userId IN (${placeholders})`).run(...ids);
  db.prepare(`DELETE FROM users WHERE id IN (${placeholders})`).run(...ids);
}

// 2. Remove standings for users without a completed official EXAM in the current season
const standingsWithoutExams = db.prepare(`
  DELETE FROM weekly_standings
  WHERE userId NOT IN (
    SELECT DISTINCT userId FROM test_attempts WHERE lower(mode) = 'exam'
  )
`).run();
console.log(`Removed ${standingsWithoutExams.changes} weekly_standings for users with no official EXAM attempts.`);

// 3. Count remaining users and standings
const remainingUsers = db.prepare('SELECT id, email, name, role FROM users').all();
const remainingStandings = db.prepare('SELECT * FROM weekly_standings').all();
const remainingAttempts = db.prepare('SELECT id, userId, mode FROM test_attempts').all();

console.log('--- Cleanup Summary ---');
console.log('Remaining Real Users Count:', remainingUsers.length);
console.log('Remaining Real Users Sample:', remainingUsers.slice(0, 10));
console.log('Remaining Weekly Standings Count:', remainingStandings.length);
console.log('Remaining Exam Attempts Count:', remainingAttempts.length);
