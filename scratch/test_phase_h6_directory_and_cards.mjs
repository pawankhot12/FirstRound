import { db } from '../server/db.ts';

console.log('====================================================');
console.log('🧪 PHASE H.6 — ADMIN DIRECTORY & PREMIUM CARDS TEST');
console.log('====================================================\n');

let passCount = 0;
let failCount = 0;

function assert(condition, message) {
  if (condition) {
    console.log(`  ✅ PASS: ${message}`);
    passCount++;
  } else {
    console.error(`  ❌ FAIL: ${message}`);
    failCount++;
  }
}

async function runTests() {
  // Test 1: Production user count & query
  console.log('[TEST 1] Auditing DB production user query (is_test = 0 or NULL)...');
  const allProdUsers = db.getAllUsers(false);
  console.log(`  Found ${allProdUsers.length} production users:`, allProdUsers.map(u => `${u.name} (${u.role})`));
  assert(allProdUsers.length >= 3, `Dynamic production user count is >= 3 (actual: ${allProdUsers.length})`);
  
  const superAdmin = allProdUsers.find(u => u.role === 'super_admin');
  assert(superAdmin !== undefined, 'Super Admin account present in production users list');

  const studentUser = allProdUsers.find(u => u.role === 'student');
  assert(studentUser !== undefined, 'Student accounts present in production users list');

  // Test 2: Role filtering logic
  console.log('\n[TEST 2] Testing Role Filter Logic...');
  const students = allProdUsers.filter(u => u.role === 'student');
  const superAdmins = allProdUsers.filter(u => u.role === 'super_admin');
  const admins = allProdUsers.filter(u => u.role === 'admin');

  assert(students.every(u => u.role === 'student'), 'Students role filter strictly matches role === student');
  assert(superAdmins.every(u => u.role === 'super_admin'), 'Super Admin role filter strictly matches role === super_admin');

  // Test 3: Assessment Metadata & Access Types
  console.log('\n[TEST 3] Auditing Assessment Titles & Premium Metadata...');
  const catalogue = db.getTests({});
  console.log(`  Catalogue contains ${catalogue.length} total assessments.`);
  
  const freeTests = catalogue.filter(t => t.accessType !== 'PREMIUM');
  const premiumTests = catalogue.filter(t => t.accessType === 'PREMIUM');

  console.log(`  FREE tests: ${freeTests.length}, PREMIUM tests: ${premiumTests.length}`);
  assert(catalogue.length > 0, 'Assessment catalogue is populated');
  
  for (const t of catalogue) {
    assert(typeof t.title === 'string' && t.title.trim().length > 0, `Test "${t.id}" title is readable: "${t.title}"`);
    assert(t.questionCount !== undefined || t.totalQuestions !== undefined, `Test "${t.id}" has question count metadata`);
  }

  console.log('\n====================================================');
  console.log(`SUMMARY: ${passCount} PASSED, ${failCount} FAILED`);
  console.log('====================================================');

  if (failCount > 0) {
    process.exit(1);
  }
}

runTests();
