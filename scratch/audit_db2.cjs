const Database = require('better-sqlite3');
const db = new Database('firstround.db', { readonly: true });

// Counts
const tests = db.prepare("SELECT COUNT(*) as cnt FROM tests").get();
const questions = db.prepare("SELECT COUNT(*) as cnt FROM questions").get();
const attempts = db.prepare("SELECT COUNT(*) as cnt FROM test_attempts").get();
const notifications = db.prepare("SELECT COUNT(*) as cnt FROM notifications").get();
const companies = db.prepare("SELECT COUNT(*) as cnt FROM companies").get();
const roles = db.prepare("SELECT COUNT(*) as cnt FROM roles").get();
const bookmarks = db.prepare("SELECT COUNT(*) as cnt FROM bookmarks").get();

console.log('=== DATABASE CONTENT COUNTS ===');
console.log('Tests (test series):', tests.cnt);
console.log('Questions:', questions.cnt);
console.log('Test Attempts:', attempts.cnt);
console.log('Notifications:', notifications.cnt);
console.log('Companies:', companies.cnt);
console.log('Roles:', roles.cnt);
console.log('Bookmarks:', bookmarks.cnt);

// Test statuses
const statuses = db.prepare("SELECT status, COUNT(*) as cnt FROM tests GROUP BY status").all();
console.log('\n=== TEST STATUS DISTRIBUTION ===');
statuses.forEach(s => console.log(`  ${s.status}: ${s.cnt}`));

// Check for pawan@test.com and aditya@test.com
const pawan = db.prepare("SELECT * FROM users WHERE email = 'pawan@test.com'").get();
const aditya = db.prepare("SELECT * FROM users WHERE email = 'aditya@test.com'").get();
console.log('\n=== SPECIFIC EMAIL CHECKS ===');
console.log('pawan@test.com:', pawan ? JSON.stringify(pawan) : 'NOT FOUND');
console.log('aditya@test.com:', aditya ? JSON.stringify(aditya) : 'NOT FOUND');

db.close();
