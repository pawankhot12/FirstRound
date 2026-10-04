-- Supabase PostgreSQL Migration for FirstRound
-- Migration Version: 001_initial_schema
-- Notes:
-- 1. All semantic string IDs (like "cat_foundation_quant") from SQLite are preserved as VARCHAR.
-- 2. "users" table is renamed to "profiles" and its primary key references auth.users(id) via UUID.
-- 3. Passwords and emails are omitted from "profiles", relying on Supabase Auth.
-- 4. SQLite TEXT/REAL/INTEGER types are mapped to TIMESTAMPTZ/JSONB/DECIMAL/BOOLEAN where appropriate.

-------------------------------------------------------------------------------
-- 1. EXTENSIONS & ENUMS
-------------------------------------------------------------------------------
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-------------------------------------------------------------------------------
-- 2. REFERENCE TABLES (Publicly readable, Server/Admin writable)
-------------------------------------------------------------------------------

CREATE TABLE public.companies (
  id VARCHAR PRIMARY KEY,
  name VARCHAR,
  badge VARCHAR,
  color VARCHAR,
  "accentBg" VARCHAR,
  description TEXT,
  rounds JSONB,
  "patternSummary" TEXT,
  "negativeMarking" VARCHAR,
  "typicalCutoff" VARCHAR,
  "recommendedPrepTime" VARCHAR,
  "activeTestCount" INTEGER DEFAULT 0
);

