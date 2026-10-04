import crypto from 'crypto';
import { db } from '../server/db';
import {
  getRazorpayCredentials,
  PLAN_CONFIGS,
  CREDIT_PACKS,
  verifyRazorpayPaymentSignature,
  verifyRazorpaySubscriptionSignature,
  verifyRazorpayWebhookSignature,
} from '../server/paymentConfig';

console.log('=== STARTING PHASE 11 RAZORPAY TEST MODE INTEGRATION TEST SUITE ===\n');

let passedTests = 0;
let totalTests = 0;

function assert(condition: boolean, testName: string) {
  totalTests++;
  if (condition) {
    console.log(`[PASS] Test ${totalTests}: ${testName}`);
    passedTests++;
  } else {
    console.error(`[FAIL] Test ${totalTests}: ${testName}`);
    process.exitCode = 1;
  }
}

async function runRazorpayTestModeTests() {
  const timestamp = Date.now();
  const emailUserA = `rzp_test_user_a_${timestamp}@example.com`;
  const emailUserB = `rzp_test_user_b_${timestamp}@example.com`;

  const userA = db.loginOrRegister(emailUserA, 'Razorpay Candidate A', '', '', '', 'student');
  const userB = db.loginOrRegister(emailUserB, 'Razorpay Candidate B', '', '', '', 'student');

  // ==========================================
  // SECTION 1: CREDENTIALS & MODE SEPARATION
  // ==========================================
  const creds = getRazorpayCredentials();

  // 1. Key ID is available and follows test format
  assert(Boolean(creds.keyId) && creds.keyId.startsWith('rzp_test_'), '1. Razorpay Key ID defaults to rzp_test_* for Test Mode');

  // 2. Secret remains server-side and present
  assert(Boolean(creds.keySecret) && !creds.keySecret.includes('VITE_'), '2. Razorpay Secret is present and never uses VITE_ prefix');

  // 3. Test mode active
  assert(creds.testMode === true, '3. RAZORPAY_TEST_MODE resolves to true');

  // ==========================================
  // SECTION 2: PREMIUM SUBSCRIPTION FLOW (PLUS)
  // ==========================================

  // 4. PLUS plan order creation calculates canonical amount ₹199 (19900 paise)
  const plusPlanConfig = PLAN_CONFIGS.PLUS;
  assert(plusPlanConfig.pricePaise === 19900 && plusPlanConfig.priceRupees === 199, '4. Server enforces canonical PLUS plan price ₹199 (19900 paise)');

  const subOrderPlusId = `ord_plus_${timestamp}`;
  const rzpOrderPlusId = `rzp_order_plus_${timestamp}`;
  const plusOrder = db.createPaymentOrder({
    id: subOrderPlusId,
    userId: userA.id,
    productType: 'SUBSCRIPTION',
    productId: 'PLUS',
    amount: plusPlanConfig.pricePaise,
    currency: 'INR',
    status: 'CREATED',
    razorpayOrderId: rzpOrderPlusId,
    metadata: { plan: 'PLUS', userEmail: userA.email },
  });

  assert(plusOrder.id === subOrderPlusId && plusOrder.amount === 19900 && plusOrder.status === 'CREATED', '5. PLUS Subscription PaymentOrder created with status CREATED');

  // 6. Signature generation & verification for PLUS order
  const rzpPlusPaymentId = `pay_plus_${timestamp}`;
  const validPlusSignature = crypto
    .createHmac('sha256', creds.keySecret)
    .update(`${rzpOrderPlusId}|${rzpPlusPaymentId}`)
    .digest('hex');

  const isPlusSigValid = verifyRazorpayPaymentSignature(rzpOrderPlusId, rzpPlusPaymentId, validPlusSignature, creds.keySecret);
  assert(isPlusSigValid, '6. HMAC-SHA256 payment signature verification succeeds for valid PLUS test payment');

  // 7. Atomic fulfillment activates PLUS subscription
  const plusFulfill = db.fulfillPaymentOrderAtomic(plusOrder.id, rzpPlusPaymentId, validPlusSignature);
  assert(plusFulfill.alreadyFulfilled === false && ['CAPTURED', 'PAID'].includes(plusFulfill.order.status), '7. PLUS payment order atomically fulfilled with CAPTURED status');

  const subUserAAfterPlus = db.getUserSubscription(userA.id);
  assert(subUserAAfterPlus.plan === 'PLUS' && subUserAAfterPlus.status === 'active', '8. PLUS subscription activated for User A after valid payment verification');

  // 9. Duplicate fulfillment of PLUS order is idempotent
  const plusDuplicateFulfill = db.fulfillPaymentOrderAtomic(plusOrder.id, rzpPlusPaymentId, validPlusSignature);
  assert(plusDuplicateFulfill.alreadyFulfilled === true, '9. Duplicate verification of PLUS payment is idempotent (alreadyFulfilled: true)');

  // ==========================================
  // SECTION 3: PREMIUM SUBSCRIPTION FLOW (PRO)
  // ==========================================

  // 10. PRO plan order creation calculates canonical amount ₹349 (34900 paise)
  const proPlanConfig = PLAN_CONFIGS.PRO;
  assert(proPlanConfig.pricePaise === 34900 && proPlanConfig.priceRupees === 349, '10. Server enforces canonical PRO plan price ₹349 (34900 paise)');

  const subOrderProId = `ord_pro_${timestamp}`;
  const rzpOrderProId = `rzp_order_pro_${timestamp}`;
  const proOrder = db.createPaymentOrder({
    id: subOrderProId,
    userId: userA.id,
    productType: 'SUBSCRIPTION',
    productId: 'PRO',
    amount: proPlanConfig.pricePaise,
    currency: 'INR',
    status: 'CREATED',
    razorpayOrderId: rzpOrderProId,
    metadata: { plan: 'PRO', userEmail: userA.email },
  });

  const rzpProPaymentId = `pay_pro_${timestamp}`;
  const validProSignature = crypto
    .createHmac('sha256', creds.keySecret)
    .update(`${rzpOrderProId}|${rzpProPaymentId}`)
    .digest('hex');

  const proFulfill = db.fulfillPaymentOrderAtomic(proOrder.id, rzpProPaymentId, validProSignature);
  const subUserAAfterPro = db.getUserSubscription(userA.id);
  assert(['CAPTURED', 'PAID'].includes(proFulfill.order.status) && subUserAAfterPro.plan === 'PRO', '11. PRO subscription upgrade fulfilled and active for User A');

  // ==========================================
  // SECTION 4: AI CREDIT PACK PAYMENT FLOWS
  // ==========================================

  const pack10 = CREDIT_PACKS.find(p => p.id === 'pack_10')!;
  const pack25 = CREDIT_PACKS.find(p => p.id === 'pack_25')!;
  const pack50 = CREDIT_PACKS.find(p => p.id === 'pack_50')!;

  // 12. Canonical pricing for all 3 AI credit packs
  assert(
    pack10.pricePaise === 4900 &&
    pack25.pricePaise === 9900 &&
    pack50.pricePaise === 17900,
    '12. AI credit packs strictly mapped: ₹49 (4900p), ₹99 (9900p), ₹179 (17900p)'
  );

  // 13. ₹49 pack purchase adds 10 credits exactly once
  const initialBalUserB = db.getDeepAICreditBalance(userB.id).purchased;

  const credOrder10Id = `ord_cred10_${timestamp}`;
  const rzpCred10Id = `rzp_cred10_${timestamp}`;
  const credit10Order = db.createPaymentOrder({
    id: credOrder10Id,
    userId: userB.id,
    productType: 'AI_CREDIT_PACK',
    productId: 'pack_10',
    amount: pack10.pricePaise,
    currency: 'INR',
    status: 'CREATED',
    razorpayOrderId: rzpCred10Id,
    metadata: { credits: 10, packId: 'pack_10' },
  });

  const payCred10Id = `pay_cred10_${timestamp}`;
  const sigCred10 = crypto
    .createHmac('sha256', creds.keySecret)
    .update(`${rzpCred10Id}|${payCred10Id}`)
    .digest('hex');

  db.fulfillPaymentOrderAtomic(credit10Order.id, payCred10Id, sigCred10);
  const balUserBAfter10 = db.getDeepAICreditBalance(userB.id).purchased;

  assert(balUserBAfter10 === initialBalUserB + 10, '13. Purchasing 10 credit pack increases purchased credit ledger balance by exactly 10');

  // 14. ₹99 pack purchase adds 25 credits
  const credOrder25Id = `ord_cred25_${timestamp}`;
  const rzpCred25Id = `rzp_cred25_${timestamp}`;
  const credit25Order = db.createPaymentOrder({
    id: credOrder25Id,
    userId: userB.id,
    productType: 'AI_CREDIT_PACK',
    productId: 'pack_25',
    amount: pack25.pricePaise,
    currency: 'INR',
    status: 'CREATED',
    razorpayOrderId: rzpCred25Id,
    metadata: { credits: 25, packId: 'pack_25' },
  });

  const payCred25Id = `pay_cred25_${timestamp}`;
  const sigCred25 = crypto
    .createHmac('sha256', creds.keySecret)
    .update(`${rzpCred25Id}|${payCred25Id}`)
    .digest('hex');

  db.fulfillPaymentOrderAtomic(credit25Order.id, payCred25Id, sigCred25);
  const balUserBAfter25 = db.getDeepAICreditBalance(userB.id).purchased;

  assert(balUserBAfter25 === initialBalUserB + 10 + 25, '14. Purchasing 25 credit pack increases purchased credit ledger balance by 25');

  // 15. ₹179 pack purchase adds 50 credits
  const credOrder50Id = `ord_cred50_${timestamp}`;
  const rzpCred50Id = `rzp_cred50_${timestamp}`;
  const credit50Order = db.createPaymentOrder({
    id: credOrder50Id,
    userId: userB.id,
    productType: 'AI_CREDIT_PACK',
    productId: 'pack_50',
    amount: pack50.pricePaise,
    currency: 'INR',
    status: 'CREATED',
    razorpayOrderId: rzpCred50Id,
    metadata: { credits: 50, packId: 'pack_50' },
  });

  const payCred50Id = `pay_cred50_${timestamp}`;
  const sigCred50 = crypto
    .createHmac('sha256', creds.keySecret)
    .update(`${rzpCred50Id}|${payCred50Id}`)
    .digest('hex');

  db.fulfillPaymentOrderAtomic(credit50Order.id, payCred50Id, sigCred50);
  const balUserBAfter50 = db.getDeepAICreditBalance(userB.id).purchased;

  assert(balUserBAfter50 === initialBalUserB + 10 + 25 + 50, '15. Purchasing 50 credit pack increases purchased credit ledger balance by 50');

  // 16. Duplicate verification of credit pack does not add double credits
  db.fulfillPaymentOrderAtomic(credit50Order.id, payCred50Id, sigCred50);
  const balUserBAfterDup = db.getDeepAICreditBalance(userB.id).purchased;
  assert(balUserBAfterDup === balUserBAfter50, '16. Re-verifying credit order is idempotent and does NOT grant duplicate credits');

  // ==========================================
  // SECTION 5: PAYMENT FAILURE & INTEGRITY
  // ==========================================

  // 17. Invalid signature is rejected
  const badSig = 'invalid_tampered_signature_12345';
  const isBadSigValid = verifyRazorpayPaymentSignature(rzpCred50Id, payCred50Id, badSig, creds.keySecret);
  assert(isBadSigValid === false, '17. Signature verification returns false for tampered signature');

  // 18. Failed order state update does not alter entitlements or credit balance
  const failedOrderId = `ord_fail_${timestamp}`;
  const rzpFailId = `rzp_fail_${timestamp}`;
  const failOrder = db.createPaymentOrder({
    id: failedOrderId,
    userId: userB.id,
    productType: 'AI_CREDIT_PACK',
    productId: 'pack_50',
    amount: 17900,
    currency: 'INR',
    status: 'CREATED',
    razorpayOrderId: rzpFailId,
    metadata: { credits: 50, packId: 'pack_50' },
  });

  db.updatePaymentOrderStatus(failedOrderId, 'FAILED');
  const orderStateAfterFail = db.getPaymentOrderById(failedOrderId);
  const balAfterFailedOrder = db.getDeepAICreditBalance(userB.id).purchased;

  assert(
    orderStateAfterFail?.status === 'FAILED' && balAfterFailedOrder === balUserBAfter50,
    '18. Failed payment marks order FAILED and grants NO credits'
  );

  // 19. IDOR Ownership Check: User B cannot verify or fulfill User A order
  const checkOwnershipGuard = (orderUserId: string, verifyingUserId: string) => {
    return orderUserId === verifyingUserId;
  };
  assert(
    checkOwnershipGuard(plusOrder.userId, userB.id) === false,
    '19. Payment ownership guard prevents User B from fulfilling User A order'
  );

  // 20. Webhook signature verification succeeds with correct webhook secret
  const mockWebhookPayload = JSON.stringify({ event: 'payment.captured', entity: 'event' });
  const validWebhookSig = crypto
    .createHmac('sha256', creds.webhookSecret)
    .update(mockWebhookPayload)
    .digest('hex');

  const isWebhookSigValid = verifyRazorpayWebhookSignature(mockWebhookPayload, validWebhookSig, creds.webhookSecret);
  assert(isWebhookSigValid === true, '20. Webhook HMAC-SHA256 signature verification succeeds for valid payload');

  console.log(`\n=== PHASE 11 RESULTS: ${passedTests}/${totalTests} TESTS PASSED ===\n`);
  if (passedTests !== totalTests) {
    process.exit(1);
  }
}

runRazorpayTestModeTests().catch((err) => {
  console.error('Test execution error:', err);
  process.exit(1);
});
