import Database from 'better-sqlite3';
import path from 'path';
import dotenv from 'dotenv';
import { dispatchPurchaseAppreciationNotification } from './purchaseNotifications';
import {
  AdminStats,
  AppNotification,
  BookmarkedItem,
  CompanyInfo,
  LeaderboardEntry,
  MegaEvent,
  Question,
  QuestionResponse,
  QuestionResponseDetail,
  TestAttempt,
  TestMode,
  TestSeries,
  User,
  WeakQuestionItem,
  CodingSubmissionRecord,
  DeepAIUsageRecord,
  CreditSource,
  CreditTransactionType,
  DeepAICreditLedgerItem,
  DeepAICreditBalance,
  AssessmentEntitlement,
  DeepAISession,
  PaymentOrder,
  PaymentProductType,
  PaymentOrderStatus,
  PremiumSubscription,
  SubscriptionStatus,
  Advertisement,
  AdvertisementEvent,
} from '../src/types';
import { hasPremiumAccess } from './entitlements';
import { PLAN_CONFIGS } from './paymentConfig';
import {
  SEED_COMPANIES,
  SEED_MEGA_EVENTS,
  SEED_QUESTIONS,
  SEED_TESTS,
  SEED_USERS,
} from './data/seedData';
import { CATALOGUE_TESTS } from './data/catalogueData';
import { quantQuestions } from '../src/data/questionBank/quant';
import { logicalQuestions } from '../src/data/questionBank/logical';
import { verbalQuestions } from '../src/data/questionBank/verbal';
import { diQuestions, diStimuli } from '../src/data/questionBank/di';
import { pseudocodeQuestions } from '../src/data/questionBank/pseudocode';
import { accentureQuestions } from '../src/data/questionBank/accenture';
import { cognizantQuestions } from '../src/data/questionBank/cognizant';
import { infosysQuestions } from '../src/data/questionBank/infosys';
import { tcsAdvancedQuestions } from '../src/data/questionBank/tcsAdvanced';
import { tcsCodingProblems } from '../src/data/questionBank/tcsCoding';
import { codingMockQuestions } from '../src/data/questionBank/codingMock';
import { dsaQuestions } from '../src/data/questionBank/dsa';
import { sqlQuestions } from '../src/data/questionBank/sql';
import { progFundamentalsQuestions } from '../src/data/questionBank/progFundamentals';
import { codingOutputQuestions } from '../src/data/questionBank/codingOutput';
import { coreCsQuestions } from '../src/data/questionBank/coreCs';
import { LANGUAGE_ADAPTERS } from '../src/services/CodeExecutionService';
import { wiproQuestions } from '../src/data/questionBank/wipro';
import { COMPANY_BLUEPRINTS } from '../src/data/blueprints/company';
import { questionSelectionEngine } from '../src/services/QuestionSelectionEngine';
import { checkDuplicateQuestion, DuplicateCheckResult } from './duplicateDetection';

dotenv.config();

export const LEAGUE_TIERS = [
  'Bronze',
  'Silver',
  'Gold',
  'Platinum',
  'Diamond',
  'Heroic',
  'Elite Heroic',
  'Master',
  'Elite Master',
] as const;

export type LeagueTier = (typeof LEAGUE_TIERS)[number];

export function getNextLeagueTier(currentLeague: string): string {
  const idx = LEAGUE_TIERS.indexOf(currentLeague as any);
  if (idx === -1 || idx >= LEAGUE_TIERS.length - 1) return currentLeague;
  return LEAGUE_TIERS[idx + 1];
}

export function getPreviousLeagueTier(currentLeague: string): string {
  const idx = LEAGUE_TIERS.indexOf(currentLeague as any);
  if (idx <= 0) return currentLeague;
  return LEAGUE_TIERS[idx - 1];
}

export function safeJsonParse<T>(input: any, fallback: T): T {
  if (input === null || input === undefined || input === '') return fallback;
  if (typeof input === 'object') return input as T;
  try {
    return JSON.parse(input) as T;
  } catch {
    return fallback;
  }
}

class MemoryDatabase {
  private sqliteDb: Database.Database;

  constructor() {
    const dbPath = process.env.SQLITE_DB_PATH || 'firstround.db';
    const resolvedPath = path.isAbsolute(dbPath) ? dbPath : path.resolve(process.cwd(), dbPath);
    this.sqliteDb = new Database(resolvedPath);
    
    // Enable WAL mode for performance and concurrent read/write transactions
    this.sqliteDb.pragma('journal_mode = WAL');
    this.sqliteDb.pragma('foreign_keys = ON');
    this.sqliteDb.pragma('busy_timeout = 5000');

    this.initSchema();
    this.ensureSchemaColumns();
    this.seed();
    this.seedAssessmentQuestions();
    this.syncTestUserHistory();
    this.ensureSuperAdmin();
    this.cleanupProductionDatabase();
    this.migrateNotificationRetention();
    this.startNotificationCleanupTimer();
  }

  private ensureSchemaColumns() {
    const testCols = [
      { name: 'sections', type: 'TEXT' },
      { name: 'createdAt', type: 'TEXT' },
      { name: 'updatedAt', type: 'TEXT' },
      { name: 'avgAccuracy', type: 'TEXT' },
      { name: 'accessType', type: "TEXT DEFAULT 'FREE'" },
      { name: 'is_test', type: 'INTEGER DEFAULT 0' },
    ];
    testCols.forEach((col) => {
      try {
        this.sqliteDb.exec(`ALTER TABLE tests ADD COLUMN ${col.name} ${col.type}`);
      } catch (e) {}
    });

    const userCols = [
      { name: 'avatar', type: 'TEXT' },
      { name: 'weeklyGoalHours', type: 'INTEGER DEFAULT 10' },
      { name: 'targetCompany', type: 'TEXT' },
      { name: 'targetRole', type: 'TEXT' },
      { name: 'targetYear', type: 'INTEGER' },
      { name: 'plan', type: "TEXT DEFAULT 'FREE'" },
      { name: 'subscriptionStatus', type: "TEXT DEFAULT 'inactive'" },
      { name: 'subscriptionExpiresAt', type: 'TEXT' },
      { name: 'provider', type: 'TEXT' },
      { name: 'providerCustomerId', type: 'TEXT' },
      { name: 'providerSubscriptionId', type: 'TEXT' },
      { name: 'currentPeriodStart', type: 'TEXT' },
      { name: 'currentPeriodEnd', type: 'TEXT' },
      { name: 'cancelAtPeriodEnd', type: 'INTEGER DEFAULT 0' },
      { name: 'pendingPlan', type: 'TEXT' },
      { name: 'is_test', type: 'INTEGER DEFAULT 0' },
      { name: 'currentStreakDays', type: 'INTEGER DEFAULT 0' },
      { name: 'totalPoints', type: 'INTEGER DEFAULT 0' },
      { name: 'totalTestsTaken', type: 'INTEGER DEFAULT 0' },
      { name: 'totalTimeSpentMinutes', type: 'INTEGER DEFAULT 0' },
      { name: 'accountStatus', type: "TEXT DEFAULT 'ACTIVE'" },
      { name: 'bannedUntil', type: 'TEXT' },
      { name: 'banReason', type: 'TEXT' },
      { name: 'bannedBy', type: 'TEXT' },
      { name: 'bannedAt', type: 'TEXT' },
      { name: 'deletedAt', type: 'TEXT' },
      { name: 'deletedBy', type: 'TEXT' },
      { name: 'phone', type: 'TEXT' },
      { name: 'avatarUrl', type: 'TEXT' },
      { name: 'linkedIn', type: 'TEXT' },
      { name: 'github', type: 'TEXT' },
      { name: 'portfolio', type: 'TEXT' },
      { name: 'createdAt', type: 'TEXT' },
      { name: 'updatedAt', type: 'TEXT' },
    ];
    userCols.forEach((col) => {
      try {
        this.sqliteDb.exec(`ALTER TABLE users ADD COLUMN ${col.name} ${col.type}`);
      } catch (e) {}
    });

    const subCols = [
      { name: 'plan', type: "TEXT DEFAULT 'FREE'" },
      { name: 'cancelAtPeriodEnd', type: 'INTEGER DEFAULT 0' },
      { name: 'pendingPlan', type: 'TEXT' },
    ];
    subCols.forEach((col) => {
      try {
        this.sqliteDb.exec(`ALTER TABLE premium_subscriptions ADD COLUMN ${col.name} ${col.type}`);
      } catch (e) {}
    });

    const questionCols = [
      { name: 'type', type: "TEXT DEFAULT 'MCQ'" },
      { name: 'coding', type: 'TEXT' },
      { name: 'source', type: "TEXT DEFAULT 'Admin'" },
      { name: 'createdAt', type: 'TEXT' },
      { name: 'updatedAt', type: 'TEXT' },
      { name: 'is_test', type: 'INTEGER DEFAULT 0' },
      { name: 'cachedAiHint', type: 'TEXT' },
    ];
    questionCols.forEach((col) => {
      try {
        this.sqliteDb.exec(`ALTER TABLE questions ADD COLUMN ${col.name} ${col.type}`);
      } catch (e) {}
    });

    const isTestTables = [
      'deep_ai_premium_periods',
      'payment_orders',
      'premium_subscriptions',
      'assessment_entitlements',
      'plus_test_selections',
      'deep_ai_credit_ledger',
      'deep_ai_sessions',
      'test_attempts',
      'attempt_responses',
      'coding_submissions',
    ];
    isTestTables.forEach((table) => {
      try {
        this.sqliteDb.exec(`ALTER TABLE ${table} ADD COLUMN is_test INTEGER DEFAULT 0`);
      } catch (e) {}
    });

    try {
      this.sqliteDb.exec(`
        CREATE TABLE IF NOT EXISTS deep_ai_premium_periods (
          id TEXT PRIMARY KEY,
          userId TEXT NOT NULL,
          periodStart TEXT NOT NULL,
          periodEnd TEXT NOT NULL,
          allocatedCredits INTEGER NOT NULL,
          usedCredits INTEGER DEFAULT 0,
          status TEXT DEFAULT 'ACTIVE',
          is_test INTEGER DEFAULT 0,
          createdAt TEXT NOT NULL,
          updatedAt TEXT NOT NULL,
          FOREIGN KEY (userId) REFERENCES users(id) ON DELETE CASCADE
        );
        CREATE INDEX IF NOT EXISTS idx_premium_periods_lookup ON deep_ai_premium_periods(userId, status, periodEnd);

        CREATE TABLE IF NOT EXISTS payment_orders (
          id TEXT PRIMARY KEY,
          userId TEXT NOT NULL,
          productType TEXT NOT NULL,
          productId TEXT NOT NULL,
          amount INTEGER NOT NULL,
          currency TEXT DEFAULT 'INR',
          status TEXT DEFAULT 'CREATED',
          razorpayOrderId TEXT,
          razorpayPaymentId TEXT,
          razorpaySignature TEXT,
          metadata TEXT,
          is_test INTEGER DEFAULT 0,
          createdAt TEXT NOT NULL,
          updatedAt TEXT NOT NULL,
          FOREIGN KEY (userId) REFERENCES users(id) ON DELETE CASCADE
        );
        CREATE INDEX IF NOT EXISTS idx_payment_orders_user ON payment_orders(userId);
        CREATE INDEX IF NOT EXISTS idx_payment_orders_rzp ON payment_orders(razorpayOrderId);
        CREATE INDEX IF NOT EXISTS idx_payment_orders_status ON payment_orders(status);
        CREATE INDEX IF NOT EXISTS idx_payment_orders_created ON payment_orders(createdAt);
        CREATE INDEX IF NOT EXISTS idx_payment_orders_test ON payment_orders(is_test);

        CREATE TABLE IF NOT EXISTS premium_subscriptions (
          id TEXT PRIMARY KEY,
          userId TEXT NOT NULL,
          provider TEXT DEFAULT 'RAZORPAY',
          razorpaySubscriptionId TEXT,
          razorpayPlanId TEXT,
          plan TEXT DEFAULT 'FREE',
          status TEXT NOT NULL,
          currentPeriodStart TEXT,
          currentPeriodEnd TEXT,
          cancelAtPeriodEnd INTEGER DEFAULT 0,
          pendingPlan TEXT,
          cancelledAt TEXT,
          endedAt TEXT,
          is_test INTEGER DEFAULT 0,
          createdAt TEXT NOT NULL,
          updatedAt TEXT NOT NULL,
          FOREIGN KEY (userId) REFERENCES users(id) ON DELETE CASCADE
        );
        CREATE INDEX IF NOT EXISTS idx_premium_sub_user ON premium_subscriptions(userId);
        CREATE INDEX IF NOT EXISTS idx_premium_sub_rzp ON premium_subscriptions(razorpaySubscriptionId);
        CREATE INDEX IF NOT EXISTS idx_premium_sub_status ON premium_subscriptions(status);
        CREATE INDEX IF NOT EXISTS idx_premium_sub_period_end ON premium_subscriptions(currentPeriodEnd);
        CREATE INDEX IF NOT EXISTS idx_premium_sub_test ON premium_subscriptions(is_test);

        CREATE TABLE IF NOT EXISTS plus_test_selections (
          id TEXT PRIMARY KEY,
          userId TEXT NOT NULL,
          assessmentId TEXT NOT NULL,
          selectedAt TEXT NOT NULL,
          is_test INTEGER DEFAULT 0,
          FOREIGN KEY (userId) REFERENCES users(id) ON DELETE CASCADE,
          UNIQUE(userId, assessmentId)
        );
        CREATE INDEX IF NOT EXISTS idx_plus_test_sel_user ON plus_test_selections(userId);

        CREATE INDEX IF NOT EXISTS idx_users_test ON users(is_test);
        CREATE INDEX IF NOT EXISTS idx_tests_test ON tests(is_test);

        CREATE TABLE IF NOT EXISTS advertisements (
          id TEXT PRIMARY KEY,
          sponsorName TEXT NOT NULL,
          title TEXT NOT NULL,
          description TEXT,
          logoUrl TEXT,
          bannerImageUrl TEXT,
          cardImageUrl TEXT,
          destinationUrl TEXT NOT NULL,
          ctaText TEXT NOT NULL DEFAULT 'Learn More',
          adType TEXT NOT NULL DEFAULT 'STRUCTURED_CARD',
          placement TEXT NOT NULL DEFAULT 'DASHBOARD_SIDEBAR',
          status TEXT NOT NULL DEFAULT 'DRAFT',
          priority INTEGER NOT NULL DEFAULT 10,
          startAt TEXT,
          endAt TEXT,
          createdBy TEXT,
          createdAt TEXT NOT NULL,
          updatedAt TEXT NOT NULL,
          is_test INTEGER DEFAULT 0
        );
        CREATE INDEX IF NOT EXISTS idx_ads_placement ON advertisements(placement);
        CREATE INDEX IF NOT EXISTS idx_ads_status ON advertisements(status);
        CREATE INDEX IF NOT EXISTS idx_ads_priority ON advertisements(priority);
        CREATE INDEX IF NOT EXISTS idx_ads_test ON advertisements(is_test);

        CREATE TABLE IF NOT EXISTS advertisement_events (
          id TEXT PRIMARY KEY,
          adId TEXT NOT NULL,
          eventType TEXT NOT NULL,
          userId TEXT,
          sessionId TEXT,
          placement TEXT,
          createdAt TEXT NOT NULL,
          is_test INTEGER DEFAULT 0,
          FOREIGN KEY (adId) REFERENCES advertisements(id) ON DELETE CASCADE
        );
        CREATE INDEX IF NOT EXISTS idx_ad_events_adId ON advertisement_events(adId);
        CREATE INDEX IF NOT EXISTS idx_ad_events_eventType ON advertisement_events(eventType);
        CREATE INDEX IF NOT EXISTS idx_ad_events_session ON advertisement_events(sessionId, adId, eventType);
        CREATE INDEX IF NOT EXISTS idx_ad_events_test ON advertisement_events(is_test);
      `);
      this.normalizeAdvertisementDates();
    } catch (e) {}
  }

  private normalizeAdvertisementDates() {
    try {
      const rows = this.sqliteDb.prepare("SELECT id, startAt, endAt, destinationUrl FROM advertisements").all() as any[];
      for (const row of rows) {
        let updated = false;
        let startAt = row.startAt;
        let endAt = row.endAt;
        let destinationUrl = row.destinationUrl;

        if (destinationUrl && destinationUrl.startsWith('https://http://')) {
          destinationUrl = destinationUrl.replace('https://http://', 'http://');
          updated = true;
        } else if (destinationUrl && destinationUrl.startsWith('https://https://')) {
          destinationUrl = destinationUrl.replace('https://https://', 'https://');
          updated = true;
        }

        if (startAt && typeof startAt === 'string' && !startAt.endsWith('Z')) {
          const parsed = new Date(startAt);
          if (!isNaN(parsed.getTime())) {
            startAt = parsed.toISOString();
            updated = true;
          }
        }
        if (endAt && typeof endAt === 'string' && !endAt.endsWith('Z')) {
          const parsed = new Date(endAt);
          if (!isNaN(parsed.getTime())) {
            endAt = parsed.toISOString();
            updated = true;
          }
        }
        if (updated) {
          this.sqliteDb.prepare("UPDATE advertisements SET startAt = ?, endAt = ?, destinationUrl = ? WHERE id = ?").run(startAt, endAt, destinationUrl, row.id);
        }
      }
    } catch (e) {
      console.error('[DB] Error normalizing advertisement dates:', e);
    }
  }

