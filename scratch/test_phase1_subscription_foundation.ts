import { db } from '../server/db';
import { canUserAccessAssessment, hasAssessmentAccess } from '../server/entitlements';
import { Assessment } from '../src/types';

async function runTests() {
  console.log('=== STARTING PHASE 1 SUBSCRIPTION FOUNDATION TEST SUITE ===\n');
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

  // Helper setup: Create clean test users in SQLite DB
  const timestamp = Date.now();

  const freeUser = db.loginOrRegister(`free_${timestamp}@test.com`, 'Free Test User', 'College A', 'Target B', 'Role C', 'student');
  const plusUser = db.loginOrRegister(`plus_${timestamp}@test.com`, 'Plus Test User', 'College A', 'Target B', 'Role C', 'student');
  const proUser = db.loginOrRegister(`pro_${timestamp}@test.com`, 'Pro Test User', 'College A', 'Target B', 'Role C', 'student');

  // Helper mock assessments
  const freeAssessment: Assessment = {
    id: `test_free_assessment_${timestamp}`,
    title: 'Free Aptitude Mock Test',
    description: 'Free access test',
    category: 'Aptitude',
    durationMinutes: 30,
    totalQuestions: 10,
    passingScore: 50,
    accessType: 'FREE',
    questions: [],
    tags: ['free'],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };

  const premiumAssessment1: Assessment = {
    id: `test_prem_assessment_1_${timestamp}`,
    title: 'Premium Assessment 1 (Accenture)',
    description: 'Premium test 1',
    category: 'Aptitude',
    durationMinutes: 45,
    totalQuestions: 20,
    passingScore: 60,
    accessType: 'PREMIUM',
    questions: [],
    tags: ['premium'],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };

  const premiumAssessment2: Assessment = {
    id: `test_prem_assessment_2_${timestamp}`,
    title: 'Premium Assessment 2 (TCS)',
    description: 'Premium test 2',
    category: 'Coding',
    durationMinutes: 60,
    totalQuestions: 15,
    passingScore: 70,
    accessType: 'PREMIUM',
    questions: [],
    tags: ['premium'],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };

  const premiumAssessment3: Assessment = {
    id: `test_prem_assessment_3_${timestamp}`,
    title: 'Premium Assessment 3 (Infosys)',
    description: 'Premium test 3',
    category: 'Technical',
    durationMinutes: 45,
    totalQuestions: 20,
    passingScore: 65,
    accessType: 'PREMIUM',
    questions: [],
    tags: ['premium'],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };

  const newFuturePremiumAssessment: Assessment = {
    id: `test_prem_assessment_future_${timestamp}`,
    title: 'Newly Added Future Premium Assessment (Wipro)',
    description: 'Future premium test created after user subscribed',
    category: 'Core CS',
    durationMinutes: 60,
    totalQuestions: 25,
    passingScore: 75,
    accessType: 'PREMIUM',
    questions: [],
    tags: ['premium'],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };

  // TEST 1: New user with no subscription
  const user1Sub = db.getUserSubscription(freeUser.id);
  assert(user1Sub.plan === 'FREE', 'New user defaults to FREE subscription', `Got plan: ${user1Sub.plan}`);

  // TEST 2: FREE user accessing free assessment -> ALLOW
  const freeAccessCheck = canUserAccessAssessment(freeUser, freeAssessment);
  assert(freeAccessCheck.allowed === true, 'FREE user accessing free assessment is ALLOWED');

  // TEST 3: FREE user accessing premium assessment -> DENY
  const freePremCheck = canUserAccessAssessment(freeUser, premiumAssessment1);
  assert(freePremCheck.allowed === false, 'FREE user accessing premium assessment is DENIED', `Reason: ${freePremCheck.reason}`);

  // TEST 4: PLUS user with selected Premium test #1 -> ALLOW test #1
  // Set user2 to PLUS
  const oneMonthMs = 30 * 24 * 60 * 60 * 1000;
  db.updateSubscriptionState(plusUser.id, {
    plan: 'PLUS',
    status: 'active',
    currentPeriodStart: Date.now(),
    currentPeriodEnd: Date.now() + oneMonthMs,
    cancelAtPeriodEnd: false,
    pendingPlan: null
  });

  // Select test #1 for plusUser
  const sel1 = db.selectPlusAssessment(plusUser.id, premiumAssessment1.id);
  assert(sel1.success === true, 'PLUS user can select Premium test #1');

  const plusTest1Check = canUserAccessAssessment(plusUser, premiumAssessment1);
  assert(plusTest1Check.allowed === true, 'PLUS user accessing selected Premium test #1 is ALLOWED');

  // TEST 5: PLUS user with unselected Premium test -> DENY
  const plusTest2Check = canUserAccessAssessment(plusUser, premiumAssessment2);
  assert(plusTest2Check.allowed === false, 'PLUS user accessing unselected Premium test #2 is DENIED');

  // TEST 6: PLUS user attempts to select 3 Premium tests -> DENY third selection
  const sel2 = db.selectPlusAssessment(plusUser.id, premiumAssessment2.id);
  assert(sel2.success === true, 'PLUS user selects Premium test #2 (total 2)');

  const sel3 = db.selectPlusAssessment(plusUser.id, premiumAssessment3.id);
  assert(sel3.success === false && Boolean(sel3.error?.includes('Maximum limit')), 'PLUS user selecting 3rd Premium test is DENIED by backend', `Error: ${sel3.error}`);

  // TEST 7: PRO user accessing existing Premium assessment -> ALLOW
  db.updateSubscriptionState(proUser.id, {
    plan: 'PRO',
    status: 'active',
    currentPeriodStart: Date.now(),
    currentPeriodEnd: Date.now() + oneMonthMs,
    cancelAtPeriodEnd: false,
    pendingPlan: null
  });

  const proCheck1 = canUserAccessAssessment(proUser, premiumAssessment1);
  assert(proCheck1.allowed === true, 'PRO user accessing existing Premium assessment #1 is ALLOWED');

  // TEST 8: PRO user accessing newly created Premium assessment -> ALLOW automatically
  const proCheckFuture = canUserAccessAssessment(proUser, newFuturePremiumAssessment);
  assert(proCheckFuture.allowed === true, 'PRO user accessing newly created future Premium assessment is ALLOWED automatically');

  // TEST 9: PLUS cancellation: Before period end -> PLUS access remains; After period end -> FREE
  const tempCancelUser = db.loginOrRegister(`cancel_${timestamp}@test.com`, 'Cancel Test User', 'College A', 'Target B', 'Role C', 'student');
  db.updateSubscriptionState(tempCancelUser.id, {
    plan: 'PLUS',
    status: 'active',
    currentPeriodStart: Date.now() - 1000,
    currentPeriodEnd: Date.now() + 5000, // active for 5 more seconds
    cancelAtPeriodEnd: true,
    pendingPlan: null
  });
  db.selectPlusAssessment(tempCancelUser.id, premiumAssessment1.id);

  // Before period end
  const beforeEndSub = db.getUserSubscription(tempCancelUser.id);
  assert(beforeEndSub.plan === 'PLUS' && beforeEndSub.status === 'active', 'PLUS cancelled before period end: Plan remains PLUS & active');
  const beforeEndAccess = canUserAccessAssessment(db.getUserById(tempCancelUser.id), premiumAssessment1);
  assert(beforeEndAccess.allowed === true, 'PLUS cancelled before period end: Retains access to selected test #1');

  // After period end (simulating expired currentPeriodEnd)
  db.updateSubscriptionState(tempCancelUser.id, {
    currentPeriodEnd: Date.now() - 1000 // expired 1s ago
  });
  const afterEndSub = db.getUserSubscription(tempCancelUser.id);
  assert(afterEndSub.plan === 'FREE', 'PLUS cancelled after period end: Automatically resolves to FREE plan', `Got plan: ${afterEndSub.plan}`);
  const afterEndAccess = canUserAccessAssessment(db.getUserById(tempCancelUser.id), premiumAssessment1);
  assert(afterEndAccess.allowed === false, 'PLUS cancelled after period end: Access to Premium test is DENIED');

  // TEST 10: PRO scheduled downgrade to PLUS: Before period end -> PRO access remains; After period end -> PLUS rules apply
  const tempDowngradeUser = db.loginOrRegister(`downgrade_${timestamp}@test.com`, 'Downgrade User', 'College A', 'Target B', 'Role C', 'student');
  db.updateSubscriptionState(tempDowngradeUser.id, {
    plan: 'PRO',
    status: 'active',
    currentPeriodStart: Date.now() - 1000,
    currentPeriodEnd: Date.now() + 5000,
    cancelAtPeriodEnd: false,
    pendingPlan: 'PLUS'
  });

  const beforeDowngradeSub = db.getUserSubscription(tempDowngradeUser.id);
  assert(beforeDowngradeSub.plan === 'PRO' && beforeDowngradeSub.pendingPlan === 'PLUS', 'PRO scheduled downgrade before period end: Remains PRO with pendingPlan = PLUS');
  const beforeDowngradeAccess = canUserAccessAssessment(db.getUserById(tempDowngradeUser.id), premiumAssessment3);
  assert(beforeDowngradeAccess.allowed === true, 'PRO scheduled downgrade before period end: Retains full PRO access');

  // Expire period end to trigger downgrade
  db.updateSubscriptionState(tempDowngradeUser.id, {
    currentPeriodEnd: Date.now() - 1000
  });
  const afterDowngradeSub = db.getUserSubscription(tempDowngradeUser.id);
  assert(afterDowngradeSub.plan === 'PLUS', 'PRO scheduled downgrade after period end: Transitions to PLUS plan', `Got plan: ${afterDowngradeSub.plan}`);
  const afterDowngradeAccess = canUserAccessAssessment(db.getUserById(tempDowngradeUser.id), premiumAssessment3);
  assert(afterDowngradeAccess.allowed === false, 'PRO downgraded to PLUS: Unselected Premium test #3 is now DENIED');

  // TEST 11: Purchased AI credits remain untouched when subscription changes
  const initialCreditUser = db.loginOrRegister(`credits_${timestamp}@test.com`, 'Credits User', 'College A', 'Target B', 'Role C', 'student');
  db.grantAdminCredits(initialCreditUser.id, 'system_test', 25, 'PURCHASED', 'Test purchase pack');
  const initialCredits = db.getUserById(initialCreditUser.id)?.aiCredits;

  db.updateSubscriptionState(initialCreditUser.id, {
    plan: 'PRO',
    status: 'active',
    currentPeriodStart: Date.now(),
    currentPeriodEnd: Date.now() + oneMonthMs,
    cancelAtPeriodEnd: false,
    pendingPlan: null
  });

  const postSubCredits = db.getUserById(initialCreditUser.id)?.aiCredits;
  assert(initialCredits === postSubCredits, 'Purchased AI credits remain untouched after subscription upgrade', `Initial: ${initialCredits}, Post-sub: ${postSubCredits}`);

  // TEST 12: One user's Premium entitlement cannot grant another user access (IDOR check)
  const idorAccess = canUserAccessAssessment(freeUser, premiumAssessment1);
  assert(idorAccess.allowed === false, "One user's Plus selection does NOT grant access to another user (IDOR prevention)");

  console.log(`\n=== TEST SUITE COMPLETED: ${passedCount}/${totalCount} TESTS PASSED ===`);
  if (passedCount === totalCount) {
    process.exit(0);
  } else {
    process.exit(1);
  }
}

runTests().catch(err => {
  console.error('Test runner exception:', err);
  process.exit(1);
});
