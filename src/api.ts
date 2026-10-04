import { supabase, isSupabaseConfigured } from './services/supabaseClient';
import {
  AdminStats,
  AIDoubtResponse,
  AppNotification,
  BookmarkedItem,
  CompanyInfo,
  LeaderboardEntry,
  MegaEvent,
  Question,
  QuestionResponse,
  TestAttempt,
  TestMode,
  TestSeries,
  User,
  WeakQuestionItem,
  DeepAIEntitlementStatus,
  AssessmentAccessType,
  SubscriptionPlan,
  SubscriptionStatus,
  CreditSource,
  CreditTransactionType,
  DeepAICreditLedgerItem,
  DeepAICreditBalance,
  AssessmentEntitlement,
  DeepAISession,
  PaymentOrder,
  PaymentConfigResponse,
  PaymentProductType,
  PremiumSubscription,
  SubscriptionInfo,
  PlusTestSelection,
  SubscriptionPlanConfig,
  Advertisement,
} from './types';

// ─── Session token cache ─────────────────────────────────────────────────────
// Cache the Supabase access token for up to 30 seconds to avoid a network
// round-trip on every API call. Invalidated on Supabase auth state changes.
let _cachedToken: string | null = null;
let _cacheExpiry = 0;

// ─── Scoped In-Memory API Cache & Request Deduplication ─────────────────────
const _apiCache = new Map<string, { data: any; expiry: number }>();
const _inFlightRequests = new Map<string, Promise<any>>();

export function invalidateApiCache(pattern?: string) {
  if (!pattern) {
    _apiCache.clear();
    return;
  }
  for (const key of _apiCache.keys()) {
    if (key.includes(pattern)) {
      _apiCache.delete(key);
    }
  }
}

async function cachedApiCall<T>(key: string, ttlMs: number, fetcher: () => Promise<T>): Promise<T> {
  const now = Date.now();
  const existing = _apiCache.get(key);
  if (existing && now < existing.expiry) {
    return existing.data as T;
  }
  if (_inFlightRequests.has(key)) {
    return _inFlightRequests.get(key) as Promise<T>;
  }

  const promise = (async () => {
    try {
      const data = await fetcher();
      if (ttlMs > 0 && data !== null && data !== undefined) {
        _apiCache.set(key, { data, expiry: Date.now() + ttlMs });
      }
      return data;
    } finally {
      _inFlightRequests.delete(key);
    }
  })();

  _inFlightRequests.set(key, promise);
  return promise;
}

// Listen for auth changes and clear the cache immediately on sign-in/sign-out
supabase.auth.onAuthStateChange(() => {
  _cachedToken = null;
  _cacheExpiry = 0;
  _apiCache.clear();
});

if (typeof window !== 'undefined') {
  window.addEventListener('firstround:credits-updated', () => invalidateApiCache('credit'));
  window.addEventListener('firstround:subscription-updated', () => {
    invalidateApiCache('sub');
    invalidateApiCache('entitlement');
  });
  window.addEventListener('firstround:entitlement-updated', () => invalidateApiCache('entitlement'));
  window.addEventListener('firstround:notifications-updated', () => invalidateApiCache('notif'));
}


async function getAuthHeaders(userId?: string, extraHeaders: Record<string, string> = {}): Promise<Record<string, string>> {
  const headers: Record<string, string> = { ...extraHeaders };
  // Always include x-user-id when a userId is known.
  // This serves as a reliable fallback on the server side if Supabase JWT
  // verification fails (e.g. network error, key mismatch, rate limit).
  // The server's getAuthenticatedUser checks x-user-id after the JWT path.
  if (userId) {
    headers['x-user-id'] = userId;
  }
  try {
    const now = Date.now();
    let token: string | null = null;
    if (_cachedToken && now < _cacheExpiry) {
      // Use cached token — avoids a network round-trip to Supabase
      token = _cachedToken;
    } else {
      const { data } = await supabase.auth.getSession();
      token = data?.session?.access_token ?? null;
      if (token) {
        _cachedToken = token;
        _cacheExpiry = now + 30_000; // 30-second cache window
      }
    }
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
      return headers;
    }
  } catch (e) {}

  if (userId && !headers['Authorization']) {
    headers['Authorization'] = `Bearer ${userId}`;
  }
  return headers;
}

export async function parseJsonResponse<T = any>(res: Response, fallbackErrorMessage: string): Promise<T> {
  const contentType = res.headers.get('content-type') || '';
  let data: any = null;

  if (contentType.includes('application/json')) {
    try {
      const text = await res.text();
      if (text && text.trim().length > 0) {
        data = JSON.parse(text);
      }
    } catch (e) {
      console.error('[API Response JSON Parse Warning]', e);
    }
  }

  if (!res.ok) {
    const errorMsg = data?.error || data?.message || `${fallbackErrorMessage} (${res.status})`;
    throw new Error(errorMsg);
  }

  if (data === null) {
    throw new Error(fallbackErrorMessage);
  }

  if (data.success === false && data.error) {
    throw new Error(data.error);
  }

  return data as T;
}

