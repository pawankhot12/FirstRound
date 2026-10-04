import dotenv from 'dotenv';
dotenv.config();
dotenv.config({ path: '.env.local' });

import { db } from '../server/db';
import { reconcilePendingRazorpayOrders } from '../server/paymentConfig';
import { hasAssessmentAccess } from '../server/entitlements';

async function main() {
  const userId = 'user_student_akhot5779';
  console.log('=== BEFORE RECONCILIATION ===');
  const userBefore = db.getUserById(userId);
  const creditsBefore = db.getDeepAICreditBalance(userId);
  const entitlementsBefore = db.getUserAssessmentEntitlements(userId);
  const ordersBefore = db.getPendingPaymentOrdersForUser(userId);
  const accessBefore = hasAssessmentAccess(userBefore, 'cat_company_tcs', db);

  console.log('User:', userBefore?.name, `(${userId})`);
  console.log('Pending orders count:', ordersBefore.length);
  console.log('Credit balance:', creditsBefore);
  console.log('Assessment entitlements count:', entitlementsBefore.length);
  console.log('cat_company_tcs access allowed:', accessBefore.allowed);

  console.log('\n=== RUNNING CANONICAL RECONCILIATION ===');
  const reconResult = await reconcilePendingRazorpayOrders(db, userId);
  console.log('Reconciliation result:', reconResult);

  console.log('\n=== AFTER RECONCILIATION ===');
  const creditsAfter = db.getDeepAICreditBalance(userId);
  const entitlementsAfter = db.getUserAssessmentEntitlements(userId);
  const ordersAfter = db.getPendingPaymentOrdersForUser(userId);
  const accessAfter = hasAssessmentAccess(userBefore, 'cat_company_tcs', db);
  const ledger = db.getCreditLedger(userId);

  console.log('Pending orders count:', ordersAfter.length);
  console.log('Credit balance:', creditsAfter);
  console.log('Assessment entitlements:', entitlementsAfter);
  console.log('cat_company_tcs access allowed:', accessAfter.allowed, '| unlockedVia:', accessAfter.unlockedVia);

  const order1 = db.getPaymentOrderById('ord_1790335844671_zxk8r');
  const order2 = db.getPaymentOrderById('ord_1790335696467_dszd1');

  console.log('\n=== ORDER FINAL STATUSES ===');
  console.log('Order 1 (AI Credits):', order1?.id, '| Status:', order1?.status, '| PaymentId:', order1?.razorpayPaymentId);
  console.log('Order 2 (Assessment):', order2?.id, '| Status:', order2?.status, '| PaymentId:', order2?.razorpayPaymentId);
  console.log('Credit Ledger Grants:', ledger.filter(l => l.source === 'PURCHASED'));
}

main().catch(console.error);
