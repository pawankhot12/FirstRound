import dotenv from 'dotenv';
dotenv.config();
dotenv.config({ path: '.env.local' });

import { getRazorpayCredentials } from '../server/paymentConfig';

async function inspectRazorpayOrder() {
  const { keyId, keySecret } = getRazorpayCredentials();
  const razorpayOrderId = 'order_Tg1Kt6IB6RrPga';

  console.log(`=== CHECKING RAZORPAY API FOR ORDER: ${razorpayOrderId} ===\n`);

  const authHeader = 'Basic ' + Buffer.from(`${keyId}:${keySecret}`).toString('base64');
  
  try {
    // 1. Fetch Order Details from Razorpay
    const orderRes = await fetch(`https://api.razorpay.com/v1/orders/${razorpayOrderId}`, {
      headers: { Authorization: authHeader },
    });
    const orderData = await orderRes.json();
    console.log('Razorpay Order API Response:', JSON.stringify(orderData, null, 2));

    // 2. Fetch Payments for Order from Razorpay
    const paymentsRes = await fetch(`https://api.razorpay.com/v1/orders/${razorpayOrderId}/payments`, {
      headers: { Authorization: authHeader },
    });
    const paymentsData = await paymentsRes.json();
    console.log('\nRazorpay Payments API Response:', JSON.stringify(paymentsData, null, 2));

  } catch (err) {
    console.error('API request error:', err);
  }
}

inspectRazorpayOrder();
