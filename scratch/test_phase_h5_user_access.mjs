import { db } from '../server/db.ts';

console.log('====================================================');
console.log('🧪 PHASE H.5 — USER ACCESS & REAL ADMIN CREDIT GRANT');
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
  // 1. Setup test candidate & admin
  const testCandidateEmail = `h5_cand_${Date.now()}@example.com`;
  const candidate = db.loginOrRegister(testCandidateEmail, 'H5 Test Candidate');
  
  const superAdmin = db.getUserByEmail('pawankhot9@gmail.com') || db.getUserById('user_superadmin_pawankhot');
  assert(superAdmin !== undefined, 'Super Admin user found');

  // Test 1: Real Admin Credit Grant
  console.log('\n[TEST 1] Admin Credit Grant via DB / Ledger...');
  const initialBal = db.getDeepAICreditBalance(candidate.id);
  console.log('  Initial balance:', initialBal);
  
  const updatedBal = db.grantAdminCredits(candidate.id, superAdmin.id, 5, 'FREE', 'Testing Phase H.5 grant');
  assert(updatedBal.free === initialBal.free + 5, `FREE credits increased from ${initialBal.free} -> ${updatedBal.free}`);
  assert(updatedBal.total === initialBal.total + 5, `Total credits increased from ${initialBal.total} -> ${updatedBal.total}`);

  const ledger = db.getCreditLedger(candidate.id);
  const grantTxn = ledger.find(l => l.transactionType === 'ADMIN_GRANT');
  assert(grantTxn !== undefined, 'Auditable ADMIN_GRANT ledger entry exists');
  if (grantTxn) {
    assert(grantTxn.amount === 5, 'Ledger entry amount is +5');
    assert(grantTxn.source === 'FREE', 'Ledger entry source is FREE');
  }

  // Test 2: Temporary Ban & Protection of Primary Super Admin
  console.log('\n[TEST 2] Temporary Ban & Primary Super Admin Protection...');
  try {
    db.tempBanUser(superAdmin.id, superAdmin.id, 7, 'Attempting superadmin ban');
    assert(false, 'Primary Super Admin temp ban should have thrown an error');
  } catch (e) {
    assert(e.message.includes('Primary Super Admin account cannot be modified'), 'Primary Super Admin is protected from temp ban');
  }

  const tempBannedUser = db.tempBanUser(candidate.id, superAdmin.id, 3, 'Testing temp ban');
  assert(tempBannedUser.accountStatus === 'TEMPORARILY_BANNED', 'Candidate status updated to TEMPORARILY_BANNED');
  assert(Boolean(tempBannedUser.bannedUntil), 'bannedUntil timestamp populated');

  const statusCheck = db.checkUserAccountStatus(candidate.id);
  assert(statusCheck.allowed === false, 'Blocked user check returns allowed = false');
  assert(statusCheck.status === 'TEMPORARILY_BANNED', 'Blocked status is TEMPORARILY_BANNED');

  // Test 3: Restore Access
  console.log('\n[TEST 3] Restore Access...');
  const restoredUser = db.restoreUserAccess(candidate.id);
  assert(restoredUser.accountStatus === 'ACTIVE', 'Restored candidate status is ACTIVE');
  assert(restoredUser.bannedUntil === null, 'bannedUntil cleared');
  assert(db.checkUserAccountStatus(candidate.id).allowed === true, 'Restored user check returns allowed = true');

  // Test 4: Permanent Ban
  console.log('\n[TEST 4] Permanent Ban...');
  try {
    db.permBanUser(superAdmin.id, superAdmin.id, 'Attempting perm ban');
    assert(false, 'Primary Super Admin perm ban should have thrown error');
  } catch (e) {
    assert(e.message.includes('Primary Super Admin account cannot be modified'), 'Primary Super Admin protected from perm ban');
  }

  const permBannedUser = db.permBanUser(candidate.id, superAdmin.id, 'Testing permanent ban');
  assert(permBannedUser.accountStatus === 'PERMANENTLY_BANNED', 'Candidate status updated to PERMANENTLY_BANNED');
  assert(db.checkUserAccountStatus(candidate.id).allowed === false, 'Perm-banned user check returns allowed = false');

  // Test 5: Login / Re-registration blocked for perm-banned user
  try {
    db.loginOrRegister(testCandidateEmail, 'H5 Test Candidate');
    assert(false, 'Perm-banned user login/register should throw error');
  } catch (e) {
    assert(e.message.includes('permanently banned'), 'Perm-banned user login/register blocked with clear error message');
  }

  // Restore access before delete test
  db.restoreUserAccess(candidate.id);

  // Test 6: Delete Account (Tombstone)
  console.log('\n[TEST 6] Delete User Tombstone...');
  try {
    db.deleteUserTombstone(superAdmin.id, superAdmin.id);
    assert(false, 'Primary Super Admin delete should throw error');
  } catch (e) {
    assert(e.message.includes('Primary Super Admin account cannot be modified'), 'Primary Super Admin protected from deletion');
  }

  const deleteRes = db.deleteUserTombstone(candidate.id, superAdmin.id);
  assert(deleteRes.success === true, 'Delete tombstone returned success = true');
  const deletedUser = db.getUserById(candidate.id);
  assert(deletedUser.accountStatus === 'DELETED', 'User status updated to DELETED in DB');

  try {
    db.loginOrRegister(testCandidateEmail, 'H5 Test Candidate');
    assert(false, 'Deleted user re-registration should throw error');
  } catch (e) {
    assert(e.message.includes('deleted'), 'Deleted user re-registration blocked with clear error message');
  }

  // Clean up candidate row
  db.cleanupTemporaryUsers('h5_cand_');

  console.log('\n====================================================');
  console.log(`SUMMARY: ${passCount} PASSED, ${failCount} FAILED`);
  console.log('====================================================');

  if (failCount > 0) {
    process.exit(1);
  }
}

runTests();
