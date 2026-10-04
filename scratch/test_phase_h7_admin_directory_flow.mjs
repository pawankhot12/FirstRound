import { db } from '../server/db.ts';

console.log('====================================================');
console.log('🧪 PHASE H.7 — ADMIN USER DIRECTORY DATA FLOW SUITE');
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
  // Test 1: Query database directly for genuine production accounts
  console.log('[TEST 1] Querying DB for genuine production users (is_test = 0 OR NULL)...');
  const prodUsers = db.getAllUsers(false);
  console.log(`  Found ${prodUsers.length} production users in DB:`);
  prodUsers.forEach(u => console.log(`   - ID: ${u.id} | Name: ${u.name} | Email: ${u.email} | Role: ${u.role} | Status: ${u.accountStatus}`));

  assert(prodUsers.length >= 3, `Production user count is >= 3 (actual: ${prodUsers.length})`);
  assert(prodUsers.some(u => u.role === 'super_admin'), 'Super Admin user is included in directory');
  assert(prodUsers.filter(u => u.role === 'student').length >= 2, 'Student accounts are included in directory');

  // Test 2: Test API endpoint /api/admin/users via HTTP request
  console.log('\n[TEST 2] Testing GET /api/admin/users API Endpoint...');
  try {
    const superAdmin = prodUsers.find(u => u.role === 'super_admin');
    const res = await fetch('http://localhost:3000/api/admin/users', {
      headers: { 'Authorization': `Bearer ${superAdmin.id}` }
    });
    const data = await res.json();
    assert(data.success === true, 'API returned success = true');
    assert(Array.isArray(data.users), 'API returned users array');
    assert(data.users.length === prodUsers.length, `API users count (${data.users.length}) matches DB count (${prodUsers.length})`);
  } catch (e) {
    console.error('API endpoint test error:', e);
    assert(false, 'API endpoint GET /api/admin/users responded cleanly');
  }

  // Test 3: Test isolated new user registration scenario
  console.log('\n[TEST 3] Testing Isolated Future User Registration...');
  const newEmail = `future_student_${Date.now()}@gmail.com`;
  const newCandidateName = 'Future Registration Test Candidate';
  
  const registered = db.loginOrRegister(newEmail, newCandidateName, 'IIT Bombay', 'Google', 'Software Engineer');
  assert(registered !== undefined && registered.id !== undefined, 'New user successfully registered');

  const updatedDirectory = db.getAllUsers(false);
  assert(updatedDirectory.length === prodUsers.length + 1, `Directory count increased from ${prodUsers.length} -> ${updatedDirectory.length}`);
  const foundNew = updatedDirectory.find(u => u.email === newEmail);
  assert(foundNew !== undefined, 'Newly registered user appears in admin directory automatically');
  if (foundNew) {
    assert(foundNew.name === newCandidateName, 'Newly registered user name is preserved');
    assert(foundNew.role === 'student', 'Newly registered user role is student');
  }

  // Cleanup isolated test registration row
  db.sqliteDb.prepare('DELETE FROM users WHERE email = ?').run(newEmail);
  console.log('  Cleaned up isolated test registration row.');
  assert(db.getAllUsers(false).length === prodUsers.length, 'Database restored to clean 3 production accounts state');

  // Test 4: Role filtering behavior
  console.log('\n[TEST 4] Testing Role Filtering Consistency...');
  const students = prodUsers.filter(u => u.role === 'student');
  const admins = prodUsers.filter(u => u.role === 'admin');
  const superAdmins = prodUsers.filter(u => u.role === 'super_admin');

  assert(students.length + admins.length + superAdmins.length === prodUsers.length, 'Role sum matches total production accounts');

  console.log('\n====================================================');
  console.log(`SUMMARY: ${passCount} PASSED, ${failCount} FAILED`);
  console.log('====================================================');

  if (failCount > 0) {
    process.exit(1);
  }
}

runTests();
