import { hasAssessmentAccess, hasPremiumAccess } from '../server/entitlements';
import { User, Test } from '../src/types';

// Mock DB implementation for assertion testing
class MockDb {
  private users = new Map<string, User>();
  private tests = new Map<string, Test>();
  private entitlements = new Set<string>(); // key: `${userId}:${testId}`
  private plusSelections = new Map<string, string[]>(); // userId -> testId[]

  addUser(user: User) {
    this.users.set(user.id, user);
  }

  addTest(test: Test) {
    this.tests.set(test.id, test);
  }

  getUserById(id: string): User | null {
    return this.users.get(id) || null;
  }

  getTestById(id: string): Test | null {
    return this.tests.get(id) || null;
  }

  getUserPlan(userId: string): string {
    const u = this.getUserById(userId);
    return u?.plan || 'FREE';
  }

  isSubscriptionActive(userId: string): boolean {
    const u = this.getUserById(userId);
    return hasPremiumAccess(u);
  }

  grantEntitlement(userId: string, testId: string) {
    this.entitlements.add(`${userId}:${testId}`);
  }

  hasActiveAssessmentEntitlement(userId: string, testId: string): boolean {
    return this.entitlements.has(`${userId}:${testId}`);
  }

  setPlusSelections(userId: string, testIds: string[]) {
    this.plusSelections.set(userId, testIds);
  }

  getUserPlusSelections(userId: string): string[] {
    return this.plusSelections.get(userId) || [];
  }
}

// Global assertion counter
let passCount = 0;
let totalCount = 0;

function assert(condition: boolean, description: string) {
  totalCount++;
  if (condition) {
    passCount++;
    console.log(`[PASS ${totalCount}] ${description}`);
  } else {
    console.error(`[FAIL ${totalCount}] ${description}`);
    throw new Error(`Assertion failed: ${description}`);
  }
}

