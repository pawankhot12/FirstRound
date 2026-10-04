const { db } = require('./server/db');

try {
  const user = db.loginOrRegister('debug_delete@example.com', 'Debug User');
  console.log('Created user:', user.id);

  console.log('Testing db.deleteUserAccount...');
  const res = db.deleteUserAccount(user.id);
  console.log('Delete result:', res);
} catch (e) {
  console.error('DELETE ERROR TRACEBACK:', e);
}
