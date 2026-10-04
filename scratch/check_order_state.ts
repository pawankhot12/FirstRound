import { db } from '../server/db.ts';
import { hasPremiumAccess } from '../server/entitlements.ts';

async function main() {
  const order = db.getPaymentOrderById('ord_sub_1790286864391_58njb');
  console.log('ORDER:', JSON.stringify(order, null, 2));

  if (order) {
    const user = db.getUserById(order.userId);
    console.log('USER:', JSON.stringify(user ? { id: user.id, email: user.email, plan: user.plan } : null, null, 2));

    const sub = db.getUserSubscription(order.userId);
    console.log('SUB:', JSON.stringify(sub, null, 2));

    const entitlement = hasPremiumAccess(user);
    console.log('HAS_PREMIUM_ACCESS:', entitlement);

    const balance = db.getDeepAICreditBalance(order.userId);
    console.log('BALANCE:', JSON.stringify(balance, null, 2));
  }
}

main().catch(console.error);
