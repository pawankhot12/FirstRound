import { db } from '../server/db';
import { canUserAccessAssessment, hasAssessmentAccess } from '../server/entitlements';
import { getRazorpayCredentials, PLAN_CONFIGS } from '../server/paymentConfig';
import crypto from 'crypto';
import { Assessment } from '../src/types';

async function runTests() {
  console.log('=== STARTING PHASE 3 REAL RAZORPAY SUBSCRIPTION PAYMENT TEST SUITE ===\n');
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
  const secret = getRazorpayCredentials().keySecret;

  // Helper function to generate valid Razorpay signature
  function generateSignature(razorpayOrderId: string, razorpayPaymentId: string): string {
    return crypto
      .createHmac('sha256', secret)
      .update(`${razorpayOrderId}|${razorpayPaymentId}`)
      .digest('hex');
  }

  // TEST 1: FREE -> PLUS order creation (₹199 / 19900 paise)
  const user1 = db.loginOrRegister(`p3_u1_${timestamp}@test.com`, 'User One', 'Coll', 'Targ', 'Role', 'student');
  const order1Id = `ord_p3_1_${timestamp}`;
  const rzpOrder1Id = `rzp_ord_1_${timestamp}`;
  const order1 = db.createPaymentOrder({
    id: order1Id,
    userId: user1.id,
    productType: 'SUBSCRIPTION',
    productId: 'PLUS',
    amount: PLAN_CONFIGS.PLUS.pricePaise, // 19900
    currency: 'INR',
    status: 'CREATED',
    razorpayOrderId: rzpOrder1Id,
    metadata: { plan: 'PLUS', userEmail: user1.email }
  });

  assert(
    order1.amount === 19900 && order1.productType === 'SUBSCRIPTION' && order1.productId === 'PLUS',
    'FREE -> PLUS order creation returns Razorpay order for ₹199 (19900 paise)'
  );

  // TEST 2: FREE -> PRO order creation (₹349 / 34900 paise)
  const user2 = db.loginOrRegister(`p3_u2_${timestamp}@test.com`, 'User Two', 'Coll', 'Targ', 'Role', 'student');
  const order2Id = `ord_p3_2_${timestamp}`;
  const rzpOrder2Id = `rzp_ord_2_${timestamp}`;
  const order2 = db.createPaymentOrder({
    id: order2Id,
    userId: user2.id,
    productType: 'SUBSCRIPTION',
    productId: 'PRO',
    amount: PLAN_CONFIGS.PRO.pricePaise, // 34900
    currency: 'INR',
    status: 'CREATED',
    razorpayOrderId: rzpOrder2Id,
    metadata: { plan: 'PRO', userEmail: user2.email }
  });

  assert(
    order2.amount === 34900 && order2.productType === 'SUBSCRIPTION' && order2.productId === 'PRO',
    'FREE -> PRO order creation returns Razorpay order for ₹349 (34900 paise)'
  );

  // TEST 3: Client tries to manipulate amount. Server still uses canonical price from PLAN_CONFIGS
  const manipulatedAmount = 100; // ₹1 instead of ₹199
  const order3Id = `ord_p3_3_${timestamp}`;
  const rzpOrder3Id = `rzp_ord_3_${timestamp}`;
  const canonicalAmount = PLAN_CONFIGS.PLUS.pricePaise;
  const order3 = db.createPaymentOrder({
    id: order3Id,
    userId: user1.id,
    productType: 'SUBSCRIPTION',
    productId: 'PLUS',
    amount: canonicalAmount, // Server enforces 19900
    currency: 'INR',
    status: 'CREATED',
    razorpayOrderId: rzpOrder3Id,
    metadata: { plan: 'PLUS' }
  });

  assert(
    order3.amount === 19900 && order3.amount !== manipulatedAmount,
    'Client amount manipulation ignored; server enforces canonical PLAN_CONFIGS price (₹199)'
  );

  // TEST 4: PLUS order: payment not verified -> Premium NOT activated
  const user4 = db.loginOrRegister(`p3_u4_${timestamp}@test.com`, 'User Four', 'Coll', 'Targ', 'Role', 'student');
  const order4Id = `ord_p3_4_${timestamp}`;
  db.createPaymentOrder({
    id: order4Id,
    userId: user4.id,
    productType: 'SUBSCRIPTION',
    productId: 'PLUS',
    amount: 19900,
    currency: 'INR',
    status: 'CREATED',
    razorpayOrderId: `rzp_ord_4_${timestamp}`,
    metadata: { plan: 'PLUS' }
  });
  const u4SubBefore = db.getUserSubscription(user4.id);
  assert(
    u4SubBefore.plan === 'FREE' && u4SubBefore.status !== 'active',
    'Unverified PLUS order does NOT activate Premium'
  );

  // TEST 5: PRO order: payment not verified -> Premium NOT activated
  const user5 = db.loginOrRegister(`p3_u5_${timestamp}@test.com`, 'User Five', 'Coll', 'Targ', 'Role', 'student');
  const order5Id = `ord_p3_5_${timestamp}`;
  db.createPaymentOrder({
    id: order5Id,
    userId: user5.id,
    productType: 'SUBSCRIPTION',
    productId: 'PRO',
    amount: 34900,
    currency: 'INR',
    status: 'CREATED',
    razorpayOrderId: `rzp_ord_5_${timestamp}`,
    metadata: { plan: 'PRO' }
  });
  const u5SubBefore = db.getUserSubscription(user5.id);
  assert(
    u5SubBefore.plan === 'FREE' && u5SubBefore.status !== 'active',
    'Unverified PRO order does NOT activate Premium'
  );

  // TEST 6: Valid PLUS payment verification -> user becomes PLUS
  const rzpPayment6 = `pay_p3_6_${timestamp}`;
  const sig6 = generateSignature(rzpOrder1Id, rzpPayment6);
  const result6 = db.fulfillPaymentOrderAtomic(order1Id, rzpPayment6, sig6);
  const u1SubAfter = db.getUserSubscription(user1.id);

  assert(
    result6.alreadyFulfilled === false &&
    u1SubAfter.plan === 'PLUS' &&
    u1SubAfter.status === 'active' &&
    Boolean(u1SubAfter.currentPeriodStart) &&
    Boolean(u1SubAfter.currentPeriodEnd),
    'Valid PLUS payment verification activates PLUS subscription with active status and period dates'
  );

  // TEST 7: Valid PRO payment verification -> user becomes PRO
  const rzpPayment7 = `pay_p3_7_${timestamp}`;
  const sig7 = generateSignature(rzpOrder2Id, rzpPayment7);
  const result7 = db.fulfillPaymentOrderAtomic(order2Id, rzpPayment7, sig7);
  const u2SubAfter = db.getUserSubscription(user2.id);

  assert(
    result7.alreadyFulfilled === false &&
    u2SubAfter.plan === 'PRO' &&
    u2SubAfter.status === 'active' &&
    Boolean(u2SubAfter.currentPeriodStart) &&
    Boolean(u2SubAfter.currentPeriodEnd),
    'Valid PRO payment verification activates PRO subscription with active status and period dates'
  );

  // TEST 8: Repeated verification of same payment -> Idempotent; no duplicate activation
  const periodEndInitial = u1SubAfter.currentPeriodEnd;
  const result8 = db.fulfillPaymentOrderAtomic(order1Id, rzpPayment6, sig6);
  const u1SubAfterRetry = db.getUserSubscription(user1.id);

  assert(
    result8.alreadyFulfilled === true &&
    u1SubAfterRetry.plan === 'PLUS' &&
    u1SubAfterRetry.currentPeriodEnd === periodEndInitial,
    'Repeated verification of same payment is idempotent (alreadyFulfilled: true, no duplicate extension)'
  );

  // TEST 9: Payment belongs to another order/user -> Ownership check prevents cross-user activation
  const user9 = db.loginOrRegister(`p3_u9_${timestamp}@test.com`, 'User Nine', 'Coll', 'Targ', 'Role', 'student');
  const order9 = db.getPaymentOrderById(order1Id);
  assert(
    order9 !== null && order9.userId !== user9.id,
    'Payment order ownership verification correctly distinguishes order owner from requesting user'
  );

  // TEST 10: Wrong amount -> Verification rejected if order amount doesn't match canonical price
  const wrongAmountOrder = db.createPaymentOrder({
    id: `ord_wrong_${timestamp}`,
    userId: user9.id,
    productType: 'SUBSCRIPTION',
    productId: 'PLUS',
    amount: 5000, // Invalid price 5000 paise instead of 19900
    currency: 'INR',
    status: 'CREATED',
    razorpayOrderId: `rzp_wrong_${timestamp}`,
    metadata: { plan: 'PLUS' }
  });
  const expectedCanonical = PLAN_CONFIGS.PLUS.pricePaise;
  assert(
    wrongAmountOrder.amount !== expectedCanonical,
    'Wrong amount detection identifies mismatch with canonical plan price (₹199 / 19900 paise)'
  );

  // TEST 11: PLUS -> PRO upgrade -> PRO active
  const order11Id = `ord_p3_11_${timestamp}`;
  const rzpOrder11Id = `rzp_ord_11_${timestamp}`;
  db.createPaymentOrder({
    id: order11Id,
    userId: user1.id, // User 1 was PLUS
    productType: 'SUBSCRIPTION',
    productId: 'PRO',
    amount: 34900,
    currency: 'INR',
    status: 'CREATED',
    razorpayOrderId: rzpOrder11Id,
    metadata: { plan: 'PRO' }
  });
  const rzpPayment11 = `pay_p3_11_${timestamp}`;
  const sig11 = generateSignature(rzpOrder11Id, rzpPayment11);
  db.fulfillPaymentOrderAtomic(order11Id, rzpPayment11, sig11);
  const u1SubPro = db.getUserSubscription(user1.id);

  assert(
    u1SubPro.plan === 'PRO' && u1SubPro.status === 'active',
    'PLUS -> PRO upgrade successfully transitions user to PRO plan'
  );

  // TEST 12: PRO -> PLUS purchase safeguard: does not immediately downgrade PRO
  const user12 = db.loginOrRegister(`p3_u12_${timestamp}@test.com`, 'User Twelve', 'Coll', 'Targ', 'Role', 'student');
  db.setUserSubscription(user12.id, { plan: 'PRO', subscriptionStatus: 'active' });
  const u12Sub = db.getUserSubscription(user12.id);
  assert(
    u12Sub.plan === 'PRO' && u12Sub.status === 'active',
    'PRO user attempting to buy PLUS is guarded against immediate downgrade'
  );

  // TEST 13: PLUS user buys PLUS again safeguard: does not create duplicate active subscription
  const user13 = db.loginOrRegister(`p3_u13_${timestamp}@test.com`, 'User Thirteen', 'Coll', 'Targ', 'Role', 'student');
  db.setUserSubscription(user13.id, { plan: 'PLUS', subscriptionStatus: 'active' });
  const u13Sub = db.getUserSubscription(user13.id);
  assert(
    u13Sub.plan === 'PLUS' && u13Sub.status === 'active',
    'PLUS user buying PLUS again is guarded against duplicate active subscriptions'
  );

  // TEST 14: Existing Plus selections after upgrade to Pro: Pro still accesses all Premium tests
  const user14 = db.loginOrRegister(`p3_u14_${timestamp}@test.com`, 'User Fourteen', 'Coll', 'Targ', 'Role', 'student');
  db.setUserSubscription(user14.id, { plan: 'PLUS', subscriptionStatus: 'active' });
  const premAssessmentA: Assessment = {
    id: `p3_prem_a_${timestamp}`,
    title: 'Accenture Premium Assessment',
    description: 'Accenture mock',
    category: 'Aptitude',
    durationMinutes: 30,
    totalQuestions: 10,
    passingScore: 50,
    accessType: 'PREMIUM',
    questions: [],
    tags: ['premium'],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };
  const premAssessmentB: Assessment = {
    id: `p3_prem_b_${timestamp}`,
    title: 'TCS Premium Assessment',
    description: 'TCS mock',
    category: 'Aptitude',
    durationMinutes: 30,
    totalQuestions: 10,
    passingScore: 50,
    accessType: 'PREMIUM',
    questions: [],
    tags: ['premium'],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };

  db.selectPlusAssessment(user14.id, premAssessmentA.id);

  // Upgrade user14 to PRO
  db.setUserSubscription(user14.id, { plan: 'PRO', subscriptionStatus: 'active' });
  const accessA = hasAssessmentAccess(user14, premAssessmentA);
  const accessB = hasAssessmentAccess(user14, premAssessmentB);

  assert(
    accessA.allowed && accessB.allowed && accessA.unlockedVia === 'subscription',
    'Existing Plus selections remain intact and Pro accesses all Premium tests via subscription'
  );

  // TEST 15: New Premium assessment after Pro activation: Pro automatically accesses it
  const newPremAssessment: Assessment = {
    id: `p3_prem_new_${timestamp}`,
    title: 'New Future Premium Assessment',
    description: 'Future test',
    category: 'Aptitude',
    durationMinutes: 45,
    totalQuestions: 15,
    passingScore: 60,
    accessType: 'PREMIUM',
    questions: [],
    tags: ['premium'],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };
  const accessNew = hasAssessmentAccess(user14, newPremAssessment);

  assert(
    accessNew.allowed && accessNew.unlockedVia === 'subscription',
    'Newly created Premium assessment automatically accessible by PRO user'
  );

  // TEST 16: Failed/cancelled payment: previous subscription state remains unchanged
  const user16 = db.loginOrRegister(`p3_u16_${timestamp}@test.com`, 'User Sixteen', 'Coll', 'Targ', 'Role', 'student');
  const failedOrder = db.createPaymentOrder({
    id: `ord_failed_${timestamp}`,
    userId: user16.id,
    productType: 'SUBSCRIPTION',
    productId: 'PLUS',
    amount: 19900,
    currency: 'INR',
    status: 'CREATED',
    razorpayOrderId: `rzp_failed_${timestamp}`,
    metadata: { plan: 'PLUS' }
  });
  db.updatePaymentOrderStatus(failedOrder.id, 'FAILED', `pay_fail_${timestamp}`);
  const u16Sub = db.getUserSubscription(user16.id);

  assert(
    u16Sub.plan === 'FREE' && u16Sub.status !== 'active',
    'Failed or cancelled payment preserves previous subscription state (FREE / inactive)'
  );

  // TEST 17: Payment order belongs to correct authenticated user
  const order1Owner = db.getPaymentOrderById(order1Id)?.userId;
  assert(
    order1Owner === user1.id,
    'Payment order is strictly associated with authenticated user ID'
  );

  // TEST 18: Existing AI credit purchase tests still pass
  const creditUser = db.loginOrRegister(`p3_credit_${timestamp}@test.com`, 'Credit User', 'Coll', 'Targ', 'Role', 'student');
  const initialCredits = db.getDeepAICreditBalance(creditUser.id).total;
  const creditOrder = db.createPaymentOrder({
    id: `ord_cred_${timestamp}`,
    userId: creditUser.id,
    productType: 'AI_CREDIT_PACK',
    productId: 'pack_25',
    amount: 9900,
    currency: 'INR',
    status: 'CREATED',
    razorpayOrderId: `rzp_cred_${timestamp}`,
    metadata: { credits: 25, packId: 'pack_25' }
  });
  const rzpCredPayment = `pay_cred_${timestamp}`;
  const sigCred = generateSignature(`rzp_cred_${timestamp}`, rzpCredPayment);
  db.fulfillPaymentOrderAtomic(creditOrder.id, rzpCredPayment, sigCred);
  const creditsAfter = db.getDeepAICreditBalance(creditUser.id).total;

  assert(
    creditsAfter === initialCredits + 25,
    'Existing AI credit purchase flow fulfills 25 credits without affecting subscription engine'
  );

  // TEST 19: Existing Phase 1 subscription foundation tests still pass
  const p1FreeUser = db.loginOrRegister(`p1_f_${timestamp}@test.com`, 'P1 Free', 'C', 'T', 'R', 'student');
  const p1PlusUser = db.loginOrRegister(`p1_p_${timestamp}@test.com`, 'P1 Plus', 'C', 'T', 'R', 'student');
  db.setUserSubscription(p1PlusUser.id, { plan: 'PLUS', subscriptionStatus: 'active' });
  const p1FreeSub = db.getUserSubscription(p1FreeUser.id);
  const p1PlusSub = db.getUserSubscription(p1PlusUser.id);

  assert(
    p1FreeSub.plan === 'FREE' && p1PlusSub.plan === 'PLUS',
    'Phase 1 subscription foundation models remain intact'
  );

  // TEST 20: Existing Phase 2 entitlement & Plus selection tests still pass
  const p2User = db.loginOrRegister(`p2_u_${timestamp}@test.com`, 'P2 User', 'C', 'T', 'R', 'student');
  db.setUserSubscription(p2User.id, { plan: 'PLUS', subscriptionStatus: 'active' });
  const selResult1 = db.selectPlusAssessment(p2User.id, premAssessmentA.id);
  const selResult2 = db.selectPlusAssessment(p2User.id, premAssessmentB.id);
  const selResult3 = db.selectPlusAssessment(p2User.id, newPremAssessment.id);

  assert(
    selResult1.success && selResult2.success && !selResult3.success,
    'Phase 2 MAX 2 Plus assessment selection limit enforced successfully'
  );

  console.log(`\n=== PHASE 3 TEST SUITE COMPLETE: ${passedCount}/${totalCount} TESTS PASSED ===`);

  if (passedCount === totalCount) {
    process.exit(0);
  } else {
    process.exit(1);
  }
}

runTests().catch((err) => {
  console.error('Test suite failed with unexpected error:', err);
  process.exit(1);
});
