const Database = require('better-sqlite3');
const path = require('path');

const dbPath = path.join(__dirname, '..', 'firstround.db');
const sqlite = new Database(dbPath);

const users = sqlite.prepare('SELECT id, name, email, role, targetCompany, targetRole FROM users').all();
console.table(users);
