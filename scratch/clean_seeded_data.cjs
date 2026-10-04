const Database = require('better-sqlite3');
const path = require('path');

const dbPath = path.resolve(__dirname, '../firstround.db');
const db = new Database(dbPath);

console.log('=== DATABASE CONTENT AUDIT ===\n');

// 1. Audit Users
const users = db.prepare('SELECT id, email, name, role, targetCompany, createdAt FROM users').all();
console.log(`TOTAL USERS IN DB: ${users.length}`);
users.forEach(u => console.log(` - [${u.role}] ${u.id} | ${u.name} | ${u.email} | Target: ${u.targetCompany || 'None'}`));

// 2. Audit Notifications
const notifications = db.prepare('SELECT id, type, title, message, targetUserId, audience, createdAt FROM notifications').all();
console.log(`\nTOTAL NOTIFICATIONS IN DB: ${notifications.length}`);
notifications.forEach(n => console.log(` - [${n.type}] ${n.id} | Title: "${n.title}" | TargetUser: ${n.targetUserId || 'ALL'}`));

db.close();