// Named API Client Functions
export async function apiLoginOrRegister(payload: {
  email: string;
  name?: string;
  college?: string;
  targetCompany?: string;
  targetRole?: string;
  role?: 'student' | 'admin';
}): Promise<User> {
  const res = await fetch('/api/auth/login-or-register', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Failed to authenticate');
  return data.user;
}

export async function apiGetUserProfile(userId?: string | null): Promise<{
  user: User | null;
  attempts: TestAttempt[];
  totalBookmarks: number;
  totalWeakQuestions: number;
}> {
  if (!userId) {
    return {
      user: null,
      attempts: [],
      totalBookmarks: 0,
      totalWeakQuestions: 0,
    };
  }
  return cachedApiCall(`profile_${userId}`, 3000, async () => {
    try {
      const headers = await getAuthHeaders(userId || undefined);
      const res = await fetch(`/api/auth/profile/${userId}`, { headers });
      if (res.status === 404) {
        return {
          user: null,
          attempts: [],
          totalBookmarks: 0,
          totalWeakQuestions: 0,
        };
      }
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to fetch user profile');
      return {
        user: {
          ...data.user,
          averageAccuracyPercentage: data.user.averageAccuracy,
        },
        attempts: data.attempts || [],
        totalBookmarks: data.totalBookmarks || 0,
        totalWeakQuestions: data.totalWeakQuestions || 0,
      };
    } catch {
      return {
        user: null,
        attempts: [],
        totalBookmarks: 0,
        totalWeakQuestions: 0,
      };
    }
  });
}

export async function apiUpdateUserProfile(
  userId: string,
  data: Partial<User>
): Promise<{ user: User }> {
  // Sync profile fields to Supabase user_metadata (best-effort, non-blocking).
  // Errors are silently swallowed — the SQLite update below is the authoritative write.
  // IMPORTANT: This never creates a new user; it only updates metadata for the
  // currently authenticated Supabase user. Identity (email, auth ID) is unchanged.
  try {
    if (isSupabaseConfigured()) {
      await supabase.auth.updateUser({
        data: {
          ...(data.name && { name: data.name }),
          ...(data.targetCompany !== undefined && { targetCompany: data.targetCompany }),
          ...(data.targetRole !== undefined && { targetRole: data.targetRole }),
        },
      });
    }
  } catch (e) {}

  // getAuthHeaders always sends x-user-id (the current SQLite user's ID) as a
  // reliable fallback alongside any Supabase JWT, so the server can identify
  // the correct user even if JWT verification fails.
  const headers = await getAuthHeaders(userId, { 'Content-Type': 'application/json' });
  const res = await fetch(`/api/users/${userId}`, {
    method: 'PATCH',
    headers,
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    // Throw on failure so handleUpdateUser never overwrites currentUser with a
    // broken/empty object (which would erase the user's name and show 'Candidate').
    const errData = await res.json().catch(() => ({}));
    throw new Error(errData.error || `Profile update failed (HTTP ${res.status})`);
  }
  const resData = await res.json();
  if (!resData.user) {
    throw new Error('Profile update returned no user data');
  }
  return {
    user: {
      ...resData.user,
      averageAccuracyPercentage: resData.user?.averageAccuracy ?? resData.user?.averageAccuracyPercentage ?? 0,
    },
  };
}

export async function apiUploadAvatar(userId: string, avatarData: string): Promise<{ success: boolean; avatarUrl: string; user: User }> {
  const headers = await getAuthHeaders(userId, { 'Content-Type': 'application/json' });
  const res = await fetch(`/api/users/${userId}/avatar`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ avatarData }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data.error || 'Failed to upload avatar. Please try again.');
  }
  return data;
}

export async function apiRemoveAvatar(userId: string): Promise<{ success: boolean; avatarUrl: string; user: User }> {
  const headers = await getAuthHeaders(userId, { 'Content-Type': 'application/json' });
  const res = await fetch(`/api/users/${userId}/avatar`, {
    method: 'DELETE',
    headers,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data.error || 'Failed to remove profile picture. Please try again.');
  }
  return data;
}

export async function apiSubmitFeedback(params: {
  userId: string;
  rating: number;
  category: string;
  message: string;
  contactRequested: boolean;
}): Promise<{ success: boolean; message: string; feedback: any }> {
  const headers = await getAuthHeaders(params.userId, { 'Content-Type': 'application/json' });
  const res = await fetch('/api/feedback', {
    method: 'POST',
    headers,
    body: JSON.stringify(params),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data.error || 'Failed to submit feedback. Please try again.');
  }
  return data;
}

export async function apiUpdatePassword(userId: string, currentPassword: string, newPassword: string): Promise<{ success: boolean; message: string; user?: User }> {
  const headers = await getAuthHeaders(userId, { 'Content-Type': 'application/json' });
  const res = await fetch(`/api/users/${userId}/change-password`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ currentPassword, newPassword }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data.error || 'Failed to update password.');
  }
  return data;
}

export async function apiDeleteOwnAccount(userId: string): Promise<{ success: boolean; message?: string }> {
  const headers = await getAuthHeaders(userId, { 'Content-Type': 'application/json' });
  const res = await fetch('/api/users/me/delete-account', {
    method: 'POST',
    headers,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data.error || 'Failed to delete account. Please try again.');
  }
  return data;
}

export async function apiGetCompanies(): Promise<{ companies: CompanyInfo[] }> {
  return cachedApiCall('companies_all', 10000, async () => {
    try {
      const res = await fetch('/api/companies');
      const data = await res.json();
      return { companies: data.companies || [] };
    } catch {
      return { companies: [] };
    }
  });
}

export async function apiGetTests(params?: {
  category?: string;
  companyId?: string;
  difficulty?: string;
  search?: string;
}): Promise<{ tests: TestSeries[] }> {
  const query = new URLSearchParams();
  if (params?.category) query.append('category', params.category);
  if (params?.companyId) query.append('companyId', params.companyId);
  if (params?.difficulty) query.append('difficulty', params.difficulty);
  if (params?.search) query.append('search', params.search);
  const qStr = query.toString();

  return cachedApiCall(`tests_${qStr}`, qStr ? 3000 : 8000, async () => {
    try {
      const res = await fetch(`/api/tests?${qStr}`);
      const data = await res.json();
      return { tests: data.tests || [] };
    } catch {
      return { tests: [] };
    }
  });
}

/**
 * Returns ONLY the 15 catalogue blueprint tests (cat_ prefix).
 * Used exclusively by Explore Tests (TestHub) to show only the new architecture.
 * Does NOT affect Home recommendation data which continues to use apiGetTests().
 */
export async function apiGetCatalogue(): Promise<{ tests: TestSeries[] }> {
  return cachedApiCall('catalogue_all', 8000, async () => {
    try {
      const res = await fetch('/api/catalogue');
      const data = await res.json();
      return { tests: data.tests || [] };
    } catch {
      return { tests: [] };
    }
  });
}

export async function apiGetMegaEvents(): Promise<{ events: MegaEvent[] }> {
  return cachedApiCall('mega_events_all', 10000, async () => {
    try {
      const res = await fetch('/api/mega-events');
      const data = await res.json();
      return { events: data.megaEvents || [] };
    } catch {
      return { events: [] };
    }
  });
}

export async function apiGetTestById(id: string, userId?: string | null): Promise<{ test: TestSeries & { questions: Question[] }; isLocked?: boolean; error?: string }> {
  const headers = await getAuthHeaders(userId || undefined);
  const res = await fetch(`/api/tests/${id}`, { headers });
  const data = await res.json();
  if (res.status === 403 && data?.isLocked) {
    return { test: data.test, isLocked: true, error: data.error };
  }
  if (!res.ok) throw new Error(data.error || 'Failed to fetch test');
  return { test: data.test };
}

export async function apiSubmitAttempt(payload: {
  testId: string;
  testInstanceId?: string;
  userId: string;
  responses: QuestionResponse[];
  timeTakenSeconds: number;
  mode?: 'exam' | 'practice';
}): Promise<{ attempt: TestAttempt }> {
  const headers = await getAuthHeaders(payload.userId, { 'Content-Type': 'application/json' });
  const res = await fetch(`/api/tests/${payload.testId}/submit`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      userId: payload.userId,
      testInstanceId: payload.testInstanceId,
      mode: payload.mode || 'exam',
      responses: payload.responses,
      timeTakenSeconds: payload.timeTakenSeconds,
    }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Failed to submit test');
  return { attempt: data.attempt };
}


