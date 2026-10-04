const { Database } = require('./server/db');

const instance = Database.getInstance();
console.log('Running cleanupProductionDatabase()...');
instance.cleanupProductionDatabase();

const users = instance.getAllUsers(false);
console.log(`Production users remaining: ${users.length}`);
console.table(users.map(u => ({ id: u.id, email: u.email, name: u.name, role: u.role, is_test: u.is_test })));
