import crypto from 'crypto';
import dotenv from 'dotenv';
dotenv.config();
dotenv.config({ path: '.env.local' });

import { getRazorpayCredentials } from '../server/paymentConfig';
import { db } from '../server/db';

async function recoverCapturedPayments() {
  const { keySecret } = getRazorpayCredentials();
  const userId = 'user_superadmin_pawankhot';

  const paymentsToVerify = [
    {
      orderId: 'ord_1790284902024_unuc8',
      razorpayOrderId: 'order_Tg1Kt6IB6RrPga',
      razorpayPaymentId: 'pay_Tg1S2emJaIjuO0',
    },
    {
      orderId: 'ord_1790286286068_7sxzf',
      razorpayOrderId: 'order_Tg1jFnJ6W6RKMu',
      razorpayPaymentId: 'pay_Tg1jion9z4AOvU',
    },
  ];

  console.log('=== SAFELY VERIFYING EXISTING CAPTURED PAYMENTS THROUGH CANONICAL API ===\n');

  for (const item of paymentsToVerify) {
    const signature = crypto
      .createHmac('sha256', keySecret)
      .update(`${item.razorpayOrderId}|${item.razorpayPaymentId}`)
      .digest('hex');

    console.log(`Verifying Order: ${item.orderId} (Razorpay Order: ${item.razorpayOrderId}, Payment: ${item.razorpayPaymentId})...`);

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
    console.log(`Result for ${item.orderId}:`, data);
  }

  const finalBal = db.getDeepAICreditBalance(userId);
  console.log('\nFinal Wallet Balance for User:', finalBal);

  const ledger = (db as any).sqliteDb.prepare(
    "SELECT * FROM deep_ai_credit_ledger WHERE userId = ? AND source = 'PURCHASED'"
  ).all(userId);
  console.log('\nPURCHASED Credit Ledger Entries:', ledger);
}

recoverCapturedPayments().catch((err) => {
  console.error('Error recovering captured payments:', err);
});
