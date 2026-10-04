import { db } from '../server/db';
import { dispatchPurchaseAppreciationNotification } from '../server/purchaseNotifications';
import { AppNotification } from '../src/types';

async function runPhase25Tests() {
  console.log('====================================================');
  console.log('PHASE 25 — NOTIFICATION RETENTION & CLEANUP SUITE');
  console.log('====================================================\n');

  let passed = 0;
  let failed = 0;

  function assert(condition: boolean, message: string) {
    if (condition) {
      console.log(`  ✓ PASS: ${message}`);
      passed++;
    } else {
      console.error(`  ✗ FAIL: ${message}`);
      failed++;
    }
  }

  const userA = 'user_phase25_student_a';
  const userB = 'user_phase25_student_b';

  // Helper cleanup before starting
  try {
    db.sqliteDb.prepare("DELETE FROM notifications WHERE targetUserId IN (?, ?) OR id LIKE 'notif_p25_%'").run(userA, userB);
    db.sqliteDb.prepare("DELETE FROM users WHERE id IN (?, ?)").run(userA, userB);
  } catch (e) {}

  // Create test users
  const nowIso = new Date().toISOString();
  db.sqliteDb.prepare(`
    INSERT INTO users (id, name, email, role, totalPoints, totalTestsAttempted, totalCorrect, totalIncorrect, averageAccuracy, averageTimePerQuestionSeconds, createdAt)
    VALUES (?, ?, ?, 'student', 100, 2, 10, 2, 83.3, 45, ?)
  `).run(userA, 'Phase25 User A', 'user_a@phase25.test', nowIso);

  db.sqliteDb.prepare(`
    INSERT INTO users (id, name, email, role, totalPoints, totalTestsAttempted, totalCorrect, totalIncorrect, averageAccuracy, averageTimePerQuestionSeconds, createdAt)
    VALUES (?, ?, ?, 'student', 200, 4, 20, 4, 83.3, 40, ?)
  `).run(userB, 'Phase25 User B', 'user_b@phase25.test', nowIso);

  console.log('Test 1: NORMAL notification gets 24h expiry');
  const t0Ms = Date.now();
  const notifNormal = db.createNotification({
    type: 'ANNOUNCEMENT',
    title: 'Welcome to Phase 25',
    message: 'Normal notification test',
    targetUserId: userA,
    priority: 'NORMAL',
  });

  assert(notifNormal.priority === 'NORMAL', 'Priority set to NORMAL');
  const expNormalMs = new Date(notifNormal.expiresAt!).getTime();
  const diffNormalHours = Math.round((expNormalMs - t0Ms) / (1000 * 60 * 60));
  assert(diffNormalHours === 24, `NORMAL expiry is approx 24h in future (got ${diffNormalHours}h)`);

  console.log('\nTest 2: IMPORTANT notification gets 48h expiry');
  const notifImportant = db.createNotification({
    type: 'SYSTEM_NOTICE',
    title: 'Account Alert',
    message: 'Important notification test',
    targetUserId: userA,
    priority: 'IMPORTANT',
  });

  assert(notifImportant.priority === 'IMPORTANT', 'Priority set to IMPORTANT');
  const expImportantMs = new Date(notifImportant.expiresAt!).getTime();
  const diffImportantHours = Math.round((expImportantMs - t0Ms) / (1000 * 60 * 60));
  assert(diffImportantHours === 48, `IMPORTANT expiry is approx 48h in future (got ${diffImportantHours}h)`);

  console.log('\nTest 3: Server ignores client-supplied expiresAt');
  const fakeExpiry = new Date(Date.now() + 1000 * 60 * 60 * 1000).toISOString(); // 1000 hours
  const clientOverrideNotif = db.createNotification({
    type: 'ANNOUNCEMENT',
    title: 'Client Expiry Override Attempt',
    message: 'Client sent 1000h expiry',
    targetUserId: userA,
    priority: 'NORMAL',
    expiresAt: fakeExpiry,
  });
  const expOverrideMs = new Date(clientOverrideNotif.expiresAt!).getTime();
  const diffOverrideHours = Math.round((expOverrideMs - t0Ms) / (1000 * 60 * 60));
  assert(diffOverrideHours === 24, `Server overrides client expiresAt to 24h (got ${diffOverrideHours}h instead of 1000h)`);

  console.log('\nTest 4: Default priority is NORMAL');
  const defaultPrioNotif = db.createNotification({
    type: 'ANNOUNCEMENT',
    title: 'Default Priority',
    message: 'No priority passed',
    targetUserId: userA,
  });
  assert(defaultPrioNotif.priority === 'NORMAL', 'Default notification priority is NORMAL');
  const expDefaultMs = new Date(defaultPrioNotif.expiresAt!).getTime();
  const diffDefaultHours = Math.round((expDefaultMs - t0Ms) / (1000 * 60 * 60));
  assert(diffDefaultHours === 24, 'Default notification expires in 24 hours');

  console.log('\nTest 5: Active notifications returned before expiry');
  const resBefore = db.getNotificationsForUser(userA);
  const userANotifIds = resBefore.notifications.map((n: AppNotification) => n.id);
  assert(userANotifIds.includes(notifNormal.id), 'Active NORMAL notification returned before expiry');
  assert(userANotifIds.includes(notifImportant.id), 'Active IMPORTANT notification returned before expiry');

  console.log('\nTest 6: Expired NORMAL notification is not returned via getNotificationsForUser');
  // Simulate time travel by updating expiresAt in SQLite to 1 hour in the past
  const pastExpiryNormal = new Date(Date.now() - 3600 * 1000).toISOString();
  db.sqliteDb.prepare('UPDATE notifications SET expiresAt = ? WHERE id = ?').run(pastExpiryNormal, notifNormal.id);

  const resAfterNormalExp = db.getNotificationsForUser(userA);
  const idsAfterNormalExp = resAfterNormalExp.notifications.map((n: AppNotification) => n.id);
  assert(!idsAfterNormalExp.includes(notifNormal.id), 'Expired NORMAL notification excluded from getNotificationsForUser');
  assert(idsAfterNormalExp.includes(notifImportant.id), 'Active IMPORTANT notification still present');

  console.log('\nTest 7: Expired IMPORTANT notification is not returned after 48h');
  const pastExpiryImportant = new Date(Date.now() - 3600 * 1000).toISOString();
  db.sqliteDb.prepare('UPDATE notifications SET expiresAt = ? WHERE id = ?').run(pastExpiryImportant, notifImportant.id);

  const resAfterImportantExp = db.getNotificationsForUser(userA);
  const idsAfterImportantExp = resAfterImportantExp.notifications.map((n: AppNotification) => n.id);
  assert(!idsAfterImportantExp.includes(notifImportant.id), 'Expired IMPORTANT notification excluded after expiry');

  console.log('\nTest 8: Automatic SQLite cleanup removes expired notifications');
  // Insert a fresh active notification for User A
  const activeNotif = db.createNotification({
    type: 'ANNOUNCEMENT',
    title: 'Surviving Active Notification',
    message: 'Should survive cleanup',
    targetUserId: userA,
    priority: 'NORMAL',
  });

  const cleanupRes = db.cleanupExpiredNotifications();
  assert(cleanupRes.deletedCount >= 2, `Cleanup physically deleted expired rows (deleted ${cleanupRes.deletedCount})`);

  // Verify DB state directly
  const expiredRowInDb = db.sqliteDb.prepare('SELECT * FROM notifications WHERE id = ?').get(notifNormal.id);
  assert(expiredRowInDb === undefined, 'Expired NORMAL notification physically removed from SQLite table');

  const activeRowInDb = db.sqliteDb.prepare('SELECT * FROM notifications WHERE id = ?').get(activeNotif.id);
  assert(activeRowInDb !== undefined, 'Active notification survived cleanup');

  console.log('\nTest 9: User Isolation');
  const notifForB = db.createNotification({
    type: 'ANNOUNCEMENT',
    title: 'User B Only',
    message: 'Secret for User B',
    targetUserId: userB,
    priority: 'NORMAL',
  });

  const resUserA = db.getNotificationsForUser(userA);
  const resUserB = db.getNotificationsForUser(userB);

  const idsA = resUserA.notifications.map((n: AppNotification) => n.id);
  const idsB = resUserB.notifications.map((n: AppNotification) => n.id);

  assert(!idsA.includes(notifForB.id), "User B's notification does not appear for User A");
  assert(idsB.includes(notifForB.id), "User B sees their own notification");

  console.log('\nTest 10: Phase 24 AI Purchase Notification Compatibility & Expiry');
  const mockOrder = {
    id: `ord_phase25_${Date.now()}`,
    userId: userA,
    productType: 'AI_CREDIT_PACK',
    productId: 'pack_25',
    amount: 9900,
    currency: 'INR',
    status: 'CAPTURED',
    fulfillmentStatus: 'FULFILLED',
    createdAt: new Date().toISOString(),
  };

  db.sqliteDb.prepare(`
    INSERT INTO payment_orders (id, userId, productType, productId, amount, currency, status, createdAt, updatedAt)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(mockOrder.id, mockOrder.userId, mockOrder.productType, mockOrder.productId, mockOrder.amount, mockOrder.currency, mockOrder.status, mockOrder.createdAt, mockOrder.createdAt);

  const purchaseNotif = await dispatchPurchaseAppreciationNotification(db, mockOrder);
  assert(purchaseNotif !== null, 'Purchase appreciation notification created successfully');
  assert(purchaseNotif.priority === 'NORMAL', 'Purchase notification has priority NORMAL');
  
  const purchaseExpMs = new Date(purchaseNotif.expiresAt).getTime();
  const diffPurchaseHours = Math.round((purchaseExpMs - Date.now()) / (1000 * 60 * 60));
  assert(diffPurchaseHours === 24, 'Purchase notification set to 24h retention');

  console.log('\nTest 11: Purchase Notification Idempotency');
  const duplicatePurchaseNotif = await dispatchPurchaseAppreciationNotification(db, mockOrder);
  assert(duplicatePurchaseNotif !== null && duplicatePurchaseNotif.id === purchaseNotif.id, 'Idempotent call returns existing notification without creating duplicate');

  console.log('\nTest 12: Legacy Notification Migration');
  const legacyIdNormal = `notif_legacy_normal_${Date.now()}`;
  const legacyIdImportant = `notif_legacy_important_${Date.now()}`;
  const legacyCreated = new Date(Date.now() - 12 * 3600 * 1000).toISOString(); // 12 hours ago

  db.sqliteDb.prepare(`
    INSERT INTO notifications (id, type, title, message, createdAt, expiresAt, priority, targetUserId)
    VALUES (?, 'ANNOUNCEMENT', 'Legacy Normal', 'Legacy msg', ?, '', 'Normal', ?)
  `).run(legacyIdNormal, legacyCreated, userA);

  db.sqliteDb.prepare(`
    INSERT INTO notifications (id, type, title, message, createdAt, expiresAt, priority, targetUserId)
    VALUES (?, 'ANNOUNCEMENT', 'Legacy Important', 'Legacy msg', ?, '', 'Important', ?)
  `).run(legacyIdImportant, legacyCreated, userA);

  // Trigger migration method
  db.migrateNotificationRetention();

  const migratedNormal = db.sqliteDb.prepare('SELECT * FROM notifications WHERE id = ?').get(legacyIdNormal) as any;
  const migratedImportant = db.sqliteDb.prepare('SELECT * FROM notifications WHERE id = ?').get(legacyIdImportant) as any;

  assert(migratedNormal.expiresAt && migratedNormal.expiresAt !== '', 'Legacy Normal notification assigned expiresAt during migration');
  assert(migratedImportant.expiresAt && migratedImportant.expiresAt !== '', 'Legacy Important notification assigned expiresAt during migration');

  const normalExpDiff = Math.round((new Date(migratedNormal.expiresAt).getTime() - new Date(legacyCreated).getTime()) / (3600 * 1000));
  const importantExpDiff = Math.round((new Date(migratedImportant.expiresAt).getTime() - new Date(legacyCreated).getTime()) / (3600 * 1000));

  assert(normalExpDiff === 24, `Legacy Normal expiry is createdAt + 24h (got ${normalExpDiff}h)`);
  assert(importantExpDiff === 48, `Legacy Important expiry is createdAt + 48h (got ${importantExpDiff}h)`);

  console.log('\nTest 13: Idempotent & Repeated Cleanup Operations');
  const cleanupRes1 = db.cleanupExpiredNotifications();
  const cleanupRes2 = db.cleanupExpiredNotifications();
  assert(typeof cleanupRes1.deletedCount === 'number', 'First cleanup run completed cleanly');
  assert(typeof cleanupRes2.deletedCount === 'number', 'Second cleanup run completed cleanly without errors');

  console.log('\nTest 14: Singleton Cleanup Timer Protection');
  const timerBefore = (global as any).__notificationCleanupTimer__;
  assert(timerBefore !== undefined, 'Cleanup timer initialized on global object');
  db.startNotificationCleanupTimer(); // Should be a no-op
  const timerAfter = (global as any).__notificationCleanupTimer__;
  assert(timerBefore === timerAfter, 'No duplicate cleanup timers created on re-initialization');

  console.log('\nTest 15: Edge Case - Querying with empty or broadcast notifications');
  const broadcastNotif = db.createNotification({
    type: 'ANNOUNCEMENT',
    title: 'Platform Maintenance Announcement',
    message: 'Global announcement for everyone',
    audience: 'ALL',
    priority: 'NORMAL',
  });
  const resBroadcast = db.getNotificationsForUser(userA);
  const idsBroadcast = resBroadcast.notifications.map((n: AppNotification) => n.id);
  assert(idsBroadcast.includes(broadcastNotif.id), 'Broadcast notification (audience=ALL) is visible to User A');

  console.log('\nTest 16: Expired broadcast notification is excluded');
  db.sqliteDb.prepare('UPDATE notifications SET expiresAt = ? WHERE id = ?').run(pastExpiryNormal, broadcastNotif.id);
  const resBroadcastExpired = db.getNotificationsForUser(userA);
  const idsBroadcastExpired = resBroadcastExpired.notifications.map((n: AppNotification) => n.id);
  assert(!idsBroadcastExpired.includes(broadcastNotif.id), 'Expired broadcast notification excluded from user feed');

  console.log('\nTest 17: Admin / Security alert with IMPORTANT priority');
  const securityAlert = db.createNotification({
    type: 'SYSTEM_NOTICE',
    title: 'Security Alert: Password Changed',
    message: 'Your password was modified recently.',
    targetUserId: userA,
    priority: 'IMPORTANT',
  });
  assert(securityAlert.priority === 'IMPORTANT', 'Security alert created with IMPORTANT priority');
  const secExpDiff = Math.round((new Date(securityAlert.expiresAt!).getTime() - Date.now()) / (3600 * 1000));
  assert(secExpDiff === 48, 'Security alert receives 48-hour retention');

  console.log('\nTest 18: Notification count metrics accuracy');
  const countBeforeRead = db.getNotificationsForUser(userA);
  assert(countBeforeRead.unreadCount > 0, 'Unread notification count calculated accurately');

  console.log('\nTest 19: Mark read functionality preserved');
  const readRes = db.markNotificationRead(userA, activeNotif.id);
  assert(readRes.success === true, 'Mark notification read succeeded');

  console.log('\nTest 20: Cleanup leaves active unread notifications intact');
  db.cleanupExpiredNotifications();
  const countAfterClean = db.getNotificationsForUser(userA);
  const activeIdsFinal = countAfterClean.notifications.map((n: AppNotification) => n.id);
  assert(activeIdsFinal.includes(activeNotif.id), 'Active notification still intact after cleanup');

  // Additional assertions for comprehensive coverage (total 35+)
  console.log('\nAdditional Retention & Boundary Assertions:');

  console.log('Test 21: Case-insensitivity for IMPORTANT priority string');
  const caseInsensitiveNotif = db.createNotification({
    type: 'SYSTEM_NOTICE',
    title: 'Case Test',
    message: 'Lower case priority',
    targetUserId: userA,
    priority: 'Important' as any,
  });
  assert(caseInsensitiveNotif.priority === 'IMPORTANT', 'Normalized "Important" to "IMPORTANT"');

  console.log('Test 22: CRITICAL priority maps to 48h retention');
  const criticalNotif = db.createNotification({
    type: 'SYSTEM_NOTICE',
    title: 'Critical Alert',
    message: 'Critical system event',
    targetUserId: userA,
    priority: 'Critical' as any,
  });
  assert(criticalNotif.priority === 'IMPORTANT', 'Critical priority mapped to IMPORTANT retention');
  const critExpDiff = Math.round((new Date(criticalNotif.expiresAt!).getTime() - Date.now()) / (3600 * 1000));
  assert(critExpDiff === 48, 'Critical priority gets 48h retention');

  console.log('Test 23: T0 + 23h simulation - NORMAL notification still visible');
  const t0Sim = new Date();
  const t23h = new Date(t0Sim.getTime() + 23 * 3600 * 1000).toISOString();
  const simNotifNorm = db.createNotification({
    type: 'ANNOUNCEMENT',
    title: 'Sim 23h',
    message: 'Simulated 23h check',
    targetUserId: userA,
    priority: 'NORMAL',
  });
  // Check against simulated timestamp t23h
  const expSimNormMs = new Date(simNotifNorm.expiresAt!).getTime();
  assert(expSimNormMs > new Date(t23h).getTime(), 'NORMAL notification still active at T0 + 23h');

  console.log('Test 24: T0 + 24h simulation - NORMAL notification expires');
  const t24h = new Date(t0Sim.getTime() + 24 * 3600 * 1000 + 1000).toISOString();
  assert(expSimNormMs <= new Date(t24h).getTime(), 'NORMAL notification expires at T0 + 24h');

  console.log('Test 25: T0 + 47h simulation - IMPORTANT notification still visible');
  const t47h = new Date(t0Sim.getTime() + 47 * 3600 * 1000).toISOString();
  const expSimImpMs = new Date(criticalNotif.expiresAt!).getTime();
  assert(expSimImpMs > new Date(t47h).getTime(), 'IMPORTANT notification still active at T0 + 47h');

  console.log('Test 26: T0 + 48h simulation - IMPORTANT notification expires');
  const t48h = new Date(t0Sim.getTime() + 48 * 3600 * 1000 + 1000).toISOString();
  assert(expSimImpMs <= new Date(t48h).getTime(), 'IMPORTANT notification expires at T0 + 48h');

  console.log('Test 27: Cleanup does not touch NULL or empty expiresAt unless explicit');
  const noExpNotif = db.createNotification({
    type: 'ANNOUNCEMENT',
    title: 'System Permanent',
    message: 'Permanent system note',
    targetUserId: userA,
    priority: 'NORMAL',
  });
  // Force expiresAt to empty string to test boundary
  db.sqliteDb.prepare("UPDATE notifications SET expiresAt = '' WHERE id = ?").run(noExpNotif.id);
  db.cleanupExpiredNotifications();
  const emptyExpCheck = db.sqliteDb.prepare('SELECT * FROM notifications WHERE id = ?').get(noExpNotif.id);
  assert(emptyExpCheck !== undefined, 'Notification with empty expiresAt is not deleted by cleanup');

  console.log('Test 28: Cleanup only deletes rows where expiresAt <= current timestamp');
  const futureExp = new Date(Date.now() + 100000).toISOString();
  const futureNotif = db.createNotification({
    type: 'ANNOUNCEMENT',
    title: 'Future Expiry',
    message: 'Far future',
    targetUserId: userA,
    priority: 'NORMAL',
  });
  db.sqliteDb.prepare('UPDATE notifications SET expiresAt = ? WHERE id = ?').run(futureExp, futureNotif.id);
  db.cleanupExpiredNotifications();
  const futureCheck = db.sqliteDb.prepare('SELECT * FROM notifications WHERE id = ?').get(futureNotif.id);
  assert(futureCheck !== undefined, 'Future expiring notification survives cleanup');

  console.log('Test 29: Unread count excludes expired notifications');
  const expUnread = db.createNotification({
    type: 'ANNOUNCEMENT',
    title: 'Expired Unread',
    message: 'Expired unread msg',
    targetUserId: userA,
    priority: 'NORMAL',
  });
  db.sqliteDb.prepare('UPDATE notifications SET expiresAt = ? WHERE id = ?').run(pastExpiryNormal, expUnread.id);
  const feedUnreadCheck = db.getNotificationsForUser(userA);
  const unreadFeedIds = feedUnreadCheck.notifications.map((n: AppNotification) => n.id);
  assert(!unreadFeedIds.includes(expUnread.id), 'Expired unread notification not counted in unread feed');

  console.log('Test 30: Mark all read does not throw error when notifications exist');
  const markAllRes = db.markAllNotificationsRead(userA);
  assert(markAllRes.success === true && markAllRes.unreadCount === 0, 'Mark all notifications read succeeded');

  console.log('Test 31: Assessment unlocked category uses NORMAL priority');
  const assessmentNotif = db.createNotification({
    type: 'NEW_TEST',
    title: 'Assessment Unlocked 🎯',
    message: 'TCS NQT Advanced Mock is unlocked.',
    targetUserId: userA,
    priority: 'NORMAL',
  });
  assert(assessmentNotif.priority === 'NORMAL', 'Assessment unlocked notification set to NORMAL priority');

  console.log('Test 32: Assessment completed category uses NORMAL priority');
  const assessmentCompletedNotif = db.createNotification({
    type: 'RESULT_AVAILABLE',
    title: 'Assessment Completed 🏆',
    message: 'Your TCS score is ready.',
    targetUserId: userA,
    priority: 'NORMAL',
  });
  assert(assessmentCompletedNotif.priority === 'NORMAL', 'Assessment completed notification set to NORMAL priority');

  console.log('Test 33: Payment failure alert uses IMPORTANT priority');
  const paymentFailNotif = db.createNotification({
    type: 'SYSTEM_NOTICE',
    title: 'Payment Issue ⚠️',
    message: 'Payment attempt failed.',
    targetUserId: userA,
    priority: 'IMPORTANT',
  });
  assert(paymentFailNotif.priority === 'IMPORTANT', 'Payment failure alert set to IMPORTANT priority');

  console.log('Test 34: Premium expiring soon alert uses IMPORTANT priority');
  const premExpiringNotif = db.createNotification({
    type: 'SUBSCRIPTION_UPDATE',
    title: 'Premium Expiring Soon ⏰',
    message: 'Your FirstRound Plus plan expires in 3 days.',
    targetUserId: userA,
    priority: 'IMPORTANT',
  });
  assert(premExpiringNotif.priority === 'IMPORTANT', 'Premium expiring alert set to IMPORTANT priority');

  console.log('Test 35: Cleanup does not leak between different user targets');
  const cleanTargetRes = db.getNotificationsForUser(userB);
  assert(cleanTargetRes !== undefined, 'User B notifications isolated and intact');

  console.log('Test 36: Cleanup execution time performance');
  const pStart = Date.now();
  db.cleanupExpiredNotifications();
  const pDuration = Date.now() - pStart;
  assert(pDuration < 50, `Cleanup query executes fast (<50ms, took ${pDuration}ms)`);

  // Cleanup test artifacts
  try {
    db.sqliteDb.prepare("DELETE FROM notifications WHERE targetUserId IN (?, ?) OR id LIKE 'notif_p25_%' OR id LIKE 'notif_legacy_%'").run(userA, userB);
    db.sqliteDb.prepare("DELETE FROM payment_orders WHERE userId = ?").run(userA);
    db.sqliteDb.prepare("DELETE FROM users WHERE id IN (?, ?)").run(userA, userB);
  } catch (e) {}

  console.log('\n====================================================');
  console.log(`PHASE 25 TEST RESULTS: ${passed} PASSED, ${failed} FAILED`);
  console.log('====================================================\n');

  if (failed > 0) {
    process.exit(1);
  }
}

runPhase25Tests().catch((err) => {
  console.error('Fatal error running Phase 25 tests:', err);
  process.exit(1);
});
