import dotenv from 'dotenv';
dotenv.config();
dotenv.config({ path: '.env.local' });

import { db } from '../server/db';
import { getRazorpayCredentials } from '../server/paymentConfig';
import crypto from 'crypto';

async function testIdempotency() {
  console.log('=== STEP 15: IDEMPOTENCY RE-VERIFICATION TEST ===\n');

  const { keySecret } = getRazorpayCredentials();
  const userId = 'user_superadmin_pawankhot';

  const item = {
    orderId: 'ord_1790284902024_unuc8',
    razorpayOrderId: 'order_Tg1Kt6IB6RrPga',
    razorpayPaymentId: 'pay_Tg1S2emJaIjuO0',
  };

  const signature = crypto
    .createHmac('sha256', keySecret)
    .update(`${item.razorpayOrderId}|${item.razorpayPaymentId}`)
    .digest('hex');

  const balBefore = db.getDeepAICreditBalance(userId);

  console.log('Calling /api/payments/verify a second time for already captured order...');
  const res = await fetch('http://localhost:3000/api/payments/verify', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${userId}`,
      'x-user-id': userId,
    },
    body: JSON.stringify({
      orderId: item.orderId,
      razorpayOrderId: item.razorpayOrderId,
      razorpayPaymentId: item.razorpayPaymentId,
      razorpaySignature: signature,
    }),
  });

  const data = await res.json();
  console.log('Second verification response:', data);

  const balAfter = db.getDeepAICreditBalance(userId);
  console.log('Wallet balance after re-verification:', balAfter);

  const ledger = (db as any).sqliteDb.prepare(
    "SELECT * FROM deep_ai_credit_ledger WHERE userId = ? AND source = 'PURCHASED'"
  ).all(userId);
  console.log(`PURCHASED Credit Ledger count: ${ledger.length}`);

  if (data.alreadyFulfilled === true && balAfter.purchased === balBefore.purchased && ledger.length === 2) {
    console.log('\nIDEMPOTENCY TEST PASSED! No double credits granted. ✅');
  } else {
    console.error('\nIDEMPOTENCY TEST FAILED! ❌');
    process.exit(1);
  }
}

testIdempotency().catch(err => {
  console.error('Idempotency test error:', err);
  process.exit(1);
});
