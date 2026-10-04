const Database = require('better-sqlite3');
const db = new Database('./firstround.db');

const tables = ['bookmarks', 'track_items'];

tables.forEach(table => {
  try {
    const cols = db.prepare(`PRAGMA table_info(${table})`).all();
    console.log(`Table ${table}:`, cols.map(c => c.name));
  } catch (err) {
    console.log(`Table ${table} error:`, err.message);
  }
});