export async function apiGetUserAttempts(userId?: string | null): Promise<{ attempts: TestAttempt[] }> {
  if (!userId) return { attempts: [] };
  try {
    const headers = await getAuthHeaders(userId || undefined);
    const res = await fetch(`/api/attempts?userId=${userId}`, { headers });
    const data = await res.json();
    return { attempts: data.attempts || [] };
  } catch {
    return { attempts: [] };
  }
}

export async function apiGetLeaderboard(params?: {
  category?: string;
  company?: string;
}): Promise<{ leaderboard: LeaderboardEntry[] }> {
  try {
    const query = new URLSearchParams();
    if (params?.category) query.append('category', params.category);
    if (params?.company) query.append('company', params.company);

    const res = await fetch(`/api/leaderboard?${query.toString()}`);
    const data = await res.json();
    return { leaderboard: data.leaderboard || [] };
  } catch {
    return { leaderboard: [] };
  }
}


export async function apiToggleBookmark(
  userId: string,
  questionId: string
): Promise<{ bookmarked: boolean }> {
  const headers = await getAuthHeaders(userId, { 'Content-Type': 'application/json' });
  const res = await fetch('/api/bookmarks/toggle', {
    method: 'POST',
    headers,
    body: JSON.stringify({ userId, questionId }),
  });
  const data = await res.json();
  return data;
}

export async function apiGetBookmarkedQuestions(
  userId?: string | null
): Promise<{ bookmarks: BookmarkedItem[] }> {
  if (!userId) return { bookmarks: [] };
  const headers = await getAuthHeaders(userId || undefined);
  const res = await fetch(`/api/bookmarks?userId=${userId}`, { headers });
  const data = await res.json();
  return { bookmarks: data.bookmarks || [] };
}

export async function apiGetWeakQuestions(
  userId?: string | null
): Promise<{ weakQuestions: WeakQuestionItem[] }> {
  if (!userId) return { weakQuestions: [] };
  const headers = await getAuthHeaders(userId || undefined);
  const res = await fetch(`/api/revision-vault/weak-questions?userId=${userId}`, { headers });
  const data = await res.json();
  return { weakQuestions: data.weakQuestions || [] };
}

