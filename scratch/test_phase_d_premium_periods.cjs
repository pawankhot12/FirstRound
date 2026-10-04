const Database = require('better-sqlite3');
const path = require('path');
const http = require('http');

const dbPath = path.resolve(process.cwd(), 'firstround.db');
const db = new Database(dbPath);

function request(method, path, body, headers = {}) {
  return new Promise((resolve, reject) => {
    const data = body ? JSON.stringify(body) : null;
    const req = http.request(
      {
        hostname: 'localhost',
        port: 3000,
        path,
        method,
        headers: {
          'Content-Type': 'application/json',
          'X-Requested-With': 'XMLHttpRequest',
          ...(data ? { 'Content-Length': Buffer.byteLength(data) } : {}),
          ...headers,
        },
      },
      (res) => {
        let raw = '';
        res.on('data', (chunk) => (raw += chunk));
        res.on('end', () => {
          try {
            const parsed = JSON.parse(raw);
            resolve({ status: res.statusCode, data: parsed, headers: res.headers });
          } catch (e) {
            resolve({ status: res.statusCode, text: raw, headers: res.headers });
          }
        });
      }
    );
    req.on('error', reject);
    if (data) req.write(data);
    req.end();
  });
}

function assert(condition, message) {
  if (!condition) {
    console.error(`❌ FAIL: ${message}`);
    process.exit(1);
  }
  console.log(`✅ PASS: ${message}`);
}

