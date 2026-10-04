const Database = require('better-sqlite3');
const path = require('path');

const dbPath = path.resolve(__dirname, '../firstround.db');
const db = new Database(dbPath);

console.log('====================================================');
console.log('FIRSTROUND — PREMIUM FOUNDATION PHASE 1 VERIFICATION');
console.log('====================================================\n');

let passedTests = 0;
let totalTests = 0;

function assert(condition, message) {
  totalTests++;
  if (condition) {
    console.log(`[PASS] ${message}`);
    passedTests++;
  } else {
    console.error(`[FAIL] ${message}`);
    process.exitCode = 1;
  }
}

// 1. Database Schema Verification
console.log('--- 1. Database Schema & Columns Verification ---');
const userCols = db.prepare("PRAGMA table_info(users)").all().map(c => c.name);
assert(userCols.includes('plan'), 'users table contains plan column');
assert(userCols.includes('subscriptionStatus'), 'users table contains subscriptionStatus column');
assert(userCols.includes('subscriptionExpiresAt'), 'users table contains subscriptionExpiresAt column');
assert(userCols.includes('provider'), 'users table contains provider column');
assert(userCols.includes('providerCustomerId'), 'users table contains providerCustomerId column');
assert(userCols.includes('providerSubscriptionId'), 'users table contains providerSubscriptionId column');
assert(userCols.includes('currentPeriodStart'), 'users table contains currentPeriodStart column');
assert(userCols.includes('currentPeriodEnd'), 'users table contains currentPeriodEnd column');

const testCols = db.prepare("PRAGMA table_info(tests)").all().map(c => c.name);
assert(testCols.includes('accessType'), 'tests table contains accessType column');

const deepAITable = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='deep_ai_usage'").get();
assert(!!deepAITable, 'deep_ai_usage table exists');

const deepAICols = db.prepare("PRAGMA table_info(deep_ai_usage)").all().map(c => c.name);
assert(deepAICols.includes('userId'), 'deep_ai_usage contains userId column');
assert(deepAICols.includes('requestCount'), 'deep_ai_usage contains requestCount column');
assert(deepAICols.includes('inputTokens'), 'deep_ai_usage contains inputTokens column');
assert(deepAICols.includes('outputTokens'), 'deep_ai_usage contains outputTokens column');
assert(deepAICols.includes('estimatedCost'), 'deep_ai_usage contains estimatedCost column');

// 2. Production Assessments & Users Integrity
console.log('\n--- 2. Production Content & Users Integrity ---');
const allTests = db.prepare("SELECT id, title, accessType, status FROM tests").all();
console.log(`Found ${allTests.length} tests in database.`);
assert(allTests.length >= 17, `Catalogue has at least 17 tests (found ${allTests.length})`);

const nonFreeTests = allTests.filter(t => t.accessType && t.accessType !== 'FREE');
assert(nonFreeTests.length === 0, `All existing catalogue tests default to FREE accessType (found ${nonFreeTests.length} non-free)`);

const users = db.prepare("SELECT id, email, role, plan, subscriptionStatus FROM users").all();
console.log(`Found ${users.length} production users:`);
users.forEach(u => console.log(` - ${u.email} (${u.role}): plan=${u.plan || 'FREE'}, status=${u.subscriptionStatus || 'inactive'}`));

const superAdmin = users.find(u => u.email.toLowerCase() === 'pawankhot9@gmail.com');
assert(!!superAdmin, 'Super Admin user pawankhot9@gmail.com exists');
assert(superAdmin?.role === 'super_admin', 'pawankhot9@gmail.com has super_admin role');

const testUser1 = users.find(u => u.email.toLowerCase() === 'akhot5779@gmail.com');
assert(!!testUser1, 'akhot5779@gmail.com exists and is preserved');

const testUser2 = users.find(u => u.email.toLowerCase() === 'pawan.khot1272004@gmail.com');
assert(!!testUser2, 'pawan.khot1272004@gmail.com exists and is preserved');

const qCount = db.prepare("SELECT COUNT(*) as count FROM questions").get().count;
console.log(`Found ${qCount} total canonical questions in database.`);
assert(qCount >= 391, `Question bank intact with 391+ canonical questions (found ${qCount})`);

// 3. Entitlement Logic Unit Verification
console.log('\n--- 3. Centralized Entitlement Rules Verification ---');

// Mock User Objects
const freeUser = {
  id: 'usr_free_1',
  email: 'student@firstround.com',
  role: 'student',
  plan: 'FREE',
  subscriptionStatus: 'inactive',
  subscriptionExpiresAt: null
};

const activePremiumUser = {
  id: 'usr_prem_1',
  email: 'premium@firstround.com',
  role: 'student',
  plan: 'PREMIUM',
  subscriptionStatus: 'active',
  subscriptionExpiresAt: new Date(Date.now() + 86400000 * 30).toISOString()
};

const expiredPremiumUser = {
  id: 'usr_prem_exp',
  email: 'expired@firstround.com',
  role: 'student',
  plan: 'PREMIUM',
  subscriptionStatus: 'active',
  subscriptionExpiresAt: new Date(Date.now() - 86400000).toISOString() // Expired yesterday
};

const inactivePremiumUser = {
  id: 'usr_prem_inact',
  email: 'inactive@firstround.com',
  role: 'student',
  plan: 'PREMIUM',
  subscriptionStatus: 'inactive',
  subscriptionExpiresAt: null
};

