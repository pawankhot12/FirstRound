import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
dotenv.config();
import { db } from '../server/db.ts';

async function main() {
  console.log('--- PAYMENT ORDERS ---');
  console.log(db.sqliteDb.prepare('SELECT * FROM payment_orders').all());

  console.log('--- PREMIUM SUBSCRIPTIONS ---');
  console.log(db.sqliteDb.prepare('SELECT * FROM premium_subscriptions').all());

  console.log('--- USERS ---');
  console.log(db.sqliteDb.prepare('SELECT id, name, email, plan, subscriptionStatus FROM users').all());
}

main().catch(console.error);
