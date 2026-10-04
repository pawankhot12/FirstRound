const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

const dbPath = path.resolve(process.cwd(), 'firstround.db');
const db = new Database(dbPath);

console.log('=== FULL PRODUCTION DATA AUDIT ===\n');

// 1. Audit Users
const allUsers = db.prepare('SELECT * FROM users').all();
console.log(`Total users in DB: ${allUsers.length}`);

const superAdmin = allUsers.filter(u => u.role === 'super_admin' || u.email.toLowerCase() === 'pawankhot9@gmail.com');
const realCandidates = allUsers.filter(u => 
  u.role !== 'super_admin' && 
  u.email.toLowerCase() !== 'pawankhot9@gmail.com' &&
  !u.email.includes('example.com') &&
  !u.email.startsWith('phase') &&
  !u.email.startsWith('e2e_') &&
  !u.email.startsWith('test_') &&
  !u.email.startsWith('hacker_') &&
  !u.email.startsWith('uuid_') &&
  !u.email.startsWith('dup_') &&
  !u.email.startsWith('session_')
);
const testSeededUsers = allUsers.filter(u => 
  u.email.includes('example.com') ||
  u.email.startsWith('phase') ||
  u.email.startsWith('e2e_') ||
  u.email.startsWith('test_') ||
  u.email.startsWith('hacker_') ||
  u.email.startsWith('uuid_') ||
  u.email.startsWith('dup_') ||
  u.email.startsWith('session_') ||
  u.email === 'candidate@firstround.com'
);

console.log(`- Super Admin Users: ${superAdmin.length} (${superAdmin.map(u => u.email).join(', ')})`);
console.log(`- Real Candidate Accounts: ${realCandidates.length} (${realCandidates.map(u => `${u.email} [${u.name}]`).join(', ')})`);
console.log(`- Test/Seeded/Demo Users: ${testSeededUsers.length}`);

// 2. Audit Tests
const allTests = db.prepare('SELECT * FROM tests').all();
const activeCatalogueTests = allTests.filter(t => t.id.startsWith('cat_'));
const legacySeedTests = allTests.filter(t => !t.id.startsWith('cat_'));

console.log(`\nTotal Tests in DB: ${allTests.length}`);
console.log(`- Active Catalogue Production Tests (cat_*): ${activeCatalogueTests.length}`);
console.log(`- Legacy/Seeded Prototype Tests (test_*): ${legacySeedTests.length}`);

// 3. Audit Questions
const dbQuestions = db.prepare('SELECT * FROM questions').all();
console.log(`\nTotal Questions in DB table: ${dbQuestions.length}`);

// Calculate canonical question bank count from TS source files
const quant = require('../src/data/questionBank/quant').quantQuestions;
const logical = require('../src/data/questionBank/logical').logicalQuestions;
const verbal = require('../src/data/questionBank/verbal').verbalQuestions;
const di = require('../src/data/questionBank/di').diQuestions;
const pseudocode = require('../src/data/questionBank/pseudocode').pseudocodeQuestions;
const accenture = require('../src/data/questionBank/accenture').accentureQuestions;
const cognizant = require('../src/data/questionBank/cognizant').cognizantQuestions;
const infosys = require('../src/data/questionBank/infosys').infosysQuestions;
const tcsAdvanced = require('../src/data/questionBank/tcsAdvanced').tcsAdvancedQuestions;
const tcsCoding = require('../src/data/questionBank/tcsCoding').tcsCodingProblems;
const codingMock = require('../src/data/questionBank/codingMock').codingMockQuestions;
const wipro = require('../src/data/questionBank/wipro').wiproQuestions;

const canonicalCount = 
  (quant ? quant.length : 0) +
  (logical ? logical.length : 0) +
  (verbal ? verbal.length : 0) +
  (di ? di.length : 0) +
  (pseudocode ? pseudocode.length : 0) +
  (accenture ? accenture.length : 0) +
  (cognizant ? cognizant.length : 0) +
  (infosys ? infosys.length : 0) +
  (tcsAdvanced ? tcsAdvanced.length : 0) +
  (tcsCoding ? tcsCoding.length : 0) +
  (codingMock ? codingMock.length : 0) +
  (wipro ? wipro.length : 0);

console.log(`Canonical Question Bank Total (TS Source Question Banks): ${canonicalCount}`);

// 4. Audit Test Attempts
const attempts = db.prepare('SELECT * FROM test_attempts').all();
const attemptsForSuperAdmin = attempts.filter(a => superAdmin.some(sa => sa.id === a.userId));
const attemptsForRealUsers = attempts.filter(a => realCandidates.some(rc => rc.id === a.userId));
const attemptsForTestUsers = attempts.filter(a => testSeededUsers.some(tu => tu.id === a.userId));

console.log(`\nTotal Test Attempts: ${attempts.length}`);
console.log(`- Attempts by Super Admin: ${attemptsForSuperAdmin.length}`);
console.log(`- Attempts by Real Candidates: ${attemptsForRealUsers.length}`);
console.log(`- Attempts by Automated Test/Seeded Users: ${attemptsForTestUsers.length}`);

db.close();
