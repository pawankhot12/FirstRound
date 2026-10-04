import { db } from '../server/db';
import { canUserAccessAssessment, hasAssessmentAccess } from '../server/entitlements';
import { Assessment, User } from '../src/types';

async function runPhase2Tests() {
  console.log('=== STARTING PHASE 2 PREMIUM ENTITLEMENTS & PLUS SELECTION TEST SUITE ===\n');
  let passedCount = 0;
  let totalCount = 0;

  function assert(condition: boolean, testName: string, detail?: string) {
    totalCount++;
    if (condition) {
      console.log(`[PASS] Test ${totalCount}: ${testName}`);
      passedCount++;
    } else {
      console.error(`[FAIL] Test ${totalCount}: ${testName}`);
      if (detail) console.error(`       Detail: ${detail}`);
    }
  }

  const timestamp = Date.now();

  // Create clean users in SQLite DB
  const freeUser = db.loginOrRegister(`p2_free_${timestamp}@test.com`, 'Phase2 Free User', 'College A', 'Target B', 'Role C', 'student');
  const plusUser = db.loginOrRegister(`p2_plus_${timestamp}@test.com`, 'Phase2 Plus User', 'College A', 'Target B', 'Role C', 'student');
  const proUser = db.loginOrRegister(`p2_pro_${timestamp}@test.com`, 'Phase2 Pro User', 'College A', 'Target B', 'Role C', 'student');

  // Insert mock test records into SQLite `tests` table so `selectPlusAssessment` and `getTestById` validate properly
  const freeTestId = `p2_free_test_${timestamp}`;
  const premTest1Id = `p2_prem_test_1_${timestamp}`;
  const premTest2Id = `p2_prem_test_2_${timestamp}`;
  const premTest3Id = `p2_prem_test_3_${timestamp}`;
  const futurePremTestId = `p2_future_prem_test_${timestamp}`;

  db.sqliteDb.prepare(`
    INSERT INTO tests (id, title, category, accessType, status, durationMinutes, totalQuestions, createdAt)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(freeTestId, 'P2 Free Test', 'foundation', 'FREE', 'ready', 30, 10, new Date().toISOString());

  db.sqliteDb.prepare(`
    INSERT INTO tests (id, title, category, accessType, status, durationMinutes, totalQuestions, createdAt)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(premTest1Id, 'P2 Premium Test 1', 'company', 'PREMIUM', 'ready', 45, 20, new Date().toISOString());

  db.sqliteDb.prepare(`
    INSERT INTO tests (id, title, category, accessType, status, durationMinutes, totalQuestions, createdAt)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(premTest2Id, 'P2 Premium Test 2', 'coding', 'PREMIUM', 'ready', 60, 15, new Date().toISOString());

  db.sqliteDb.prepare(`
    INSERT INTO tests (id, title, category, accessType, status, durationMinutes, totalQuestions, createdAt)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(premTest3Id, 'P2 Premium Test 3', 'company', 'PREMIUM', 'ready', 45, 20, new Date().toISOString());

  const oneMonthMs = 30 * 24 * 60 * 60 * 1000;

  // Set subscription plans
  db.updateSubscriptionState(plusUser.id, {
    plan: 'PLUS',
    status: 'active',
    currentPeriodStart: Date.now(),
    currentPeriodEnd: Date.now() + oneMonthMs,
    cancelAtPeriodEnd: false
  });

  db.updateSubscriptionState(proUser.id, {
    plan: 'PRO',
    status: 'active',
    currentPeriodStart: Date.now(),
    currentPeriodEnd: Date.now() + oneMonthMs,
    cancelAtPeriodEnd: false
  });

  // TEST 1: FREE user accessing free assessment -> ALLOW
  const t1 = canUserAccessAssessment(freeUser.id, freeTestId, db);
  assert(t1.allowed === true, 'FREE user: Free assessment -> ALLOW');

  // TEST 2: FREE user accessing premium assessment -> DENY
  const t2 = canUserAccessAssessment(freeUser.id, premTest1Id, db);
  assert(t2.allowed === false, 'FREE user: Premium assessment -> DENY');

  // TEST 3: PLUS user with 0/2 selections -> can select
  const sel0 = db.getUserPlusSelections(plusUser.id);
  assert(sel0.length === 0, 'PLUS: Initially 0/2 selections');
  const selRes1 = db.selectPlusAssessment(plusUser.id, premTest1Id);
  assert(selRes1.success === true && selRes1.selected.length === 1, 'PLUS: 0/2 selections -> can select first Premium assessment');

  // TEST 4: PLUS user with 1/2 selections -> can select another
  const selRes2 = db.selectPlusAssessment(plusUser.id, premTest2Id);
  assert(selRes2.success === true && selRes2.selected.length === 2, 'PLUS: 1/2 selections -> can select second Premium assessment');

  // TEST 5: PLUS user with 2/2 selections -> third selection denied by backend
  const selRes3 = db.selectPlusAssessment(plusUser.id, premTest3Id);
  assert(selRes3.success === false && Boolean(selRes3.error?.includes('Maximum limit')), 'PLUS: 2/2 selections -> third selection DENIED by backend');

  // TEST 6: PLUS: Selected Premium assessment -> accessible
  const t6 = canUserAccessAssessment(plusUser.id, premTest1Id, db);
  assert(t6.allowed === true && t6.unlockedVia === 'plus_selection', 'PLUS: Selected Premium assessment #1 -> ACCESSIBLE');

  // TEST 7: PLUS: Unselected Premium assessment -> denied
  const t7 = canUserAccessAssessment(plusUser.id, premTest3Id, db);
  assert(t7.allowed === false, 'PLUS: Unselected Premium assessment #3 -> DENIED');

  // TEST 8: PLUS: Deselect -> access removed
  const deselRes = db.deselectPlusAssessment(plusUser.id, premTest1Id);
  assert(deselRes.success === true && !deselRes.selected.includes(premTest1Id), 'PLUS: Deselect test #1 -> removed from selections');
  const t8 = canUserAccessAssessment(plusUser.id, premTest1Id, db);
  assert(t8.allowed === false, 'PLUS: Deselected Premium assessment #1 -> ACCESS REMOVED');

  // TEST 9: PRO: Existing Premium assessment -> accessible
  const t9 = canUserAccessAssessment(proUser.id, premTest1Id, db);
  assert(t9.allowed === true && t9.unlockedVia === 'subscription', 'PRO: Existing Premium assessment -> ACCESSIBLE');

  // TEST 10: PRO: New Premium assessment created later -> automatically accessible
  db.sqliteDb.prepare(`
    INSERT INTO tests (id, title, category, accessType, status, durationMinutes, totalQuestions, createdAt)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(futurePremTestId, 'P2 Future Premium Test', 'coding', 'PREMIUM', 'ready', 60, 20, new Date().toISOString());

  const t10 = canUserAccessAssessment(proUser.id, futurePremTestId, db);
  assert(t10.allowed === true && t10.unlockedVia === 'subscription', 'PRO: New Premium assessment created later -> AUTOMATICALLY ACCESSIBLE');

  // TEST 11: FREE: New Premium assessment -> denied
  const t11 = canUserAccessAssessment(freeUser.id, futurePremTestId, db);
  assert(t11.allowed === false, 'FREE: New Premium assessment -> DENIED');

  // TEST 12: PRO: Selection UI does not appear (verify Plus selections is empty for PRO)
  const proSelections = db.getUserPlusSelections(proUser.id);
  assert(proSelections.length === 0, 'PRO: Has no individual selection rows requirement');

  // TEST 13: PLUS: Selection counter reflects actual database
  // Re-select premTest1 for plusUser
  db.selectPlusAssessment(plusUser.id, premTest1Id);
  const curSelections = db.getUserPlusSelections(plusUser.id);
  const plusSubInfo = db.getUserSubscription(plusUser.id);
  assert(plusSubInfo.selectedAssessmentIds.length === curSelections.length, 'PLUS: Selection counter reflects actual database state');

  // TEST 14: Refresh: Selections persist in database across calls
  const persistedSub = db.getUserSubscription(plusUser.id);
  assert(persistedSub.selectedAssessmentIds.includes(premTest1Id), 'Refresh: Selections persist in database');

  // TEST 15: Direct URL/API check (simulate test question retrieval logic)
  const testMeta = db.getTestById(premTest3Id, true);
  const accessCheckDirect = hasAssessmentAccess(freeUser, testMeta, db);
  assert(accessCheckDirect.allowed === false, 'Direct URL/API: FREE user cannot bypass Premium access to retrieve questions');

  // TEST 16: PRO -> PLUS: After transition, only selected Premium tests are accessible
  const transitionUser = db.loginOrRegister(`p2_trans_${timestamp}@test.com`, 'Phase2 Transition User', 'College A', 'Target B', 'Role C', 'student');
  db.updateSubscriptionState(transitionUser.id, {
    plan: 'PRO',
    status: 'active',
    currentPeriodStart: Date.now() - 1000,
    currentPeriodEnd: Date.now() - 10,
    cancelAtPeriodEnd: false,
    pendingPlan: 'PLUS'
  });

  const transitionedSub = db.getUserSubscription(transitionUser.id);
  assert(transitionedSub.plan === 'PLUS', 'PRO -> PLUS: Subscription transitioned to PLUS plan after period end');
  const t16_unselected = canUserAccessAssessment(transitionUser.id, premTest1Id, db);
  assert(t16_unselected.allowed === false, 'PRO -> PLUS: Unselected Premium test is DENIED after transition');

  // Select 1 test under new PLUS plan
  db.selectPlusAssessment(transitionUser.id, premTest1Id);
  const t16_selected = canUserAccessAssessment(transitionUser.id, premTest1Id, db);
  assert(t16_selected.allowed === true, 'PRO -> PLUS: Newly selected Premium test is ACCESSIBLE under PLUS plan');

  // TEST 17: Cancellation before period end: Existing access remains
  const cancelUser = db.loginOrRegister(`p2_cancel_${timestamp}@test.com`, 'Phase2 Cancel User', 'College A', 'Target B', 'Role C', 'student');
  db.updateSubscriptionState(cancelUser.id, {
    plan: 'PLUS',
    status: 'active',
    currentPeriodStart: Date.now(),
    currentPeriodEnd: Date.now() + oneMonthMs,
    cancelAtPeriodEnd: true
  });
  db.selectPlusAssessment(cancelUser.id, premTest1Id);

  const t17 = canUserAccessAssessment(cancelUser.id, premTest1Id, db);
  assert(t17.allowed === true, 'Cancellation before period end: Existing access remains ACTIVE');

  // TEST 18: Cancellation after period end: Access follows resolved plan (FREE)
  db.updateSubscriptionState(cancelUser.id, {
    currentPeriodEnd: Date.now() - 10
  });

  const cancelledSub = db.getUserSubscription(cancelUser.id);
  assert(cancelledSub.plan === 'FREE', 'Cancellation after period end: Resolved to FREE plan');
  const t18 = canUserAccessAssessment(cancelUser.id, premTest1Id, db);
  assert(t18.allowed === false, 'Cancellation after period end: Access is DENIED per FREE plan rules');

  console.log(`\n=== PHASE 2 TEST SUITE COMPLETED: ${passedCount}/${totalCount} TESTS PASSED ===`);
  if (passedCount === totalCount) {
    process.exit(0);
  } else {
    process.exit(1);
  }
}

runPhase2Tests().catch(err => {
  console.error('Phase 2 test runner exception:', err);
  process.exit(1);
});
