const Database = require('better-sqlite3');
const path = require('path');

const dbPath = path.resolve(process.cwd(), 'firstround.db');
const db = new Database(dbPath);

console.log('=== FIRSTROUND DB AUDIT ===\n');

// 1. Table Counts
const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all();
console.log('Tables found:');
for (const t of tables) {
  const count = db.prepare(`SELECT COUNT(*) as cnt FROM ${t.name}`).get().cnt;
  console.log(` - ${t.name}: ${count} rows`);
}

// 2. Users Audit
console.log('\n--- USERS BREAKDOWN ---');
const usersByRole = db.prepare('SELECT role, COUNT(*) as cnt FROM users GROUP BY role').all();
console.log('Users by role:', usersByRole);

const allUsers = db.prepare('SELECT id, email, name, role, createdAt FROM users').all();
console.log(`Total users in DB: ${allUsers.length}`);
console.log('User sample (first 10):');
allUsers.slice(0, 10).forEach(u => console.log(`  [${u.role}] ${u.email} (${u.name}) - ID: ${u.id}`));

// 3. Tests Audit
console.log('\n--- TESTS BREAKDOWN ---');
const testsByCategory = db.prepare('SELECT category, status, COUNT(*) as cnt FROM tests GROUP BY category, status').all();
console.log('Tests by category & status:', testsByCategory);

const allTests = db.prepare('SELECT id, title, category, status, totalQuestions, attemptsCount FROM tests').all();
console.log(`Total tests in DB: ${allTests.length}`);
console.log('All tests list:');
allTests.forEach(t => console.log(`  [${t.status || 'N/A'}] ${t.id}: ${t.title} (${t.category}, Qs: ${t.totalQuestions}, Attempts: ${t.attemptsCount})`));

// 4. Questions Audit
console.log('\n--- QUESTIONS BREAKDOWN ---');
const questionsByTest = db.prepare('SELECT testSeriesId, COUNT(*) as cnt FROM questions GROUP BY testSeriesId').all();
console.log('Questions count grouped by testSeriesId:', questionsByTest);

// 5. Test Attempts Audit
console.log('\n--- TEST ATTEMPTS BREAKDOWN ---');
const attemptsCount = db.prepare('SELECT mode, COUNT(*) as cnt FROM test_attempts GROUP BY mode').all();
console.log('Attempts by mode:', attemptsCount);
const attemptsSample = db.prepare('SELECT id, userId, testSeriesId, mode, score, percentage, completedAt FROM test_attempts LIMIT 10').all();
console.log('Attempts sample:', attemptsSample);

db.close();
