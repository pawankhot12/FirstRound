import dotenv from 'dotenv';
dotenv.config();
dotenv.config({ path: '.env.local' });

import { db } from '../server/db';
import { getRazorpayCredentials } from '../server/paymentConfig';

async function inspectPremiumOrder() {
  console.log('=== PART 5: INSPECTING EXISTING PREMIUM PLUS ORDER (READ ONLY) ===\n');

  const orderId = 'ord_sub_1790286864391_58njb';
  const order = (db as any).sqliteDb.prepare('SELECT * FROM payment_orders WHERE id = ?').get(orderId);
  console.log(`Internal Payment Order record for ${orderId}:`, order);

  const { keyId, keySecret } = getRazorpayCredentials();
  const authHeader = 'Basic ' + Buffer.from(`${keyId}:${keySecret}`).toString('base64');

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
      console.error(`Error querying Razorpay API:`, err);
    }
  }

  // Also query user subscription state in DB
  if (order) {
    const userSub = db.getUserSubscription(order.userId);
    console.log('\nCurrent User Subscription in DB:', userSub);
    const user = db.getUserById(order.userId);
    console.log('User Record:', { id: user?.id, email: user?.email, plan: (user as any)?.plan });
    const userCredits = db.getDeepAICreditBalance(order.userId);
    console.log('User Deep AI Credit Balance:', userCredits);
  }
}

inspectPremiumOrder();
