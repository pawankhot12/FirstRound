import { db } from '../server/db.js';

async function main() {
  const rawDb = (db as any).sqliteDb;
  console.log('--- Cleaning Synthetic Test Entries ---');

  const delLedger = rawDb.prepare("DELETE FROM deep_ai_credit_ledger WHERE description LIKE '%ord_p19_%' OR description = 'unauthorized test' OR description = 'test grant' OR amount = 100").run();
  console.log(`Deleted ${delLedger.changes} synthetic ledger rows.`);

  const user3Id = 'user_student_akhot5779';
  const balance = db.getDeepAICreditBalance(user3Id);
  console.log('USER 3 UPDATED BALANCE:', balance);
}

main().catch(console.error);