  private ensureSuperAdmin() {
    try {
      const existing = this.sqliteDb.prepare("SELECT * FROM users WHERE LOWER(email) = 'pawankhot9@gmail.com'").get() as any;
      if (!existing) {
        const id = 'user_superadmin_pawankhot';
        const now = new Date().toISOString();
        this.sqliteDb.prepare(`
          INSERT INTO users (id, name, email, role, avatar, targetCompany, weeklyGoalHours, currentStreakDays, totalPoints, totalTestsTaken, totalTimeSpentMinutes, createdAt, updatedAt)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(id, 'Pawan Khot', 'pawankhot9@gmail.com', 'super_admin', 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&q=80&w=250', '', 0, 0, 0, 0, 0, now, now);
      } else if (existing.role !== 'super_admin') {
        this.sqliteDb.prepare("UPDATE users SET role = 'super_admin' WHERE LOWER(email) = 'pawankhot9@gmail.com'").run();
      }
    } catch (e) {
      console.error('[DB] Failed to ensure super admin:', e);
    }
  }

  public cleanupProductionDatabase() {
    try {
      const approvedIds = [
        'cat_foundation_quant',
        'cat_foundation_logical',
        'cat_foundation_verbal',
        'cat_foundation_di',
        'cat_foundation_pseudocode',
        'cat_company_tcs_foundation',
        'cat_company_tcs',
        'cat_company_infosys',
        'cat_company_accenture',
        'cat_company_wipro',
        'cat_company_cognizant',
        'cat_coding_dsa',
        'cat_coding_sql',
        'cat_coding_prog_fundamentals',
        'cat_coding_output_debug',
        'cat_coding_core_cs',
        'cat_coding_mock_01',
      ];
      const testPlaceholders = approvedIds.map(() => '?').join(',');

      this.sqliteDb.exec('PRAGMA foreign_keys = OFF;');
      const runCleanup = this.sqliteDb.transaction(() => {
        // 1. Clean attempt_responses for synthetic users and legacy tests
        this.sqliteDb.prepare(`
          DELETE FROM attempt_responses WHERE attemptId IN (
            SELECT id FROM test_attempts WHERE userId IN (
              SELECT id FROM users WHERE LOWER(email) LIKE '%@example.com'
                OR LOWER(email) LIKE '%@test.com'
                OR LOWER(email) LIKE '%@auto.test'
                OR LOWER(email) LIKE 'cand%'
                OR LOWER(name) LIKE 'candidate%'
                OR LOWER(email) LIKE 'phase%'
                OR LOWER(email) LIKE 'e2e_%'
                OR LOWER(email) LIKE 'test_%'
                OR LOWER(email) LIKE 'hacker_%'
                OR LOWER(email) LIKE 'uuid_%'
                OR LOWER(email) LIKE 'dup_%'
                OR LOWER(email) LIKE 'session_%'
                OR LOWER(email) LIKE '%student_e2e%'
                OR LOWER(email) LIKE '%candidate@firstround.com%'
                OR LOWER(email) LIKE '%student_builder_check%'
                OR is_test = 1
            ) OR testSeriesId NOT IN (${testPlaceholders})
          )
        `).run(...approvedIds);

        // 2. Clean test_attempts for synthetic users and legacy tests
        this.sqliteDb.prepare(`
          DELETE FROM test_attempts WHERE userId IN (
            SELECT id FROM users WHERE LOWER(email) LIKE '%@example.com'
                OR LOWER(email) LIKE '%@test.com'
                OR LOWER(email) LIKE '%@auto.test'
                OR LOWER(email) LIKE 'cand%'
                OR LOWER(name) LIKE 'candidate%'
                OR LOWER(email) LIKE 'phase%'
                OR LOWER(email) LIKE 'e2e_%'
                OR LOWER(email) LIKE 'test_%'
                OR LOWER(email) LIKE 'hacker_%'
                OR LOWER(email) LIKE 'uuid_%'
                OR LOWER(email) LIKE 'dup_%'
                OR LOWER(email) LIKE 'session_%'
                OR LOWER(email) LIKE '%student_e2e%'
                OR LOWER(email) LIKE '%candidate@firstround.com%'
                OR LOWER(email) LIKE '%student_builder_check%'
                OR is_test = 1
          ) OR testSeriesId NOT IN (${testPlaceholders})
        `).run(...approvedIds);

        // 3. Clean user activity for synthetic users
        this.sqliteDb.prepare(`
          DELETE FROM test_user_history WHERE userId IN (
            SELECT id FROM users WHERE LOWER(email) LIKE '%@example.com'
                OR LOWER(email) LIKE '%@test.com'
                OR LOWER(email) LIKE '%@auto.test'
                OR LOWER(email) LIKE 'cand%'
                OR LOWER(name) LIKE 'candidate%'
                OR LOWER(email) LIKE 'phase%'
                OR LOWER(email) LIKE 'e2e_%'
                OR LOWER(email) LIKE 'test_%'
                OR LOWER(email) LIKE 'hacker_%'
                OR LOWER(email) LIKE 'uuid_%'
                OR LOWER(email) LIKE 'dup_%'
                OR LOWER(email) LIKE 'session_%'
                OR LOWER(email) LIKE '%student_e2e%'
                OR LOWER(email) LIKE '%candidate@firstround.com%'
                OR LOWER(email) LIKE '%student_builder_check%'
                OR is_test = 1
          ) OR testId NOT IN (${testPlaceholders})
        `).run(...approvedIds);

        this.sqliteDb.exec(`
          DELETE FROM weekly_standings WHERE userId IN (
            SELECT id FROM users WHERE LOWER(email) LIKE '%@example.com'
                OR LOWER(email) LIKE '%@test.com'
                OR LOWER(email) LIKE '%@auto.test'
                OR LOWER(email) LIKE 'cand%'
                OR LOWER(name) LIKE 'candidate%'
                OR LOWER(email) LIKE 'phase%'
                OR LOWER(email) LIKE 'e2e_%'
                OR LOWER(email) LIKE 'test_%'
                OR LOWER(email) LIKE 'hacker_%'
                OR LOWER(email) LIKE 'uuid_%'
                OR LOWER(email) LIKE 'dup_%'
                OR LOWER(email) LIKE 'session_%'
                OR LOWER(email) LIKE '%student_e2e%'
                OR LOWER(email) LIKE '%candidate@firstround.com%'
                OR LOWER(email) LIKE '%student_builder_check%'
                OR is_test = 1
          )
        `);

        this.sqliteDb.exec(`
          DELETE FROM bookmarks WHERE userId IN (
            SELECT id FROM users WHERE LOWER(email) LIKE '%@example.com'
                OR LOWER(email) LIKE '%@test.com'
                OR LOWER(email) LIKE '%@auto.test'
                OR LOWER(email) LIKE 'cand%'
                OR LOWER(name) LIKE 'candidate%'
                OR LOWER(email) LIKE 'phase%'
                OR LOWER(email) LIKE 'e2e_%'
                OR LOWER(email) LIKE 'test_%'
                OR LOWER(email) LIKE 'hacker_%'
                OR LOWER(email) LIKE 'uuid_%'
                OR LOWER(email) LIKE 'dup_%'
                OR LOWER(email) LIKE 'session_%'
                OR LOWER(email) LIKE '%student_e2e%'
                OR LOWER(email) LIKE '%candidate@firstround.com%'
                OR LOWER(email) LIKE '%student_builder_check%'
                OR is_test = 1
          )
        `);

        this.sqliteDb.exec(`
          DELETE FROM coding_submissions WHERE userId IN (
            SELECT id FROM users WHERE LOWER(email) LIKE '%@example.com'
                OR LOWER(email) LIKE '%@test.com'
                OR LOWER(email) LIKE '%@auto.test'
                OR LOWER(email) LIKE 'cand%'
                OR LOWER(name) LIKE 'candidate%'
                OR LOWER(email) LIKE 'phase%'
                OR LOWER(email) LIKE 'e2e_%'
                OR LOWER(email) LIKE 'test_%'
                OR LOWER(email) LIKE 'hacker_%'
                OR LOWER(email) LIKE 'uuid_%'
                OR LOWER(email) LIKE 'dup_%'
                OR LOWER(email) LIKE 'session_%'
                OR LOWER(email) LIKE '%student_e2e%'
                OR LOWER(email) LIKE '%candidate@firstround.com%'
                OR LOWER(email) LIKE '%student_builder_check%'
                OR is_test = 1
          )
        `);

        // 4. Purge synthetic/test payment orders
        this.sqliteDb.exec(`
          DELETE FROM payment_orders WHERE is_test = 1
            OR id LIKE 'ord_test_%'
            OR id LIKE 'ord_phase_%'
            OR userId IN (
              SELECT id FROM users WHERE LOWER(email) LIKE '%@example.com'
                OR LOWER(email) LIKE '%@test.com'
                OR LOWER(email) LIKE '%@auto.test'
                OR LOWER(email) LIKE 'cand%'
                OR LOWER(name) LIKE 'candidate%'
                OR LOWER(email) LIKE 'phase%'
                OR LOWER(email) LIKE 'e2e_%'
                OR LOWER(email) LIKE 'test_%'
                OR LOWER(email) LIKE 'sub_%'
                OR is_test = 1
            )
        `);

        // 5. Purge synthetic/test premium subscriptions
        this.sqliteDb.exec(`
          DELETE FROM premium_subscriptions WHERE is_test = 1
            OR id LIKE 'sub_test_%'
            OR id LIKE 'sub_phase_%'
            OR userId IN (
              SELECT id FROM users WHERE LOWER(email) LIKE '%@example.com'
                OR LOWER(email) LIKE '%@test.com'
                OR LOWER(email) LIKE '%@auto.test'
                OR LOWER(email) LIKE 'cand%'
                OR LOWER(name) LIKE 'candidate%'
                OR LOWER(email) LIKE 'phase%'
                OR LOWER(email) LIKE 'e2e_%'
                OR LOWER(email) LIKE 'test_%'
                OR LOWER(email) LIKE 'sub_%'
                OR is_test = 1
            )
        `);

        // 6. Purge synthetic/test periods & ledger
        this.sqliteDb.exec(`
          DELETE FROM deep_ai_premium_periods WHERE is_test = 1
            OR userId IN (
              SELECT id FROM users WHERE LOWER(email) LIKE '%@example.com'
                OR LOWER(email) LIKE '%@test.com'
                OR LOWER(email) LIKE '%@auto.test'
                OR LOWER(email) LIKE 'cand%'
                OR LOWER(name) LIKE 'candidate%'
                OR LOWER(email) LIKE 'phase%'
                OR LOWER(email) LIKE 'e2e_%'
                OR LOWER(email) LIKE 'test_%'
                OR is_test = 1
            )
        `);

        this.sqliteDb.exec(`
          DELETE FROM deep_ai_credit_ledger WHERE is_test = 1
            OR userId IN (
              SELECT id FROM users WHERE LOWER(email) LIKE '%@example.com'
                OR LOWER(email) LIKE '%@test.com'
                OR LOWER(email) LIKE '%@auto.test'
                OR LOWER(email) LIKE 'cand%'
                OR LOWER(name) LIKE 'candidate%'
                OR LOWER(email) LIKE 'phase%'
                OR LOWER(email) LIKE 'e2e_%'
                OR LOWER(email) LIKE 'test_%'
                OR is_test = 1
            )
        `);

        this.sqliteDb.prepare(`
          DELETE FROM assessment_entitlements WHERE is_test = 1
            OR userId IN (
              SELECT id FROM users WHERE LOWER(email) LIKE '%@example.com'
                OR LOWER(email) LIKE '%@test.com'
                OR LOWER(email) LIKE '%@auto.test'
                OR LOWER(email) LIKE 'cand%'
                OR LOWER(name) LIKE 'candidate%'
                OR LOWER(email) LIKE 'phase%'
                OR LOWER(email) LIKE 'e2e_%'
                OR LOWER(email) LIKE 'test_%'
                OR is_test = 1
            )
            OR assessmentId NOT IN (${testPlaceholders})
        `).run(...approvedIds);

        // 7. Purge synthetic/test users
        this.sqliteDb.exec(`
          DELETE FROM users WHERE LOWER(email) LIKE '%@example.com'
            OR LOWER(email) LIKE '%@test.com'
            OR LOWER(email) LIKE '%@auto.test'
            OR LOWER(email) LIKE 'cand%'
            OR LOWER(name) LIKE 'candidate one%'
            OR LOWER(name) LIKE 'candidate two%'
            OR LOWER(email) LIKE 'phase%'
            OR LOWER(email) LIKE 'e2e_%'
            OR LOWER(email) LIKE 'test_%'
            OR LOWER(email) LIKE 'practice_%'
            OR LOWER(email) LIKE 'wallet_%'
            OR LOWER(email) LIKE 'prem_%'
            OR LOWER(email) LIKE 'arch_%'
            OR LOWER(email) LIKE 'sub_%'
            OR LOWER(email) LIKE 'hacker_%'
            OR LOWER(email) LIKE 'uuid_%'
            OR LOWER(email) LIKE 'dup_%'
            OR LOWER(email) LIKE 'session_%'
            OR LOWER(email) LIKE '%student_e2e%'
            OR LOWER(email) LIKE '%admin_flow_test%'
            OR LOWER(email) LIKE '%candidate@firstround.com%'
            OR LOWER(email) LIKE '%student_builder_check%'
            OR LOWER(email) LIKE '%@student.firstround.test%'
            OR LOWER(email) LIKE '%@premium.firstround.test%'
            OR LOWER(email) LIKE '%@test.local%'
            OR LOWER(email) LIKE '%@test.firstround.ai%'
            OR LOWER(id) LIKE 'ux_test_%'
            OR LOWER(id) LIKE 'zero_user_%'
            OR is_test = 1
            OR (LOWER(email) NOT IN ('pawankhot9@gmail.com', 'akhot5779@gmail.com', 'pawan.khot1272004@gmail.com') AND (is_test = 1 OR id LIKE 'ux_test_%' OR id LIKE 'zero_user_%' OR id LIKE 'user_17%'))
        `);

        // 8. Purge demo / seeded / test notifications
        this.sqliteDb.exec(`
          DELETE FROM notifications WHERE id LIKE 'notif_demo_%'
            OR LOWER(title) LIKE '%tcs placement strategy%'
            OR LOWER(title) LIKE '%tcs nqt 2026 live mock%'
            OR LOWER(title) LIKE '%past maintenance notice%'
            OR LOWER(title) LIKE '%platform system health%'
            OR LOWER(title) LIKE '%tcs quantitative speed math%'
            OR LOWER(title) LIKE '%logical%reasoning%'
            OR LOWER(title) LIKE '%aws practice mock%'
            OR LOWER(title) LIKE '%live session scheduled for tcs aspirants%'
            OR (targetUserId IS NOT NULL AND targetUserId != '' AND targetUserId IN (
              SELECT id FROM users WHERE LOWER(email) LIKE '%@test.com'
                OR LOWER(email) LIKE '%@auto.test'
                OR LOWER(email) LIKE 'cand%'
                OR LOWER(name) LIKE 'candidate%'
                OR LOWER(email) LIKE '%@example.com'
                OR is_test = 1
            ))
        `);

        // 9. Purge legacy/temporary questions
        this.sqliteDb.prepare(`
          DELETE FROM questions WHERE (testSeriesId NOT IN (${testPlaceholders}) AND testSeriesId NOT LIKE 'cat_admin_%' AND id NOT LIKE 'cat_admin_%') OR id LIKE 'q_test_%' OR is_test = 1
        `).run(...approvedIds);

        // 10. Purge temporary/non-catalogue test series rows
        this.sqliteDb.prepare(`
          DELETE FROM tests WHERE (id NOT IN (${testPlaceholders}) AND id NOT LIKE 'cat_admin_%') OR is_test = 1
        `).run(...approvedIds);
      });
      runCleanup();
      this.sqliteDb.exec('PRAGMA foreign_keys = ON;');
    } catch (err) {
      console.error('[DB Cleanup Error]', err);
    }
  }

  private initSchema() {
    this.sqliteDb.exec(`
      CREATE TABLE IF NOT EXISTS users (
        id TEXT PRIMARY KEY,
        email TEXT UNIQUE,
        name TEXT,
        college TEXT,
        targetCompany TEXT,
        targetRole TEXT,
        role TEXT,
        totalPoints INTEGER,
        totalTestsAttempted INTEGER,
        totalCorrect INTEGER,
        totalIncorrect INTEGER,
        averageAccuracy REAL,
        averageTimePerQuestionSeconds INTEGER,
        readNotificationIds TEXT,
        createdAt TEXT,
        plan TEXT DEFAULT 'FREE',
        subscriptionStatus TEXT DEFAULT 'inactive',
        subscriptionExpiresAt TEXT,
        provider TEXT,
        providerCustomerId TEXT,
        providerSubscriptionId TEXT,
        currentPeriodStart TEXT,
        currentPeriodEnd TEXT
      );

      CREATE TABLE IF NOT EXISTS companies (
        id TEXT PRIMARY KEY,
        name TEXT,
        badge TEXT,
        color TEXT,
        accentBg TEXT,
        description TEXT,
        rounds TEXT,
        patternSummary TEXT,
        negativeMarking TEXT,
        typicalCutoff TEXT,
        recommendedPrepTime TEXT,
        activeTestCount INTEGER
      );

      CREATE TABLE IF NOT EXISTS tests (
        id TEXT PRIMARY KEY,
        title TEXT,
        description TEXT,
        category TEXT,
        company TEXT,
        companyId TEXT,
        companyName TEXT,
        roles TEXT,
        supportedRoles TEXT,
        skills TEXT,
        topics TEXT,
        difficulty TEXT,
        durationMinutes INTEGER,
        duration INTEGER,
        totalQuestions INTEGER,
        questionCount INTEGER,
        passingPercentage REAL,
        testType TEXT,
        mode TEXT,
        patternVersion TEXT,
        verificationStatus TEXT,
        isMegaEvent INTEGER,
        megaEventId TEXT,
        tags TEXT,
        attemptsCount INTEGER,
        avgScore REAL,
        status TEXT,
        scoringModel TEXT,
        accessType TEXT DEFAULT 'FREE'
      );

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

      CREATE TABLE IF NOT EXISTS questions (
        id TEXT PRIMARY KEY,
        testSeriesId TEXT,
        questionText TEXT,
        codeSnippet TEXT,
        options TEXT,
        correctOption TEXT,
        topic TEXT,
        subTopic TEXT,
        difficulty TEXT,
        companyTag TEXT,
        yearTag TEXT,
        explanation TEXT,
        shortcutFormula TEXT,
        stimulusId TEXT,
        stimulus TEXT
      );

      CREATE TABLE IF NOT EXISTS mega_events (
        id TEXT PRIMARY KEY,
        title TEXT,
        description TEXT,
        company TEXT,
        startTime TEXT,
        endTime TEXT,
        durationMinutes INTEGER,
        status TEXT,
        testSeriesId TEXT,
        totalParticipants INTEGER,
        prizes TEXT,
        bannerTag TEXT,
        badge TEXT
      );

      CREATE TABLE IF NOT EXISTS test_attempts (
        id TEXT PRIMARY KEY,
        userId TEXT,
        userName TEXT,
        userCollege TEXT,
        testSeriesId TEXT,
        testInstanceId TEXT,
        testTitle TEXT,
        companyName TEXT,
        mode TEXT,
        totalQuestions INTEGER,
        attemptedQuestions INTEGER,
        correctCount INTEGER,
        incorrectCount INTEGER,
        unattemptedCount INTEGER,
        scorePoints INTEGER,
        accuracyPercentage INTEGER,
        timeTakenSeconds INTEGER,
        avgTimePerQuestionSeconds INTEGER,
        submittedAt TEXT,
        topicBreakdown TEXT,
        strengths TEXT,
        weaknesses TEXT,
        recommendations TEXT,
        FOREIGN KEY (userId) REFERENCES users(id) ON DELETE CASCADE
      );

      CREATE TABLE IF NOT EXISTS attempt_responses (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        attemptId TEXT,
        questionId TEXT,
        selectedOption TEXT,
        timeSpentSeconds INTEGER,
        isCorrect INTEGER,
        correctOption TEXT,
        question TEXT,
        FOREIGN KEY (attemptId) REFERENCES test_attempts(id) ON DELETE CASCADE
      );

      CREATE TABLE IF NOT EXISTS test_user_history (
        userId TEXT,
        testId TEXT,
        status TEXT,
        firstVisitedAt TEXT,
        lastVisitedAt TEXT,
        lastAttemptAt TEXT,
        attemptCount INTEGER,
        bestScore REAL,
        lastScore REAL,
        PRIMARY KEY (userId, testId),
        FOREIGN KEY (userId) REFERENCES users(id) ON DELETE CASCADE
      );

      CREATE TABLE IF NOT EXISTS bookmarks (
        id TEXT PRIMARY KEY,
        userId TEXT,
        questionId TEXT,
        question TEXT,
        addedAt TEXT,
        FOREIGN KEY (userId) REFERENCES users(id) ON DELETE CASCADE
      );

      CREATE TABLE IF NOT EXISTS notifications (
        id TEXT PRIMARY KEY,
        type TEXT,
        title TEXT,
        message TEXT,
        createdAt TEXT,
        actionType TEXT,
        actionTargetId TEXT,
        actionTestId TEXT,
        actionTab TEXT,
        actionLabel TEXT,
        actionUrl TEXT,
        targetCompany TEXT,
        targetUserId TEXT,
        audience TEXT
      );

      CREATE TABLE IF NOT EXISTS coding_submissions (
        id TEXT PRIMARY KEY,
        userId TEXT,
        testSeriesId TEXT,
        testAttemptId TEXT,
        questionId TEXT,
        language TEXT,
        sourceCode TEXT,
        executionResult TEXT,
        isFinalSubmission INTEGER,
        createdAt TEXT,
        FOREIGN KEY (userId) REFERENCES users(id) ON DELETE CASCADE
      );

      CREATE TABLE IF NOT EXISTS weekly_seasons (
        id TEXT PRIMARY KEY,
        status TEXT,
        startTime TEXT,
        endTime TEXT
      );

      CREATE TABLE IF NOT EXISTS weekly_standings (
        userId TEXT REFERENCES users(id) ON DELETE CASCADE,
        seasonId TEXT REFERENCES weekly_seasons(id) ON DELETE CASCADE,
        groupId TEXT NOT NULL,
        league TEXT NOT NULL,
        weeklyXp INTEGER DEFAULT 0,
        rank INTEGER,
        movement TEXT DEFAULT 'PENDING',
        PRIMARY KEY (userId, seasonId)
      );

      CREATE TABLE IF NOT EXISTS assessment_questions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        testSeriesId TEXT NOT NULL,
        questionId TEXT NOT NULL,
        sectionName TEXT DEFAULT 'General',
        orderIndex INTEGER DEFAULT 0,
        UNIQUE(testSeriesId, questionId)
      );

      CREATE TABLE IF NOT EXISTS deep_ai_credit_ledger (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        userId TEXT NOT NULL,
        amount INTEGER NOT NULL,
        source TEXT NOT NULL,
        transactionType TEXT NOT NULL,
        assessmentId TEXT,
        questionId TEXT,
        description TEXT,
        createdAt TEXT NOT NULL,
        FOREIGN KEY (userId) REFERENCES users(id) ON DELETE CASCADE
      );

      CREATE TABLE IF NOT EXISTS assessment_entitlements (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        userId TEXT NOT NULL,
        assessmentId TEXT NOT NULL,
        grantedAt TEXT NOT NULL,
        expiresAt TEXT,
        grantedBy TEXT DEFAULT 'SYSTEM',
        UNIQUE(userId, assessmentId),
        FOREIGN KEY (userId) REFERENCES users(id) ON DELETE CASCADE
      );

      CREATE TABLE IF NOT EXISTS deep_ai_sessions (
        id TEXT PRIMARY KEY,
        userId TEXT NOT NULL,
        assessmentId TEXT NOT NULL,
        questionId TEXT NOT NULL,
        messagesCount INTEGER DEFAULT 1,
        ledgerRef INTEGER,
        createdAt TEXT NOT NULL,
        updatedAt TEXT NOT NULL,
        FOREIGN KEY (userId) REFERENCES users(id) ON DELETE CASCADE
      );

      CREATE TABLE IF NOT EXISTS deep_ai_premium_periods (
        id TEXT PRIMARY KEY,
        userId TEXT NOT NULL,
        periodStart TEXT NOT NULL,
        periodEnd TEXT NOT NULL,
        allocatedCredits INTEGER NOT NULL,
        usedCredits INTEGER DEFAULT 0,
        status TEXT DEFAULT 'ACTIVE',
        createdAt TEXT NOT NULL,
        updatedAt TEXT NOT NULL,
        FOREIGN KEY (userId) REFERENCES users(id) ON DELETE CASCADE
      );

      CREATE TABLE IF NOT EXISTS payment_orders (
        id TEXT PRIMARY KEY,
        userId TEXT NOT NULL,
        productType TEXT NOT NULL,
        productId TEXT NOT NULL,
        amount INTEGER NOT NULL,
        currency TEXT DEFAULT 'INR',
        status TEXT DEFAULT 'CREATED',
        razorpayOrderId TEXT,
        razorpayPaymentId TEXT,
        razorpaySignature TEXT,
        metadata TEXT,
        createdAt TEXT NOT NULL,
        updatedAt TEXT NOT NULL,
        FOREIGN KEY (userId) REFERENCES users(id) ON DELETE CASCADE
      );

      CREATE TABLE IF NOT EXISTS premium_subscriptions (
        id TEXT PRIMARY KEY,
        userId TEXT NOT NULL,
        provider TEXT DEFAULT 'RAZORPAY',
        razorpaySubscriptionId TEXT,
        razorpayPlanId TEXT,
        status TEXT NOT NULL,
        currentPeriodStart TEXT,
        currentPeriodEnd TEXT,
        cancelledAt TEXT,
        endedAt TEXT,
        createdAt TEXT NOT NULL,
        updatedAt TEXT NOT NULL,
        FOREIGN KEY (userId) REFERENCES users(id) ON DELETE CASCADE
      );

      CREATE TABLE IF NOT EXISTS assessment_integrity_events (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        userId TEXT NOT NULL,
        testId TEXT NOT NULL,
        attemptId TEXT NOT NULL,
        mode TEXT NOT NULL,
        eventType TEXT NOT NULL,
        eventCount INTEGER DEFAULT 1,
        metadata TEXT,
        createdAt TEXT NOT NULL,
        FOREIGN KEY (userId) REFERENCES users(id) ON DELETE CASCADE
      );

      CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
      CREATE INDEX IF NOT EXISTS idx_attempts_userId ON test_attempts(userId);
      CREATE INDEX IF NOT EXISTS idx_responses_attemptId ON attempt_responses(attemptId);
      CREATE INDEX IF NOT EXISTS idx_bookmarks_userId ON bookmarks(userId);
      CREATE INDEX IF NOT EXISTS idx_coding_submissions_userId ON coding_submissions(userId);
      CREATE INDEX IF NOT EXISTS idx_questions_testSeriesId ON questions(testSeriesId);
      CREATE INDEX IF NOT EXISTS idx_assessment_questions_testSeriesId ON assessment_questions(testSeriesId);
      CREATE INDEX IF NOT EXISTS idx_assessment_questions_questionId ON assessment_questions(questionId);
      CREATE INDEX IF NOT EXISTS idx_notifications_target ON notifications(targetUserId, audience);
      CREATE INDEX IF NOT EXISTS idx_deep_ai_usage_userId ON deep_ai_usage(userId);
      CREATE INDEX IF NOT EXISTS idx_credit_ledger_userId ON deep_ai_credit_ledger(userId);
      CREATE INDEX IF NOT EXISTS idx_credit_ledger_created ON deep_ai_credit_ledger(userId, createdAt);
      CREATE INDEX IF NOT EXISTS idx_credit_ledger_user_source ON deep_ai_credit_ledger(userId, source);
      CREATE UNIQUE INDEX IF NOT EXISTS idx_credit_ledger_purchased_order ON deep_ai_credit_ledger(description) WHERE source = 'PURCHASED' AND transactionType = 'GRANT' AND description IS NOT NULL;
      CREATE INDEX IF NOT EXISTS idx_assessment_entitlements_user ON assessment_entitlements(userId, assessmentId);
      CREATE INDEX IF NOT EXISTS idx_deep_ai_sessions_lookup ON deep_ai_sessions(userId, assessmentId, questionId);
      CREATE INDEX IF NOT EXISTS idx_premium_periods_lookup ON deep_ai_premium_periods(userId, status, periodEnd);
      CREATE INDEX IF NOT EXISTS idx_payment_orders_user ON payment_orders(userId);
      CREATE INDEX IF NOT EXISTS idx_payment_orders_rzp ON payment_orders(razorpayOrderId);
      CREATE INDEX IF NOT EXISTS idx_payment_orders_status ON payment_orders(status);
      CREATE INDEX IF NOT EXISTS idx_payment_orders_created ON payment_orders(createdAt);
      CREATE INDEX IF NOT EXISTS idx_premium_sub_user ON premium_subscriptions(userId);
      CREATE INDEX IF NOT EXISTS idx_premium_sub_rzp ON premium_subscriptions(razorpaySubscriptionId);
      CREATE INDEX IF NOT EXISTS idx_premium_sub_status ON premium_subscriptions(status);
      CREATE INDEX IF NOT EXISTS idx_premium_sub_period_end ON premium_subscriptions(currentPeriodEnd);
      CREATE INDEX IF NOT EXISTS idx_integrity_events_attempt ON assessment_integrity_events(attemptId);
      CREATE INDEX IF NOT EXISTS idx_integrity_events_user ON assessment_integrity_events(userId);
    `);

    try {
      this.sqliteDb.exec(`ALTER TABLE test_attempts ADD COLUMN integrityStatus TEXT DEFAULT 'clean'`);
    } catch (e) {}
    try {
      this.sqliteDb.exec(`ALTER TABLE test_attempts ADD COLUMN violationCount INTEGER DEFAULT 0`);
    } catch (e) {}
    try {
      this.sqliteDb.exec(`ALTER TABLE test_attempts ADD COLUMN terminatedAt TEXT`);
    } catch (e) {}
    try {
      this.sqliteDb.exec(`ALTER TABLE test_attempts ADD COLUMN terminationReason TEXT`);
    } catch (e) {}

    try {
      this.sqliteDb.exec(`ALTER TABLE notifications ADD COLUMN expiresAt TEXT`);
    } catch (e) {}
    try {
      this.sqliteDb.exec(`ALTER TABLE notifications ADD COLUMN priority TEXT DEFAULT 'Normal'`);
    } catch (e) {}
    try {
      this.sqliteDb.exec(`ALTER TABLE notifications ADD COLUMN senderId TEXT`);
    } catch (e) {}
    try {
      this.sqliteDb.exec(`ALTER TABLE notifications ADD COLUMN relatedEntityId TEXT`);
    } catch (e) {}
    try {
      this.sqliteDb.exec(`ALTER TABLE notifications ADD COLUMN metadata TEXT`);
    } catch (e) {}
    try {
      this.sqliteDb.exec(`ALTER TABLE notifications ADD COLUMN readAt TEXT`);
    } catch (e) {}

    try {
      this.sqliteDb.exec(`ALTER TABLE users ADD COLUMN currentLeague TEXT DEFAULT 'Bronze'`);
    } catch (e) {}
    try {
      this.sqliteDb.exec(`ALTER TABLE users ADD COLUMN weeklyXp INTEGER DEFAULT 0`);
    } catch (e) {}
    try {
      this.sqliteDb.exec(`ALTER TABLE users ADD COLUMN phone TEXT`);
    } catch (e) {}
    try {
      this.sqliteDb.exec(`ALTER TABLE users ADD COLUMN avatarUrl TEXT`);
    } catch (e) {}
    try {
      this.sqliteDb.exec(`ALTER TABLE users ADD COLUMN linkedIn TEXT`);
    } catch (e) {}
    try {
      this.sqliteDb.exec(`ALTER TABLE users ADD COLUMN github TEXT`);
    } catch (e) {}
    try {
      this.sqliteDb.exec(`ALTER TABLE users ADD COLUMN portfolio TEXT`);
    } catch (e) {}
    try {
      this.sqliteDb.exec(`ALTER TABLE users ADD COLUMN metadata TEXT`);
    } catch (e) {}

    this.sqliteDb.exec(`
      CREATE TABLE IF NOT EXISTS user_feedback (
        id TEXT PRIMARY KEY,
        userId TEXT NOT NULL,
        userName TEXT,
        userEmail TEXT,
        rating INTEGER NOT NULL,
        category TEXT NOT NULL,
        message TEXT NOT NULL,
        contactRequested INTEGER DEFAULT 0,
        createdAt TEXT NOT NULL
      )
    `);

    try {
      this.sqliteDb.exec(`ALTER TABLE weekly_standings ADD COLUMN groupId TEXT NOT NULL DEFAULT ''`);
    } catch (e) {}
    try {
      this.sqliteDb.exec(`ALTER TABLE weekly_standings ADD COLUMN league TEXT NOT NULL DEFAULT 'Bronze'`);
    } catch (e) {}
    try {
      this.sqliteDb.exec(`ALTER TABLE weekly_standings ADD COLUMN weeklyXp INTEGER DEFAULT 0`);
    } catch (e) {}
    try {
      this.sqliteDb.exec(`ALTER TABLE weekly_standings ADD COLUMN rank INTEGER`);
    } catch (e) {}

    try {
      this.sqliteDb.exec(`ALTER TABLE tests ADD COLUMN sections TEXT`);
    } catch (e) {}
    try {
      this.sqliteDb.exec(`ALTER TABLE tests ADD COLUMN createdAt TEXT`);
    } catch (e) {}
    try {
      this.sqliteDb.exec(`ALTER TABLE tests ADD COLUMN updatedAt TEXT`);
    } catch (e) {}

    try {
      this.sqliteDb.exec(`ALTER TABLE questions ADD COLUMN type TEXT DEFAULT 'MCQ'`);
    } catch (e) {}
    try {
      this.sqliteDb.exec(`ALTER TABLE questions ADD COLUMN coding TEXT`);
    } catch (e) {}
    try {
      this.sqliteDb.exec(`ALTER TABLE questions ADD COLUMN source TEXT DEFAULT 'Admin'`);
    } catch (e) {}
    try {
      this.sqliteDb.exec(`ALTER TABLE questions ADD COLUMN createdAt TEXT`);
    } catch (e) {}
    try {
      this.sqliteDb.exec(`ALTER TABLE questions ADD COLUMN updatedAt TEXT`);
    } catch (e) {}
    try {
      this.sqliteDb.exec(`ALTER TABLE weekly_standings ADD COLUMN movement TEXT DEFAULT 'PENDING'`);
    } catch (e) {}

    try {
      this.sqliteDb.exec(`CREATE INDEX IF NOT EXISTS idx_weekly_standings_group ON weekly_standings(seasonId, groupId)`);
    } catch (e) {}

    try {
      this.sqliteDb.exec(`
        CREATE TABLE IF NOT EXISTS payment_orders (
          id TEXT PRIMARY KEY,
          userId TEXT NOT NULL,
          productType TEXT NOT NULL,
          productId TEXT NOT NULL,
          amount INTEGER NOT NULL,
          currency TEXT DEFAULT 'INR',
          status TEXT DEFAULT 'CREATED',
          razorpayOrderId TEXT,
          razorpayPaymentId TEXT,
          razorpaySignature TEXT,
          metadata TEXT,
          createdAt TEXT NOT NULL,
          updatedAt TEXT NOT NULL,
          FOREIGN KEY (userId) REFERENCES users(id) ON DELETE CASCADE
        );
        CREATE INDEX IF NOT EXISTS idx_payment_orders_user ON payment_orders(userId);
        CREATE INDEX IF NOT EXISTS idx_payment_orders_rzp ON payment_orders(razorpayOrderId);
        CREATE INDEX IF NOT EXISTS idx_payment_orders_status ON payment_orders(status);
        CREATE INDEX IF NOT EXISTS idx_payment_orders_created ON payment_orders(createdAt);
      `);
    } catch (e) {}
  }

  private seed() {
    const companyCount = this.sqliteDb.prepare('SELECT COUNT(*) as count FROM companies').get() as { count: number };
    if (companyCount.count === 0) {
      const insertCompany = this.sqliteDb.prepare(`
        INSERT INTO companies (
          id, name, badge, color, accentBg, description, rounds,
          patternSummary, negativeMarking, typicalCutoff, recommendedPrepTime, activeTestCount
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);
      this.sqliteDb.transaction(() => {
        SEED_COMPANIES.forEach((c) => {
          insertCompany.run(
            c.id,
            c.name,
            c.badge,
            c.color,
            c.accentBg,
            c.description,
            JSON.stringify(c.rounds),
            c.patternSummary,
            c.negativeMarking,
            c.typicalCutoff,
            c.recommendedPrepTime,
            c.activeTestCount
          );
        });
      })();
    }

    // Unconditionally seed CATALOGUE_TESTS using UPSERT to update metadata of existing tests
    const insertCatalogueTest = this.sqliteDb.prepare(`
      INSERT INTO tests (
        id, title, description, category, company, companyId, companyName,
        roles, supportedRoles, skills, topics, difficulty, durationMinutes, duration,
        totalQuestions, questionCount, passingPercentage, testType, mode,
        patternVersion, verificationStatus, isMegaEvent, megaEventId, tags,
        attemptsCount, avgScore, status, scoringModel, accessType
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        title = excluded.title,
        description = excluded.description,
        status = excluded.status,
        verificationStatus = excluded.verificationStatus,
        totalQuestions = excluded.totalQuestions,
        questionCount = excluded.questionCount,
        durationMinutes = excluded.durationMinutes,
        duration = excluded.duration,
        category = excluded.category,
        difficulty = excluded.difficulty,
        skills = excluded.skills,
        topics = excluded.topics,
        tags = excluded.tags,
        roles = excluded.roles,
        supportedRoles = excluded.supportedRoles,
        accessType = excluded.accessType
    `);
    this.sqliteDb.transaction(() => {
      CATALOGUE_TESTS.forEach((t) => {
        insertCatalogueTest.run(
          t.id,
          t.title,
          t.description,
          t.category,
          t.company || '',
          t.companyId || '',
          t.companyName || '',
          JSON.stringify(t.roles || []),
          JSON.stringify(t.supportedRoles || []),
          JSON.stringify(t.skills || []),
          JSON.stringify(t.topics || []),
          t.difficulty,
          t.durationMinutes,
          t.duration || t.durationMinutes,
          t.totalQuestions,
          t.questionCount || t.totalQuestions,
          t.passingPercentage || 0,
          t.testType || '',
          t.mode || '',
          t.patternVersion || '',
          t.verificationStatus || '',
          t.isMegaEvent ? 1 : 0,
          t.megaEventId || '',
          JSON.stringify(t.tags || []),
          0,
          0,
          t.status || null,
          t.scoringModel || '',
          t.accessType || 'FREE'
        );
      });
    })();

    const megaEventCount = this.sqliteDb.prepare('SELECT COUNT(*) as count FROM mega_events').get() as { count: number };
    if (megaEventCount.count === 0) {
      const insertMega = this.sqliteDb.prepare(`
        INSERT INTO mega_events (
          id, title, description, company, startTime, endTime, durationMinutes,
          status, testSeriesId, totalParticipants, prizes, bannerTag, badge
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);
      this.sqliteDb.transaction(() => {
        SEED_MEGA_EVENTS.forEach((m) => {
          insertMega.run(
            m.id,
            m.title,
            m.description,
            m.company,
            m.startTime,
            m.endTime,
            m.durationMinutes,
            m.status,
            m.testSeriesId,
            m.totalParticipants,
            m.prizes,
            m.bannerTag,
            m.badge
          );
        });
      })();
    }

    const adCount = this.sqliteDb.prepare('SELECT COUNT(*) as count FROM advertisements').get() as { count: number };
    if (adCount.count === 0) {
      const now = new Date().toISOString();
      const insertAd = this.sqliteDb.prepare(`
        INSERT INTO advertisements (
          id, sponsorName, title, description, logoUrl, bannerImageUrl, cardImageUrl,
          destinationUrl, ctaText, adType, placement, status, priority, startAt, endAt,
          createdBy, createdAt, updatedAt, is_test
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);
      this.sqliteDb.transaction(() => {
        insertAd.run(
          'ad_demo_dashboard_01',
          'FirstRound Apptitude',
          'Learn about how mocks work',
          'Interactive mock tests, AI-driven feedback, and company-specific practice modules to crack your first round.',
          null,
          null,
          null,
          'https://firstround.ai',
          'Learn More',
          'STRUCTURED_CARD',
          'DASHBOARD_SIDEBAR',
          'ACTIVE',
          10,
          null,
          null,
          'system',
          now,
          now,
          0
        );
        insertAd.run(
          'ad_demo_landing_01',
          'Landing Sponsor',
          'Top Landing Sponsor Banner',
          'Join thousands of candidates preparing for TCS, Infosys, Wipro, and Accenture placement drives.',
          null,
          null,
          null,
          'https://firstround.ai',
          'Learn More',
          'STRUCTURED_CARD',
          'LANDING_TOP',
          'ACTIVE',
          10,
          null,
          null,
          'system',
          now,
          now,
          0
        );
      })();
    }
  }

  public seedAssessmentQuestions() {
    try {
      const mappings: Array<{ testSeriesId: string; questionId: string; sectionName: string; orderIndex: number }> = [];

      // 1. Foundation mappings
      quantQuestions.forEach((q, idx) => mappings.push({ testSeriesId: 'cat_foundation_quant', questionId: q.id, sectionName: 'Quantitative Aptitude', orderIndex: idx }));
      logicalQuestions.forEach((q, idx) => mappings.push({ testSeriesId: 'cat_foundation_logical', questionId: q.id, sectionName: 'Logical Reasoning', orderIndex: idx }));
      verbalQuestions.forEach((q, idx) => mappings.push({ testSeriesId: 'cat_foundation_verbal', questionId: q.id, sectionName: 'Verbal Ability', orderIndex: idx }));
      diQuestions.forEach((q, idx) => mappings.push({ testSeriesId: 'cat_foundation_di', questionId: q.id, sectionName: 'Data Interpretation', orderIndex: idx }));
      pseudocodeQuestions.forEach((q, idx) => mappings.push({ testSeriesId: 'cat_foundation_pseudocode', questionId: q.id, sectionName: 'Pseudocode & Logic', orderIndex: idx }));

      // 2. Company banks direct mapping
      accentureQuestions.forEach((q, idx) => mappings.push({ testSeriesId: 'cat_company_accenture', questionId: q.id, sectionName: 'Accenture Cognitive', orderIndex: idx }));
      cognizantQuestions.forEach((q, idx) => mappings.push({ testSeriesId: 'cat_company_cognizant', questionId: q.id, sectionName: 'Cognizant GenC', orderIndex: idx }));
      infosysQuestions.forEach((q, idx) => mappings.push({ testSeriesId: 'cat_company_infosys', questionId: q.id, sectionName: 'Infosys Assessment', orderIndex: idx }));
      tcsAdvancedQuestions.forEach((q, idx) => mappings.push({ testSeriesId: 'cat_company_tcs', questionId: q.id, sectionName: 'TCS Advanced', orderIndex: idx }));
      tcsCodingProblems.forEach((q, idx) => {
        mappings.push({ testSeriesId: 'cat_company_tcs', questionId: q.id, sectionName: 'Hands-on Coding', orderIndex: 20 + idx });
        mappings.push({ testSeriesId: 'cat_company_tcs_foundation', questionId: q.id, sectionName: 'Hands-on Coding', orderIndex: 20 + idx });
      });
      wiproQuestions.forEach((q, idx) => mappings.push({ testSeriesId: 'cat_company_wipro', questionId: q.id, sectionName: 'Wipro Elite NTH', orderIndex: idx }));

      // 3. Coding banks direct mapping
      dsaQuestions.forEach((q, idx) => mappings.push({ testSeriesId: 'cat_coding_dsa', questionId: q.id, sectionName: 'DSA', orderIndex: idx }));
      sqlQuestions.forEach((q, idx) => mappings.push({ testSeriesId: 'cat_coding_sql', questionId: q.id, sectionName: 'SQL', orderIndex: idx }));
      progFundamentalsQuestions.forEach((q, idx) => mappings.push({ testSeriesId: 'cat_coding_prog_fundamentals', questionId: q.id, sectionName: 'Programming Fundamentals', orderIndex: idx }));
      codingOutputQuestions.forEach((q, idx) => mappings.push({ testSeriesId: 'cat_coding_output_debug', questionId: q.id, sectionName: 'Output & Debug', orderIndex: idx }));
      coreCsQuestions.forEach((q, idx) => mappings.push({ testSeriesId: 'cat_coding_core_cs', questionId: q.id, sectionName: 'Core CS', orderIndex: idx }));
      codingMockQuestions.forEach((q, idx) => mappings.push({ testSeriesId: 'cat_coding_mock_01', questionId: q.id, sectionName: 'Technical & Coding', orderIndex: idx }));

      // 4. Dynamic blueprint company mappings
      const fullBank = [
        ...quantQuestions,
        ...logicalQuestions,
        ...verbalQuestions,
        ...diQuestions,
        ...pseudocodeQuestions,
        ...accentureQuestions,
        ...cognizantQuestions,
        ...infosysQuestions,
        ...tcsAdvancedQuestions,
        ...tcsCodingProblems,
        ...wiproQuestions,
      ];

      const companyBpMap: Record<string, string> = {
        bp_company_tcs_nqt_foundation: 'cat_company_tcs_foundation',
        bp_company_tcs_nqt_advanced: 'cat_company_tcs',
        bp_company_infosys_assessment: 'cat_company_infosys',
        bp_company_accenture_cognitive: 'cat_company_accenture',
        bp_company_wipro_elite_nth: 'cat_company_wipro',
        bp_company_cognizant_genc: 'cat_company_cognizant',
      };

      for (const [bpId, testId] of Object.entries(companyBpMap)) {
        const bp = COMPANY_BLUEPRINTS.find((b) => b.id === bpId);
        if (bp) {
          try {
            const assembly = questionSelectionEngine.selectCompanyAssessmentQuestions({
              userId: 'usr_catalogue_default',
              blueprint: bp,
              questionBank: fullBank,
              previouslyAttemptedQuestionIds: [],
              allowPartialReuseWhenExhausted: true,
            });
            assembly.sectionResults.forEach((sr) => {
              sr.selectedQuestions.forEach((cq: any, qIdx: number) => {
                mappings.push({
                  testSeriesId: testId,
                  questionId: cq.id,
                  sectionName: sr.sectionName || 'General',
                  orderIndex: qIdx,
                });
              });
            });
          } catch (e) {}
        }
      }

      const insertStmt = this.sqliteDb.prepare(`
        INSERT INTO assessment_questions (testSeriesId, questionId, sectionName, orderIndex)
        VALUES (?, ?, ?, ?)
        ON CONFLICT(testSeriesId, questionId) DO UPDATE SET
          sectionName = excluded.sectionName,
          orderIndex = excluded.orderIndex
      `);

      this.sqliteDb.transaction(() => {
        for (const m of mappings) {
          insertStmt.run(m.testSeriesId, m.questionId, m.sectionName, m.orderIndex);
        }
      })();
    } catch (err) {
      console.error('[DB] Failed to seed assessment questions mapping:', err);
    }
  }

  /**
   * Backfills test_user_history from test_attempts for any users/tests that
   * have attempts but no corresponding history row. This ensures the history
   * table stays in sync even if earlier code paths failed to record history.
   * Runs on every server start; idempotent — skips rows that already exist.
   */
  private syncTestUserHistory() {
    const missingRows = this.sqliteDb.prepare(`
      SELECT ta.userId, ta.testSeriesId,
             MIN(ta.submittedAt) as firstAt,
             MAX(ta.submittedAt) as lastAt,
             COUNT(*) as cnt,
             MAX(ta.scorePoints) as best,
             (SELECT ta2.scorePoints FROM test_attempts ta2
              WHERE ta2.userId = ta.userId AND ta2.testSeriesId = ta.testSeriesId
              ORDER BY ta2.submittedAt DESC LIMIT 1) as lastScore
      FROM test_attempts ta
      INNER JOIN users u ON ta.userId = u.id
      LEFT JOIN test_user_history tuh ON ta.userId = tuh.userId AND ta.testSeriesId = tuh.testId
      WHERE tuh.userId IS NULL
      GROUP BY ta.userId, ta.testSeriesId
    `).all() as any[];

    if (missingRows.length === 0) return;

    const insert = this.sqliteDb.prepare(`
      INSERT INTO test_user_history
      (userId, testId, status, firstVisitedAt, lastVisitedAt, lastAttemptAt, attemptCount, bestScore, lastScore)
      VALUES (?, ?, 'COMPLETED', ?, ?, ?, ?, ?, ?)
    `);

    this.sqliteDb.transaction(() => {
      for (const row of missingRows) {
        insert.run(
          row.userId, row.testSeriesId,
          row.firstAt, row.lastAt, row.lastAt,
          row.cnt, row.best, row.lastScore
        );
      }
    })();
  }

  // --- User Helper ---
  public mapDbUserToUser(raw: any): User {
    const isSuperAdminEmail = raw.email && raw.email.toLowerCase() === 'pawankhot9@gmail.com';
    const effectiveRole = isSuperAdminEmail ? 'super_admin' : (raw.role || 'student');
    const userObj: User = {
      ...raw,
      role: effectiveRole,
      currentLeague: raw.currentLeague || 'Bronze',
      weeklyXp: raw.weeklyXp || 0,
      plan: (raw.plan as any) || 'FREE',
      subscriptionStatus: (raw.subscriptionStatus as any) || 'inactive',
      subscriptionExpiresAt: raw.subscriptionExpiresAt || null,
      provider: raw.provider || null,
      providerCustomerId: raw.providerCustomerId || null,
      providerSubscriptionId: raw.providerSubscriptionId || null,
      currentPeriodStart: raw.currentPeriodStart || null,
      currentPeriodEnd: raw.currentPeriodEnd || null,
      cancelAtPeriodEnd: Boolean(raw.cancelAtPeriodEnd),
      pendingPlan: (raw.pendingPlan as any) || null,
      accountStatus: raw.accountStatus || 'ACTIVE',
      bannedUntil: raw.bannedUntil || null,
      banReason: raw.banReason || null,
      bannedBy: raw.bannedBy || null,
      bannedAt: raw.bannedAt || null,
      deletedAt: raw.deletedAt || null,
      deletedBy: raw.deletedBy || null,
      phone: raw.phone || null,
      avatarUrl: raw.avatarUrl || raw.avatar || null,
      linkedIn: raw.linkedIn || null,
      github: raw.github || null,
      portfolio: raw.portfolio || null,
      metadata: typeof raw.metadata === 'string' ? safeJsonParse(raw.metadata, {}) : (raw.metadata || {}),
      readNotificationIds: safeJsonParse(raw.readNotificationIds, []),
    };
    userObj.isPremium = hasPremiumAccess(userObj);
    return userObj;
  }

  // --- User Operations ---
  public loginOrRegister(email: string, name?: string, college?: string, targetCompany?: string, targetRole?: string, role?: 'student' | 'admin'): User {
    const isSuperAdminEmail = email.toLowerCase() === 'pawankhot9@gmail.com';
    const existing = this.sqliteDb.prepare('SELECT * FROM users WHERE LOWER(email) = LOWER(?)').get(email) as any;
    if (existing) {
      const statusCheck = this.checkUserAccountStatus(existing);
      if (!statusCheck.allowed) {
        throw new Error(statusCheck.reason || 'Account access blocked.');
      }
      let updated = false;
      let newComp = existing.targetCompany;
      let newRole = existing.targetRole;
      let newCollege = existing.college;
      let newName = existing.name;

      if (!existing.targetCompany && targetCompany) {
        newComp = targetCompany;
        updated = true;
      }
      if (!existing.targetRole && targetRole) {
        newRole = targetRole;
        updated = true;
      }
      if (!existing.college && college) {
        newCollege = college;
        updated = true;
      }
      if (!existing.name && name) {
        newName = name;
        updated = true;
      }

      let currentRole = existing.role;
      if (isSuperAdminEmail && existing.role !== 'super_admin') {
        currentRole = 'super_admin';
        this.sqliteDb.prepare("UPDATE users SET role = 'super_admin' WHERE id = ?").run(existing.id);
      }

      if (updated) {
        this.sqliteDb.prepare('UPDATE users SET targetCompany = ?, targetRole = ?, college = ?, name = ? WHERE id = ?').run(newComp, newRole, newCollege, newName, existing.id);
        existing.targetCompany = newComp;
        existing.targetRole = newRole;
        existing.college = newCollege;
        existing.name = newName;
      }

      existing.role = currentRole;
      return this.mapDbUserToUser(existing);
    }

    const assignedRole = isSuperAdminEmail ? 'super_admin' : (role === 'admin' ? 'admin' : 'student');
    const newUser: User = {
      id: `user_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`,
      email,
      name: name || email.split('@')[0],
      college: college || '',
      targetCompany: targetCompany || '',
      targetRole: targetRole || '',
      role: assignedRole as any,
      totalPoints: 0,
      totalTestsAttempted: 0,
      totalCorrect: 0,
      totalIncorrect: 0,
      averageAccuracy: 0,
      averageTimePerQuestionSeconds: 0,
      createdAt: new Date().toISOString(),
      readNotificationIds: [],
      plan: 'FREE',
      subscriptionStatus: 'inactive',
      subscriptionExpiresAt: null,
      isPremium: false,
    };
    this.sqliteDb.prepare(`
      INSERT INTO users (
        id, email, name, college, targetCompany, targetRole, role,
        totalPoints, totalTestsAttempted, totalCorrect, totalIncorrect,
        averageAccuracy, averageTimePerQuestionSeconds, readNotificationIds, createdAt,
        plan, subscriptionStatus, subscriptionExpiresAt
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      newUser.id,
      newUser.email,
      newUser.name,
      newUser.college,
      newUser.targetCompany,
      newUser.targetRole,
      newUser.role,
      newUser.totalPoints,
      newUser.totalTestsAttempted,
      newUser.totalCorrect,
      newUser.totalIncorrect,
      newUser.averageAccuracy,
      newUser.averageTimePerQuestionSeconds,
      JSON.stringify(newUser.readNotificationIds),
      newUser.createdAt,
      'FREE',
      'inactive',
      null
    );
    this.ensureInitialUserCredits(newUser.id);
    return {
      ...newUser,
      currentLeague: 'Bronze',
      weeklyXp: 0,
    };
  }

  public getUserByEmail(email: string): User | undefined {
    const user = this.sqliteDb.prepare('SELECT * FROM users WHERE LOWER(email) = LOWER(?)').get(email) as any;
    if (!user) return undefined;
    if (user.email && user.email.toLowerCase() === 'pawankhot9@gmail.com' && user.role !== 'super_admin') {
      this.sqliteDb.prepare("UPDATE users SET role = 'super_admin' WHERE id = ?").run(user.id);
      user.role = 'super_admin';
    }
    return this.mapDbUserToUser(user);
  }

  public getUserById(id: string): User | undefined {
    let user = this.sqliteDb.prepare('SELECT * FROM users WHERE id = ?').get(id) as any;
    if (!user && id && id.includes('@')) {
      user = this.sqliteDb.prepare('SELECT * FROM users WHERE LOWER(email) = LOWER(?)').get(id) as any;
    }
    if (!user) return undefined;
    if (user.email && user.email.toLowerCase() === 'pawankhot9@gmail.com' && user.role !== 'super_admin') {
      this.sqliteDb.prepare("UPDATE users SET role = 'super_admin' WHERE id = ?").run(user.id);
      user.role = 'super_admin';
    }
    return this.mapDbUserToUser(user);
  }

  public updateUser(id: string, data: Partial<User>): User | undefined {
    const user = this.getUserById(id);
    if (!user) return undefined;

    // Remove role from generic update payload to prevent unauthorized role modifications
    const safeData = { ...data };
    delete safeData.role;

    let avatarVal: string | null = null;
    if (safeData.avatarUrl === '' || safeData.avatar === '' || safeData.avatarUrl === null || safeData.avatar === null) {
      avatarVal = null;
    } else if (safeData.avatarUrl) {
      avatarVal = safeData.avatarUrl;
    } else if (safeData.avatar) {
      avatarVal = safeData.avatar;
    } else if (user.avatarUrl) {
      avatarVal = user.avatarUrl;
    } else if (user.avatar) {
      avatarVal = user.avatar;
    } else {
      avatarVal = null;
    }

    const updated: User = {
      ...user,
      ...safeData,
      avatarUrl: avatarVal || undefined,
      avatar: avatarVal || undefined,
      id: user.id,
      email: user.email,
      role: user.email.toLowerCase() === 'pawankhot9@gmail.com' ? 'super_admin' : user.role,
    };
    this.sqliteDb.prepare(`
      UPDATE users SET
        name = ?,
        college = ?,
        targetCompany = ?,
        targetRole = ?,
        role = ?,
        totalPoints = ?,
        totalTestsAttempted = ?,
        totalCorrect = ?,
        totalIncorrect = ?,
        averageAccuracy = ?,
        averageTimePerQuestionSeconds = ?,
        readNotificationIds = ?,
        createdAt = ?,
        plan = ?,
        subscriptionStatus = ?,
        subscriptionExpiresAt = ?,
        provider = ?,
        providerCustomerId = ?,
        providerSubscriptionId = ?,
        currentPeriodStart = ?,
        currentPeriodEnd = ?,
        phone = ?,
        avatarUrl = ?,
        avatar = ?,
        linkedIn = ?,
        github = ?,
        portfolio = ?,
        metadata = ?
      WHERE id = ?
    `).run(
      updated.name,
      updated.college || '',
      updated.targetCompany || '',
      updated.targetRole || '',
      updated.role,
      updated.totalPoints,
      updated.totalTestsAttempted,
      updated.totalCorrect,
      updated.totalIncorrect,
      updated.averageAccuracy,
      updated.averageTimePerQuestionSeconds,
      JSON.stringify(updated.readNotificationIds || []),
      updated.createdAt,
      updated.plan || 'FREE',
      updated.subscriptionStatus || 'inactive',
      updated.subscriptionExpiresAt || null,
      updated.provider || null,
      updated.providerCustomerId || null,
      updated.providerSubscriptionId || null,
      updated.currentPeriodStart || null,
      updated.currentPeriodEnd || null,
      updated.phone || null,
      avatarVal,
      avatarVal,
      updated.linkedIn || null,
      updated.github || null,
      updated.portfolio || null,
      typeof updated.metadata === 'object' ? JSON.stringify(updated.metadata) : (updated.metadata || null),
      id
    );
    return this.getUserById(id);
  }

  // --- Subscription Foundation Methods (Phase 1) ---

  public getUserSubscription(userId: string): SubscriptionInfo {
    const user = this.getUserById(userId);
    if (!user) {
      return {
        userId,
        plan: 'FREE',
        status: 'inactive',
        currentPeriodStart: null,
        currentPeriodEnd: null,
        cancelAtPeriodEnd: false,
        pendingPlan: null,
        selectedAssessmentIds: [],
      };
    }

    let rawSub = this.sqliteDb.prepare('SELECT * FROM premium_subscriptions WHERE userId = ? ORDER BY createdAt DESC LIMIT 1').get(userId) as any;

    let plan: SubscriptionPlan = (user.plan as any) || 'FREE';
    let status: SubscriptionStatus = (user.subscriptionStatus as any) || 'inactive';
    let currentPeriodStart: string | null = user.currentPeriodStart || (rawSub ? rawSub.currentPeriodStart : null);
    let currentPeriodEnd: string | null = user.currentPeriodEnd || user.subscriptionExpiresAt || (rawSub ? rawSub.currentPeriodEnd : null);
    let cancelAtPeriodEnd: boolean = Boolean((user as any).cancelAtPeriodEnd || (rawSub && rawSub.cancelAtPeriodEnd));
    let pendingPlan: SubscriptionPlan | null = (user as any).pendingPlan || (rawSub ? rawSub.pendingPlan : null);

    // Automatic period expiration and transition check
    if (currentPeriodEnd) {
      let endMs = typeof currentPeriodEnd === 'number' ? currentPeriodEnd : Number(currentPeriodEnd);
      if (isNaN(endMs)) {
        endMs = new Date(currentPeriodEnd).getTime();
      }
      if (!isNaN(endMs) && endMs <= Date.now()) {
        if (pendingPlan) {
          const oldPlan = plan;
          plan = pendingPlan;
          status = plan === 'FREE' ? 'expired' : 'active';
          if (plan !== 'FREE') {
            const oneMonthMs = 30 * 24 * 60 * 60 * 1000;
            currentPeriodStart = new Date().toISOString();
            currentPeriodEnd = new Date(Date.now() + oneMonthMs).toISOString();
          }
          pendingPlan = null;
          cancelAtPeriodEnd = false;

          // If transitioning from PRO to PLUS, reset Plus selections so user must choose 2 tests again
          if (oldPlan === 'PRO' && plan === 'PLUS') {
            this.clearPlusTestSelections(userId);
          }
        } else if (cancelAtPeriodEnd) {
          plan = 'FREE';
          status = 'expired';
          cancelAtPeriodEnd = false;
        } else if (status === 'active' && plan !== 'FREE') {
          status = 'expired';
          plan = 'FREE';
        }

        // Persist expired / transitioned state directly in SQLite
        this.sqliteDb.prepare(`
          UPDATE users SET
            plan = ?,
            subscriptionStatus = ?,
            currentPeriodStart = ?,
            currentPeriodEnd = ?,
            cancelAtPeriodEnd = ?,
            pendingPlan = ?
          WHERE id = ?
        `).run(plan, status, currentPeriodStart, currentPeriodEnd, cancelAtPeriodEnd ? 1 : 0, pendingPlan, userId);

        this.sqliteDb.prepare(`
          UPDATE premium_subscriptions SET
            plan = ?,
            status = ?,
            currentPeriodStart = ?,
            currentPeriodEnd = ?,
            cancelAtPeriodEnd = ?,
            pendingPlan = ?,
            updatedAt = ?
          WHERE userId = ?
        `).run(plan, status, currentPeriodStart, currentPeriodEnd, cancelAtPeriodEnd ? 1 : 0, pendingPlan, new Date().toISOString(), userId);
      }
    }

    const selectedAssessmentIds = this.getUserPlusSelections(userId);

    return {
      userId,
      plan,
      status,
      currentPeriodStart,
      currentPeriodEnd,
      cancelAtPeriodEnd,
      pendingPlan,
      selectedAssessmentIds,
    };
  }

  public getUserPlan(userId: string): SubscriptionPlan {
    const sub = this.getUserSubscription(userId);
    return sub.plan;
  }

  public isSubscriptionActive(userId: string): boolean {
    const sub = this.getUserSubscription(userId);
    return (sub.status === 'active' || sub.status === 'ACTIVE') && sub.plan !== 'FREE';
  }

  public updateSubscriptionState(
    userId: string,
    options: {
      plan?: SubscriptionPlan;
      status?: SubscriptionStatus;
      currentPeriodStart?: string | null;
      currentPeriodEnd?: string | null;
      cancelAtPeriodEnd?: boolean;
      pendingPlan?: SubscriptionPlan | null;
    }
  ): SubscriptionInfo {
    const userRow = this.sqliteDb.prepare('SELECT plan, subscriptionStatus, currentPeriodStart, currentPeriodEnd, cancelAtPeriodEnd, pendingPlan FROM users WHERE id = ?').get(userId) as any;
    const existingPlan = (userRow?.plan as SubscriptionPlan) || 'FREE';
    const existingStatus = (userRow?.subscriptionStatus as SubscriptionStatus) || 'inactive';
    const existingStart = userRow?.currentPeriodStart || null;
    const existingEnd = userRow?.currentPeriodEnd || null;
    const existingCancelFlag = Boolean(userRow?.cancelAtPeriodEnd);
    const existingPendingPlan = (userRow?.pendingPlan as SubscriptionPlan) || null;

    const newPlan = options.plan !== undefined ? options.plan : existingPlan;
    const newStatus = options.status !== undefined ? options.status : existingStatus;
    const newStart = options.currentPeriodStart !== undefined ? options.currentPeriodStart : existingStart;
    const newEnd = options.currentPeriodEnd !== undefined ? options.currentPeriodEnd : existingEnd;
    const newCancelFlag = options.cancelAtPeriodEnd !== undefined ? options.cancelAtPeriodEnd : existingCancelFlag;
    const newPendingPlan = options.pendingPlan !== undefined ? options.pendingPlan : existingPendingPlan;

    // Update users table
    this.sqliteDb.prepare(`
      UPDATE users SET
        plan = ?,
        subscriptionStatus = ?,
        currentPeriodStart = ?,
        currentPeriodEnd = ?,
        subscriptionExpiresAt = ?,
        cancelAtPeriodEnd = ?,
        pendingPlan = ?
      WHERE id = ?
    `).run(
      newPlan,
      newStatus,
      newStart,
      newEnd,
      newEnd,
      newCancelFlag ? 1 : 0,
      newPendingPlan,
      userId
    );

    // Sync or insert into premium_subscriptions
    const subRow = this.sqliteDb.prepare('SELECT id FROM premium_subscriptions WHERE userId = ? ORDER BY createdAt DESC LIMIT 1').get(userId) as any;
    const nowIso = new Date().toISOString();
    if (subRow) {
      this.sqliteDb.prepare(`
        UPDATE premium_subscriptions SET
          plan = ?,
          status = ?,
          currentPeriodStart = ?,
          currentPeriodEnd = ?,
          cancelAtPeriodEnd = ?,
          pendingPlan = ?,
          updatedAt = ?
        WHERE id = ?
      `).run(
        newPlan,
        newStatus,
        newStart,
        newEnd,
        newCancelFlag ? 1 : 0,
        newPendingPlan,
        nowIso,
        subRow.id
      );
    } else {
      const subId = `sub_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
      this.sqliteDb.prepare(`
        INSERT INTO premium_subscriptions (
          id, userId, provider, plan, status, currentPeriodStart, currentPeriodEnd, cancelAtPeriodEnd, pendingPlan, createdAt, updatedAt
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        subId,
        userId,
        'RAZORPAY',
        newPlan,
        newStatus,
        newStart,
        newEnd,
        newCancelFlag ? 1 : 0,
        newPendingPlan,
        nowIso,
        nowIso
      );
    }

    return this.getUserSubscription(userId);
  }

  public getUserPlusSelections(userId: string): string[] {
    const rows = this.sqliteDb.prepare('SELECT assessmentId FROM plus_test_selections WHERE userId = ? ORDER BY selectedAt ASC').all(userId) as any[];
    return rows.map((r) => r.assessmentId);
  }

  public selectPlusAssessment(userId: string, assessmentId: string): { success: boolean; selected: string[]; error?: string } {
    try {
      const sub = this.getUserSubscription(userId);

      if (sub.plan !== 'PLUS' || sub.status !== 'active') {
        return { success: false, selected: this.getUserPlusSelections(userId), error: 'User must be on an active FirstRound Plus plan to select Premium assessments.' };
      }

      try {
        const testRow = this.sqliteDb.prepare('SELECT id, accessType FROM tests WHERE id = ?').get(assessmentId) as any;
        if (testRow && testRow.accessType !== 'PREMIUM') {
          return { success: false, selected: this.getUserPlusSelections(userId), error: 'Assessment is not a Premium assessment.' };
        }
      } catch (e) {}

      const current = this.getUserPlusSelections(userId);
      if (current.includes(assessmentId)) {
        return { success: true, selected: current };
      }

      if (current.length >= 2) {
        return { success: false, selected: current, error: 'Maximum limit of 2 Premium assessments reached for Plus plan.' };
      }

      const id = `pts_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
      const nowIso = new Date().toISOString();
      this.sqliteDb.prepare(`
        INSERT INTO plus_test_selections (id, userId, assessmentId, selectedAt)
        VALUES (?, ?, ?, ?)
      `).run(id, userId, assessmentId, nowIso);

      return { success: true, selected: this.getUserPlusSelections(userId) };
    } catch (err: any) {
      return { success: false, selected: this.getUserPlusSelections(userId), error: err.message || 'Failed to select assessment' };
    }
  }

  public deselectPlusAssessment(userId: string, assessmentId: string): { success: boolean; selected: string[] } {
    this.sqliteDb.prepare('DELETE FROM plus_test_selections WHERE userId = ? AND assessmentId = ?').run(userId, assessmentId);
    return { success: true, selected: this.getUserPlusSelections(userId) };
  }

  public clearPlusTestSelections(userId: string): { success: boolean; selected: string[] } {
    this.sqliteDb.prepare('DELETE FROM plus_test_selections WHERE userId = ?').run(userId);
    return { success: true, selected: [] };
  }

  public saveUserFeedback(params: {
    id?: string;
    userId: string;
    userName?: string;
    userEmail?: string;
    rating: number;
    category: string;
    message: string;
    contactRequested: boolean;
  }): any {
    const id = params.id || `fb_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const now = new Date().toISOString();
    this.sqliteDb.prepare(`
      INSERT INTO user_feedback (id, userId, userName, userEmail, rating, category, message, contactRequested, createdAt)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id,
      params.userId,
      params.userName || '',
      params.userEmail || '',
      params.rating,
      params.category,
      params.message,
      params.contactRequested ? 1 : 0,
      now
    );
    return { id, ...params, createdAt: now };
  }

  public deleteUserAccount(userId: string): boolean {
    if (this.isProtectedSuperAdmin(userId)) {
      throw new Error('The primary Super Admin account cannot be deleted.');
    }

    const targetUser = this.getUserById(userId);
    if (!targetUser) return false;

    const safeDeleteFromTable = (tableName: string, colName = 'userId') => {
      try {
        this.sqliteDb.prepare(`DELETE FROM ${tableName} WHERE ${colName} = ?`).run(userId);
      } catch (e) {}
    };

    const deleteTx = this.sqliteDb.transaction(() => {
      safeDeleteFromTable('bookmarks');
      safeDeleteFromTable('weak_questions');
      safeDeleteFromTable('test_attempts');
      safeDeleteFromTable('attempt_responses');
      safeDeleteFromTable('coding_submissions');
      safeDeleteFromTable('notifications');
      safeDeleteFromTable('assessment_entitlements');
      safeDeleteFromTable('deep_ai_credit_ledger');
      safeDeleteFromTable('deep_ai_sessions');
      safeDeleteFromTable('deep_ai_premium_periods');
      safeDeleteFromTable('payment_orders');
      safeDeleteFromTable('premium_subscriptions');
      safeDeleteFromTable('user_feedback');

      const res = this.sqliteDb.prepare(`DELETE FROM users WHERE id = ?`).run(userId);
      return res.changes > 0;
    });

    return deleteTx();
  }

  public setUserSubscription(userId: string, sub: {
    plan?: 'FREE' | 'PREMIUM';
    subscriptionStatus?: 'inactive' | 'active' | 'expired' | 'cancelled';
    subscriptionExpiresAt?: string | null;
    provider?: string | null;
    providerCustomerId?: string | null;
    providerSubscriptionId?: string | null;
    currentPeriodStart?: string | null;
    currentPeriodEnd?: string | null;
  }): User | undefined {
    const user = this.getUserById(userId);
    if (!user) return undefined;

    const plan = sub.plan !== undefined ? sub.plan : (user.plan || 'FREE');
    const subscriptionStatus = sub.subscriptionStatus !== undefined ? sub.subscriptionStatus : (user.subscriptionStatus || 'inactive');
    const subscriptionExpiresAt = sub.subscriptionExpiresAt !== undefined ? sub.subscriptionExpiresAt : (user.subscriptionExpiresAt || null);
    const provider = sub.provider !== undefined ? sub.provider : (user.provider || null);
    const providerCustomerId = sub.providerCustomerId !== undefined ? sub.providerCustomerId : (user.providerCustomerId || null);
    const providerSubscriptionId = sub.providerSubscriptionId !== undefined ? sub.providerSubscriptionId : (user.providerSubscriptionId || null);
    const currentPeriodStart = sub.currentPeriodStart !== undefined ? sub.currentPeriodStart : (user.currentPeriodStart || null);
    const currentPeriodEnd = sub.currentPeriodEnd !== undefined ? sub.currentPeriodEnd : (user.currentPeriodEnd || null);

    this.sqliteDb.prepare(`
      UPDATE users SET
        plan = ?,
        subscriptionStatus = ?,
        subscriptionExpiresAt = ?,
        provider = ?,
        providerCustomerId = ?,
        providerSubscriptionId = ?,
        currentPeriodStart = ?,
        currentPeriodEnd = ?
      WHERE id = ?
    `).run(
      plan,
      subscriptionStatus,
      subscriptionExpiresAt,
      provider,
      providerCustomerId,
      providerSubscriptionId,
      currentPeriodStart,
      currentPeriodEnd,
      userId
    );

    return this.getUserById(userId);
  }

  public recordDeepAIUsage(params: {
    userId: string;
    requestCount?: number;
    inputTokens?: number;
    outputTokens?: number;
    estimatedCost?: number;
    periodStart?: string;
    periodEnd?: string;
  }): DeepAIUsageRecord {
    const now = new Date();
    const periodStart = params.periodStart || new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
    const periodEnd = params.periodEnd || new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59).toISOString();
    const requestCount = params.requestCount ?? 1;
    const inputTokens = params.inputTokens ?? 0;
    const outputTokens = params.outputTokens ?? 0;
    const estimatedCost = params.estimatedCost ?? 0.0;
    const createdAt = now.toISOString();

    let lastInsertRowid = 0;
    try {
      const userExists = this.sqliteDb.prepare('SELECT id FROM users WHERE id = ?').get(params.userId);
      if (!userExists) {
        this.sqliteDb.prepare(`
          INSERT INTO users (id, email, name, role, is_test, createdAt)
          VALUES (?, ?, ?, 'student', 1, ?)
        `).run(params.userId, `${params.userId}@auto.test`, params.userId, createdAt);
      }

      const stmt = this.sqliteDb.prepare(`
        INSERT INTO deep_ai_usage (userId, requestCount, inputTokens, outputTokens, estimatedCost, periodStart, periodEnd, createdAt)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `);
      const info = stmt.run(
        params.userId,
        requestCount,
        inputTokens,
        outputTokens,
        estimatedCost,
        periodStart,
        periodEnd,
        createdAt
      );
      lastInsertRowid = Number(info.lastInsertRowid);
    } catch (e) {
      console.error('[DB] recordDeepAIUsage insert ignored error:', e);
    }

    return {
      id: lastInsertRowid,
      userId: params.userId,
      requestCount,
      inputTokens,
      outputTokens,
      estimatedCost,
      periodStart,
      periodEnd,
      createdAt,
    };
  }

  public getDeepAIUsageSummary(userId: string): {
    requestCount: number;
    inputTokens: number;
    outputTokens: number;
    estimatedCost: number;
  } {
    const row = this.sqliteDb.prepare(`
      SELECT
        COALESCE(SUM(requestCount), 0) as totalRequests,
        COALESCE(SUM(inputTokens), 0) as totalInputTokens,
        COALESCE(SUM(outputTokens), 0) as totalOutputTokens,
        COALESCE(SUM(estimatedCost), 0.0) as totalCost
      FROM deep_ai_usage
      WHERE userId = ?
    `).get(userId) as any;

    return {
      requestCount: Number(row?.totalRequests || 0),
      inputTokens: Number(row?.totalInputTokens || 0),
      outputTokens: Number(row?.totalOutputTokens || 0),
      estimatedCost: Number(row?.totalCost || 0.0),
    };
  }

  public getTeamMembers(): User[] {
    this.ensureSuperAdmin();
    const rows = this.sqliteDb.prepare(
      "SELECT * FROM users WHERE role IN ('admin', 'super_admin') ORDER BY role DESC, name ASC"
    ).all() as any[];
    return rows.map((u) => this.mapDbUserToUser(u));
  }

  public searchUsers(query: string): User[] {
    if (!query || query.trim().length === 0) return [];
    const q = `%${query.trim().toLowerCase()}%`;
    const rows = this.sqliteDb.prepare(
      "SELECT * FROM users WHERE (LOWER(email) LIKE ? OR LOWER(name) LIKE ?) LIMIT 20"
    ).all(q, q) as any[];
    return rows.map((u) => this.mapDbUserToUser(u));
  }

  public setUserRole(targetUserId: string, newRole: 'admin' | 'student', requestingUserId: string): User {
    const requestingUser = this.getUserById(requestingUserId);
    if (!requestingUser || requestingUser.role !== 'super_admin') {
      throw new Error('Forbidden: Only Super Admin can manage team admins.');
    }

    const targetUser = this.getUserById(targetUserId);
    if (!targetUser) {
      throw new Error('User not found.');
    }

    if (targetUser.email.toLowerCase() === 'pawankhot9@gmail.com') {
      throw new Error('Forbidden: Cannot modify Super Admin role.');
    }

    if (targetUserId === requestingUserId) {
      throw new Error('Forbidden: Super Admin cannot self-demote.');
    }

    if (newRole !== 'admin' && newRole !== 'student') {
      throw new Error('Invalid target role specified.');
    }

    this.sqliteDb.prepare('UPDATE users SET role = ? WHERE id = ?').run(newRole, targetUserId);
    targetUser.role = newRole;
    return targetUser;
  }

  private ensureAuthorizedProductionUsers() {
    this.ensureSuperAdmin();
    this.cleanupProductionDatabase();
    try {
      const students = [
        { id: 'user_student_akhot5779', email: 'akhot5779@gmail.com', name: 'Aditya Khot' },
        { id: 'user_student_pawankhot127', email: 'pawan.khot1272004@gmail.com', name: 'Pawan Khot' },
      ];
      const now = new Date().toISOString();
      for (const s of students) {
        const existing = this.sqliteDb.prepare("SELECT * FROM users WHERE LOWER(email) = LOWER(?)").get(s.email) as any;
        if (!existing) {
          this.sqliteDb.prepare(`
            INSERT INTO users (id, name, email, role, avatar, targetCompany, targetRole, totalPoints, totalTestsAttempted, totalCorrect, totalIncorrect, averageAccuracy, averageTimePerQuestionSeconds, readNotificationIds, createdAt, plan, subscriptionStatus)
            VALUES (?, ?, ?, 'student', '', '', '', 0, 0, 0, 0, 0, 0, '[]', ?, 'FREE', 'inactive')
          `).run(s.id, s.name, s.email, now);
        }
      }
      this.sanitizeProductionUserData();
    } catch (e) {
      console.error('[DB] Failed to ensure production users:', e);
    }
  }

  private sanitizeProductionUserData() {
    try {
      const prodUsersWithZeroAttempts = this.sqliteDb.prepare(`
        SELECT u.id, u.email, u.totalPoints, u.currentStreakDays, u.targetCompany, u.targetRole
        FROM users u
        WHERE (u.is_test = 0 OR u.is_test IS NULL)
          AND NOT EXISTS (
            SELECT 1 FROM test_attempts ta 
            WHERE ta.userId = u.id AND (ta.is_test = 0 OR ta.is_test IS NULL)
          )
      `).all() as any[];

      for (const u of prodUsersWithZeroAttempts) {
        if (u.totalPoints > 0 || u.currentStreakDays > 0 || u.targetCompany === 'TCS' || u.targetRole === 'Software Engineer') {
          this.sqliteDb.prepare(`
            UPDATE users 
            SET totalPoints = 0, 
                currentStreakDays = 0, 
                weeklyGoalHours = 0, 
                totalTestsAttempted = 0, 
                totalTestsTaken = 0, 
                totalTimeSpentMinutes = 0,
                targetCompany = CASE WHEN targetCompany = 'TCS' THEN '' ELSE targetCompany END,
                targetRole = CASE WHEN targetRole = 'Software Engineer' THEN '' ELSE targetRole END
            WHERE id = ?
          `).run(u.id);
        }
      }
    } catch (e) {
      console.error('[DB] Error sanitizing production user data:', e);
    }
  }

  public getAllUsers(includeTest = false): User[] {
    this.ensureAuthorizedProductionUsers();
    const query = includeTest
      ? 'SELECT * FROM users ORDER BY createdAt DESC'
      : 'SELECT * FROM users WHERE (is_test = 0 OR is_test IS NULL) ORDER BY createdAt DESC';
    const rows = this.sqliteDb.prepare(query).all() as any[];
    return rows.map((r) => this.mapDbUserToUser(r));
  }

  // --- Phase H.5 Account Access & Credit Grant Methods ---
  public isProtectedSuperAdmin(userIdOrUser: string | User | any): boolean {
    if (!userIdOrUser) return false;
    const id = typeof userIdOrUser === 'string' ? userIdOrUser : userIdOrUser.id;
    const email = typeof userIdOrUser === 'string' ? '' : (userIdOrUser.email || '').toLowerCase();
    if (id === 'user_superadmin_pawankhot' || email === 'pawankhot9@gmail.com') return true;
    try {
      const u = this.sqliteDb.prepare("SELECT id, email FROM users WHERE id = ? OR LOWER(email) = LOWER(?)").get(id, id) as any;
      if (u && (u.id === 'user_superadmin_pawankhot' || u.email.toLowerCase() === 'pawankhot9@gmail.com')) return true;
    } catch (e) {}
    return false;
  }

  public checkUserAccountStatus(userIdOrUser: string | User | any): { allowed: boolean; status: string; reason?: string; bannedUntil?: string } {
    const raw = typeof userIdOrUser === 'string' ? this.sqliteDb.prepare('SELECT * FROM users WHERE id = ?').get(userIdOrUser) as any : userIdOrUser;
    if (!raw) return { allowed: true, status: 'ACTIVE' };
    const status = raw.accountStatus || 'ACTIVE';
    if (status === 'DELETED') {
      return { allowed: false, status: 'DELETED', reason: 'Account deleted.' };
    }
    if (status === 'PERMANENTLY_BANNED') {
      return { allowed: false, status: 'PERMANENTLY_BANNED', reason: `Account permanently banned.${raw.banReason ? ` Reason: ${raw.banReason}` : ''}` };
    }
    if (status === 'TEMPORARILY_BANNED') {
      if (raw.bannedUntil) {
        const banEnd = new Date(raw.bannedUntil).getTime();
        if (Date.now() < banEnd) {
          return {
            allowed: false,
            status: 'TEMPORARILY_BANNED',
            reason: `Account temporarily banned until ${new Date(raw.bannedUntil).toLocaleString()}.${raw.banReason ? ` Reason: ${raw.banReason}` : ''}`,
            bannedUntil: raw.bannedUntil,
          };
        } else {
          // Expired ban -> restore access automatically
          this.restoreUserAccess(raw.id);
          return { allowed: true, status: 'ACTIVE' };
        }
      }
    }
    return { allowed: true, status: 'ACTIVE' };
  }

  public tempBanUser(targetUserId: string, actingAdminId: string, durationDays: number, reason?: string): User {
    if (this.isProtectedSuperAdmin(targetUserId)) {
      throw new Error('Primary Super Admin account cannot be modified, banned, or deleted.');
    }
    if (!Number.isInteger(durationDays) || durationDays <= 0) {
      throw new Error('Duration days must be a positive integer.');
    }
    const target = this.getUserById(targetUserId);
    if (!target) throw new Error('User not found.');
    const now = new Date();
    const bannedUntil = new Date(now.getTime() + durationDays * 86400000).toISOString();
    this.sqliteDb.prepare(`
      UPDATE users
      SET accountStatus = 'TEMPORARILY_BANNED', bannedUntil = ?, banReason = ?, bannedBy = ?, bannedAt = ?
      WHERE id = ?
    `).run(bannedUntil, reason || '', actingAdminId, now.toISOString(), targetUserId);
    return this.getUserById(targetUserId)!;
  }

  public restoreUserAccess(targetUserId: string): User {
    if (this.isProtectedSuperAdmin(targetUserId)) {
      throw new Error('Primary Super Admin account cannot be modified.');
    }
    const target = this.getUserById(targetUserId);
    if (!target) throw new Error('User not found.');
    this.sqliteDb.prepare(`
      UPDATE users
      SET accountStatus = 'ACTIVE', bannedUntil = NULL, banReason = NULL, bannedBy = NULL, bannedAt = NULL
      WHERE id = ?
    `).run(targetUserId);
    return this.getUserById(targetUserId)!;
  }

  public permBanUser(targetUserId: string, actingAdminId: string, reason?: string): User {
    if (this.isProtectedSuperAdmin(targetUserId)) {
      throw new Error('Primary Super Admin account cannot be modified, banned, or deleted.');
    }
    const target = this.getUserById(targetUserId);
    if (!target) throw new Error('User not found.');
    const now = new Date().toISOString();
    this.sqliteDb.prepare(`
      UPDATE users
      SET accountStatus = 'PERMANENTLY_BANNED', bannedUntil = NULL, banReason = ?, bannedBy = ?, bannedAt = ?
      WHERE id = ?
    `).run(reason || '', actingAdminId, now, targetUserId);
    return this.getUserById(targetUserId)!;
  }

  public deleteUserTombstone(targetUserId: string, actingAdminId: string): { success: boolean; message: string } {
    if (this.isProtectedSuperAdmin(targetUserId)) {
      throw new Error('Primary Super Admin account cannot be modified, banned, or deleted.');
    }
    const target = this.getUserById(targetUserId);
    if (!target) throw new Error('User not found.');
    const now = new Date().toISOString();
    this.sqliteDb.prepare(`
      UPDATE users
      SET accountStatus = 'DELETED', deletedAt = ?, deletedBy = ?, bannedUntil = NULL, banReason = 'Account Deleted'
      WHERE id = ?
    `).run(now, actingAdminId, targetUserId);
    return { success: true, message: 'User account marked as deleted' };
  }

  public grantAdminCredits(
    targetUserId: string,
    actingAdminId: string,
    amount: number,
    creditType: 'FREE' | 'PURCHASED' | 'PREMIUM',
    reason?: string
  ): DeepAICreditBalance {
    const user = this.getUserById(targetUserId);
    if (!user) throw new Error('Target user not found');
    if (!Number.isInteger(amount) || amount <= 0 || amount > 10000) {
      throw new Error('Amount must be a positive integer <= 10000');
    }
    if (!['FREE', 'PURCHASED', 'PREMIUM'].includes(creditType)) {
      throw new Error('Invalid credit type');
    }

    const now = new Date().toISOString();
    const desc = `Admin grant by ${actingAdminId}${reason ? `: ${reason}` : ''}`;
    this.sqliteDb.prepare(`
      INSERT INTO deep_ai_credit_ledger (
        userId, amount, source, transactionType, description, createdAt
      ) VALUES (?, ?, ?, 'ADMIN_GRANT', ?, ?)
    `).run(targetUserId, amount, creditType, desc, now);

    return this.getDeepAICreditBalance(targetUserId);
  }

  public recalculateUserStats(userId: string): User | undefined {
    const user = this.getUserById(userId);
    if (!user) return undefined;

    const userAttempts = this.sqliteDb.prepare("SELECT * FROM test_attempts WHERE userId = ? AND mode = 'exam'").all(userId) as any[];
    const totalTests = userAttempts.length;
    const totalPoints = userAttempts.reduce((sum, a) => sum + a.scorePoints, 0);
    const totalCorrect = userAttempts.reduce((sum, a) => sum + a.correctCount, 0);
    const totalIncorrect = userAttempts.reduce((sum, a) => sum + a.incorrectCount, 0);
    const totalTime = userAttempts.reduce((sum, a) => sum + a.timeTakenSeconds, 0);
    const totalAttemptedQuestions = userAttempts.reduce((sum, a) => sum + a.attemptedQuestions, 0);

    const totalQuestionsSum = totalCorrect + totalIncorrect;
    const averageAccuracy = totalQuestionsSum > 0 ? Number(((totalCorrect / totalQuestionsSum) * 100).toFixed(1)) : 0;
    const averageSpeed = totalAttemptedQuestions > 0 ? Math.round(totalTime / totalAttemptedQuestions) : 0;

    user.totalPoints = totalPoints;
    user.totalTestsAttempted = totalTests;
    user.totalCorrect = totalCorrect;
    user.totalIncorrect = totalIncorrect;
    user.averageAccuracy = averageAccuracy;
    user.averageTimePerQuestionSeconds = averageSpeed;

    this.sqliteDb.prepare(`
      UPDATE users SET
        totalPoints = ?,
        totalTestsAttempted = ?,
        totalCorrect = ?,
        totalIncorrect = ?,
        averageAccuracy = ?,
        averageTimePerQuestionSeconds = ?
      WHERE id = ?
    `).run(
      user.totalPoints,
      user.totalTestsAttempted,
      user.totalCorrect,
      user.totalIncorrect,
      user.averageAccuracy,
      user.averageTimePerQuestionSeconds,
      userId
    );
    return user;
  }

  // --- Company Operations ---
  public getCompanies(): CompanyInfo[] {
    const rows = this.sqliteDb.prepare('SELECT * FROM companies').all() as any[];
    return rows.map((c) => ({
      ...c,
      rounds: JSON.parse(c.rounds || '[]'),
    }));
  }

  // --- Test Series Operations ---
  public getTests(filters?: {
    category?: string;
    companyId?: string;
    difficulty?: string;
    search?: string;
  }, includeTest = false): TestSeries[] {
    let query = 'SELECT * FROM tests WHERE 1=1';
    const params: any[] = [];

    if (!includeTest) {
      query += ' AND (is_test = 0 OR is_test IS NULL)';
    }

    if (filters?.category && filters.category !== 'All') {
      query += ' AND category = ?';
      params.push(filters.category);
    }
    if (filters?.companyId && filters.companyId !== 'all') {
      query += ' AND companyId = ?';
      params.push(filters.companyId);
    }
    if (filters?.difficulty && filters.difficulty !== 'All') {
      query += ' AND difficulty = ?';
      params.push(filters.difficulty);
    }
    if (filters?.search) {
      query += ' AND (LOWER(title) LIKE ? OR LOWER(description) LIKE ? OR LOWER(tags) LIKE ?)';
      const s = `%${filters.search.toLowerCase()}%`;
      params.push(s, s, s);
    }

    const rows = this.sqliteDb.prepare(query).all(params) as any[];
    return rows.map((t) => {
      const questionsCount = (this.sqliteDb.prepare('SELECT COUNT(*) as count FROM questions WHERE testSeriesId = ?').get(t.id) as any).count;
      return {
        ...t,
        roles: JSON.parse(t.roles || '[]'),
        supportedRoles: JSON.parse(t.supportedRoles || '[]'),
        skills: JSON.parse(t.skills || '[]'),
        topics: JSON.parse(t.topics || '[]'),
        tags: JSON.parse(t.tags || '[]'),
        isMegaEvent: !!t.isMegaEvent,
        totalQuestions: questionsCount || t.totalQuestions,
        status: t.status === null ? undefined : t.status,
        accessType: (t.accessType as any) || 'FREE',
      };
    });
  }

  public getCatalogueTests(includeTest = false): TestSeries[] {
    const query = includeTest
      ? "SELECT * FROM tests WHERE id LIKE 'cat_%'"
      : "SELECT * FROM tests WHERE id LIKE 'cat_%' AND (is_test = 0 OR is_test IS NULL)";
    const rows = this.sqliteDb.prepare(query).all() as any[];
    const mapped = rows.map((t) => {
      const questionsCount = (this.sqliteDb.prepare('SELECT COUNT(*) as count FROM questions WHERE testSeriesId = ?').get(t.id) as any).count;
      return {
        ...t,
        roles: JSON.parse(t.roles || '[]'),
        supportedRoles: JSON.parse(t.supportedRoles || '[]'),
        skills: JSON.parse(t.skills || '[]'),
        topics: JSON.parse(t.topics || '[]'),
        tags: JSON.parse(t.tags || '[]'),
        isMegaEvent: !!t.isMegaEvent,
        totalQuestions: questionsCount || t.totalQuestions,
        status: t.status === null ? undefined : t.status,
        accessType: (t.accessType as any) || 'FREE',
      };
    });

    return mapped.sort((a, b) => {
      const order: Record<string, number> = { foundation: 0, company: 1, coding: 2 };
      const ao = order[a.category as string] ?? 99;
      const bo = order[b.category as string] ?? 99;
      if (ao !== bo) return ao - bo;
      return a.id.localeCompare(b.id);
    });
  }

  public getTestById(id: string, includeQuestions = true): (TestSeries & { questions?: Question[] }) | undefined {
    const t = this.sqliteDb.prepare('SELECT * FROM tests WHERE id = ?').get(id) as any;
    if (!t) return undefined;

    const questions = includeQuestions ? this.getQuestionsForTest(id) : undefined;
    const questionsCount = includeQuestions ? questions!.length : (this.sqliteDb.prepare('SELECT COUNT(*) as count FROM questions WHERE testSeriesId = ?').get(t.id) as any).count;

    return {
      ...t,
      roles: JSON.parse(t.roles || '[]'),
      supportedRoles: JSON.parse(t.supportedRoles || '[]'),
      skills: JSON.parse(t.skills || '[]'),
      topics: JSON.parse(t.topics || '[]'),
      tags: JSON.parse(t.tags || '[]'),
      isMegaEvent: !!t.isMegaEvent,
      totalQuestions: questionsCount || t.totalQuestions,
      status: t.status === null ? undefined : t.status,
      accessType: (t.accessType as any) || 'FREE',
      ...(includeQuestions && { questions }),
    };
  }

  public getQuestionsForTest(testId: string): Question[] {
    if (testId === 'cat_foundation_quant') {
      return quantQuestions.map((cq: any) => this.mapCanonicalToQuestion(testId, cq));
    }

    if (testId === 'cat_foundation_logical') {
      return logicalQuestions.map((cq: any) => this.mapCanonicalToQuestion(testId, cq));
    }

    if (testId === 'cat_foundation_verbal') {
      return verbalQuestions.map((cq: any) => this.mapCanonicalToQuestion(testId, cq));
    }

    if (testId === 'cat_foundation_di') {
      return diQuestions.map((cq: any) => {
        const matchingStim = diStimuli.find(s => s.id === cq.stimulusId);
        return this.mapCanonicalToQuestion(testId, { ...cq, stimulus: matchingStim });
      });
    }

    if (testId === 'cat_foundation_pseudocode') {
      return pseudocodeQuestions.map((cq: any) => this.mapCanonicalToQuestion(testId, cq));
    }

    if (testId === 'cat_coding_dsa') {
      return dsaQuestions.map((cq: any) => this.mapCanonicalToQuestion(testId, cq));
    }

    if (testId === 'cat_coding_sql') {
      return sqlQuestions.map((cq: any) => this.mapCanonicalToQuestion(testId, cq));
    }

    if (testId === 'cat_coding_prog_fundamentals') {
      return progFundamentalsQuestions.map((cq: any) => this.mapCanonicalToQuestion(testId, cq));
    }

    if (testId === 'cat_coding_output_debug') {
      return codingOutputQuestions.map((cq: any) => this.mapCanonicalToQuestion(testId, cq));
    }

    if (testId === 'cat_coding_core_cs') {
      return coreCsQuestions.map((cq: any) => this.mapCanonicalToQuestion(testId, cq));
    }

    if (testId === 'cat_company_wipro') {
      const wiproBp = COMPANY_BLUEPRINTS.find((b) => b.id === 'bp_company_wipro_elite_nth');
      if (wiproBp) {
        const fullBank = [
          ...quantQuestions,
          ...logicalQuestions,
          ...verbalQuestions,
          ...diQuestions,
          ...pseudocodeQuestions,
          ...accentureQuestions,
          ...cognizantQuestions,
          ...infosysQuestions,
          ...tcsAdvancedQuestions,
          ...tcsCodingProblems,
          ...wiproQuestions,
        ];
        const assembly = questionSelectionEngine.selectCompanyAssessmentQuestions({
          userId: 'usr_catalogue_default',
          blueprint: wiproBp,
          questionBank: fullBank,
          previouslyAttemptedQuestionIds: [],
          allowPartialReuseWhenExhausted: true,
        });
        const selected = assembly.sectionResults.flatMap((sr) => sr.selectedQuestions);
        return selected.map((cq: any) => this.mapCanonicalToQuestion(testId, cq));
      }
    }

    if (testId === 'cat_company_accenture') {
      const accBp = COMPANY_BLUEPRINTS.find((b) => b.id === 'bp_company_accenture_cognitive');
      if (accBp) {
        const fullBank = [
          ...quantQuestions,
          ...logicalQuestions,
          ...verbalQuestions,
          ...diQuestions,
          ...pseudocodeQuestions,
          ...accentureQuestions,
          ...cognizantQuestions,
          ...infosysQuestions,
          ...tcsAdvancedQuestions,
          ...tcsCodingProblems,
          ...wiproQuestions,
        ];
        const assembly = questionSelectionEngine.selectCompanyAssessmentQuestions({
          userId: 'usr_catalogue_default',
          blueprint: accBp,
          questionBank: fullBank,
          previouslyAttemptedQuestionIds: [],
          allowPartialReuseWhenExhausted: true,
        });
        const selected = assembly.sectionResults.flatMap((sr) => sr.selectedQuestions);
        return selected.map((cq: any) => this.mapCanonicalToQuestion(testId, cq));
      }
    }

    if (testId === 'cat_company_cognizant') {
      const cogBp = COMPANY_BLUEPRINTS.find((b) => b.id === 'bp_company_cognizant_genc');
      if (cogBp) {
        const fullBank = [
          ...quantQuestions,
          ...logicalQuestions,
          ...verbalQuestions,
          ...diQuestions,
          ...pseudocodeQuestions,
          ...accentureQuestions,
          ...cognizantQuestions,
          ...infosysQuestions,
          ...tcsAdvancedQuestions,
          ...tcsCodingProblems,
          ...wiproQuestions,
        ];
        const assembly = questionSelectionEngine.selectCompanyAssessmentQuestions({
          userId: 'usr_catalogue_default',
          blueprint: cogBp,
          questionBank: fullBank,
          previouslyAttemptedQuestionIds: [],
          allowPartialReuseWhenExhausted: true,
        });
        const selected = assembly.sectionResults.flatMap((sr) => sr.selectedQuestions);
        return selected.map((cq: any) => this.mapCanonicalToQuestion(testId, cq));
      }
    }

    if (testId === 'cat_company_infosys') {
      const infBp = COMPANY_BLUEPRINTS.find((b) => b.id === 'bp_company_infosys_assessment');
      if (infBp) {
        const fullBank = [
          ...quantQuestions,
          ...logicalQuestions,
          ...verbalQuestions,
          ...diQuestions,
          ...pseudocodeQuestions,
          ...accentureQuestions,
          ...cognizantQuestions,
          ...infosysQuestions,
          ...tcsAdvancedQuestions,
          ...tcsCodingProblems,
          ...wiproQuestions,
        ];
        const assembly = questionSelectionEngine.selectCompanyAssessmentQuestions({
          userId: 'usr_catalogue_default',
          blueprint: infBp,
          questionBank: fullBank,
          previouslyAttemptedQuestionIds: [],
          allowPartialReuseWhenExhausted: true,
        });
        const selected = assembly.sectionResults.flatMap((sr) => sr.selectedQuestions);
        return selected.map((cq: any) => this.mapCanonicalToQuestion(testId, cq));
      }
    }

    if (testId === 'cat_company_tcs_foundation') {
      const tcsFndBp = COMPANY_BLUEPRINTS.find((b) => b.id === 'bp_company_tcs_nqt_foundation');
      if (tcsFndBp) {
        const fullBank = [
          ...quantQuestions,
          ...logicalQuestions,
          ...verbalQuestions,
          ...diQuestions,
          ...pseudocodeQuestions,
          ...accentureQuestions,
          ...cognizantQuestions,
          ...infosysQuestions,
          ...tcsAdvancedQuestions,
          ...tcsCodingProblems,
          ...wiproQuestions,
        ];
        const assembly = questionSelectionEngine.selectCompanyAssessmentQuestions({
          userId: 'usr_catalogue_default',
          blueprint: tcsFndBp,
          questionBank: fullBank,
          previouslyAttemptedQuestionIds: [],
          allowPartialReuseWhenExhausted: true,
        });
        const selected = assembly.sectionResults.flatMap((sr) => sr.selectedQuestions);
        return selected.map((cq: any) => this.mapCanonicalToQuestion(testId, cq));
      }
    }

    if (testId === 'cat_company_tcs') {
      const tcsBp = COMPANY_BLUEPRINTS.find((b) => b.id === 'bp_company_tcs_nqt_advanced');
      if (tcsBp) {
        const fullBank = [
          ...quantQuestions,
          ...logicalQuestions,
          ...verbalQuestions,
          ...diQuestions,
          ...pseudocodeQuestions,
          ...accentureQuestions,
          ...cognizantQuestions,
          ...infosysQuestions,
          ...tcsAdvancedQuestions,
          ...tcsCodingProblems,
          ...wiproQuestions,
        ];
        const assembly = questionSelectionEngine.selectCompanyAssessmentQuestions({
          userId: 'usr_catalogue_default',
          blueprint: tcsBp,
          questionBank: fullBank,
          previouslyAttemptedQuestionIds: [],
          allowPartialReuseWhenExhausted: true,
        });
        const selected = assembly.sectionResults.flatMap((sr) => sr.selectedQuestions);
        return selected.map((cq: any) => this.mapCanonicalToQuestion(testId, cq));
      }
    }

    if (testId === 'cat_coding_mock_01') {
      return codingMockQuestions.map((cq: any) => this.mapCanonicalToQuestion(testId, cq));
    }

    // 1. Check junction table assessment_questions for linked questions (Admin-created assessments)
    const linkedRows = this.sqliteDb.prepare(`
      SELECT q.*, aq.sectionName, aq.orderIndex
      FROM assessment_questions aq
      JOIN questions q ON aq.questionId = q.id
      WHERE aq.testSeriesId = ?
      ORDER BY aq.orderIndex ASC
    `).all(testId) as any[];

    if (linkedRows.length > 0) {
      return linkedRows.map((q) => ({
        ...q,
        testSeriesId: testId,
        options: typeof q.options === 'string' ? JSON.parse(q.options || '[]') : (q.options || []),
        stimulus: q.stimulus ? (typeof q.stimulus === 'string' ? JSON.parse(q.stimulus) : q.stimulus) : undefined,
      }));
    }

    // 2. Direct questions attached via questions.testSeriesId
    const rows = this.sqliteDb.prepare('SELECT * FROM questions WHERE testSeriesId = ?').all(testId) as any[];
    const directQuestions = rows.map((q) => ({
      ...q,
      options: typeof q.options === 'string' ? JSON.parse(q.options || '[]') : (q.options || []),
      stimulus: q.stimulus ? (typeof q.stimulus === 'string' ? JSON.parse(q.stimulus) : q.stimulus) : undefined,
    }));
    
    if (directQuestions.length > 0) {
      return directQuestions;
    }

    const test = this.sqliteDb.prepare('SELECT * FROM tests WHERE id = ?').get(testId) as any;
    const allRows = this.sqliteDb.prepare('SELECT * FROM questions').all() as any[];
    const allQuestions = allRows.map((q) => ({
      ...q,
      options: JSON.parse(q.options || '[]'),
      stimulus: q.stimulus ? JSON.parse(q.stimulus) : undefined,
    }));

    const matched = allQuestions.filter((q) => {
      if (test?.companyId && (q.companyTag?.toLowerCase().includes(test.companyId) || q.testSeriesId.includes(test.companyId))) return true;
      if (test?.category === 'Quantitative' && (q.topic.includes('Time') || q.topic.includes('Number') || q.topic.includes('Profit') || q.topic.includes('Permutations'))) return true;
      if (test?.category === 'Logical' && (q.topic.includes('Syllogisms') || q.topic.includes('Puzzles') || q.topic.includes('Coding') || q.topic.includes('Critical') || q.topic.includes('Reasoning'))) return true;
      if (test?.category === 'Technical' && (q.topic.includes('Pseudocode') || q.topic.includes('Operating') || q.topic.includes('Data') || q.topic.includes('DBMS') || q.topic.includes('CS'))) return true;
      if (test?.category === 'Verbal' && (q.topic.includes('Verbal') || q.topic.includes('Grammar') || q.topic.includes('Vocabulary'))) return true;
      return false;
    });

    const pool = matched.length >= 6 ? matched : allQuestions;
    const synthesized = pool.slice(0, test?.totalQuestions || 8).map((q, idx) => ({
      ...q,
      id: `${testId}_q_${idx + 1}`,
      testSeriesId: testId,
    }));

    return synthesized;
  }

  

  // ==========================================
  // Test User History
  // ==========================================
  
  public getTestHistoryForUser(userId: string) {
    const stmt = this.sqliteDb.prepare(`
      SELECT * FROM test_user_history WHERE userId = ?
    `);
    return stmt.all(userId);
  }

  public upsertTestHistoryVisit(userId: string, testId: string) {
    const now = new Date().toISOString();
    const existing = this.sqliteDb.prepare(`SELECT * FROM test_user_history WHERE userId = ? AND testId = ?`).get(userId, testId) as any;
    
    if (existing) {
      if (existing.status === 'NOT_STARTED') {
        const stmt = this.sqliteDb.prepare(`
          UPDATE test_user_history 
          SET status = 'VISITED', lastVisitedAt = ?
          WHERE userId = ? AND testId = ?
        `);
        stmt.run(now, userId, testId);
      } else {
        const stmt = this.sqliteDb.prepare(`
          UPDATE test_user_history 
          SET lastVisitedAt = ?
          WHERE userId = ? AND testId = ?
        `);
        stmt.run(now, userId, testId);
      }
    } else {
      const stmt = this.sqliteDb.prepare(`
        INSERT INTO test_user_history 
        (userId, testId, status, firstVisitedAt, lastVisitedAt, attemptCount, bestScore, lastScore) 
        VALUES (?, ?, 'VISITED', ?, ?, 0, 0, 0)
      `);
      stmt.run(userId, testId, now, now);
    }
  }

  public upsertTestHistoryInProgress(userId: string, testId: string) {
    const now = new Date().toISOString();
    const existing = this.sqliteDb.prepare(`SELECT * FROM test_user_history WHERE userId = ? AND testId = ?`).get(userId, testId) as any;

    if (existing) {
      // Only upgrade to IN_PROGRESS from VISITED / NOT_STARTED. Never downgrade COMPLETED.
      if (existing.status !== 'COMPLETED') {
        this.sqliteDb.prepare(`
          UPDATE test_user_history
          SET status = 'IN_PROGRESS', lastVisitedAt = ?
          WHERE userId = ? AND testId = ?
        `).run(now, userId, testId);
      }
    } else {
      this.sqliteDb.prepare(`
        INSERT INTO test_user_history
        (userId, testId, status, firstVisitedAt, lastVisitedAt, attemptCount, bestScore, lastScore)
        VALUES (?, ?, 'IN_PROGRESS', ?, ?, 0, 0, 0)
      `).run(userId, testId, now, now);
    }
  }

  public upsertTestHistoryComplete(userId: string, testId: string, score: number) {
    const now = new Date().toISOString();
    const existing = this.sqliteDb.prepare(`SELECT * FROM test_user_history WHERE userId = ? AND testId = ?`).get(userId, testId) as any;
    
    if (existing) {
      const bestScore = Math.max(existing.bestScore || 0, score);
      const attemptCount = (existing.attemptCount || 0) + 1;
      const stmt = this.sqliteDb.prepare(`
        UPDATE test_user_history 
        SET status = 'COMPLETED', lastAttemptAt = ?, attemptCount = ?, bestScore = ?, lastScore = ?
        WHERE userId = ? AND testId = ?
      `);
      stmt.run(now, attemptCount, bestScore, score, userId, testId);
    } else {
      const stmt = this.sqliteDb.prepare(`
        INSERT INTO test_user_history 
        (userId, testId, status, firstVisitedAt, lastVisitedAt, lastAttemptAt, attemptCount, bestScore, lastScore) 
        VALUES (?, ?, 'COMPLETED', ?, ?, ?, 1, ?, ?)
      `);
      stmt.run(userId, testId, now, now, now, score, score);
    }
  }

  public getAllAttempts(): TestAttempt[] {
    const rows = this.sqliteDb.prepare('SELECT * FROM test_attempts').all() as any[];
    return rows.map((att) => {
      const responsesRows = this.sqliteDb.prepare('SELECT * FROM attempt_responses WHERE attemptId = ?').all(att.id) as any[];
      return {
        ...att,
        responses: responsesRows.map((r) => ({
          ...r,
          isCorrect: !!r.isCorrect,
          question: JSON.parse(r.question),
        })),
        topicBreakdown: JSON.parse(att.topicBreakdown),
        strengths: JSON.parse(att.strengths),
        weaknesses: JSON.parse(att.weaknesses),
        recommendations: JSON.parse(att.recommendations),
      };
    });
  }

  // --- Submission & Evaluation Engine ---
  public submitTest(data: {
    userId: string;
    testSeriesId: string;
    testInstanceId?: string;
    mode: TestMode;
    responses: QuestionResponse[];
    timeTakenSeconds: number;
  }): TestAttempt {
    let user = this.getUserById(data.userId);
    if (!user) {
      throw new Error('Unauthorized: Valid user session required to submit test attempt');
    }
    const test = this.getTestById(data.testSeriesId, false);
    const testQuestions = this.getQuestionsForTest(data.testSeriesId);

    const questionMap = new Map<string, Question>();
    testQuestions.forEach((q) => questionMap.set(q.id, q));

    const responseDetails: QuestionResponseDetail[] = [];
    let correctCount = 0;
    let incorrectCount = 0;
    let attemptedCount = 0;

    const topicStats: Record<string, { total: number; correct: number; accuracy: number }> = {};

    let rawScore = 0;

    testQuestions.forEach((question) => {
      const resp = data.responses.find((r) => r.questionId === question.id);
      let isCorrect = false;
      let selected: any = null;
      let isAttempted = false;
      let timeSpentSeconds = 0;
      let questionScore = 0;

      if (resp) {
        timeSpentSeconds = resp.timeSpentSeconds || 0;
      }

      if (question.questionType === 'CODING') {
        const submission = this.getLatestCodingSubmission(data.userId, question.id);
        if (submission) {
          isAttempted = true;
          selected = 'A';
          const scorePct = submission.executionResult.scorePercentage || 0;
          isCorrect = scorePct === 100;
          if (isCorrect) {
            correctCount++;
            questionScore = 10;
          } else if (scorePct > 0) {
            correctCount++;
            questionScore = Math.round((scorePct / 100) * 10);
          } else {
            incorrectCount++;
            questionScore = -2;
          }
        }
      } else {
        selected = resp?.selectedOption || null;
        isAttempted = selected !== null && selected !== undefined;
        isCorrect = isAttempted && selected === question.correctOption;
        if (isAttempted) {
          if (isCorrect) {
            correctCount++;
            questionScore = 10;
          } else {
            incorrectCount++;
            questionScore = -2;
          }
        }
      }

      if (isAttempted) {
        attemptedCount++;
        rawScore += questionScore;
      }

      const topic = question.topic || 'General Aptitude';
      if (!topicStats[topic]) {
        topicStats[topic] = { total: 0, correct: 0, accuracy: 0 };
      }
      topicStats[topic].total += 1;
      if (isCorrect) {
        topicStats[topic].correct += 1;
      }

      responseDetails.push({
        questionId: question.id,
        selectedOption: selected,
        timeSpentSeconds,
        isCorrect,
        correctOption: question.correctOption || 'A',
        question,
      });
    });

    const scorePoints = Math.max(0, rawScore);
    const totalQuestions = testQuestions.length;
    const unattemptedCount = totalQuestions - attemptedCount;
    const accuracyPercentage = attemptedCount > 0 ? Math.round((correctCount / attemptedCount) * 100) : 0;
    const avgTimePerQuestion = attemptedCount > 0 ? Math.round(data.timeTakenSeconds / attemptedCount) : 0;

    const strengths: string[] = [];
    const weaknesses: string[] = [];
    const recommendations: string[] = [];

    Object.entries(topicStats).forEach(([topic, stat]) => {
      stat.accuracy = stat.total > 0 ? Math.round((stat.correct / stat.total) * 100) : 0;
      if (stat.accuracy >= 80) {
        strengths.push(topic);
      } else if (stat.accuracy < 60) {
        weaknesses.push(topic);
      }
    });


    if (weaknesses.length > 0) {
      const topWeak = weaknesses.slice(0, 3).join(', ');
      recommendations.push(`Priority Focus: Practice shortcut derivations for ${topWeak} in your Revision Vault.`);
      if (accuracyPercentage >= 60) {
        recommendations.push('Great core foundation! Eliminating minor negative markings will easily push you into the 85th+ percentile.');
      } else {
        recommendations.push('Try Practice Mode on these topics first to review step-by-step solutions with no time pressure.');
      }
    } else {
      recommendations.push('Outstanding precision! Zero weak areas detected in this assessment.');
      recommendations.push('Maintain this speed and test consistency to guarantee top placement shortlist clearance.');
    }

    const attempt: TestAttempt = {
      id: `attempt_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`,
      userId: user.id,
      userName: user.name,
      userCollege: user.college,
      testSeriesId: data.testSeriesId,
      testInstanceId: data.testInstanceId || `instance_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      testTitle: test?.title || 'Placement Aptitude Test',
      companyName: test?.companyName,
      mode: data.mode,
      totalQuestions,
      attemptedQuestions: attemptedCount,
      correctCount,
      incorrectCount,
      unattemptedCount,
      scorePoints,
      accuracyPercentage,
      timeTakenSeconds: data.timeTakenSeconds,
      avgTimePerQuestionSeconds: avgTimePerQuestion,
      submittedAt: new Date().toISOString(),
      topicBreakdown: topicStats,
      strengths,
      weaknesses,
      recommendations,
      responses: responseDetails,
    };

    const integrityState = this.getAttemptIntegrityState(attempt.id, user.id, data.testInstanceId);
    attempt.integrityStatus = integrityState.integrityStatus;
    attempt.violationCount = integrityState.violationCount;
    attempt.terminatedAt = integrityState.terminatedAt;
    attempt.terminationReason = integrityState.terminationReason;

    if (integrityState.isTerminated) {
      attempt.integrityStatus = 'terminated';
      attempt.scorePoints = 0;
    }

    if (data.mode === 'exam') {
      this.sqliteDb.transaction(() => {
        this.sqliteDb.prepare(`
          INSERT INTO test_attempts (
            id, userId, userName, userCollege, testSeriesId, testInstanceId,
            testTitle, companyName, mode, totalQuestions, attemptedQuestions,
            correctCount, incorrectCount, unattemptedCount, scorePoints,
            accuracyPercentage, timeTakenSeconds, avgTimePerQuestionSeconds,
            submittedAt, topicBreakdown, strengths, weaknesses, recommendations,
            integrityStatus, violationCount, terminatedAt, terminationReason
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
          attempt.id,
          attempt.userId,
          attempt.userName,
          attempt.userCollege || '',
          attempt.testSeriesId,
          attempt.testInstanceId || '',
          attempt.testTitle,
          attempt.companyName || '',
          attempt.mode,
          attempt.totalQuestions,
          attempt.attemptedQuestions,
          attempt.correctCount,
          attempt.incorrectCount,
          attempt.unattemptedCount,
          attempt.scorePoints,
          attempt.accuracyPercentage,
          attempt.timeTakenSeconds,
          attempt.avgTimePerQuestionSeconds,
          attempt.submittedAt,
          JSON.stringify(attempt.topicBreakdown),
          JSON.stringify(attempt.strengths),
          JSON.stringify(attempt.weaknesses),
          JSON.stringify(attempt.recommendations),
          attempt.integrityStatus || 'clean',
          attempt.violationCount || 0,
          attempt.terminatedAt || null,
          attempt.terminationReason || null
        );

        const insertResponse = this.sqliteDb.prepare(`
          INSERT INTO attempt_responses (
            attemptId, questionId, selectedOption, timeSpentSeconds,
            isCorrect, correctOption, question
          ) VALUES (?, ?, ?, ?, ?, ?, ?)
        `);

        attempt.responses.forEach((resp) => {
          insertResponse.run(
            attempt.id,
            resp.questionId,
            resp.selectedOption,
            resp.timeSpentSeconds,
            resp.isCorrect ? 1 : 0,
            resp.correctOption,
            JSON.stringify(resp.question)
          );
        });

        if (test) {
          this.sqliteDb.prepare(`
            UPDATE tests SET attemptsCount = COALESCE(attemptsCount, 0) + 1 WHERE id = ?
          `).run(test.id);
        }
      })();

      this.recalculateUserStats(user.id);
      this.upsertTestHistoryComplete(user.id, data.testSeriesId, attempt.scorePoints);

      // LEADERBOARD 2.0 Engine (Phase 4.3): Active Weekly Season & Cohort Assignment (EXAM MODE ONLY)
      const isExamMode = (attempt.mode || '').toLowerCase() === 'exam';
      if (isExamMode) {
        const activeSeason = this.getOrCreateActiveSeason();
        const standing = this.assignUserToCohort(user.id, activeSeason.id);

        if (attempt.scorePoints > 0) {
          this.sqliteDb.prepare(`
            UPDATE weekly_standings
            SET weeklyXp = weeklyXp + ?
            WHERE userId = ? AND seasonId = ?
          `).run(attempt.scorePoints, user.id, activeSeason.id);

          this.sqliteDb.prepare(`
            UPDATE users
            SET weeklyXp = (SELECT weeklyXp FROM weekly_standings WHERE userId = ? AND seasonId = ?)
            WHERE id = ?
          `).run(user.id, activeSeason.id, user.id);

          this.recalculateCohortStandings(activeSeason.id, standing.groupId);
        }
      }
    }