CREATE TABLE public.roles (
  id VARCHAR PRIMARY KEY,
  name VARCHAR NOT NULL UNIQUE,
  slug VARCHAR NOT NULL UNIQUE,
  description TEXT,
  status VARCHAR NOT NULL DEFAULT 'draft',
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE public.career_tracks (
  id VARCHAR PRIMARY KEY,
  "roleId" VARCHAR NOT NULL REFERENCES public.roles(id) ON DELETE CASCADE,
  title VARCHAR NOT NULL,
  slug VARCHAR NOT NULL UNIQUE,
  description TEXT,
  status VARCHAR NOT NULL DEFAULT 'draft',
  version INTEGER NOT NULL DEFAULT 1,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "publishedAt" TIMESTAMPTZ
);

CREATE TABLE public.track_stages (
  id VARCHAR PRIMARY KEY,
  "trackId" VARCHAR NOT NULL REFERENCES public.career_tracks(id) ON DELETE CASCADE,
  "stageOrder" INTEGER NOT NULL,
  title VARCHAR NOT NULL,
  description TEXT,
  status VARCHAR NOT NULL DEFAULT 'published',
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE("trackId", "stageOrder")
);

CREATE TABLE public.tests (
  id VARCHAR PRIMARY KEY,
  title VARCHAR,
  description TEXT,
  category VARCHAR,
  company VARCHAR,
  "companyId" VARCHAR REFERENCES public.companies(id) ON DELETE SET NULL,
  "companyName" VARCHAR,
  roles JSONB,
  "supportedRoles" JSONB,
  skills JSONB,
  topics JSONB,
  difficulty VARCHAR,
  "durationMinutes" INTEGER,
  duration INTEGER,
  "totalQuestions" INTEGER,
  "questionCount" INTEGER,
  "passingPercentage" DECIMAL,
  "testType" VARCHAR,
  mode VARCHAR,
  "patternVersion" VARCHAR,
  "verificationStatus" VARCHAR,
  "isMegaEvent" BOOLEAN,
  "megaEventId" VARCHAR,
  tags JSONB,
  "attemptsCount" INTEGER DEFAULT 0,
  "avgScore" DECIMAL DEFAULT 0,
  status VARCHAR,
  "scoringModel" VARCHAR,
  "deletedAt" TIMESTAMPTZ,
  version INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE public.track_items (
  id VARCHAR PRIMARY KEY,
  "stageId" VARCHAR NOT NULL REFERENCES public.track_stages(id) ON DELETE CASCADE,
  "testId" VARCHAR REFERENCES public.tests(id) ON DELETE SET NULL,
  "itemOrder" INTEGER NOT NULL,
  "itemType" VARCHAR NOT NULL,
  "isRequired" BOOLEAN NOT NULL DEFAULT true,
  "completionRule" JSONB,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE public.assessment_roles (
  "assessmentId" VARCHAR NOT NULL REFERENCES public.tests(id) ON DELETE CASCADE,
  "roleId" VARCHAR NOT NULL REFERENCES public.roles(id) ON DELETE CASCADE,
  relevance VARCHAR DEFAULT 'primary',
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY("assessmentId", "roleId")
);

CREATE TABLE public.assessment_companies (
  "assessmentId" VARCHAR NOT NULL REFERENCES public.tests(id) ON DELETE CASCADE,
  "companyId" VARCHAR NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY("assessmentId", "companyId")
);

CREATE TABLE public.track_company_milestones (
  id VARCHAR PRIMARY KEY,
  "trackId" VARCHAR NOT NULL REFERENCES public.career_tracks(id) ON DELETE CASCADE,
  "assessmentId" VARCHAR NOT NULL REFERENCES public.tests(id) ON DELETE CASCADE,
  "stageId" VARCHAR NOT NULL REFERENCES public.track_stages(id) ON DELETE CASCADE,
  "unlockRule" JSONB,
  status VARCHAR NOT NULL DEFAULT 'published',
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE("trackId", "assessmentId")
);

CREATE TABLE public.mega_events (
  id VARCHAR PRIMARY KEY,
  title VARCHAR,
  description TEXT,
  company VARCHAR,
  "startTime" TIMESTAMPTZ,
  "endTime" TIMESTAMPTZ,
  "durationMinutes" INTEGER,
  status VARCHAR,
  "testSeriesId" VARCHAR REFERENCES public.tests(id) ON DELETE SET NULL,
  "totalParticipants" INTEGER DEFAULT 0,
  prizes JSONB,
  "bannerTag" VARCHAR,
  badge VARCHAR
);

CREATE TABLE public.weekly_seasons (
  id VARCHAR PRIMARY KEY,
  status VARCHAR,
  "startTime" TIMESTAMPTZ,
  "endTime" TIMESTAMPTZ
);

-------------------------------------------------------------------------------
-- 3. SERVER-ONLY DATA (Not accessible by browser)
-------------------------------------------------------------------------------

CREATE TABLE public.questions (
  id VARCHAR PRIMARY KEY,
  "testSeriesId" VARCHAR REFERENCES public.tests(id) ON DELETE CASCADE,
  "questionText" TEXT,
  "codeSnippet" TEXT,
  options JSONB,
  "correctOption" VARCHAR,
  topic VARCHAR,
  "subTopic" VARCHAR,
  difficulty VARCHAR,
  "companyTag" VARCHAR,
  "yearTag" VARCHAR,
  explanation TEXT,
  "shortcutFormula" TEXT,
  "stimulusId" VARCHAR,
  stimulus JSONB
);

-------------------------------------------------------------------------------
-- 4. USER-OWNED DATA
-------------------------------------------------------------------------------

-- Profiles (Mapped from SQLite users)
-- Depends on auth.users from Supabase
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  name VARCHAR,
  college VARCHAR,
  "targetCompany" VARCHAR,
  "targetRole" VARCHAR,
  role VARCHAR DEFAULT 'student',
  "totalPoints" INTEGER DEFAULT 0,
  "totalTestsAttempted" INTEGER DEFAULT 0,
  "totalCorrect" INTEGER DEFAULT 0,
  "totalIncorrect" INTEGER DEFAULT 0,
  "averageAccuracy" DECIMAL DEFAULT 0,
  "averageTimePerQuestionSeconds" INTEGER DEFAULT 0,
  "readNotificationIds" JSONB DEFAULT '[]'::jsonb,
  "createdAt" TIMESTAMPTZ DEFAULT now(),
  "competitiveRating" INTEGER DEFAULT 0,
  "currentLeague" VARCHAR DEFAULT 'Bronze',
  "targetRoleId" VARCHAR REFERENCES public.roles(id) ON DELETE SET NULL
);

CREATE TABLE public.test_attempts (
  id VARCHAR PRIMARY KEY,
  "userId" UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
  "userName" VARCHAR,
  "userCollege" VARCHAR,
  "testSeriesId" VARCHAR REFERENCES public.tests(id) ON DELETE CASCADE,
  "testInstanceId" VARCHAR,
  "testTitle" VARCHAR,
  "companyName" VARCHAR,
  mode VARCHAR,
  "totalQuestions" INTEGER,
  "attemptedQuestions" INTEGER,
  "correctCount" INTEGER,
  "incorrectCount" INTEGER,
  "unattemptedCount" INTEGER,
  "scorePoints" INTEGER,
  "accuracyPercentage" INTEGER,
  "timeTakenSeconds" INTEGER,
  "avgTimePerQuestionSeconds" INTEGER,
  "submittedAt" TIMESTAMPTZ,
  "topicBreakdown" JSONB,
  strengths JSONB,
  weaknesses JSONB,
  recommendations JSONB
);

CREATE TABLE public.attempt_responses (
  id SERIAL PRIMARY KEY,
  "attemptId" VARCHAR REFERENCES public.test_attempts(id) ON DELETE CASCADE,
  "questionId" VARCHAR REFERENCES public.questions(id) ON DELETE CASCADE,
  "selectedOption" VARCHAR,
  "timeSpentSeconds" INTEGER,
  "isCorrect" BOOLEAN,
  "correctOption" VARCHAR,
  question TEXT
);

CREATE TABLE public.test_user_history (
  "userId" UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
  "testId" VARCHAR REFERENCES public.tests(id) ON DELETE CASCADE,
  status VARCHAR,
  "firstVisitedAt" TIMESTAMPTZ,
  "lastVisitedAt" TIMESTAMPTZ,
  "lastAttemptAt" TIMESTAMPTZ,
  "attemptCount" INTEGER DEFAULT 0,
  "bestScore" DECIMAL DEFAULT 0,
  "lastScore" DECIMAL DEFAULT 0,
  PRIMARY KEY ("userId", "testId")
);

CREATE TABLE public.bookmarks (
  id VARCHAR PRIMARY KEY,
  "userId" UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
  "questionId" VARCHAR REFERENCES public.questions(id) ON DELETE CASCADE,
  question TEXT,
  "addedAt" TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE public.coding_submissions (
  id VARCHAR PRIMARY KEY,
  "userId" UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
  "testSeriesId" VARCHAR REFERENCES public.tests(id) ON DELETE CASCADE,
  "testAttemptId" VARCHAR REFERENCES public.test_attempts(id) ON DELETE CASCADE,
  "questionId" VARCHAR REFERENCES public.questions(id) ON DELETE CASCADE,
  language VARCHAR,
  "sourceCode" TEXT,
  "executionResult" JSONB,
  "isFinalSubmission" BOOLEAN DEFAULT false,
  "createdAt" TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE public.user_track_progress (
  "userId" UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  "trackId" VARCHAR NOT NULL REFERENCES public.career_tracks(id) ON DELETE CASCADE,
  "currentStageId" VARCHAR REFERENCES public.track_stages(id) ON DELETE SET NULL,
  status VARCHAR NOT NULL DEFAULT 'not_started',
  "startedAt" TIMESTAMPTZ,
  "completedAt" TIMESTAMPTZ,
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY("userId", "trackId")
);

CREATE TABLE public.user_track_item_progress (
  "userId" UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  "trackItemId" VARCHAR NOT NULL REFERENCES public.track_items(id) ON DELETE CASCADE,
  status VARCHAR NOT NULL DEFAULT 'locked',
  "completedAt" TIMESTAMPTZ,
  "sourceAttemptId" VARCHAR REFERENCES public.test_attempts(id) ON DELETE SET NULL,
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY("userId", "trackItemId")
);

CREATE TABLE public.weekly_standings (
  "userId" UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
  "seasonId" VARCHAR REFERENCES public.weekly_seasons(id) ON DELETE CASCADE,
  league VARCHAR,
  score INTEGER DEFAULT 0,
  rank INTEGER,
  movement VARCHAR,
  PRIMARY KEY ("userId", "seasonId")
);

CREATE TABLE public.notifications (
  id VARCHAR PRIMARY KEY,
  type VARCHAR,
  title VARCHAR,
  message TEXT,
  "createdAt" TIMESTAMPTZ DEFAULT now(),
  "actionType" VARCHAR,
  "actionTargetId" VARCHAR,
  "actionTestId" VARCHAR,
  "actionTab" VARCHAR,
  "actionLabel" VARCHAR,
  "actionUrl" VARCHAR,
  "targetCompany" VARCHAR,
  "targetUserId" UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
  audience VARCHAR
);

-------------------------------------------------------------------------------
-- 5. INDEXES
-------------------------------------------------------------------------------
CREATE INDEX idx_attempts_user_id ON public.test_attempts("userId");
CREATE INDEX idx_responses_attempt_id ON public.attempt_responses("attemptId");
CREATE INDEX idx_bookmarks_user_id ON public.bookmarks("userId");
CREATE INDEX idx_questions_test_id ON public.questions("testSeriesId");
CREATE INDEX idx_submissions_user_id ON public.coding_submissions("userId");
CREATE INDEX idx_track_progress_user_id ON public.user_track_progress("userId");
CREATE INDEX idx_track_item_progress_user_id ON public.user_track_item_progress("userId");
CREATE INDEX idx_notifications_target_user ON public.notifications("targetUserId");

-------------------------------------------------------------------------------
-- 6. ROW LEVEL SECURITY (RLS)
-------------------------------------------------------------------------------

ALTER TABLE public.companies ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.career_tracks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.track_stages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.track_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.assessment_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.assessment_companies ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.track_company_milestones ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mega_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.weekly_seasons ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.weekly_standings ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.questions ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.test_attempts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.attempt_responses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.test_user_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bookmarks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.coding_submissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_track_progress ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_track_item_progress ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;


-- 6a. Public/Reference Data Policies
-- Allow anyone to read
CREATE POLICY "Enable read access for all users" ON public.companies FOR SELECT USING (true);
CREATE POLICY "Enable read access for all users" ON public.roles FOR SELECT USING (true);
CREATE POLICY "Enable read access for all users" ON public.career_tracks FOR SELECT USING (true);
CREATE POLICY "Enable read access for all users" ON public.track_stages FOR SELECT USING (true);
CREATE POLICY "Enable read access for all users" ON public.tests FOR SELECT USING (true);
CREATE POLICY "Enable read access for all users" ON public.track_items FOR SELECT USING (true);
CREATE POLICY "Enable read access for all users" ON public.assessment_roles FOR SELECT USING (true);
CREATE POLICY "Enable read access for all users" ON public.assessment_companies FOR SELECT USING (true);
CREATE POLICY "Enable read access for all users" ON public.track_company_milestones FOR SELECT USING (true);
CREATE POLICY "Enable read access for all users" ON public.mega_events FOR SELECT USING (true);
CREATE POLICY "Enable read access for all users" ON public.weekly_seasons FOR SELECT USING (true);
CREATE POLICY "Enable read access for all users" ON public.weekly_standings FOR SELECT USING (true);

-- 6b. User-Owned Data Policies
-- Profiles: Users can select/update their own profile
CREATE POLICY "Users can view own profile" ON public.profiles FOR SELECT USING (auth.uid() = id);
CREATE POLICY "Users can update own profile" ON public.profiles FOR UPDATE USING (auth.uid() = id);
CREATE POLICY "Users can insert own profile" ON public.profiles FOR INSERT WITH CHECK (auth.uid() = id);

-- Test Attempts
CREATE POLICY "Users can view own attempts" ON public.test_attempts FOR SELECT USING (auth.uid() = "userId");
CREATE POLICY "Users can insert own attempts" ON public.test_attempts FOR INSERT WITH CHECK (auth.uid() = "userId");
CREATE POLICY "Users can update own attempts" ON public.test_attempts FOR UPDATE USING (auth.uid() = "userId");

-- Attempt Responses (Joined through test_attempts, but direct RLS typically requires subqueries.
-- Since the frontend handles writes, we can do a simpler policy by passing user context, or use a subquery).
CREATE POLICY "Users can view own responses" ON public.attempt_responses FOR SELECT USING (
  EXISTS (SELECT 1 FROM public.test_attempts ta WHERE ta.id = "attemptId" AND ta."userId" = auth.uid())
);
CREATE POLICY "Users can insert own responses" ON public.attempt_responses FOR INSERT WITH CHECK (
  EXISTS (SELECT 1 FROM public.test_attempts ta WHERE ta.id = "attemptId" AND ta."userId" = auth.uid())
);

-- User History
CREATE POLICY "Users can view own history" ON public.test_user_history FOR SELECT USING (auth.uid() = "userId");
CREATE POLICY "Users can insert own history" ON public.test_user_history FOR INSERT WITH CHECK (auth.uid() = "userId");
CREATE POLICY "Users can update own history" ON public.test_user_history FOR UPDATE USING (auth.uid() = "userId");

-- Bookmarks
CREATE POLICY "Users can view own bookmarks" ON public.bookmarks FOR SELECT USING (auth.uid() = "userId");
CREATE POLICY "Users can insert own bookmarks" ON public.bookmarks FOR INSERT WITH CHECK (auth.uid() = "userId");
CREATE POLICY "Users can delete own bookmarks" ON public.bookmarks FOR DELETE USING (auth.uid() = "userId");

-- Coding Submissions
CREATE POLICY "Users can view own submissions" ON public.coding_submissions FOR SELECT USING (auth.uid() = "userId");
CREATE POLICY "Users can insert own submissions" ON public.coding_submissions FOR INSERT WITH CHECK (auth.uid() = "userId");

-- Track Progress
CREATE POLICY "Users can view own track progress" ON public.user_track_progress FOR SELECT USING (auth.uid() = "userId");
CREATE POLICY "Users can insert own track progress" ON public.user_track_progress FOR INSERT WITH CHECK (auth.uid() = "userId");
CREATE POLICY "Users can update own track progress" ON public.user_track_progress FOR UPDATE USING (auth.uid() = "userId");

-- Track Item Progress
CREATE POLICY "Users can view own track item progress" ON public.user_track_item_progress FOR SELECT USING (auth.uid() = "userId");
CREATE POLICY "Users can insert own track item progress" ON public.user_track_item_progress FOR INSERT WITH CHECK (auth.uid() = "userId");
CREATE POLICY "Users can update own track item progress" ON public.user_track_item_progress FOR UPDATE USING (auth.uid() = "userId");

-- Notifications
CREATE POLICY "Users can view targeted or global notifications" ON public.notifications FOR SELECT USING (
  auth.uid() = "targetUserId" OR audience = 'all'
);

-- 6c. Server-Only Data Policies (Questions)
-- Questions should only be read by the server (Service Role key bypasses RLS)
-- We intentionally define NO policies for SELECT, INSERT, UPDATE, DELETE for public/authenticated users.
-- This ensures that questions cannot be leaked via the public API.
