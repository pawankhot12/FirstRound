import React, { useEffect, useRef, useState } from 'react';
import { supabase, isSupabaseConfigured, signOutSupabase } from './services/supabaseClient';
import {
  apiAskAIDoubt,
  apiGetBookmarkedQuestions,
  apiGetCatalogue,
  apiGetCompanies,
  apiGetLeaderboard,
  apiGetMegaEvents,
  apiGetNotifications,
  apiGetTestById,
  apiGetTests,
  apiGetUserAttempts,
  apiGetUserProfile,
  apiGetWeakQuestions,
  apiMarkAllNotificationsRead,
  apiMarkNotificationRead,
  apiSubmitAttempt,
  apiToggleBookmark,
  apiUpdateUserProfile,
  apiLogTestVisit,
  apiLogTestStart,
} from './api';
import { TestEngineErrorBoundary } from './components/TestEngineErrorBoundary';
import { TestHubErrorBoundary } from './components/TestHubErrorBoundary';
import { DashboardHome } from './components/DashboardHome';
import { LandingPage } from './components/LandingPage';
import { AIErrorBoundary } from './components/AIErrorBoundary';
import { Sparkles } from 'lucide-react';
import { Navbar } from './components/Navbar';
import { TopSponsorAdSlot } from './components/TopSponsorBanner';
import { ScratchpadModal } from './components/ScratchpadModal';
import { TestHub } from './components/TestHub';

// Lazy loaded heavy route views, test engine & modals to optimize initial bundle size & load performance
const ActiveTestEngine = React.lazy(() =>
  import('./components/ActiveTestEngine').then((m) => ({ default: m.ActiveTestEngine }))
);
const AdminPanel = React.lazy(() =>
  import('./components/AdminPanel').then((m) => ({ default: m.AdminPanel }))
);
const AccountSettingsView = React.lazy(() =>
  import('./components/AccountSettingsView').then((m) => ({ default: m.AccountSettingsView }))
);
const LeaderboardView = React.lazy(() =>
  import('./components/LeaderboardView').then((m) => ({ default: m.LeaderboardView }))
);
const RevisionVaultView = React.lazy(() =>
  import('./components/RevisionVaultView').then((m) => ({ default: m.RevisionVaultView }))
);
const AuthModal = React.lazy(() =>
  import('./components/AuthModal').then((m) => ({ default: m.AuthModal }))
);
const FirstRoundAICopilotModal = React.lazy(() =>
  import('./components/FirstRoundAICopilotModal').then((m) => ({ default: m.FirstRoundAICopilotModal }))
);
const TestResultModal = React.lazy(() =>
  import('./components/TestResultModal').then((m) => ({ default: m.TestResultModal }))
);
const UserProfileModal = React.lazy(() =>
  import('./components/UserProfileModal').then((m) => ({ default: m.UserProfileModal }))
);
import {
  AIDoubtResponse,
  AIRecommendedAction,
  AppNotification,
  BookmarkedItem,
  CompanyInfo,
  LeaderboardEntry,
  MegaEvent,
  NavTab,
  Question,
  QuestionResponse,
  TestAttempt,
  TestMode,
  TestSeries,
  UserProfile,
  WeakQuestionItem,
} from './types';

