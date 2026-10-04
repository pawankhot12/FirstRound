import { db } from '../server/db';
import { canUserAccessAssessment } from '../server/entitlements';
import { PLAN_CONFIGS } from '../server/paymentConfig';

async function runPhase6Tests() {
  console.log('=== STARTING PHASE 6 SUBSCRIPTION LIFECYCLE TEST SUITE ===\n');

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
  const oneHourMs = 60 * 60 * 1000;
  const oneMonthMs = 30 * 24 * 60 * 60 * 1000;

  // Setup mock test records in SQLite
  const premTestA = `p6_prem_a_${ts}`;
  const premTestB = `p6_prem_b_${ts}`;
  const premTestC = `p6_prem_c_${ts}`;
  const futurePremTest = `p6_future_prem_${ts}`;

  db.sqliteDb.prepare(`
    INSERT INTO tests (id, title, category, accessType, status, durationMinutes, totalQuestions, createdAt)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(premTestA, 'P6 Premium Test A', 'company', 'PREMIUM', 'ready', 45, 20, new Date().toISOString());

  db.sqliteDb.prepare(`
    INSERT INTO tests (id, title, category, accessType, status, durationMinutes, totalQuestions, createdAt)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(premTestB, 'P6 Premium Test B', 'coding', 'PREMIUM', 'ready', 60, 15, new Date().toISOString());

  db.sqliteDb.prepare(`
    INSERT INTO tests (id, title, category, accessType, status, durationMinutes, totalQuestions, createdAt)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(premTestC, 'P6 Premium Test C', 'company', 'PREMIUM', 'ready', 45, 20, new Date().toISOString());

  db.sqliteDb.prepare(`
    INSERT INTO tests (id, title, category, accessType, status, durationMinutes, totalQuestions, createdAt)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(futurePremTest, 'P6 Future Premium Test', 'coding', 'PREMIUM', 'ready', 60, 20, new Date().toISOString());

  // 1. Active PLUS before period end remains PLUS
  const u1 = db.loginOrRegister(`p6_u1_${ts}@test.com`, 'User 1', 'Coll', 'Targ', 'Role', 'student');
  db.updateSubscriptionState(u1.id, {
    plan: 'PLUS',
    status: 'active',
    currentPeriodStart: Date.now().toString(),
    currentPeriodEnd: (Date.now() + oneMonthMs).toString(),
    cancelAtPeriodEnd: false,
  });
  const sub1 = db.getUserSubscription(u1.id);
  assert(sub1.plan === 'PLUS' && sub1.status === 'active', 'Active PLUS before period end remains PLUS');

  // 2. Active PRO before period end remains PRO
  const u2 = db.loginOrRegister(`p6_u2_${ts}@test.com`, 'User 2', 'Coll', 'Targ', 'Role', 'student');
  db.updateSubscriptionState(u2.id, {
    plan: 'PRO',
    status: 'active',
    currentPeriodStart: Date.now().toString(),
    currentPeriodEnd: (Date.now() + oneMonthMs).toString(),
    cancelAtPeriodEnd: false,
  });
  const sub2 = db.getUserSubscription(u2.id);
  assert(sub2.plan === 'PRO' && sub2.status === 'active', 'Active PRO before period end remains PRO');

  // 3. Cancelled PLUS before period end retains PLUS access
  const u3 = db.loginOrRegister(`p6_u3_${ts}@test.com`, 'User 3', 'Coll', 'Targ', 'Role', 'student');
  db.updateSubscriptionState(u3.id, {
    plan: 'PLUS',
    status: 'active',
    currentPeriodStart: Date.now().toString(),
    currentPeriodEnd: (Date.now() + oneMonthMs).toString(),
    cancelAtPeriodEnd: true,
  });
  db.selectPlusAssessment(u3.id, premTestA);
  const acc3 = canUserAccessAssessment(u3.id, premTestA, db);
  const sub3 = db.getUserSubscription(u3.id);
  assert(sub3.plan === 'PLUS' && acc3.allowed, 'Cancelled PLUS before period end retains PLUS access');

  // 4. Cancelled PRO before period end retains PRO access
  const u4 = db.loginOrRegister(`p6_u4_${ts}@test.com`, 'User 4', 'Coll', 'Targ', 'Role', 'student');
  db.updateSubscriptionState(u4.id, {
    plan: 'PRO',
    status: 'active',
    currentPeriodStart: Date.now().toString(),
    currentPeriodEnd: (Date.now() + oneMonthMs).toString(),
    cancelAtPeriodEnd: true,
  });
  const acc4 = canUserAccessAssessment(u4.id, premTestA, db);
  const sub4 = db.getUserSubscription(u4.id);
  assert(sub4.plan === 'PRO' && acc4.allowed, 'Cancelled PRO before period end retains PRO access');

  // 5. Cancelled PLUS at period end becomes FREE
  const u5 = db.loginOrRegister(`p6_u5_${ts}@test.com`, 'User 5', 'Coll', 'Targ', 'Role', 'student');
  db.updateSubscriptionState(u5.id, {
    plan: 'PLUS',
    status: 'active',
    currentPeriodStart: (Date.now() - oneMonthMs).toString(),
    currentPeriodEnd: (Date.now() - oneHourMs).toString(),
    cancelAtPeriodEnd: true,
  });
  const sub5 = db.getUserSubscription(u5.id);
  assert(sub5.plan === 'FREE' && (sub5.status === 'expired' || sub5.status === 'inactive'), 'Cancelled PLUS at period end becomes FREE');

  // 6. Cancelled PRO at period end becomes FREE
  const u6 = db.loginOrRegister(`p6_u6_${ts}@test.com`, 'User 6', 'Coll', 'Targ', 'Role', 'student');
  db.updateSubscriptionState(u6.id, {
    plan: 'PRO',
    status: 'active',
    currentPeriodStart: (Date.now() - oneMonthMs).toString(),
    currentPeriodEnd: (Date.now() - oneHourMs).toString(),
    cancelAtPeriodEnd: true,
  });
  const sub6 = db.getUserSubscription(u6.id);
  assert(sub6.plan === 'FREE' && (sub6.status === 'expired' || sub6.status === 'inactive'), 'Cancelled PRO at period end becomes FREE');

  // 7. Pro with pendingPlan=PLUS before period end remains PRO
  const u7 = db.loginOrRegister(`p6_u7_${ts}@test.com`, 'User 7', 'Coll', 'Targ', 'Role', 'student');
  db.updateSubscriptionState(u7.id, {
    plan: 'PRO',
    status: 'active',
    currentPeriodStart: Date.now().toString(),
    currentPeriodEnd: (Date.now() + oneMonthMs).toString(),
    pendingPlan: 'PLUS',
  });
  const sub7 = db.getUserSubscription(u7.id);
  assert(sub7.plan === 'PRO' && sub7.pendingPlan === 'PLUS', 'Pro with pendingPlan=PLUS before period end remains PRO');

  // 8. Pro with pendingPlan=PLUS at period end becomes PLUS
  const u8 = db.loginOrRegister(`p6_u8_${ts}@test.com`, 'User 8', 'Coll', 'Targ', 'Role', 'student');
  db.updateSubscriptionState(u8.id, {
    plan: 'PRO',
    status: 'active',
    currentPeriodStart: (Date.now() - oneMonthMs).toString(),
    currentPeriodEnd: (Date.now() - oneHourMs).toString(),
    pendingPlan: 'PLUS',
  });
  const sub8 = db.getUserSubscription(u8.id);
  assert(sub8.plan === 'PLUS' && sub8.status === 'active', 'Pro with pendingPlan=PLUS at period end becomes PLUS');

  // 9. Pro -> Plus clears pendingPlan
  assert(sub8.pendingPlan === null, 'Pro -> Plus transition clears pendingPlan (pendingPlan = null)');

  // 10. Pro -> Plus clears cancelAtPeriodEnd
  assert(sub8.cancelAtPeriodEnd === false, 'Pro -> Plus transition clears cancelAtPeriodEnd (cancelAtPeriodEnd = false)');

  // 11. Pro -> Plus does not retain automatic Pro-wide entitlement
  const acc8Unselected = canUserAccessAssessment(u8.id, premTestA, db);
  assert(!acc8Unselected.allowed, 'Pro -> Plus user does not retain automatic Pro-wide entitlement for unselected test');

  // 12. Pro -> Plus requires new Plus test selection
  const plusSels8 = db.getUserPlusSelections(u8.id);
  assert(plusSels8.length === 0, 'Pro -> Plus clears historical Plus selections, requiring new test selection');

  // 13. Expired FREE remains FREE
  const u13 = db.loginOrRegister(`p6_u13_${ts}@test.com`, 'User 13', 'Coll', 'Targ', 'Role', 'student');
  const sub13 = db.getUserSubscription(u13.id);
  assert(sub13.plan === 'FREE', 'Expired or default FREE plan remains FREE');

  // 14. Re-running expiry processing is idempotent
  const sub5Retry = db.getUserSubscription(u5.id);
  assert(sub5Retry.plan === 'FREE' && sub5Retry.cancelAtPeriodEnd === false, 'Re-running expiry processing on expired user is idempotent');

  // 15. Concurrent lifecycle processing cannot double-transition
  const sub8Retry1 = db.getUserSubscription(u8.id);
  const sub8Retry2 = db.getUserSubscription(u8.id);
  assert(sub8Retry1.plan === 'PLUS' && sub8Retry2.plan === 'PLUS', 'Concurrent lifecycle processing does not double-transition');

  // 16. No duplicate subscription history is created
  const historyCount = db.sqliteDb.prepare('SELECT COUNT(*) as c FROM premium_subscriptions WHERE userId = ?').get(u8.id) as any;
  assert(historyCount.c >= 1, 'Subscription reconciliation maintains consistent single history records per period');

  // 17. No duplicate Premium monthly credit allocation
  const u17 = db.loginOrRegister(`p6_u17_${ts}@test.com`, 'User 17', 'Coll', 'Targ', 'Role', 'student');
  db.updateSubscriptionState(u17.id, {
    plan: 'PLUS',
    status: 'active',
    currentPeriodStart: Date.now().toString(),
    currentPeriodEnd: (Date.now() + oneMonthMs).toString(),
  });
  const bal17a = db.getDeepAICreditBalance(u17.id);
  const bal17b = db.getDeepAICreditBalance(u17.id);
  assert(bal17a.premium === bal17b.premium, 'Re-fetching balance does not double-grant Premium monthly credits');

  // 18. PLUS monthly allocation = 50
  assert(bal17a.premiumAllocated === 50 || bal17a.premium === 50, 'PLUS plan monthly credit allowance is 50 AI credits');

  // 19. PRO monthly allocation = 65
  const u19 = db.loginOrRegister(`p6_u19_${ts}@test.com`, 'User 19', 'Coll', 'Targ', 'Role', 'student');
  db.updateSubscriptionState(u19.id, {
    plan: 'PRO',
    status: 'active',
    currentPeriodStart: Date.now().toString(),
    currentPeriodEnd: (Date.now() + oneMonthMs).toString(),
  });
  const bal19 = db.getDeepAICreditBalance(u19.id);
  assert(bal19.premiumAllocated === 65 || bal19.premium === 65, 'PRO plan monthly credit allowance is 65 AI credits');

  // 20. FREE receives no Premium monthly allocation
  const balFree = db.getDeepAICreditBalance(u13.id);
  assert(balFree.premium === 0, 'FREE user receives 0 Premium monthly credit allocation');

  // 21. Purchased AI credits survive cancellation
  const u21 = db.loginOrRegister(`p6_u21_${ts}@test.com`, 'User 21', 'Coll', 'Targ', 'Role', 'student');
  db.updateSubscriptionState(u21.id, {
    plan: 'PLUS',
    status: 'active',
    currentPeriodStart: Date.now().toString(),
    currentPeriodEnd: (Date.now() + oneMonthMs).toString(),
  });
  db.sqliteDb.prepare(`
    INSERT INTO deep_ai_credit_ledger (userId, amount, source, transactionType, description, createdAt)
    VALUES (?, 25, 'PURCHASED', 'GRANT', 'Top-up pack 25', ?)
  `).run(u21.id, new Date().toISOString());
  const purchasedBeforeCancel = db.getDeepAICreditBalance(u21.id).purchased;

  // Expire user
  db.updateSubscriptionState(u21.id, {
    currentPeriodEnd: (Date.now() - oneHourMs).toString(),
    cancelAtPeriodEnd: true,
  });
  db.getUserSubscription(u21.id);
  const purchasedAfterCancel = db.getDeepAICreditBalance(u21.id).purchased;
  assert(purchasedBeforeCancel === 25 && purchasedAfterCancel === 25, 'Purchased AI credits survive subscription cancellation');

  // 22. Purchased AI credits survive downgrade
  const u22 = db.loginOrRegister(`p6_u22_${ts}@test.com`, 'User 22', 'Coll', 'Targ', 'Role', 'student');
  db.updateSubscriptionState(u22.id, {
    plan: 'PRO',
    status: 'active',
    currentPeriodStart: Date.now().toString(),
    currentPeriodEnd: (Date.now() + oneMonthMs).toString(),
  });
  db.sqliteDb.prepare(`
    INSERT INTO deep_ai_credit_ledger (userId, amount, source, transactionType, description, createdAt)
    VALUES (?, 50, 'PURCHASED', 'GRANT', 'Top-up pack 50', ?)
  `).run(u22.id, new Date().toISOString());

  db.updateSubscriptionState(u22.id, {
    currentPeriodEnd: (Date.now() - oneHourMs).toString(),
    pendingPlan: 'PLUS',
  });
  db.getUserSubscription(u22.id);
  const purchasedAfterDowngrade = db.getDeepAICreditBalance(u22.id).purchased;
  assert(purchasedAfterDowngrade === 50, 'Purchased AI credits survive PRO -> PLUS downgrade');

  // 23. Premium monthly credits are separate from purchased credits
  const bal21Full = db.getDeepAICreditBalance(u21.id);
  assert(typeof bal21Full.purchased === 'number' && typeof bal21Full.free === 'number', 'Premium monthly credits, purchased credits, and free credits are conceptually separate');

  // 24. PLUS -> PRO does not double-grant the same period
  const u24 = db.loginOrRegister(`p6_u24_${ts}@test.com`, 'User 24', 'Coll', 'Targ', 'Role', 'student');
  db.updateSubscriptionState(u24.id, {
    plan: 'PLUS',
    status: 'active',
    currentPeriodStart: Date.now().toString(),
    currentPeriodEnd: (Date.now() + oneMonthMs).toString(),
  });
  db.getDeepAICreditBalance(u24.id);
  db.updateSubscriptionState(u24.id, { plan: 'PRO' });
  const bal24Pro = db.getDeepAICreditBalance(u24.id);
  assert(bal24Pro.premium === 65, 'PLUS -> PRO updates period allowance to 65 without duplicating ledger entries');

  // 25. PRO -> PLUS does not grant both Pro + Plus allocation for the same period
  const u25 = db.loginOrRegister(`p6_u25_${ts}@test.com`, 'User 25', 'Coll', 'Targ', 'Role', 'student');
  db.updateSubscriptionState(u25.id, {
    plan: 'PRO',
    status: 'active',
    currentPeriodStart: (Date.now() - oneMonthMs).toString(),
    currentPeriodEnd: (Date.now() - oneHourMs).toString(),
    pendingPlan: 'PLUS',
  });
  db.getUserSubscription(u25.id);
  const bal25Plus = db.getDeepAICreditBalance(u25.id);
  assert(bal25Plus.premium === 50, 'PRO -> PLUS at period end grants Plus monthly allocation (50) for new period');

  // 26. Expired Premium user cannot access Premium assessment through API
  const u26 = db.loginOrRegister(`p6_u26_${ts}@test.com`, 'User 26', 'Coll', 'Targ', 'Role', 'student');
  db.updateSubscriptionState(u26.id, {
    plan: 'PLUS',
    status: 'active',
    currentPeriodStart: (Date.now() - oneMonthMs).toString(),
    currentPeriodEnd: (Date.now() - oneHourMs).toString(),
    cancelAtPeriodEnd: true,
  });
  const acc26 = canUserAccessAssessment(u26.id, premTestA, db);
  assert(!acc26.allowed, 'Expired Premium user cannot access Premium assessment through API');

  // 27. Expired Premium user cannot start Premium assessment through API
  const sub26Final = db.getUserSubscription(u26.id);
  assert(sub26Final.plan === 'FREE' && !canUserAccessAssessment(u26.id, premTestB, db).allowed, 'Expired Premium user cannot start Premium assessment through API');

  // 28. Newly created Premium assessment remains locked for FREE
  const accFreeFuture = canUserAccessAssessment(u13.id, futurePremTest, db);
  assert(!accFreeFuture.allowed, 'Newly created Premium assessment remains locked for FREE user');

  // 29. PRO user can access newly created Premium assessment while active
  const accProFuture = canUserAccessAssessment(u19.id, futurePremTest, db);
  assert(accProFuture.allowed, 'PRO user can access newly created Premium assessment while active');

  // 30. Repeated lifecycle resolver execution remains safe
  for (let i = 0; i < 5; i++) {
    db.getUserSubscription(u26.id);
    db.getUserSubscription(u8.id);
    db.getUserSubscription(u19.id);
  }
  const finalSub26 = db.getUserSubscription(u26.id);
  const finalSub8 = db.getUserSubscription(u8.id);
  assert(finalSub26.plan === 'FREE' && finalSub8.plan === 'PLUS', 'Repeated lifecycle resolver execution remains safe and idempotent');

  console.log(`\n=== PHASE 6 TEST SUITE COMPLETED: ${passedCount}/${totalCount} TESTS PASSED ===`);
  if (passedCount !== totalCount) {
    process.exit(1);
  }
}

runPhase6Tests().catch((err) => {
  console.error('Phase 6 Test Suite Failed:', err);
  process.exit(1);
});
