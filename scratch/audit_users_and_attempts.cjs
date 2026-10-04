const Database = require('better-sqlite3');
const path = require('path');

const dbPath = path.resolve(process.cwd(), 'firstround.db');
const db = new Database(dbPath);

console.log('--- TEST_ATTEMPTS COLUMNS ---');
const cols = db.pragma('table_info(test_attempts)');
console.log(cols.map(c => c.name));

console.log('\n--- ATTEMPTS PER USER ---');
const attemptsPerUser = db.prepare(`
  SELECT u.id, u.email, u.name, u.role, COUNT(ta.id) as attempt_count
  FROM users u
  LEFT JOIN test_attempts ta ON u.id = ta.userId
  GROUP BY u.id
  ORDER BY attempt_count DESC
`).all();

console.log(`Total users: ${attemptsPerUser.length}`);
console.log('Users with attempts:');
attemptsPerUser.filter(u => u.attempt_count > 0).forEach(u => {
  console.log(`  [${u.role}] ${u.email} (${u.name}): ${u.attempt_count} attempts`);
});

console.log('\n--- SAMPLE SEEDED USERS WITHOUT ATTEMPTS ---');
const zeroAttemptUsers = attemptsPerUser.filter(u => u.attempt_count === 0);
console.log(`Users with 0 attempts: ${zeroAttemptUsers.length}`);
console.log('Sample 10 zero-attempt users:');
zeroAttemptUsers.slice(0, 10).forEach(u => console.log(`  [${u.role}] ${u.email} (${u.name})`));

db.close();
