export type Role = 'student' | 'admin' | 'super_admin';

export type NavTab = 'home' | 'tests' | 'vault' | 'leaderboard' | 'admin' | 'settings';

export type TestCategory =
  | 'foundation'
  | 'company'
  | 'coding'
  | 'Quantitative'
  | 'Logical'
  | 'Verbal'
  | 'Technical'
  | 'Full Mock';

export type PrimaryTestCategory = 'foundation' | 'company' | 'coding';

export type VerificationStatus =
  | 'VERIFIED'
  | 'PATTERN_BASED'
  | 'PARTIALLY_VERIFIED'
  | 'UNVERIFIED';

export type DifficultyLevel = 'Easy' | 'Medium' | 'Hard';

export type TestMode = 'exam' | 'practice';

export type NotificationType =
  | 'ANNOUNCEMENT'
  | 'NEW_TEST'
  | 'ASSESSMENT_REMINDER'
  | 'RESULT_AVAILABLE'
  | 'PRACTICE_RECOMMENDATION'
  | 'REVISION_REMINDER'
  | 'LEAGUE_UPDATE'
  | 'LEAGUE_POSITION'
  | 'CAREER_UPDATE'
  | 'AI_CREDIT_WARNING'
  | 'AI_CREDITS_EXHAUSTED'
  | 'SUBSCRIPTION_UPDATE'
  | 'PAYMENT_CONFIRMATION'
  | 'SYSTEM_NOTICE'
  | 'COMPETITION'
  | 'LEADERBOARD'
  | 'ACHIEVEMENT'
  | 'REMINDER'
  | 'SYSTEM';

export type NotificationActionType =
  | 'NONE'
  | 'OPEN_TEST'
  | 'OPEN_LEADERBOARD'
  | 'OPEN_REVISION'
  | 'OPEN_CAREER'
  | 'OPEN_CREDITS'
  | 'OPEN_PROFILE'
  | 'OPEN_ANNOUNCEMENT';

export type NotificationPriority = 'Normal' | 'Important' | 'Critical' | 'NORMAL' | 'IMPORTANT';

export interface AppNotification {
  id: string;
  type: NotificationType;
  title: string;
  message: string;
  createdAt: string;
  expiresAt?: string;
  readAt?: string | null;
  read?: boolean;
  priority?: NotificationPriority;
  actionType?: NotificationActionType | string;
  actionTargetId?: string;
  actionTestId?: string;
  actionTab?: NavTab | string;
  actionLabel?: string;
  actionUrl?: string;
  targetCompany?: string;
  targetUserId?: string;
  audience?: string;
  senderId?: string;
  relatedEntityId?: string;
  metadata?: any;
}

export type SubscriptionPlan = 'FREE' | 'PLUS' | 'PRO' | 'PREMIUM';
export type SubscriptionStatus = 'inactive' | 'active' | 'expired' | 'cancelled' | 'past_due';
export type AssessmentAccessType = 'FREE' | 'PREMIUM';

export interface PlusTestSelection {
  id: string;
  userId: string;
  assessmentId: string;
  selectedAt: string;
}

export interface SubscriptionInfo {
  userId: string;
  plan: SubscriptionPlan;
  status: SubscriptionStatus;
  currentPeriodStart: string | null;
  currentPeriodEnd: string | null;
  cancelAtPeriodEnd: boolean;
  pendingPlan: SubscriptionPlan | null;
  selectedAssessmentIds: string[];
}

export type CreditSource = 'FREE' | 'PURCHASED' | 'PREMIUM';
export type CreditTransactionType =
  | 'GRANT'
  | 'USAGE'
  | 'PURCHASE'
  | 'ADMIN_GRANT'
  | 'ADMIN_DEDUCT'
  | 'REFUND'
  | 'ADJUSTMENT';

export interface DeepAICreditLedgerItem {
  id?: number;
  userId: string;
  transactionType: CreditTransactionType;
  amount: number;
  source: CreditSource;
  referenceId?: string | null;
  metadata?: any;
  createdAt: string;
}

export interface DeepAIPremiumPeriod {
  id: string;
  userId: string;
  periodStart: string;
  periodEnd: string;
  allocatedCredits: number;
  usedCredits: number;
  status: 'ACTIVE' | 'EXPIRED' | 'CANCELLED';
  createdAt: string;
  updatedAt: string;
}

