import { db } from '../server/db';

console.log('=== INSPECTING PAYMENT ORDERS FOR PHASE 20 ===\n');

const orders = db.sqliteDb.prepare("SELECT * FROM payment_orders").all();
console.log('--- PAYMENT ORDERS ---');
orders.forEach((o: any) => {
  console.log(o);
});
