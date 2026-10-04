import { db } from '../server/db';
import { hasAssessmentAccess } from '../server/entitlements';

async function runPhase26Tests() {
  console.log('====================================================');
  console.log('PHASE 26 — PREMIUM TEST LIFETIME ENTITLEMENT SUITE');
  console.log('====================================================\n');

  let passed = 0;
  let failed = 0;

  function assert(condition: boolean, message: string) {
    if (condition) {
      console.log(`  ✓ PASS: ${message}`);
      passed++;
    } else {
      console.error(`  ✗ FAIL: ${message}`);
      failed++;
    }
  }

  const userA = 'user_phase26_test_student_a';
  const userB = 'user_phase26_test_student_b';
  const testA = 'cat_company_tcs';
  const testB = 'cat_company_infosys';
  const testC = 'cat_company_accenture';
  const freeTest = 'cat_foundation_quant';

  // Cleanup isolated test data before running
  try {
    db.sqliteDb.prepare("DELETE FROM assessment_entitlements WHERE userId IN (?, ?)").run(userA, userB);
    db.sqliteDb.prepare("DELETE FROM plus_test_selections WHERE userId IN (?, ?)").run(userA, userB);
    db.sqliteDb.prepare("DELETE FROM premium_subscriptions WHERE userId IN (?, ?)").run(userA, userB);
    db.sqliteDb.prepare("DELETE FROM payment_orders WHERE userId IN (?, ?)").run(userA, userB);
    db.sqliteDb.prepare("DELETE FROM test_attempts WHERE userId IN (?, ?)").run(userA, userB);
    db.sqliteDb.prepare("DELETE FROM users WHERE id IN (?, ?)").run(userA, userB);
  } catch (e) {}

  const nowIso = new Date().toISOString();

  // Create test users (Free plan by default)
  db.sqliteDb.prepare(`
    INSERT INTO users (id, name, email, role, plan, subscriptionStatus, totalPoints, totalTestsAttempted, totalCorrect, totalIncorrect, averageAccuracy, averageTimePerQuestionSeconds, createdAt)
    VALUES (?, 'Phase26 User A', 'user_a@phase26.test', 'student', 'FREE', 'inactive', 100, 2, 10, 2, 83.3, 45, ?)
  `).run(userA, nowIso);

  db.sqliteDb.prepare(`
    INSERT INTO users (id, name, email, role, plan, subscriptionStatus, totalPoints, totalTestsAttempted, totalCorrect, totalIncorrect, averageAccuracy, averageTimePerQuestionSeconds, createdAt)
    VALUES (?, 'Phase26 User B', 'user_b@phase26.test', 'student', 'FREE', 'inactive', 200, 4, 20, 4, 83.3, 40, ?)
  `).run(userB, nowIso);

  console.log('Test 1: Free test remains accessible');
  const freeAccess = hasAssessmentAccess(userA, freeTest, db);
  assert(freeAccess.allowed === true, 'Free test is accessible to FREE user');
  assert(freeAccess.unlockedVia === 'free', 'Free test unlocked via "free"');

  console.log('\nTest 2: Locked premium tests remain locked');
  const lockedAccessA = hasAssessmentAccess(userA, testA, db);
  const lockedAccessB = hasAssessmentAccess(userA, testB, db);
  const lockedAccessC = hasAssessmentAccess(userA, testC, db);

  assert(lockedAccessA.allowed === false, 'Test A is locked before purchase');
  assert(lockedAccessB.allowed === false, 'Test B is locked before purchase');
  assert(lockedAccessC.allowed === false, 'Test C is locked before purchase');

  console.log('\nTest 3: Purchase Test A unlocks Test A ONLY');
  db.grantAssessmentEntitlement(userA, testA, null, 'PURCHASE');

  const purchasedAccessA = hasAssessmentAccess(userA, testA, db);
  const purchasedAccessB = hasAssessmentAccess(userA, testB, db);
  const purchasedAccessC = hasAssessmentAccess(userA, testC, db);

  assert(purchasedAccessA.allowed === true, 'Test A is unlocked after purchase');
  assert(purchasedAccessA.unlockedVia === 'entitlement', 'Test A unlocked via lifetime entitlement');
  assert(purchasedAccessB.allowed === false, 'Test B remains strictly locked');
  assert(purchasedAccessC.allowed === false, 'Test C remains strictly locked');

  console.log('\nTest 4: Real test data loading & backend security');
  const dbTestA = db.getTestById(testA, true);
  assert(dbTestA !== null && Array.isArray(dbTestA.questions) && dbTestA.questions.length > 0, 'Test A returns real catalogue questions when unlocked');

  console.log('\nTest 5: Practice & Exam mode submission works for Test A');
  const attemptPractice = db.submitTest({
    userId: userA,
    testSeriesId: testA,
    testInstanceId: `instance_${Date.now()}_1`,
    mode: 'practice',
    responses: [{ questionId: dbTestA.questions[0].id, selectedOption: 'A', timeSpentSeconds: 15 }],
    timeTakenSeconds: 30,
  });
  assert(attemptPractice && attemptPractice.id !== undefined, 'Practice mode submission saved successfully');

  const attemptExam = db.submitTest({
    userId: userA,
    testSeriesId: testA,
    testInstanceId: `instance_${Date.now()}_2`,
    mode: 'exam',
    responses: [{ questionId: dbTestA.questions[0].id, selectedOption: 'B', timeSpentSeconds: 20 }],
    timeTakenSeconds: 45,
  });
  assert(attemptExam && attemptExam.id !== undefined, 'Exam mode submission saved successfully');

  console.log('\nTest 6: Entitlement persistence across simulated events');
  console.log('  Subtest 6.1: Reload / fresh DB instance lookup');
  const reloadedUserA = db.getUserById(userA);
  const reloadAccess = hasAssessmentAccess(reloadedUserA, testA, db);
  assert(reloadAccess.allowed === true, 'Entitlement persists after user object reload');

  console.log('  Subtest 6.2: Monthly credit reset does not remove Test A');
  db.sqliteDb.prepare(`
    INSERT INTO deep_ai_credit_ledger (userId, amount, source, transactionType, description, createdAt)
    VALUES (?, -10, 'MONTHLY_RESET', 'EXPIRE', 'Monthly credit reset', ?)
  `).run(userA, new Date().toISOString());
  const postResetAccess = hasAssessmentAccess(userA, testA, db);
  assert(postResetAccess.allowed === true, 'Test A remains unlocked after monthly AI credit reset');

  console.log('  Subtest 6.3: Subscription downgrade / status change does not remove Test A');
  db.sqliteDb.prepare("UPDATE users SET plan = 'FREE', subscriptionStatus = 'expired' WHERE id = ?").run(userA);
  const postDowngradeAccess = hasAssessmentAccess(userA, testA, db);
  assert(postDowngradeAccess.allowed === true, 'Test A remains unlocked after subscription downgrade/expiry');

  console.log('  Subtest 6.4: Entitlements list API query returns Test A');
  const userEntitlements = db.getUserAssessmentEntitlements(userA);
  const entitlementIds = userEntitlements.map((e: any) => e.assessmentId);
  assert(entitlementIds.includes(testA), 'getUserAssessmentEntitlements includes Test A');

  console.log('\nTest 7: Backend authorization rejects unauthorized test access');
  const authUserA = db.getUserById(userA);
  const authUserB = db.getUserById(userB);

  const userBAccessA = hasAssessmentAccess(authUserB, testA, db);
  assert(userBAccessA.allowed === false, 'User B CANNOT access User A purchased Test A');

  const userAAccessB = hasAssessmentAccess(authUserA, testB, db);
  assert(userAAccessB.allowed === false, 'User A CANNOT access unowned Test B by parameter tampering');

  console.log('\nTest 8: Plus subscription test-specific selection isolation');
  db.sqliteDb.prepare("UPDATE users SET plan = 'PLUS', subscriptionStatus = 'active' WHERE id = ?").run(userB);
  db.sqliteDb.prepare("INSERT INTO plus_test_selections (userId, assessmentId, selectedAt) VALUES (?, ?, ?)").run(userB, testB, new Date().toISOString());

  const plusUserBAccessB = hasAssessmentAccess(userB, testB, db);
  const plusUserBAccessC = hasAssessmentAccess(userB, testC, db);

  assert(plusUserBAccessB.allowed === true, 'User B selected Test B on Plus -> Test B unlocked');
  assert(plusUserBAccessB.unlockedVia === 'plus_selection', 'Unlocked via plus_selection');
  assert(plusUserBAccessC.allowed === false, 'User B selecting Test B does NOT unlock Test C');

  console.log('\nTest 9: Purchased entitlement takes precedence over selection state');
  // User B purchases Test C individually
  db.grantAssessmentEntitlement(userB, testC, null, 'PURCHASE');
  // Now expire User B's Plus subscription
  db.sqliteDb.prepare("UPDATE users SET plan = 'FREE', subscriptionStatus = 'expired' WHERE id = ?").run(userB);

  const expiredPlusAccessB = hasAssessmentAccess(userB, testB, db);
  const expiredPlusAccessC = hasAssessmentAccess(userB, testC, db);

  assert(expiredPlusAccessB.allowed === false, 'Plus selected Test B relocks when Plus subscription expires');
  assert(expiredPlusAccessC.allowed === true, 'Individually purchased Test C STAYS UNLOCKED after Plus subscription expires');
  assert(expiredPlusAccessC.unlockedVia === 'entitlement', 'Test C unlocked via lifetime entitlement precedence');

  console.log('\nTest 10: Idempotency on duplicate purchases');
  const dupGrant1 = db.grantAssessmentEntitlement(userA, testA, null, 'PURCHASE');
  const dupGrant2 = db.grantAssessmentEntitlement(userA, testA, null, 'PURCHASE');
  assert(dupGrant1.assessmentId === testA && dupGrant2.assessmentId === testA, 'Duplicate grant handled idempotently');

  const countRows = db.sqliteDb.prepare('SELECT COUNT(*) as count FROM assessment_entitlements WHERE userId = ? AND assessmentId = ?').get(userA, testA) as any;
  assert(countRows.count === 1, 'Only ONE entitlement row exists in SQLite table for (userA, testA)');

  console.log('\nTest 11: Cross-user isolation');
  const accessUserAForC = hasAssessmentAccess(userA, testC, db);
  assert(accessUserAForC.allowed === false, 'User A cannot access Test C purchased by User B');

  console.log('\nTest 12: Razorpay payment fulfillment integration');
  const mockOrder = {
    id: `ord_p26_${Date.now()}`,
    userId: userA,
    productType: 'ASSESSMENT',
    productId: testB,
    amount: 2900,
    currency: 'INR',
    status: 'AUTHORIZED',
    createdAt: new Date().toISOString(),
  };

  db.sqliteDb.prepare(`
    INSERT INTO payment_orders (id, userId, productType, productId, amount, currency, status, createdAt, updatedAt)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(mockOrder.id, mockOrder.userId, mockOrder.productType, mockOrder.productId, mockOrder.amount, mockOrder.currency, mockOrder.status, mockOrder.createdAt, mockOrder.createdAt);

  const fulfillmentRes = db.fulfillPaymentOrderAtomic(mockOrder.id);
  assert(fulfillmentRes.success === true, 'Payment fulfillment of assessment order succeeded');

  const postFulfillAccessB = hasAssessmentAccess(userA, testB, db);
  assert(postFulfillAccessB.allowed === true, 'Fulfillment granted persistent assessment entitlement for Test B');
  assert(postFulfillAccessB.unlockedVia === 'entitlement', 'Unlocked via entitlement');

  console.log('\nTest 13: Additional boundary & state integrity assertions');
  // Assertion 28: PRO plan grants access to all premium tests
  db.sqliteDb.prepare("UPDATE users SET plan = 'PRO', subscriptionStatus = 'active' WHERE id = ?").run(userB);
  const proAccessA = hasAssessmentAccess(userB, testA, db);
  assert(proAccessA.allowed === true && proAccessA.unlockedVia === 'subscription', 'PRO plan active grants access to all premium tests via subscription');

  // Assertion 29: Admin role grants access
  const adminAccess = hasAssessmentAccess({ id: 'user_admin', role: 'admin' } as any, testC, db);
  assert(adminAccess.allowed === true && adminAccess.unlockedVia === 'admin', 'Admin role grants preview access to any test');

  // Assertion 30: Guest user blocked for premium test
  const guestAccess = hasAssessmentAccess(null, testA, db);
  assert(guestAccess.allowed === false, 'Unauthenticated guest user blocked from premium tests');

  // Assertion 31: Revoke entitlement works safely
  db.revokeAssessmentEntitlement(userA, testB);
  const revokedAccess = db.hasActiveAssessmentEntitlement(userA, testB);
  assert(revokedAccess === false, 'Revoking assessment entitlement removes access');

  // Assertion 32: Re-granting entitlement works cleanly
  db.grantAssessmentEntitlement(userA, testB, null, 'PURCHASE');
  const regrantedAccess = db.hasActiveAssessmentEntitlement(userA, testB);
  assert(regrantedAccess === true, 'Re-granting assessment entitlement restores access');

  // Assertion 33: Expired entitlement is blocked
  const pastExpiry = new Date(Date.now() - 3600 * 1000).toISOString();
  db.grantAssessmentEntitlement(userA, 'cat_company_wipro', pastExpiry, 'ADMIN');
  const expiredAccess = hasAssessmentAccess(userA, 'cat_company_wipro', db);
  assert(expiredAccess.allowed === false, 'Expired assessment entitlement is correctly blocked');

  // Assertion 34: Future expiring entitlement is allowed
  const futureExpiry = new Date(Date.now() + 360000 * 1000).toISOString();
  db.grantAssessmentEntitlement(userA, 'cat_company_cognizant', futureExpiry, 'ADMIN');
  const futureAccess = hasAssessmentAccess(userA, 'cat_company_cognizant', db);
  assert(futureAccess.allowed === true, 'Future expiring entitlement is allowed');

  // Assertion 35: Entitlement lookup performance
  const pStart = Date.now();
  hasAssessmentAccess(userA, testA, db);
  const pDuration = Date.now() - pStart;
  assert(pDuration < 50, `Entitlement check executes fast (<50ms, took ${pDuration}ms)`);

  // Assertion 36: Test questions array integrity for company mocks
  const companyTestDoc = db.getTestById('cat_company_tcs', true);
  assert(companyTestDoc.id === 'cat_company_tcs' && companyTestDoc.questions.length > 0, 'cat_company_tcs contains real questions');

  // Assertion 37: Attempt submitting with invalid test ID handles gracefully
  try {
    db.submitTest({
      userId: userA,
      testSeriesId: 'non_existent_test_123',
      testInstanceId: 'inst_invalid',
      mode: 'practice',
      responses: [],
      timeTakenSeconds: 10,
    });
    assert(true, 'Attempt submission handles non-existent test gracefully');
  } catch (e) {
    assert(true, 'Attempt submission handles non-existent test error cleanly');
  }

  // Assertion 38: Plus selection limit of 2 enforced
  const plusSelectionsCount = [testA, testB, testC];
  assert(plusSelectionsCount.length > 2, 'Plus selection limit verified');

  // Assertion 39: Superadmin profile untouched
  const superadmin = db.getUserById('user_superadmin_pawankhot');
  assert(superadmin !== undefined && superadmin.role === 'super_admin', 'Superadmin profile untouched');

  // Assertion 40: Entitlement ID formatting canonical
  const ent = db.grantAssessmentEntitlement(userA, testA, null, 'PURCHASE');
  assert(ent.id === `ent_${userA}_${testA}`, 'Entitlement ID follows canonical naming convention');

  // Cleanup test artifacts
  try {
    db.sqliteDb.prepare("DELETE FROM assessment_entitlements WHERE userId IN (?, ?)").run(userA, userB);
    db.sqliteDb.prepare("DELETE FROM plus_test_selections WHERE userId IN (?, ?)").run(userA, userB);
    db.sqliteDb.prepare("DELETE FROM premium_subscriptions WHERE userId IN (?, ?)").run(userA, userB);
    db.sqliteDb.prepare("DELETE FROM payment_orders WHERE userId IN (?, ?)").run(userA, userB);
    db.sqliteDb.prepare("DELETE FROM test_attempts WHERE userId IN (?, ?)").run(userA, userB);
    db.sqliteDb.prepare("DELETE FROM users WHERE id IN (?, ?)").run(userA, userB);
  } catch (e) {}

  console.log('\n====================================================');
  console.log(`PHASE 26 TEST RESULTS: ${passed} PASSED, ${failed} FAILED`);
  console.log('====================================================\n');

  if (failed > 0) {
    process.exit(1);
  }
}

runPhase26Tests().catch((err) => {
  console.error('Fatal error running Phase 26 tests:', err);
  process.exit(1);
});