export async function apiAskAIDoubt(payload: {
  question: Question;
  userSelectedOption?: string | null;
  studentQuestion?: string;
}): Promise<AIDoubtResponse> {
  const headers = await getAuthHeaders(undefined, { 'Content-Type': 'application/json' });
  const res = await fetch('/api/ai/ask-doubt', {
    method: 'POST',
    headers,
    body: JSON.stringify(payload),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Failed to fetch AI explanation');
  return data.explanation;
}

export async function apiAskAICopilot(payload: {
  message: string;
  mode?: import('./types').AICopilotMode;
  userContext?: import('./types').AICopilotUserContext;
  history?: Array<{ sender: string; text: string }>;
  userId?: string;
}): Promise<import('./types').AICopilotResponse> {
  const resolvedUserId = payload.userId || (typeof localStorage !== 'undefined' ? localStorage.getItem('firstround_uid') || undefined : undefined);
  const headers = await getAuthHeaders(resolvedUserId, { 'Content-Type': 'application/json' });
  const res = await fetch('/api/ai/copilot', {
    method: 'POST',
    headers,
    body: JSON.stringify({ ...payload, userId: resolvedUserId }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Something went wrong. Please try again.');
  return {
    text: data.text || 'No response generated.',
    mode: data.mode || payload.mode || 'PLACEMENT_COACH',
    actions: data.actions || [],
  };
}

export async function apiGetPlacementStrategy(
  userId?: string
): Promise<{ success: boolean; strategy: import('./types').PlacementStrategy }> {
  const query = userId ? `?userId=${encodeURIComponent(userId)}` : '';
  const headers = await getAuthHeaders(userId);
  const res = await fetch(`/api/ai/placement-strategy${query}`, { headers });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Failed to fetch placement strategy');
  return data;
}

export async function apiGetAdminStats(userId?: string): Promise<{ stats: AdminStats }> {
  const headers = await getAuthHeaders(userId);
  const res = await fetch('/api/admin/stats', { headers });
  const data = await res.json();
  return { stats: data.stats };
}

export async function apiGetQAReport(userId?: string): Promise<{ success: boolean; report: any }> {
  const headers = await getAuthHeaders(userId);
  const res = await fetch('/api/admin/qa-report', { headers });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Failed to fetch QA report');
  return data;
}

export async function apiGetAdminUsersDirectory(userId: string): Promise<{ success: boolean; users: User[] }> {
  const headers = await getAuthHeaders(userId);
  const res = await fetch('/api/admin/users', { headers });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Failed to fetch user directory');
  return data;
}

export async function apiGetTeamMembers(userId: string): Promise<{ success: boolean; members: User[] }> {
  const headers = await getAuthHeaders(userId);
  const res = await fetch('/api/admin/team-members', { headers });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Failed to fetch team members');
  return data;
}

export async function apiSearchUsers(userId: string, query: string): Promise<{ success: boolean; users: User[] }> {
  const headers = await getAuthHeaders(userId);
  const res = await fetch(`/api/admin/users/search?q=${encodeURIComponent(query)}`, { headers });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Failed to search users');
  return data;
}

export async function apiPromoteUser(userId: string, targetUserId: string): Promise<{ success: boolean; user: User }> {
  const headers = await getAuthHeaders(userId, { 'Content-Type': 'application/json' });
  const res = await fetch('/api/admin/users/promote', {
    method: 'POST',
    headers,
    body: JSON.stringify({ targetUserId }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Failed to promote user');
  return data;
}

export async function apiRevokeUser(userId: string, targetUserId: string): Promise<{ success: boolean; user: User }> {
  const headers = await getAuthHeaders(userId, { 'Content-Type': 'application/json' });
  const res = await fetch('/api/admin/users/revoke', {
    method: 'POST',
    headers,
    body: JSON.stringify({ targetUserId }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Failed to revoke user');
  return data;
}

export async function apiGetNotifications(
  userId?: string | null
): Promise<{ notifications: AppNotification[]; unreadCount: number; readIds: string[] }> {
  return cachedApiCall(`notif_${userId || 'anon'}`, 3000, async () => {
    const query = userId ? `?userId=${encodeURIComponent(userId)}` : '';
    const headers = await getAuthHeaders(userId || undefined);
    const res = await fetch(`/api/notifications${query}`, { headers });
    const data = await res.json();
    return {
      notifications: data.notifications || [],
      unreadCount: data.unreadCount || 0,
      readIds: data.readIds || [],
    };
  });
}

export async function apiMarkNotificationRead(
  userId: string,
  notificationId: string
): Promise<{ success: boolean; unreadCount: number }> {
  const headers = await getAuthHeaders(userId, { 'Content-Type': 'application/json' });
  const res = await fetch(`/api/notifications/${notificationId}/read`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ userId }),
  });
  const data = await res.json();
  return data;
}

export async function apiMarkAllNotificationsRead(
  userId: string
): Promise<{ success: boolean; unreadCount: number }> {
  const headers = await getAuthHeaders(userId, { 'Content-Type': 'application/json' });
  const res = await fetch('/api/notifications/mark-all-read', {
    method: 'POST',
    headers,
    body: JSON.stringify({ userId }),
  });
  const data = await res.json();
  return data;
}

export async function apiGetCandidateCount(
  company?: string,
  userId?: string
): Promise<{ count: number }> {
  const headers = await getAuthHeaders(userId);
  const query = company ? `?company=${encodeURIComponent(company)}` : '';
  const res = await fetch(`/api/admin/candidates/count${query}`, { headers });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Failed to fetch candidate count');
  return { count: data.count || 0 };
}

export async function apiCreateAnnouncement(
  payload: {
    title: string;
    message: string;
    type?: string;
    priority?: string;
    targetCompany?: string;
    targetUserId?: string;
    audience?: string;
    actionType?: string;
    actionTargetId?: string;
    actionTestId?: string;
    actionTab?: string;
    actionLabel?: string;
    actionUrl?: string;
    expiresAt?: string;
  },
  userId?: string
): Promise<{ success: boolean; notification: AppNotification; candidateCount?: number; message?: string }> {
  const headers = await getAuthHeaders(userId, { 'Content-Type': 'application/json' });
  const res = await fetch('/api/admin/announcements', {
    method: 'POST',
    headers,
    body: JSON.stringify(payload),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Failed to create announcement');
  return data;
}

// --- Phase 18E: Coding Execution API Client ---

export async function apiGetCodingLanguages(): Promise<Record<string, any>> {
  const res = await fetch('/api/coding/languages');
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Failed to fetch languages');
  return data.languages;
}

export async function apiRunCode(payload: {
  questionId: string;
  userId: string;
  language: string;
  sourceCode: string;
  customInput?: string;
}): Promise<any> {
  const headers = await getAuthHeaders(payload.userId, { 'Content-Type': 'application/json' });
  const res = await fetch('/api/coding/run', {
    method: 'POST',
    headers,
    body: JSON.stringify(payload),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Failed to run code');
  return data.result;
}

export async function apiSubmitCode(payload: {
  questionId: string;
  userId: string;
  testSeriesId?: string;
  testAttemptId?: string;
  language: string;
  sourceCode: string;
}): Promise<any> {
  const headers = await getAuthHeaders(payload.userId, { 'Content-Type': 'application/json' });
  const res = await fetch('/api/coding/submit', {
    method: 'POST',
    headers,
    body: JSON.stringify(payload),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Failed to submit code');
  return data.result;
}

export async function apiGetCodingSubmissions(userId: string, questionId?: string): Promise<any[]> {
  const headers = await getAuthHeaders(userId);
  const url = questionId
    ? `/api/coding/submissions?userId=${encodeURIComponent(userId)}&questionId=${encodeURIComponent(questionId)}`
    : `/api/coding/submissions?userId=${encodeURIComponent(userId)}`;
  const res = await fetch(url, { headers });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Failed to fetch coding submissions');
  return data.submissions;
}

export const apiGetTestHistory = async (userId: string) => {
  const headers = await getAuthHeaders(userId);
  const res = await fetch(`/api/tests/history?userId=${userId}`, { headers });
  const data = await res.json();
  if (!data.success) throw new Error(data.error || 'Failed to fetch history');
  return data.history;
};

export const apiLogTestVisit = async (userId: string, testId: string, mode: string = 'exam') => {
  const headers = await getAuthHeaders(userId, { 'Content-Type': 'application/json' });
  const res = await fetch('/api/tests/history/visit', {
    method: 'POST',
    headers,
    body: JSON.stringify({ userId, testId, mode })
  });
  const data = await res.json();
  if (!data.success) throw new Error(data.error || 'Failed to log visit');
  return data;
};

export const apiLogTestStart = async (userId: string, testId: string, mode: string = 'exam') => {
  const headers = await getAuthHeaders(userId, { 'Content-Type': 'application/json' });
  const res = await fetch('/api/tests/history/start', {
    method: 'POST',
    headers,
    body: JSON.stringify({ userId, testId, mode })
  });
  const data = await res.json();
  if (!data.success) throw new Error(data.error || 'Failed to log start');
  return data;
};

export async function apiGetCurrentLeague(userId: string): Promise<any> {
  const headers = await getAuthHeaders(userId);
  const res = await fetch(`/api/league/current?userId=${encodeURIComponent(userId)}`, { headers });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Failed to fetch current league overview');
  return data;
}

export async function apiGetNationalLeague(userId?: string, company?: string): Promise<any> {
  const headers = await getAuthHeaders(userId || undefined);
  const params = new URLSearchParams();
  if (userId) params.set('userId', userId);
  if (company) params.set('company', company);
  const res = await fetch(`/api/league/national?${params.toString()}`, { headers });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Failed to fetch national ranking');
  return data;
}

// --- Assessment Builder & Question Bank API Helpers ---

export async function apiGetAdminAssessments(userId: string): Promise<TestSeries[]> {
  const headers = await getAuthHeaders(userId);
  const res = await fetch('/api/admin/assessments', { headers });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Failed to fetch assessments');
  return data.assessments;
}

export async function apiSaveAdminAssessment(userId: string, assessment: any): Promise<TestSeries> {
  const method = assessment.id ? 'PUT' : 'POST';
  const url = assessment.id ? `/api/admin/assessments/${assessment.id}` : '/api/admin/assessments';
  const headers = await getAuthHeaders(userId, { 'Content-Type': 'application/json' });
  const res = await fetch(url, {
    method,
    headers,
    body: JSON.stringify(assessment),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Failed to save assessment');
  return data.assessment;
}

export async function apiUpdateAssessmentStatus(userId: string, id: string, status: 'DRAFT' | 'REVIEW' | 'PUBLISHED' | 'ARCHIVED'): Promise<TestSeries> {
  const headers = await getAuthHeaders(userId, { 'Content-Type': 'application/json' });
  const res = await fetch(`/api/admin/assessments/${id}/status`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ status }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Failed to update assessment status');
  return data.assessment;
}

export async function apiIngestTestContent(userId: string, payload: { mode: 'manual' | 'ai' | 'import'; format?: 'csv' | 'json' | 'pdf'; content?: string; aiParams?: any; questions?: any[] }): Promise<{ testMetadata?: any; questions: any[] }> {
  const headers = await getAuthHeaders(userId, { 'Content-Type': 'application/json' });
  const res = await fetch('/api/admin/ingest-test-content', {
    method: 'POST',
    headers,
    body: JSON.stringify(payload),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Failed to ingest content');
  return { testMetadata: data.testMetadata, questions: data.questions || [] };
}

export async function apiCompleteQuestion(userId: string, question: any): Promise<any> {
  const headers = await getAuthHeaders(userId, { 'Content-Type': 'application/json' });
  const res = await fetch('/api/admin/complete-question', {
    method: 'POST',
    headers,
    body: JSON.stringify({ question }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Failed to complete question');
  return data.question;
}

export async function apiGetCanonicalQuestions(userId: string): Promise<{ questions: Question[]; usageMap: Record<string, string[]> }> {
  const headers = await getAuthHeaders(userId);
  const res = await fetch('/api/admin/questions', { headers });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Failed to fetch question bank');
  return { questions: data.questions, usageMap: data.usageMap || {} };
}

export async function apiSaveCanonicalQuestion(userId: string, question: any): Promise<Question> {
  const method = question.id ? 'PUT' : 'POST';
  const url = question.id ? `/api/admin/questions/${question.id}` : '/api/admin/questions';
  const headers = await getAuthHeaders(userId, { 'Content-Type': 'application/json' });
  const res = await fetch(url, {
    method,
    headers,
    body: JSON.stringify(question),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Failed to save question');
  return data.question;
}

export async function apiCheckQuestionDuplicates(userId: string, questionText: string): Promise<any> {
  const headers = await getAuthHeaders(userId, { 'Content-Type': 'application/json' });
  const res = await fetch('/api/admin/questions/check-duplicates', {
    method: 'POST',
    headers,
    body: JSON.stringify({ questionText }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Failed to check duplicates');
  return data;
}

export async function apiImportQuestionsBulk(
  userId: string,
  questions: any[],
  resolutions: Record<number, string>
): Promise<any> {
  const headers = await getAuthHeaders(userId, { 'Content-Type': 'application/json' });
  const res = await fetch('/api/admin/questions/import', {
    method: 'POST',
    headers,
    body: JSON.stringify({ questions, resolutions }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Failed to import questions');
  return data.report;
}

export async function apiGenerateAdminAITestSeries(
  userId: string,
  payload: { topicOrCompany: string; category: string; difficulty: string; numQuestions: number }
): Promise<{ success: boolean; test: TestSeries }> {
  const headers = await getAuthHeaders(userId, { 'Content-Type': 'application/json' });
  const res = await fetch('/api/admin/generate-ai-test', {
    method: 'POST',
    headers,
    body: JSON.stringify(payload),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Failed to generate AI test series');
  return data;
}

// ─── Deep AI & Premium Entitlement APIs ──────────────────────────────────────

export async function apiGetDeepAIStatus(userId?: string): Promise<DeepAIEntitlementStatus> {
  const headers = await getAuthHeaders(userId);
  const url = userId ? `/api/ai/deep-help/status?userId=${encodeURIComponent(userId)}` : '/api/ai/deep-help/status';
  const res = await fetch(url, { headers });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Failed to fetch Deep AI status');
  return data;
}

export async function apiDeductWeeklyXP(userId?: string, amount: number = 1): Promise<{ success: boolean; newWeeklyXp: number }> {
  const headers = await getAuthHeaders(userId, { 'Content-Type': 'application/json' });
  const res = await fetch('/api/user/deduct-weekly-xp', {
    method: 'POST',
    headers,
    body: JSON.stringify({ userId, amount }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Failed to deduct Weekly XP');
  return data;
}

export async function apiGetWeeklyXP(userId?: string): Promise<{ success: boolean; weeklyXp: number }> {
  const headers = await getAuthHeaders(userId);
  const url = userId ? `/api/user/weekly-xp?userId=${encodeURIComponent(userId)}` : '/api/user/weekly-xp';
  const res = await fetch(url, { headers });
  const data = await res.json();
  return data;
}

export async function apiAskDeepAI(
  userId: string | undefined,
  payload: {
    question: Question;
    userSelectedOption?: string | null;
    studentQuestion?: string;
    currentStep?: number;
    mode?: string;
    assessmentId?: string;
    testSeriesId?: string;
    action?: 'init' | 'query';
    requestType?: 'hint' | 'solution' | 'chat' | 'init';
    hintIndex?: number;
  }
): Promise<{
  success: boolean;
  explanation?: string;
  hints?: string[];
  stepByStep?: string[];
  conceptualBreakdown?: string;
  modelUsed?: string;
  isNewSession?: boolean;
  sessionId?: string;
  creditsLeft?: number;
}> {
  const headers = await getAuthHeaders(userId, { 'Content-Type': 'application/json' });
  const res = await fetch('/api/ai/deep-help', {
    method: 'POST',
    headers,
    body: JSON.stringify({ ...payload, userId }),
  });
  const data = await res.json();
  if (!res.ok) {
    const error: any = new Error(data.error || 'Failed to get Deep AI response');
    error.isLocked = data.isLocked;
    error.status = data.status;
    error.remainingCredits = data.remainingCredits;
    throw error;
  }
  return data;
}

export async function apiUpdateUserSubscription(
  adminUserId: string,
  targetUserId: string,
  payload: {
    plan?: SubscriptionPlan;
    subscriptionStatus?: SubscriptionStatus;
    subscriptionExpiresAt?: string | null;
    provider?: string | null;
    providerCustomerId?: string | null;
    providerSubscriptionId?: string | null;
    currentPeriodStart?: string | null;
    currentPeriodEnd?: string | null;
  }
): Promise<User> {
  const headers = await getAuthHeaders(adminUserId, { 'Content-Type': 'application/json' });
  const res = await fetch(`/api/admin/users/${targetUserId}/subscription`, {
    method: 'POST',
    headers,
    body: JSON.stringify(payload),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Failed to update subscription');
  return data.user;
}

export async function apiUpdateTestAccessType(
  adminUserId: string,
  testId: string,
  accessType: AssessmentAccessType
): Promise<TestSeries> {
  const headers = await getAuthHeaders(adminUserId, { 'Content-Type': 'application/json' });
  const res = await fetch(`/api/admin/tests/${testId}/access-type`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ accessType }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Failed to update test access type');
  return data.test;
}

// ─── Deep AI Credits & Assessment Entitlements Client APIs ───────────────────

export async function apiGetCredits(userId?: string): Promise<DeepAICreditBalance> {
  return cachedApiCall(`credits_${userId || 'anon'}`, 3000, async () => {
    const headers = await getAuthHeaders(userId);
    const url = userId ? `/api/ai/credits?userId=${encodeURIComponent(userId)}` : '/api/ai/credits';
    const res = await fetch(url, { headers });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Failed to fetch credit balance');
    return data;
  });
}

export async function apiGetCreditLedger(userId?: string): Promise<{ ledger: DeepAICreditLedgerItem[] }> {
  const headers = await getAuthHeaders(userId);
  const url = userId ? `/api/ai/credits/ledger?userId=${encodeURIComponent(userId)}` : '/api/ai/credits/ledger';
  const res = await fetch(url, { headers });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Failed to fetch credit ledger');
  return data;
}

export async function apiGetAssessmentAccess(
  testId: string,
  userId?: string
): Promise<{ allowed: boolean; isPremium: boolean; unlockedVia?: string; reason?: string }> {
  const headers = await getAuthHeaders(userId);
  const res = await fetch(`/api/assessments/${testId}/access`, { headers });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Failed to check assessment access');
  return data;
}

export async function apiAdminGetUserCredits(
  adminUserId: string,
  targetUserId: string
): Promise<{ balance: DeepAICreditBalance; ledger: DeepAICreditLedgerItem[] }> {
  const headers = await getAuthHeaders(adminUserId);
  const res = await fetch(`/api/admin/users/${targetUserId}/credits`, { headers });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Failed to fetch user credits');
  return data;
}

export async function apiAdminAdjustCredits(
  adminUserId: string,
  targetUserId: string,
  payload: { amount: number; source?: CreditSource; description?: string }
): Promise<{ balance: DeepAICreditBalance; ledger: DeepAICreditLedgerItem[] }> {
  const headers = await getAuthHeaders(adminUserId, { 'Content-Type': 'application/json' });
  const res = await fetch(`/api/admin/users/${targetUserId}/credits/adjust`, {
    method: 'POST',
    headers,
    body: JSON.stringify(payload),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Failed to adjust user credits');
  return data;
}

export async function apiGetMyEntitlements(userId?: string): Promise<{ success: boolean; entitlements: AssessmentEntitlement[] }> {
  return cachedApiCall(`entitlements_${userId || 'anon'}`, 3000, async () => {
    const headers = await getAuthHeaders(userId);
    const res = await fetch('/api/users/me/entitlements', { headers });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Failed to fetch entitlements');
    return data;
  });
}

export async function apiSetTestAccessType(
  adminUserId: string,
  testId: string,
  accessType: 'FREE' | 'PREMIUM'
): Promise<{ success: boolean; test: TestSeries }> {
  const headers = await getAuthHeaders(adminUserId, { 'Content-Type': 'application/json' });
  const res = await fetch(`/api/admin/tests/${testId}/access-type`, {
    method: 'PATCH',
    headers,
    body: JSON.stringify({ accessType }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Failed to update test access type');
  return data;
}

export async function apiAdminGetUserEntitlements(
  adminUserId: string,
  targetUserId: string
): Promise<{ entitlements: AssessmentEntitlement[] }> {
  const headers = await getAuthHeaders(adminUserId);
  const res = await fetch(`/api/admin/users/${targetUserId}/entitlements`, { headers });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Failed to fetch user entitlements');
  return data;
}

export async function apiAdminGrantEntitlement(
  adminUserId: string,
  targetUserId: string,
  payload: { assessmentId: string; expiresAt?: string | null; grantedBy?: string }
): Promise<{ entitlement: AssessmentEntitlement }> {
  const headers = await getAuthHeaders(adminUserId, { 'Content-Type': 'application/json' });
  const res = await fetch(`/api/admin/users/${targetUserId}/entitlements`, {
    method: 'POST',
    headers,
    body: JSON.stringify(payload),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Failed to grant entitlement');
  return data;
}

export async function apiAdminRevokeEntitlement(
  adminUserId: string,
  targetUserId: string,
  assessmentId: string
): Promise<{ success: boolean }> {
  const headers = await getAuthHeaders(adminUserId);
  const res = await fetch(`/api/admin/users/${targetUserId}/entitlements/${assessmentId}`, {
    method: 'DELETE',
    headers,
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Failed to revoke entitlement');
  return data;
}

// ─── Phase H.5 Admin User Management & Credit APIs ───────────────────────────
export async function apiAdminGrantCredits(
  adminUserId: string,
  targetUserId: string,
  amount: number,
  creditType: 'FREE' | 'PURCHASED' | 'PREMIUM',
  reason?: string
): Promise<{ success: boolean; balance: DeepAICreditBalance; ledger: DeepAICreditLedgerItem[] }> {
  const headers = await getAuthHeaders(adminUserId, { 'Content-Type': 'application/json' });
  const res = await fetch(`/api/admin/users/${targetUserId}/grant-credits`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ amount, creditType, reason }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Failed to grant credits');
  return data;
}

export async function apiAdminTempBanUser(
  adminUserId: string,
  targetUserId: string,
  durationDays: number,
  reason?: string
): Promise<{ success: boolean; user: User }> {
  const headers = await getAuthHeaders(adminUserId, { 'Content-Type': 'application/json' });
  const res = await fetch(`/api/admin/users/${targetUserId}/temp-ban`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ durationDays, reason }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Failed to temp-ban user');
  return data;
}

export async function apiAdminRestoreUserAccess(
  adminUserId: string,
  targetUserId: string
): Promise<{ success: boolean; user: User }> {
  const headers = await getAuthHeaders(adminUserId, { 'Content-Type': 'application/json' });
  const res = await fetch(`/api/admin/users/${targetUserId}/restore-access`, {
    method: 'POST',
    headers,
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Failed to restore user access');
  return data;
}

export async function apiAdminPermBanUser(
  adminUserId: string,
  targetUserId: string,
  confirmationEmailOrName: string,
  reason?: string
): Promise<{ success: boolean; user: User }> {
  const headers = await getAuthHeaders(adminUserId, { 'Content-Type': 'application/json' });
  const res = await fetch(`/api/admin/users/${targetUserId}/perm-ban`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ confirmationEmailOrName, reason }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Failed to permanently ban user');
  return data;
}

export async function apiAdminDeleteUser(
  adminUserId: string,
  targetUserId: string,
  confirmEmail: string
): Promise<{ success: boolean; message: string }> {
  const headers = await getAuthHeaders(adminUserId, { 'Content-Type': 'application/json' });
  const res = await fetch(`/api/admin/users/${targetUserId}/delete`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ confirmEmail }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Failed to delete user');
  return data;
}

// ─── Payment APIs (Phase E) ──────────────────────────────────────────────────

export async function apiGetPaymentConfig(): Promise<PaymentConfigResponse> {
  const res = await fetch('/api/payments/config');
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Failed to fetch payment configuration');
  return data;
}

export async function apiCreatePaymentOrder(
  productType: PaymentProductType,
  productId: string,
  userId?: string
): Promise<{
  success: boolean;
  orderId: string;
  razorpayOrderId: string;
  amount: number;
  currency: string;
  keyId: string;
  testMode: boolean;
  productDetails: any;
}> {
  const headers = await getAuthHeaders(userId, { 'Content-Type': 'application/json' });
  const res = await fetch('/api/payments/orders', {
    method: 'POST',
    headers,
    body: JSON.stringify({ productType, productId }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Failed to create payment order');
  return data;
}

export async function apiVerifyPayment(
  payload: {
    orderId: string;
    razorpayOrderId: string;
    razorpayPaymentId: string;
    razorpaySignature: string;
  },
  userId?: string
): Promise<{ success: boolean; order: PaymentOrder; alreadyFulfilled: boolean }> {
  const headers = await getAuthHeaders(userId, { 'Content-Type': 'application/json' });
  const res = await fetch('/api/payments/verify', {
    method: 'POST',
    headers,
    body: JSON.stringify(payload),
  });
  return parseJsonResponse(res, 'Payment verification failed');
}

export async function apiAdminGetPayments(
  adminUserId: string,
  params?: {
    from?: string;
    to?: string;
    count?: number;
    skip?: number;
    status?: string;
  }
): Promise<{
  success: boolean;
  payments: PaymentOrder[];
  pagination?: { total: number; count: number; skip: number; hasMore: boolean };
  summary?: {
    totalAmount: number;
    capturedCount: number;
    createdCount: number;
    unmatchedCount: number;
    fulfilledCount: number;
    pendingCount: number;
  };
}> {
  const headers = await getAuthHeaders(adminUserId);
  const searchParams = new URLSearchParams();
  if (params?.from) searchParams.set('from', params.from);
  if (params?.to) searchParams.set('to', params.to);
  if (params?.count !== undefined) searchParams.set('count', String(params.count));
  if (params?.skip !== undefined) searchParams.set('skip', String(params.skip));
  if (params?.status) searchParams.set('status', params.status);

  const queryStr = searchParams.toString();
  const url = '/api/admin/payments' + (queryStr ? `?${queryStr}` : '');

  const res = await fetch(url, { headers });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Failed to fetch payments');
  return data;
}

// ─── Recurring Premium Subscription APIs (Phase F) ───────────────────────────

export async function apiCreateSubscription(
  userId?: string
): Promise<{
  success: boolean;
  subscriptionId: string;
  razorpaySubscriptionId: string;
  keyId: string;
  testMode: boolean;
  plan: SubscriptionPlanConfig;
}> {
  const headers = await getAuthHeaders(userId, { 'Content-Type': 'application/json' });
  const res = await fetch('/api/payments/subscriptions', {
    method: 'POST',
    headers,
    body: JSON.stringify({}),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Failed to create subscription');
  return data;
}

export async function apiVerifySubscription(
  payload: {
    subscriptionId?: string;
    razorpaySubscriptionId: string;
    razorpayPaymentId: string;
    razorpaySignature: string;
  },
  userId?: string
): Promise<{ success: boolean; subscription: PremiumSubscription; alreadyActive: boolean }> {
  const headers = await getAuthHeaders(userId, { 'Content-Type': 'application/json' });
  const res = await fetch('/api/payments/subscriptions/verify', {
    method: 'POST',
    headers,
    body: JSON.stringify(payload),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Subscription verification failed');
  return data;
}

export async function apiCancelSubscription(
  subscriptionId: string,
  userId?: string
): Promise<{ success: boolean; message: string; subscription: PremiumSubscription }> {
  const headers = await getAuthHeaders(userId, { 'Content-Type': 'application/json' });
  const res = await fetch(`/api/payments/subscriptions/${subscriptionId}/cancel`, {
    method: 'POST',
    headers,
    body: JSON.stringify({}),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Failed to cancel subscription');
  return data;
}

export async function apiAdminGetSubscriptions(
  adminUserId: string
): Promise<{ success: boolean; subscriptions: (PremiumSubscription & { userEmail?: string; userName?: string })[] }> {
  const headers = await getAuthHeaders(adminUserId);
  const res = await fetch('/api/admin/subscriptions', { headers });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Failed to fetch subscriptions');
  return data;
}

export async function apiGetQuestionHint(
  questionId: string,
  userId?: string,
  selectedOption?: string | null
): Promise<{ success: boolean; hint: string; cached: boolean }> {
  const headers = await getAuthHeaders(userId);
  const paramOption = selectedOption ? `&selectedOption=${encodeURIComponent(selectedOption)}` : '';
  const res = await fetch(`/api/ai/question-hint?questionId=${encodeURIComponent(questionId)}${paramOption}`, { headers });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Failed to fetch question hint');
  return data;
}

export async function apiDeepAIHelp(payload: {
  question: Question;
  mode?: 'practice' | 'revision' | 'exam';
  assessmentId?: string;
  action?: 'init' | 'query';
  requestType?: 'init' | 'solution' | 'chat' | 'hint';
  studentQuestion?: string;
  userSelectedOption?: string | null;
  currentStep?: number;
  userId?: string;
}): Promise<any> {
  const headers = await getAuthHeaders(payload.userId, { 'Content-Type': 'application/json' });
  const res = await fetch('/api/ai/deep-help', {
    method: 'POST',
    headers,
    body: JSON.stringify(payload),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Deep AI request failed');
  return data;
}

export async function apiGetAdminAdvertisements(userId: string): Promise<Advertisement[]> {
  const headers = await getAuthHeaders(userId);
  const res = await fetch('/api/admin/advertisements?includeTest=true', { headers });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Failed to fetch advertisements');
  return data.advertisements || [];
}

export async function apiCreateAdvertisement(userId: string, adData: Partial<Advertisement>): Promise<Advertisement> {
  const headers = await getAuthHeaders(userId, { 'Content-Type': 'application/json' });
  const res = await fetch('/api/admin/advertisements', {
    method: 'POST',
    headers,
    body: JSON.stringify(adData),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Failed to create advertisement');
  return data.advertisement;
}

export async function apiUpdateAdvertisement(userId: string, id: string, adData: Partial<Advertisement>): Promise<Advertisement> {
  const headers = await getAuthHeaders(userId, { 'Content-Type': 'application/json' });
  const res = await fetch(`/api/admin/advertisements/${id}`, {
    method: 'PUT',
    headers,
    body: JSON.stringify(adData),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Failed to update advertisement');
  return data.advertisement;
}

export async function apiUpdateAdvertisementStatus(userId: string, id: string, status: string): Promise<Advertisement> {
  const headers = await getAuthHeaders(userId, { 'Content-Type': 'application/json' });
  const res = await fetch(`/api/admin/advertisements/${id}/status`, {
    method: 'PATCH',
    headers,
    body: JSON.stringify({ status }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Failed to update advertisement status');
  return data.advertisement;
}

export async function apiDeleteAdvertisement(userId: string, id: string): Promise<boolean> {
  if (!id || typeof id !== 'string' || !id.trim() || id === 'undefined') {
    throw new Error('Valid advertisement ID is required');
  }
  const headers = await getAuthHeaders(userId);
  const res = await fetch(`/api/admin/advertisements/${encodeURIComponent(id.trim())}`, {
    method: 'DELETE',
    headers,
  });

  let data: any = {};
  try {
    data = await res.json();
  } catch (e) {
    data = {};
  }

  if (res.status === 404) {
    throw new Error('Advertisement no longer exists. Refreshing sponsor list...');
  }
  if (!res.ok) {
    throw new Error(data?.error || data?.message || `Could not delete advertisement (${res.status}). Please try again.`);
  }

  return data?.success ?? true;
}

export async function apiGetQuestionBankCount(userId?: string): Promise<number> {
  const headers = userId ? await getAuthHeaders(userId) : { 'Content-Type': 'application/json' };
  const res = await fetch('/api/admin/question-bank/count', { headers });
  if (!res.ok) {
    throw new Error('Failed to fetch question bank count');
  }
  const data = await res.json();
  return data.count ?? 0;
}

export async function apiDeleteAdminAssessment(userId: string, testSeriesId: string): Promise<{ success: boolean; deletedTestSeriesId: string; deletedQuestionsLinks?: number; deletedOrphanQuestions?: number }> {
  if (!testSeriesId || !testSeriesId.trim()) {
    throw new Error('Assessment ID is required for deletion');
  }
  const headers = await getAuthHeaders(userId);
  const res = await fetch(`/api/admin/assessments/${encodeURIComponent(testSeriesId.trim())}`, {
    method: 'DELETE',
    headers,
  });
  const data = await res.json();
  if (!res.ok || !data.success) {
    throw new Error(data.error || data.message || 'Could not delete this assessment. No changes were made.');
  }
  return data;
}

// ─── Phase 1 & 2 Premium Subscription Foundation Client APIs ────────────────

export async function apiGetSubscriptionPlans(): Promise<Record<string, SubscriptionPlanConfig>> {
  const res = await fetch('/api/subscription/plans');
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Failed to fetch subscription plans');
  return data.plans;
}

export async function apiGetMySubscription(userId?: string): Promise<SubscriptionInfo> {
  return cachedApiCall(`sub_${userId || 'anon'}`, 3000, async () => {
    const headers = await getAuthHeaders(userId);
    const res = await fetch('/api/subscription/me', { headers });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Failed to fetch user subscription');
    return data.subscription;
  });
}

export async function apiSelectPlusAssessment(assessmentId: string, userId?: string): Promise<{ success: boolean; selections: string[] }> {
  const headers = await getAuthHeaders(userId, { 'Content-Type': 'application/json' });
  const res = await fetch('/api/subscription/plus-selections', {
    method: 'POST',
    headers,
    body: JSON.stringify({ assessmentId }),
  });
  const data = await res.json();
  if (!res.ok || !data.success) {
    throw new Error(data.error || 'Failed to select Premium assessment');
  }
  return data;
}

export async function apiDeselectPlusAssessment(assessmentId: string, userId?: string): Promise<{ success: boolean; selections: string[] }> {
  const headers = await getAuthHeaders(userId);
  const res = await fetch(`/api/subscription/plus-selections/${encodeURIComponent(assessmentId)}`, {
    method: 'DELETE',
    headers,
  });
  const data = await res.json();
  if (!res.ok || !data.success) {
    throw new Error(data.error || 'Failed to deselect Premium assessment');
  }
  return data;
}

export async function apiCreateSubscriptionOrder(
  plan: 'PLUS' | 'PRO',
  userId?: string
): Promise<{
  success: boolean;
  orderId: string;
  razorpayOrderId: string;
  amount: number;
  currency: string;
  keyId: string;
  plan: string;
}> {
  const headers = await getAuthHeaders(userId, { 'Content-Type': 'application/json' });
  const res = await fetch('/api/subscription/create-order', {
    method: 'POST',
    headers,
    body: JSON.stringify({ plan }),
  });
  return parseJsonResponse(res, 'Failed to create subscription order');
}

export async function apiVerifySubscriptionPayment(
  payload: {
    orderId: string;
    razorpayOrderId: string;
    razorpayPaymentId: string;
    razorpaySignature: string;
  },
  userId?: string
): Promise<{ success: boolean; subscription: SubscriptionInfo; alreadyFulfilled: boolean }> {
  const headers = await getAuthHeaders(userId, { 'Content-Type': 'application/json' });
  const res = await fetch('/api/subscription/verify-payment', {
    method: 'POST',
    headers,
    body: JSON.stringify(payload),
  });
  return parseJsonResponse(res, 'Payment verification failed');
}

export async function apiCancelSubscriptionRenewal(
  userId?: string
): Promise<{ success: boolean; subscription: SubscriptionInfo }> {
  const headers = await getAuthHeaders(userId, { 'Content-Type': 'application/json' });
  const res = await fetch('/api/subscription/cancel', {
    method: 'POST',
    headers,
    body: JSON.stringify({}),
  });
  return parseJsonResponse(res, 'Failed to cancel subscription renewal');
}

export async function apiKeepSubscription(
  userId?: string
): Promise<{ success: boolean; subscription: SubscriptionInfo }> {
  const headers = await getAuthHeaders(userId, { 'Content-Type': 'application/json' });
  const res = await fetch('/api/subscription/keep', {
    method: 'POST',
    headers,
    body: JSON.stringify({}),
  });
  return parseJsonResponse(res, 'Failed to keep subscription renewal');
}

export async function apiScheduleSubscriptionDowngrade(
  targetPlan: 'PLUS' = 'PLUS',
  userId?: string
): Promise<{ success: boolean; subscription: SubscriptionInfo }> {
  const headers = await getAuthHeaders(userId, { 'Content-Type': 'application/json' });
  const res = await fetch('/api/subscription/schedule-downgrade', {
    method: 'POST',
    headers,
    body: JSON.stringify({ targetPlan }),
  });
  return parseJsonResponse(res, 'Failed to schedule subscription downgrade');
}









