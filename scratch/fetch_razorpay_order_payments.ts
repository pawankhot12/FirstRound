import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
dotenv.config();

async function main() {
  const keyId = process.env.RAZORPAY_KEY_ID;
  const keySecret = process.env.RAZORPAY_KEY_SECRET;
  if (!keyId || !keySecret) {
    console.error('Missing Razorpay credentials');
    return;
  }

  const razorpayOrderId = 'order_Tg2BDqfDIz2LiW';
  const authHeader = 'Basic ' + Buffer.from(`${keyId}:${keySecret}`).toString('base64');

  const res = await fetch(`https://api.razorpay.com/v1/orders/${razorpayOrderId}/payments`, {
    headers: {
      Authorization: authHeader,
    },
  });

  const data = await res.json();
  console.log('RAZORPAY ORDER PAYMENTS DATA:');
  console.log(JSON.stringify(data, null, 2));
}

main().catch(console.error);