    return attempt;
  }

  public submitDirectAttempt(data: {
    userId: string;
    testSeriesId: string;
    mode: 'exam' | 'practice';
    scorePoints: number;
    accuracyPercentage: number;
    correctCount: number;
    incorrectCount: number;
    totalQuestions: number;
    timeTakenSeconds: number;
    topicBreakdown: Record<string, { total: number; correct: number; accuracy: number }>;
  }): TestAttempt {
    const user = this.getUserById(data.userId);
    if (!user) throw new Error('User not found');

    const test = this.getTestById(data.testSeriesId, false);
    const strengths: string[] = [];
    const weaknesses: string[] = [];
    const recommendations: string[] = [];

    Object.entries(data.topicBreakdown || {}).forEach(([topic, stat]) => {
      if (stat.accuracy >= 80) strengths.push(topic);
      else if (stat.accuracy < 60) weaknesses.push(topic);
    });

    const attempt: TestAttempt = {
      id: `attempt_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`,
      userId: user.id,
      userName: user.name,
      userCollege: user.college,
      testSeriesId: data.testSeriesId,
      testInstanceId: `instance_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      testTitle: test?.title || 'Placement Assessment',
      companyName: test?.companyName,
      mode: data.mode,
      totalQuestions: data.totalQuestions,
      attemptedQuestions: data.correctCount + data.incorrectCount,
      correctCount: data.correctCount,
      incorrectCount: data.incorrectCount,
      unattemptedCount: Math.max(0, data.totalQuestions - (data.correctCount + data.incorrectCount)),
      scorePoints: data.scorePoints,
      accuracyPercentage: data.accuracyPercentage,
      timeTakenSeconds: data.timeTakenSeconds,
      avgTimePerQuestionSeconds: Math.round(data.timeTakenSeconds / Math.max(1, data.correctCount + data.incorrectCount)),
      submittedAt: new Date().toISOString(),
      topicBreakdown: data.topicBreakdown,
      strengths,
      weaknesses,
      recommendations,
      responses: [],
    };

    if (data.mode === 'exam') {
      this.sqliteDb.transaction(() => {
        this.sqliteDb.prepare(`
          INSERT INTO test_attempts (
            id, userId, userName, userCollege, testSeriesId, testInstanceId,
            testTitle, companyName, mode, totalQuestions, attemptedQuestions,
            correctCount, incorrectCount, unattemptedCount, scorePoints,
            accuracyPercentage, timeTakenSeconds, avgTimePerQuestionSeconds,
            submittedAt, topicBreakdown, strengths, weaknesses, recommendations
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
          attempt.id,
          attempt.userId,
          attempt.userName,
          attempt.userCollege || '',
          attempt.testSeriesId,
          attempt.testInstanceId || '',
          attempt.testTitle,
          attempt.companyName || '',
          attempt.mode,
          attempt.totalQuestions,
          attempt.attemptedQuestions,
          attempt.correctCount,
          attempt.incorrectCount,
          attempt.unattemptedCount,
          attempt.scorePoints,
          attempt.accuracyPercentage,
          attempt.timeTakenSeconds,
          attempt.avgTimePerQuestionSeconds,
          attempt.submittedAt,
          JSON.stringify(attempt.topicBreakdown),
          JSON.stringify(attempt.strengths),
          JSON.stringify(attempt.weaknesses),
          JSON.stringify(attempt.recommendations)
        );
      })();

      this.recalculateUserStats(user.id);
      this.upsertTestHistoryComplete(user.id, data.testSeriesId, attempt.scorePoints);
    }


    return attempt;
  }

  public getAttemptsForUser(userId: string): TestAttempt[] {
    const rows = this.sqliteDb.prepare('SELECT * FROM test_attempts WHERE userId = ? ORDER BY submittedAt DESC').all(userId) as any[];
    return rows.map((att) => {
      const responsesRows = this.sqliteDb.prepare('SELECT * FROM attempt_responses WHERE attemptId = ?').all(att.id) as any[];
      return {
        ...att,
        responses: responsesRows.map((r) => ({
          ...r,
          isCorrect: !!r.isCorrect,
          question: safeJsonParse(r.question, {} as any),
        })),
        topicBreakdown: safeJsonParse(att.topicBreakdown, {}),
        strengths: safeJsonParse(att.strengths, []),
        weaknesses: safeJsonParse(att.weaknesses, []),
        recommendations: safeJsonParse(att.recommendations, []),
      };
    });
  }

  public getAttemptById(attemptId: string): TestAttempt | undefined {
    const att = this.sqliteDb.prepare('SELECT * FROM test_attempts WHERE id = ?').get(attemptId) as any;
    if (!att) return undefined;

    const responsesRows = this.sqliteDb.prepare('SELECT * FROM attempt_responses WHERE attemptId = ?').all(attemptId) as any[];
    return {
      ...att,
      responses: responsesRows.map((r) => ({
        ...r,
        isCorrect: !!r.isCorrect,
        question: safeJsonParse(r.question, {} as any),
      })),
      topicBreakdown: safeJsonParse(att.topicBreakdown, {}),
      strengths: safeJsonParse(att.strengths, []),
      weaknesses: safeJsonParse(att.weaknesses, []),
      recommendations: safeJsonParse(att.recommendations, []),
    };
  }

  public getAttemptIntegrityState(attemptId: string, userId: string, testInstanceId?: string) {
    const events = this.sqliteDb.prepare(`
      SELECT * FROM assessment_integrity_events
      WHERE userId = ? AND (attemptId = ? OR attemptId = ? OR (metadata LIKE ? AND ? != ''))
      ORDER BY id ASC
    `).all(userId, attemptId, testInstanceId || '', `%${testInstanceId || '___xyz___'}%`, testInstanceId || '') as any[];

    const violationCount = events.length;
    const isTerminated = violationCount >= 3;

    const existingAtt = this.sqliteDb.prepare(`
      SELECT * FROM test_attempts WHERE id = ? OR (testInstanceId = ? AND ? != '')
    `).get(attemptId, testInstanceId || '', testInstanceId || '') as any;

    let integrityStatus = existingAtt?.integrityStatus || (isTerminated ? 'terminated' : violationCount > 0 ? 'warning' : 'clean');
    if (isTerminated) integrityStatus = 'terminated';

    return {
      attemptId,
      userId,
      violationCount,
      maxViolations: 3,
      integrityStatus,
      isTerminated,
      terminatedAt: existingAtt?.terminatedAt || (isTerminated ? new Date().toISOString() : null),
      terminationReason: existingAtt?.terminationReason || (isTerminated ? 'Maximum integrity violations reached (3/3)' : null),
      events: events.map((e) => ({
        id: e.id,
        eventType: e.eventType,
        metadata: safeJsonParse(e.metadata, {}),
        createdAt: e.createdAt,
      })),
    };
  }

  public recordIntegrityEvent(params: {
    userId: string;
    testId: string;
    attemptId: string;
    mode: string;
    eventType: string;
    metadata?: any;
  }) {
    const { userId, testId, attemptId, mode, eventType, metadata } = params;
    const now = new Date().toISOString();
    const metadataStr = JSON.stringify(metadata || {});

    try {
      const userExists = this.sqliteDb.prepare('SELECT id FROM users WHERE id = ?').get(userId);
      if (!userExists) {
        this.sqliteDb.prepare(`
          INSERT INTO users (id, email, name, role, is_test, createdAt)
          VALUES (?, ?, ?, 'student', 1, ?)
        `).run(userId, `${userId}@auto.test`, userId, now);
      }
    } catch (e) {}

    // 1000ms sliding window deduplication per user/attempt
    const lastEvent = this.sqliteDb.prepare(`
      SELECT createdAt FROM assessment_integrity_events
      WHERE userId = ? AND attemptId = ?
      ORDER BY id DESC LIMIT 1
    `).get(userId, attemptId) as any;

    if (lastEvent && lastEvent.createdAt) {
      const lastTime = new Date(lastEvent.createdAt).getTime();
      const nowTime = new Date(now).getTime();
      if (nowTime - lastTime < 1000) {
        const currentState = this.getAttemptIntegrityState(attemptId, userId);
        return {
          success: true,
          deduplicated: true,
          violationCount: currentState.violationCount,
          maxViolations: 3,
          terminated: currentState.isTerminated,
          integrityStatus: currentState.integrityStatus,
        };
      }
    }

    this.sqliteDb.prepare(`
      INSERT INTO assessment_integrity_events (userId, testId, attemptId, mode, eventType, eventCount, metadata, createdAt)
      VALUES (?, ?, ?, ?, ?, 1, ?, ?)
    `).run(userId, testId, attemptId, mode, eventType, metadataStr, now);

    const updatedState = this.getAttemptIntegrityState(attemptId, userId);

    // If a test_attempts record exists, update its status
    this.sqliteDb.prepare(`
      UPDATE test_attempts
      SET violationCount = ?, integrityStatus = ?, terminatedAt = ?, terminationReason = ?
      WHERE id = ? OR testInstanceId = ?
    `).run(
      updatedState.violationCount,
      updatedState.integrityStatus,
      updatedState.terminatedAt,
      updatedState.terminationReason,
      attemptId,
      attemptId
    );

    return {
      success: true,
      deduplicated: false,
      violationCount: updatedState.violationCount,
      maxViolations: 3,
      terminated: updatedState.isTerminated,
      integrityStatus: updatedState.integrityStatus,
    };
  }

  // --- Bookmarks ---
  public toggleBookmark(userId: string, questionId: string): { bookmarked: boolean } {
    const existing = this.sqliteDb.prepare('SELECT id FROM bookmarks WHERE userId = ? AND questionId = ?').get(userId, questionId) as any;
    if (existing) {
      this.sqliteDb.prepare('DELETE FROM bookmarks WHERE userId = ? AND questionId = ?').run(userId, questionId);
      return { bookmarked: false };
    } else {
      const qRow = this.sqliteDb.prepare('SELECT * FROM questions WHERE id = ?').get(questionId) as any;
      let question: Question;
      if (qRow) {
        question = {
          ...qRow,
          options: JSON.parse(qRow.options || '[]'),
          stimulus: qRow.stimulus ? JSON.parse(qRow.stimulus) : undefined,
        };
      } else {
        const fullBank = [
          ...quantQuestions,
          ...logicalQuestions,
          ...verbalQuestions,
          ...diQuestions,
          ...pseudocodeQuestions,
          ...accentureQuestions,
          ...cognizantQuestions,
          ...infosysQuestions,
          ...tcsAdvancedQuestions,
          ...tcsCodingProblems,
          ...wiproQuestions,
        ];
        const found = fullBank.find((q) => q.id === questionId);
        if (!found) {
          const err: any = new Error('Question not found');
          err.status = 404;
          throw err;
        }
        question = {
          id: found.id,
          testSeriesId: found.testSeriesId || 'unknown',
          questionText: found.questionText,
          options: found.options,
          correctOption: (found as any).correctAnswer || found.correctOption,
          topic: found.topic,
          difficulty: found.difficulty,
          explanation: found.explanation,
        };
      }
      this.sqliteDb.prepare(`
        INSERT INTO bookmarks (id, userId, questionId, question, addedAt)
        VALUES (?, ?, ?, ?, ?)
      `).run(
        `bm_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`,
        userId,
        questionId,
        JSON.stringify(question),
        new Date().toISOString()
      );
      return { bookmarked: true };
    }
  }

  public getBookmarksForUser(userId: string): BookmarkedItem[] {
    const rows = this.sqliteDb.prepare('SELECT * FROM bookmarks WHERE userId = ? ORDER BY addedAt DESC').all(userId) as any[];
    return rows.map((b) => ({
      ...b,
      question: safeJsonParse(b.question, {} as any),
    }));
  }

  // --- Cached Question AI Hints ---
  public getQuestionAiHint(questionId: string): string | null {
    try {
      const row = this.sqliteDb.prepare('SELECT cachedAiHint FROM questions WHERE id = ?').get(questionId) as any;
      if (row && row.cachedAiHint && typeof row.cachedAiHint === 'string' && row.cachedAiHint.trim().length > 0) {
        const hint = row.cachedAiHint.trim();
        const isGeneric = /focus on the core concept|identify the core concept|identify the key concept|identify the core formula|think carefully|consider the underlying principle|focus on the underlying|governing .* before evaluating|before comparing options|before evaluating the choices/i.test(hint);
        if (!isGeneric && hint.length >= 20) {
          return hint;
        }
        // Invalidate generic hint in DB so fresh AI hint is generated
        try {
          this.sqliteDb.prepare('UPDATE questions SET cachedAiHint = NULL WHERE id = ?').run(questionId);
        } catch (e) {}
      }
    } catch (e) {}
    return null;
  }


  public saveQuestionAiHint(questionId: string, hint: string): void {
    try {
      const res = this.sqliteDb.prepare('UPDATE questions SET cachedAiHint = ? WHERE id = ?').run(hint, questionId);
      if (res.changes === 0) {
        this.sqliteDb.prepare(`
          INSERT INTO questions (id, questionText, options, topic, subTopic, difficulty, cachedAiHint)
          VALUES (?, '', '[]', '', '', 'Medium', ?)
        `).run(questionId, hint);
      }
    } catch (e) {
      console.error('[DB] Failed to save question AI hint:', e);
    }
  }




  public getQuestionById(id: string): Question | undefined {
    try {
      const qRow = this.sqliteDb.prepare('SELECT * FROM questions WHERE id = ?').get(id) as any;
      if (qRow) {
        return {
          ...qRow,
          options: safeJsonParse(qRow.options, []),
          stimulus: qRow.stimulus ? safeJsonParse(qRow.stimulus, null) : undefined,
        };
      }
    } catch (e) {}

    const fullBank = [
      ...quantQuestions,
      ...logicalQuestions,
      ...verbalQuestions,
      ...diQuestions,
      ...pseudocodeQuestions,
      ...accentureQuestions,
      ...cognizantQuestions,
      ...infosysQuestions,
      ...tcsAdvancedQuestions,
      ...tcsCodingProblems,
      ...wiproQuestions,
    ];
    return fullBank.find((q) => q.id === id);
  }

  // --- Revision Vault (Weak Questions) ---
  public getWeakQuestionsForUser(userId: string): WeakQuestionItem[] {
    const userAttempts = this.sqliteDb.prepare('SELECT id, submittedAt FROM test_attempts WHERE userId = ?').all(userId) as any[];
    const failedMap = new Map<string, { question: Question; count: number; lastDate: string; lastAns: string }>();

    userAttempts.forEach((att) => {
      const responses = this.sqliteDb.prepare('SELECT * FROM attempt_responses WHERE attemptId = ?').all(att.id) as any[];
      responses.forEach((resp) => {
        if (!resp.isCorrect && resp.selectedOption) {
          const prev = failedMap.get(resp.questionId);
          if (prev) {
            prev.count += 1;
          } else {
            failedMap.set(resp.questionId, {
              question: safeJsonParse(resp.question, {} as any),
              count: 1,
              lastDate: att.submittedAt,
              lastAns: resp.selectedOption,
            });
          }
        }
      });
    });

    return Array.from(failedMap.values()).map((item) => ({
      question: item.question,
      timesFailed: item.count,
      lastAttemptedAt: item.lastDate,
      lastUserAnswer: item.lastAns,
    }));
  }

  // --- Mega Events ---
  public getMegaEvents(): MegaEvent[] {
    const rows = this.sqliteDb.prepare('SELECT * FROM mega_events').all() as any[];
    return rows.map((m) => ({
      ...m,
      status: m.status as any,
    }));
  }

  public getMegaEventById(id: string): MegaEvent | undefined {
    const m = this.sqliteDb.prepare('SELECT * FROM mega_events WHERE id = ?').get(id) as any;
    if (!m) return undefined;
    return {
      ...m,
      status: m.status as any,
    };
  }

  // --- Leaderboard ---
  public getLeaderboard(filter?: { category?: string; company?: string }): LeaderboardEntry[] {
    const allUsers = this.getAllUsers();
    const sorted = allUsers.sort((a, b) => {
      if (b.totalPoints !== a.totalPoints) return b.totalPoints - a.totalPoints;
      if (b.averageAccuracy !== a.averageAccuracy) return b.averageAccuracy - a.averageAccuracy;
      return a.averageTimePerQuestionSeconds - b.averageTimePerQuestionSeconds;
    });

    return sorted.map((u, index) => {
      let badge = undefined;
      if (index === 0) badge = '👑 All-India Rank 1';
      else if (index === 1) badge = '🥈 Rank 2 Master';
      else if (index === 2) badge = '🥉 Rank 3 Champ';
      else if (index < 10) badge = '⭐ Top 10 Elite';

      return {
        rank: index + 1,
        userId: u.id,
        userName: u.name,
        userCollege: u.college || '',
        targetCompany: u.targetCompany,
        totalPoints: u.totalPoints,
        averageAccuracy: u.averageAccuracy,
        totalTestsAttempted: u.totalTestsAttempted,
        avgSpeedSeconds: u.averageTimePerQuestionSeconds || 45,
        badge,
      };
    });
  }

  // ==========================================
  // LEADERBOARD 2.0 — PHASE 1 CORE ENGINE
  // ==========================================

  public getOrCreateActiveSeason(): { id: string; status: string; startTime: string; endTime: string } {
    const now = new Date();
    const nowMs = now.getTime();

    // Calculate current UTC week Monday 00:00:00.000 -> next Monday 00:00:00.000
    const startOfWeek = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
    const day = startOfWeek.getUTCDay();
    const diff = day === 0 ? -6 : 1 - day;
    startOfWeek.setUTCDate(startOfWeek.getUTCDate() + diff);
    startOfWeek.setUTCHours(0, 0, 0, 0);

    const endOfWeek = new Date(startOfWeek.getTime() + 7 * 86400 * 1000);

    // Audit existing ACTIVE seasons in database and finalize any expired/corrupted seasons
    const activeRows = this.sqliteDb.prepare("SELECT * FROM weekly_seasons WHERE status = 'ACTIVE' ORDER BY startTime DESC").all() as any[];

    for (const row of activeRows) {
      const startMs = new Date(row.startTime).getTime();
      const endMs = new Date(row.endTime).getTime();
      const durationMs = endMs - startMs;

      // Valid active season: now is within [startMs, endMs] and duration is <= 7.1 days and remaining time is <= 7.1 days
      if (startMs <= nowMs && nowMs < endMs && durationMs <= 7.1 * 86400 * 1000 && (endMs - nowMs) <= 7.1 * 86400 * 1000) {
        return row;
      }

      // Finalize expired or corrupted/future active seasons
      this.sqliteDb.prepare("UPDATE weekly_seasons SET status = 'FINALIZED' WHERE id = ?").run(row.id);
    }

    const startYear = startOfWeek.getUTCFullYear();
    const dayOfYear = Math.floor((startOfWeek.getTime() - new Date(Date.UTC(startYear, 0, 1)).getTime()) / 86400000);
    const weekNumber = Math.ceil((dayOfYear + 1) / 7);
    const seasonId = `season_${startYear}_w${weekNumber.toString().padStart(2, '0')}`;

    const existingTarget = this.sqliteDb.prepare("SELECT * FROM weekly_seasons WHERE id = ?").get(seasonId) as any;
    if (existingTarget) {
      this.sqliteDb.prepare("UPDATE weekly_seasons SET status = 'ACTIVE', startTime = ?, endTime = ? WHERE id = ?")
        .run(startOfWeek.toISOString(), endOfWeek.toISOString(), seasonId);
      return {
        id: seasonId,
        status: 'ACTIVE',
        startTime: startOfWeek.toISOString(),
        endTime: endOfWeek.toISOString(),
      };
    }

    const season = {
      id: seasonId,
      status: 'ACTIVE',
      startTime: startOfWeek.toISOString(),
      endTime: endOfWeek.toISOString(),
    };

    this.sqliteDb.prepare(`
      INSERT OR REPLACE INTO weekly_seasons (id, status, startTime, endTime)
      VALUES (?, ?, ?, ?)
    `).run(season.id, season.status, season.startTime, season.endTime);

    return season;
  }

  public assignUserToCohort(userId: string, seasonId: string): { userId: string; seasonId: string; groupId: string; league: string; weeklyXp: number; rank: number | null; movement: string } {
    const existing = this.sqliteDb.prepare('SELECT * FROM weekly_standings WHERE userId = ? AND seasonId = ?').get(userId, seasonId) as any;
    if (existing) {
      return existing;
    }

    const user = this.getUserById(userId);
    const league = user?.currentLeague || 'Bronze';

    let assignedStanding: any = null;

    this.sqliteDb.transaction(() => {
      const doubleCheck = this.sqliteDb.prepare('SELECT * FROM weekly_standings WHERE userId = ? AND seasonId = ?').get(userId, seasonId) as any;
      if (doubleCheck) {
        assignedStanding = doubleCheck;
        return;
      }

      // Find open group with < 40 members
      const openGroup = this.sqliteDb.prepare(`
        SELECT groupId, COUNT(*) as count
        FROM weekly_standings
        WHERE seasonId = ? AND league = ?
        GROUP BY groupId
        HAVING count < 40
        ORDER BY groupId ASC
        LIMIT 1
      `).get(seasonId, league) as any;

      let groupId = '';
      if (openGroup) {
        groupId = openGroup.groupId;
      } else {
        const groupCountRow = this.sqliteDb.prepare(`
          SELECT COUNT(DISTINCT groupId) as count
          FROM weekly_standings
          WHERE seasonId = ? AND league = ?
        `).get(seasonId, league) as any;
        const groupCount = groupCountRow?.count || 0;
        const leagueSlug = league.toLowerCase().replace(/\s+/g, '_');
        groupId = `${seasonId}_${leagueSlug}_group_${groupCount + 1}`;
      }

      this.sqliteDb.prepare(`
        INSERT INTO weekly_standings (userId, seasonId, groupId, league, weeklyXp, rank, movement)
        VALUES (?, ?, ?, ?, 0, NULL, 'STAY')
      `).run(userId, seasonId, groupId, league);

      assignedStanding = {
        userId,
        seasonId,
        groupId,
        league,
        weeklyXp: 0,
        rank: null,
        movement: 'STAY',
      };
    })();

    this.recalculateCohortStandings(seasonId, assignedStanding.groupId);

    return this.sqliteDb.prepare('SELECT * FROM weekly_standings WHERE userId = ? AND seasonId = ?').get(userId, seasonId) as any;
  }

  public recalculateCohortStandings(seasonId: string, groupId: string) {
    const rows = this.sqliteDb.prepare(`
      SELECT s.userId, s.seasonId, s.groupId, s.league, s.weeklyXp,
             COALESCE(u.averageAccuracy, 0) as averageAccuracy,
             COALESCE(u.averageTimePerQuestionSeconds, 45) as averageTimePerQuestionSeconds
      FROM weekly_standings s
      JOIN users u ON s.userId = u.id
      WHERE s.seasonId = ? AND s.groupId = ?
    `).all(seasonId, groupId) as any[];

    // Sort rules:
    // 1. weeklyXp DESC
    // 2. averageAccuracy DESC
    // 3. averageTimePerQuestionSeconds ASC
    // 4. userId ASC (deterministic final tie-breaker)
    rows.sort((a, b) => {
      if (b.weeklyXp !== a.weeklyXp) return b.weeklyXp - a.weeklyXp;
      if (b.averageAccuracy !== a.averageAccuracy) return b.averageAccuracy - a.averageAccuracy;
      if (a.averageTimePerQuestionSeconds !== b.averageTimePerQuestionSeconds) {
        return a.averageTimePerQuestionSeconds - b.averageTimePerQuestionSeconds;
      }
      return a.userId.localeCompare(b.userId);
    });

    this.sqliteDb.transaction(() => {
      const stmt = this.sqliteDb.prepare(`
        UPDATE weekly_standings
        SET rank = ?, movement = ?
        WHERE userId = ? AND seasonId = ?
      `);

      rows.forEach((member, index) => {
        const rank = index + 1;
        let movement = 'STAY';

        if (rank <= 8) {
          movement = member.league === 'Elite Master' ? 'STAY' : 'PROMOTE';
        } else if (rank <= 32) {
          movement = 'STAY';
        } else {
          movement = member.league === 'Bronze' ? 'STAY' : 'DEMOTE';
        }

        stmt.run(rank, movement, member.userId, seasonId);
      });
    })();
  }

  public getCohortStandings(seasonId: string, groupId: string): any[] {
    const rows = this.sqliteDb.prepare(`
      SELECT s.*, u.name as userName, u.college as userCollege, u.targetCompany
      FROM weekly_standings s
      JOIN users u ON s.userId = u.id
      WHERE s.seasonId = ? AND s.groupId = ?
      ORDER BY s.rank ASC, s.weeklyXp DESC, s.userId ASC
    `).all(seasonId, groupId) as any[];
    return rows;
  }

  public getUserWeeklyStanding(userId: string, seasonId?: string): any | undefined {
    let sid = seasonId;
    if (!sid) {
      const active = this.getOrCreateActiveSeason();
      sid = active.id;
    }
    const standing = this.sqliteDb.prepare('SELECT * FROM weekly_standings WHERE userId = ? AND seasonId = ?').get(userId, sid) as any;
    return standing;
  }

  public getSeasonById(seasonId: string): any | undefined {
    return this.sqliteDb.prepare('SELECT * FROM weekly_seasons WHERE id = ?').get(seasonId) as any;
  }

  public finalizeSeason(targetSeasonId?: string): {
    success: boolean;
    alreadyFinalized?: boolean;
    finalizedSeasonId: string;
    nextSeasonId?: string;
    cohortsProcessed?: number;
    promotedCount?: number;
    demotedCount?: number;
    stayCount?: number;
    pendingCount?: number;
    message?: string;
  } {
    let targetSeason: any = undefined;
    if (targetSeasonId) {
      targetSeason = this.getSeasonById(targetSeasonId);
    } else {
      targetSeason = this.sqliteDb.prepare("SELECT * FROM weekly_seasons WHERE status = 'ACTIVE' ORDER BY startTime DESC LIMIT 1").get() as any;
    }

    if (!targetSeason) {
      return {
        success: false,
        finalizedSeasonId: '',
        message: 'No active or target season found to finalize',
      };
    }

    if (targetSeason.status === 'FINALIZED') {
      const activeSeason = this.sqliteDb.prepare("SELECT * FROM weekly_seasons WHERE status = 'ACTIVE' ORDER BY startTime DESC LIMIT 1").get() as any;
      return {
        success: true,
        alreadyFinalized: true,
        finalizedSeasonId: targetSeason.id,
        nextSeasonId: activeSeason?.id || '',
        cohortsProcessed: 0,
        promotedCount: 0,
        demotedCount: 0,
        stayCount: 0,
        pendingCount: 0,
        message: 'Season is already finalized',
      };
    }

    let cohortsProcessed = 0;
    let promotedCount = 0;
    let demotedCount = 0;
    let stayCount = 0;
    let pendingCount = 0;
    let nextSeasonId = '';

    this.sqliteDb.transaction(() => {
      // 1. Fetch all distinct groups in the finalized season
      const groups = this.sqliteDb.prepare(`
        SELECT DISTINCT groupId
        FROM weekly_standings
        WHERE seasonId = ?
      `).all(targetSeason.id) as { groupId: string }[];

      cohortsProcessed = groups.length;

      // 2. Recalculate standings and apply movement rules for each cohort
      for (const group of groups) {
        this.recalculateCohortStandings(targetSeason.id, group.groupId);
        const standings = this.sqliteDb.prepare(`
          SELECT s.*, u.currentLeague
          FROM weekly_standings s
          JOIN users u ON s.userId = u.id
          WHERE s.seasonId = ? AND s.groupId = ?
          ORDER BY s.rank ASC
        `).all(targetSeason.id, group.groupId) as any[];

        const totalMembers = standings.length;

        for (let i = 0; i < standings.length; i++) {
          const member = standings[i];
          const rank = i + 1;
          let movement = 'PENDING';

          if (totalMembers === 40) {
            if (rank <= 8) {
              movement = member.league === 'Elite Master' ? 'STAY' : 'PROMOTE';
            } else if (rank <= 32) {
              movement = 'STAY';
            } else {
              movement = member.league === 'Bronze' ? 'STAY' : 'DEMOTE';
            }
          } else {
            movement = 'PENDING';
          }

          // Update final standing rank and movement
          this.sqliteDb.prepare(`
            UPDATE weekly_standings
            SET rank = ?, movement = ?
            WHERE userId = ? AND seasonId = ?
          `).run(rank, movement, member.userId, targetSeason.id);

          // Apply promotion/demotion to users table
          if (movement === 'PROMOTE') {
            promotedCount++;
            const newLeague = getNextLeagueTier(member.league);
            this.sqliteDb.prepare('UPDATE users SET currentLeague = ? WHERE id = ?').run(newLeague, member.userId);
          } else if (movement === 'DEMOTE') {
            demotedCount++;
            const newLeague = getPreviousLeagueTier(member.league);
            this.sqliteDb.prepare('UPDATE users SET currentLeague = ? WHERE id = ?').run(newLeague, member.userId);
          } else if (movement === 'STAY') {
            stayCount++;
          } else {
            pendingCount++;
          }
        }
      }

      // 3. Reset users.weeklyXp to 0 for all users for the new season
      this.sqliteDb.prepare('UPDATE users SET weeklyXp = 0').run();

      // 4. Mark target season as FINALIZED
      this.sqliteDb.prepare("UPDATE weekly_seasons SET status = 'FINALIZED' WHERE id = ?").run(targetSeason.id);

      // 5. Create next weekly season starting immediately after finalized season
      const finalizedEnd = new Date(targetSeason.endTime);
      const nextStart = new Date(finalizedEnd.getTime());
      const nextEnd = new Date(nextStart.getTime() + 7 * 86400 * 1000);

      const startYear = nextStart.getUTCFullYear();
      const dayOfYear = Math.floor((nextStart.getTime() - new Date(Date.UTC(startYear, 0, 1)).getTime()) / 86400000);
      const weekNumber = Math.ceil((dayOfYear + 1) / 7);
      nextSeasonId = `season_${startYear}_w${weekNumber.toString().padStart(2, '0')}`;

      const existingNext = this.sqliteDb.prepare('SELECT id FROM weekly_seasons WHERE id = ?').get(nextSeasonId);
      if (existingNext) {
        nextSeasonId = `season_${startYear}_w${weekNumber}_${Date.now()}`;
      }

      this.sqliteDb.prepare(`
        INSERT INTO weekly_seasons (id, status, startTime, endTime)
        VALUES (?, 'ACTIVE', ?, ?)
      `).run(nextSeasonId, nextStart.toISOString(), nextEnd.toISOString());
    })();

    return {
      success: true,
      alreadyFinalized: false,
      finalizedSeasonId: targetSeason.id,
      nextSeasonId,
      cohortsProcessed,
      promotedCount,
      demotedCount,
      stayCount,
      pendingCount,
      message: 'Season successfully finalized',
    };
  }

  public getCurrentLeagueOverview(userId: string): any {
    const activeSeason = this.getOrCreateActiveSeason();
    let user = this.getUserById(userId);
    if (!user) {
      user = { id: userId || 'anonymous', name: 'Student Candidate', email: '', role: 'student', currentLeague: 'Bronze', weeklyXp: 0 } as any;
    }
    const userLeague = user.currentLeague || 'Bronze';

    const standing = this.sqliteDb.prepare('SELECT * FROM weekly_standings WHERE userId = ? AND seasonId = ?').get(user.id, activeSeason.id) as any;

    const now = Date.now();
    const endTimeMs = new Date(activeSeason.endTime).getTime();
    const timeRemainingSeconds = Math.max(0, Math.floor((endTimeMs - now) / 1000));
    const isBronze = userLeague === 'Bronze';
    const isEliteMaster = userLeague === 'Elite Master';

    if (!standing) {
      return {
        isParticipant: false,
        cohortStatus: 'ACTIVE',
        activeSeason,
        seasonStart: activeSeason.startTime,
        seasonEnd: activeSeason.endTime,
        timeRemainingSeconds,
        userLeague,
        userGroup: null,
        cohortSize: 0,
        currentRank: null,
        weeklyXp: user.weeklyXp || 0,
        movement: 'STAY',
        promotionZone: {
          promotionCutoffRank: 8,
          demotionStartRank: 33,
          isPromoting: false,
          isStaying: true,
          isDemoting: false,
          isPending: false,
        },
        leagueBoundaries: {
          isBronze,
          isEliteMaster,
          canPromote: !isEliteMaster,
          canDemote: !isBronze,
        },
        standings: [],
      };
    }

    const cohortStandings = this.getCohortStandings(activeSeason.id, standing.groupId);
    const memberIndex = cohortStandings.findIndex((m) => m.userId === user.id);
    const rank = memberIndex !== -1 ? memberIndex + 1 : standing.rank || null;
    const cohortSize = cohortStandings.length;
    const cohortStatus = cohortSize === 40 ? 'FULL' : 'ACTIVE';

    let movement = 'STAY';
    if (rank) {
      if (rank <= 8) {
        movement = userLeague === 'Elite Master' ? 'STAY' : 'PROMOTE';
      } else if (rank <= 32) {
        movement = 'STAY';
      } else {
        movement = userLeague === 'Bronze' ? 'STAY' : 'DEMOTE';
      }
    }

    return {
      isParticipant: true,
      cohortStatus,
      activeSeason,
      seasonStart: activeSeason.startTime,
      seasonEnd: activeSeason.endTime,
      timeRemainingSeconds,
      userLeague,
      userGroup: standing.groupId,
      cohortSize,
      currentRank: rank,
      weeklyXp: standing.weeklyXp || user.weeklyXp || 0,
      movement,
      promotionZone: {
        promotionCutoffRank: 8,
        demotionStartRank: 33,
        isPromoting: movement === 'PROMOTE',
        isStaying: movement === 'STAY',
        isDemoting: movement === 'DEMOTE',
        isPending: false,
      },
      leagueBoundaries: {
        isBronze,
        isEliteMaster,
        canPromote: !isEliteMaster,
        canDemote: !isBronze,
      },
      standings: cohortStandings,
    };
  }

  public getNationalLeagueLeaderboard(userId?: string, companyFilter?: string): {
    userExactRank: number | null;
    userPercentile: string | null;
    isUnranked: boolean;
    totalCandidates: number;
    standings: any[];
  } {
    const allUsers = this.getAllUsers();

    let sorted = allUsers.sort((a, b) => {
      if (b.totalPoints !== a.totalPoints) return b.totalPoints - a.totalPoints;
      if (b.averageAccuracy !== a.averageAccuracy) return b.averageAccuracy - a.averageAccuracy;
      return a.averageTimePerQuestionSeconds - b.averageTimePerQuestionSeconds;
    });

    if (companyFilter && companyFilter !== 'all') {
      sorted = sorted.filter((u) => u.targetCompany?.toLowerCase().includes(companyFilter.toLowerCase()));
    }

    const activeCandidates = sorted.filter((u) => u.totalTestsAttempted > 0 && u.totalPoints > 0);
    const totalCandidates = activeCandidates.length;

    let userExactRank: number | null = null;
    let userPercentile: string | null = null;
    let isUnranked = true;

    if (userId) {
      const user = this.getUserById(userId);
      if (user && user.totalTestsAttempted > 0 && user.totalPoints > 0) {
        const idx = activeCandidates.findIndex((u) => u.id === userId);
        if (idx !== -1) {
          const rank = idx + 1;
          isUnranked = false;
          if (rank <= 1000) {
            userExactRank = rank;
          } else {
            const pct = Math.max(1, Math.min(99, Math.round(((totalCandidates - rank + 1) / totalCandidates) * 100)));
            userPercentile = `Top ${pct}% Nationwide`;
          }
        }
      }
    }

    const standings = activeCandidates.map((u, idx) => ({
      rank: idx + 1,
      userId: u.id,
      userName: u.name,
      userCollege: u.college || '',
      targetCompany: u.targetCompany || '',
      totalPoints: u.totalPoints,
      averageAccuracy: u.averageAccuracy,
      totalTestsAttempted: u.totalTestsAttempted,
      avgSpeedSeconds: u.averageTimePerQuestionSeconds || 45,
      badge: idx === 0 ? '👑 All-India Champion' : idx === 1 ? '🥈 Rank 2' : idx === 2 ? '🥉 Rank 3' : idx < 10 ? '⭐ Top 10 Elite' : undefined,
    }));

    return {
      userExactRank,
      userPercentile,
      isUnranked,
      totalCandidates,
      standings,
    };
  }

  public cleanupTemporaryUsers(prefix = 'p4_e2e_'): { deletedUsersCount: number } {
    const testUsers = this.sqliteDb.prepare(`
      SELECT id FROM users WHERE email LIKE ? OR id LIKE ? OR email LIKE 'p2_%' OR email LIKE 'p3_%' OR email LIKE 'practice_l2_%' OR email LIKE 'exam_l2_%' OR email LIKE 'cohort_user_%'
    `).all(`${prefix}%`, `${prefix}%`) as { id: string }[];

    if (testUsers.length === 0) return { deletedUsersCount: 0 };

    const ids = testUsers.map((u) => u.id);
    this.sqliteDb.transaction(() => {
      for (const uid of ids) {
        this.sqliteDb.prepare('DELETE FROM weekly_standings WHERE userId = ?').run(uid);
        this.sqliteDb.prepare('DELETE FROM test_attempts WHERE userId = ?').run(uid);
        this.sqliteDb.prepare('DELETE FROM attempt_responses WHERE attemptId IN (SELECT id FROM test_attempts WHERE userId = ?)').run(uid);
        this.sqliteDb.prepare('DELETE FROM coding_submissions WHERE userId = ?').run(uid);
        this.sqliteDb.prepare('DELETE FROM bookmarks WHERE userId = ?').run(uid);
        this.sqliteDb.prepare('DELETE FROM test_user_history WHERE userId = ?').run(uid);
        this.sqliteDb.prepare('DELETE FROM users WHERE id = ?').run(uid);
      }
    })();

    return { deletedUsersCount: ids.length };
  }

  // --- Admin Operations ---
  public getAdminStats(): AdminStats {
    const totalStudents = (this.sqliteDb.prepare("SELECT COUNT(*) as count FROM users WHERE role NOT IN ('admin', 'super_admin') AND (is_test = 0 OR is_test IS NULL)").get() as any).count;
    const totalTestSeries = (this.sqliteDb.prepare("SELECT COUNT(*) as count FROM tests WHERE (is_test = 0 OR is_test IS NULL)").get() as any).count;
    const totalQuestions = this.getAllCanonicalQuestions().length;
    const totalAttempts = (this.sqliteDb.prepare('SELECT COUNT(*) as count FROM test_attempts WHERE (is_test = 0 OR is_test IS NULL)').get() as any).count;

    const attemptsRows = this.sqliteDb.prepare('SELECT accuracyPercentage FROM test_attempts WHERE (is_test = 0 OR is_test IS NULL)').all() as any[];
    const allAccuracy = attemptsRows.reduce((sum, a) => sum + a.accuracyPercentage, 0);
    const avgPlatformAccuracy = totalAttempts > 0 ? Math.round(allAccuracy / totalAttempts) : 0;

    const collegeScores: Record<string, { totalPoints: number; count: number }> = {};
    const usersRows = this.sqliteDb.prepare('SELECT college, totalPoints FROM users WHERE (is_test = 0 OR is_test IS NULL)').all() as any[];
    usersRows.forEach((u) => {
      if (u.college && u.totalPoints > 0) {
        if (!collegeScores[u.college]) collegeScores[u.college] = { totalPoints: 0, count: 0 };
        collegeScores[u.college].totalPoints += u.totalPoints;
        collegeScores[u.college].count += 1;
      }
    });

    let topCollege = 'No tests taken yet';
    let maxAvg = 0;
    Object.entries(collegeScores).forEach(([col, stat]) => {
      const avg = stat.totalPoints / (stat.count || 1);
      if (avg > maxAvg) {
        maxAvg = avg;
        topCollege = col;
      }
    });

    const recentAttemptsRaw = this.sqliteDb.prepare('SELECT * FROM test_attempts WHERE (is_test = 0 OR is_test IS NULL) ORDER BY submittedAt DESC LIMIT 10').all() as any[];
    const recentAttempts = recentAttemptsRaw.map((att) => {
      const responsesRows = this.sqliteDb.prepare('SELECT * FROM attempt_responses WHERE attemptId = ?').all(att.id) as any[];
      return {
        ...att,
        responses: responsesRows.map((r) => ({
          ...r,
          isCorrect: !!r.isCorrect,
          question: safeJsonParse(r.question, {} as any),
        })),
        topicBreakdown: safeJsonParse(att.topicBreakdown, {}),
        strengths: safeJsonParse(att.strengths, []),
        weaknesses: safeJsonParse(att.weaknesses, []),
        recommendations: safeJsonParse(att.recommendations, []),
      };
    }).reverse();

    return {
      totalStudents,
      totalTestSeries,
      totalQuestions,
      totalAttempts,
      avgPlatformAccuracy,
      topPerformingCollege: topCollege,
      recentAttempts,
    };
  }

  // --- Assessment Builder & Question Bank Operations ---

  public getAllCanonicalQuestions(): any[] {
    const staticBanks = [
      ...quantQuestions.map((q: any) => ({ ...q, source: q.source || 'quant', questionType: 'MCQ' })),
      ...logicalQuestions.map((q: any) => ({ ...q, source: q.source || 'logical', questionType: 'MCQ' })),
      ...verbalQuestions.map((q: any) => ({ ...q, source: q.source || 'verbal', questionType: 'MCQ' })),
      ...diQuestions.map((q: any) => ({ ...q, source: q.source || 'di', questionType: 'MCQ' })),
      ...pseudocodeQuestions.map((q: any) => ({ ...q, source: q.source || 'pseudocode', questionType: 'MCQ' })),
      ...accentureQuestions.map((q: any) => ({ ...q, source: q.source || 'accenture', questionType: 'MCQ' })),
      ...cognizantQuestions.map((q: any) => ({ ...q, source: q.source || 'cognizant', questionType: 'MCQ' })),
      ...infosysQuestions.map((q: any) => ({ ...q, source: q.source || 'infosys', questionType: 'MCQ' })),
      ...tcsAdvancedQuestions.map((q: any) => ({ ...q, source: q.source || 'tcsAdvanced', questionType: 'MCQ' })),
      ...tcsCodingProblems.map((q: any) => ({ ...q, source: q.source || 'tcsCoding', questionType: 'CODING' })),
      ...codingMockQuestions.map((q: any) => ({ ...q, source: q.source || 'codingMock', questionType: 'CODING' })),
      ...wiproQuestions.map((q: any) => ({ ...q, source: q.source || 'wipro', questionType: 'MCQ' })),
    ];

    const dbRows = this.sqliteDb.prepare('SELECT * FROM questions').all() as any[];
    const dbQuestions = dbRows.map((q) => ({
      ...q,
      options: JSON.parse(q.options || '[]'),
      codingConfig: q.coding ? JSON.parse(q.coding) : undefined,
      questionType: q.type || 'MCQ',
      correctOption: q.correctOption,
      source: q.source || 'Admin DB',
    }));

    const questionMap = new Map<string, any>();
    staticBanks.forEach((q: any) => {
      questionMap.set(q.id, {
        id: q.id,
        testSeriesId: q.testSeriesId || 'cat_canonical',
        questionText: q.questionText,
        options: q.options || [],
        correctOption: q.correctOption || q.correctAnswer || 'A',
        explanation: q.explanation || '',
        topic: q.topic || 'General',
        difficulty: q.difficulty || 'Medium',
        questionType: q.questionType || (q.codingConfig ? 'CODING' : 'MCQ'),
        shortcutFormula: q.shortcutFormula || '',
        codingConfig: q.codingConfig || q.coding,
        source: q.source || 'Canonical Bank',
        createdAt: q.createdAt || '2026-01-01T00:00:00.000Z',
        updatedAt: q.updatedAt || '2026-01-01T00:00:00.000Z',
      });
    });

    dbQuestions.forEach((q: any) => {
      questionMap.set(q.id, {
        id: q.id,
        testSeriesId: q.testSeriesId || 'cat_canonical',
        questionText: q.questionText,
        options: q.options || [],
        correctOption: q.correctOption || q.correctAnswer || 'A',
        explanation: q.explanation || '',
        topic: q.topic || 'General',
        difficulty: q.difficulty || 'Medium',
        questionType: q.questionType || (q.codingConfig ? 'CODING' : 'MCQ'),
        shortcutFormula: q.shortcutFormula || '',
        codingConfig: q.codingConfig,
        source: q.source || 'Admin DB',
        createdAt: q.createdAt || new Date().toISOString(),
        updatedAt: q.updatedAt || new Date().toISOString(),
      });
    });

    return Array.from(questionMap.values());
  }

  public getQuestionAssessmentUsageMap(): Record<string, string[]> {
    const usageMap: Record<string, string[]> = {};
    const rows = this.sqliteDb.prepare('SELECT testSeriesId, questionId FROM assessment_questions').all() as any[];
    rows.forEach((r: any) => {
      if (!usageMap[r.questionId]) usageMap[r.questionId] = [];
      if (!usageMap[r.questionId].includes(r.testSeriesId)) {
        usageMap[r.questionId].push(r.testSeriesId);
      }
    });

    const allQuestions = this.getAllCanonicalQuestions();
    allQuestions.forEach((q) => {
      if (q.testSeriesId && q.testSeriesId !== 'cat_canonical') {
        if (!usageMap[q.id]) usageMap[q.id] = [];
        if (!usageMap[q.id].includes(q.testSeriesId)) {
          usageMap[q.id].push(q.testSeriesId);
        }
      }
    });
    return usageMap;
  }

  public checkQuestionDuplicate(questionText: string): DuplicateCheckResult {
    const allCanonical = this.getAllCanonicalQuestions();
    const usageMap = this.getQuestionAssessmentUsageMap();
    return checkDuplicateQuestion(questionText, allCanonical, usageMap);
  }

  public saveCanonicalQuestion(data: any): any {
    const id = data.id || `q_admin_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const now = new Date().toISOString();
    const optionsJson = JSON.stringify(data.options || []);
    const codingJson = data.codingConfig || data.coding ? JSON.stringify(data.codingConfig || data.coding) : null;

    const existing = this.sqliteDb.prepare('SELECT id FROM questions WHERE id = ?').get(id);
    if (existing) {
      this.sqliteDb.prepare(`
        UPDATE questions SET
          questionText = ?, options = ?, correctOption = ?, explanation = ?, topic = ?, difficulty = ?, type = ?, coding = ?, shortcutFormula = ?, source = ?, updatedAt = ?
        WHERE id = ?
      `).run(
        data.questionText,
        optionsJson,
        data.correctOption || data.correctAnswer || 'A',
        data.explanation || '',
        data.topic || 'General',
        data.difficulty || 'Medium',
        data.questionType || 'MCQ',
        codingJson,
        data.shortcutFormula || '',
        data.source || 'Admin',
        now,
        id
      );
    } else {
      this.sqliteDb.prepare(`
        INSERT INTO questions (id, testSeriesId, questionText, options, correctOption, explanation, topic, difficulty, type, coding, shortcutFormula, source, createdAt, updatedAt)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        id,
        data.testSeriesId || 'cat_canonical',
        data.questionText,
        optionsJson,
        data.correctOption || data.correctAnswer || 'A',
        data.explanation || '',
        data.topic || 'General',
        data.difficulty || 'Medium',
        data.questionType || 'MCQ',
        codingJson,
        data.shortcutFormula || '',
        data.source || 'Admin',
        now,
        now
      );
    }

    if (data.testSeriesId && data.testSeriesId !== 'cat_canonical') {
      this.linkQuestionToAssessment(data.testSeriesId, id);
    }

    return {
      id,
      testSeriesId: data.testSeriesId || 'cat_canonical',
      questionText: data.questionText,
      options: data.options || [],
      correctOption: data.correctOption || data.correctAnswer || 'A',
      explanation: data.explanation || '',
      topic: data.topic || 'General',
      difficulty: data.difficulty || 'Medium',
      questionType: data.questionType || 'MCQ',
      shortcutFormula: data.shortcutFormula || '',
      codingConfig: data.codingConfig || data.coding,
      source: data.source || 'Admin',
      createdAt: now,
      updatedAt: now,
    };
  }

  public getAllAssessmentsAdmin(includeTest = false): TestSeries[] {
    const query = includeTest
      ? 'SELECT id FROM tests ORDER BY createdAt DESC'
      : 'SELECT id FROM tests WHERE (is_test = 0 OR is_test IS NULL) ORDER BY createdAt DESC';
    const rows = this.sqliteDb.prepare(query).all() as any[];
    return rows.map((t) => this.getTestById(t.id, true)).filter(Boolean) as TestSeries[];
  }

  public createOrUpdateAssessment(data: any): TestSeries {
    const id = data.id || `cat_admin_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const now = new Date().toISOString();
    const sectionsJson = JSON.stringify(data.sections || []);
    const skillsJson = JSON.stringify(data.skills || []);
    const topicsJson = JSON.stringify(data.topics || []);
    const rolesJson = JSON.stringify(data.roles || []);
    const tagsJson = JSON.stringify(data.tags || []);

    const existing = this.sqliteDb.prepare('SELECT id, accessType FROM tests WHERE id = ?').get(id) as any;
    const accessType = data.accessType || existing?.accessType || 'FREE';
    if (existing) {
      this.sqliteDb.prepare(`
        UPDATE tests SET
          title = ?, description = ?, category = ?, companyName = ?, companyId = ?, durationMinutes = ?, totalQuestions = ?, difficulty = ?, status = ?, sections = ?, skills = ?, topics = ?, roles = ?, tags = ?, accessType = ?, updatedAt = ?
        WHERE id = ?
      `).run(
        data.title,
        data.description || '',
        data.category || 'foundation',
        data.companyName || '',
        data.companyId || '',
        Number(data.durationMinutes) || 20,
        Number(data.totalQuestions) || 20,
        data.difficulty || 'Medium',
        data.status || 'DRAFT',
        sectionsJson,
        skillsJson,
        topicsJson,
        rolesJson,
        tagsJson,
        accessType,
        now,
        id
      );
    } else {
      this.sqliteDb.prepare(`
        INSERT INTO tests (id, title, description, category, companyName, companyId, durationMinutes, totalQuestions, difficulty, status, testType, mode, scoringModel, sections, skills, topics, roles, tags, verificationStatus, attemptsCount, avgScore, accessType, createdAt, updatedAt)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        id,
        data.title,
        data.description || '',
        data.category || 'foundation',
        data.companyName || '',
        data.companyId || '',
        Number(data.durationMinutes) || 20,
        Number(data.totalQuestions) || 20,
        data.difficulty || 'Medium',
        data.status || 'DRAFT',
        data.testType || 'sectional',
        data.mode || 'exam',
        data.scoringModel || '+10 / -2',
        sectionsJson,
        skillsJson,
        topicsJson,
        rolesJson,
        tagsJson,
        'VERIFIED',
        0,
        0,
        accessType,
        now,
        now
      );
    }

    if (Array.isArray(data.questionIds)) {
      data.questionIds.forEach((qId: string, idx: number) => {
        this.linkQuestionToAssessment(id, qId, 'General', idx);
      });
    }

    return this.getTestById(id, true) || {
      id,
      title: data.title,
      description: data.description || '',
      category: data.category || 'foundation',
      durationMinutes: Number(data.durationMinutes) || 20,
      totalQuestions: Number(data.totalQuestions) || 20,
      difficulty: data.difficulty || 'Medium',
      status: data.status || 'DRAFT',
    } as any;
  }

  public updateAssessmentStatus(id: string, status: 'DRAFT' | 'REVIEW' | 'PUBLISHED' | 'ARCHIVED'): TestSeries {
    const test = this.sqliteDb.prepare('SELECT * FROM tests WHERE id = ?').get(id) as any;
    if (!test) throw new Error('Assessment not found');

    this.sqliteDb.prepare('UPDATE tests SET status = ?, updatedAt = ? WHERE id = ?').run(status, new Date().toISOString(), id);
    return this.getTestById(id, true)!;
  }

  public setTestAccessType(id: string, accessType: 'FREE' | 'PREMIUM'): TestSeries | null {
    const test = this.sqliteDb.prepare('SELECT * FROM tests WHERE id = ?').get(id) as any;
    if (!test) return null;

    const now = new Date().toISOString();
    this.sqliteDb.prepare('UPDATE tests SET accessType = ?, updatedAt = ? WHERE id = ?').run(accessType, now, id);
    return this.getTestById(id, true) || null;
  }

  public linkQuestionToAssessment(testSeriesId: string, questionId: string, sectionName: string = 'General', orderIndex: number = 0) {
    this.sqliteDb.prepare(`
      INSERT INTO assessment_questions (testSeriesId, questionId, sectionName, orderIndex)
      VALUES (?, ?, ?, ?)
      ON CONFLICT(testSeriesId, questionId) DO UPDATE SET sectionName = excluded.sectionName, orderIndex = excluded.orderIndex
    `).run(testSeriesId, questionId, sectionName, orderIndex);
  }

  public unlinkQuestionFromAssessment(testSeriesId: string, questionId: string) {
    this.sqliteDb.prepare('DELETE FROM assessment_questions WHERE testSeriesId = ? AND questionId = ?').run(testSeriesId, questionId);
  }

  public bulkImportQuestions(
    questions: any[],
    resolutions: Record<number, 'USE_EXISTING' | 'EDIT_EXISTING' | 'CREATE_NEW' | 'SKIP'> = {}
  ) {
    let newCreated = 0;
    let exactDuplicatesResolved = 0;
    let nearDuplicatesResolved = 0;
    let skipped = 0;
    let invalid = 0;
    const importedQuestions: any[] = [];

    const existingCanonical = this.getAllCanonicalQuestions();
    const usageMap = this.getQuestionAssessmentUsageMap();

    questions.forEach((q, idx) => {
      if (!q.questionText || q.questionText.trim().length === 0) {
        invalid++;
        return;
      }

      const dupResult = checkDuplicateQuestion(q.questionText, existingCanonical, usageMap);
      const userChoice = (resolutions as any)[idx] || (resolutions as any)[String(idx)] || (dupResult.isDuplicate ? (dupResult.matchType === 'EXACT' ? 'USE_EXISTING' : 'SKIP') : 'CREATE_NEW');

      if (userChoice === 'SKIP') {
        skipped++;
        return;
      }

      if (userChoice === 'USE_EXISTING' && dupResult.matches.length > 0) {
        const existingMatch = dupResult.matches[0];
        importedQuestions.push({ id: existingMatch.existingQuestionId, action: 'REUSED' });
        if (dupResult.matchType === 'EXACT') exactDuplicatesResolved++;
        else nearDuplicatesResolved++;
        return;
      }

      if (userChoice === 'EDIT_EXISTING' && dupResult.matches.length > 0) {
        const existingMatch = dupResult.matches[0];
        const updated = this.saveCanonicalQuestion({
          ...q,
          id: existingMatch.existingQuestionId,
        });
        importedQuestions.push({ id: updated.id, action: 'EDITED' });
        if (dupResult.matchType === 'EXACT') exactDuplicatesResolved++;
        else nearDuplicatesResolved++;
        return;
      }

      const created = this.saveCanonicalQuestion(q);
      importedQuestions.push({ id: created.id, action: 'CREATED' });
      newCreated++;
    });

    return {
      newCreated,
      exactDuplicatesResolved,
      nearDuplicatesResolved,
      skipped,
      invalid,
      totalProcessed: questions.length,
      importedQuestions,
    };
  }

  // --- Notification Operations ---
  public migrateNotificationRetention(): void {
    try {
      const legacyRows = this.sqliteDb
        .prepare("SELECT id, createdAt, priority FROM notifications WHERE expiresAt IS NULL OR expiresAt = ''")
        .all() as any[];
      if (legacyRows && legacyRows.length > 0) {
        const stmt = this.sqliteDb.prepare("UPDATE notifications SET expiresAt = ?, priority = ? WHERE id = ?");
        this.sqliteDb.transaction(() => {
          for (const row of legacyRows) {
            const createdMs = row.createdAt ? new Date(row.createdAt).getTime() : Date.now();
            const rawPrio = (row.priority || '').toString().toUpperCase();
            const isImportant = rawPrio === 'IMPORTANT' || rawPrio === 'CRITICAL';
            const hours = isImportant ? 48 : 24;
            const expiresAt = new Date(createdMs + hours * 60 * 60 * 1000).toISOString();
            const normPrio = isImportant ? 'IMPORTANT' : 'NORMAL';
            stmt.run(expiresAt, normPrio, row.id);
          }
        })();
      }
    } catch (e) {
      console.error('[Notification Migration Warning]', e);
    }
  }

  public cleanupExpiredNotifications(): { deletedCount: number } {
    try {
      const nowIso = new Date().toISOString();
      const info = this.sqliteDb
        .prepare("DELETE FROM notifications WHERE expiresAt IS NOT NULL AND expiresAt != '' AND expiresAt <= ?")
        .run(nowIso);
      return { deletedCount: info.changes || 0 };
    } catch (e) {
      console.error('[Notification Cleanup Error]', e);
      return { deletedCount: 0 };
    }
  }

  public startNotificationCleanupTimer(): void {
    if ((global as any).__notificationCleanupTimer__) {
      return;
    }
    this.cleanupExpiredNotifications();

    const timer = setInterval(() => {
      this.cleanupExpiredNotifications();
    }, 60 * 60 * 1000);

    if (timer.unref) {
      timer.unref();
    }
    (global as any).__notificationCleanupTimer__ = timer;
  }

  public getNotificationsForUser(userId?: string): {
    notifications: AppNotification[];
    unreadCount: number;
    readIds: string[];
  } {
    const user = userId ? this.getUserById(userId) : undefined;
    const readIds = user?.readNotificationIds || [];
    const readSet = new Set(readIds);
    const nowIso = new Date().toISOString();
    const nowMs = Date.now();

    const rows = userId
      ? (this.sqliteDb
          .prepare(
            `SELECT * FROM notifications 
             WHERE (targetUserId IS NULL OR targetUserId = '' OR targetUserId = ? OR audience = ?)
               AND (expiresAt IS NULL OR expiresAt = '' OR expiresAt > ?)
             ORDER BY createdAt DESC`
          )
          .all(userId, 'ALL', nowIso) as any[])
      : (this.sqliteDb
          .prepare(
            `SELECT * FROM notifications 
             WHERE (targetUserId IS NULL OR targetUserId = '' OR audience = 'ALL')
               AND (expiresAt IS NULL OR expiresAt = '' OR expiresAt > ?)
             ORDER BY createdAt DESC`
          )
          .all(nowIso) as any[]);

    const notifications: AppNotification[] = rows.map((n) => ({
      ...n,
      priority: n.priority || 'NORMAL',
      actionTab: n.actionTab as any,
    }));

    const relevant = notifications.filter((n) => {
      // 1. Expiration check: if notification is expired, exclude from active list
      if (n.expiresAt) {
        const expMs = new Date(n.expiresAt).getTime();
        if (!isNaN(expMs) && expMs <= nowMs) {
          return false;
        }
      }
      // 2. Direct user targeting check
      if (n.targetUserId && n.targetUserId.trim() !== '' && n.targetUserId !== userId) {
        return false;
      }
      // 3. Target company check
      if (n.targetCompany && n.targetCompany.trim() !== '' && user?.targetCompany) {
        const userTarget = user.targetCompany.toLowerCase();
        const notifTarget = n.targetCompany.toLowerCase();
        if (!userTarget.includes(notifTarget) && !notifTarget.includes(userTarget)) {
          return false;
        }
      }
      return true;
    });

    const sorted = relevant.sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );

    const unreadCount = sorted.filter((n) => !readSet.has(n.id) && !n.readAt).length;

    return {
      notifications: sorted,
      unreadCount,
      readIds,
    };
  }

  public getCandidateCount(company?: string): number {
    if (company && company.trim()) {
      const row = this.sqliteDb
        .prepare("SELECT COUNT(*) as cnt FROM users WHERE (role = 'candidate' OR role = 'student') AND LOWER(targetCompany) LIKE ?")
        .get(`%${company.trim().toLowerCase()}%`) as any;
      return row?.cnt || 0;
    }
    const row = this.sqliteDb
      .prepare("SELECT COUNT(*) as cnt FROM users WHERE role = 'candidate' OR role = 'student'")
      .get() as any;
    return row?.cnt || 0;
  }

  public markNotificationRead(userId: string, notificationId: string): { success: boolean; unreadCount: number } {
    const user = this.getUserById(userId);
    if (!user) return { success: false, unreadCount: 0 };
    if (!user.readNotificationIds) user.readNotificationIds = [];
    if (!user.readNotificationIds.includes(notificationId)) {
      user.readNotificationIds.push(notificationId);
      this.sqliteDb.prepare('UPDATE users SET readNotificationIds = ? WHERE id = ?').run(
        JSON.stringify(user.readNotificationIds),
        userId
      );
    }
    const result = this.getNotificationsForUser(userId);
    return { success: true, unreadCount: result.unreadCount };
  }

  public markAllNotificationsRead(userId: string): { success: boolean; unreadCount: number } {
    const user = this.getUserById(userId);
    if (!user) return { success: false, unreadCount: 0 };
    const { notifications } = this.getNotificationsForUser(userId);
    user.readNotificationIds = Array.from(new Set([...(user.readNotificationIds || []), ...notifications.map((n) => n.id)]));
    this.sqliteDb.prepare('UPDATE users SET readNotificationIds = ? WHERE id = ?').run(
      JSON.stringify(user.readNotificationIds),
      userId
    );
    return { success: true, unreadCount: 0 };
  }

  public buildAICopilotContext(userId?: string): {
    profile: {
      name: string;
      targetRole: string | null;
      targetCompany: string | null;
    };
    progress: {
      lifetimeXp: number;
      level: number;
      weeklyXp: number;
      leagueTier: string;
      leagueRank: number | null;
      isLeagueParticipant: boolean;
    };
    assessments: {
      totalExamsCompleted: number;
      recentAttempts: Array<{
        testTitle: string;
        mode: string;
        scorePoints: number;
        accuracyPercentage: number;
        submittedAt: string;
      }>;
      strongestTopic: string | null;
      weakestTopic: string | null;
    };
    revision: {
      bookmarkedCount: number;
      weakQuestionsCount: number;
    };
    availableAssessments: Array<{ id: string; title: string; category: string }>;
  } {
    const defaultRes = {
      profile: { name: '', targetRole: null, targetCompany: null },
      progress: {
        lifetimeXp: 0,
        level: 1,
        weeklyXp: 0,
        leagueTier: 'Bronze',
        leagueRank: null,
        isLeagueParticipant: false,
      },
      assessments: {
        totalExamsCompleted: 0,
        recentAttempts: [],
        strongestTopic: null,
        weakestTopic: null,
      },
      revision: { bookmarkedCount: 0, weakQuestionsCount: 0 },
      availableAssessments: [
        { id: 'cat_foundation_quant', title: 'Quantitative Aptitude Foundation', category: 'foundation' },
        { id: 'cat_foundation_logical', title: 'Logical Reasoning Foundation', category: 'foundation' },
        { id: 'cat_foundation_verbal', title: 'Verbal Ability Foundation', category: 'foundation' },
        { id: 'cat_foundation_di', title: 'Data Interpretation Foundation', category: 'foundation' },
      ],
    };

    if (!userId) return defaultRes;

    const user = this.getUserById(userId);
    if (!user) return defaultRes;

    const attemptsRows = this.sqliteDb
      .prepare('SELECT * FROM test_attempts WHERE userId = ? ORDER BY submittedAt DESC LIMIT 10')
      .all(userId) as any[];

    const examAttempts = attemptsRows.filter((a) => a.mode === 'exam');
    const recentAttempts = attemptsRows.slice(0, 5).map((a) => ({
      testTitle: a.testTitle || a.testSeriesId,
      mode: a.mode,
      scorePoints: a.scorePoints || 0,
      accuracyPercentage: a.accuracyPercentage || 0,
      submittedAt: a.submittedAt,
    }));

    const topicStats: Record<string, { total: number; correct: number }> = {};
    attemptsRows.forEach((att) => {
      try {
        const tb = typeof att.topicBreakdown === 'string' ? JSON.parse(att.topicBreakdown) : att.topicBreakdown || {};
        Object.entries(tb).forEach(([topic, stat]: [string, any]) => {
          if (!topicStats[topic]) topicStats[topic] = { total: 0, correct: 0 };
          topicStats[topic].total += stat.total || 0;
          topicStats[topic].correct += stat.correct || 0;
        });

        // Fallback to responses parsing if topicBreakdown is missing
        if (Object.keys(tb).length === 0 && att.responses) {
          const respList = typeof att.responses === 'string' ? JSON.parse(att.responses) : att.responses || [];
          respList.forEach((r: any) => {
            let topic = r.topic || r.question?.topic || 'General Aptitude';
            if (!topicStats[topic]) topicStats[topic] = { total: 0, correct: 0 };
            topicStats[topic].total += 1;
            if (r.isCorrect) topicStats[topic].correct += 1;
          });
        }
      } catch (e) {
        // ignore JSON parse error
      }
    });

    let strongestTopic: string | null = null;
    let weakestTopic: string | null = null;
    const sortedTopics = Object.entries(topicStats)
      .map(([t, s]) => ({ topic: t, accuracy: s.total > 0 ? Math.round((s.correct / s.total) * 100) : 0 }))
      .sort((a, b) => b.accuracy - a.accuracy);

    if (sortedTopics.length > 0) {
      if (sortedTopics[0].accuracy >= 70) strongestTopic = sortedTopics[0].topic;
      if (sortedTopics[sortedTopics.length - 1].accuracy < 70) weakestTopic = sortedTopics[sortedTopics.length - 1].topic;
    }

    const leagueData = this.getCurrentLeagueOverview(userId);

    const bookmarkRows = this.sqliteDb
      .prepare('SELECT COUNT(*) as count FROM bookmarks WHERE userId = ?')
      .get(userId) as any;
    const bookmarkedCount = bookmarkRows?.count || 0;

    return {
      profile: {
        name: user.name || '',
        targetRole: user.targetRole || null,
        targetCompany: user.targetCompany || null,
      },
      progress: {
        lifetimeXp: user.totalPoints || 0,
        level: user.level || Math.floor((user.totalPoints || 0) / 500) + 1,
        weeklyXp: user.weeklyXp || 0,
        leagueTier: user.currentLeague || 'Bronze',
        leagueRank: leagueData.userStanding?.currentRank || null,
        isLeagueParticipant: leagueData.isParticipant || false,
      },
      assessments: {
        totalExamsCompleted: examAttempts.length,
        recentAttempts,
        strongestTopic,
        weakestTopic,
      },
      topicStats,
      revision: {
        bookmarkedCount,
        weakQuestionsCount: sortedTopics.filter((t) => t.accuracy < 60).length,
      },
      availableAssessments: (this.sqliteDb.prepare('SELECT id, title, category FROM tests').all() as any[]).map((t) => ({
        id: t.id,
        title: t.title,
        category: t.category,
      })),
    };
  }

  public createNotification(notif: Omit<AppNotification, 'id' | 'createdAt'>): AppNotification {
    const now = new Date();
    
    // Server-authoritative retention logic
    const rawPrio = (notif.priority || 'NORMAL').toString().trim().toUpperCase();
    const isImportant = rawPrio === 'IMPORTANT' || rawPrio === 'CRITICAL';
    const hours = isImportant ? 48 : 24;

    let defaultExpiresAt: string;
    // Allow custom expiresAt ONLY if internal test flag metadata._allowCustomExpiry is set
    if (notif.metadata && notif.metadata._allowCustomExpiry && notif.expiresAt) {
      defaultExpiresAt = notif.expiresAt;
    } else {
      defaultExpiresAt = new Date(now.getTime() + hours * 60 * 60 * 1000).toISOString();
    }

    const finalPriority: NotificationPriority = isImportant ? 'IMPORTANT' : 'NORMAL';

    // Deduplication check if relatedEntityId & targetUserId & type are provided
    if (notif.relatedEntityId && notif.targetUserId) {
      const existing = this.sqliteDb
        .prepare('SELECT * FROM notifications WHERE type = ? AND targetUserId = ? AND relatedEntityId = ?')
        .get(notif.type, notif.targetUserId, notif.relatedEntityId) as any;
      if (existing) {
        return {
          ...existing,
          priority: existing.priority || 'NORMAL',
        };
      }
    }

    const newNotif: AppNotification = {
      ...notif,
      id: `notif_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`,
      createdAt: now.toISOString(),
      expiresAt: defaultExpiresAt,
      priority: finalPriority,
    };

    this.sqliteDb.prepare(`
      INSERT INTO notifications (
        id, type, title, message, createdAt, expiresAt, priority, actionType, actionTargetId,
        actionTestId, actionTab, actionLabel, actionUrl, targetCompany, targetUserId, audience,
        senderId, relatedEntityId, metadata
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      newNotif.id,
      newNotif.type,
      newNotif.title,
      newNotif.message,
      newNotif.createdAt,
      newNotif.expiresAt || '',
      newNotif.priority || 'NORMAL',
      newNotif.actionType || '',
      newNotif.actionTargetId || '',
      newNotif.actionTestId || '',
      newNotif.actionTab || '',
      newNotif.actionLabel || '',
      newNotif.actionUrl || '',
      newNotif.targetCompany || '',
      newNotif.targetUserId || '',
      newNotif.audience || 'ALL',
      newNotif.senderId || '',
      newNotif.relatedEntityId || '',
      typeof newNotif.metadata === 'object' ? JSON.stringify(newNotif.metadata) : newNotif.metadata || ''
    );
    return newNotif;
  }

  /**
   * Scans canonical Question Bank for near-duplicate wording (>= 75% Jaccard similarity)
   */
  public findSimilarQuestions(questionText: string): {
    isDuplicate: boolean;
    existingQuestion?: any;
    similarityScore: number;
    reason?: string;
  } {
    if (!questionText || questionText.trim().length < 10) {
      return { isDuplicate: false, similarityScore: 0 };
    }

    const cleanInputTokens = new Set(
      questionText
        .toLowerCase()
        .replace(/[^\w\s]/g, '')
        .split(/\s+/)
        .filter((w) => w.length > 2)
    );

    if (cleanInputTokens.size === 0) return { isDuplicate: false, similarityScore: 0 };

    const allQuestions = this.getAllCanonicalQuestions();
    let bestMatch: any = null;
    let maxSimilarity = 0;

    for (const q of allQuestions) {
      const qTokens = new Set(
        (q.questionText || '')
          .toLowerCase()
          .replace(/[^\w\s]/g, '')
          .split(/\s+/)
          .filter((w) => w.length > 2)
      );

      if (qTokens.size === 0) continue;

      const intersection = new Set([...cleanInputTokens].filter((x) => qTokens.has(x)));
      const union = new Set([...cleanInputTokens, ...qTokens]);
      const similarity = intersection.size / union.size;

      if (similarity > maxSimilarity) {
        maxSimilarity = similarity;
        bestMatch = q;
      }
    }

    if (maxSimilarity >= 0.75 && bestMatch) {
      return {
        isDuplicate: true,
        existingQuestion: bestMatch,
        similarityScore: Math.round(maxSimilarity * 100),
        reason: `Matches ${Math.round(maxSimilarity * 100)}% wording with existing question "${bestMatch.id}"`,
      };
    }

    return { isDuplicate: false, similarityScore: Math.round(maxSimilarity * 100) };
  }

  public createTestSeries(test: Omit<TestSeries, 'id' | 'attemptsCount'>): TestSeries {
    const id = `test_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`;
    const newTest: TestSeries = {
      ...test,
      id,
      attemptsCount: 0,
      avgScore: 0,
    };
    this.sqliteDb.prepare(`
      INSERT INTO tests (
        id, title, description, category, company, companyId, companyName,
        roles, supportedRoles, skills, topics, difficulty, durationMinutes, duration,
        totalQuestions, questionCount, passingPercentage, testType, mode,
        patternVersion, verificationStatus, isMegaEvent, megaEventId, tags,
        attemptsCount, avgScore, status, scoringModel
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      newTest.id,
      newTest.title,
      newTest.description,
      newTest.category,
      newTest.company || '',
      newTest.companyId || '',
      newTest.companyName || '',
      JSON.stringify(newTest.roles || []),
      JSON.stringify(newTest.supportedRoles || []),
      JSON.stringify(newTest.skills || []),
      JSON.stringify(newTest.topics || []),
      newTest.difficulty,
      newTest.durationMinutes,
      newTest.duration || newTest.durationMinutes,
      newTest.totalQuestions,
      newTest.questionCount || newTest.totalQuestions,
      newTest.passingPercentage || 0,
      newTest.testType || '',
      newTest.mode || '',
      newTest.patternVersion || '',
      newTest.verificationStatus || '',
      newTest.isMegaEvent ? 1 : 0,
      newTest.megaEventId || '',
      JSON.stringify(newTest.tags || []),
      0,
      0,
      newTest.status || 'ready',
      newTest.scoringModel || ''
    );

    this.createNotification({
      type: 'NEW_TEST',
      title: `New ${newTest.companyName || newTest.category} Assessment`,
      message: `"${newTest.title}" is now available for placement practice (${newTest.difficulty} • ${newTest.durationMinutes} mins).`,
      actionType: 'OPEN_TEST',
      actionTargetId: newTest.id,
      actionTestId: newTest.id,
      actionTab: 'tests',
      actionLabel: 'View Test',
      targetCompany: newTest.companyName || undefined,
    });

    return newTest;
  }

  public addQuestionToTest(question: Omit<Question, 'id'>): Question {
    const id = `q_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`;
    const newQ: Question = {
      ...question,
      id,
    };
    this.sqliteDb.prepare(`
      INSERT INTO questions (
        id, testSeriesId, questionText, codeSnippet, options, correctOption,
        topic, subTopic, difficulty, companyTag, yearTag, explanation,
        shortcutFormula, stimulusId, stimulus
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      newQ.id,
      newQ.testSeriesId,
      newQ.questionText,
      newQ.codeSnippet || '',
      JSON.stringify(newQ.options),
      newQ.correctOption,
      newQ.topic,
      newQ.subTopic || '',
      newQ.difficulty,
      newQ.companyTag || '',
      newQ.yearTag || '',
      newQ.explanation,
      newQ.shortcutFormula || '',
      newQ.stimulusId || '',
      newQ.stimulus ? JSON.stringify(newQ.stimulus) : ''
    );

    this.sqliteDb.prepare(`
      UPDATE tests SET totalQuestions = COALESCE(totalQuestions, 0) + 1 WHERE id = ?
    `).run(question.testSeriesId);

    return newQ;
  }

  public getCanonicalQuestionCount(): number {
    return this.getAllCanonicalQuestions().length;
  }

  public deleteAssessmentWithCascade(testSeriesId: string): { success: boolean; deletedTestSeriesId: string; deletedQuestionsLinks: number; deletedOrphanQuestions: number } {
    if (!testSeriesId || !testSeriesId.trim()) {
      throw new Error('Invalid assessment ID');
    }

    const trimmedId = testSeriesId.trim();

    const testRow = this.sqliteDb.prepare('SELECT * FROM tests WHERE id = ?').get(trimmedId) as any;
    const catTest = CATALOGUE_TESTS.find(t => t.id === trimmedId);
    if (!testRow && !catTest) {
      throw new Error(`Assessment with ID "${trimmedId}" does not exist.`);
    }

    let deletedQuestionsLinks = 0;
    let deletedOrphanQuestions = 0;

    this.sqliteDb.transaction(() => {
      // 1. Identify linked questions before removing links
      const linkedQuestions = this.sqliteDb.prepare('SELECT DISTINCT questionId FROM assessment_questions WHERE testSeriesId = ?').all(trimmedId) as { questionId: string }[];
      deletedQuestionsLinks = linkedQuestions.length;

      // 2. Remove relationship links for this test
      this.sqliteDb.prepare('DELETE FROM assessment_questions WHERE testSeriesId = ?').run(trimmedId);

      // 3. For each question previously linked, check if it is now orphaned and owned by DB
      for (const { questionId } of linkedQuestions) {
        const remainingLinks = (this.sqliteDb.prepare('SELECT COUNT(*) as count FROM assessment_questions WHERE questionId = ?').get(questionId) as any).count;
        if (remainingLinks === 0) {
          const dbQ = this.sqliteDb.prepare('SELECT id, testSeriesId FROM questions WHERE id = ?').get(questionId) as any;
          if (dbQ) {
            this.sqliteDb.prepare('DELETE FROM questions WHERE id = ?').run(questionId);
            deletedOrphanQuestions++;
          }
        }
      }

      // Also clean any questions that have testSeriesId = trimmedId directly in `questions` table and are not linked anywhere
      const ownedDbQs = this.sqliteDb.prepare('SELECT id FROM questions WHERE testSeriesId = ?').all(trimmedId) as { id: string }[];
      for (const { id: qId } of ownedDbQs) {
        const remainingLinks = (this.sqliteDb.prepare('SELECT COUNT(*) as count FROM assessment_questions WHERE questionId = ?').get(qId) as any).count;
        if (remainingLinks === 0) {
          this.sqliteDb.prepare('DELETE FROM questions WHERE id = ?').run(qId);
          deletedOrphanQuestions++;
        }
      }

      // 4. Delete related test-specific records
      this.sqliteDb.prepare('DELETE FROM coding_submissions WHERE testSeriesId = ?').run(trimmedId);
      this.sqliteDb.prepare('DELETE FROM test_user_history WHERE testId = ?').run(trimmedId);
      this.sqliteDb.prepare('DELETE FROM assessment_entitlements WHERE assessmentId = ?').run(trimmedId);
      this.sqliteDb.prepare('DELETE FROM assessment_integrity_events WHERE testId = ?').run(trimmedId);
      this.sqliteDb.prepare('DELETE FROM track_items WHERE testId = ?').run(trimmedId);
      this.sqliteDb.prepare('DELETE FROM assessment_roles WHERE assessmentId = ?').run(trimmedId);
      this.sqliteDb.prepare('DELETE FROM assessment_companies WHERE assessmentId = ?').run(trimmedId);

      // 5. Delete assessment record from tests table
      this.sqliteDb.prepare('DELETE FROM tests WHERE id = ?').run(trimmedId);
    })();

    return {
      success: true,
      deletedTestSeriesId: trimmedId,
      deletedQuestionsLinks,
      deletedOrphanQuestions,
    };
  }

  public deleteTest(id: string): { success: boolean; archived: boolean; status: string; id: string } {
    const isCatalogue = id.startsWith('cat_') || id.startsWith('bp_') || CATALOGUE_TESTS.some((t) => t.id === id);
    const test = this.sqliteDb.prepare('SELECT id, status FROM tests WHERE id = ?').get(id) as any;
    const statusUpper = test?.status ? String(test.status).toUpperCase() : (isCatalogue ? 'PUBLISHED' : '');

    if (isCatalogue || (test && (statusUpper === 'PUBLISHED' || statusUpper === 'READY' || statusUpper === 'ARCHIVED' || statusUpper === ''))) {
      this.sqliteDb.prepare(`
        INSERT INTO tests (id, title, status, updatedAt)
        VALUES (?, ?, 'ARCHIVED', ?)
        ON CONFLICT(id) DO UPDATE SET status = 'ARCHIVED', updatedAt = excluded.updatedAt
      `).run(id, isCatalogue ? (CATALOGUE_TESTS.find(t => t.id === id)?.title || id) : (test?.title || id), new Date().toISOString());
      return { success: true, archived: true, status: 'ARCHIVED', id };
    }
    this.sqliteDb.transaction(() => {
      this.sqliteDb.prepare('DELETE FROM questions WHERE testSeriesId = ?').run(id);
      this.sqliteDb.prepare('DELETE FROM assessment_questions WHERE testSeriesId = ?').run(id);
      this.sqliteDb.prepare('DELETE FROM tests WHERE id = ?').run(id);
    })();
    return { success: true, archived: false, status: 'DELETED', id };
  }

  // --- Coding Submissions & Execution Persistence ---
  public saveCodingSubmission(record: CodingSubmissionRecord): CodingSubmissionRecord {
    this.sqliteDb.prepare(`
      INSERT OR REPLACE INTO coding_submissions (
        id, userId, testSeriesId, testAttemptId, questionId,
        language, sourceCode, executionResult, isFinalSubmission, createdAt
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      record.id,
      record.userId,
      record.testSeriesId || '',
      record.testAttemptId || '',
      record.questionId,
      record.language,
      record.sourceCode,
      JSON.stringify(record.executionResult),
      record.isFinalSubmission ? 1 : 0,
      record.createdAt || new Date().toISOString()
    );

    const countRow = this.sqliteDb.prepare('SELECT COUNT(*) as count FROM coding_submissions WHERE userId = ?').get(record.userId) as { count: number };
    if (countRow.count > 50) {
      const oldest = this.sqliteDb.prepare('SELECT id FROM coding_submissions WHERE userId = ? ORDER BY createdAt ASC LIMIT ?').all(record.userId, countRow.count - 50) as { id: string }[];
      const deleteStmt = this.sqliteDb.prepare('DELETE FROM coding_submissions WHERE id = ?');
      this.sqliteDb.transaction(() => {
        oldest.forEach((row) => deleteStmt.run(row.id));
      })();
    }

    return record;
  }

  public getCodingSubmissionsForUser(userId: string, questionId?: string): CodingSubmissionRecord[] {
    let query = 'SELECT * FROM coding_submissions WHERE userId = ?';
    const params: any[] = [userId];
    if (questionId) {
      query += ' AND questionId = ?';
      params.push(questionId);
    }
    query += ' ORDER BY createdAt DESC';
    const rows = this.sqliteDb.prepare(query).all(params) as any[];
    return rows.map((s) => ({
      ...s,
      isFinalSubmission: !!s.isFinalSubmission,
      executionResult: JSON.parse(s.executionResult),
    }));
  }

  public mapCanonicalToQuestion(testId: string, cq: any): Question {
    const base: any = {
      id: cq.id,
      testSeriesId: testId,
      questionText: cq.questionText,
      options: cq.options || [],
      correctOption: cq.correctAnswer || 'A',
      topic: cq.topic,
      difficulty: cq.difficulty,
      explanation: cq.explanation,
      questionType: cq.questionType,
    };
    if (cq.questionType === 'CODING') {
      base.problemStatement = cq.problemStatement;
      base.inputFormat = cq.inputFormat;
      base.outputFormat = cq.outputFormat;
      base.constraints = cq.constraints;
      base.examples = cq.examples;
      base.starterCode = cq.starterCode;
      base.supportedLanguages = cq.supportedLanguages;
      base.timeLimitMs = cq.timeLimitMs;
      base.memoryLimitMb = cq.memoryLimitMb;
      
      // Phase 31C: Construct fallback codingConfig for compatibility
      base.codingConfig = cq.codingConfig || {
        problemType: 'ALGORITHM',
        languages: cq.supportedLanguages || ['javascript', 'typescript', 'python'],
        defaultLanguage: cq.supportedLanguages?.[0] || 'javascript',
        starterCode: cq.starterCode || {},
        timeLimitMs: cq.timeLimitMs,
        memoryLimitMb: cq.memoryLimitMb,
      };
    }
    return base as Question;
  }

  public validateCodingQuestion(cq: any): { isValid: boolean; error?: string; warning?: string } {
    if (cq.questionType !== 'CODING') {
      if (cq.codingConfig) {
        return { isValid: true, warning: 'MCQ questions should not have codingConfig' };
      }
      return { isValid: true };
    }

    const config = cq.codingConfig;
    if (!config) {
      return { isValid: false, error: 'CODING question is missing codingConfig' };
    }

    if (!config.languages || !Array.isArray(config.languages) || config.languages.length === 0) {
      return { isValid: false, error: 'CODING question contains empty or missing languages list' };
    }

    if (config.defaultLanguage && !config.languages.includes(config.defaultLanguage)) {
      return { isValid: false, error: 'defaultLanguage must be one of the allowed languages' };
    }

    // Check language adapters
    for (const lang of config.languages) {
      if (!LANGUAGE_ADAPTERS[lang as any]) {
        return { isValid: false, error: `Unsupported language adapter: ${lang}` };
      }
    }

    return { isValid: true };
  }

  public getCodingProblemById(id: string): any | undefined {
    const tcs = tcsCodingProblems.find(q => q.id === id);
    if (tcs) return tcs;
    return codingMockQuestions.find(q => q.id === id);
  }

  public getLatestCodingSubmission(userId: string, questionId: string): CodingSubmissionRecord | undefined {
    const row = this.sqliteDb.prepare(`
      SELECT * FROM coding_submissions 
      WHERE userId = ? AND questionId = ? 
      ORDER BY createdAt DESC LIMIT 1
    `).get(userId, questionId) as any;
    if (!row) return undefined;
    return {
      ...row,
      isFinalSubmission: !!row.isFinalSubmission,
      executionResult: JSON.parse(row.executionResult),
    };
  }

  // ==========================================
  // DEEP AI CREDIT WALLET, PERIODS & LEDGER ARCHITECTURE
  // ==========================================

  public static readonly DEFAULT_PREMIUM_PERIOD_CREDITS = 100;

  public getPremiumPeriodCreditAllowance(plan?: string): number {
    if (plan === 'PRO') return PLAN_CONFIGS.PRO.monthlyAiCredits; // 65
    if (plan === 'PLUS') return PLAN_CONFIGS.PLUS.monthlyAiCredits; // 50
    const envVal = process.env.PREMIUM_DEEP_AI_PERIOD_CREDITS;
    if (envVal && !isNaN(parseInt(envVal, 10))) {
      return parseInt(envVal, 10);
    }
    return 50;
  }

  public ensureInitialUserCredits(userId: string): void {
    if (!userId) return;
    try {
      const existing = this.sqliteDb.prepare(`
        SELECT id FROM deep_ai_credit_ledger 
        WHERE userId = ? AND transactionType = 'GRANT' AND source = 'FREE'
      `).get(userId);
      if (!existing) {
        const now = new Date().toISOString();
        this.sqliteDb.prepare(`
          INSERT INTO deep_ai_credit_ledger (userId, amount, source, transactionType, description, createdAt)
          VALUES (?, 6, 'FREE', 'GRANT', 'Welcome bonus: 6 Free Deep AI Credits', ?)
        `).run(userId, now);
      }
    } catch (e) {
      console.error('[DB] Failed to ensure initial credits for user:', userId, e);
    }
  }

  public ensureCurrentPremiumCreditPeriod(userId: string): {
    id: string;
    userId: string;
    periodStart: string;
    periodEnd: string;
    allocatedCredits: number;
    usedCredits: number;
    status: 'ACTIVE' | 'EXPIRED' | 'CANCELLED';
    remainingCredits: number;
  } | null {
    if (!userId) return null;
    try {
      const userRow = this.sqliteDb.prepare('SELECT * FROM users WHERE id = ?').get(userId) as any;
      if (!userRow) return null;
      const user = this.mapDbUserToUser(userRow);
      const isPremium = hasPremiumAccess(user);
      const now = new Date();
      const nowIso = now.toISOString();

      // 1. Mark any past ACTIVE periods whose periodEnd <= now as EXPIRED
      this.sqliteDb.prepare(`
        UPDATE deep_ai_premium_periods
        SET status = 'EXPIRED', updatedAt = ?
        WHERE userId = ? AND status = 'ACTIVE' AND periodEnd <= ?
      `).run(nowIso, userId, nowIso);

      // 2. Check if there is already an active period for the current window
      const activePeriod = this.sqliteDb.prepare(`
        SELECT * FROM deep_ai_premium_periods
        WHERE userId = ? AND status = 'ACTIVE' AND periodStart <= ? AND periodEnd > ?
        ORDER BY createdAt DESC LIMIT 1
      `).get(userId, nowIso, nowIso) as any;

      if (activePeriod) {
        if (!isPremium) {
          this.sqliteDb.prepare(`
            UPDATE deep_ai_premium_periods
            SET status = 'CANCELLED', updatedAt = ?
            WHERE id = ?
          `).run(nowIso, activePeriod.id);
          return null;
        }

        const targetAllowance = this.getPremiumPeriodCreditAllowance(user.plan);
        if (user.plan === 'PRO' && activePeriod.allocatedCredits < targetAllowance) {
          const diff = targetAllowance - activePeriod.allocatedCredits;
          this.sqliteDb.prepare(`
            UPDATE deep_ai_premium_periods
            SET allocatedCredits = ?, updatedAt = ?
            WHERE id = ?
          `).run(targetAllowance, nowIso, activePeriod.id);
          this.sqliteDb.prepare(`
            INSERT INTO deep_ai_credit_ledger (
              userId, amount, source, transactionType, description, createdAt
            ) VALUES (?, ?, 'PREMIUM', 'GRANT', ?, ?)
          `).run(userId, diff, `Plan Upgrade Credit Adjustment (${user.plan})`, nowIso);
          activePeriod.allocatedCredits = targetAllowance;
        }

        return {
          id: activePeriod.id,
          userId: activePeriod.userId,
          periodStart: activePeriod.periodStart,
          periodEnd: activePeriod.periodEnd,
          allocatedCredits: activePeriod.allocatedCredits,
          usedCredits: activePeriod.usedCredits || 0,
          status: activePeriod.status,
          remainingCredits: Math.max(0, activePeriod.allocatedCredits - (activePeriod.usedCredits || 0)),
        };
      }

      // If user does not have active Premium status, no period can be created
      if (!isPremium) {
        return null;
      }

      // 3. User is active Premium without a current active period -> Create new period
      let periodStart = nowIso;
      let periodEnd: string;
      if (user.subscriptionExpiresAt) {
        const expDate = new Date(user.subscriptionExpiresAt);
        if (expDate.getTime() > now.getTime()) {
          periodEnd = expDate.toISOString();
        } else {
          periodEnd = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000).toISOString();
        }
      } else {
        periodEnd = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000).toISOString();
      }

      const allowance = this.getPremiumPeriodCreditAllowance(user.plan);
      const periodId = `prem_per_${userId}_${now.getTime()}`;

      const txn = this.sqliteDb.transaction(() => {
        // Double-check inside transaction to eliminate race conditions
        const existingCheck = this.sqliteDb.prepare(`
          SELECT * FROM deep_ai_premium_periods
          WHERE userId = ? AND status = 'ACTIVE' AND periodStart <= ? AND periodEnd > ?
        `).get(userId, nowIso, nowIso) as any;

        if (existingCheck) {
          return {
            id: existingCheck.id,
            userId: existingCheck.userId,
            periodStart: existingCheck.periodStart,
            periodEnd: existingCheck.periodEnd,
            allocatedCredits: existingCheck.allocatedCredits,
            usedCredits: existingCheck.usedCredits || 0,
            status: existingCheck.status,
            remainingCredits: Math.max(0, existingCheck.allocatedCredits - (existingCheck.usedCredits || 0)),
          };
        }

        this.sqliteDb.prepare(`
          INSERT INTO deep_ai_premium_periods (
            id, userId, periodStart, periodEnd, allocatedCredits, usedCredits, status, createdAt, updatedAt
          ) VALUES (?, ?, ?, ?, ?, 0, 'ACTIVE', ?, ?)
        `).run(periodId, userId, periodStart, periodEnd, allowance, nowIso, nowIso);

        this.sqliteDb.prepare(`
          INSERT INTO deep_ai_credit_ledger (
            userId, amount, source, transactionType, description, createdAt
          ) VALUES (?, ?, 'PREMIUM', 'GRANT', ?, ?)
        `).run(userId, allowance, `Premium Billing Period AI Allowance (${allowance} credits)`, nowIso);

        return {
          id: periodId,
          userId,
          periodStart,
          periodEnd,
          allocatedCredits: allowance,
          usedCredits: 0,
          status: 'ACTIVE' as const,
          remainingCredits: allowance,
        };
      });

      return txn();
    } catch (e) {
      console.error('[DB] Failed to ensure Premium credit period for user:', userId, e);
      return null;
    }
  }

  public getDeepAICreditBalance(userId: string): DeepAICreditBalance {
    this.ensureInitialUserCredits(userId);
    const userRow = this.sqliteDb.prepare('SELECT * FROM users WHERE id = ?').get(userId) as any;
    const user = userRow ? this.mapDbUserToUser(userRow) : null;
    const isPremiumUser = user ? hasPremiumAccess(user) : false;

    const activePeriod = this.ensureCurrentPremiumCreditPeriod(userId);

    const ledgerSums = this.sqliteDb.prepare(`
      SELECT 
        SUM(CASE WHEN source = 'FREE' THEN amount ELSE 0 END) as freeSum,
        SUM(CASE WHEN source = 'PURCHASED' THEN amount ELSE 0 END) as purchasedSum
      FROM deep_ai_credit_ledger
      WHERE userId = ?
    `).get(userId) as { freeSum: number | null; purchasedSum: number | null };

    const free = Math.max(0, ledgerSums?.freeSum || 0);
    const purchased = Math.max(0, ledgerSums?.purchasedSum || 0);
    const premium = Math.max(0, activePeriod && isPremiumUser ? activePeriod.remainingCredits : 0);

    const total = free + purchased + premium;

    return {
      total,
      totalAvailable: total,
      free,
      purchased,
      premium,
      isPremiumUser,
      premiumPeriodStart: activePeriod?.periodStart || null,
      premiumPeriodEnd: activePeriod?.periodEnd || null,
      premiumAllocated: activePeriod?.allocatedCredits ?? (isPremiumUser ? this.getPremiumPeriodCreditAllowance() : null),
      premiumUsed: activePeriod?.usedCredits ?? (isPremiumUser ? 0 : null),
      premiumRemaining: activePeriod ? activePeriod.remainingCredits : (isPremiumUser ? 0 : null),
      premiumPeriodStatus: activePeriod ? 'ACTIVE' : (isPremiumUser ? 'EXPIRED' : 'NONE'),
    };
  }

  public getCreditLedger(userId: string): DeepAICreditLedgerItem[] {
    this.ensureInitialUserCredits(userId);
    const rows = this.sqliteDb.prepare(`
      SELECT * FROM deep_ai_credit_ledger
      WHERE userId = ?
      ORDER BY createdAt DESC, id DESC
    `).all(userId) as any[];

    return rows.map((r) => ({
      id: r.id,
      userId: r.userId,
      amount: r.amount,
      source: r.source as CreditSource,
      transactionType: r.transactionType as CreditTransactionType,
      assessmentId: r.assessmentId || undefined,
      questionId: r.questionId || undefined,
      description: r.description || undefined,
      createdAt: r.createdAt,
    }));
  }

  public getUserPremiumPeriods(userId: string): any[] {
    return this.sqliteDb.prepare(`
      SELECT * FROM deep_ai_premium_periods
      WHERE userId = ?
      ORDER BY createdAt DESC
    `).all(userId) as any[];
  }

  public consumeDeepAICreditAtomic(
    userId: string,
    assessmentId: string,
    questionId: string
  ): {
    success: boolean;
    isNewSession: boolean;
    sessionId: string;
    remainingCredits: number;
    source?: CreditSource;
    reason?: string;
  } {
    this.ensureInitialUserCredits(userId);

    // 1. Check if user already has an active session for this question
    const existingSession = this.sqliteDb.prepare(`
      SELECT * FROM deep_ai_sessions
      WHERE userId = ? AND assessmentId = ? AND questionId = ?
    `).get(userId, assessmentId, questionId) as any;

    if (existingSession) {
      const now = new Date().toISOString();
      this.sqliteDb.prepare(`
        UPDATE deep_ai_sessions
        SET messagesCount = messagesCount + 1, updatedAt = ?
        WHERE id = ?
      `).run(now, existingSession.id);

      const bal = this.getDeepAICreditBalance(userId);
      return {
        success: true,
        isNewSession: false,
        sessionId: existingSession.id,
        remainingCredits: bal.total,
      };
    }

    // 2. No existing session -> check balance and active period
    const balance = this.getDeepAICreditBalance(userId);
    if (balance.total <= 0) {
      return {
        success: false,
        isNewSession: true,
        sessionId: '',
        remainingCredits: 0,
        reason: 'Insufficient Deep AI credits. Please upgrade to FirstRound Premium or purchase additional credits.',
      };
    }

    // 3. Priority consumption: 1. FREE -> 2. PURCHASED -> 3. PREMIUM
    let chosenSource: CreditSource = 'FREE';
    const activePeriod = this.ensureCurrentPremiumCreditPeriod(userId);

    if (balance.free > 0) {
      chosenSource = 'FREE';
    } else if (balance.purchased > 0) {
      chosenSource = 'PURCHASED';
    } else if (balance.premium > 0 && activePeriod && activePeriod.remainingCredits > 0) {
      chosenSource = 'PREMIUM';
    } else {
      return {
        success: false,
        isNewSession: true,
        sessionId: '',
        remainingCredits: 0,
        reason: 'Insufficient Deep AI credits. Please upgrade to FirstRound Premium or purchase additional credits.',
      };
    }

    const sessionId = `sess_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const now = new Date().toISOString();

    const txn = this.sqliteDb.transaction(() => {
      // If consuming from Premium period, increment usedCredits on the active period
      if (chosenSource === 'PREMIUM' && activePeriod) {
        this.sqliteDb.prepare(`
          UPDATE deep_ai_premium_periods
          SET usedCredits = usedCredits + 1, updatedAt = ?
          WHERE id = ?
        `).run(now, activePeriod.id);
      }

      const ledgerResult = this.sqliteDb.prepare(`
        INSERT INTO deep_ai_credit_ledger (
          userId, amount, source, transactionType, assessmentId, questionId, description, createdAt
        ) VALUES (?, -1, ?, 'CONSUME', ?, ?, ?, ?)
      `).run(
        userId,
        chosenSource,
        assessmentId,
        questionId,
        `Deep AI Session for question ${questionId}`,
        now
      );

      const ledgerId = ledgerResult.lastInsertRowid;

      this.sqliteDb.prepare(`
        INSERT INTO deep_ai_sessions (
          id, userId, assessmentId, questionId, messagesCount, ledgerRef, createdAt, updatedAt
        ) VALUES (?, ?, ?, ?, 1, ?, ?, ?)
      `).run(
        sessionId,
        userId,
        assessmentId,
        questionId,
        Number(ledgerId),
        now,
        now
      );
    });

    txn();

    const newBalance = this.getDeepAICreditBalance(userId);

    return {
      success: true,
      isNewSession: true,
      sessionId,
      remainingCredits: newBalance.total,
      source: chosenSource,
    };
  }

  public getDeepAISessionStatus(
    userId: string,
    assessmentId: string,
    questionId: string
  ): { isUnlocked: boolean; sessionId?: string; remainingCredits: number } {
    this.ensureInitialUserCredits(userId);
    const existingSession = this.sqliteDb.prepare(`
      SELECT * FROM deep_ai_sessions
      WHERE userId = ? AND assessmentId = ? AND questionId = ?
    `).get(userId, assessmentId, questionId) as any;

    const balance = this.getDeepAICreditBalance(userId);
    return {
      isUnlocked: !!existingSession,
      sessionId: existingSession?.id,
      remainingCredits: balance.total,
    };
  }

  public deductUserWeeklyXP(userId: string, xpAmount: number): { success: boolean; newWeeklyXp: number } {
    const currentSeason = this.getOrCreateCurrentSeason();
    const user = this.getUserById(userId);
    const currentWeeklyXp = user?.weeklyXp || 0;
    const newXp = Math.max(0, currentWeeklyXp - Math.max(1, xpAmount));

    this.sqliteDb.prepare(`
      UPDATE users SET weeklyXp = ? WHERE id = ?
    `).run(newXp, userId);

    this.sqliteDb.prepare(`
      UPDATE weekly_standings SET weeklyXp = ? WHERE userId = ? AND seasonId = ?
    `).run(newXp, userId, currentSeason.id);

    return {
      success: true,
      newWeeklyXp: newXp,
    };
  }

  public recordDeepAISessionMessage(sessionId: string): void {
    try {
      const now = new Date().toISOString();
      this.sqliteDb.prepare(`
        UPDATE deep_ai_sessions
        SET messagesCount = messagesCount + 1, updatedAt = ?
        WHERE id = ?
      `).run(now, sessionId);
    } catch (e) {
      console.error('[DB] Failed to record session message:', e);
    }
  }

  public refundDeepAICredit(userId: string, ledgerRef?: number, reason?: string): boolean {
    try {
      let source: CreditSource = 'FREE';
      if (ledgerRef) {
        const row = this.sqliteDb.prepare('SELECT source FROM deep_ai_credit_ledger WHERE id = ?').get(ledgerRef) as any;
        if (row?.source) source = row.source;
      }
      const now = new Date().toISOString();
      this.sqliteDb.prepare(`
        INSERT INTO deep_ai_credit_ledger (userId, amount, source, transactionType, description, createdAt)
        VALUES (?, 1, ?, 'REFUND', ?, ?)
      `).run(userId, source, reason || 'Deep AI Credit Refund', now);
      return true;
    } catch (e) {
      console.error('[DB] Refund failed:', e);
      return false;
    }
  }

  public adminAdjustCredits(
    userId: string,
    amount: number,
    source: CreditSource = 'PURCHASED',
    description: string = 'Admin credit adjustment'
  ): DeepAICreditBalance {
    this.ensureInitialUserCredits(userId);
    const now = new Date().toISOString();
    this.sqliteDb.prepare(`
      INSERT INTO deep_ai_credit_ledger (userId, amount, source, transactionType, description, createdAt)
      VALUES (?, ?, ?, 'ADMIN_ADJUST', ?, ?)
    `).run(userId, amount, source, description, now);
    return this.getDeepAICreditBalance(userId);
  }

  // ==========================================
  // ASSESSMENT ENTITLEMENTS ARCHITECTURE
  // ==========================================

  public grantAssessmentEntitlement(
    userId: string,
    assessmentId: string,
    expiresAt?: string | null,
    grantedBy: 'PURCHASE' | 'ADMIN' | 'SYSTEM' = 'SYSTEM'
  ): AssessmentEntitlement {
    const now = new Date().toISOString();
    this.sqliteDb.prepare(`
      INSERT INTO assessment_entitlements (userId, assessmentId, grantedAt, expiresAt, grantedBy)
      VALUES (?, ?, ?, ?, ?)
      ON CONFLICT(userId, assessmentId) DO UPDATE SET
        expiresAt = excluded.expiresAt,
        grantedBy = excluded.grantedBy
    `).run(userId, assessmentId, now, expiresAt || null, grantedBy);

    return {
      id: `ent_${userId}_${assessmentId}`,
      userId,
      assessmentId,
      grantedAt: now,
      expiresAt: expiresAt || null,
      grantedBy,
    };
  }

  public revokeAssessmentEntitlement(userId: string, assessmentId: string): boolean {
    const res = this.sqliteDb.prepare(`
      DELETE FROM assessment_entitlements WHERE userId = ? AND assessmentId = ?
    `).run(userId, assessmentId);
    return res.changes > 0;
  }

  public getUserAssessmentEntitlements(userId: string): AssessmentEntitlement[] {
    const rows = this.sqliteDb.prepare(`
      SELECT * FROM assessment_entitlements WHERE userId = ?
    `).all(userId) as any[];

    return rows.map((r) => ({
      id: String(r.id),
      userId: r.userId,
      assessmentId: r.assessmentId,
      grantedAt: r.grantedAt,
      expiresAt: r.expiresAt || null,
      grantedBy: r.grantedBy || 'SYSTEM',
    }));
  }

  public hasActiveAssessmentEntitlement(userId: string, assessmentId: string): boolean {
    if (!userId || !assessmentId) return false;
    const row = this.sqliteDb.prepare(`
      SELECT * FROM assessment_entitlements WHERE userId = ? AND assessmentId = ?
    `).get(userId, assessmentId) as any;
    if (!row) return false;
    if (row.expiresAt) {
      const expMs = new Date(row.expiresAt).getTime();
      if (!isNaN(expMs) && expMs <= Date.now()) {
        return false;
      }
    }
    return true;
  }

  // ==========================================
  // PAYMENT ORDERS & FULFILLMENT (PHASE E)
  // ==========================================

  private mapDbPaymentOrder(row: any): PaymentOrder {
    let metadata: any = null;
    if (row.metadata) {
      try {
        metadata = typeof row.metadata === 'string' ? JSON.parse(row.metadata) : row.metadata;
      } catch {
        metadata = null;
      }
    }
    return {
      id: row.id,
      userId: row.userId,
      productType: row.productType as PaymentProductType,
      productId: row.productId,
      amount: row.amount,
      currency: row.currency || 'INR',
      status: row.status as PaymentOrderStatus,
      razorpayOrderId: row.razorpayOrderId || null,
      razorpayPaymentId: row.razorpayPaymentId || null,
      razorpaySignature: row.razorpaySignature || null,
      metadata,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
  }

  public createPaymentOrder(order: {
    id: string;
    userId: string;
    productType: PaymentProductType;
    productId: string;
    amount: number;
    currency?: string;
    status?: PaymentOrderStatus;
    razorpayOrderId?: string | null;
    metadata?: any;
    is_test?: number;
  }): PaymentOrder {
    const now = new Date().toISOString();
    const status = order.status || 'CREATED';
    const currency = order.currency || 'INR';
    const metadataStr = order.metadata ? JSON.stringify(order.metadata) : null;
    const isTest = order.is_test ?? 0;

    this.sqliteDb.prepare(`
      INSERT INTO payment_orders (
        id, userId, productType, productId, amount, currency, status, razorpayOrderId, metadata, is_test, createdAt, updatedAt
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      order.id,
      order.userId,
      order.productType,
      order.productId,
      order.amount,
      currency,
      status,
      order.razorpayOrderId || null,
      metadataStr,
      isTest,
      now,
      now
    );

    return {
      id: order.id,
      userId: order.userId,
      productType: order.productType,
      productId: order.productId,
      amount: order.amount,
      currency,
      status,
      razorpayOrderId: order.razorpayOrderId || null,
      razorpayPaymentId: null,
      razorpaySignature: null,
      metadata: order.metadata || null,
      createdAt: now,
      updatedAt: now,
    };
  }

  public getPaymentOrderById(orderId: string): PaymentOrder | null {
    if (!orderId) return null;
    const row = this.sqliteDb.prepare('SELECT * FROM payment_orders WHERE id = ?').get(orderId) as any;
    return row ? this.mapDbPaymentOrder(row) : null;
  }

  public getPaymentOrderByRazorpayOrderId(razorpayOrderId: string): PaymentOrder | null {
    if (!razorpayOrderId) return null;
    const row = this.sqliteDb.prepare('SELECT * FROM payment_orders WHERE razorpayOrderId = ?').get(razorpayOrderId) as any;
    return row ? this.mapDbPaymentOrder(row) : null;
  }

  public getPendingPaymentOrdersForUser(userId: string): PaymentOrder[] {
    if (!userId) return [];
    const rows = this.sqliteDb.prepare(`
      SELECT * FROM payment_orders
      WHERE userId = ? AND status = 'CREATED'
      ORDER BY createdAt DESC
    `).all(userId) as any[];
    return rows.map((r) => this.mapDbPaymentOrder(r));
  }

  public getAllPendingPaymentOrders(limit = 100): PaymentOrder[] {
    const rows = this.sqliteDb.prepare(`
      SELECT * FROM payment_orders
      WHERE status = 'CREATED'
      ORDER BY createdAt DESC
      LIMIT ?
    `).all(limit) as any[];
    return rows.map((r) => this.mapDbPaymentOrder(r));
  }

  public updatePaymentOrderStatus(
    orderId: string,
    status: PaymentOrderStatus,
    razorpayPaymentId?: string | null,
    razorpaySignature?: string | null
  ): PaymentOrder | null {
    const now = new Date().toISOString();
    this.sqliteDb.prepare(`
      UPDATE payment_orders
      SET status = ?,
          razorpayPaymentId = COALESCE(?, razorpayPaymentId),
          razorpaySignature = COALESCE(?, razorpaySignature),
          updatedAt = ?
      WHERE id = ?
    `).run(status, razorpayPaymentId || null, razorpaySignature || null, now, orderId);

    return this.getPaymentOrderById(orderId);
  }

  public fulfillPaymentOrderAtomic(
    orderId: string,
    razorpayPaymentId?: string | null,
    razorpaySignature?: string | null
  ): { success: boolean; alreadyFulfilled: boolean; order: PaymentOrder } {
    return this.sqliteDb.transaction(() => {
      const row = this.sqliteDb.prepare('SELECT * FROM payment_orders WHERE id = ?').get(orderId) as any;
      if (!row) {
        throw new Error(`Payment order not found: ${orderId}`);
      }

      const order = this.mapDbPaymentOrder(row);

      // If already fulfilled/captured, return idempotent success
      if (order.status === 'CAPTURED') {
        return { success: true, alreadyFulfilled: true, order };
      }

      const now = new Date().toISOString();

      // 1. Fulfill product based on type
      if (order.productType === 'SUBSCRIPTION') {
        const targetPlan = (order.productId as any) || 'PLUS';
        const oneMonthMs = 30 * 24 * 60 * 60 * 1000;
        const pStart = now;
        const pEnd = new Date(Date.now() + oneMonthMs).toISOString();

        this.updateSubscriptionState(order.userId, {
          plan: targetPlan,
          status: 'active',
          currentPeriodStart: pStart,
          currentPeriodEnd: pEnd,
          cancelAtPeriodEnd: false,
          pendingPlan: null,
        });

        this.createPremiumSubscription(
          order.userId,
          order.razorpayOrderId || null,
          `plan_${String(targetPlan).toLowerCase()}`,
          'ACTIVE',
          order.is_test || 0,
          String(targetPlan),
          pStart,
          pEnd
        );
        this.ensureCurrentPremiumCreditPeriod(order.userId);
      } else if (order.productType === 'ASSESSMENT') {
        // Unlock individual assessment entitlement (source: PURCHASED)
        this.grantAssessmentEntitlement(order.userId, order.productId, null, 'PURCHASE');
      } else if (order.productType === 'AI_CREDIT_PACK') {
        // Determine purchased credits
        const credits =
          order.metadata && typeof order.metadata.credits === 'number'
            ? order.metadata.credits
            : (order.productId === 'pack_50' ? 50 : order.productId === 'pack_25' ? 25 : 10);

        const existingGrant = this.sqliteDb.prepare(`
          SELECT id FROM deep_ai_credit_ledger
          WHERE userId = ? AND source = 'PURCHASED' AND transactionType = 'GRANT' AND description LIKE ?
        `).get(order.userId, `%${order.id}%`);

        if (!existingGrant) {
          this.sqliteDb.prepare(`
            INSERT INTO deep_ai_credit_ledger (
              userId, amount, source, transactionType, description, createdAt
            ) VALUES (?, ?, 'PURCHASED', 'GRANT', ?, ?)
          `).run(
            order.userId,
            credits,
            `AI Credit Pack Purchase: ${order.productId} (${order.id})`,
            now
          );
        }
      }

      // 2. Mark order as CAPTURED
      this.sqliteDb.prepare(`
        UPDATE payment_orders
        SET status = 'CAPTURED',
            razorpayPaymentId = COALESCE(?, razorpayPaymentId),
            razorpaySignature = COALESCE(?, razorpaySignature),
            updatedAt = ?
        WHERE id = ?
      `).run(razorpayPaymentId || null, razorpaySignature || null, now, orderId);

      const updatedRow = this.sqliteDb.prepare('SELECT * FROM payment_orders WHERE id = ?').get(orderId) as any;
      return {
        success: true,
        alreadyFulfilled: false,
        order: this.mapDbPaymentOrder(updatedRow),
      };
    })();

    if (res.success && res.order) {
      setImmediate(() => {
        dispatchPurchaseAppreciationNotification(this, res.order).catch((err) => {
          console.error('[Purchase Appreciation Notification Error]', err);
        });
      });
    }

    return res;
  }

  public getAllPaymentOrders(limit = 100, includeTest = false): PaymentOrder[] {
    const query = includeTest
      ? `
        SELECT * FROM payment_orders
        WHERE productType IN ('AI_CREDIT_PACK', 'ASSESSMENT')
        ORDER BY createdAt DESC
        LIMIT ?
      `
      : `
        SELECT * FROM payment_orders
        WHERE (is_test = 0 OR is_test IS NULL)
        AND productType IN ('AI_CREDIT_PACK', 'ASSESSMENT')
        ORDER BY createdAt DESC
        LIMIT ?
      `;
    const rows = this.sqliteDb.prepare(query).all(limit) as any[];

    return rows.map((r) => this.mapDbPaymentOrder(r));
  }

  public mapDbPremiumSubscription(row: any): PremiumSubscription {
    return {
      id: row.id,
      userId: row.userId,
      provider: (row.provider as any) || 'RAZORPAY',
      razorpaySubscriptionId: row.razorpaySubscriptionId || null,
      razorpayPlanId: row.razorpayPlanId || null,
      status: row.status as SubscriptionStatus,
      currentPeriodStart: row.currentPeriodStart || null,
      currentPeriodEnd: row.currentPeriodEnd || null,
      cancelledAt: row.cancelledAt || null,
      endedAt: row.endedAt || null,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
  }

  public createPremiumSubscription(
    userId: string,
    razorpaySubscriptionId?: string | null,
    razorpayPlanId?: string | null,
    status: SubscriptionStatus = 'CREATED',
    is_test: number = 0,
    plan: string = 'PLUS',
    periodStart?: string | null,
    periodEnd?: string | null
  ): PremiumSubscription {
    const existing = this.sqliteDb.prepare('SELECT id FROM premium_subscriptions WHERE userId = ? ORDER BY createdAt DESC LIMIT 1').get(userId) as any;
    const now = new Date().toISOString();
    const pStart = periodStart || now;
    const pEnd = periodEnd || new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();

    if (existing) {
      this.sqliteDb.prepare(`
        UPDATE premium_subscriptions
        SET razorpaySubscriptionId = COALESCE(?, razorpaySubscriptionId),
            razorpayPlanId = COALESCE(?, razorpayPlanId),
            status = ?,
            plan = ?,
            currentPeriodStart = COALESCE(?, currentPeriodStart),
            currentPeriodEnd = COALESCE(?, currentPeriodEnd),
            is_test = ?,
            updatedAt = ?
        WHERE id = ?
      `).run(razorpaySubscriptionId || null, razorpayPlanId || null, status, plan, pStart, pEnd, is_test || 0, now, existing.id);
      return this.getPremiumSubscriptionById(existing.id)!;
    }

    const id = `sub_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;

    this.sqliteDb.prepare(`
      INSERT INTO premium_subscriptions (
        id, userId, provider, razorpaySubscriptionId, razorpayPlanId, status, plan,
        currentPeriodStart, currentPeriodEnd, cancelledAt, endedAt, is_test, createdAt, updatedAt
      ) VALUES (?, ?, 'RAZORPAY', ?, ?, ?, ?, ?, ?, NULL, NULL, ?, ?, ?)
    `).run(id, userId, razorpaySubscriptionId || null, razorpayPlanId || null, status, plan, pStart, pEnd, is_test || 0, now, now);

    return this.getPremiumSubscriptionById(id)!;
  }

  public getPremiumSubscriptionById(id: string): PremiumSubscription | null {
    if (!id) return null;
    const row = this.sqliteDb.prepare('SELECT * FROM premium_subscriptions WHERE id = ?').get(id) as any;
    return row ? this.mapDbPremiumSubscription(row) : null;
  }

  public getPremiumSubscriptionByRazorpayId(razorpaySubscriptionId: string): PremiumSubscription | null {
    if (!razorpaySubscriptionId) return null;
    const row = this.sqliteDb.prepare('SELECT * FROM premium_subscriptions WHERE razorpaySubscriptionId = ?').get(razorpaySubscriptionId) as any;
    return row ? this.mapDbPremiumSubscription(row) : null;
  }

  public getActivePremiumSubscriptionForUser(userId: string): PremiumSubscription | null {
    if (!userId) return null;
    const row = this.sqliteDb.prepare(`
      SELECT * FROM premium_subscriptions
      WHERE userId = ? AND status IN ('ACTIVE', 'AUTHENTICATED')
      ORDER BY createdAt DESC LIMIT 1
    `).get(userId) as any;
    return row ? this.mapDbPremiumSubscription(row) : null;
  }

  public getAllPremiumSubscriptions(limit = 100, includeTest = false): (PremiumSubscription & { userEmail?: string; userName?: string; razorpayOrderId?: string | null; razorpayPaymentId?: string | null })[] {
    const query = includeTest
      ? `
        SELECT s.*, u.email as userEmail, u.name as userName, u.plan as userPlan, u.subscriptionStatus as userSubStatus,
               u.currentPeriodStart as userPeriodStart, u.currentPeriodEnd as userPeriodEnd
        FROM premium_subscriptions s
        LEFT JOIN users u ON s.userId = u.id
        ORDER BY s.createdAt DESC
      `
      : `
        SELECT s.*, u.email as userEmail, u.name as userName, u.plan as userPlan, u.subscriptionStatus as userSubStatus,
               u.currentPeriodStart as userPeriodStart, u.currentPeriodEnd as userPeriodEnd
        FROM premium_subscriptions s
        LEFT JOIN users u ON s.userId = u.id
        WHERE (s.is_test = 0 OR s.is_test IS NULL)
        ORDER BY s.createdAt DESC
      `;
    const rows = this.sqliteDb.prepare(query).all() as any[];

    // Group by userId to select authoritative current subscription record per user
    const userMap = new Map<string, any[]>();
    for (const r of rows) {
      if (!userMap.has(r.userId)) {
        userMap.set(r.userId, []);
      }
      userMap.get(r.userId)!.push(r);
    }

    const result: any[] = [];

    for (const [userId, userRows] of userMap.entries()) {
      userRows.sort((a, b) => {
        const aPlan = (a.plan || a.userPlan || '').toUpperCase();
        const bPlan = (b.plan || b.userPlan || '').toUpperCase();
        const aStatus = (a.status || a.userSubStatus || '').toUpperCase();
        const bStatus = (b.status || b.userSubStatus || '').toUpperCase();

        const aIsPaid = aPlan === 'PLUS' || aPlan === 'PRO' || aPlan === 'PREMIUM';
        const bIsPaid = bPlan === 'PLUS' || bPlan === 'PRO' || bPlan === 'PREMIUM';

        const aIsActive = aStatus === 'ACTIVE';
        const bIsActive = bStatus === 'ACTIVE';

        if ((aIsActive && aIsPaid) && !(bIsActive && bIsPaid)) return -1;
        if (!(aIsActive && aIsPaid) && (bIsActive && bIsPaid)) return 1;

        if (aIsActive && !bIsActive) return -1;
        if (!aIsActive && bIsActive) return 1;

        const aHasPeriod = Boolean(a.currentPeriodEnd || a.userPeriodEnd);
        const bHasPeriod = Boolean(b.currentPeriodEnd || b.userPeriodEnd);
        if (aHasPeriod && !bHasPeriod) return -1;
        if (!aHasPeriod && bHasPeriod) return 1;

        return new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime();
      });

      const bestRow = userRows[0];

      const subOrder = this.sqliteDb.prepare(`
        SELECT * FROM payment_orders
        WHERE userId = ? AND productType = 'SUBSCRIPTION'
        ORDER BY createdAt DESC LIMIT 1
      `).get(userId) as any;

      let resolvedPlan = (bestRow.userPlan || '').toUpperCase();
      const rPlan = (bestRow.razorpayPlanId || '').toLowerCase();
      if (rPlan.includes('pro') || resolvedPlan === 'PRO') {
        resolvedPlan = 'PRO';
      } else if (rPlan.includes('plus') || resolvedPlan === 'PLUS' || resolvedPlan === 'PREMIUM') {
        resolvedPlan = 'PLUS';
      } else if (!resolvedPlan) {
        resolvedPlan = 'FREE';
      }

      const status = ((bestRow.status && bestRow.status.toUpperCase() !== 'INACTIVE' ? bestRow.status : bestRow.userSubStatus) || 'INACTIVE').toUpperCase();
      const currentPeriodStart = bestRow.currentPeriodStart || bestRow.userPeriodStart || null;
      const currentPeriodEnd = bestRow.currentPeriodEnd || bestRow.userPeriodEnd || null;

      result.push({
        ...this.mapDbPremiumSubscription({
          ...bestRow,
          plan: resolvedPlan,
          status,
          currentPeriodStart,
          currentPeriodEnd,
        }),
        plan: resolvedPlan,
        userEmail: bestRow.userEmail,
        userName: bestRow.userName,
        razorpaySubscriptionId: bestRow.razorpaySubscriptionId || (subOrder ? subOrder.razorpayOrderId : null),
        razorpayPlanId: bestRow.razorpayPlanId || (resolvedPlan === 'PRO' ? 'plan_pro' : resolvedPlan === 'PLUS' ? 'plan_plus' : null),
        razorpayOrderId: subOrder ? subOrder.razorpayOrderId : null,
        razorpayPaymentId: subOrder ? subOrder.razorpayPaymentId : null,
      });
    }

    return result.slice(0, limit);
  }

  public updatePremiumSubscription(
    id: string,
    data: Partial<PremiumSubscription>
  ): PremiumSubscription | null {
    const now = new Date().toISOString();
    const existing = this.getPremiumSubscriptionById(id);
    if (!existing) return null;

    const fields: string[] = [];
    const values: any[] = [];

    if (data.status !== undefined) {
      fields.push('status = ?');
      values.push(data.status);
    }
    if (data.razorpaySubscriptionId !== undefined) {
      fields.push('razorpaySubscriptionId = ?');
      values.push(data.razorpaySubscriptionId);
    }
    if (data.razorpayPlanId !== undefined) {
      fields.push('razorpayPlanId = ?');
      values.push(data.razorpayPlanId);
    }
    if (data.currentPeriodStart !== undefined) {
      fields.push('currentPeriodStart = ?');
      values.push(data.currentPeriodStart);
    }
    if (data.currentPeriodEnd !== undefined) {
      fields.push('currentPeriodEnd = ?');
      values.push(data.currentPeriodEnd);
    }
    if (data.cancelledAt !== undefined) {
      fields.push('cancelledAt = ?');
      values.push(data.cancelledAt);
    }
    if (data.endedAt !== undefined) {
      fields.push('endedAt = ?');
      values.push(data.endedAt);
    }

    fields.push('updatedAt = ?');
    values.push(now);
    values.push(id);

    this.sqliteDb.prepare(`
      UPDATE premium_subscriptions
      SET ${fields.join(', ')}
      WHERE id = ?
    `).run(...values);

    return this.getPremiumSubscriptionById(id);
  }

  public fulfillSubscriptionActivationAtomic(
    subscriptionId: string,
    periodStart?: string | null,
    periodEnd?: string | null
  ): { success: boolean; alreadyActive: boolean; subscription: PremiumSubscription } {
    return this.sqliteDb.transaction(() => {
      const subRow = this.sqliteDb.prepare('SELECT * FROM premium_subscriptions WHERE id = ?').get(subscriptionId) as any;
      if (!subRow) {
        throw new Error(`Premium subscription not found: ${subscriptionId}`);
      }

      const subscription = this.mapDbPremiumSubscription(subRow);
      const now = new Date();
      const nowIso = now.toISOString();

      const pStart = periodStart || subscription.currentPeriodStart || nowIso;
      const pEnd = periodEnd || subscription.currentPeriodEnd || new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000).toISOString();

      if (subscription.status === 'ACTIVE') {
        // Idempotent: update user profile & ensure current period without double grants
        this.sqliteDb.prepare(`
          UPDATE users
          SET plan = 'PREMIUM',
              subscriptionStatus = 'active',
              subscriptionExpiresAt = ?
          WHERE id = ?
        `).run(pEnd, subscription.userId);

        this.ensureCurrentPremiumCreditPeriod(subscription.userId);
        return { success: true, alreadyActive: true, subscription };
      }

      // Transition to ACTIVE
      this.sqliteDb.prepare(`
        UPDATE premium_subscriptions
        SET status = 'ACTIVE',
            currentPeriodStart = ?,
            currentPeriodEnd = ?,
            updatedAt = ?
        WHERE id = ?
      `).run(pStart, pEnd, nowIso, subscriptionId);

      // Synchronize User profile
      this.sqliteDb.prepare(`
        UPDATE users
        SET plan = 'PREMIUM',
            subscriptionStatus = 'active',
            subscriptionExpiresAt = ?
        WHERE id = ?
      `).run(pEnd, subscription.userId);

      // Ensure single period grant in deep_ai_premium_periods
      this.ensureCurrentPremiumCreditPeriod(subscription.userId);

      const updatedSub = this.getPremiumSubscriptionById(subscriptionId)!;
      return { success: true, alreadyActive: false, subscription: updatedSub };
    })();
  }

  public cancelPremiumSubscription(subscriptionId: string): PremiumSubscription | null {
    const sub = this.getPremiumSubscriptionById(subscriptionId);
    if (!sub) return null;

    const nowIso = new Date().toISOString();
    return this.updatePremiumSubscription(subscriptionId, {
      status: 'CANCELLED',
      cancelledAt: nowIso,
    });
  }

  // ----------------------------------------------------
  // Phase H: Advertisement & Sponsor System Methods
  // ----------------------------------------------------

  public getActiveAdvertisement(placement: string = 'DASHBOARD_SIDEBAR', includeTest: boolean = false): Advertisement | null {
    const ads = this.getActiveAdvertisements(placement, includeTest);
    return ads.length > 0 ? ads[0] : null;
  }

  public getActiveAdvertisements(placement: string = 'DASHBOARD_SIDEBAR', includeTest: boolean = false): Advertisement[] {
    let query = `
      SELECT * FROM advertisements
      WHERE status = 'ACTIVE'
        AND (placement = ? OR placement LIKE '%' || ? || '%' OR (? = 'DASHBOARD_SIDEBAR' AND (placement = 'DASHBOARD_BOTTOM' OR placement LIKE '%DASHBOARD_BOTTOM%')) OR (? = 'DASHBOARD_BOTTOM' AND (placement = 'DASHBOARD_SIDEBAR' OR placement LIKE '%DASHBOARD_SIDEBAR%')))
    `;
    if (!includeTest) {
      query += ` AND (is_test = 0 OR is_test IS NULL)`;
    }
    query += ` ORDER BY priority DESC, createdAt DESC`;
    const rows = this.sqliteDb.prepare(query).all(placement, placement, placement, placement) as any[];

    const nowMs = Date.now();
    const eligible: Advertisement[] = [];
    for (const row of rows) {
      if (row.startAt) {
        const startMs = new Date(row.startAt).getTime();
        if (!isNaN(startMs) && startMs > nowMs) continue; // Future ad not started yet
      }
      if (row.endAt) {
        const endMs = new Date(row.endAt).getTime();
        if (!isNaN(endMs) && endMs < nowMs) continue; // Expired ad
      }
      eligible.push(row as Advertisement);
    }

    return eligible;
  }

  public getAdvertisementAnalytics(adId: string): { impressions: number; clicks: number; ctr: number } {
    const impRow = this.sqliteDb.prepare(`
      SELECT COUNT(*) as count FROM advertisement_events
      WHERE adId = ? AND eventType = 'IMPRESSION'
    `).get(adId) as any;

    const clickRow = this.sqliteDb.prepare(`
      SELECT COUNT(*) as count FROM advertisement_events
      WHERE adId = ? AND eventType = 'CLICK'
    `).get(adId) as any;

    const impressions = impRow ? impRow.count : 0;
    const clicks = clickRow ? clickRow.count : 0;
    const ctr = impressions > 0 ? Number(((clicks / impressions) * 100).toFixed(2)) : 0;

    return { impressions, clicks, ctr };
  }

  public recordAdvertisementEvent(
    adId: string,
    eventType: string,
    userId?: string | null,
    sessionId?: string | null,
    placement?: string | null,
    isTest: number = 0
  ): { success: boolean; eventId?: string } {
    const ad = this.getAdvertisementById(adId);
    if (!ad) return { success: false };

    const id = `adevent_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
    const now = new Date().toISOString();

    this.sqliteDb.prepare(`
      INSERT INTO advertisement_events (id, adId, eventType, userId, sessionId, placement, createdAt, is_test)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(id, adId, eventType, userId || null, sessionId || null, placement || ad.placement, now, isTest || 0);

    return { success: true, eventId: id };
  }

  public getAllAdvertisements(includeTest: boolean = true): Advertisement[] {
    let query = `SELECT * FROM advertisements`;
    if (!includeTest) {
      query += ` WHERE (is_test = 0 OR is_test IS NULL)`;
    }
    query += ` ORDER BY priority DESC, createdAt DESC`;
    const rows = this.sqliteDb.prepare(query).all() as any[];

    return rows.map((ad) => {
      const stats = this.getAdvertisementAnalytics(ad.id);
      return {
        ...ad,
        impressionsCount: stats.impressions,
        clicksCount: stats.clicks,
        ctr: stats.ctr,
      };
    });
  }

  public getAdvertisementById(id: string): Advertisement | null {
    const row = this.sqliteDb.prepare(`SELECT * FROM advertisements WHERE id = ?`).get(id) as any;
    if (!row) return null;
    const stats = this.getAdvertisementAnalytics(id);
    return {
      ...row,
      impressionsCount: stats.impressions,
      clicksCount: stats.clicks,
      ctr: stats.ctr,
    };
  }

  public createAdvertisement(data: Partial<Advertisement>): Advertisement {
    const id = data.id || `ad_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
    const now = new Date().toISOString();

    this.sqliteDb.prepare(`
      INSERT INTO advertisements (
        id, sponsorName, title, description, logoUrl, bannerImageUrl, cardImageUrl,
        destinationUrl, ctaText, adType, placement, status, priority, startAt, endAt,
        createdBy, createdAt, updatedAt, is_test
      ) VALUES (
        ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?
      )
    `).run(
      id,
      data.sponsorName,
      data.title,
      data.description || null,
      data.logoUrl || null,
      data.bannerImageUrl || null,
      data.cardImageUrl || null,
      data.destinationUrl,
      data.ctaText || 'Learn More',
      data.adType || 'STRUCTURED_CARD',
      data.placement || 'DASHBOARD_SIDEBAR',
      data.status || 'DRAFT',
      data.priority !== undefined ? data.priority : 10,
      data.startAt || null,
      data.endAt || null,
      data.createdBy || null,
      now,
      now,
      data.is_test || 0
    );

    return this.getAdvertisementById(id)!;
  }

  public updateAdvertisement(id: string, data: Partial<Advertisement>): Advertisement | null {
    const existing = this.sqliteDb.prepare(`SELECT * FROM advertisements WHERE id = ?`).get(id) as any;
    if (!existing) return null;

    const now = new Date().toISOString();
    const fields: string[] = [];
    const params: any[] = [];

    const allowedKeys: (keyof Advertisement)[] = [
      'sponsorName', 'title', 'description', 'logoUrl', 'bannerImageUrl',
      'cardImageUrl', 'destinationUrl', 'ctaText', 'adType', 'placement',
      'status', 'priority', 'startAt', 'endAt', 'is_test'
    ];

    allowedKeys.forEach((key) => {
      if (data[key] !== undefined) {
        fields.push(`${key} = ?`);
        params.push(data[key]);
      }
    });

    if (fields.length === 0) return this.getAdvertisementById(id);

    fields.push('updatedAt = ?');
    params.push(now);
    params.push(id);

    this.sqliteDb.prepare(`
      UPDATE advertisements
      SET ${fields.join(', ')}
      WHERE id = ?
    `).run(...params);

    return this.getAdvertisementById(id);
  }

  public deleteAdvertisement(id: string): boolean {
    const res = this.sqliteDb.prepare(`DELETE FROM advertisements WHERE id = ?`).run(id);
    return res.changes > 0;
  }

  public close() {
    this.sqliteDb.close();
  }
}

export const db = new MemoryDatabase();
