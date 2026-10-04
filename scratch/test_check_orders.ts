import dotenv from 'dotenv';
dotenv.config();
dotenv.config({ path: '.env.local' });

import { db } from '../server/db';
import { verifyRazorpayOrderWithApi, getRazorpayCredentials } from '../server/paymentConfig';

async function main() {
  const creds = getRazorpayCredentials();
  console.log('Credentials:', {
    keyId: creds.keyId ? creds.keyId.substring(0, 10) + '...' : 'NONE',
    isConfigured: creds.isConfigured
  });

  const pendingOrders = db.getPendingPaymentOrdersForUser('user_student_akhot5779');
  console.log(`Found ${pendingOrders.length} pending orders for user_student_akhot5779:`);

  for (const order of pendingOrders) {
    console.log(`\nChecking Order: ${order.id} | Product: ${order.productType} (${order.productId}) | Razorpay Order: ${order.razorpayOrderId}`);
    if (order.razorpayOrderId) {
      const res = await verifyRazorpayOrderWithApi(order.razorpayOrderId);
      console.log('verifyRazorpayOrderWithApi result:', JSON.stringify(res, null, 2));
    }
  }
}

main().catch(console.error);
