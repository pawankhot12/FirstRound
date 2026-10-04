import assert from 'assert';
import Database from 'better-sqlite3';
import { db } from '../server/db';

async function runVerification() {
  console.log('=== Step 1: Trigger Database Cleanup & Verification ===');
  db.cleanupProductionDatabase();

  const sqlite = new Database('firstround.db');
  
  const users = sqlite.prepare('SELECT id, email, name, role FROM users').all() as any[];
  console.log('Current Users in Database:', users);
  
  const testUsers = users.filter((u) =>
    u.email.includes('@test.com') ||
    u.email.includes('cand1') ||
    u.email.includes('cand2') ||
    u.name.toLowerCase().includes('candidate one') ||
    u.name.toLowerCase().includes('candidate two')
  );
  assert.strictEqual(testUsers.length, 0, 'No seeded/demo users should exist in the database');

  const notifications = sqlite.prepare('SELECT id, title FROM notifications').all() as any[];
  console.log('Current Notifications in Database:', notifications);
  assert.strictEqual(notifications.length, 0, 'No seeded/demo notifications should exist in the database');

  console.log('\n=== Step 2: Test Real Candidate Registration Flow ===');
  const regEmail = `real_candidate_test_${Date.now()}@gmail.com`;
  const regName = 'Real Candidate Test';
  
  const registeredUser = db.loginOrRegister(regEmail, regName, 'Engineering College', 'TCS', 'Software Developer', 'student');
  console.log('Registered User:', registeredUser);
  assert.ok(registeredUser.id, 'Registered user should have a valid ID');

  const allUsersAfterReg = db.getAllUsers();
  const foundRegUser = allUsersAfterReg.find((u) => u.id === registeredUser.id);
  assert.ok(foundRegUser, 'Newly registered candidate must appear in Admin Users Directory');
  console.log('Verified user in Admin Directory:', foundRegUser.email);

  console.log('\n=== Step 3: Test Real Admin Announcement Dispatch ===');
  const announcement = db.createNotification({
    title: 'Welcome Real Candidates to FirstRound',
    message: 'Placement preparation portal is now live with company-specific mocks.',
    type: 'ANNOUNCEMENT',
    priority: 'Important',
    audience: 'ALL',
    senderId: 'user_superadmin_pawankhot',
  });
  console.log('Dispatched Announcement:', announcement);
  assert.ok(announcement.id, 'Announcement should be created in database');

  console.log('\n=== Step 4: Test Candidate Notification Fetch & Read State ===');
  const userNotifsData = db.getNotificationsForUser(registeredUser.id);
  console.log('User Notifications:', userNotifsData);
  assert.strictEqual(userNotifsData.notifications.length, 1, 'Candidate should receive the dispatched announcement');
  assert.strictEqual(userNotifsData.unreadCount, 1, 'Candidate unread count should be 1');

  // Mark notification as read
  const markResult = db.markNotificationRead(registeredUser.id, announcement.id);
  assert.ok(markResult.success, 'Notification should be marked read successfully');

  const userNotifsAfterRead = db.getNotificationsForUser(registeredUser.id);
  assert.strictEqual(userNotifsAfterRead.unreadCount, 0, 'Candidate unread count should be 0 after marking read');
  assert.ok(userNotifsAfterRead.readIds.includes(announcement.id), 'readIds array must contain notification ID');

  console.log('\n=== Step 5: Clean Up Verification Test Artifacts ===');
  sqlite.prepare('DELETE FROM notifications WHERE id = ?').run(announcement.id);
  sqlite.prepare('DELETE FROM users WHERE id = ?').run(registeredUser.id);

  console.log('\n✅ ALL VERIFICATION CHECKS PASSED SUCCESSFULLY!');
  sqlite.close();
}

runVerification().catch((err) => {
  console.error('❌ Verification failed:', err);
  process.exit(1);
});
