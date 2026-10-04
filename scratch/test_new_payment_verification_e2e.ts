import crypto from 'crypto';
import dotenv from 'dotenv';
dotenv.config();
dotenv.config({ path: '.env.local' });

import { db } from '../server/db';
import { getRazorpayCredentials } from '../server/paymentConfig';

async function testNewPaymentVerificationE2E() {
  console.log('=== RETEST: ONE NEW ₹49 TEST MODE PAYMENT VERIFICATION ===\n');

  const { keySecret } = getRazorpayCredentials();
  const time = Date.now();
  const testUserEmail = `retest_payment_${time}@example.com`;
  const user = db.loginOrRegister(testUserEmail, 'Retest Candidate', '', '', '', 'student');

  const initialBal = db.getDeepAICreditBalance(user.id);
  console.log('Initial wallet balance:', initialBal);

  // 1. Create a NEW ₹49 order (10 AI Credits)
  const orderId = `ord_retest_${time}`;
  const rzpOrderId = `order_retest_rzp_${time}`;
  const paymentOrder = db.createPaymentOrder({
    id: orderId,
    userId: user.id,
    productType: 'AI_CREDIT_PACK',
    productId: 'pack_10',
    amount: 4900,
    currency: 'INR',
    status: 'CREATED',
    razorpayOrderId: rzpOrderId,
    metadata: { credits: 10, packId: 'pack_10' },
  });

  console.log('Created payment order:', paymentOrder);

  // 2. Simulate Razorpay Checkout success by generating valid HMAC-SHA256 signature
  const rzpPaymentId = `pay_retest_${time}`;
  const signature = crypto
    .createHmac('sha256', keySecret)
    .update(`${rzpOrderId}|${rzpPaymentId}`)
    .digest('hex');

  // 3. Perform HTTP verification request against running server
  const verifyRes = await fetch('http://localhost:3000/api/payments/verify', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${user.id}`,
      'x-user-id': user.id,
    },
    body: JSON.stringify({
      orderId,
      razorpayOrderId: rzpOrderId,
      razorpayPaymentId: rzpPaymentId,
      razorpaySignature: signature,
    }),
  });

  const verifyData = await verifyRes.json();
  console.log('\nVerification API Response:', verifyData);

  // 4. Verify Database State & Credit Ledger
  const updatedOrder = db.getPaymentOrderById(orderId);
  console.log('\nUpdated Payment Order in DB:', updatedOrder);

  const updatedBal = db.getDeepAICreditBalance(user.id);
  console.log('\nUpdated Wallet Balance:', updatedBal);

  const ledgerEntries = (db as any).sqliteDb.prepare(
    "SELECT * FROM deep_ai_credit_ledger WHERE userId = ? AND source = 'PURCHASED'"
  ).all(user.id);
  console.log('\nPURCHASED Ledger Entries:', ledgerEntries);

  // Assertions
  const orderCaptured = updatedOrder?.status === 'CAPTURED' && updatedOrder?.razorpayPaymentId === rzpPaymentId;
  const creditsAdded = updatedBal.purchased === initialBal.purchased + 10;
  const freeUnchanged = updatedBal.free === initialBal.free;
  const premiumUnchanged = updatedBal.premium === initialBal.premium;
  const ledgerCountCorrect = ledgerEntries.length === 1 && ledgerEntries[0].amount === 10;

  if (orderCaptured && creditsAdded && freeUnchanged && premiumUnchanged && ledgerCountCorrect) {
    console.log('\nNEW TEST PAYMENT VERIFICATION SUCCESSFUL! ✅');
  } else {
    console.error('\nNEW TEST PAYMENT VERIFICATION FAILED! ❌');
    process.exit(1);
  }
}

testNewPaymentVerificationE2E().catch((err) => {
  console.error('Retest error:', err);
  process.exit(1);
});
