import dotenv from 'dotenv';
dotenv.config();
dotenv.config({ path: '.env.local' });

import { db } from '../server/db';
import { getRazorpayCredentials } from '../server/paymentConfig';

async function inspectCapturedPaymentsDetail() {
  console.log('=== STEP 1 & 3: INSPECTING CAPTURED PAYMENT ORDERS (READ ONLY) ===\n');

  const orderIds = ['ord_1790286286608_7szxf', 'ord_1790284902024_unuc8'];

  for (const id of orderIds) {
    const order = (db as any).sqliteDb.prepare('SELECT * FROM payment_orders WHERE id = ?').get(id);
    console.log(`Order record for ${id}:`, order);
  }

  console.log('\n=== CHECKING RAZORPAY API FOR BOTH ORDERS ===\n');

  const { keyId, keySecret } = getRazorpayCredentials();
  const authHeader = 'Basic ' + Buffer.from(`${keyId}:${keySecret}`).toString('base64');

  for (const id of orderIds) {
    const order = (db as any).sqliteDb.prepare('SELECT * FROM payment_orders WHERE id = ?').get(id);
    if (order && order.razorpayOrderId) {
      try {
        const rzpOrderRes = await fetch(`https://api.razorpay.com/v1/orders/${order.razorpayOrderId}`, {
          headers: { Authorization: authHeader },
        });
        const rzpOrderData = await rzpOrderRes.json();
        console.log(`Razorpay Order API Response for ${order.razorpayOrderId}:`, rzpOrderData);

        const rzpPaymentsRes = await fetch(`https://api.razorpay.com/v1/orders/${order.razorpayOrderId}/payments`, {
          headers: { Authorization: authHeader },
        });
        const rzpPaymentsData = await rzpPaymentsRes.json();
        console.log(`Razorpay Payments API Response for ${order.razorpayOrderId}:`, rzpPaymentsData);
      } catch (err) {
        console.error(`Error querying Razorpay API for ${order.razorpayOrderId}:`, err);
      }
    }
  }
}

inspectCapturedPaymentsDetail();
