const path = require('path');
const Database = require('better-sqlite3');

const dbPath = process.env.SQLITE_DB_PATH || path.resolve(process.cwd(), 'firstround.db');
const db = new Database(dbPath);

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
  'cat_coding_mock_01'
];

const totalTests = db.prepare('SELECT count(*) as count FROM tests').get().count;
const approvedTests = db.prepare(`SELECT count(*) as count FROM tests WHERE id IN (${approvedIds.map(() => '?').join(',')})`).get(...approvedIds).count;
const totalQuestions = db.prepare('SELECT count(*) as count FROM questions').get().count;
const canonicalQuestions = db.prepare(`SELECT count(*) as count FROM questions WHERE id NOT LIKE 'q_admin_%' AND id NOT LIKE 'q_qa_%' AND testSeriesId IN (${approvedIds.map(() => '?').join(',')})`).get(...approvedIds).count;
const totalUsers = db.prepare('SELECT count(*) as count FROM users').get().count;
const studentUsers = db.prepare("SELECT count(*) as count FROM users WHERE role = 'student' OR role IS NULL").get().count;

console.log('--- CURRENT DB STATS ---');
console.log(`Total Tests in DB: ${totalTests} (Approved 17 baseline: ${approvedTests})`);
console.log(`Total Questions in DB: ${totalQuestions} (Canonical baseline: ${canonicalQuestions})`);
console.log(`Total Users in DB: ${totalUsers} (Students: ${studentUsers})`);