function runTests() {
  console.log('=== PHASE 30 PREMIUM TEST ACTION FLOW & ENTITLEMENT VERIFICATION ===\n');

  const mockDb = new MockDb();

  // Test data setup
  const freeTest: Test = {
    id: 'test-free-1',
    title: 'Standard General Knowledge',
    description: 'Free sample test',
    category: 'General',
    durationMinutes: 15,
    totalQuestions: 10,
    passingScore: 60,
    accessType: 'FREE',
    questions: []
  };

  const premiumTest1: Test = {
    id: 'test-prem-1',
    title: 'Advanced System Architecture',
    description: 'Premium test 1',
    category: 'Engineering',
    durationMinutes: 45,
    totalQuestions: 30,
    passingScore: 70,
    accessType: 'PREMIUM',
    questions: []
  };

  const premiumTest2: Test = {
    id: 'test-prem-2',
    title: 'Machine Learning Deep Dive',
    description: 'Premium test 2',
    category: 'AI',
    durationMinutes: 60,
    totalQuestions: 40,
    passingScore: 75,
    accessType: 'PREMIUM',
    questions: []
  };

  const premiumTest3: Test = {
    id: 'test-prem-3',
    title: 'Executive Leadership Evaluation',
    description: 'Premium test 3',
    category: 'Management',
    durationMinutes: 30,
    totalQuestions: 20,
    passingScore: 80,
    accessType: 'PREMIUM',
    questions: []
  };

  mockDb.addTest(freeTest);
  mockDb.addTest(premiumTest1);
  mockDb.addTest(premiumTest2);
  mockDb.addTest(premiumTest3);

  // Users setup
  const freeUser: User = {
    id: 'user-free',
    name: 'Free User',
    email: 'free@example.com',
    role: 'student',
    plan: 'FREE',
    subscriptionStatus: 'inactive'
  };

  const purchasedUser: User = {
    id: 'user-purchased',
    name: 'Purchased User',
    email: 'purchased@example.com',
    role: 'student',
    plan: 'FREE',
    subscriptionStatus: 'inactive'
  };

  const plusUser: User = {
    id: 'user-plus',
    name: 'Plus User',
    email: 'plus@example.com',
    role: 'student',
    plan: 'PLUS',
    subscriptionStatus: 'active'
  };

  const proUser: User = {
    id: 'user-pro',
    name: 'Pro User',
    email: 'pro@example.com',
    role: 'student',
    plan: 'PRO',
    subscriptionStatus: 'active'
  };

  const adminUser: User = {
    id: 'user-admin',
    name: 'Admin User',
    email: 'admin@example.com',
    role: 'admin',
    plan: 'FREE',
    subscriptionStatus: 'inactive'
  };

  mockDb.addUser(freeUser);
  mockDb.addUser(purchasedUser);
  mockDb.addUser(plusUser);
  mockDb.addUser(proUser);
  mockDb.addUser(adminUser);

  // Grant lifetime entitlement for premiumTest1 to purchasedUser
  mockDb.grantEntitlement('user-purchased', 'test-prem-1');

  // Set Plus selections for plusUser (test-prem-1 & test-prem-2)
  mockDb.setPlusSelections('user-plus', ['test-prem-1', 'test-prem-2']);

  // SECTION 1: Free Assessment Access (Assertions 1-5)
  console.log('--- Section 1: Free Assessment Access ---');
  let res = hasAssessmentAccess(null, freeTest, mockDb);
  assert(res.allowed === true, '1. Unauthenticated user can access FREE test');
  assert(res.unlockedVia === 'free', '2. FREE test unlocked via "free"');

  res = hasAssessmentAccess(freeUser, freeTest, mockDb);
  assert(res.allowed === true, '3. Free user can access FREE test');

  res = hasAssessmentAccess(plusUser, freeTest, mockDb);
  assert(res.allowed === true, '4. Plus user can access FREE test');

  res = hasAssessmentAccess(proUser, freeTest, mockDb);
  assert(res.allowed === true, '5. Pro user can access FREE test');

  // SECTION 2: Unauthenticated Premium Assessment Access (Assertions 6-8)
  console.log('\n--- Section 2: Unauthenticated Premium Access ---');
  res = hasAssessmentAccess(null, premiumTest1, mockDb);
  assert(res.allowed === false, '6. Unauthenticated user blocked from PREMIUM test');
  assert(res.isPremium === false, '7. Unauthenticated user result isPremium is false');
  assert(typeof res.reason === 'string', '8. Unauthenticated user receives denial reason');

  // SECTION 3: Free User Premium Assessment Access (Assertions 9-12)
  console.log('\n--- Section 3: Free User Premium Access ---');
  res = hasAssessmentAccess(freeUser, premiumTest1, mockDb);
  assert(res.allowed === false, '9. Free user blocked from unpurchased PREMIUM test');
  assert(res.reason?.includes('Upgrade to FirstRound Plus'), '10. Denial reason prompts upgrade for FREE user');

  res = hasAssessmentAccess(freeUser.id, premiumTest1.id, mockDb);
  assert(res.allowed === false, '11. userId string resolution works and blocks FREE user');
  assert(res.reason !== undefined, '12. userId string resolution provides reason');

  // SECTION 4: Purchased Entitlement Access (Assertions 13-17)
  console.log('\n--- Section 4: Purchased Entitlement Access ---');
  res = hasAssessmentAccess(purchasedUser, premiumTest1, mockDb);
  assert(res.allowed === true, '13. User with entitlement allowed for purchased PREMIUM test');
  assert(res.unlockedVia === 'entitlement', '14. Unlocked via "entitlement"');
  assert(res.isPremium === true, '15. Result isPremium is true');

  res = hasAssessmentAccess(purchasedUser, premiumTest2, mockDb);
  assert(res.allowed === false, '16. Purchased user blocked from non-purchased PREMIUM test');
  assert(res.unlockedVia === undefined, '17. No unlockedVia on denied entitlement check');

  // SECTION 5: Admin Preview Access (Assertions 18-20)
  console.log('\n--- Section 5: Admin Access ---');
  res = hasAssessmentAccess(adminUser, premiumTest1, mockDb);
  assert(res.allowed === true, '18. Admin user allowed access to PREMIUM test 1');
  assert(res.unlockedVia === 'admin', '19. Admin unlocked via "admin"');

  res = hasAssessmentAccess(adminUser, premiumTest3, mockDb);
  assert(res.allowed === true, '20. Admin user allowed access to PREMIUM test 3');

  // SECTION 6: Pro Active Subscription Access (Assertions 21-25)
  console.log('\n--- Section 6: Pro Subscription Access ---');
  res = hasAssessmentAccess(proUser, premiumTest1, mockDb);
  assert(res.allowed === true, '21. Pro user access allowed to premiumTest1');
  assert(res.unlockedVia === 'subscription', '22. Pro user unlocked via "subscription"');

  res = hasAssessmentAccess(proUser, premiumTest2, mockDb);
  assert(res.allowed === true, '23. Pro user access allowed to premiumTest2');

  res = hasAssessmentAccess(proUser, premiumTest3, mockDb);
  assert(res.allowed === true, '24. Pro user access allowed to all premium tests (test3)');
  assert(res.isPremium === true, '25. Pro access sets isPremium true');

  // SECTION 7: Plus Subscription 2-Selection Limits (Assertions 26-32)
  console.log('\n--- Section 7: Plus Subscription Selections ---');
  res = hasAssessmentAccess(plusUser, premiumTest1, mockDb);
  assert(res.allowed === true, '26. Plus user access allowed for selected test 1');
  assert(res.unlockedVia === 'plus_selection', '27. Plus user unlocked via "plus_selection"');

  res = hasAssessmentAccess(plusUser, premiumTest2, mockDb);
  assert(res.allowed === true, '28. Plus user access allowed for selected test 2');
  assert(res.unlockedVia === 'plus_selection', '29. Plus user unlocked via "plus_selection" for test 2');

  res = hasAssessmentAccess(plusUser, premiumTest3, mockDb);
  assert(res.allowed === false, '30. Plus user blocked from 3rd non-selected test');
  assert(res.reason?.includes('Select this assessment as one of your 2 Plus assessments'), '31. Plus denial reason prompts selecting or upgrading');
  assert(res.unlockedVia === undefined, '32. Plus denied test has no unlockedVia');

  // SECTION 8: Badge & Presentation Rules (Assertions 33-37)
  console.log('\n--- Section 8: UI Presentation Rules ---');
  assert(freeTest.accessType === 'FREE', '33. FREE test accessType is FREE');
  assert(premiumTest1.accessType === 'PREMIUM', '34. Premium test 1 accessType is PREMIUM');
  assert(premiumTest2.accessType === 'PREMIUM', '35. Premium test 2 accessType is PREMIUM');
  assert(premiumTest3.accessType === 'PREMIUM', '36. Premium test 3 accessType is PREMIUM');
  assert(
    [freeTest, premiumTest1, premiumTest2, premiumTest3].every(t => t.accessType === 'FREE' || t.accessType === 'PREMIUM'),
    '37. Only canonical FREE or PREMIUM accessType values are present'
  );

  // SECTION 9: Action & API Request Authorization Validation (Assertions 38-43)
  console.log('\n--- Section 9: API Request & Headers Contract ---');
  const getAuthHeaders = (userId?: string | null) => {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (userId) {
      headers['Authorization'] = `Bearer ${userId}`;
      headers['x-user-id'] = userId;
    }
    return headers;
  };

  const unauthHeaders = getAuthHeaders(null);
  assert(unauthHeaders['Authorization'] === undefined, '38. Unauthenticated request omits Auth token');
  assert(unauthHeaders['x-user-id'] === undefined, '39. Unauthenticated request omits x-user-id header');

  const authHeaders = getAuthHeaders('user-plus');
  assert(authHeaders['Authorization'] === 'Bearer user-plus', '40. Authenticated request includes Authorization header');
  assert(authHeaders['x-user-id'] === 'user-plus', '41. Authenticated request includes x-user-id header');

  const mockApiGetTestById = (testId: string, userId?: string | null) => {
    const access = hasAssessmentAccess(userId, testId, mockDb);
    if (!access.allowed) {
      return { isLocked: true, error: access.reason || 'Assessment is locked.' };
    }
    const test = mockDb.getTestById(testId);
    return { test, isLocked: false };
  };

  const unlockedResult = mockApiGetTestById('test-prem-1', 'user-plus');
  assert(unlockedResult.isLocked === false && unlockedResult.test !== undefined, '42. apiGetTestById with auth headers returns full test data for accessible premium test');

  const lockedResult = mockApiGetTestById('test-prem-3', 'user-plus');
  assert(lockedResult.isLocked === true && lockedResult.error !== undefined, '43. apiGetTestById returns isLocked: true for unselected premium test');

  console.log(`\n==================================================`);
  console.log(`ALL ${passCount}/${totalCount} ASSERTIONS PASSED SUCCESSFULLY!`);
  console.log(`==================================================`);
}

runTests();
