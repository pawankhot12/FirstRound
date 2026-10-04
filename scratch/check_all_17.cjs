const Database = require('better-sqlite3');
const path = require('path');

const dbPath = path.join(__dirname, '..', 'firstround.db');
const sqlite = new Database(dbPath);

const tests = sqlite.prepare('SELECT id, title, category, status, totalQuestions FROM tests').all();
console.log(`Total tests in DB: ${tests.length}`);
console.table(tests);
