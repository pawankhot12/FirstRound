import { db } from '../server/db';

console.log('=== RECENT PAYMENT ORDERS IN DATABASE ===\n');

const orders = (db as any).sqliteDb.prepare('SELECT * FROM payment_orders ORDER BY createdAt DESC LIMIT 10').all();
console.log(`Total recent orders found: ${orders.length}`);

orders.forEach((ord: any, index: number) => {
  console.log(`Order #${index + 1}:`, {
    id: ord.id,
    userId: ord.userId,
    productType: ord.productType,
    productId: ord.productId,
    amount: ord.amount,
    status: ord.status,
    razorpayOrderId: ord.razorpayOrderId,
    razorpayPaymentId: ord.razorpayPaymentId,
    createdAt: ord.createdAt,
    metadata: ord.metadata,
  });
});

console.log('\n=== RECENT DEEP AI CREDIT LEDGER ENTRIES ===\n');
const ledger = (db as any).sqliteDb.prepare('SELECT * FROM deep_ai_credit_ledger ORDER BY createdAt DESC LIMIT 10').all();
console.log(ledger);
