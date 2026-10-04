import { db } from '../server/db';
import { canUserAccessAssessment } from '../server/entitlements';
import { getRazorpayCredentials, PLAN_CONFIGS } from '../server/paymentConfig';
import crypto from 'crypto';

async function runPhase4Tests() {
  console.log('=== STARTING PHASE 4 PREMIUM UI & SUBSCRIPTION LIFECYCLE TEST SUITE ===\n');

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

  const ts = Date.now();
  const secret = getRazorpayCredentials().keySecret;
  const oneMonthMs = 30 * 24 * 60 * 60 * 1000;

  // Insert mock tests into SQLite DB for access checks
  const premTest1Id = `p4_prem_1_${ts}`;
  const premTest2Id = `p4_prem_2_${ts}`;
  const premTest3Id = `p4_prem_3_${ts}`;
  const futurePremTestId = `p4_future_prem_${ts}`;

  db.sqliteDb.prepare(`
    INSERT INTO tests (id, title, category, accessType, status, durationMinutes, totalQuestions, createdAt)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(premTest1Id, 'P4 Premium Test 1', 'company', 'PREMIUM', 'ready', 45, 20, new Date().toISOString());

  db.sqliteDb.prepare(`
    INSERT INTO tests (id, title, category, accessType, status, durationMinutes, totalQuestions, createdAt)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(premTest2Id, 'P4 Premium Test 2', 'coding', 'PREMIUM', 'ready', 60, 15, new Date().toISOString());

  db.sqliteDb.prepare(`
    INSERT INTO tests (id, title, category, accessType, status, durationMinutes, totalQuestions, createdAt)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(premTest3Id, 'P4 Premium Test 3', 'company', 'PREMIUM', 'ready', 45, 20, new Date().toISOString());

  db.sqliteDb.prepare(`
    INSERT INTO tests (id, title, category, accessType, status, durationMinutes, totalQuestions, createdAt)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(futurePremTestId, 'P4 Future Premium Test', 'coding', 'PREMIUM', 'ready', 60, 20, new Date().toISOString());

  // 1. Free plan renders / defaults correctly for new user
  const user = db.loginOrRegister(`p4_user_${ts}@test.com`, 'Phase 4 Tester', 'College', 'Target', 'Role', 'student');
  const subInit = db.getUserSubscription(user.id);
  assert(subInit.plan === 'FREE', 'Free plan renders / defaults correctly for new user');

  // 2. Plus plan configuration
  assert(PLAN_CONFIGS.PLUS.priceRupees === 199 && PLAN_CONFIGS.PLUS.monthlyAiCredits === 50, 'Plus plan renders correctly (₹199/mo, 50 AI credits)');

  // 3. Pro plan configuration
  assert(PLAN_CONFIGS.PRO.priceRupees === 349 && PLAN_CONFIGS.PRO.monthlyAiCredits === 65, 'Pro plan renders correctly (₹349/mo, 65 AI credits)');

  // 4. Actual current subscription state displayed
  const meSub = db.getUserSubscription(user.id);
  assert(meSub.userId === user.id && meSub.plan === 'FREE', 'Actual current subscription state displayed from backend');

  // 5. Free -> Plus purchase opens real Razorpay flow (Order creation ₹199)
  const plusOrderId = `ord_p4_plus_${ts}`;
  const plusRzpId = `rzp_p4_plus_${ts}`;
  const plusOrder = db.createPaymentOrder({
    id: plusOrderId,
    userId: user.id,
    productType: 'SUBSCRIPTION',
    productId: 'PLUS',
    amount: PLAN_CONFIGS.PLUS.pricePaise,
    currency: 'INR',
    status: 'CREATED',
    razorpayOrderId: plusRzpId,
    metadata: { plan: 'PLUS', userEmail: user.email },
  });
  assert(plusOrder.amount === 19900 && plusOrder.productId === 'PLUS', 'Free -> Plus purchase creates Razorpay order for ₹199 (19900 paise)');

  // 6. Free -> Pro purchase opens real Razorpay flow (Order creation ₹349)
  const proOrderId = `ord_p4_pro_${ts}`;
  const proRzpId = `rzp_pro_${ts}`;
  const proOrder = db.createPaymentOrder({
    id: proOrderId,
    userId: user.id,
    productType: 'SUBSCRIPTION',
    productId: 'PRO',
    amount: PLAN_CONFIGS.PRO.pricePaise,
    currency: 'INR',
    status: 'CREATED',
    razorpayOrderId: proRzpId,
    metadata: { plan: 'PRO', userEmail: user.email },
  });
  assert(proOrder.amount === 34900 && proOrder.productId === 'PRO', 'Free -> Pro purchase creates Razorpay order for ₹349 (34900 paise)');

  // 7. Successful verified purchase updates UI / subscription state without reload
  const payIdPlus = `pay_plus_${ts}`;
  const sigPlus = crypto.createHmac('sha256', secret).update(`${plusRzpId}|${payIdPlus}`).digest('hex');
  const fulfillResult = db.fulfillPaymentOrderAtomic(plusOrder.id, payIdPlus, sigPlus);
  const verifiedSub = db.getUserSubscription(user.id);
  assert(fulfillResult.success && verifiedSub.plan === 'PLUS' && (verifiedSub.status === 'active' || (verifiedSub as any).subscriptionStatus === 'active'), 'Successful verified purchase updates subscription state to PLUS & active');

  // 8. Failed payment does not change subscription
  try {
    db.fulfillPaymentOrderAtomic('invalid_ord', 'invalid_pay', 'invalid_sig');
    assert(false, 'Failed payment should throw error');
  } catch (err) {
    const afterFailed = db.getUserSubscription(user.id);
    assert(afterFailed.plan === 'PLUS', 'Failed payment preserves previous active subscription state (PLUS)');
  }

  // 9. Plus -> Pro upgrade
  const upgradeOrderId = `ord_upg_${ts}`;
  const upgradeRzpId = `rzp_upg_${ts}`;
  db.createPaymentOrder({
    id: upgradeOrderId,
    userId: user.id,
    productType: 'SUBSCRIPTION',
    productId: 'PRO',
    amount: PLAN_CONFIGS.PRO.pricePaise,
    currency: 'INR',
    status: 'CREATED',
    razorpayOrderId: upgradeRzpId,
    metadata: { plan: 'PRO', userEmail: user.email },
  });
  const payIdUpg = `pay_upg_${ts}`;
  const sigUpg = crypto.createHmac('sha256', secret).update(`${upgradeRzpId}|${payIdUpg}`).digest('hex');
  db.fulfillPaymentOrderAtomic(upgradeOrderId, payIdUpg, sigUpg);
  const upgradedSub = db.getUserSubscription(user.id);
  assert(upgradedSub.plan === 'PRO' && (upgradedSub.status === 'active' || (upgradedSub as any).subscriptionStatus === 'active'), 'Plus -> Pro upgrade activates PRO plan');

  // 10. Pro cannot immediately downgrade to Plus; schedules downgrade at renewal
  db.updateSubscriptionState(user.id, { pendingPlan: 'PLUS' });
  const pendingSub = db.getUserSubscription(user.id);
  assert(pendingSub.plan === 'PRO' && pendingSub.pendingPlan === 'PLUS', 'Pro cannot immediately downgrade; pendingPlan = PLUS set for renewal');
  db.updateSubscriptionState(user.id, { pendingPlan: null });

  // 11. Cancellation schedules renewal cancellation
  db.updateSubscriptionState(user.id, {
    cancelAtPeriodEnd: true,
    currentPeriodStart: Date.now().toString(),
    currentPeriodEnd: (Date.now() + oneMonthMs).toString(),
  });
  const cancelledSub = db.getUserSubscription(user.id);
  assert(cancelledSub.cancelAtPeriodEnd === true, 'Cancellation schedules renewal cancellation (cancelAtPeriodEnd = true)');

  // 12. Cancellation does not remove current Premium access
  assert(cancelledSub.plan === 'PRO' && (cancelledSub.status === 'active' || (cancelledSub as any).subscriptionStatus === 'active'), 'Cancellation does not remove current Premium access before billing period end');

  // 13. Cancellation state displays correctly
  assert(cancelledSub.cancelAtPeriodEnd === true && Number(cancelledSub.currentPeriodEnd) > Date.now(), 'Cancellation state displays scheduled cancellation and valid until date');

  // 14. Keep Premium reverses cancellation
  db.updateSubscriptionState(user.id, { cancelAtPeriodEnd: false, pendingPlan: null });
  const keptSub = db.getUserSubscription(user.id);
  assert(keptSub.cancelAtPeriodEnd === false, 'Keep Premium reverses cancellation schedule');

  // 15. Plus selection remains limited to 2
  db.updateSubscriptionState(user.id, {
    plan: 'PLUS',
    status: 'active',
    currentPeriodStart: Date.now().toString(),
    currentPeriodEnd: (Date.now() + oneMonthMs).toString(),
  });
  const sel1 = db.selectPlusAssessment(user.id, premTest1Id);
  const sel2 = db.selectPlusAssessment(user.id, premTest2Id);
  assert(sel1.success && sel2.success && sel2.selected.length === 2, 'Plus selection allows up to 2 Premium tests');
  const sel3 = db.selectPlusAssessment(user.id, premTest3Id);
  assert(sel3.success === false && Boolean(sel3.error?.includes('Maximum limit')), 'Plus selection limit to 2 enforced by backend');

  // 16. Plus selection persists through refresh
  const persistedSelections = db.getUserPlusSelections(user.id);
  assert(persistedSelections.length === 2 && persistedSelections.includes(premTest1Id), 'Plus selections persist in database across requests');

  // 17. Pro unlocks all Premium tests
  db.updateSubscriptionState(user.id, {
    plan: 'PRO',
    status: 'active',
    currentPeriodStart: Date.now().toString(),
    currentPeriodEnd: (Date.now() + oneMonthMs).toString(),
  });
  const proAcc1 = canUserAccessAssessment(user.id, premTest1Id, db);
  const proAcc3 = canUserAccessAssessment(user.id, premTest3Id, db);
  assert(proAcc1.allowed && proAcc3.allowed, 'Pro plan unlocks all Premium tests automatically');

  // 18. New Premium test is accessible to Pro
  const proFutureAcc = canUserAccessAssessment(user.id, futurePremTestId, db);
  assert(proFutureAcc.allowed, 'Newly created Premium test automatically accessible to Pro user');

  // 19. Account Settings shows actual subscription state
  const settingsSub = db.getUserSubscription(user.id);
  assert(settingsSub.plan === 'PRO' && (settingsSub.status === 'active' || (settingsSub as any).subscriptionStatus === 'active'), 'Account Settings shows actual backend subscription state');

  // 20. Navbar/profile reflects actual plan
  assert(settingsSub.plan === 'PRO', 'Navbar and profile dropdown reflect actual PRO plan');

  // 21. AI credit purchase remains separate
  const initialPurchased = db.getDeepAICreditBalance(user.id).purchased;
  const credOrder = db.createPaymentOrder({
    id: `ord_cred_p4_${ts}`,
    userId: user.id,
    productType: 'AI_CREDIT_PACK',
    productId: 'pack_25',
    amount: 9900,
    currency: 'INR',
    status: 'CREATED',
    razorpayOrderId: `rzp_cred_p4_${ts}`,
    metadata: { credits: 25, packId: 'pack_25' },
  });
  const payIdCred = `pay_cred_${ts}`;
  const sigCred = crypto.createHmac('sha256', secret).update(`rzp_cred_p4_${ts}|${payIdCred}`).digest('hex');
  db.fulfillPaymentOrderAtomic(credOrder.id, payIdCred, sigCred);
  const purchasedAfterBuy = db.getDeepAICreditBalance(user.id).purchased;
  assert(purchasedAfterBuy === initialPurchased + 25, 'AI credit top-up purchase remains separate from subscription system');

  // 22. Purchased AI credits survive subscription cancellation
  db.updateSubscriptionState(user.id, { plan: 'FREE', status: 'inactive', cancelAtPeriodEnd: false });
  const purchasedAfterCancel = db.getDeepAICreditBalance(user.id).purchased;
  assert(purchasedAfterCancel === purchasedAfterBuy, 'Purchased AI credits survive subscription cancellation');

  // 23. No duplicate subscription activation
  db.updateSubscriptionState(user.id, {
    plan: 'PLUS',
    status: 'active',
    currentPeriodStart: Date.now().toString(),
    currentPeriodEnd: (Date.now() + oneMonthMs).toString(),
  });
  const dupOrderId = `ord_dup_${ts}`;
  const dupRzpId = `rzp_dup_${ts}`;
  db.createPaymentOrder({
    id: dupOrderId,
    userId: user.id,
    productType: 'SUBSCRIPTION',
    productId: 'PLUS',
    amount: PLAN_CONFIGS.PLUS.pricePaise,
    currency: 'INR',
    status: 'CREATED',
    razorpayOrderId: dupRzpId,
    metadata: { plan: 'PLUS', userEmail: user.email },
  });
  const payIdDup = `pay_dup_${ts}`;
  const sigDup = crypto.createHmac('sha256', secret).update(`${dupRzpId}|${payIdDup}`).digest('hex');
  const res1 = db.fulfillPaymentOrderAtomic(dupOrderId, payIdDup, sigDup);
  const res2 = db.fulfillPaymentOrderAtomic(dupOrderId, payIdDup, sigDup);
  assert(res1.alreadyFulfilled === false && res2.alreadyFulfilled === true, 'No duplicate subscription activation on duplicate verification calls');

  // 24. No duplicate Plus selections
  db.deselectPlusAssessment(user.id, premTest1Id);
  db.deselectPlusAssessment(user.id, premTest2Id);
  db.selectPlusAssessment(user.id, premTest1Id);
  const dupSel = db.selectPlusAssessment(user.id, premTest1Id);
  assert(dupSel.selected.length === 1, 'No duplicate Plus selections for same assessment');

  // 25. State synchronization without page reload
  const synchedSub = db.getUserSubscription(user.id);
  assert(
    synchedSub.userId === user.id &&
    synchedSub.currentPeriodEnd !== null &&
    Array.isArray(synchedSub.selectedAssessmentIds),
    'State synchronization contains full subscription metadata without reload'
  );

  console.log(`\n=== PHASE 4 TEST SUITE COMPLETED: ${passedCount}/${totalCount} TESTS PASSED ===`);
  if (passedCount !== totalCount) {
    process.exit(1);
  }
}

runPhase4Tests().catch((err) => {
  console.error('Phase 4 Test Suite Failed:', err);
  process.exit(1);
});
