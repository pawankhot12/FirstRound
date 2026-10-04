import React, { useState, useEffect, useCallback } from 'react';
import {
  Sparkles,
  X,
  CreditCard,
  Crown,
  Gift,
  HelpCircle,
  AlertCircle,
  ShieldAlert,
  ArrowLeft,
  CheckCircle2,
  Loader2,
  ChevronRight,
  ShoppingCart,
} from 'lucide-react';
import { DeepAICreditBalance, User, CreditPackConfig, SubscriptionInfo } from '../types';
import { apiGetCredits, apiGetPaymentConfig, apiGetMySubscription } from '../api';
import { startRazorpayPurchase } from '../services/razorpayService';

interface CreditWalletModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentUser: User | null;
  creditBalance: DeepAICreditBalance | null;
  isLoading?: boolean;
  onRefresh?: () => void;
  initialView?: 'wallet' | 'buy_packs';
}

export const CreditWalletModal: React.FC<CreditWalletModalProps> = ({
  isOpen,
  onClose,
  currentUser,
  creditBalance: initialBalance,
  isLoading = false,
  onRefresh,
  initialView = 'wallet',
}) => {
  const [balance, setBalance] = useState<DeepAICreditBalance | null>(initialBalance);
  const [fetching, setFetching] = useState(false);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [view, setView] = useState<'wallet' | 'buy_packs'>(initialView);
  const [creditPacks, setCreditPacks] = useState<CreditPackConfig[]>([]);
  const [purchasingPackId, setPurchasingPackId] = useState<string | null>(null);
  const [notice, setNotice] = useState<{ text: string; type: 'success' | 'error' | 'info' } | null>(null);
  const [subInfo, setSubInfo] = useState<SubscriptionInfo | null>(null);

  useEffect(() => {
    setBalance(initialBalance);
  }, [initialBalance]);

  useEffect(() => {
    if (isOpen) {
      setView(initialView);
    }
  }, [isOpen, initialView]);

  // Load payment packs config
  useEffect(() => {
    apiGetPaymentConfig()
      .then((cfg) => {
        if (cfg.creditPacks) {
          setCreditPacks(cfg.creditPacks);
        }
      })
      .catch((err) => {
        console.warn('[CreditWalletModal] Failed to fetch payment config:', err);
      });
  }, []);

  // Parallel refresh of credits and subscription state with unmount guard
  const loadWalletData = useCallback(() => {
    if (!currentUser?.id) return;
    setFetching(true);
    setFetchError(null);

    let isMounted = true;

    Promise.all([
      apiGetCredits(currentUser.id).catch((err) => {
        console.error('[CreditWalletModal] Failed to fetch credits:', err);
        return null;
      }),
      apiGetMySubscription(currentUser.id).catch((err) => {
        console.warn('[CreditWalletModal] Failed to fetch subscription:', err);
        return null;
      }),
    ]).then(([creditsData, subData]) => {
      if (!isMounted) return;
      if (creditsData) {
        setBalance(creditsData);
        setFetchError(null);
      } else if (!balance) {
        setFetchError('Unable to load your credit balance.');
      }
      if (subData) {
        setSubInfo(subData);
      }
      setFetching(false);
      if (onRefresh && creditsData) onRefresh();
    });

    return () => {
      isMounted = false;
    };
  }, [currentUser?.id, balance, onRefresh]);

  useEffect(() => {
    if (isOpen && currentUser?.id) {
      const cancel = loadWalletData();
      return cancel;
    }
  }, [isOpen, currentUser?.id]);

  // Global event listeners
  useEffect(() => {
    const handleSubUpdated = () => {
      if (currentUser?.id) {
        apiGetMySubscription(currentUser.id)
          .then((data) => setSubInfo(data))
          .catch((err) => console.warn('[CreditWalletModal] Failed to fetch subscription:', err));
      }
    };

    const handleCreditsUpdated = () => {
      if (currentUser?.id) {
        apiGetCredits(currentUser.id).then((data) => {
          if (data) {
            setBalance(data);
            setFetchError(null);
          }
          if (onRefresh && data) onRefresh();
        });
      }
    };

    window.addEventListener('firstround:subscription-updated', handleSubUpdated);
    window.addEventListener('firstround:credits-updated', handleCreditsUpdated);
    return () => {
      window.removeEventListener('firstround:subscription-updated', handleSubUpdated);
      window.removeEventListener('firstround:credits-updated', handleCreditsUpdated);
    };
  }, [currentUser?.id, onRefresh]);

  if (!isOpen) return null;

  const total = typeof balance?.total === 'number'
    ? balance.total
    : typeof balance?.totalAvailable === 'number'
    ? balance.totalAvailable
    : 0;

  const free = balance?.free ?? 0;
  const purchased = balance?.purchased ?? 0;
  const premium = balance?.premium ?? 0;
  const isExhausted = total === 0;

  const handleBuyPack = (pack: CreditPackConfig) => {
    if (!currentUser?.id) {
      setNotice({ text: 'Please sign in to purchase AI credits.', type: 'error' });
      return;
    }

    setPurchasingPackId(pack.id);
    setNotice(null);

    startRazorpayPurchase({
      productType: 'AI_CREDIT_PACK',
      productId: pack.id,
      userId: currentUser.id,
      userName: currentUser.name,
      userEmail: currentUser.email,
      onSuccess: ({ order }) => {
        setPurchasingPackId(null);
        setNotice({
          text: `Success! Added ${pack.credits} Deep AI credits to your wallet.`,
          type: 'success',
        });
        if (currentUser.id) {
          apiGetCredits(currentUser.id).then((data) => {
            setBalance(data);
            if (onRefresh) onRefresh();
          });
        }
      },
      onError: (err) => {
        setPurchasingPackId(null);
        setNotice({ text: err || 'Payment failed. Please try again.', type: 'error' });
      },
    });
  };

  return (
    <div
      id="credit-wallet-modal-backdrop"
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-950/60 backdrop-blur-xs animate-in fade-in duration-150"
      onClick={onClose}
    >
      <div
        id="credit-wallet-modal"
        className="bg-white border border-slate-200/90 rounded-3xl w-full max-w-[540px] max-h-[90vh] flex flex-col shadow-2xl overflow-hidden animate-in zoom-in-95 duration-150 text-slate-900"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Modal Sticky Header */}
        <div className="px-4 sm:px-5 py-3.5 bg-[#0B132B] text-white flex items-center justify-between border-b border-slate-800/80 shrink-0">
          <div className="flex items-center gap-3">
            {view === 'buy_packs' ? (
              <button
                id="wallet-back-btn"
                onClick={() => {
                  setView('wallet');
                  setNotice(null);
                }}
                className="p-1.5 -ml-1 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer"
                title="Back to Wallet"
              >
                <ArrowLeft className="w-4.5 h-4.5" />
              </button>
            ) : (
              <div className="w-8 h-8 rounded-xl bg-amber-400 text-slate-950 flex items-center justify-center font-bold shadow-xs shrink-0">
                <Sparkles className="w-4 h-4 fill-slate-950" />
              </div>
            )}
            <div>
              <h3 className="text-sm sm:text-base font-bold font-['Outfit'] text-white leading-snug">
                {view === 'buy_packs' ? 'Buy AI Credit Packs' : 'Deep AI Credits'}
              </h3>
              <p className="text-[11px] text-slate-400 font-normal">
                {view === 'buy_packs' ? 'Test Mode • Immediate Delivery' : 'Socratic diagnostic tutoring balance'}
              </p>
            </div>
          </div>
          <button
            id="credit-wallet-close-btn"
            onClick={onClose}
            aria-label="Close Wallet"
            className="p-1.5 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Modal Scrollable Body */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-5 space-y-3.5 sm:space-y-4">
          {view === 'wallet' ? (
            <>
              {/* FETCH ERROR RETRY BANNER */}
              {fetchError && (
                <div className="p-3.5 rounded-2xl bg-rose-50 border border-rose-200 text-rose-900 flex items-center justify-between gap-3 shadow-2xs">
                  <div className="flex items-center gap-2 text-xs font-semibold">
                    <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
                    <span>{fetchError}</span>
                  </div>
                  <button
                    id="wallet-retry-credits-btn"
                    onClick={() => loadWalletData()}
                    className="px-3 py-1.5 rounded-xl bg-rose-600 hover:bg-rose-700 active:bg-rose-800 text-white text-xs font-bold transition-colors cursor-pointer shrink-0 shadow-2xs"
                  >
                    Retry
                  </button>
                </div>
              )}

              {/* 1. AVAILABLE CREDITS — HERO CARD */}
              <div
                className={`p-4 sm:p-4.5 rounded-2xl border transition-all flex items-center justify-between relative overflow-hidden shadow-xs ${
                  isExhausted
                    ? 'bg-rose-50/70 border-rose-200/90'
                    : 'bg-amber-50/70 border-amber-200/90'
                }`}
              >
                <div className="space-y-1 z-10">
                  <span className="text-[10px] font-extrabold uppercase tracking-wider text-slate-500">
                    AVAILABLE CREDITS
                  </span>
                  <div className="flex items-baseline gap-1.5">
                    <span
                      id="credit-wallet-total-balance"
                      className="text-3xl sm:text-4xl font-extrabold font-mono tracking-tight text-slate-950"
                    >
                      {(fetching || isLoading) && !balance ? (
                        <span className="inline-block w-12 h-8 bg-slate-200 animate-pulse rounded-md align-middle" />
                      ) : fetchError && !balance ? (
                        '--'
                      ) : (
                        total
                      )}
                    </span>
                    <span className="text-xs font-bold text-slate-600">credits</span>
                  </div>
                  <div className="pt-0.5">
                    {isExhausted ? (
                      <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-rose-100/80 text-rose-700 border border-rose-200/80">
                        <span className="w-2 h-2 rounded-full bg-rose-500" />
                        Exhausted
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-emerald-100/80 text-emerald-800 border border-emerald-200/80">
                        <span className="w-2 h-2 rounded-full bg-emerald-500" />
                        Ready to use
                      </span>
                    )}
                  </div>
                </div>

                {/* Right Visual Graphic */}
                <div className="z-10 shrink-0">
                  {isExhausted ? (
                    /* Exhausted Badge Graphic */
                    <svg width="64" height="64" viewBox="0 0 68 68" fill="none" xmlns="http://www.w3.org/2000/svg" className="shrink-0">
                      <path d="M34 6v5M34 57v5M6 34h5M57 34h5M14 14l3.5 3.5M50.5 50.5L54 54M14 54l3.5-3.5M50.5 17.5L54 14" stroke="#FDA4AF" strokeWidth="2.5" strokeLinecap="round" />
                      <circle cx="34" cy="34" r="23" fill="#FFE4E6" stroke="#FECDD3" strokeWidth="2" />
                      <circle cx="34" cy="34" r="16" fill="#FDA4AF" />
                      <path d="M28 28l12 12M40 28l-12 12" stroke="white" strokeWidth="3.5" strokeLinecap="round" />
                    </svg>
                  ) : (
                    /* Active Coins Stack Graphic */
                    <svg width="68" height="60" viewBox="0 0 72 64" fill="none" xmlns="http://www.w3.org/2000/svg" className="shrink-0">
                      <ellipse cx="48" cy="46" rx="16" ry="7" fill="#F59E0B" />
                      <path d="M32 46v6c0 3.866 7.163 7 16 7s16-3.134 16-7v-6" fill="#F59E0B" />
                      <ellipse cx="48" cy="46" rx="16" ry="7" fill="#FBBF24" stroke="#F59E0B" strokeWidth="1.5" />

                      <ellipse cx="48" cy="36" rx="16" ry="7" fill="#F59E0B" />
                      <path d="M32 36v6c0 3.866 7.163 7 16 7s16-3.134 16-7v-6" fill="#F59E0B" />
                      <ellipse cx="48" cy="36" rx="16" ry="7" fill="#FCD34D" stroke="#F59E0B" strokeWidth="1.5" />

                      <ellipse cx="48" cy="26" rx="16" ry="7" fill="#F59E0B" />
                      <path d="M32 26v6c0 3.866 7.163 7 16 7s16-3.134 16-7v-6" fill="#F59E0B" />
                      <ellipse cx="48" cy="26" rx="16" ry="7" fill="#FDE047" stroke="#F59E0B" strokeWidth="1.5" />

                      <circle cx="26" cy="30" r="17" fill="#FBBF24" stroke="#F59E0B" strokeWidth="2" />
                      <circle cx="26" cy="30" r="13" fill="#FEF08A" stroke="#F59E0B" strokeWidth="1" />
                      <path d="M26 21l1.5 6.5L34 29l-6.5 1.5L26 37l-1.5-6.5L18 29l6.5-1.5z" fill="#F59E0B" />

                      <path d="M12 14l1 3 3 1-3 1-1 3-1-3-3-1 3-1z" fill="#F59E0B" />
                      <path d="M58 12l1 2.5 2.5 1-2.5 1-1 2.5-1-2.5-2.5-1 2.5-1z" fill="#FBBF24" />
                    </svg>
                  )}
                </div>
              </div>

              {/* 2. CREDIT BREAKDOWN */}
              <div className="space-y-1.5">
                <label className="text-[10px] font-extrabold uppercase tracking-wider text-slate-400 block px-0.5">
                  CREDIT BREAKDOWN
                </label>
                <div className="grid grid-cols-3 gap-2 sm:gap-3">
                  {/* Free Credits */}
                  <div className="p-2.5 sm:p-3 bg-slate-50 border border-slate-200/80 rounded-2xl text-center space-y-1 flex flex-col items-center justify-center">
                    <div className="w-7 h-7 rounded-xl bg-emerald-100/90 text-emerald-600 flex items-center justify-center shrink-0">
                      <Gift className="w-3.5 h-3.5" />
                    </div>
                    <div className="text-[11px] font-semibold text-slate-600">Free</div>
                    <div id="credit-wallet-free-balance" className="text-base font-extrabold font-mono text-slate-900 leading-none">
                      {(fetching || isLoading) && !balance ? (
                        <span className="inline-block w-6 h-4 bg-slate-200 animate-pulse rounded-md align-middle" />
                      ) : fetchError && !balance ? (
                        '--'
                      ) : (
                        free
                      )}
                    </div>
                  </div>

                  {/* Purchased Credits */}
                  <div className="p-2.5 sm:p-3 bg-slate-50 border border-slate-200/80 rounded-2xl text-center space-y-1 flex flex-col items-center justify-center">
                    <div className="w-7 h-7 rounded-xl bg-sky-100/90 text-sky-600 flex items-center justify-center shrink-0">
                      <CreditCard className="w-3.5 h-3.5" />
                    </div>
                    <div className="text-[11px] font-semibold text-slate-600">Purchased</div>
                    <div id="credit-wallet-purchased-balance" className="text-base font-extrabold font-mono text-slate-900 leading-none">
                      {(fetching || isLoading) && !balance ? (
                        <span className="inline-block w-6 h-4 bg-slate-200 animate-pulse rounded-md align-middle" />
                      ) : fetchError && !balance ? (
                        '--'
                      ) : (
                        purchased
                      )}
                    </div>
                  </div>

                  {/* Premium Credits */}
                  <div className="p-2.5 sm:p-3 bg-slate-50 border border-slate-200/80 rounded-2xl text-center space-y-1 flex flex-col items-center justify-center">
                    <div className="w-7 h-7 rounded-xl bg-amber-100/90 text-amber-700 flex items-center justify-center shrink-0">
                      <Crown className="w-3.5 h-3.5" />
                    </div>
                    <div className="text-[11px] font-semibold text-slate-600">Premium</div>
                    <div id="credit-wallet-premium-balance" className="text-base font-extrabold font-mono text-slate-900 leading-none">
                      {(fetching || isLoading) && !balance ? (
                        <span className="inline-block w-6 h-4 bg-slate-200 animate-pulse rounded-md align-middle" />
                      ) : fetchError && !balance ? (
                        '--'
                      ) : (
                        premium
                      )}
                    </div>
                  </div>
                </div>

                {/* Premium Period End Date (if active Premium period) */}
                {balance?.premiumPeriodEnd && balance?.premiumPeriodStatus === 'ACTIVE' && (
                  <div className="flex items-center justify-between px-3 py-1.5 bg-amber-50/70 border border-amber-200/60 rounded-xl text-[11px] text-amber-900 mt-1">
                    <span className="font-semibold flex items-center gap-1.5">
                      <Crown className="w-3.5 h-3.5 text-amber-600" />
                      Premium Period
                    </span>
                    <span className="font-medium text-amber-800">
                      Ends {new Date(balance.premiumPeriodEnd).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                    </span>
                  </div>
                )}
              </div>

              {/* 3. ZERO-CREDIT WARNING STATE (Only when credits === 0, placed above Premium) */}
              {isExhausted && (
                <div className="p-3.5 sm:p-4 bg-rose-50/90 border border-rose-200/90 rounded-2xl space-y-3">
                  <div className="flex items-start gap-2.5">
                    <div className="w-6 h-6 rounded-full bg-rose-500 text-white flex items-center justify-center font-bold text-xs shrink-0 mt-0.5 shadow-xs">
                      !
                    </div>
                    <div className="space-y-0.5">
                      <h4 className="text-xs font-bold text-rose-950">
                        You're out of AI credits
                      </h4>
                      <p className="text-[11px] text-rose-800 leading-snug">
                        Upgrade or buy extra credits to continue using Solution and Deep Chat in Practice Mode.
                      </p>
                    </div>
                  </div>

                  <button
                    id="buy-ai-credits-exhausted-btn"
                    onClick={() => {
                      setView('buy_packs');
                      setNotice(null);
                    }}
                    className="w-full py-2.5 px-4 bg-rose-500 hover:bg-rose-600 active:bg-rose-700 text-white font-bold text-xs rounded-xl shadow-xs transition-all flex items-center justify-center gap-2 cursor-pointer"
                  >
                    <ShoppingCart className="w-3.5 h-3.5" />
                    <span>Buy AI Credits</span>
                  </button>
                </div>
              )}

              {/* 4. "HOW AI CREDITS WORK" */}
              <div className="p-3.5 sm:p-4 bg-slate-50/90 border border-slate-200/80 rounded-2xl space-y-2 text-xs text-slate-700">
                <div className="flex items-center gap-2 font-bold text-slate-900 text-xs">
                  <HelpCircle className="w-4 h-4 text-sky-600 shrink-0" />
                  <span>How AI credits work</span>
                </div>

                <div className="space-y-1.5 text-[11px] text-slate-600 pl-0.5">
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="w-3.5 h-3.5 text-sky-600 shrink-0" />
                    <span>Used for Solution and Deep Chat in Practice Mode</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="w-3.5 h-3.5 text-sky-600 shrink-0" />
                    <span>1 credit = full access for one question session</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="w-3.5 h-3.5 text-sky-600 shrink-0" />
                    <span>Open the AI workspace anytime for free</span>
                  </div>
                </div>

                <div className="border-t border-slate-200/80 my-2 pt-2 flex items-center gap-2 text-[11px] text-slate-500">
                  <ShieldAlert className="w-4 h-4 text-slate-400 shrink-0" />
                  <span>Exam Mode never uses Deep AI to preserve authentic test environment integrity.</span>
                </div>
              </div>

              {/* 5. ACTION ROWS: FIRSTROUND PREMIUM & BUY AI CREDITS */}
              <div className="space-y-2.5 pt-1">
                {/* FIRSTROUND PREMIUM ACTION ROW */}
                {(() => {
                  const plan = subInfo?.plan || (currentUser?.plan === 'PRO' ? 'PRO' : currentUser?.plan === 'PLUS' ? 'PLUS' : 'FREE');
                  const isSubActive = (subInfo?.status === 'active' || subInfo?.subscriptionStatus === 'active') && plan !== 'FREE';

                  return (
                    <button
                      id="wallet-upgrade-premium-btn"
                      onClick={() => {
                        onClose();
                        const tab = isSubActive ? 'manage' : 'plans';
                        window.dispatchEvent(new CustomEvent('firstround:open-premium-modal', { detail: { tab, source: 'credit_wallet' } }));
                      }}
                      className="w-full py-3 px-4 bg-amber-50/80 hover:bg-amber-100/90 active:bg-amber-200/90 text-slate-800 rounded-xl border border-amber-200/90 transition-all flex items-center gap-3 cursor-pointer text-left group shadow-2xs"
                    >
                      <div className="w-8 h-8 rounded-lg bg-amber-100 text-amber-700 flex items-center justify-center shrink-0 border border-amber-200/70">
                        <Crown className="w-4 h-4 text-amber-600 fill-amber-500" />
                      </div>
                      <div className="space-y-0.5 flex-1 min-w-0">
                        <div className="text-xs font-bold text-amber-950 flex items-center gap-1.5 font-['Outfit']">
                          <span>FirstRound Premium</span>
                        </div>
                        <div className="text-[11px] text-slate-600 truncate">
                          {plan === 'PRO' && isSubActive
                            ? 'Manage your Pro subscription'
                            : plan === 'PLUS' && isSubActive
                            ? 'Manage your Plus subscription'
                            : 'Explore Premium plans and unlock more placement features'}
                        </div>
                      </div>
                      <ChevronRight className="w-4 h-4 text-amber-600/70 group-hover:text-amber-800 transition-colors shrink-0 ml-auto" />
                    </button>
                  );
                })()}

                {/* BUY AI CREDITS ACTION ROW */}
                <button
                  id="buy-ai-credits-btn"
                  onClick={() => {
                    setView('buy_packs');
                    setNotice(null);
                  }}
                  className="w-full py-3 px-4 bg-slate-100 hover:bg-slate-200/90 active:bg-slate-300/90 text-slate-800 rounded-xl border border-slate-200/90 transition-all flex items-center gap-3 cursor-pointer text-left group shadow-2xs"
                >
                  <div className="w-8 h-8 rounded-lg bg-slate-200/80 text-slate-700 flex items-center justify-center shrink-0 border border-slate-300/50">
                    <ShoppingCart className="w-4 h-4 text-slate-700" />
                  </div>
                  <div className="space-y-0.5 flex-1 min-w-0">
                    <div className="text-xs font-bold text-slate-900">
                      <span>Buy AI Credits</span>
                    </div>
                    <div className="text-[11px] text-slate-600 truncate">
                      Purchase additional Deep AI credits
                    </div>
                  </div>
                  <ChevronRight className="w-4 h-4 text-slate-400 group-hover:text-slate-600 transition-colors shrink-0 ml-auto" />
                </button>
              </div>
            </>
          ) : (
            /* Buy Packs View */
            <div className="space-y-4">
              <div className="text-xs text-slate-600 leading-relaxed">
                Select an AI credit pack. Purchased credits never expire and are consumed after free credits.
              </div>

              {notice && (
                <div
                  className={`p-3 rounded-xl text-xs font-semibold flex items-center gap-2 animate-in fade-in duration-150 ${
                    notice.type === 'success'
                      ? 'bg-emerald-50 border border-emerald-300 text-emerald-900'
                      : notice.type === 'error'
                      ? 'bg-rose-50 border border-rose-300 text-rose-900'
                      : 'bg-amber-50 border border-amber-300 text-amber-900'
                  }`}
                >
                  {notice.type === 'success' ? (
                    <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                  ) : (
                    <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
                  )}
                  <span>{notice.text}</span>
                </div>
              )}

              <div className="space-y-2.5">
                {(creditPacks.length > 0
                  ? creditPacks
                  : [
                      { id: 'pack_10', credits: 10, pricePaise: 4900, title: '10 Deep AI Credits', badge: 'Starter' },
                      { id: 'pack_25', credits: 25, pricePaise: 9900, title: '25 Deep AI Credits', badge: 'Popular', popular: true },
                      { id: 'pack_50', credits: 50, pricePaise: 17900, title: '50 Deep AI Credits', badge: 'Best Value' },
                    ]
                ).map((pack) => {
                  const priceRupees = Math.round(pack.pricePaise / 100);
                  const isProcessing = purchasingPackId === pack.id;

                  return (
                    <div
                      key={pack.id}
                      className={`p-3.5 rounded-2xl border transition-all flex items-center justify-between ${
                        pack.popular
                          ? 'border-amber-400 bg-gradient-to-r from-amber-50/50 to-white shadow-xs'
                          : 'border-slate-200 bg-white hover:border-slate-300'
                      }`}
                    >
                      <div className="space-y-0.5">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-bold text-slate-900 font-['Outfit']">
                            {pack.credits} AI Credits
                          </span>
                          {pack.badge && (
                            <span
                              className={`text-[9px] font-extrabold uppercase px-1.5 py-0.5 rounded ${
                                pack.popular
                                  ? 'bg-amber-400 text-slate-950'
                                  : 'bg-slate-100 text-slate-700'
                              }`}
                            >
                              {pack.badge}
                            </span>
                          )}
                        </div>
                        <div className="text-xs font-semibold text-slate-500">
                          ₹{priceRupees} (₹{(priceRupees / pack.credits).toFixed(1)}/credit)
                        </div>
                      </div>

                      <button
                        id={`buy-pack-${pack.id}-btn`}
                        disabled={isProcessing}
                        onClick={() => handleBuyPack(pack)}
                        className={`min-h-[38px] px-4 py-1.5 text-xs font-bold rounded-xl transition-all flex items-center gap-1.5 cursor-pointer ${
                          pack.popular
                            ? 'bg-amber-400 hover:bg-amber-300 text-slate-950 shadow-xs'
                            : 'bg-slate-900 hover:bg-slate-800 text-white'
                        }`}
                      >
                        {isProcessing ? (
                          <>
                            <Loader2 className="w-3.5 h-3.5 animate-spin" />
                            <span>Processing...</span>
                          </>
                        ) : (
                          <>
                            <Sparkles className="w-3 h-3" />
                            <span>Buy for ₹{priceRupees}</span>
                          </>
                        )}
                      </button>
                    </div>
                  );
                })}
              </div>

              <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl text-[11px] text-slate-500 flex items-center gap-2">
                <CreditCard className="w-4 h-4 text-slate-400 shrink-0" />
                <span>Secure payment powered by Razorpay Test Mode.</span>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

