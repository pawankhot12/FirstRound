import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
dotenv.config();
import { db } from '../server/db.ts';

async function main() {
  const orders = db.getAllPaymentOrders(100, true);
  console.log('getAllPaymentOrders(100, true) count:', orders.length);
  console.log('getAllPaymentOrders(100, true) product types:', JSON.stringify(orders.map(o => ({ id: o.id, type: o.productType, product: o.productId })), null, 2));

  const subs = db.getAllPremiumSubscriptions(100, true);
  console.log('getAllPremiumSubscriptions(100, true) count:', subs.length);
  console.log('getAllPremiumSubscriptions(100, true):', JSON.stringify(subs, null, 2));
}

main().catch(console.error);
