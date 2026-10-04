import { db } from '../server/db';

console.log('=== PHASE 20: PURGING MOCK/SEED PAYMENT DATA ===\n');

// 1. Identify mock/seed payment orders
const mockOrders = db.sqliteDb.prepare(`
  SELECT * FROM payment_orders
  WHERE razorpayPaymentId LIKE 'pay_mock_%'
     OR razorpayPaymentId LIKE 'pay_p19_%'
     OR id LIKE 'ord_test_%'
     OR id LIKE 'ord_p19_%'
     OR is_test = 1
`).all();

console.log(`Found ${mockOrders.length} confirmed mock/test payment order(s) to remove:`);
mockOrders.forEach((o: any) => {
  console.log(`  - ID: ${o.id} | User: ${o.userId} | PayID: ${o.razorpayPaymentId} | Reason: Synthetic test runner record`);
});

if (mockOrders.length > 0) {
  const ids = mockOrders.map((o: any) => o.id);
  const placeholders = ids.map(() => '?').join(',');

  // Delete matching test ledger entries
  const delLedger = db.sqliteDb.prepare(`
    DELETE FROM deep_ai_credit_ledger
    WHERE description LIKE '%ord_p19_%'
       OR description LIKE '%ord_test_%'
       OR is_test = 1
  `).run();
  console.log(`Deleted ${delLedger.changes} synthetic credit ledger records.`);

  // Delete mock payment orders
  const delOrders = db.sqliteDb.prepare(`
    DELETE FROM payment_orders WHERE id IN (${placeholders})
  `).run(...ids);
  console.log(`Deleted ${delOrders.changes} mock payment orders.`);
} else {
  console.log('No mock payment orders found in DB.');
}

console.log('\n--- REMAINING LEGITIMATE PAYMENT ORDERS IN DB ---');
const remaining = db.sqliteDb.prepare("SELECT id, userId, productType, productId, amount, status, razorpayPaymentId FROM payment_orders").all();
console.table(remaining);