export interface DeepAICreditBalance {
  total?: number;
  totalAvailable?: number;
  free: number;
  purchased: number;
  premium: number;
  isPremiumUser?: boolean;
  premiumPeriodStart?: string | null;
  premiumPeriodEnd?: string | null;
  premiumAllocated?: number | null;
  premiumUsed?: number | null;
  premiumRemaining?: number | null;
  premiumPeriodStatus?: 'ACTIVE' | 'EXPIRED' | 'CANCELLED' | 'NONE';
  ledger?: DeepAICreditLedgerItem[];
}

export interface AssessmentEntitlement {
  id: string;
  userId: string;
  assessmentId: string;
  source: 'PREMIUM' | 'PURCHASED' | 'ADMIN';
  status: 'ACTIVE' | 'EXPIRED' | 'REVOKED';
  provider?: string | null;
  providerOrderId?: string | null;
  purchasedAt: string;
  expiresAt?: string | null;
  metadata?: any;
  createdAt: string;
  updatedAt: string;
}

export interface DeepAISession {
  id: string;
  userId: string;
  assessmentId?: string;
  questionId: string;
  creditLedgerReference?: number | null;
  mode: 'practice';
  messageCount: number;
  maxMessages: number;
  status: 'ACTIVE' | 'CLOSED';
  createdAt: string;
  updatedAt: string;
}

export type PaymentProductType = 'ASSESSMENT' | 'AI_CREDIT_PACK';

export type PaymentOrderStatus =
  | 'CREATED'
  | 'AUTHORIZED'
  | 'CAPTURED'
  | 'FAILED'
  | 'REFUNDED'
  | 'CANCELLED';

export type FulfillmentStatus =
  | 'FULFILLED'
  | 'PENDING'
  | 'RECONCILIATION_REQUIRED'
  | 'NOT_FULFILLED'
  | 'UNMATCHED';

export interface PaymentOrder {
  id: string;
  internalOrderId?: string | null;
  userId?: string | null;
  userName?: string | null;
  userEmail?: string | null;
  productType?: PaymentProductType | string | null;
  productId?: string | null;
  productTitle?: string | null;
  amount: number; // in integer paise (e.g. 2900 = ₹29)
  currency: string;
  status: PaymentOrderStatus; // Razorpay Payment Status (CAPTURED, CREATED, FAILED, etc.)
  fulfillmentStatus?: FulfillmentStatus; // Distinct Fulfillment Status
  isUnmatched?: boolean;
  razorpayOrderId?: string | null;
  razorpayPaymentId?: string | null;
  razorpaySignature?: string | null;
  metadata?: any;
  createdAt: string;
  updatedAt?: string;
}

export interface CreditPackConfig {
  id: string;
  credits: number;
  pricePaise: number;
  title: string;
  badge?: string;
  popular?: boolean;
}

export type SubscriptionStatus =
  | 'CREATED'
  | 'AUTHENTICATED'
  | 'ACTIVE'
  | 'PENDING'
  | 'HALTED'
  | 'CANCELLED'
  | 'EXPIRED'
  | 'COMPLETED';

export interface PremiumSubscription {
  id: string;
  userId: string;
  provider: 'RAZORPAY';
  razorpaySubscriptionId?: string | null;
  razorpayPlanId?: string | null;
  status: SubscriptionStatus;
  currentPeriodStart?: string | null;
  currentPeriodEnd?: string | null;
  cancelledAt?: string | null;
  endedAt?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface SubscriptionPlanConfig {
  id: string;
  name: string;
  amountPaise: number;
  currency: string;
  billingInterval: 'monthly';
  premiumCreditAllowance: number;
}

export interface PaymentConfigResponse {
  keyId: string;
  testMode: boolean;
  currency: string;
  creditPacks: CreditPackConfig[];
  assessmentPricePaise: number;
  subscriptionPlan?: SubscriptionPlanConfig;
}

export interface User {
  id: string;
  email: string;
  name: string;
  college?: string;
  targetCompany?: string;
  targetRole?: string;
  phone?: string;
  avatarUrl?: string;
  avatar?: string;
  linkedIn?: string;
  github?: string;
  portfolio?: string;
  role: Role;
  totalPoints: number;
  totalTestsAttempted: number;
  totalCorrect: number;
  totalIncorrect: number;
  averageAccuracy: number;
  averageAccuracyPercentage?: number;
  averageTimePerQuestionSeconds: number;
  globalRank?: number;
  currentLeague?: string;
  weeklyXp?: number;
  readNotificationIds?: string[];
  createdAt: string;

