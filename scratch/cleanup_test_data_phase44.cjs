const Database = require('better-sqlite3');
const path = require('path');

const dbPath = path.resolve(__dirname, '../firstround.db');
const db = new Database(dbPath);

console.log('--- Cleaning & Repairing Database for Phase 4.4 ---');

// 1. Mark corrupted/future active seasons as FINALIZED
const activeSeasons = db.prepare("SELECT * FROM weekly_seasons WHERE status = 'ACTIVE'").all();
console.log('Found active seasons in DB:', activeSeasons);

db.prepare("UPDATE weekly_seasons SET status = 'FINALIZED' WHERE status = 'ACTIVE'").run();

// 2. Identify test users
const testUsers = db.prepare(`
  SELECT id, email, name FROM users
  WHERE email LIKE 'cohort_user_%'
     OR email LIKE 'p1_%'
     OR email LIKE 'p2_%'
     OR email LIKE 'p3_%'
     OR email LIKE 'p4_%'
     OR email LIKE 'p42_%'
     OR email LIKE 'p43_%'
     OR email LIKE 'p44_%'
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

// 3. Reset all non-promoted real users back to Bronze initial tier
db.prepare("UPDATE users SET currentLeague = 'Bronze' WHERE currentLeague != 'Bronze'").run();

// 4. Remove standings for users without a completed official EXAM
const standingsWithoutExams = db.prepare(`
  DELETE FROM weekly_standings
  WHERE userId NOT IN (
    SELECT DISTINCT userId FROM test_attempts WHERE lower(mode) = 'exam'
  )
`).run();
console.log(`Removed ${standingsWithoutExams.changes} weekly_standings for users with no official EXAM attempts.`);

// 5. Count remaining real users and standings
const remainingUsers = db.prepare('SELECT id, email, name, currentLeague FROM users').all();
console.log('--- Cleanup & Repair Summary ---');
console.log('Remaining Real Users Count:', remainingUsers.length);
console.log('Remaining Real Users Sample:', remainingUsers);
