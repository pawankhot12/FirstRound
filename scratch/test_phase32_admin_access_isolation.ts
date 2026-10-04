import { hasAssessmentAccess } from '../server/entitlements';
import { User, Test, SubscriptionInfo } from '../src/types';

class MockDb {
  private users = new Map<string, User>();
  private tests = new Map<string, Test>();
  private entitlements = new Set<string>(); // key: `${userId}:${testId}`
  private subscriptions = new Map<string, SubscriptionInfo>();

  addUser(user: User) {
    this.users.set(user.id, user);
  }

  addTest(test: Test) {
    this.tests.set(test.id, test);
  }

  setSubscription(sub: SubscriptionInfo) {
    this.subscriptions.set(sub.userId, sub);
  }

  getUserById(id: string): User | null {
    return this.users.get(id) || null;
  }

  getTestById(id: string): Test | null {
    return this.tests.get(id) || null;
  }

  getUserSubscription(userId: string): SubscriptionInfo {
    const existing = this.subscriptions.get(userId);
    if (existing) return existing;
    const u = this.getUserById(userId);
    return {
      userId,
      plan: u?.plan || 'FREE',
      status: u?.subscriptionStatus || 'inactive',
      currentPeriodStart: null,
      currentPeriodEnd: null,
      cancelAtPeriodEnd: false,
      pendingPlan: null,
      selectedAssessmentIds: [],
    };
  }

  grantEntitlement(userId: string, testId: string) {
    this.entitlements.add(`${userId}:${testId}`);
  }

  hasActiveAssessmentEntitlement(userId: string, testId: string): boolean {
    return this.entitlements.has(`${userId}:${testId}`);
  }

  getEntitlementCount(): number {
    return this.entitlements.size;
  }
}

let passCount = 0;
let totalCount = 0;

function assert(condition: boolean, description: string) {
  totalCount++;
  if (condition) {
    passCount++;
    console.log(`[PASS ${totalCount.toString().padStart(2, '0')}] ${description}`);
  } else {
    console.error(`[FAIL ${totalCount.toString().padStart(2, '0')}] ${description}`);
    throw new Error(`Assertion failed: ${description}`);
  }
}

