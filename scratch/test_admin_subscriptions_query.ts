import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
dotenv.config();
import { db } from '../server/db.ts';

function getAuthoritativeSubscriptions(limit = 100, includeTest = false) {
  const query = includeTest
    ? `
      SELECT s.*, u.email as userEmail, u.name as userName, u.plan as userPlan, u.subscriptionStatus as userSubStatus,
             u.currentPeriodStart as userPeriodStart, u.currentPeriodEnd as userPeriodEnd
      FROM premium_subscriptions s
      LEFT JOIN users u ON s.userId = u.id
      ORDER BY s.createdAt DESC
    `
    : `
      SELECT s.*, u.email as userEmail, u.name as userName, u.plan as userPlan, u.subscriptionStatus as userSubStatus,
             u.currentPeriodStart as userPeriodStart, u.currentPeriodEnd as userPeriodEnd
      FROM premium_subscriptions s
      LEFT JOIN users u ON s.userId = u.id
      WHERE (s.is_test = 0 OR s.is_test IS NULL)
      ORDER BY s.createdAt DESC
    `;

  const rows = db.sqliteDb.prepare(query).all() as any[];

  // Group by userId to select authoritative current subscription record per user
  const userMap = new Map<string, any[]>();
  for (const r of rows) {
    if (!userMap.has(r.userId)) {
      userMap.set(r.userId, []);
    }
    userMap.get(r.userId)!.push(r);
  }

  const result: any[] = [];

  for (const [userId, userRows] of userMap.entries()) {
    // Sort rows for this user:
    userRows.sort((a, b) => {
      const aPlan = (a.plan || a.userPlan || '').toUpperCase();
      const bPlan = (b.plan || b.userPlan || '').toUpperCase();
      const aStatus = (a.status || a.userSubStatus || '').toUpperCase();
      const bStatus = (b.status || b.userSubStatus || '').toUpperCase();

      const aIsPaid = aPlan === 'PLUS' || aPlan === 'PRO' || aPlan === 'PREMIUM';
      const bIsPaid = bPlan === 'PLUS' || bPlan === 'PRO' || bPlan === 'PREMIUM';

      const aIsActive = aStatus === 'ACTIVE';
      const bIsActive = bStatus === 'ACTIVE';

      // 1. Prefer Active Paid Subscriptions
      if ((aIsActive && aIsPaid) && !(bIsActive && bIsPaid)) return -1;
      if (!(aIsActive && aIsPaid) && (bIsActive && bIsPaid)) return 1;

      // 2. Prefer Active Status
      if (aIsActive && !bIsActive) return -1;
      if (!aIsActive && bIsActive) return 1;

      // 3. Prefer valid period dates
      const aHasPeriod = Boolean(a.currentPeriodEnd || a.userPeriodEnd);
      const bHasPeriod = Boolean(b.currentPeriodEnd || b.userPeriodEnd);
      if (aHasPeriod && !bHasPeriod) return -1;
      if (!aHasPeriod && bHasPeriod) return 1;

      // 4. Latest created/updated
      return new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime();
    });

    const bestRow = userRows[0];

    // Look up associated subscription payment order if present
    const subOrder = db.sqliteDb.prepare(`
      SELECT * FROM payment_orders
      WHERE userId = ? AND productType = 'SUBSCRIPTION'
      ORDER BY createdAt DESC LIMIT 1
    `).get(userId) as any;

    const plan = (bestRow.plan && bestRow.plan !== 'FREE' ? bestRow.plan : bestRow.userPlan) || 'FREE';
    const status = (bestRow.status && bestRow.status.toUpperCase() !== 'INACTIVE' ? bestRow.status : bestRow.userSubStatus) || 'inactive';
    const currentPeriodStart = bestRow.currentPeriodStart || bestRow.userPeriodStart || null;
    const currentPeriodEnd = bestRow.currentPeriodEnd || bestRow.userPeriodEnd || null;
    const razorpaySubscriptionId = bestRow.razorpaySubscriptionId || (subOrder ? subOrder.razorpayOrderId : null);
    const razorpayPaymentId = subOrder ? subOrder.razorpayPaymentId : null;

    result.push({
      id: bestRow.id,
      userId: bestRow.userId,
      provider: bestRow.provider || 'RAZORPAY',
      plan,
      status: status.toUpperCase(),
      currentPeriodStart,
      currentPeriodEnd,
      cancelledAt: bestRow.cancelledAt || null,
      endedAt: bestRow.endedAt || null,
      createdAt: bestRow.createdAt,
      updatedAt: bestRow.updatedAt,
      is_test: bestRow.is_test || 0,
      userEmail: bestRow.userEmail,
      userName: bestRow.userName,
      razorpaySubscriptionId,
      razorpayPlanId: bestRow.razorpayPlanId || (plan === 'PRO' ? 'plan_pro' : plan === 'PLUS' ? 'plan_plus' : null),
      razorpayOrderId: subOrder ? subOrder.razorpayOrderId : null,
      razorpayPaymentId,
    });
  }

  return result.slice(0, limit);
}

async function main() {
  const subs = getAuthoritativeSubscriptions(100, true);
  console.log('--- DEDUPLICATED AUTHORITATIVE SUBSCRIPTIONS ---');
  console.log(JSON.stringify(subs, null, 2));
}

main().catch(console.error);
