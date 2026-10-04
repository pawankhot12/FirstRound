import { db } from '../server/db';

console.log('Running cleanupProductionDatabase()...');
db.cleanupProductionDatabase();

const users = db.getAllUsers(false);
console.log(`Production users remaining: ${users.length}`);
console.table(users.map(u => ({ id: u.id, email: u.email, name: u.name, role: u.role, is_test: u.is_test })));
