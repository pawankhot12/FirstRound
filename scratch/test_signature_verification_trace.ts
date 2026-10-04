import crypto from 'crypto';
import dotenv from 'dotenv';
dotenv.config();
dotenv.config({ path: '.env.local' });

import { getRazorpayCredentials, verifyRazorpayPaymentSignature } from '../server/paymentConfig';

const { keySecret } = getRazorpayCredentials();
const razorpayOrderId = 'order_Tg1Kt6IB6RrPga';
const razorpayPaymentId = 'pay_Tg1S2emJaIjuO0';

const expectedSig = crypto
  .createHmac('sha256', keySecret)
  .update(`${razorpayOrderId}|${razorpayPaymentId}`)
  .digest('hex');

console.log('Expected HMAC-SHA256 signature calculated from secret:', expectedSig);

const isValid = verifyRazorpayPaymentSignature(razorpayOrderId, razorpayPaymentId, expectedSig);
console.log('verifyRazorpayPaymentSignature result:', isValid);