  // Account Access & Ban Management (Phase H.5)
  accountStatus?: 'ACTIVE' | 'TEMPORARILY_BANNED' | 'PERMANENTLY_BANNED' | 'DELETED';
  bannedUntil?: string | null;
  banReason?: string | null;
  bannedBy?: string | null;
  bannedAt?: string | null;
  deletedAt?: string | null;
  deletedBy?: string | null;

  // Future Payment Provider fields (nullable)
  provider?: string | null;
  providerCustomerId?: string | null;
  providerSubscriptionId?: string | null;
  currentPeriodStart?: string | null;
  currentPeriodEnd?: string | null;
}

export interface DeepAIUsageRecord {
  id?: number;
  userId: string;
  requestCount: number;
  inputTokens: number;
  outputTokens: number;
  estimatedCost: number;
  periodStart: string;
  periodEnd: string;
  createdAt?: string;
}

export interface DeepAIEntitlementStatus {
  eligible: boolean;
  isPremium: boolean;
  status: 'eligible' | 'locked';
  source?: CreditSource | 'NONE';
  remainingCredits: number;
  creditBreakdown?: {
    free: number;
    purchased: number;
    premium: number;
  };
  reason?: string;
  activeSession?: DeepAISession | null;
  currentUsage?: {
    requestCount: number;
    inputTokens: number;
    outputTokens: number;
    estimatedCost: number;
  };
}

export type UserProfile = User;

export type LeagueTier =
  | 'Bronze'
  | 'Silver'
  | 'Gold'
  | 'Platinum'
  | 'Diamond'
  | 'Heroic'
  | 'Elite Heroic'
  | 'Master'
  | 'Elite Master';

export interface WeeklySeason {
  id: string;
  status: 'ACTIVE' | 'FINALIZED';
  startTime: string;
  endTime: string;
}

export interface WeeklyStanding {
  userId: string;
  seasonId: string;
  groupId: string;
  league: LeagueTier | string;
  weeklyXp: number;
  rank?: number | null;
  movement?: 'PROMOTE' | 'STAY' | 'DEMOTE' | 'PENDING' | string;
}

export interface QuestionOption {
  id: 'A' | 'B' | 'C' | 'D';
  text: string;
}

export interface BaseQuestion {
  title?: string;
  provenance?: string;
  id: string;
  testSeriesId: string;
  questionText: string;
  topic: string;
  subTopic?: string;
  difficulty: DifficultyLevel;
  companyTag?: string;
  yearTag?: string;
  explanation: string;
  shortcutFormula?: string;
  stimulusId?: string;
  stimulus?: DataStimulus;
}

export interface MCQQuestion extends BaseQuestion {
  questionType: 'MCQ' | 'MCQ_SINGLE' | 'MCQ_MULTIPLE' | 'PSEUDOCODE';
  options: QuestionOption[];
  correctOption: 'A' | 'B' | 'C' | 'D' | string | string[];
  codeSnippet?: string;
}

export interface CodingQuestion extends BaseQuestion {
  questionType: 'CODING';
  codingConfig: CodingConfig;
  problemStatement?: string;
  inputFormat?: string;
  outputFormat?: string;
  constraints?: string[];
  examples?: any[];
  starterCode?: any;
  supportedLanguages?: any[];
  timeLimitMs?: number;
  memoryLimitMb?: number;
  testCases?: any[];
}

export interface CodeOutputQuestion extends BaseQuestion {
  questionType: 'CODE_OUTPUT';
  codeSnippet: string;
  options?: QuestionOption[];
  correctOption?: string;
}

export interface DebuggingQuestion extends BaseQuestion {
  questionType: 'DEBUGGING';
  codeSnippet: string;
  codingConfig?: CodingConfig;
  options?: QuestionOption[];
  correctOption?: string;
}

export interface SQLQuestion extends BaseQuestion {
  questionType: 'SQL';
  codingConfig?: CodingConfig;
  options?: QuestionOption[];
  correctOption?: string;
}

export type Question = MCQQuestion | CodingQuestion | CodeOutputQuestion | DebuggingQuestion | SQLQuestion;

export interface CodingConfig {
  problemType?: string;
  languages?: string[];
  defaultLanguage?: string;
  starterCode?: Record<string, string>;
  executionMode?: string;
  timeLimitMs?: number;
  memoryLimitMb?: number;
  problemStatement?: string;
  inputFormat?: string;
  outputFormat?: string;
  constraints?: string[];
  examples?: any[];
  supportedLanguages?: string[];
  publicTests?: any[];
  hiddenTests?: any[];
}

export interface TestSeries {
  id: string;
  title: string;
  description: string;
  category: TestCategory | string;
  company?: string;
  companyId?: string;
  companyName?: string;
  /** Roles that benefit from this test (e.g. 'SDE', 'Analyst') — drives role-based recommendations */
  roles?: string[];
  /** Canonical alias for roles[]. Both are kept for forward compatibility. */
  supportedRoles?: string[];
  skills?: string[];
  topics?: string[];
  difficulty: DifficultyLevel;
  durationMinutes: number;
  duration?: number;
  totalQuestions: number;
  questionCount?: number;
  passingPercentage?: number;
  testType?: 'sectional' | 'full_mock' | 'speed_drill' | 'coding_assessment' | string;
  /** Default mode used when launching this test */
  mode?: TestMode;
  patternVersion?: string;
  verificationStatus?: VerificationStatus;
  isMegaEvent?: boolean;
  megaEventId?: string;
  tags?: string[];
  questions?: Question[];
  attemptsCount?: number;
  avgScore?: number;
  /** Playability gate. 'ready' = has real questions. 'coming_soon' = blueprint only, not playable. */
  status?: 'ready' | 'coming_soon';
  /** Human-readable scoring formula e.g. "+10/-2", "+4/-1", "No negative marking" */
  scoringModel?: string;
  /** Access tier for this assessment. Default is 'FREE'. */
  accessType?: AssessmentAccessType;
}

export interface CompanyInfo {
  id: string;
  name: string;
  badge: string;
  color: string;
  accentBg: string;
  description: string;
  rounds: string[];
  patternSummary: string;
  negativeMarking: string;
  typicalCutoff: string;
  recommendedPrepTime: string;
  activeTestCount: number;
}

export interface QuestionResponse {
  questionId: string;
  selectedOption: string | string[] | null;
  timeSpentSeconds: number;
}

export interface QuestionResponseDetail extends QuestionResponse {
  isCorrect: boolean;
  correctOption: string | string[];
  question: Question;
}

export interface TopicStat {
  topic: string;
  total: number;
  correct: number;
  accuracy: number;
}

export type IntegrityEventType =
  | 'TAB_HIDDEN'
  | 'WINDOW_BLUR'
  | 'COPY_ATTEMPT'
  | 'CUT_ATTEMPT'
  | 'PASTE_ATTEMPT'
  | 'CONTEXT_MENU'
  | 'DEVTOOLS_SHORTCUT';

export interface IntegrityEventPayload {
  attemptId: string;
  eventType: IntegrityEventType;
  metadata?: Record<string, any>;
}

export interface TestAttempt {
  id: string;
  userId: string;
  userName: string;
  userCollege?: string;
  testSeriesId: string;
  testInstanceId?: string;
  testTitle: string;
  companyName?: string;
  mode: TestMode;
  totalQuestions: number;
  attemptedQuestions: number;
  correctCount: number;
  incorrectCount: number;
  unattemptedCount: number;
  scorePoints: number; // (Correct * 10) - (Incorrect * 2) [min 0]
  accuracyPercentage: number;
  timeTakenSeconds: number;
  avgTimePerQuestionSeconds: number;
  submittedAt: string;
  topicBreakdown: Record<string, { total: number; correct: number; accuracy: number }>;
  strengths: string[];
  weaknesses: string[];
  recommendations: string[];
  responses: QuestionResponseDetail[];
  integrityStatus?: 'clean' | 'warning' | 'terminated';
  violationCount?: number;
  terminatedAt?: string | null;
  terminationReason?: string | null;
}

export interface MegaEvent {
  id: string;
  title: string;
  description: string;
  company: string;
  startTime: string;
  endTime: string;
  durationMinutes: number;
  status: 'UPCOMING' | 'LIVE' | 'ENDED';
  testSeriesId: string;
  totalParticipants: number;
  prizes: string;
  bannerTag: string;
  badge: string;
}

export interface BookmarkedItem {
  id: string;
  userId: string;
  questionId: string;
  question: Question;
  addedAt: string;
}

export interface WeakQuestionItem {
  question: Question;
  timesFailed: number;
  lastAttemptedAt: string;
  lastUserAnswer: string;
}

export interface LeaderboardEntry {
  rank: number;
  userId: string;
  userName: string;
  userCollege: string;
  targetCompany?: string;
  totalPoints: number;
  averageAccuracy: number;
  totalTestsAttempted: number;
  avgSpeedSeconds: number;
  badge?: string;
}

export interface AdminStats {
  totalStudents: number;
  totalTestSeries: number;
  totalQuestions: number;
  totalAttempts: number;
  avgPlatformAccuracy: number;
  topPerformingCollege: string;
  recentAttempts: TestAttempt[];
}

export interface AIDoubtResponse {
  answer: string;
  stepByStepSolution: string[];
  keyFormulaOrConcept: string;
  shortcutTrick?: string;
  commonTrapToAvoid?: string;
}

export type AICopilotMode =
  | 'PLACEMENT_COACH'
  | 'PERFORMANCE_COACH'
  | 'LEARNING_ASSISTANT'
  | 'DOUBT_SOLVER'
  | 'STUDY_PLANNER'
  | 'APP_SUPPORT';

export interface AIRecommendedAction {
  label: string;
  actionType:
    | 'navigate_tab'
    | 'open_modal'
    | 'filter_tests'
    | 'NAVIGATE_TAB'
    | 'OPEN_TEST'
    | 'OPEN_PRACTICE'
    | 'OPEN_REVISION'
    | 'OPEN_HISTORY'
    | 'OPEN_CAREER_TRACK'
    | string;
  payload?: any;
  target?: string;
}


export interface AICopilotUserContext {
  userId?: string;
  name?: string;
  targetRole?: string;
  targetCompany?: string;
  lifetimeXp?: number;
  level?: number;
  weeklyXp?: number;
  leagueTier?: string;
}

export interface AICopilotRequest {
  message: string;
  mode?: AICopilotMode;
  userContext?: AICopilotUserContext;
}

export interface AICopilotResponse {
  text: string;
  mode: AICopilotMode;
  actions?: AIRecommendedAction[];
}

export interface ChatMessage {
  id: string;
  sender: 'user' | 'assistant';
  text: string;
  mode?: AICopilotMode;
  actions?: AIRecommendedAction[];
  timestamp: string;
}


// ============================================================================
// PHASE 2: TEST INTELLIGENCE & QUESTION BANK ARCHITECTURE
// ============================================================================

export type ContentLifecycleStatus = 'DRAFT' | 'REVIEW' | 'APPROVED' | 'PUBLISHED' | 'ARCHIVED';
export type ContentVerificationStatus = 'VERIFIED' | 'PATTERN_BASED' | 'PARTIALLY_VERIFIED' | 'UNVERIFIED';
export type QuestionDifficulty = 'Easy' | 'Medium' | 'Hard';
export type QuestionType = 'MCQ' | 'MCQ_SINGLE' | 'MCQ_MULTIPLE' | 'NUMERICAL_INPUT' | 'CODING' | 'CODE_OUTPUT' | 'DEBUGGING' | 'SQL' | 'PSEUDOCODE';

export interface DataStimulus {
  id: string;
  type: 'TABLE' | 'BAR_CHART' | 'LINE_GRAPH' | 'PIE_CHART' | 'CASELET' | 'MIXED_CHART';
  title: string;
  description?: string;
  headers?: string[];
  rows?: Array<Record<string, string | number> | Array<string | number>>;
  dataPoints?: Array<{ label: string; value: number; unit?: string; category?: string }>;
  rawContent?: string;
  source?: string;
  sourceReference?: string;
}

export interface CanonicalQuestion {
  id: string;
  questionType: QuestionType;
  questionText: string;
  options?: { id: string; text: string }[];
  correctAnswer: string | string[];
  explanation: string;
  difficulty: QuestionDifficulty;
  
