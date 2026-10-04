import { User, AssessmentAccessType, DeepAICreditBalance } from '../src/types';
import { db } from './db';

/**
 * Server-side centralized entitlement check for FirstRound Premium plans (PLUS / PRO / PREMIUM).
 * Never trust frontend flags such as isPremium=true.
 * 
 * A user has active premium access if:
 * 1. user.plan is 'PLUS', 'PRO', or 'PREMIUM'
 * 2. user.subscriptionStatus is 'active' or 'ACTIVE'
 * 3. user.subscriptionExpiresAt (or currentPeriodEnd) is null OR in the future
 */
export function hasPremiumAccess(user: User | null | undefined): boolean {
  if (!user) return false;

  const plan = user.plan || 'FREE';
  const isPaidPlan = plan === 'PLUS' || plan === 'PRO' || plan === 'PREMIUM';
  if (!isPaidPlan) {
    return false;
  }

  const status = (user.subscriptionStatus || '').toLowerCase();
  if (status !== 'active') {
    return false;
  }

  const periodEnd = user.currentPeriodEnd || user.subscriptionExpiresAt;
  if (periodEnd) {
    let expiresMs = typeof periodEnd === 'number' ? periodEnd : Number(periodEnd);
    if (isNaN(expiresMs)) {
      expiresMs = new Date(periodEnd).getTime();
    }
    if (!isNaN(expiresMs) && expiresMs <= Date.now()) {
      return false;
    }
  }

  return true;
}

/**
 * Validates if a user is authorized to access a given assessment.
 * Supports passing either User object or userId string, Assessment object or assessmentId string.
 * Defaults dbInstance to imported SQLite `db` singleton.
 */
export function hasAssessmentAccess(
  userArg: User | string | null | undefined,
  assessmentArg: { accessType?: AssessmentAccessType | string; id?: string } | string | null | undefined,
  dbInstance?: any
): {
  allowed: boolean;
  isPremium: boolean;
  unlockedVia?: 'free' | 'subscription' | 'plus_selection' | 'entitlement' | 'admin';
  reason?: string;
} {
  const activeDb = dbInstance || db;

  let user: User | null = null;
  if (typeof userArg === 'string') {
    user = typeof activeDb?.getUserById === 'function' ? activeDb.getUserById(userArg) : (typeof activeDb?.getUser === 'function' ? activeDb.getUser(userArg) : null);
  } else if (userArg && typeof userArg === 'object') {
    user = userArg;
  }

  let assessment: { accessType?: string; id?: string } | null = null;
  if (typeof assessmentArg === 'string') {
    // If passed an ID string, resolve test or default
    const existingTest = activeDb && typeof activeDb.getTestById === 'function' ? activeDb.getTestById(assessmentArg) : null;
    assessment = existingTest || { id: assessmentArg, accessType: 'PREMIUM' };
  } else if (assessmentArg && typeof assessmentArg === 'object') {
    assessment = assessmentArg;
    if (assessment.id && !assessment.accessType && activeDb && typeof activeDb.getTestById === 'function') {
      const dbTest = activeDb.getTestById(assessment.id);
      if (dbTest && dbTest.accessType) {
        assessment = { ...assessment, accessType: dbTest.accessType };
      }
    }
  }

  const isPremiumAssessment = assessment?.accessType === 'PREMIUM';

  // FREE assessments are open to all
  if (!isPremiumAssessment) {
    return { allowed: true, isPremium: false, unlockedVia: 'free' };
  }

  // Admin preview always works regardless of FREE/PREMIUM status
  if (user && (user.role === 'admin' || user.role === 'super_admin')) {
    return { allowed: true, isPremium: true, unlockedVia: 'admin' };
  }

  if (!user || !user.id) {
    return {
      allowed: false,
      isPremium: false,
      reason: 'Please sign in to access this Premium assessment.',
    };
  }

  // Individual assessment entitlement check (purchased or admin-granted)
  if (user?.id && assessment?.id && activeDb) {
    try {
      if (typeof activeDb.hasActiveAssessmentEntitlement === 'function' && activeDb.hasActiveAssessmentEntitlement(user.id, assessment.id)) {
        return { allowed: true, isPremium: true, unlockedVia: 'entitlement' };
      }
    } catch (e) {
      console.error('[Entitlements] Assessment entitlement check failed:', e);
    }
  }

  // Resolve active user subscription details authoritatively from database
  let activePlan = user.plan || 'FREE';
  let isSubActive = hasPremiumAccess(user);
  let plusSelections: string[] = [];

  if (user.id && activeDb && typeof activeDb.getUserSubscription === 'function') {
    try {
      const sub = activeDb.getUserSubscription(user.id);
      if (sub) {
        activePlan = sub.plan || 'FREE';
        isSubActive = (sub.status || '').toLowerCase() === 'active';
        plusSelections = sub.selectedAssessmentIds || [];
      }
    } catch (e) {
      console.error('[Entitlements] getUserSubscription failed:', e);
    }
  }

  // PRO / legacy PREMIUM active subscription grants access to ALL Premium tests
  if (isSubActive && (activePlan === 'PRO' || activePlan === 'PREMIUM')) {
    return { allowed: true, isPremium: true, unlockedVia: 'subscription' };
  }

  // PLUS active subscription grants access ONLY to the user's selected Premium tests
  if (isSubActive && activePlan === 'PLUS' && assessment?.id) {
    if (plusSelections.includes(assessment.id)) {
      return { allowed: true, isPremium: true, unlockedVia: 'plus_selection' };
    }
  }

  return {
    allowed: false,
    isPremium: false,
    reason: activePlan === 'PLUS'
      ? 'Select this assessment as one of your 2 Plus assessments or upgrade to Pro to unlock.'
      : 'Upgrade to FirstRound Plus or Pro to unlock this assessment.',
  };
}

