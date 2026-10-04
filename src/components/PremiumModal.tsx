import React, { useState, useEffect } from 'react';
import {
  Crown,
  X,
  Check,
  Zap,
  Sparkles,
  ShieldCheck,
  AlertCircle,
  Calendar,
  Clock,
  ArrowRight,
  ArrowLeft,
  Loader2,
  RefreshCw,
  CheckCircle2,
  Lock,
} from 'lucide-react';
import { User, SubscriptionInfo, SubscriptionPlan } from '../types';
import {
  apiGetMySubscription,
  apiCancelSubscriptionRenewal,
  apiKeepSubscription,
  apiScheduleSubscriptionDowngrade,
} from '../api';
import { startRazorpayPremiumCheckout } from '../services/razorpayService';

export interface PremiumModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentUser: User | null;
  onRefreshSubscription?: () => void;
  initialTab?: 'plans' | 'manage';
  source?: string | null;
}

export const PremiumModal: React.FC<PremiumModalProps> = ({
  isOpen,
  onClose,
  currentUser,
  onRefreshSubscription,
  initialTab = 'plans',
  source = null,
}) => {
  const [activeTab, setActiveTab] = useState<'plans' | 'manage'>(initialTab);
  const [subscription, setSubscription] = useState<SubscriptionInfo | null>(null);
  const [loadingSub, setLoadingSub] = useState<boolean>(false);
  const [processingPlan, setProcessingPlan] = useState<'PLUS' | 'PRO' | null>(null);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [notice, setNotice] = useState<{ text: string; type: 'success' | 'error' | 'info' } | null>(null);
  const [showCancelConfirmModal, setShowCancelConfirmModal] = useState<boolean>(false);

  // Sync tab on modal open
  useEffect(() => {
    if (isOpen) {
      setActiveTab(initialTab);
      setNotice(null);
      fetchSubscriptionState();
    }
  }, [isOpen, initialTab, currentUser?.id]);

  const fetchSubscriptionState = async () => {
    if (!currentUser?.id) return;
    setLoadingSub(true);
    try {
      const sub = await apiGetMySubscription(currentUser.id);
      setSubscription(sub);
      if (onRefreshSubscription) onRefreshSubscription();
    } catch (err) {
      console.error('[PremiumModal] Failed to fetch subscription:', err);
    } finally {
      setLoadingSub(false);
    }
  };

  useEffect(() => {
    const handleSubUpdated = () => {
      fetchSubscriptionState();
    };
    window.addEventListener('firstround:subscription-updated', handleSubUpdated);
    return () => window.removeEventListener('firstround:subscription-updated', handleSubUpdated);
  }, [currentUser?.id]);

  if (!isOpen) return null;

  const activePlan: SubscriptionPlan = subscription?.plan || currentUser?.plan || 'FREE';
  const isSubActive = (subscription?.status || currentUser?.subscriptionStatus || '').toLowerCase() === 'active';
  const cancelScheduled = Boolean(subscription?.cancelAtPeriodEnd);
  const pendingPlan = subscription?.pendingPlan;

  const formatDate = (isoString: string | null | undefined): string => {
    if (!isoString) return 'N/A';
    try {
      const date = new Date(isoString);
      return date.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
    } catch {
      return isoString;
    }
  };

  const handleStartPurchase = (plan: 'PLUS' | 'PRO') => {
    if (!currentUser?.id) {
      setNotice({ text: 'Please sign in to purchase FirstRound Premium.', type: 'error' });
      return;
    }

    setProcessingPlan(plan);
    setNotice(null);

    startRazorpayPremiumCheckout({
      plan,
      userId: currentUser.id,
      userName: currentUser.name,
      userEmail: currentUser.email,
      onSuccess: async (res) => {
        setProcessingPlan(null);
        setNotice({
          text: `Welcome to FirstRound Premium 🎉 Your ${plan} subscription is now active!`,
          type: 'success',
        });
        await fetchSubscriptionState();
        window.dispatchEvent(new CustomEvent('firstround:subscription-updated'));
        window.dispatchEvent(new CustomEvent('firstround:entitlement-updated'));
        window.dispatchEvent(new CustomEvent('firstround:credits-updated'));
      },
      onError: (err) => {
        setProcessingPlan(null);
        setNotice({ text: err || 'Subscription payment could not be completed.', type: 'error' });
      },
      onCancel: () => {
        setProcessingPlan(null);
        setNotice({ text: 'Payment cancelled.', type: 'info' });
      },
    });
  };

  const handleCancelRenewal = async () => {
    if (!currentUser?.id) return;
    setActionLoading('cancelling');
    setNotice(null);
    try {
      const res = await apiCancelSubscriptionRenewal(currentUser.id);
      if (res.subscription) {
        setSubscription(res.subscription);
      }
      setShowCancelConfirmModal(false);
      setNotice({
        text: `Cancellation scheduled. Your Premium access will continue until ${formatDate(res.subscription?.currentPeriodEnd)}.`,
        type: 'info',
      });
      window.dispatchEvent(new CustomEvent('firstround:subscription-updated'));
    } catch (err: any) {
      setNotice({ text: err.message || 'Failed to cancel subscription renewal.', type: 'error' });
    } finally {
      setActionLoading(null);
    }
  };

  const handleKeepPremium = async () => {
    if (!currentUser?.id) return;
    setActionLoading('reactivating');
    setNotice(null);
    try {
      const res = await apiKeepSubscription(currentUser.id);
      if (res.subscription) {
        setSubscription(res.subscription);
      }
      setNotice({ text: 'Renewal reactivated! Your Premium subscription will continue as normal.', type: 'success' });
      window.dispatchEvent(new CustomEvent('firstround:subscription-updated'));
    } catch (err: any) {
      setNotice({ text: err.message || 'Failed to keep subscription.', type: 'error' });
    } finally {
      setActionLoading(null);
    }
  };

  const handleScheduleDowngrade = async () => {
    if (!currentUser?.id) return;
    setActionLoading('downgrading');
    setNotice(null);
    try {
      const res = await apiScheduleSubscriptionDowngrade('PLUS', currentUser.id);
      if (res.subscription) {
        setSubscription(res.subscription);
      }
      setNotice({
        text: `Your Pro access will continue until ${formatDate(res.subscription?.currentPeriodEnd)}. After that date, your plan will change to Plus.`,
        type: 'info',
      });
      window.dispatchEvent(new CustomEvent('firstround:subscription-updated'));
    } catch (err: any) {
      setNotice({ text: err.message || 'Failed to schedule downgrade.', type: 'error' });
    } finally {
      setActionLoading(null);
    }
  };

  const handleBackToWallet = () => {
    onClose();
    window.dispatchEvent(
      new CustomEvent('firstround:open-credit-wallet', {
        detail: { view: 'wallet' },
      })
    );
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/75 backdrop-blur-xs animate-in fade-in duration-200 overflow-y-auto">
      <div className="bg-white border border-slate-200 rounded-3xl shadow-2xl max-w-4xl w-full my-8 overflow-hidden relative font-sans">
        {/* Header Bar */}
        <div className="bg-[#00223E] text-white p-6 sm:p-8 relative">
          <button
            onClick={onClose}
            className="absolute top-5 right-5 p-2 text-slate-300 hover:text-white hover:bg-white/10 rounded-full transition-colors cursor-pointer"
            title="Close modal"
          >
            <X className="w-5 h-5" />
          </button>

          {source === 'credit_wallet' && (
            <button
              id="premium-modal-back-wallet-btn"
              onClick={handleBackToWallet}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white/10 hover:bg-white/20 active:bg-white/30 text-slate-200 hover:text-white text-xs font-semibold transition-colors cursor-pointer mb-3 sm:mb-4 border border-white/15 shadow-2xs"
              title="Back to AI Credits Wallet"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              <span>Back to AI Credits</span>
            </button>
          )}

          <div className="flex items-center gap-3 mb-2">
            <div className="w-10 h-10 rounded-2xl bg-[#FFC412] text-slate-950 flex items-center justify-center font-extrabold shadow-md">
              <Crown className="w-5 h-5 fill-slate-950" />
            </div>
            <div>
              <h2 className="text-xl sm:text-2xl font-extrabold font-['Outfit'] tracking-tight">
                FirstRound Premium
              </h2>
              <p className="text-xs text-slate-300 font-medium">
                Unlock company-specific mocks, AI tutoring, and campus placement excellence
              </p>
            </div>
          </div>

          {/* Navigation Tabs */}
          <div className="flex items-center gap-2 mt-6 pt-4 border-t border-white/10">
            <button
              onClick={() => setActiveTab('plans')}
              className={`px-4 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                activeTab === 'plans'
                  ? 'bg-[#FFC412] text-slate-950 shadow-xs'
                  : 'text-slate-300 hover:text-white hover:bg-white/10'
              }`}
            >
              Subscription Plans
            </button>
            {isSubActive && activePlan !== 'FREE' && (
              <button
                onClick={() => setActiveTab('manage')}
                className={`px-4 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                  activeTab === 'manage'
                    ? 'bg-[#FFC412] text-slate-950 shadow-xs'
                    : 'text-slate-300 hover:text-white hover:bg-white/10'
                }`}
              >
                Manage Current Plan ({activePlan})
              </button>
            )}
          </div>
        </div>

        {/* Notice Banner */}
        {notice && (
          <div
            className={`p-4 border-b text-xs font-semibold flex items-center justify-between gap-2 ${
              notice.type === 'success'
                ? 'bg-emerald-50 text-emerald-900 border-emerald-200'
                : notice.type === 'error'
                ? 'bg-rose-50 text-rose-900 border-rose-200'
                : 'bg-blue-50 text-blue-900 border-blue-200'
            }`}
          >
            <div className="flex items-center gap-2">
              {notice.type === 'success' ? (
                <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
              ) : notice.type === 'error' ? (
                <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
              ) : (
                <Clock className="w-4 h-4 text-blue-600 shrink-0" />
              )}
              <span>{notice.text}</span>
            </div>
            <button onClick={() => setNotice(null)} className="p-1 hover:opacity-75 cursor-pointer">
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        )}

        {/* Content Body */}
        <div className="p-6 sm:p-8 space-y-6 max-h-[70vh] overflow-y-auto">
          {loadingSub && (
            <div className="py-8 text-center text-slate-500 text-xs font-semibold flex items-center justify-center gap-2">
              <Loader2 className="w-4 h-4 animate-spin text-[#00223E]" />
              <span>Loading subscription details...</span>
            </div>
          )}

          {/* TAB 1: PLANS GRID */}
          {activeTab === 'plans' && (
            <div className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6 items-stretch">
                {/* PLAN 1: FREE */}
                <div className="bg-slate-50 border border-slate-200 rounded-3xl p-6 flex flex-col justify-between space-y-6">
                  <div className="space-y-4">
                    <div>
                      <span className="text-[10px] font-extrabold uppercase tracking-wider text-slate-500 bg-slate-200/80 px-2.5 py-1 rounded-md">
                        Standard
                      </span>
                      <h3 className="text-xl font-bold font-['Outfit'] text-slate-900 mt-2">FREE</h3>
                      <div className="mt-1 flex items-baseline gap-1">
                        <span className="text-2xl font-extrabold text-slate-900">₹0</span>
                        <span className="text-xs text-slate-500 font-medium">/ forever</span>
                      </div>
                    </div>

                    <div className="border-t border-slate-200 pt-4 space-y-2.5 text-xs text-slate-600">
                      <div className="flex items-center gap-2 font-medium">
                        <Check className="w-4 h-4 text-emerald-600 shrink-0" />
                        <span>Free candidate test catalogue</span>
                      </div>
                      <div className="flex items-center gap-2 font-medium">
                        <Check className="w-4 h-4 text-emerald-600 shrink-0" />
                        <span>Revision Vault & Weak questions</span>
                      </div>
                      <div className="flex items-center gap-2 font-medium">
                        <Check className="w-4 h-4 text-emerald-600 shrink-0" />
                        <span>National League & Rankings</span>
                      </div>
                      <div className="flex items-center gap-2 font-medium">
                        <Check className="w-4 h-4 text-emerald-600 shrink-0" />
                        <span>6 Free Deep AI Credits</span>
                      </div>
                    </div>
                  </div>

                  <div className="pt-4">
                    {activePlan === 'FREE' && (!isSubActive || activePlan === 'FREE') ? (
                      <span className="block text-center py-2.5 px-4 bg-slate-200 text-slate-700 text-xs font-bold rounded-xl border border-slate-300">
                        Current Plan
                      </span>
                    ) : (
                      <span className="block text-center py-2.5 px-4 bg-slate-100 text-slate-400 text-xs font-medium rounded-xl border border-slate-200">
                        Free Tier
                      </span>
                    )}
                  </div>
                </div>

                {/* PLAN 2: PLUS (₹199/month) */}
                <div className="bg-white border-2 border-amber-400 rounded-3xl p-6 flex flex-col justify-between space-y-6 shadow-md relative">
                  <div className="absolute -top-3 left-1/2 -translate-x-1/2 bg-amber-400 text-slate-950 px-3 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider shadow-2xs">
                    Popular Choice
                  </div>

                  <div className="space-y-4">
                    <div>
                      <span className="text-[10px] font-extrabold uppercase tracking-wider text-amber-900 bg-amber-100 px-2.5 py-1 rounded-md">
                        Selected Mocks
                      </span>
                      <h3 className="text-xl font-bold font-['Outfit'] text-slate-900 mt-2">PLUS</h3>
                      <div className="mt-1 flex items-baseline gap-1">
                        <span className="text-2xl font-extrabold text-slate-900">₹199</span>
                        <span className="text-xs text-slate-500 font-medium">/ month</span>
                      </div>
                    </div>

                    <div className="border-t border-slate-100 pt-4 space-y-2.5 text-xs text-slate-700">
                      <div className="flex items-center gap-2 font-semibold">
                        <Check className="w-4 h-4 text-amber-500 shrink-0" />
                        <span>Everything in Free</span>
                      </div>
                      <div className="flex items-center gap-2 font-bold text-slate-900">
                        <Crown className="w-4 h-4 text-amber-500 fill-amber-400 shrink-0" />
                        <span>Choose any 2 Premium tests</span>
                      </div>
                      <div className="flex items-center gap-2 font-semibold">
                        <Sparkles className="w-4 h-4 text-amber-500 fill-amber-400 shrink-0" />
                        <span>50 Deep AI Credits / month</span>
                      </div>
                      <div className="flex items-center gap-2 font-medium text-slate-600">
                        <Check className="w-4 h-4 text-emerald-600 shrink-0" />
                        <span>Full AI Socratic tutor guidance</span>
                      </div>
                    </div>
                  </div>

                  <div className="pt-4 space-y-2">
                    {isSubActive && activePlan === 'PLUS' ? (
                      <>
                        <span className="block text-center py-2.5 px-4 bg-emerald-100 text-emerald-900 text-xs font-extrabold rounded-xl border border-emerald-300">
                          Current Plan (Plus)
                        </span>
                        <button
                          onClick={() => setActiveTab('manage')}
                          className="w-full py-2 px-3 bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold rounded-xl transition-all cursor-pointer"
                        >
                          Manage Subscription
                        </button>
                      </>
                    ) : isSubActive && activePlan === 'PRO' ? (
                      <button
                        onClick={handleScheduleDowngrade}
                        disabled={actionLoading === 'downgrading' || pendingPlan === 'PLUS'}
                        className="w-full py-2.5 px-4 bg-slate-100 hover:bg-slate-200 text-slate-800 text-xs font-bold rounded-xl border border-slate-300 transition-all cursor-pointer disabled:opacity-50"
                      >
                        {pendingPlan === 'PLUS' ? 'Change to Plus Scheduled' : 'Change to Plus at Renewal'}
                      </button>
                    ) : (
                      <button
                        onClick={() => handleStartPurchase('PLUS')}
                        disabled={processingPlan === 'PLUS'}
                        className="w-full py-2.5 px-4 bg-amber-400 hover:bg-amber-300 active:bg-amber-500 text-slate-950 text-xs font-extrabold rounded-xl shadow-xs transition-all flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
                      >
                        {processingPlan === 'PLUS' ? (
                          <>
                            <Loader2 className="w-4 h-4 animate-spin text-slate-950" />
                            <span>Creating secure order...</span>
                          </>
                        ) : (
                          <>
                            <span>Get Plus</span>
                            <ArrowRight className="w-4 h-4" />
                          </>
                        )}
                      </button>
                    )}
                  </div>
                </div>

                {/* PLAN 3: PRO (₹349/month) */}
                <div className="bg-[#00223E] border-2 border-[#00223E] rounded-3xl p-6 flex flex-col justify-between space-y-6 text-white shadow-xl relative">
                  <div className="absolute -top-3 left-1/2 -translate-x-1/2 bg-purple-500 text-white px-3 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider shadow-2xs">
                    Unlimited Access
                  </div>

                  <div className="space-y-4">
                    <div>
                      <span className="text-[10px] font-extrabold uppercase tracking-wider text-purple-300 bg-purple-900/60 px-2.5 py-1 rounded-md border border-purple-700/50">
                        All Assessments
                      </span>
                      <h3 className="text-xl font-bold font-['Outfit'] text-white mt-2">PRO</h3>
                      <div className="mt-1 flex items-baseline gap-1">
                        <span className="text-2xl font-extrabold text-white">₹349</span>
                        <span className="text-xs text-slate-300 font-medium">/ month</span>
                      </div>
                    </div>

                    <div className="border-t border-white/10 pt-4 space-y-2.5 text-xs text-slate-200">
                      <div className="flex items-center gap-2 font-semibold">
                        <Check className="w-4 h-4 text-purple-400 shrink-0" />
                        <span>Everything in Plus</span>
                      </div>
                      <div className="flex items-center gap-2 font-bold text-white">
                        <Crown className="w-4 h-4 text-amber-400 fill-amber-400 shrink-0" />
                        <span>ALL Current & Future Premium Tests</span>
                      </div>
                      <div className="flex items-center gap-2 font-semibold">
                        <Sparkles className="w-4 h-4 text-amber-400 fill-amber-400 shrink-0" />
                        <span>65 Deep AI Credits / month</span>
                      </div>
                      <div className="flex items-center gap-2 font-medium text-slate-300">
                        <ShieldCheck className="w-4 h-4 text-emerald-400 shrink-0" />
                        <span>No test selection required</span>
                      </div>
                    </div>
                  </div>

                  <div className="pt-4 space-y-2">
                    {isSubActive && activePlan === 'PRO' ? (
                      <>
                        <span className="block text-center py-2.5 px-4 bg-emerald-500/20 text-emerald-300 text-xs font-extrabold rounded-xl border border-emerald-500/30">
                          Current Plan (Pro)
                        </span>
                        <button
                          onClick={() => setActiveTab('manage')}
                          className="w-full py-2 px-3 bg-white/10 hover:bg-white/20 text-white text-xs font-bold rounded-xl transition-all cursor-pointer"
                        >
                          Manage Subscription
                        </button>
                      </>
                    ) : (
                      <button
                        onClick={() => handleStartPurchase('PRO')}
                        disabled={processingPlan === 'PRO'}
                        className="w-full py-2.5 px-4 bg-[#FFC412] hover:bg-amber-300 active:bg-amber-500 text-slate-950 text-xs font-extrabold rounded-xl shadow-xs transition-all flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
                      >
                        {processingPlan === 'PRO' ? (
                          <>
                            <Loader2 className="w-4 h-4 animate-spin text-slate-950" />
                            <span>Creating secure order...</span>
                          </>
                        ) : (
                          <>
                            <span>{isSubActive && activePlan === 'PLUS' ? 'Upgrade to Pro' : 'Get Pro'}</span>
                            <ArrowRight className="w-4 h-4" />
                          </>
                        )}
                      </button>
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* TAB 2: MANAGE SUBSCRIPTION VIEW */}
          {activeTab === 'manage' && (
            <div className="space-y-6">
              <div className="p-6 bg-slate-900 text-white rounded-3xl border border-slate-800 space-y-4">
                <div className="flex items-center justify-between border-b border-slate-800 pb-4">
                  <div>
                    <span className="text-[10px] font-extrabold uppercase tracking-wider text-amber-400">
                      Active Plan
                    </span>
                    <h3 className="text-2xl font-extrabold font-['Outfit'] text-white">
                      FirstRound {activePlan}
                    </h3>
                  </div>

                  <span
                    className={`px-3 py-1 rounded-full text-xs font-extrabold uppercase tracking-wider ${
                      cancelScheduled
                        ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                        : 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                    }`}
                  >
                    {cancelScheduled ? 'CANCELLATION SCHEDULED' : 'ACTIVE'}
                  </span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-xs">
                  <div>
                    <span className="text-slate-400 block font-medium">Plan Price</span>
                    <span className="font-bold text-white text-sm mt-0.5 block">
                      {activePlan === 'PRO' ? '₹349 / month' : '₹199 / month'}
                    </span>
                  </div>

                  <div>
                    <span className="text-slate-400 block font-medium">Current Billing Period End</span>
                    <span className="font-bold text-white text-sm mt-0.5 block">
                      {formatDate(subscription?.currentPeriodEnd)}
                    </span>
                  </div>

                  <div>
                    <span className="text-slate-400 block font-medium">Assessment Entitlement</span>
                    <span className="font-bold text-white text-sm mt-0.5 block">
                      {activePlan === 'PRO'
                        ? 'ALL Premium Tests Unlocked'
                        : `${subscription?.selectedAssessmentIds?.length || 0} / 2 Selected`}
                    </span>
                  </div>
                </div>

                {cancelScheduled && (
                  <div className="p-4 rounded-2xl bg-amber-500/10 border border-amber-500/30 text-amber-200 text-xs space-y-2">
                    <div className="font-bold flex items-center gap-2">
                      <Clock className="w-4 h-4 text-amber-400 shrink-0" />
                      <span>Cancellation Scheduled</span>
                    </div>
                    <p>
                      Your Premium access will remain active until{' '}
                      <strong className="text-white">{formatDate(subscription?.currentPeriodEnd)}</strong>. Your subscription will not renew after that date.
                    </p>
                    {pendingPlan && (
                      <p className="text-slate-300">
                        Scheduled Plan after renewal: <strong>{pendingPlan}</strong>
                      </p>
                    )}
                  </div>
                )}
              </div>

              {/* Action Buttons */}
              <div className="space-y-3 pt-2">
                <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500">Subscription Actions</h4>

                <div className="flex flex-wrap gap-3">
                  {cancelScheduled ? (
                    <button
                      onClick={handleKeepPremium}
                      disabled={actionLoading === 'reactivating'}
                      className="px-5 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs rounded-xl shadow-xs transition-all cursor-pointer disabled:opacity-50 flex items-center gap-2"
                    >
                      {actionLoading === 'reactivating' ? (
                        <>
                          <Loader2 className="w-4 h-4 animate-spin" />
                          <span>Reactivating...</span>
                        </>
                      ) : (
                        <>
                          <Check className="w-4 h-4" />
                          <span>Keep Premium</span>
                        </>
                      )}
                    </button>
                  ) : (
                    <button
                      onClick={() => setShowCancelConfirmModal(true)}
                      disabled={actionLoading === 'cancelling'}
                      className="px-5 py-2.5 bg-rose-50 hover:bg-rose-100 text-rose-700 font-bold text-xs rounded-xl border border-rose-200 transition-all cursor-pointer disabled:opacity-50 flex items-center gap-2"
                    >
                      <X className="w-4 h-4 text-rose-600" />
                      <span>Cancel FirstRound Premium</span>
                    </button>
                  )}

                  {activePlan === 'PLUS' && !cancelScheduled && (
                    <button
                      onClick={() => handleStartPurchase('PRO')}
                      disabled={processingPlan === 'PRO'}
                      className="px-5 py-2.5 bg-[#00223E] hover:bg-slate-800 text-white font-extrabold text-xs rounded-xl shadow-xs transition-all cursor-pointer disabled:opacity-50 flex items-center gap-2"
                    >
                      <Crown className="w-4 h-4 text-amber-400 fill-amber-400" />
                      <span>Upgrade to Pro (₹349/mo)</span>
                    </button>
                  )}

                  {activePlan === 'PRO' && !cancelScheduled && !pendingPlan && (
                    <button
                      onClick={handleScheduleDowngrade}
                      disabled={actionLoading === 'downgrading'}
                      className="px-5 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-800 font-bold text-xs rounded-xl border border-slate-300 transition-all cursor-pointer disabled:opacity-50 flex items-center gap-2"
                    >
                      {actionLoading === 'downgrading' ? (
                        <>
                          <Loader2 className="w-4 h-4 animate-spin" />
                          <span>Scheduling...</span>
                        </>
                      ) : (
                        <>
                          <RefreshCw className="w-4 h-4 text-slate-600" />
                          <span>Change to Plus at Renewal</span>
                        </>
                      )}
                    </button>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* CUSTOM CONFIRMATION MODAL FOR CANCELLATION */}
      {showCancelConfirmModal && (
        <div className="fixed inset-0 z-60 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-xs animate-in fade-in duration-150">
          <div className="bg-white rounded-3xl p-6 sm:p-8 max-w-md w-full border border-slate-200 shadow-2xl space-y-5">
            <div className="w-12 h-12 rounded-2xl bg-rose-50 border border-rose-200 text-rose-600 flex items-center justify-center">
              <AlertCircle className="w-6 h-6" />
            </div>

            <div className="space-y-1.5">
              <h3 className="text-xl font-extrabold text-slate-900 font-['Outfit']">
                Cancel FirstRound Premium?
              </h3>
              <p className="text-xs text-slate-600 leading-relaxed font-medium">
                Your Premium access will continue until{' '}
                <strong className="text-slate-900">{formatDate(subscription?.currentPeriodEnd)}</strong>. Your subscription will not renew after that date.
              </p>
            </div>

            <div className="flex flex-col sm:flex-row gap-3 pt-2">
              <button
                onClick={() => setShowCancelConfirmModal(false)}
                className="flex-1 py-2.5 px-4 bg-slate-100 hover:bg-slate-200 text-slate-800 font-bold text-xs rounded-xl transition-all cursor-pointer"
              >
                Keep Premium
              </button>
              <button
                onClick={handleCancelRenewal}
                disabled={actionLoading === 'cancelling'}
                className="flex-1 py-2.5 px-4 bg-rose-600 hover:bg-rose-700 text-white font-extrabold text-xs rounded-xl shadow-xs transition-all cursor-pointer disabled:opacity-50 flex items-center justify-center gap-1.5"
              >
                {actionLoading === 'cancelling' ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>Cancelling...</span>
                  </>
                ) : (
                  <span>Cancel Renewal</span>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