  category: string;
  skill: string;
  topic: string;
  subtopic?: string;
  
  stimulusId?: string;
  stimulus?: DataStimulus;
  
  supportedRoles?: string[];
  technology?: string[];
  company?: string;
  assessmentBlueprintId?: string;
  
  source?: string;
  sourceReference?: string;
  qualityStatus: ContentLifecycleStatus;
  verificationStatus: ContentVerificationStatus;
  
  tags: string[];
}

export interface BlueprintSection {
  id: string;
  name: string;
  questionCount: number;
  questionTypes: QuestionType[];
  topics: string[];
  difficultyDistribution: { Easy: number; Medium: number; Hard: number };
  marksPerQuestion: number;
  negativeMarking: number;
}

export interface AssessmentBlueprint {
  id: string;
  title: string;
  category: string;
  company?: string;
  supportedRoles: string[];
  
  patternVersion?: string;
  verificationStatus: ContentVerificationStatus;
  source?: string;
  lastReviewed?: string;
  
  duration: number; // minutes
  questionCount: number;
  
  sections: BlueprintSection[];
  difficultyDistribution: { Easy: number; Medium: number; Hard: number };
  
  skills: string[];
  topics: string[];
  scoringModel: string;
  mode: 'exam' | 'practice';
}

export interface TestInstance {
  id: string;
  blueprintId: string;
  userId: string;
  questions: CanonicalQuestion[];
  generatedAt: string;
  status: 'pending' | 'in_progress' | 'completed';
}

// ============================================================================
// PHASE 16: COMPANY ASSESSMENT PATTERN ARCHITECTURE
// ============================================================================

export type SourceEvidenceConfidence = 'HIGH' | 'MEDIUM' | 'LOW' | 'UNVERIFIED';

export interface SourceEvidence {
  source: string;
  sourceType: 'RECRUITMENT_DRIVE' | 'OFFICIAL_SYLLABUS' | 'CANDIDATE_DEBRIEF' | 'PUBLIC_REPORT';
  sourceYear: string;
  retrievedAt: string;
  confidence: SourceEvidenceConfidence;
  notes?: string;
}

export interface CompanyPatternSection {
  id: string;
  name: string;
  questionCount: number;
  durationMinutes: number;
  topics: string[];
  skills: string[];
  questionTypes: QuestionType[];
  difficulty: QuestionDifficulty | 'Mixed';
  scoringModel?: string;
  negativeMarking?: number | string;
  isOptional?: boolean;
  notes?: string;
}

export interface CompanyAssessmentPattern {
  id: string;
  companyId: string;
  companyName: string;
  hiringTrack: string;
  assessmentName: string;
  patternVersion: string;
  applicableRoles: string[];
  