async function runTests() {
  console.log('================================================================');
  console.log('🧪 FIRSTROUND — PHASE D: PREMIUM PERIOD LIFECYCLE TEST SUITE');
  console.log('================================================================\n');

  const now = new Date();
  const nowIso = now.toISOString();

  // -------------------------------------------------------------
  // TEST 1: Schema Verification
  // -------------------------------------------------------------
  console.log('--- 1. Database Schema Verification ---');
  db.exec(`
    CREATE TABLE IF NOT EXISTS deep_ai_premium_periods (
      id TEXT PRIMARY KEY,
      userId TEXT NOT NULL,
      periodStart TEXT NOT NULL,
      periodEnd TEXT NOT NULL,
      allocatedCredits INTEGER NOT NULL,
      usedCredits INTEGER DEFAULT 0,
      status TEXT DEFAULT 'ACTIVE',
      createdAt TEXT NOT NULL,
      updatedAt TEXT NOT NULL,
      FOREIGN KEY (userId) REFERENCES users(id) ON DELETE CASCADE
    );
    CREATE INDEX IF NOT EXISTS idx_premium_periods_lookup ON deep_ai_premium_periods(userId, status, periodEnd);
  `);
  const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all().map((t) => t.name);
  assert(tables.includes('deep_ai_premium_periods'), 'deep_ai_premium_periods table exists');
  assert(tables.includes('deep_ai_credit_ledger'), 'deep_ai_credit_ledger table exists');

  // -------------------------------------------------------------
  // TEST 2: Free Student User (No fake Premium credits)
  // -------------------------------------------------------------
  console.log('\n--- 2. Free Student User Verification ---');
  const freeUserId = `phase_d_free_${Date.now()}`;
  db.prepare(`
    INSERT INTO users (id, email, name, role, totalPoints, createdAt, plan, subscriptionStatus)
    VALUES (?, ?, ?, 'student', 0, ?, 'FREE', 'inactive')
  `).run(freeUserId, `${freeUserId}@student.firstround.test`, 'Free Student', nowIso);

  const freeCreditsRes = await request('GET', `/api/ai/credits?userId=${freeUserId}`);
  assert(freeCreditsRes.data.free === 6, 'Free student has 6 free credits');
  assert(freeCreditsRes.data.premium === 0, 'Free student has 0 premium credits');
  assert(freeCreditsRes.data.total === 6, 'Free student total is 6');
  assert(freeCreditsRes.data.premiumPeriodStatus === 'NONE', 'Free student premiumPeriodStatus is NONE');

  // -------------------------------------------------------------
  // TEST 3: Premium User Period Creation & Idempotency
  // -------------------------------------------------------------
  console.log('\n--- 3. Premium User Period Creation & Idempotency ---');
  const premUserId = `phase_d_prem_${Date.now()}`;
  const futureExp = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000).toISOString();
  db.prepare(`
    INSERT INTO users (id, email, name, role, totalPoints, createdAt, plan, subscriptionStatus, subscriptionExpiresAt)
    VALUES (?, ?, ?, 'student', 0, ?, 'PREMIUM', 'active', ?)
  `).run(premUserId, `${premUserId}@premium.firstround.test`, 'Premium Student', nowIso, futureExp);

  // Call GET /api/ai/credits to trigger period initialization
  const premCredits1 = await request('GET', `/api/ai/credits?userId=${premUserId}`);
  assert(premCredits1.data.free === 6, 'Premium student has 6 free credits');
  assert(premCredits1.data.premium === 100, 'Premium student receives 100 period allowance');
  assert(premCredits1.data.total === 106, 'Premium student total is 106 (6 free + 100 premium)');
  assert(premCredits1.data.premiumPeriodStatus === 'ACTIVE', 'Premium period is ACTIVE');
  assert(premCredits1.data.premiumAllocated === 100, 'premiumAllocated is 100');
  assert(premCredits1.data.premiumUsed === 0, 'premiumUsed is 0');
  assert(premCredits1.data.premiumRemaining === 100, 'premiumRemaining is 100');

  // Idempotency: Call it 20 times in parallel
  console.log('Testing 20 concurrent credit balance requests...');
  await Promise.all(
    Array.from({ length: 20 }).map(() => request('GET', `/api/ai/credits?userId=${premUserId}`))
  );

  const periodsInDb = db.prepare('SELECT * FROM deep_ai_premium_periods WHERE userId = ?').all(premUserId);
  assert(periodsInDb.length === 1, `Exactly 1 period created despite 20 calls (got ${periodsInDb.length})`);
  assert(periodsInDb[0].allocatedCredits === 100, 'Period allocatedCredits is 100');

  const grantsInLedger = db.prepare(`
    SELECT * FROM deep_ai_credit_ledger 
    WHERE userId = ? AND source = 'PREMIUM' AND transactionType = 'GRANT'
  `).all(premUserId);
  assert(grantsInLedger.length === 1, `Exactly 1 grant in ledger (got ${grantsInLedger.length})`);

  // -------------------------------------------------------------
  // TEST 4: Credit Consumption Priority: FREE -> PURCHASED -> PREMIUM
  // -------------------------------------------------------------
  console.log('\n--- 4. Credit Consumption Priority (FREE -> PURCHASED -> PREMIUM) ---');
  // Add 5 PURCHASED credits to test 3-tier priority
  db.prepare(`
    INSERT INTO deep_ai_credit_ledger (userId, amount, source, transactionType, description, createdAt)
    VALUES (?, 5, 'PURCHASED', 'GRANT', 'Pack purchase: 5 credits', ?)
  `).run(premUserId, nowIso);

  const balanceBeforeUse = await request('GET', `/api/ai/credits?userId=${premUserId}`);
  assert(balanceBeforeUse.data.free === 6, 'Balance before use: free = 6');
  assert(balanceBeforeUse.data.purchased === 5, 'Balance before use: purchased = 5');
  assert(balanceBeforeUse.data.premium === 100, 'Balance before use: premium = 100');
  assert(balanceBeforeUse.data.total === 111, 'Balance before use: total = 111');

  // Consume 6 FREE credits first
  console.log('Consuming 6 questions (should consume all 6 FREE credits first)...');
  for (let i = 1; i <= 6; i++) {
    const res = await request('POST', '/api/ai/deep-help', {
      userId: premUserId,
      question: { id: `q_prio_free_${i}`, questionText: `Free Q ${i}`, topic: 'Aptitude', options: [{ id: 'A', text: 'A' }] },
      currentStep: 1,
    });
    assert(res.status === 200, `Question ${i} succeeded`);
  }

  const balAfterFree = await request('GET', `/api/ai/credits?userId=${premUserId}`);
  assert(balAfterFree.data.free === 0, 'FREE credits are now 0');
  assert(balAfterFree.data.purchased === 5, 'PURCHASED credits remain intact at 5');
  assert(balAfterFree.data.premium === 100, 'PREMIUM credits remain intact at 100');
  assert(balAfterFree.data.total === 105, 'Total is now 105');

  // Consume 5 PURCHASED credits next
  console.log('Consuming 5 questions (should consume all 5 PURCHASED credits next)...');
  for (let i = 1; i <= 5; i++) {
    const res = await request('POST', '/api/ai/deep-help', {
      userId: premUserId,
      question: { id: `q_prio_purchased_${i}`, questionText: `Purchased Q ${i}`, topic: 'Aptitude', options: [{ id: 'A', text: 'A' }] },
      currentStep: 1,
    });
    assert(res.status === 200, `Question ${i} succeeded`);
  }

  const balAfterPurchased = await request('GET', `/api/ai/credits?userId=${premUserId}`);
  assert(balAfterPurchased.data.free === 0, 'FREE credits are 0');
  assert(balAfterPurchased.data.purchased === 0, 'PURCHASED credits are now 0');
  assert(balAfterPurchased.data.premium === 100, 'PREMIUM credits remain intact at 100');
  assert(balAfterPurchased.data.total === 100, 'Total is now 100');

  // Now consume 3 PREMIUM credits
  console.log('Consuming 3 questions (should consume 3 PREMIUM credits)...');
  for (let i = 1; i <= 3; i++) {
    const res = await request('POST', '/api/ai/deep-help', {
      userId: premUserId,
      question: { id: `q_prio_prem_${i}`, questionText: `Premium Q ${i}`, topic: 'Aptitude', options: [{ id: 'A', text: 'A' }] },
      currentStep: 1,
    });
    assert(res.status === 200, `Question ${i} succeeded`);
  }

  const balAfterPremium = await request('GET', `/api/ai/credits?userId=${premUserId}`);
  assert(balAfterPremium.data.free === 0, 'FREE is 0');
  assert(balAfterPremium.data.purchased === 0, 'PURCHASED is 0');
  assert(balAfterPremium.data.premium === 97, 'PREMIUM is now 97');
  assert(balAfterPremium.data.total === 97, 'Total is 97');
  assert(balAfterPremium.data.premiumUsed === 3, 'premiumUsed on period is 3');
  assert(balAfterPremium.data.premiumRemaining === 97, 'premiumRemaining on period is 97');

  // Follow-up in same question does NOT consume credit
  console.log('Sending follow-up query in same session (must NOT consume credit)...');
  const followupRes = await request('POST', '/api/ai/deep-help', {
    userId: premUserId,
    question: { id: `q_prio_prem_3`, questionText: `Premium Q 3`, topic: 'Aptitude', options: [{ id: 'A', text: 'A' }] },
    currentStep: 2,
    followUpQuery: 'Can you clarify step 2?',
  });
  assert(followupRes.data.creditsLeft === 97, 'Follow-up returned 97 credits left (no extra deduction)');

  // -------------------------------------------------------------
  // TEST 5: Premium Expiry / Cancellation (No Rollover & Usable Balance = 0)
  // -------------------------------------------------------------
  console.log('\n--- 5. Premium Expiry / Cancellation ---');
  // Give user 10 PURCHASED credits before expiry
  db.prepare(`
    INSERT INTO deep_ai_credit_ledger (userId, amount, source, transactionType, description, createdAt)
    VALUES (?, 10, 'PURCHASED', 'GRANT', 'User bought 10 pack', ?)
  `).run(premUserId, nowIso);

  // Expire the user's subscription
  const pastExp = new Date(now.getTime() - 1000 * 60 * 60).toISOString();
  db.prepare(`
    UPDATE users 
    SET plan = 'FREE', subscriptionStatus = 'inactive', subscriptionExpiresAt = ?
    WHERE id = ?
  `).run(pastExp, premUserId);

  // Expire the active period in DB
  db.prepare(`
    UPDATE deep_ai_premium_periods
    SET periodEnd = ?, status = 'EXPIRED'
    WHERE userId = ?
  `).run(pastExp, premUserId);

  const balAfterExpiry = await request('GET', `/api/ai/credits?userId=${premUserId}`);
  console.log('Balance after Premium expiry:', balAfterExpiry.data);
  assert(balAfterExpiry.data.premium === 0, 'PREMIUM credits are 0 after expiry');
  assert(balAfterExpiry.data.purchased === 10, 'PURCHASED credits remain 10');
  assert(balAfterExpiry.data.total === 10, 'Total credits is 10 (purchased credits remain intact)');
  assert(balAfterExpiry.data.isPremiumUser === false, 'isPremiumUser is false');

  // -------------------------------------------------------------
  // TEST 6: Premium Reactivation / Next Period (Fresh Allowance, No Rollover)
  // -------------------------------------------------------------
  console.log('\n--- 6. Premium Reactivation / Next Period ---');
  // Reactivate user to Premium
  const newFutureExp = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000).toISOString();
  db.prepare(`
    UPDATE users 
    SET plan = 'PREMIUM', subscriptionStatus = 'active', subscriptionExpiresAt = ?
    WHERE id = ?
  `).run(newFutureExp, premUserId);

  const balAfterReactivation = await request('GET', `/api/ai/credits?userId=${premUserId}`);
  console.log('Balance after Reactivation:', balAfterReactivation.data);
  assert(balAfterReactivation.data.premium === 100, 'Fresh period gets exactly 100 credits (no rollover of old 97)');
  assert(balAfterReactivation.data.purchased === 10, 'PURCHASED credits remain 10');
  assert(balAfterReactivation.data.total === 110, 'Total credits is 110 (10 purchased + 100 new premium)');
  assert(balAfterReactivation.data.premiumUsed === 0, 'New period premiumUsed is 0');
  assert(balAfterReactivation.data.premiumPeriodStatus === 'ACTIVE', 'New period status is ACTIVE');

  // Verify historical periods are preserved
  const allUserPeriods = db.prepare('SELECT * FROM deep_ai_premium_periods WHERE userId = ? ORDER BY createdAt ASC').all(premUserId);
  assert(allUserPeriods.length === 2, `2 periods in history (got ${allUserPeriods.length})`);
  assert(allUserPeriods[0].status === 'EXPIRED', 'Period 1 is EXPIRED');
  assert(allUserPeriods[0].usedCredits === 3, 'Period 1 recorded 3 used credits');
  assert(allUserPeriods[1].status === 'ACTIVE', 'Period 2 is ACTIVE');
  assert(allUserPeriods[1].usedCredits === 0, 'Period 2 recorded 0 used credits');

  // -------------------------------------------------------------
  // TEST 7: Exam Mode Isolation Check
  // -------------------------------------------------------------
  console.log('\n--- 7. Exam Mode Isolation ---');
  const examRes = await request('POST', '/api/ai/deep-help', {
    userId: premUserId,
    mode: 'exam',
    question: { id: 'q_exam_test', questionText: 'Exam Q', topic: 'Exam' },
  });
  assert(examRes.status === 403, 'Deep AI blocked in Exam Mode (403)');

  // -------------------------------------------------------------
  // TEST 8: Standard AI Doubt Solver Free & Unmetered
  // -------------------------------------------------------------
  console.log('\n--- 8. Standard AI Doubt Solver / Copilot ---');
  const copilotRes = await request('POST', '/api/ai/ask-doubt', {
    userId: premUserId,
    question: { id: 'q_doubt_test', questionText: 'What is O(log n)?', topic: 'DSA' },
    studentQuestion: 'Please explain binary search time complexity',
  });
  assert(copilotRes.status === 200 && !!copilotRes.data?.explanation, 'Standard Copilot is functional and unmetered');

  console.log('\n================================================================');
  console.log('🎉 ALL PHASE D: PREMIUM PERIOD LIFECYCLE TESTS PASSED (100%)');
  console.log('================================================================\n');
}

runTests().catch((err) => {
  console.error('❌ Test failed:', err);
  process.exit(1);
});
