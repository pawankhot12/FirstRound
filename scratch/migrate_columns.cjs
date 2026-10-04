const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

const dbPaths = [
  path.resolve(__dirname, '../firstround.db'),
  path.resolve(__dirname, '../server/firstround.db')
];

for (const dbPath of dbPaths) {
  if (!fs.existsSync(dbPath)) continue;
  console.log(`\nChecking DB: ${dbPath}`);
  const db = new Database(dbPath);

  const testCols = [
    { name: 'sections', type: 'TEXT' },
    { name: 'createdAt', type: 'TEXT' },
    { name: 'updatedAt', type: 'TEXT' },
    { name: 'avgAccuracy', type: 'TEXT' },
    { name: 'accessType', type: "TEXT DEFAULT 'FREE'" },
  ];
  for (const col of testCols) {
    try {
      db.exec(`ALTER TABLE tests ADD COLUMN ${col.name} ${col.type}`);
      console.log(` + Added ${col.name} to tests`);
    } catch (e) {
      // already exists
      console.log(` = ${col.name} already in tests: ${e.message}`);
    }
  }

  const userCols = [
    { name: 'plan', type: "TEXT DEFAULT 'FREE'" },
    { name: 'subscriptionStatus', type: "TEXT DEFAULT 'inactive'" },
    { name: 'subscriptionExpiresAt', type: 'TEXT' },
    { name: 'provider', type: 'TEXT' },
    { name: 'providerCustomerId', type: 'TEXT' },
    { name: 'providerSubscriptionId', type: 'TEXT' },
    { name: 'currentPeriodStart', type: 'TEXT' },
    { name: 'currentPeriodEnd', type: 'TEXT' },
  ];
  for (const col of userCols) {
    try {
      db.exec(`ALTER TABLE users ADD COLUMN ${col.name} ${col.type}`);
      console.log(` + Added ${col.name} to users`);
    } catch (e) {
      // already exists
      console.log(` = ${col.name} already in users: ${e.message}`);
    }
  }

  try {
    db.exec(`
      CREATE TABLE IF NOT EXISTS deep_ai_usage (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        userId TEXT NOT NULL,
        requestCount INTEGER DEFAULT 1,
        inputTokens INTEGER DEFAULT 0,
        outputTokens INTEGER DEFAULT 0,
        estimatedCost REAL DEFAULT 0.0,
        periodStart TEXT NOT NULL,
        periodEnd TEXT NOT NULL,
        createdAt TEXT NOT NULL,
        FOREIGN KEY (userId) REFERENCES users(id) ON DELETE CASCADE
      );
      CREATE INDEX IF NOT EXISTS idx_deep_ai_usage_userId ON deep_ai_usage(userId);
    `);
    console.log(' + Ensured deep_ai_usage table & index');
  } catch (e) {
    console.error(' - deep_ai_usage error:', e.message);
  }

  db.close();
}
