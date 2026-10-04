import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
dotenv.config();

import { db } from '../server/db';
import { verifyAndFulfillPaymentOrder } from '../server/paymentConfig';

async function recoverTargetPayment() {
  console.log('=== RECOVERING PHASE 17 TARGET PAYMENT pay_TgFTFHsdWG3yqP (ord_sub_1790334659463_n66ar) ===');

  const result = await verifyAndFulfillPaymentOrder(db, {
    orderId: 'ord_sub_1790334659463_n66ar',
    razorpayOrderId: 'order_TgFSscWL0VZK9M',
    authenticatedUserId: 'user_superadmin_pawankhot',
  });

  console.log('Recovery Result:', JSON.stringify(result, null, 2));

  const d = (db as any).sqliteDb;
  console.log('\n--- Updated Payment Order in DB ---');
  console.log(d.prepare('SELECT id, userId, productType, productId, amount, status, razorpayOrderId, razorpayPaymentId FROM payment_orders WHERE id = ?').get('ord_sub_1790334659463_n66ar'));

  console.log('\n--- Updated User Details ---');
  console.log(db.getUserById('user_superadmin_pawankhot'));

  console.log('\n--- Premium Subscription Row in DB ---');
  console.log(d.prepare('SELECT * FROM premium_subscriptions WHERE userId = ?').all('user_superadmin_pawankhot'));

  console.log('\n--- Deep AI Credit Balance for User ---');
  console.log(db.getDeepAICreditBalance('user_superadmin_pawankhot'));
}

recoverTargetPayment().then(() => process.exit(0)).catch(err => { console.error(err); process.exit(1); });
