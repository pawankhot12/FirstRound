import { db } from '../server/db';
import { hasAssessmentAccess, hasPremiumAccess } from '../server/entitlements';
import fs from 'fs';
import path from 'path';

async function runPerformanceAudit() {
  console.log('=================================================');
  console.log('PHASE 33: GLOBAL PERFORMANCE & SYSTEM INTEGRITY TEST');
  console.log('=================================================\n');

  let passedCount = 0;
  let failedCount = 0;

  function assert(condition: boolean, description: string) {
    if (condition) {
      console.log(`✅ PASS: ${description}`);
      passedCount++;
    } else {
      console.error(`❌ FAIL: ${description}`);
      failedCount++;
    }
  }

  // 1. Build Artifact Verification
  const distDir = path.resolve(process.cwd(), 'dist');
  const distAssetsDir = path.resolve(process.cwd(), 'dist/assets');
  const indexHtmlExists = fs.existsSync(path.join(distDir, 'index.html'));
  assert(indexHtmlExists, 'Production build artifact dist/index.html exists.');

  let jsFiles: string[] = [];
  if (fs.existsSync(distAssetsDir)) {
    jsFiles = fs.readdirSync(distAssetsDir).filter((f) => f.endsWith('.js'));
  }
  assert(jsFiles.length > 3, `Code splitting active with ${jsFiles.length} JS asset chunks generated.`);

  // 2. Heavy Admin Module Isolation
  const hasAdminChunk = jsFiles.some((f) => f.toLowerCase().includes('admin'));
  assert(hasAdminChunk, 'AdminPanel is separated into its own chunk so normal users do not download it at startup.');

  // 3. Database Connection & WAL Mode Verification
  const sqliteDb = (db as any).sqliteDb;
  assert(sqliteDb !== undefined, 'SQLite Database is initialized and active.');

  const pragmaJournal = sqliteDb.pragma('journal_mode', { simple: true });
  assert(pragmaJournal.toLowerCase() === 'wal', `Database journal_mode is WAL for optimal concurrency (${pragmaJournal}).`);

  // 4. Critical Database Indexes Audit
  const indexes = sqliteDb.prepare("SELECT name FROM sqlite_master WHERE type='index'").all() as { name: string }[];
  const indexNames = new Set(indexes.map((i) => i.name));

  assert(indexNames.has('idx_users_email'), 'Index idx_users_email exists.');
  assert(indexNames.has('idx_attempts_userId'), 'Index idx_attempts_userId exists.');
  assert(indexNames.has('idx_responses_attemptId'), 'Index idx_responses_attemptId exists.');
  assert(indexNames.has('idx_assessment_entitlements_user'), 'Index idx_assessment_entitlements_user exists.');
  assert(indexNames.has('idx_payment_orders_user'), 'Index idx_payment_orders_user exists.');
  assert(indexNames.has('idx_premium_sub_user'), 'Index idx_premium_sub_user exists.');

  // 5. Entitlement System Integrity (Preserved Business Logic)
  const freeAccess = hasAssessmentAccess(undefined, 'cat_foundation_quant');
  assert(freeAccess.allowed === true, 'FREE assessment remains accessible to all users.');

  const premiumAccessUnauthenticated = hasAssessmentAccess(undefined, 'cat_company_tcs_01');
  assert(premiumAccessUnauthenticated.allowed === false, 'PREMIUM assessment blocks unauthenticated users.');

  // 6. Test Authorization & Entitlements Preservation
  const testUser = db.getUserByEmail('test_user_phase33@example.com') || db.loginOrRegister(
    'test_user_phase33@example.com',
    'Phase 33 Test User'
  );

  const pAccess = hasAssessmentAccess(testUser.id, 'cat_company_tcs_01');
  assert(pAccess.isPremium === true, 'Premium assessment correctly flagged as isPremium=true.');

  // 7. Plus Selection Rules Preservation
  db.setUserSubscriptionPlan(testUser.id, 'PLUS');
  db.setSelectedPlusAssessments(testUser.id, ['cat_company_tcs_01']);

  const plusAccessSelected = hasAssessmentAccess(testUser.id, 'cat_company_tcs_01');
  assert(plusAccessSelected.allowed === true && plusAccessSelected.unlockedVia === 'PLUS_SELECTION', 'Plus user gets access to selected assessment via PLUS_SELECTION.');

  const plusAccessUnselected = hasAssessmentAccess(testUser.id, 'cat_company_infosys_01');
  assert(plusAccessUnselected.allowed === false, 'Plus user is denied access to unselected assessment.');

  // 8. Pro Access Rules Preservation
  db.setUserSubscriptionPlan(testUser.id, 'PRO');
  const proAccess = hasAssessmentAccess(testUser.id, 'cat_company_infosys_01');
  assert(proAccess.allowed === true && proAccess.unlockedVia === 'PRO_SUBSCRIPTION', 'Pro user gets unlimited access to all premium assessments via PRO_SUBSCRIPTION.');

  // Reset user subscription to FREE
  db.setUserSubscriptionPlan(testUser.id, 'FREE');

  // 9. Individual Purchased Entitlements Preservation
  db.grantAssessmentEntitlement(testUser.id, 'cat_company_infosys_01', 'PURCHASED');
  const purchasedAccess = hasAssessmentAccess(testUser.id, 'cat_company_infosys_01');
  assert(purchasedAccess.allowed === true && purchasedAccess.unlockedVia === 'PURCHASED', 'Purchased assessment remains individually unlocked.');

  // 10. Admin Override Access Preservation
  const adminUser = db.getUserByEmail('admin_phase33@example.com') || db.loginOrRegister(
    'admin_phase33@example.com',
    'Admin Phase 33 User',
    '',
    '',
    '',
    'admin'
  );
  const adminAccess = hasAssessmentAccess(adminUser.id, 'cat_company_wipro_01');
  assert(adminAccess.allowed === true && adminAccess.unlockedVia === 'ADMIN_OVERRIDE', 'Admin user gets instant access to any assessment via ADMIN_OVERRIDE.');

  // 11. Credit Balance Integrity
  const creditBal = db.getDeepAICreditBalance(testUser.id);
  assert(typeof creditBal.totalAvailable === 'number' && creditBal.totalAvailable >= 0, 'Deep AI credit balance remains authoritative.');

  // 12. Notification Retention & Structure Audit
  const notifs = db.getNotifications(testUser.id);
  assert(Array.isArray(notifs), 'Notifications query returns array.');

  // 13. Catalogue Data Integrity
  const catalogue = db.getCatalogueTests();
  assert(catalogue.length === 15, `Catalogue returns exactly 15 blueprint tests (${catalogue.length} found).`);

  // 14. Event Listener Cleanup Audit in App source
  const appTsxContent = fs.readFileSync(path.resolve(process.cwd(), 'src/App.tsx'), 'utf-8');
  assert(appTsxContent.includes('removeEventListener'), 'App.tsx cleanly removes event listeners on unmount.');

  // 15. Single-page navigation SPA Check (no window.location.reload in tab changes)
  assert(!appTsxContent.includes('window.location.reload()'), 'App navigation is SPA-compliant without full page reloads.');

  // Cleanup test users
  try {
    sqliteDb.prepare('DELETE FROM users WHERE email IN (?, ?)').run('test_user_phase33@example.com', 'admin_phase33@example.com');
  } catch (e) {}

  console.log('\n=================================================');
  console.log(`AUDIT RESULTS: ${passedCount} PASSED, ${failedCount} FAILED`);
  console.log('=================================================');

  if (failedCount > 0) {
    process.exit(1);
  } else {
    process.exit(0);
  }
}

runPerformanceAudit().catch((err) => {
  console.error('Performance Audit Error:', err);
  process.exit(1);
});
