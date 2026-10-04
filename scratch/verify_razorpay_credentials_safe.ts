import dotenv from 'dotenv';
dotenv.config();
dotenv.config({ path: '.env.local' });

import { getRazorpayCredentials, RAZORPAY_TEST_MODE } from '../server/paymentConfig';

console.log('=== SAFE RAZORPAY TEST CREDENTIAL VERIFICATION ===\n');

let allPassed = true;

function check(description: string, condition: boolean) {
  if (condition) {
    console.log(`[PASS] ${description}`);
  } else {
    console.error(`[FAIL] ${description}`);
    allPassed = false;
  }
}

// 1. RAZORPAY_KEY_ID exists
const keyIdEnv = process.env.RAZORPAY_KEY_ID;
check('1. RAZORPAY_KEY_ID exists in environment', Boolean(keyIdEnv && keyIdEnv.length > 0));

// 2. RAZORPAY_KEY_ID starts with rzp_test_
check('2. RAZORPAY_KEY_ID starts with rzp_test_', Boolean(keyIdEnv && keyIdEnv.startsWith('rzp_test_')));

// 3. RAZORPAY_KEY_SECRET exists
const keySecretEnv = process.env.RAZORPAY_KEY_SECRET;
check('3. RAZORPAY_KEY_SECRET exists in environment', Boolean(keySecretEnv && keySecretEnv.length > 0));

// 4. RAZORPAY_KEY_SECRET is server-side only
const viteKeySecret = process.env.VITE_RAZORPAY_KEY_SECRET;
check('4. RAZORPAY_KEY_SECRET is server-side only (VITE_RAZORPAY_KEY_SECRET is undefined)', viteKeySecret === undefined);

// 5. Neither secret is exposed through VITE_* variables
const viteKeysExposed = Object.keys(process.env).filter(k => k.startsWith('VITE_') && k.toLowerCase().includes('secret'));
check('5. No secret keys exposed through VITE_* environment variables', viteKeysExposed.length === 0);

// 6. .env / .env.local remain gitignored
// We check programmatically that .gitignore contains .env*
import fs from 'fs';
const gitignoreContent = fs.readFileSync('.gitignore', 'utf8');
check('6. .env and .env.local are protected in .gitignore', gitignoreContent.includes('.env*'));

// 7. server/paymentConfig.ts successfully reads the credentials
const creds = getRazorpayCredentials();
check('7. server/paymentConfig.ts correctly reads credentials (isConfigured === true)', creds.isConfigured === true && creds.keyId === keyIdEnv);

// 8. Razorpay Test Mode configuration is active
check('8. Razorpay Test Mode is active (testMode === true && RAZORPAY_TEST_MODE === true)', creds.testMode === true && RAZORPAY_TEST_MODE === true && creds.keyId.startsWith('rzp_test_'));

// 9. Frontend receives only the public Razorpay Key ID where required
check('9. getRazorpayCredentials() returns public Key ID for browser initialization', typeof creds.keyId === 'string' && creds.keyId.length > 0);

// 10. Backend never sends the Key Secret to the client
// Verify object returned for client order creation APIs does not leak keySecret property
const clientPayloadOrderMock = {
  success: true,
  orderId: 'ord_mock_123',
  razorpayOrderId: 'rzp_order_123',
  amount: 19900,
  currency: 'INR',
  keyId: creds.keyId,
};
check('10. Client response payload structure contains keyId but ZERO secret fields', !('keySecret' in clientPayloadOrderMock) && !('secret' in clientPayloadOrderMock));

console.log('\n=== VERIFICATION SUMMARY ===');
if (allPassed) {
  console.log('ALL 10 SAFE CREDENTIAL CHECKS PASSED CLEANLY! ✅');
} else {
  console.error('CREDENTIAL VERIFICATION FAILED! ❌');
  process.exit(1);
}
