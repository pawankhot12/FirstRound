import Database from 'better-sqlite3';
import path from 'path';
import { quantQuestions } from '../src/data/questionBank/quant';
import { logicalQuestions } from '../src/data/questionBank/logical';
import { verbalQuestions } from '../src/data/questionBank/verbal';
import { diQuestions } from '../src/data/questionBank/di';
import { pseudocodeQuestions } from '../src/data/questionBank/pseudocode';
import { accentureQuestions } from '../src/data/questionBank/accenture';
import { cognizantQuestions } from '../src/data/questionBank/cognizant';
import { infosysQuestions } from '../src/data/questionBank/infosys';
import { tcsAdvancedQuestions } from '../src/data/questionBank/tcsAdvanced';
import { tcsCodingProblems } from '../src/data/questionBank/tcsCoding';
import { codingMockQuestions } from '../src/data/questionBank/codingMock';
import { wiproQuestions } from '../src/data/questionBank/wipro';

const dbPath = path.resolve(process.cwd(), 'firstround.db');
const db = new Database(dbPath);

console.log('=== FULL PRODUCTION DATA AUDIT ===\n');

// 1. Audit Users
const allUsers = db.prepare('SELECT * FROM users').all() as any[];
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
  u.email.startsWith('session_')
);

console.log(`- Super Admin Users: ${superAdmin.length} (${superAdmin.map(u => u.email).join(', ')})`);
console.log(`- Real Candidate Accounts: ${realCandidates.length} (${realCandidates.map(u => `${u.email} [${u.name}]`).join(', ')})`);
console.log(`- Test/Seeded/Demo Users: ${testSeededUsers.length}`);

// 2. Audit Tests
const allTests = db.prepare('SELECT * FROM tests').all() as any[];
const activeCatalogueTests = allTests.filter(t => t.id.startsWith('cat_'));
const legacySeedTests = allTests.filter(t => !t.id.startsWith('cat_'));

console.log(`\nTotal Tests in DB: ${allTests.length}`);
console.log(`- Active Catalogue Production Tests (cat_*): ${activeCatalogueTests.length}`);
console.log(`- Legacy/Seeded Prototype Tests (test_*): ${legacySeedTests.length}`);

// 3. Audit Questions
const dbQuestions = db.prepare('SELECT * FROM questions').all() as any[];
console.log(`\nTotal Questions in DB table: ${dbQuestions.length}`);

const canonicalCount = 
  quantQuestions.length +
  logicalQuestions.length +
  verbalQuestions.length +
  diQuestions.length +
  pseudocodeQuestions.length +
  accentureQuestions.length +
  cognizantQuestions.length +
  infosysQuestions.length +
  tcsAdvancedQuestions.length +
  tcsCodingProblems.length +
  codingMockQuestions.length +
  wiproQuestions.length;

console.log(`Canonical Question Bank Total (TS Source Question Banks): ${canonicalCount}`);
console.log(` - Quant: ${quantQuestions.length}`);
console.log(` - Logical: ${logicalQuestions.length}`);
console.log(` - Verbal: ${verbalQuestions.length}`);
console.log(` - DI: ${diQuestions.length}`);
console.log(` - Pseudocode: ${pseudocodeQuestions.length}`);
console.log(` - Accenture: ${accentureQuestions.length}`);
console.log(` - Cognizant: ${cognizantQuestions.length}`);
console.log(` - Infosys: ${infosysQuestions.length}`);
console.log(` - TCS Advanced: ${tcsAdvancedQuestions.length}`);
console.log(` - TCS Coding: ${tcsCodingProblems.length}`);
console.log(` - Coding Mock: ${codingMockQuestions.length}`);
console.log(` - Wipro: ${wiproQuestions.length}`);

// 4. Audit Test Attempts
const attempts = db.prepare('SELECT * FROM test_attempts').all() as any[];
const attemptsForSuperAdmin = attempts.filter(a => superAdmin.some(sa => sa.id === a.userId));
const attemptsForRealUsers = attempts.filter(a => realCandidates.some(rc => rc.id === a.userId));
const attemptsForTestUsers = attempts.filter(a => testSeededUsers.some(tu => tu.id === a.userId));

console.log(`\nTotal Test Attempts: ${attempts.length}`);
console.log(`- Attempts by Super Admin: ${attemptsForSuperAdmin.length}`);
console.log(`- Attempts by Real Candidates: ${attemptsForRealUsers.length}`);
console.log(`- Attempts by Automated Test/Seeded Users: ${attemptsForTestUsers.length}`);

db.close();
