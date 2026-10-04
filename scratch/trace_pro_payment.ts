import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
dotenv.config();
import { db } from '../server/db.ts';

async function main() {
  const orders = db.sqliteDb.prepare("SELECT * FROM payment_orders ORDER BY createdAt DESC").all();
  console.log('ALL PAYMENT ORDERS IN DB:');
  console.log(JSON.stringify(orders, null, 2));

  const subs = db.sqliteDb.prepare("SELECT * FROM premium_subscriptions ORDER BY createdAt DESC").all();
  console.log('ALL SUBSCRIPTIONS IN DB:');
  console.log(JSON.stringify(subs, null, 2));

  const users = db.sqliteDb.prepare("SELECT id, name, email, plan, subscriptionStatus FROM users").all();
  console.log('ALL USERS IN DB:');
  console.log(JSON.stringify(users, null, 2));
}

main().catch(console.error);
