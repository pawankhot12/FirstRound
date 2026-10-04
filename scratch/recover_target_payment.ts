import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
dotenv.config();

import { db } from '../server/db';
import { verifyAndFulfillPaymentOrder } from '../server/paymentConfig';

async function recoverTargetPayment() {
  console.log('=== RECOVERING TARGET PAYMENT ord_1790332597796_q3vbj ===');
  const result = await verifyAndFulfillPaymentOrder(db, {
    orderId: 'ord_1790332597796_q3vbj',
    razorpayOrderId: 'order_TgEsaAvyjZorvw',
    authenticatedUserId: 'user_student_pawankhot127',
  });
  console.log('Recovery Result:', JSON.stringify(result, null, 2));

  const d = (db as any).sqliteDb;
  console.log('\n--- Updated Payment Order in DB ---');
  console.log(d.prepare('SELECT id, userId, productType, productId, amount, status, razorpayOrderId, razorpayPaymentId FROM payment_orders WHERE id = ?').get('ord_1790332597796_q3vbj'));

  console.log('\n--- User Purchased Ledger Grants ---');
  console.log(d.prepare('SELECT * FROM deep_ai_credit_ledger WHERE userId = ? AND source = \'PURCHASED\'').all('user_student_pawankhot127'));

  console.log('\n--- User Total Deep AI Credit Balance ---');
  console.log(db.getDeepAICreditBalance('user_student_pawankhot127'));
}

recoverTargetPayment().then(() => process.exit(0)).catch(err => { console.error(err); process.exit(1); });
