import crypto from 'crypto';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
dotenv.config();
import { db } from '../server/db.ts';

async function main() {
  const orderId = 'ord_sub_1790286864391_58njb';
  const razorpayOrderId = 'order_Tg1tR3uWCGPvnV';
  const razorpayPaymentId = 'pay_Tg1tKtY6xI2SqM';

  const keySecret = process.env.RAZORPAY_KEY_SECRET;
  if (!keySecret) {
    throw new Error('RAZORPAY_KEY_SECRET not set in environment');
  }

  const razorpaySignature = crypto
    .createHmac('sha256', keySecret)
    .update(`${razorpayOrderId}|${razorpayPaymentId}`)
    .digest('hex');

  console.log('Generated Signature:', razorpaySignature);

  const order = db.getPaymentOrderById(orderId);
  if (!order) {
    throw new Error(`Order ${orderId} not found`);
  }

  const user = db.getUserById(order.userId);
  if (!user) {
    throw new Error(`User ${order.userId} not found`);
  }

  console.log('Sending verify-payment request to API...');

  const response = await fetch('http://localhost:3000/api/subscription/verify-payment', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${user.id}`,
      'x-test-user-id': user.id,
    },
    body: JSON.stringify({
      orderId,
      razorpayOrderId,
      razorpayPaymentId,
      razorpaySignature,
      userId: user.id,
    }),
  });

  const resJson = await response.json();
  console.log('API Response:', JSON.stringify(resJson, null, 2));

  // Verify post-fulfillment DB state
  const updatedOrder = db.getPaymentOrderById(orderId);
  const updatedUser = db.getUserById(user.id);
  const updatedSub = db.getUserSubscription(user.id);
  const updatedBalance = db.getDeepAICreditBalance(user.id);

  console.log('UPDATED ORDER STATUS:', updatedOrder?.status);
  console.log('UPDATED USER PLAN:', updatedUser?.plan);
  console.log('UPDATED SUBSCRIPTION STATUS:', updatedSub?.status);
  console.log('UPDATED BALANCE:', JSON.stringify(updatedBalance, null, 2));
}

main().catch(console.error);
