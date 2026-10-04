import crypto from 'crypto';
import dotenv from 'dotenv';
dotenv.config();
dotenv.config({ path: '.env.local' });

import { db } from '../server/db';
import { getRazorpayCredentials } from '../server/paymentConfig';

async function testVerifyExistingOrder() {
  const { keySecret } = getRazorpayCredentials();

  const orderId = 'ord_1790284902024_unuc8';
  const razorpayOrderId = 'order_Tg1Kt6IB6RrPga';
  const razorpayPaymentId = 'pay_Tg1S2emJaIjuO0';

  console.log(`=== TESTING VERIFICATION FOR EXISTING ORDER: ${orderId} ===\n`);

  const existingOrder = db.getPaymentOrderById(orderId);
  console.log('Current order in DB:', existingOrder);

  if (!existingOrder) {
    console.error('Order not found!');
    return;
  }

  // Calculate HMAC signature as Razorpay would
  const signature = crypto
    .createHmac('sha256', keySecret)
    .update(`${razorpayOrderId}|${razorpayPaymentId}`)
    .digest('hex');

  console.log('Calculated valid signature for order + payment ID');

  // Verify signature helper
  const { verifyRazorpayPaymentSignature } = await import('../server/paymentConfig');
  const isValid = verifyRazorpayPaymentSignature(razorpayOrderId, razorpayPaymentId, signature);
  console.log('verifyRazorpayPaymentSignature result:', isValid);

  // Perform atomic fulfillment
  if (isValid) {
    const fulfillResult = db.fulfillPaymentOrderAtomic(orderId, razorpayPaymentId, signature);
    console.log('Fulfillment result:', fulfillResult);

    const updatedOrder = db.getPaymentOrderById(orderId);
    console.log('Updated order in DB:', updatedOrder);

    const userBalance = db.getDeepAICreditBalance(existingOrder.userId);
    console.log('User credit balance after fulfillment:', userBalance);
  }
}

testVerifyExistingOrder();