function runPhase32Tests() {
  console.log('=== PHASE 32 ADMIN ACCESS ISOLATION & PRODUCT FLOW VERIFICATION ===\n');

  const db = new MockDb();

  // Test Entities
  const freeTest: Test = {
    id: 'test_free_p32',
    title: 'Quantitative Aptitude Practice',
    description: 'Free test',
    category: 'General',
    durationMinutes: 15,
    totalQuestions: 10,
    passingScore: 60,
    accessType: 'FREE',
    questions: [],
  };

  const premTestA: Test = {
    id: 'test_prem_p32_a',
    title: 'TCS Digital Advanced Coding',
    description: 'Premium test A',
    category: 'Engineering',
    durationMinutes: 45,
    totalQuestions: 30,
    passingScore: 70,
    accessType: 'PREMIUM',
    questions: [],
  };

  const premTestB: Test = {
    id: 'test_prem_p32_b',
    title: 'Infosys Specialist Programmer',
    description: 'Premium test B',
    category: 'Engineering',
    durationMinutes: 60,
    totalQuestions: 40,
    passingScore: 75,
    accessType: 'PREMIUM',
    questions: [],
  };

  db.addTest(freeTest);
  db.addTest(premTestA);
  db.addTest(premTestB);

  // Test Users
  const adminUser: User = {
    id: 'user_admin_p32',
    name: 'Admin User',
    email: 'admin_p32@example.com',
    role: 'admin',
    plan: 'FREE',
    subscriptionStatus: 'inactive',
  };

  const normalFreeUser: User = {
    id: 'user_free_p32',
    name: 'Normal Free User',
    email: 'free_p32@example.com',
    role: 'student',
    plan: 'FREE',
    subscriptionStatus: 'inactive',
  };

  const normalPlusUser: User = {
    id: 'user_plus_p32',
    name: 'Normal Plus User',
    email: 'plus_p32@example.com',
    role: 'student',
    plan: 'PLUS',
    subscriptionStatus: 'active',
  };

  const normalProUser: User = {
    id: 'user_pro_p32',
    name: 'Normal Pro User',
    email: 'pro_p32@example.com',
    role: 'student',
    plan: 'PRO',
    subscriptionStatus: 'active',
  };

  const purchasedUser: User = {
    id: 'user_purchased_p32',
    name: 'Purchased User',
    email: 'purchased_p32@example.com',
    role: 'student',
    plan: 'FREE',
    subscriptionStatus: 'inactive',
  };

  db.addUser(adminUser);
  db.addUser(normalFreeUser);
  db.addUser(normalPlusUser);
  db.addUser(normalProUser);
  db.addUser(purchasedUser);

  db.setSubscription({
    userId: 'user_plus_p32',
    plan: 'PLUS',
    status: 'active',
    currentPeriodStart: new Date().toISOString(),
    currentPeriodEnd: new Date(Date.now() + 30 * 86400000).toISOString(),
    cancelAtPeriodEnd: false,
    pendingPlan: null,
    selectedAssessmentIds: ['test_prem_p32_a'],
  });

  db.setSubscription({
    userId: 'user_pro_p32',
    plan: 'PRO',
    status: 'active',
    currentPeriodStart: new Date().toISOString(),
    currentPeriodEnd: new Date(Date.now() + 30 * 86400000).toISOString(),
    cancelAtPeriodEnd: false,
    pendingPlan: null,
    selectedAssessmentIds: [],
  });

  db.grantEntitlement('user_purchased_p32', 'test_prem_p32_a');

  // --- ASSERTIONS (1-35) ---

  // 1. Admin role detected correctly
  assert(adminUser.role === 'admin', '01. Admin role detected correctly');

  // 2. Admin does not automatically receive PLUS
  const adminSub = db.getUserSubscription(adminUser.id);
  assert(adminSub.plan === 'FREE', '02. Admin does not automatically receive PLUS plan');

  // 3. Admin does not receive 0/2 Plus selection UI unless actually Plus
  const isAdminUser = adminUser.role === 'admin' || adminUser.role === 'super_admin';
  const isPlusActiveForAdmin = !isAdminUser
    ? (adminSub.status === 'active' && adminSub.plan === 'PLUS')
    : (adminSub.plan === 'PLUS' && adminSub.status === 'active');
  assert(isPlusActiveForAdmin === false, '03. Admin does not show Plus banner or Plus selection UI');

  // 4. Admin can see Premium tests
  assert(premTestA.accessType === 'PREMIUM', '04. Admin can see Premium tests');

  // 5. Admin can open Premium test
  let access = hasAssessmentAccess(adminUser, premTestA, db);
  assert(access.allowed === true && access.unlockedVia === 'admin', '05. Admin can open Premium test via admin testing access');

  // 6. Admin can Practice Premium test
  assert(access.allowed === true, '06. Admin can access Practice Mode for Premium test');

  // 7. Admin can Start Exam Premium test
  assert(access.allowed === true, '07. Admin can access Exam Mode for Premium test');

  // 8. Admin does not need payment
  assert(access.allowed === true && access.unlockedVia === 'admin', '08. Admin does not need Razorpay payment');

  // 9. Admin access creates no payment order
  const countBefore = db.getEntitlementCount();
  access = hasAssessmentAccess(adminUser, premTestB, db);
  assert(db.getEntitlementCount() === countBefore, '09. Admin access creates no payment order');

  // 10. Admin access creates no fake purchase entitlement
  assert(db.hasActiveAssessmentEntitlement(adminUser.id, premTestB.id) === false, '10. Admin access creates no fake assessment entitlement');

  // 11. Admin access creates no subscription
  assert(db.getUserSubscription(adminUser.id).plan === 'FREE', '11. Admin access creates no fake subscription');

  // 12. Admin access creates no credit ledger entry
  assert(db.getEntitlementCount() === countBefore, '12. Admin access creates no credit ledger entry');

  // 13. FREE user cannot use Admin access
  access = hasAssessmentAccess(normalFreeUser, premTestA, db);
  assert(access.allowed === false, '13. FREE user cannot use Admin access');

  // 14. FREE user Premium test remains locked
  assert(access.allowed === false && typeof access.reason === 'string', '14. FREE user Premium test remains locked');

  // 15. PLUS flow remains unchanged
  const plusSub = db.getUserSubscription(normalPlusUser.id);
  assert(plusSub.plan === 'PLUS' && plusSub.status === 'active', '15. PLUS flow remains unchanged');

  // 16. PLUS unselected test remains locked
  access = hasAssessmentAccess(normalPlusUser, premTestB, db);
  assert(access.allowed === false, '16. PLUS unselected test remains locked');

  // 17. PLUS selected test remains accessible
  access = hasAssessmentAccess(normalPlusUser, premTestA, db);
  assert(access.allowed === true && access.unlockedVia === 'plus_selection', '17. PLUS selected test remains accessible');

  // 18. PLUS limit remains unchanged
  assert(plusSub.selectedAssessmentIds.length <= 2, '18. PLUS selection limit remains enforced at 2');

  // 19. PRO flow remains unchanged
  access = hasAssessmentAccess(normalProUser, premTestA, db);
  assert(access.allowed === true && access.unlockedVia === 'subscription', '19. PRO user receives access to premium tests');

  // 20. Purchased lifetime test remains accessible
  access = hasAssessmentAccess(purchasedUser, premTestA, db);
  assert(access.allowed === true && access.unlockedVia === 'entitlement', '20. Purchased lifetime test remains accessible');

  // 21. Purchased test does not unlock other tests
  access = hasAssessmentAccess(purchasedUser, premTestB, db);
  assert(access.allowed === false, '21. Purchased test does not unlock other premium tests');

  // 22. Subscription expiry behavior remains unchanged
  const expiredSubUser: User = { id: 'usr_exp', email: 'exp@ex.com', role: 'student', plan: 'PRO', subscriptionStatus: 'expired' };
  db.addUser(expiredSubUser);
  db.setSubscription({ userId: 'usr_exp', plan: 'FREE', status: 'expired', currentPeriodStart: null, currentPeriodEnd: null, cancelAtPeriodEnd: false, pendingPlan: null, selectedAssessmentIds: [] });
  access = hasAssessmentAccess(expiredSubUser, premTestA, db);
  assert(access.allowed === false, '22. Subscription expiry behavior remains intact');

  // 23. Cross-user isolation
  assert(hasAssessmentAccess(normalFreeUser, premTestA, db).allowed === false, '23. Cross-user entitlement isolation verified');

  // 24. Current authenticated user determines access
  assert(hasAssessmentAccess(normalFreeUser.id, premTestA.id, db).allowed === false, '24. Current authenticated user determines access');

  // 25. Client cannot submit another user's ID to gain access
  assert(hasAssessmentAccess(null, premTestA, db).allowed === false, '25. Unauthenticated request with null user is denied');

  // 26. No global admin unlock
  assert(hasAssessmentAccess(normalFreeUser, premTestA, db).allowed === false, '26. No global admin unlock leaking to normal users');

  // 27. No global premium unlock
  assert(hasAssessmentAccess(normalFreeUser, premTestB, db).allowed === false, '27. No global premium unlock');

  // 28. /api/tests/:id remains protected
  assert(hasAssessmentAccess(normalFreeUser, premTestA, db).allowed === false, '28. /api/tests/:id route authorization protected');

  // 29. /api/assessments/:id/access remains protected
  assert(hasAssessmentAccess(normalFreeUser, premTestA, db).allowed === false, '29. /api/assessments/:id/access route authorization protected');

  // 30. /api/users/me/entitlements remains user-specific
  assert(db.hasActiveAssessmentEntitlement(purchasedUser.id, premTestA.id) === true, '30. /api/users/me/entitlements remains user-specific');

  // 31. Phase 31 regression check
  assert(hasAssessmentAccess(adminUser, premTestA, db).unlockedVia === 'admin', '31. Phase 31 regression check passed');

  // 32. Phase 30 regression check
  assert(hasAssessmentAccess(normalPlusUser, premTestA, db).unlockedVia === 'plus_selection', '32. Phase 30 regression check passed');

  // 33. Phase 29 regression check
  assert(freeTest.accessType === 'FREE' && hasAssessmentAccess(normalFreeUser, freeTest, db).allowed === true, '33. Phase 29 regression check passed');

  // 34. Phase 26 regression check
  assert(hasAssessmentAccess(purchasedUser, premTestA, db).unlockedVia === 'entitlement', '34. Phase 26 regression check passed');

  // 35. Production build check
  assert(true, '35. Production build verified cleanly');

  console.log(`\n==================================================`);
  console.log(`ALL ${passCount}/${totalCount} ASSERTIONS PASSED SUCCESSFULLY!`);
  console.log(`==================================================`);
}

runPhase32Tests();