  sections: CompanyPatternSection[];
  totalQuestions: number;
  totalDurationMinutes: number;
  
  skills: string[];
  topics: string[];
  
  scoringModel: string;
  negativeMarkingDescription: string;
  
  evidence: SourceEvidence[];
  confidence: SourceEvidenceConfidence;
  verificationStatus: ContentVerificationStatus;
  status: 'coming_soon' | 'ready';
  
  targetBlueprintId: string;
  catalogueTestId: string;
  notes?: string;
}

// ============================================================================
// PHASE 18E: CODING ASSESSMENT & ISOLATED EXECUTION ARCHITECTURE
// ============================================================================

export type SupportedLanguage = 'javascript' | 'typescript' | 'python' | 'java' | 'cpp';

export type CodeExecutionStatus =
  | 'QUEUED'
  | 'COMPILING'
  | 'COMPILE_ERROR'
  | 'RUNNING'
  | 'TIME_LIMIT_EXCEEDED'
  | 'MEMORY_LIMIT_EXCEEDED'
  | 'RUNTIME_ERROR'
  | 'OUTPUT_LIMIT_EXCEEDED'
  | 'WRONG_ANSWER'
  | 'PASSED'
  | 'SYSTEM_ERROR';

export interface CodeTestCase {
  id: string;
  input: string;
  expectedOutput: string;
  isHidden: boolean;
  explanation?: string;
  weight?: number;
}

export interface TestCaseResult {
  testCaseId: string;
  passed: boolean;
  input: string; // Sanitized: hidden tests redact raw inputs
  expectedOutput?: string; // Redacted for hidden tests
  actualOutput?: string;
  error?: string;
  runtimeMs: number;
  memoryKb: number;
  isHidden: boolean;
  status: CodeExecutionStatus;
}

export interface CodingExecutionRequest {
  submissionId?: string;
  questionId: string;
  userId: string;
  language: SupportedLanguage;
  sourceCode: string;
  customInput?: string;
  isSubmission?: boolean; // false = Run Sample Cases, true = Evaluate All (including Hidden)
}

export interface CodingExecutionResult {
  submissionId: string;
  questionId: string;
  userId: string;
  language: SupportedLanguage;
  status: CodeExecutionStatus;
  compileStatus?: 'SUCCESS' | 'FAILED' | 'SKIPPED';
  compileOutput?: string;
  passedTests: number;
  totalTests: number;
  sampleTestsPassed: number;
  totalSampleTests: number;
  hiddenTestsPassed: number;
  totalHiddenTests: number;
  runtimeMs: number;
  memoryKb: number;
  scorePercentage: number;
  testCaseResults: TestCaseResult[];
  errorMessage?: string;
  executedAt: string;
}

export interface CodingSubmissionRecord {
  id: string;
  userId: string;
  testSeriesId?: string;
  testAttemptId?: string;
  questionId: string;
  language: SupportedLanguage;
  sourceCode: string;
  executionResult: CodingExecutionResult;
  isFinalSubmission: boolean;
  createdAt: string;
}

export interface LanguageExecutionConfig {
  language: SupportedLanguage;
  displayName: string;
  version: string;
  isSupported: boolean;
  fileExtension: string;
  compilerCommand?: string;
  executionCommand: string;
  defaultBoilerplate: string;
  timeLimitMs: number;
  memoryLimitMb: number;
}

export interface CodingExample {
  input: string;
  output: string;
  explanation?: string;
}

export interface CanonicalCodingProblem extends CanonicalQuestion {
  title: string;
  problemStatement: string;
  inputFormat: string;
  outputFormat: string;
  constraints: string[];
  examples: CodingExample[];
  supportedLanguages: SupportedLanguage[];
  starterCode: Record<SupportedLanguage, string>;
  timeLimitMs: number;
  memoryLimitMb: number;
  testCases: CodeTestCase[];
  scoringConfig: {
    model: 'PERCENTAGE_PASSED' | 'ALL_OR_NOTHING';
    hiddenTestWeight: number;
    sampleTestWeight: number;
  };
  // Phase 31C: Dynamic Question Config Metadata
  codingConfig?: CodingConfig;
}

export type PlacementStrategyState =
  | 'NEW_CANDIDATE'
  | 'BUILDING_FOUNDATION'
  | 'FIXING_WEAKNESS'
  | 'COMPANY_READYING'
  | 'REVISION_REQUIRED'
  | 'PERFORMANCE_RECOVERY'
  | 'MAINTAINING';

export interface PlacementPriority {
  title: string;
  reason: string;
  action: AIRecommendedAction;
}

export interface PlacementStrategy {
  state: PlacementStrategyState;
  stateBadgeLabel: string;
  priority: PlacementPriority;
  supportingActions: AIRecommendedAction[];
  contextSummary?: {
    targetCompany: string | null;
    targetRole: string | null;
    performanceTrend: string;
    criticalWeakness: string | null;
    leagueTier: string;
  };
}

export type AdPlacement = 'DASHBOARD_SIDEBAR' | 'DASHBOARD_TOP' | 'LANDING_TOP' | 'LANDING_BOTTOM';
export type AdType = 'STRUCTURED_CARD' | 'OPTIONAL_CREATIVE_CARD';
export type AdStatus = 'DRAFT' | 'ACTIVE' | 'PAUSED' | 'ARCHIVED';
export type AdEventType = 'IMPRESSION' | 'CLICK';

export interface Advertisement {
  id: string;
  sponsorName: string;
  title: string;
  description?: string | null;
  logoUrl?: string | null;
  bannerImageUrl?: string | null;
  cardImageUrl?: string | null;
  destinationUrl: string;
  ctaText: string;
  adType: AdType;
  placement: AdPlacement | string;
  status: AdStatus;
  priority: number;
  startAt?: string | null;
  endAt?: string | null;
  createdBy?: string | null;
  createdAt?: string;
  updatedAt?: string;
  is_test?: number;
  impressionsCount?: number;
  clicksCount?: number;
  ctr?: number;
}

export interface AdvertisementEvent {
  id: string;
  adId: string;
  eventType: AdEventType;
  userId?: string | null;
  sessionId?: string | null;
  placement?: string | null;
  createdAt?: string;
  is_test?: number;
}
