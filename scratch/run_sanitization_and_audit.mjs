import { db } from '../server/db.ts';

console.log('--- Initialized DB instance ---');
const users = db.getAllUsers();
console.log('Production Users After Sanitization:');
console.table(users.map(u => ({
  id: u.id,
  email: u.email,
  name: u.name,
  role: u.role,
  totalPoints: u.totalPoints,
  currentStreakDays: u.currentStreakDays,
  targetCompany: u.targetCompany,
  targetRole: u.targetRole,
  totalTestsAttempted: u.totalTestsAttempted
})));
