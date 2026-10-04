const Database = require('better-sqlite3');
const db = new Database('./firstround.db');

const tables = db.prepare("SELECT name, sql FROM sqlite_master WHERE type='table'").all();
console.log("=== TABLES IN DATABASE ===");
tables.forEach(t => console.log(t.name));

console.log("\n=== QUESTIONS COUNT & STRUCTURE ===");
const qCount = db.prepare("SELECT COUNT(*) as c FROM questions").get();
console.log("Total questions in questions table:", qCount.c);

const testCount = db.prepare("SELECT COUNT(*) as c FROM tests").get();
console.log("Total tests in tests table:", testCount.c);

const aqCount = db.prepare("SELECT COUNT(*) as c FROM assessment_questions").get();
console.log("Total links in assessment_questions table:", aqCount.c);
