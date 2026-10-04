const Database = require('better-sqlite3');
const db = new Database('./firstround.db');

const users = db.prepare('SELECT id, email, name, role, is_test, createdAt FROM users').all();
console.log(`Total users in DB: ${users.length}`);
console.table(users);