export function canUserAccessAssessment(
  user: User | string | null | undefined,
  assessment: { accessType?: AssessmentAccessType | string; id?: string } | string | null | undefined,
  dbInstance?: any
) {
  return hasAssessmentAccess(user, assessment, dbInstance);
}

/**
 * Validates Deep AI Help eligibility inside Practice Mode.
 * 
 * Rules:
 * 1. Exam Mode: STRICTLY BLOCKED under all circumstances.
 * 2. Admin / Super Admin: Unlimited test preview.
 * 3. Students: Requires at least 1 remaining Deep AI credit (FREE, PURCHASED, or PREMIUM).
 */
export function getDeepAIAccess(
  user: User | null | undefined,
  mode?: string,
  dbInstance?: any
): {
  allowed: boolean;
  isPremium: boolean;
  status: 'eligible' | 'locked' | 'exam_blocked';
  reason?: string;
  remainingCredits: number;
  balance?: DeepAICreditBalance;
} {
  // Exam Mode is strictly blocked
  if (mode === 'exam') {
    return {
      allowed: false,
      isPremium: Boolean(user && hasPremiumAccess(user)),
      status: 'exam_blocked',
      reason: 'Deep AI Help is strictly disabled in Exam Mode to preserve test integrity.',
      remainingCredits: 0,
    };
  }

  // Admin / Super Admin preview entitlement
  if (user && (user.role === 'admin' || user.role === 'super_admin')) {
    const balance: DeepAICreditBalance = (dbInstance && typeof dbInstance.getDeepAICreditBalance === 'function' && user.id)
      ? dbInstance.getDeepAICreditBalance(user.id)
      : { total: 6, free: 6, purchased: 0, premium: 0, isPremiumUser: true };
    return {
      allowed: true,
      isPremium: true,
      status: 'eligible',
      remainingCredits: balance.total,
      balance,
    };
  }

  if (!user || !user.id) {
    return {
      allowed: false,
      isPremium: false,
      status: 'locked',
      reason: 'Please sign in to use Deep AI Help.',
      remainingCredits: 0,
    };
  }

  if (dbInstance && typeof dbInstance.getDeepAICreditBalance === 'function') {
    const balance: DeepAICreditBalance = dbInstance.getDeepAICreditBalance(user.id);
    if (balance.total > 0) {
      return {
        allowed: true,
        isPremium: Boolean(user.isPremium || balance.premium > 0),
        status: 'eligible',
        remainingCredits: balance.total,
        balance,
      };
    } else {
      return {
        allowed: false,
        isPremium: Boolean(user.isPremium || balance.premium > 0),
        status: 'locked',
        reason: 'You have 0 Deep AI credits left. Upgrade to Premium or purchase additional credits to continue.',
        remainingCredits: 0,
        balance,
      };
    }
  }

  return {
    allowed: false,
    isPremium: false,
    status: 'locked',
    reason: '0 Deep AI credits remaining.',
    remainingCredits: 0,
  };
}

/**
 * Backward-compatible helper for Deep AI eligibility check.
 */
export function canUseDeepAI(
  user: User | null | undefined,
  mode?: string,
  dbInstance?: any
): {
  allowed: boolean;
  isPremium: boolean;
  status: 'eligible' | 'locked' | 'exam_blocked';
  reason?: string;
  remainingCredits?: number;
  balance?: DeepAICreditBalance;
} {
  return getDeepAIAccess(user, mode, dbInstance);
}
