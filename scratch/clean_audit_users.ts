import { db } from '../server/db.ts';

try {
  const info = db.sqliteDb.prepare("DELETE FROM users WHERE email LIKE '%audit_student_%' OR id LIKE '%usr_audit_%'").run();
  console.log('Cleanup successful. Rows deleted:', info.changes);
} catch (e) {
  console.error('Cleanup error:', e);
}
