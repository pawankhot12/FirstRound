const Database = require('better-sqlite3');
const db = new Database('firstround.db', { readonly: true });

// 1. List all tables
const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name").all();
console.log('=== ALL TABLES ===');
tables.forEach(t => console.log(' -', t.name));

// 2. Find the users table and dump its schema
const userTables = tables.filter(t => t.name.toLowerCase().includes('user'));
console.log('\n=== USER-RELATED TABLES ===');
userTables.forEach(t => {
  console.log('\nTable:', t.name);
  const info = db.prepare(`PRAGMA table_info("${t.name}")`).all();
  console.log('Columns:', info.map(c => `${c.name} (${c.type})`).join(', '));
  const count = db.prepare(`SELECT COUNT(*) as cnt FROM "${t.name}"`).get();
  console.log('Row count:', count.cnt);
});

// 3. Dump all users with email and role
console.log('\n=== ALL USER RECORDS ===');
userTables.forEach(t => {
  const rows = db.prepare(`SELECT * FROM "${t.name}" LIMIT 100`).all();
  rows.forEach(r => {
    console.log(JSON.stringify(r));
  });
});

// 4. Also check for any 'admins' or 'team_members' tables
const adminTables = tables.filter(t => t.name.toLowerCase().includes('admin') || t.name.toLowerCase().includes('team'));
console.log('\n=== ADMIN/TEAM TABLES ===');
adminTables.forEach(t => {
  console.log('\nTable:', t.name);
  const info = db.prepare(`PRAGMA table_info("${t.name}")`).all();
  console.log('Columns:', info.map(c => `${c.name} (${c.type})`).join(', '));
  const count = db.prepare(`SELECT COUNT(*) as cnt FROM "${t.name}"`).get();
  console.log('Row count:', count.cnt);
  if (count.cnt <= 50) {
    const rows = db.prepare(`SELECT * FROM "${t.name}"`).all();
    rows.forEach(r => console.log(JSON.stringify(r)));
  }
});

db.close();