export default function App() {
  // Navigation & View State
  const [activeTab, setActiveTab] = useState<NavTab>('home');
  const [loading, setLoading] = useState(true);

  // ─── Auth Resolution Gate ─────────────────────────────────────────────────
  // authReady = true means: Supabase session has been checked and currentUser/userId
  // have been authoritatively resolved. Only set to true ONCE per page load.
  // NEVER render LandingPage until authReady is true — prevents Login flash on
  // email/password login, OAuth callback, page refresh, and tab reopen.
  const [authReady, setAuthReady] = useState(false);

  // OAuth bridge state — true if the current page load originated from an OAuth redirect.
  // Prevents the LandingPage from flashing before the Supabase session is resolved.
  const [oauthBridgePending, setOauthBridgePending] = useState(() => {
    if (typeof window === 'undefined') return false;
    const h = window.location.hash;
    const s = window.location.search;
    return h.includes('access_token') || h.includes('error=') || s.includes('code=');
  });
  // Prevents duplicate login-or-register calls when both getSession() and
  // the SIGNED_IN onAuthStateChange event fire on the same OAuth redirect.
  const oauthBridgeFiredRef = useRef(false);

  // User State
  const [userId, setUserId] = useState<string | null>(() => localStorage.getItem('firstround_uid') || null);
  const [currentUser, setCurrentUser] = useState<UserProfile | null>(null);

  // Data Collections
  const [tests, setTests] = useState<TestSeries[]>([]);
  // catalogueTests: ONLY the 15 cat_ blueprints — used exclusively by Explore Tests (TestHub).
  // tests: full legacy + catalogue array — used by Home recommendations (unchanged).
  const [catalogueTests, setCatalogueTests] = useState<TestSeries[]>([]);
  const [companies, setCompanies] = useState<CompanyInfo[]>([]);
  const [events, setEvents] = useState<MegaEvent[]>([]);
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([]);
  const [weakQuestions, setWeakQuestions] = useState<WeakQuestionItem[]>([]);
  const [bookmarkedItems, setBookmarkedItems] = useState<BookmarkedItem[]>([]);
  const [userAttempts, setUserAttempts] = useState<TestAttempt[]>([]);

  // Notifications
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [unreadNotificationCount, setUnreadNotificationCount] = useState<number>(0);
  const [readNotificationIds, setReadNotificationIds] = useState<string[]>([]);

  // Active Test Taking Engine
  const [activeTest, setActiveTest] = useState<(TestSeries & { questions: Question[] }) | null>(null);
  const [activeTestMode, setActiveTestMode] = useState<TestMode>('exam');

  // Modals
  const [latestAttemptReport, setLatestAttemptReport] = useState<TestAttempt | null>(null);
  const [isAuthModalOpen, setIsAuthModalOpen] = useState(false);
  const [authModalMode, setAuthModalMode] = useState<'register' | 'login'>('register');
  const [isProfileModalOpen, setIsProfileModalOpen] = useState(false);
  const [isScratchpadOpen, setIsScratchpadOpen] = useState(false);
  const [isAICopilotOpen, setIsAICopilotOpen] = useState(false);

  // Initial Load
  useEffect(() => {
    loadAllData();
  }, [userId]);

  // ─── Google OAuth callback bridge ────────────────────────────────────────────
  // Runs once on mount. Reads the Supabase session that the SDK automatically
  // parses from the OAuth redirect hash, creates or fetches the matching SQLite
  // profile via /api/auth/login-or-register, then wires it into the existing
  // userId / currentUser / loadAllData flow.
  // Email login is NOT touched — it goes through AuthModal → /api/auth/login-or-register
  // directly and never reaches this effect.
  useEffect(() => {
    if (!isSupabaseConfigured()) {
      // No Supabase: auth resolution is instant — no session to check
      setOauthBridgePending(false);
      setAuthReady(true);
      return;
    }

    /**
     * Given a live Supabase session, create-or-fetch the SQLite profile and
     * wire up the app state.  Returns true if a profile was successfully
     * established (or was already present), false otherwise.
     */
    const bridgeSession = async (session: { user: { id: string; email?: string; user_metadata?: Record<string, any> } } | null): Promise<boolean> => {
      if (!session?.user) return false;
      // Idempotency guard — only run once per page load
      if (oauthBridgeFiredRef.current) return true;
      oauthBridgeFiredRef.current = true;

      const supabaseUser = session.user;
      try {
        const meta: Record<string, any> = supabaseUser.user_metadata || {};
        const displayName =
          meta['full_name'] ||
          meta['name'] ||
          (supabaseUser.email ? supabaseUser.email.split('@')[0] : 'User');

        const res = await fetch('/api/auth/login-or-register', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            email: supabaseUser.email || '',
            name: displayName,
            college: meta['college'] || '',
            targetCompany: meta['targetCompany'] || '',
            targetRole: meta['targetRole'] || '',
          }),
        });

        if (!res.ok) {
          console.error('[OAuth Bridge] /api/auth/login-or-register error:', res.status, await res.text());
          cleanOAuthUrl();
          return false;
        }

        const data = await res.json();
        if (data?.user) {
          localStorage.setItem('firstround_uid', data.user.id);
          setUserId(data.user.id);
          setCurrentUser(data.user);
          setIsAuthModalOpen(false);
          cleanOAuthUrl();
          return true;
        }
      } catch (err) {
        console.error('[OAuth Bridge] Unexpected error:', err);
      }
      cleanOAuthUrl();
      return false;
    };

    /** Remove OAuth tokens/codes from the browser URL after a successful callback. */
    const cleanOAuthUrl = () => {
      if (
        window.location.hash.includes('access_token') ||
        window.location.hash.includes('error=') ||
        window.location.search.includes('code=')
      ) {
        window.history.replaceState({}, document.title, window.location.pathname);
      }
    };

    // 1. Check for an existing Supabase session immediately (handles OAuth redirect)
    const init = async () => {
      try {
        const { data } = await supabase.auth.getSession();
        await bridgeSession(data.session as any);
      } catch (err) {
        console.error('[OAuth Bridge] getSession error:', err);
      } finally {
        // Mark auth as resolved regardless of outcome.
        // This is the ONLY place where authReady transitions to true on startup.
        // After this point the render gate will show LandingPage or Dashboard.
        setOauthBridgePending(false);
        setAuthReady(true);
      }
    };
    init();

    // 2. Subscribe for future events (token refresh, sign-out, late SIGNED_IN delivery)
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (event === 'SIGNED_IN' || event === 'INITIAL_SESSION') {
        await bridgeSession(session as any);
        setOauthBridgePending(false);
        // If init() already fired setAuthReady(true), this is a no-op. Safe to call again.
        setAuthReady(true);
      } else if (event === 'SIGNED_OUT') {
        // Mirror Supabase sign-out for ALL users (email/password AND OAuth).
        // This is the authoritative logout path — only fires on real Supabase sign-out,
        // not on profile load failures or network errors.
        localStorage.removeItem('firstround_uid');
        sessionStorage.removeItem('firstround_testhub_category');
        setUserId(null);
        setCurrentUser(null);
        setUserAttempts([]);
        setWeakQuestions([]);
        setBookmarkedItems([]);
        setIsAuthModalOpen(false);
        setActiveTab('home');
        // After explicit sign-out, auth is still "ready" — just unauthenticated
        setAuthReady(true);
      }
    });

    return () => {
      subscription.unsubscribe();
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  // ─── End Google OAuth bridge ─────────────────────────────────────────────────

  const loadAllData = async () => {
    try {
      setLoading(true);
      // 1. Fetch CRITICAL initial data required for instant dashboard render
      const [testsRes, userRes] = await Promise.all([
        apiGetTests(),
        apiGetUserProfile(userId),
      ]);

      const allTests = testsRes?.tests || [];
      setTests(allTests);
      setCatalogueTests(allTests.filter((t: TestSeries) => t.id.startsWith('cat_')));

      if (userRes?.user) {
        // Only update currentUser if a valid profile was returned.
        // NEVER clear currentUser here — a profile fetch failure is a data error,
        // NOT a logout. Only handleLogout() and the SIGNED_OUT event may clear currentUser.
        setCurrentUser(userRes.user);
        if (userRes.user.id && userRes.user.id !== userId) {
          localStorage.setItem('firstround_uid', userRes.user.id);
          setUserId(userRes.user.id);
        }
      }
      // If userRes?.user is null/undefined (profile not found or request failed),
      // keep the existing currentUser and userId — do not treat it as a logout.
    } catch (err) {
      console.error('Error loading critical placement data:', err);
      // On error: keep existing currentUser. Never clear auth state due to data failure.
    } finally {
      // Unblock initial UI rendering immediately once critical data phase resolves
      setLoading(false);
    }

    // 2. Fetch SECONDARY background data asynchronously without blocking UI render
    try {
      const activeUid = userId;
      const [
        companiesRes,
        eventsRes,
        leaderboardRes,
        weakRes,
        bookmarksRes,
        attemptsRes,
        notifRes,
      ] = await Promise.all([
        apiGetCompanies(),
        apiGetMegaEvents(),
        apiGetLeaderboard(),
        activeUid ? apiGetWeakQuestions(activeUid) : Promise.resolve({ weakQuestions: [] }),
        activeUid ? apiGetBookmarkedQuestions(activeUid) : Promise.resolve({ bookmarks: [] }),
        activeUid ? apiGetUserAttempts(activeUid) : Promise.resolve({ attempts: [] }),
        activeUid ? apiGetNotifications(activeUid) : Promise.resolve({ notifications: [], unreadCount: 0, readIds: [] }),
      ]);

      setCompanies(companiesRes?.companies || []);
      setEvents(eventsRes?.events || []);
      setLeaderboard(leaderboardRes?.leaderboard || []);
      setWeakQuestions(weakRes?.weakQuestions || []);
      setBookmarkedItems(bookmarksRes?.bookmarks || []);
      setUserAttempts(attemptsRes?.attempts || []);
      setNotifications(notifRes?.notifications || []);
      setUnreadNotificationCount(notifRes?.unreadCount ?? 0);
      setReadNotificationIds(notifRes?.readIds || []);
    } catch (err) {
      console.error('Error loading secondary background data:', err);
    }
  };

  useEffect(() => {
    if (!userId) return;

    const handleRefreshNotifications = () => {
      apiGetNotifications(userId)
        .then((notifRes) => {
          if (notifRes) {
            setNotifications(notifRes.notifications || []);
            setUnreadNotificationCount(notifRes.unreadCount ?? 0);
            setReadNotificationIds(notifRes.readIds || []);
          }
        })
        .catch((err) => console.warn('[App] Failed to refresh notifications:', err));
    };

    window.addEventListener('firstround:notifications-updated', handleRefreshNotifications);
    window.addEventListener('firstround:credits-updated', handleRefreshNotifications);
    window.addEventListener('firstround:subscription-updated', handleRefreshNotifications);
    window.addEventListener('firstround:entitlement-updated', handleRefreshNotifications);

    return () => {
      window.removeEventListener('firstround:notifications-updated', handleRefreshNotifications);
      window.removeEventListener('firstround:credits-updated', handleRefreshNotifications);
      window.removeEventListener('firstround:subscription-updated', handleRefreshNotifications);
      window.removeEventListener('firstround:entitlement-updated', handleRefreshNotifications);
    };
  }, [userId]);


  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => {
      setToastMessage((current) => (current === msg ? null : current));
    }, 4000);
  };

  const handleMarkNotificationRead = async (id: string) => {
    if (!userId) return;
    try {
      await apiMarkNotificationRead(userId, id);
      setReadNotificationIds((prev) => Array.from(new Set([...prev, id])));
      setUnreadNotificationCount((prev) => Math.max(0, prev - 1));
    } catch (err) {
      console.error('Failed to mark notification read:', err);
    }
  };

  const handleMarkAllNotificationsRead = async () => {
    if (!userId) return;
    try {
      await apiMarkAllNotificationsRead(userId);
      setReadNotificationIds((prev) =>
        Array.from(new Set([...prev, ...notifications.map((n) => n.id)]))
      );
      setUnreadNotificationCount(0);
    } catch (err) {
      console.error('Failed to mark all notifications read:', err);
    }
  };

  const handleNotificationClick = async (notif: AppNotification) => {
    if (userId && !readNotificationIds.includes(notif.id)) {
      handleMarkNotificationRead(notif.id);
    }

    const actionType = notif.actionType;
    const testId = notif.actionTestId || notif.actionTargetId;

    if (actionType === 'OPEN_TEST' || testId) {
      if (!testId) {
        showToast('This content is no longer available.');
        return;
      }
      const targetTest = tests.find((t) => t.id === testId);
      if (targetTest) {
        handleStartTest(targetTest, 'exam');
      } else {
        try {
          const res = await apiGetTestById(testId, userId);
          if (res?.test) {
            handleStartTest(res.test, 'exam');
          } else {
            showToast('This content is no longer available.');
          }
        } catch {
          showToast('This content is no longer available.');
        }
      }
      return;
    }

    if (actionType === 'OPEN_LEADERBOARD' || notif.actionTab === 'leaderboard') {
      setActiveTab('leaderboard');
      return;
    }

    if (actionType === 'OPEN_REVISION' || notif.actionTab === 'vault') {
      setActiveTab('vault');
      return;
    }

    if (actionType === 'OPEN_CAREER' || notif.actionTab === 'career') {
      setActiveTab('career');
      return;
    }

    if (actionType === 'OPEN_CREDITS' || notif.actionTab === 'credits') {
      window.dispatchEvent(new CustomEvent('firstround_open_credits_modal'));
      return;
    }

    if (actionType === 'OPEN_PROFILE') {
      setIsProfileModalOpen(true);
      return;
    }

    if (actionType === 'OPEN_ANNOUNCEMENT' || notif.actionTab === 'home') {
      setActiveTab('home');
      return;
    }

    if (notif.actionTab === 'tests') {
      setActiveTab('tests');
      return;
    }

    if (notif.actionTab === 'admin') {
      setActiveTab('admin');
      return;
    }

    if (notif.actionUrl) {
      if (notif.actionUrl.startsWith('/tests') || notif.actionUrl === 'tests') {
        setActiveTab('tests');
      } else if (notif.actionUrl.startsWith('/vault') || notif.actionUrl === 'vault') {
        setActiveTab('vault');
      } else if (notif.actionUrl.startsWith('/leaderboard') || notif.actionUrl === 'leaderboard') {
        setActiveTab('leaderboard');
      } else {
        setActiveTab('home');
      }
    }
  };

  const handleSwitchUser = (user: UserProfile) => {
    localStorage.setItem('firstround_uid', user.id);
    setUserId(user.id);
    setCurrentUser(user);
    setIsAuthModalOpen(false);
    setActiveTab('home');
    // Email/password login arrives here before the Supabase onAuthStateChange fires.
    // Mark auth as ready immediately so the authenticated workspace is shown at once.
    setAuthReady(true);
  };

  const handleLogout = async () => {
    try {
      await signOutSupabase();
    } catch (err) {
      console.error('[Logout] Supabase signOut error:', err);
    }
    localStorage.removeItem('firstround_uid');
    sessionStorage.removeItem('firstround_testhub_category');
    setUserId(null);
    setCurrentUser(null);
    setUserAttempts([]);
    setWeakQuestions([]);
    setBookmarkedItems([]);
    setIsAuthModalOpen(false);
    setActiveTab('home');
  };

  const handleStartTest = async (test: TestSeries, mode: TestMode = 'exam') => {
    if (!currentUser || !userId) {
      setAuthModalMode('register');
      setIsAuthModalOpen(true);
      return;
    }
    try {
      if (mode === 'practice') {
        localStorage.removeItem(`firstround_progress_${userId}_${test.id}_practice`);
        const codingPrefix = `coding_state:${userId}:${test.id || 'practice'}_practice:`;
        for (let i = 0; i < localStorage.length; i++) {
          const key = localStorage.key(i);
          if (key && key.startsWith(codingPrefix)) {
            localStorage.removeItem(key);
            i--;
          }
        }
      }
      apiLogTestVisit(userId, test.id, mode).catch(console.error);
      const data = await apiGetTestById(test.id, userId);
      if (data?.isLocked) {
        showToast(data.error || 'This Premium assessment requires FirstRound Premium or Plus plan selection.');
        return;
      }
      apiLogTestStart(userId, test.id, mode).catch(console.error);
      if (data && data.test && Array.isArray(data.test.questions)) {
        const normalizedQuestions = data.test.questions.map((q: Question) => ({
          ...q,
          questionType: q.questionType || (q.codeSnippet || (q as any).starterCode ? 'CODING' : 'MCQ'),
        }));
        setActiveTest({
          ...data.test,
          questions: normalizedQuestions,
        });
        setActiveTestMode(mode);
      } else {
        showToast('This assessment is currently locked or questions are not available.');
      }
    } catch (err) {
      console.error('Failed to fetch test questions:', err);
    }
  };

  const handleStartCustomRevisionQuiz = (questions: Question[]) => {
    if (!currentUser || !userId) {
      setAuthModalMode('register');
      setIsAuthModalOpen(true);
      return;
    }
    const customTest: TestSeries & { questions: Question[] } = {
      id: `custom-revision-${Date.now()}`,
      title: 'Revision Vault Custom Mock Quiz',
      description: 'Handcrafted challenge from your previously incorrect and bookmarked questions.',
      category: 'Full Mock',
      difficulty: 'Medium',
      totalQuestions: questions.length,
      durationMinutes: Math.max(5, questions.length * 2),
      passingPercentage: 70,
      tags: ['Revision', 'Weak-Areas', 'Custom'],
      attemptsCount: 0,
      questions,
    };
    setActiveTest(customTest);
    setActiveTestMode('practice');
  };

  const handleSubmitTest = async (responses: QuestionResponse[], timeTakenSeconds: number) => {
    if (!activeTest || !userId) return;

    try {
      const testInstanceId = `instance_${activeTest.id}_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
      const result = await apiSubmitAttempt({
        testId: activeTest.id,
        testInstanceId,
        userId,
        responses,
        timeTakenSeconds,
        mode: activeTestMode,
      });

      // Clear in-progress progress state from local storage on successful submit
      try {
        const storageKeySuffix = activeTestMode === 'practice' ? '_practice' : '';
        localStorage.removeItem(`firstround_progress_${userId}_${activeTest.id}${storageKeySuffix}`);
      } catch {}

      // Exit active test engine and open comprehensive report
      setActiveTest(null);
      setLatestAttemptReport(result.attempt);

      // Refresh user stats, leaderboard, and weak questions
      await loadAllData();
    } catch (err) {
      console.error('Error submitting test attempt:', err);
    }
  };

  const handleToggleBookmark = async (questionId: string): Promise<boolean> => {
    if (!currentUser || !userId) {
      setAuthModalMode('register');
      setIsAuthModalOpen(true);
      return false;
    }
    try {
      const res = await apiToggleBookmark(userId, questionId);
      const bookmarksRes = await apiGetBookmarkedQuestions(userId);
      setBookmarkedItems(bookmarksRes.bookmarks || []);
      return res.bookmarked;
    } catch (err) {
      console.error('Failed to toggle bookmark:', err);
      return false;
    }
  };

  const handleAskAIDoubt = async (payload: {
    question: Question;
    userSelectedOption?: string | null;
    studentQuestion?: string;
  }): Promise<AIDoubtResponse> => {
    return await apiAskAIDoubt(payload);
  };

  const handleUpdateUser = async (data: Partial<UserProfile>) => {
    if (!currentUser) return;
    const res = await apiUpdateUserProfile(currentUser.id, data);
    setCurrentUser(res.user);
    const lbRes = await apiGetLeaderboard();
    setLeaderboard(lbRes.leaderboard || []);
  };

  // If in active test taking mode, render the proctored test engine full screen
  if (activeTest) {
    const bookmarkedSet = new Set((bookmarkedItems || []).map((b) => b?.questionId).filter((id): id is string => Boolean(id)));
    return (
      <TestEngineErrorBoundary onExit={() => setActiveTest(null)}>
        <React.Suspense
          fallback={
            <div className="min-h-screen bg-app-bg flex items-center justify-center font-['Plus_Jakarta_Sans']">
              <div className="flex flex-col items-center gap-4">
                <div className="w-10 h-10 border-4 border-sky-500/20 border-t-sky-500 rounded-full animate-spin mx-auto"></div>
                <p className="text-sm font-semibold text-slate-600">Loading Assessment Environment…</p>
              </div>
            </div>
          }
        >
          <ActiveTestEngine
            test={activeTest}
            mode={activeTestMode}
            userId={userId}
            onExit={() => setActiveTest(null)}
            onSubmit={handleSubmitTest}
            onToggleBookmark={handleToggleBookmark}
            initialBookmarkedIds={bookmarkedSet}
            onOpenScratchpad={() => setIsScratchpadOpen(true)}
          />
        </React.Suspense>
      </TestEngineErrorBoundary>
    );
  }

  // ─── Auth Resolution Gate ─────────────────────────────────────────────────
  // STEP 1: Block ALL rendering until Supabase session is authoritatively resolved.
  // authReady is set to true exactly once: after supabase.auth.getSession() completes
  // (or immediately when Supabase is not configured).
  // This prevents LandingPage from flashing during:
  //   - email/password login session restore
  //   - OAuth callback processing
  //   - page refresh while logged in
  //   - tab reopen with stored session
  if (!authReady) {
    return (
      <div className="min-h-screen bg-app-bg flex items-center justify-center font-['Plus_Jakarta_Sans']">
        <div className="flex flex-col items-center gap-4">
          <div className="w-12 h-12 rounded-2xl bg-primary/20 flex items-center justify-center animate-pulse">
            <Sparkles className="w-6 h-6 text-primary" />
          </div>
          <p className="text-text-secondary text-sm">Loading FirstRound…</p>
        </div>
      </div>
    );
  }

  // STEP 2: Auth resolved. Now decide: authenticated or unauthenticated?
  // Only show LandingPage after auth is confirmed as resolved AND user is not logged in.
  if (!currentUser || !userId) {
    return (
      <div className="min-h-screen bg-app-bg text-text-primary flex flex-col font-['Plus_Jakarta_Sans'] antialiased no-scrollbar">
        <LandingPage
          onGetStarted={() => {
            setAuthModalMode('register');
            setIsAuthModalOpen(true);
          }}
          onLogin={() => {
            setAuthModalMode('login');
            setIsAuthModalOpen(true);
          }}
          tests={tests}
          companies={companies}
        />

        {/* Public Access Auth Modal */}
        {isAuthModalOpen && (
          <AuthModal
            onClose={() => setIsAuthModalOpen(false)}
            onSelectUser={handleSwitchUser}
            onSuccess={handleSwitchUser}
            currentUserId={currentUser?.id}
            initialMode={authModalMode}
          />
        )}
      </div>
    );
  }

  // 2. Authenticated Candidate Flow: Render Main Placement Application
  const handleExecuteAIAction = async (action: AIRecommendedAction): Promise<boolean> => {
    if (!action || typeof action !== 'object') {
      console.warn('[AI Action Security] Invalid action payload object:', action);
      return false;
    }

    const { actionType, payload, target } = action;
    const rawTarget = payload || target;

    const ALLOWED_ACTION_TYPES = new Set([
      'OPEN_TEST',
      'OPEN_PRACTICE',
      'OPEN_REVISION',
      'OPEN_HISTORY',
      'OPEN_CAREER_TRACK',
      'NAVIGATE_TAB',
    ]);

    if (!actionType || !ALLOWED_ACTION_TYPES.has(actionType)) {
      console.warn('[AI Action Security] Rejected invalid or non-allowlisted actionType:', actionType);
      return false;
    }

    // Security sanitization: Reject URLs, javascript: protocol, scripts, eval, path traversal
    if (typeof rawTarget === 'string') {
      const lower = rawTarget.toLowerCase().trim();
      if (
        lower.startsWith('javascript:') ||
        lower.startsWith('http:') ||
        lower.startsWith('https:') ||
        lower.startsWith('//') ||
        lower.includes('<script') ||
        lower.includes('eval(') ||
        lower.includes('window.') ||
        lower.includes('document.') ||
        lower.startsWith('/')
      ) {
        console.warn('[AI Action Security] Rejected unsafe/external payload:', rawTarget);
        return false;
      }
    }

    // Execute actions safely based on actionType
    if (actionType === 'NAVIGATE_TAB') {
      const ALLOWED_TABS = new Set(['home', 'tests', 'leaderboard', 'vault', 'career', 'admin']);
      if (!rawTarget || !ALLOWED_TABS.has(rawTarget)) {
        console.warn('[AI Action Security] Rejected unknown tab navigation target:', rawTarget);
        return false;
      }
      setActiveTab(rawTarget as NavTab);
      setIsAICopilotOpen(false);
      return true;
    }

    if (actionType === 'OPEN_REVISION') {
      setActiveTab('vault');
      setIsAICopilotOpen(false);
      return true;
    }

    if (actionType === 'OPEN_HISTORY') {
      setActiveTab('vault');
      setIsAICopilotOpen(false);
      return true;
    }

    if (actionType === 'OPEN_CAREER_TRACK') {
      setActiveTab('career');
      setIsAICopilotOpen(false);
      return true;
    }

    if (actionType === 'OPEN_TEST' || actionType === 'OPEN_PRACTICE') {
      const mode: TestMode = actionType === 'OPEN_PRACTICE' ? 'practice' : 'exam';
      const testId = rawTarget;

      if (!testId || typeof testId !== 'string') {
        console.warn('[AI Action Security] Missing test ID for:', actionType);
        return false;
      }

      // Verify test ID exists in active catalogue (state tests or apiGetTestById)
      let targetTest = tests.find((t) => t.id === testId);
      if (!targetTest) {
        try {
          const res = await apiGetTestById(testId, userId);
          if (res?.test) {
            targetTest = res.test;
          }
        } catch (err) {
          console.warn('[AI Action Security] Failed to fetch test ID from API:', testId);
        }
      }

      if (!targetTest) {
        console.warn('[AI Action Security] Rejected execution for non-existent test ID:', testId);
        return false;
      }

      setIsAICopilotOpen(false);
      await handleStartTest(targetTest, mode);
      return true;
    }

    return false;
  };

  return (
    <div className="min-h-screen bg-app-bg text-text-primary flex flex-col font-['Plus_Jakarta_Sans'] antialiased selection:bg-amber-300 selection:text-text-primary">
      {/* Top Sponsor Banner (Only renders if active DASHBOARD_TOP ad exists) */}
      <TopSponsorAdSlot placement="DASHBOARD_TOP" />

      {/* Top Main Navigation */}
      <Navbar
        activeTab={activeTab}
        onTabChange={setActiveTab}
        currentUser={currentUser}
        onOpenAuthModal={() => {
          setAuthModalMode('login');
          setIsAuthModalOpen(true);
        }}
        onOpenProfileModal={() => setIsProfileModalOpen(true)}
        onOpenScratchpad={() => setIsScratchpadOpen(true)}
        onLogout={handleLogout}
        notifications={notifications}
        unreadNotificationCount={unreadNotificationCount}
        readNotificationIds={readNotificationIds}
        onMarkNotificationRead={handleMarkNotificationRead}
        onMarkAllNotificationsRead={handleMarkAllNotificationsRead}
        onNotificationClick={handleNotificationClick}
      />

      {/* Main Content View Switcher */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 pt-6">
        {/* Only show calibration spinner if initial test data hasn't arrived yet.
            Do NOT block on `loading` — secondary data (leaderboard, notifications, etc.)
            loads in the background and must never freeze the authenticated workspace. */}
        {(loading && tests.length === 0) ? (
          <div className="py-24 text-center space-y-4">
            <div className="w-10 h-10 border-4 border-sky-500/20 border-t-sky-500 rounded-full animate-spin mx-auto"></div>
            <p className="text-sm font-semibold text-slate-600">
              Calibrating FirstRound Aptitude Question Bank...
            </p>
          </div>
        ) : (
          <React.Suspense
            fallback={
              <div className="py-16 text-center text-slate-400 text-sm font-semibold animate-pulse">
                Loading workspace view…
              </div>
            }
          >
            {activeTab === 'home' && (
              <DashboardHome
                currentUser={currentUser}
                tests={catalogueTests}
                weakQuestions={weakQuestions}
                bookmarkedItems={bookmarkedItems}
                userAttempts={userAttempts}
                leaderboard={leaderboard}
                onStartTest={handleStartTest}
                onNavigateTab={setActiveTab}
                onOpenScratchpad={() => setIsScratchpadOpen(true)}
                onOpenProfile={() => setIsProfileModalOpen(true)}
                onViewAttemptReport={(attempt) => setLatestAttemptReport(attempt)}
              />
            )}

            {activeTab === 'tests' && (
              <TestHubErrorBoundary>
                <TestHub
                  tests={catalogueTests}
                  companies={companies}
                  currentUser={currentUser}
                  userAttempts={userAttempts}
                  weakQuestions={weakQuestions}
                  onStartTest={handleStartTest}
                  onNavigateTab={setActiveTab}
                />
              </TestHubErrorBoundary>
            )}

            {activeTab === 'vault' && (
              <RevisionVaultView
                weakQuestions={weakQuestions}
                bookmarkedItems={bookmarkedItems}
                tests={tests}
                onRemoveBookmark={handleToggleBookmark}
                onStartCustomQuiz={handleStartCustomRevisionQuiz}
                onStartTest={handleStartTest}
                onAskAI={handleAskAIDoubt}
                currentUser={currentUser}
              />
            )}

            {activeTab === 'leaderboard' && (
              <LeaderboardView
                leaderboard={leaderboard}
                currentUserId={currentUser?.id}
                currentUser={currentUser}
                onNavigateTab={setActiveTab}
              />
            )}

            {activeTab === 'admin' && (
              currentUser?.role === 'admin' || currentUser?.role === 'super_admin' ? (
                <AdminPanel
                  currentUser={currentUser}
                  tests={tests}
                  onRefreshTests={async () => {
                    const res = await apiGetTests();
                    const all = res.tests || [];
                    setTests(all);
                    setCatalogueTests(all.filter((t: TestSeries) => t.id.startsWith('cat_')));
                  }}
                />
              ) : (
                <div className="max-w-md mx-auto my-12 p-8 bg-white rounded-3xl border border-slate-200 text-center space-y-4 shadow-sm">
                  <div className="w-12 h-12 rounded-2xl bg-rose-100 text-rose-600 flex items-center justify-center mx-auto font-bold text-xl">
                    403
                  </div>
                  <h3 className="text-xl font-bold text-slate-900 font-['Outfit']">Access Forbidden</h3>
                  <p className="text-xs text-slate-500">
                    You do not have administrative privileges to access the Admin Command Center.
                  </p>
                  <button
                    onClick={() => setActiveTab('home')}
                    className="px-5 py-2.5 bg-primary text-white text-xs font-bold rounded-xl shadow-xs hover:bg-primary-hover transition-colors"
                  >
                    Return to Home
                  </button>
                </div>
              )
            )}

            {activeTab === 'settings' && currentUser && (
              <AccountSettingsView
                currentUser={currentUser}
                onUpdateUser={handleUpdateUser}
                onNavigateTab={setActiveTab}
                onLogout={handleLogout}
                onDeleteAccountSuccess={() => {
                  localStorage.removeItem('firstround_uid');
                  sessionStorage.removeItem('firstround_testhub_category');
                  setUserId(null);
                  setCurrentUser(null);
                  setUserAttempts([]);
                  setWeakQuestions([]);
                  setBookmarkedItems([]);
                  setIsAuthModalOpen(false);
                  setActiveTab('home');
                }}
              />
            )}
          </React.Suspense>
        )}
      </main>

      {/* Auth & Candidate Switcher Modal */}
      {isAuthModalOpen && (
        <AuthModal
          onClose={() => setIsAuthModalOpen(false)}
          onSelectUser={handleSwitchUser}
          onSuccess={handleSwitchUser}
          currentUserId={currentUser?.id}
          initialMode={authModalMode}
        />
      )}

      {/* Candidate Profile Modal */}
      {isProfileModalOpen && currentUser && (
        <UserProfileModal
          user={currentUser}
          attempts={userAttempts}
          onClose={() => setIsProfileModalOpen(false)}
          onUpdateUser={handleUpdateUser}
          onViewAttemptReport={(attempt) => {
            setIsProfileModalOpen(false);
            setLatestAttemptReport(attempt);
          }}
        />
      )}

      {/* Floating Placement Toolkit Modal */}
      {isScratchpadOpen && (
        <ScratchpadModal
          userId={currentUser?.id || userId}
          onClose={() => setIsScratchpadOpen(false)}
        />
      )}

      {/* Comprehensive Test Result Modal */}
      {latestAttemptReport && (
        <TestResultModal
          attempt={latestAttemptReport}
          onClose={() => setLatestAttemptReport(null)}
          onRetake={async () => {
            const currentAttempt = latestAttemptReport;
            setLatestAttemptReport(null);
            const foundTest = tests.find((t) => t.id === currentAttempt.testId);
            if (foundTest) {
              await handleStartTest(foundTest, 'exam');
            }
          }}
          onAskAI={handleAskAIDoubt}
        />
      )}

      {/* Floating FirstRound AI Copilot Launcher */}
      <button
        id="floating-ai-copilot-launcher"
        onClick={() => setIsAICopilotOpen(true)}
        className="fixed bottom-5 right-5 z-40 px-4 py-2.5 bg-slate-950 hover:bg-slate-900 active:scale-95 text-amber-300 font-black text-xs rounded-full shadow-2xl border border-amber-400/40 flex items-center gap-2 transition-all group"
        title="Open FirstRound AI Placement Copilot"
      >
        <Sparkles className="w-4 h-4 fill-amber-400 text-amber-400 group-hover:rotate-12 transition-transform" />
        <span>FirstRound AI</span>
      </button>

      {/* FirstRound AI Placement Copilot Modal */}
      {isAICopilotOpen && (
        <AIErrorBoundary onClose={() => setIsAICopilotOpen(false)}>
          <FirstRoundAICopilotModal
            currentUser={currentUser}
            onClose={() => setIsAICopilotOpen(false)}
            onNavigateTab={setActiveTab}
            onExecuteAction={handleExecuteAIAction}
          />
        </AIErrorBoundary>
      )}
      {/* Toast Feedback Alert */}
      {toastMessage && (
        <div
          id="app-toast-alert"
          className="fixed bottom-5 right-5 z-50 bg-slate-900 text-white text-xs font-semibold px-4 py-3 rounded-xl shadow-lg border border-slate-700 flex items-center gap-3 animate-in fade-in slide-in-from-bottom-3 duration-200"
        >
          <span>{toastMessage}</span>
          <button
            onClick={() => setToastMessage(null)}
            className="text-slate-400 hover:text-white text-xs ml-2"
          >
            ✕
          </button>
        </div>
      )}
    </div>
  );
}
