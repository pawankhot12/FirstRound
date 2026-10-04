import dotenv from 'dotenv';
dotenv.config();
dotenv.config({ path: '.env.local' });

import { getRazorpayCredentials } from '../server/paymentConfig';
import { db } from '../server/db';

async function inspectPayment1() {
  const { keyId, keySecret } = getRazorpayCredentials();
  const authHeader = 'Basic ' + Buffer.from(`${keyId}:${keySecret}`).toString('base64');
  const paymentId = 'pay_Tg1jion9z4AOvU';

  console.log(`=== CHECKING RAZORPAY PAYMENT ID: ${paymentId} ===\n`);

  try {
    const payRes = await fetch(`https://api.razorpay.com/v1/payments/${paymentId}`, {
      headers: { Authorization: authHeader },
    });
    const payData = await payRes.json();
    console.log('Payment API Data:', JSON.stringify(payData, null, 2));

    if (payData.order_id) {
      const rzpOrderRes = await fetch(`https://api.razorpay.com/v1/orders/${payData.order_id}`, {
        headers: { Authorization: authHeader },
      });
      const rzpOrderData = await rzpOrderRes.json();
      console.log('\nCorresponding Razorpay Order Data:', JSON.stringify(rzpOrderData, null, 2));

      if (rzpOrderData.receipt) {
        const internalOrder = (db as any).sqliteDb.prepare('SELECT * FROM payment_orders WHERE id = ?').get(rzpOrderData.receipt);
        console.log('\nInternal Payment Order in DB by receipt:', internalOrder);
      }
    }
  } catch (err) {
    console.error('Error querying payment:', err);
  }

  console.log('\n=== ALL PAYMENT ORDERS IN DB ===');
  const allOrders = (db as any).sqliteDb.prepare('SELECT * FROM payment_orders ORDER BY createdAt DESC').all();
  console.log(allOrders);
}

inspectPayment1();
