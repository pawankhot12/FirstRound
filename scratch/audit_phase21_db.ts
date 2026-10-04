import { db } from '../server/db';
import { getMergedAdminPayments } from '../server/razorpayLiveSync';

async function auditPhase21Db() {
  console.log('=== PHASE 21: DATABASE & FULFILLMENT AUDIT ===\n');

  // 1. Check getMergedAdminPayments response
  console.log('--- 1. MERGED ADMIN PAYMENTS RESPONSE ---');
  const adminRes = await getMergedAdminPayments(db, { includeTest: true, count: 100 });
  adminRes.payments.forEach((p) => {
    console.log({
      id: p.id,
      internalOrderId: p.internalOrderId,
      userId: p.userId,
      userEmail: p.userEmail,
      productType: p.productType,
      productId: p.productId,
      amount: p.amount,
      status: p.status,
      fulfillmentStatus: p.fulfillmentStatus,
      isUnmatched: p.isUnmatched,
    });
  });

  // 2. Full Ledger Audit for user_student_akhot5779
  const user3Id = 'user_student_akhot5779';
  console.log(`\n--- 2. ALL LEDGER ENTRIES FOR ${user3Id} ---`);
  const ledgerRows = db.sqliteDb.prepare(`
    SELECT * FROM deep_ai_credit_ledger WHERE userId = ? ORDER BY id ASC
  `).all(user3Id);

  let grantSum = 0;
  let consumeSum = 0;
  const bySource: Record<string, number> = {};

  ledgerRows.forEach((r: any) => {
    console.log(r);
    const key = `${r.source}_${r.transactionType}`;
    bySource[key] = (bySource[key] || 0) + r.amount;
    if (r.amount > 0) grantSum += r.amount;
    else consumeSum += Math.abs(r.amount);
  });

  console.log('\nLedger Breakdown by Source & TransactionType:', bySource);
  console.log(`Total Grants: ${grantSum}, Total Consumed: ${consumeSum}, Net Ledger Sum: ${grantSum - consumeSum}`);

  // 3. Check getDeepAICreditBalance for user_student_akhot5779
  console.log('\n--- 3. getDeepAICreditBalance FOR USER 3 ---');
  const balanceUser3 = db.getDeepAICreditBalance(user3Id);
  console.log(balanceUser3);

  // 4. Check all ledger entries in DB across ALL users
  console.log('\n--- 4. SUMMARY OF ALL LEDGER ENTRIES IN DB ACROSS ALL USERS ---');
  const allLedger = db.sqliteDb.prepare(`
    SELECT userId, source, transactionType, SUM(amount) as totalAmount, COUNT(*) as rowCount
    FROM deep_ai_credit_ledger
    GROUP BY userId, source, transactionType
  `).all();
  console.table(allLedger);
}

auditPhase21Db();