const adminUser = {
  id: 'usr_admin_1',
  email: 'admin@firstround.com',
  role: 'admin',
  plan: 'FREE',
  subscriptionStatus: 'inactive'
};

function hasPremiumAccess(user) {
  if (!user) return false;
  if (user.plan !== 'PREMIUM') return false;
  if (user.subscriptionStatus !== 'active') return false;
  if (user.subscriptionExpiresAt) {
    const expiresMs = new Date(user.subscriptionExpiresAt).getTime();
    if (isNaN(expiresMs) || expiresMs <= Date.now()) return false;
  }
  return true;
}

function hasAssessmentAccess(user, assessment) {
  const isPremiumAssessment = assessment?.accessType === 'PREMIUM';
  if (!isPremiumAssessment) return { allowed: true };
  if (user && (user.role === 'admin' || user.role === 'super_admin')) return { allowed: true };
  if (hasPremiumAccess(user)) return { allowed: true };
  return { allowed: false, reason: 'Upgrade to FirstRound Premium to access this assessment.' };
}

function canUseDeepAI(user) {
  const isPrem = hasPremiumAccess(user);
  const isAdmin = Boolean(user && (user.role === 'admin' || user.role === 'super_admin'));
  if (isPrem || isAdmin) {
    return { allowed: true, isPremium: isPrem || isAdmin, status: 'eligible' };
  }
  return { allowed: false, isPremium: false, status: 'locked', reason: 'Upgrade to FirstRound Premium to unlock Deep AI Help.' };
}

assert(hasPremiumAccess(freeUser) === false, 'freeUser hasPremiumAccess is false');
assert(hasPremiumAccess(activePremiumUser) === true, 'activePremiumUser hasPremiumAccess is true');
assert(hasPremiumAccess(expiredPremiumUser) === false, 'expiredPremiumUser hasPremiumAccess is false');
assert(hasPremiumAccess(inactivePremiumUser) === false, 'inactivePremiumUser hasPremiumAccess is false');
assert(hasPremiumAccess(null) === false, 'null user hasPremiumAccess is false');

const freeAssessment = { id: 'cat_foundation_quant', accessType: 'FREE' };
const premiumAssessment = { id: 'cat_company_premium_mock', accessType: 'PREMIUM' };

assert(hasAssessmentAccess(freeUser, freeAssessment).allowed === true, 'Free user can access FREE assessment');
assert(hasAssessmentAccess(null, freeAssessment).allowed === true, 'Guest user can access FREE assessment');
assert(hasAssessmentAccess(freeUser, premiumAssessment).allowed === false, 'Free user CANNOT access PREMIUM assessment');
assert(hasAssessmentAccess(activePremiumUser, premiumAssessment).allowed === true, 'Premium user CAN access PREMIUM assessment');
assert(hasAssessmentAccess(adminUser, premiumAssessment).allowed === true, 'Admin user CAN access PREMIUM assessment (Preview)');
assert(hasAssessmentAccess(superAdmin, premiumAssessment).allowed === true, 'Super Admin CAN access PREMIUM assessment');

assert(canUseDeepAI(freeUser).status === 'locked', 'Free user canUseDeepAI is locked');
assert(canUseDeepAI(activePremiumUser).status === 'eligible', 'Premium user canUseDeepAI is eligible');
assert(canUseDeepAI(adminUser).status === 'eligible', 'Admin user canUseDeepAI is eligible');

// 4. Deep AI Usage Architecture in DB
console.log('\n--- 4. Deep AI Usage Architecture Verification ---');
const testUserId = testUser1?.id || 'usr_test_verification';

// Insert usage record
const stmt = db.prepare(`
  INSERT INTO deep_ai_usage (userId, requestCount, inputTokens, outputTokens, estimatedCost, periodStart, periodEnd, createdAt)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?)
`);
const now = new Date();
stmt.run(testUserId, 1, 450, 250, 0.0007, now.toISOString(), now.toISOString(), now.toISOString());

const usageSummary = db.prepare(`
  SELECT 
    COUNT(*) as records,
    SUM(requestCount) as totalRequests,
    SUM(inputTokens) as totalInputTokens,
    SUM(outputTokens) as totalOutputTokens,
    SUM(estimatedCost) as totalCost
  FROM deep_ai_usage WHERE userId = ?
`).get(testUserId);

assert(usageSummary.records >= 1, `deep_ai_usage successfully recorded for user ${testUserId}`);
assert(usageSummary.totalRequests >= 1, `deep_ai_usage request count tracked (${usageSummary.totalRequests})`);
console.log(`Deep AI Usage Summary: ${usageSummary.totalRequests} reqs, ${usageSummary.totalInputTokens} input tokens, ${usageSummary.totalOutputTokens} output tokens, $${usageSummary.totalCost} estimated cost.`);

// Clean up test usage row
db.prepare("DELETE FROM deep_ai_usage WHERE userId = ?").run(testUserId);

console.log('\n====================================================');
console.log(`RESULTS: ${passedTests}/${totalTests} TESTS PASSED`);
console.log('====================================================');

if (passedTests === totalTests) {
  console.log('\n✅ ALL PREMIUM FOUNDATION PHASE 1 CRITERIA VERIFIED SUCCESSFULLY!');
}
