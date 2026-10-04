import React, { useEffect, useRef, useState } from 'react';
import {
  Award,
  Bell,
  BookOpen,
  Building2,
  ChevronDown,
  ChevronRight,
  Crown,
  Edit3,
  HelpCircle,
  LayoutDashboard,
  LogOut,
  Menu,
  Search,
  Settings,
  ShieldCheck,
  Sparkles,
  Target,
  Trophy,
  User as UserIcon,
  X,
  Zap,
} from 'lucide-react';
import { AppNotification, NavTab, User, DeepAICreditBalance, SubscriptionInfo } from '../types';
import { NotificationCenter } from './NotificationCenter';
import { apiGetCredits, apiGetMySubscription } from '../api';

const CreditWalletModal = React.lazy(() =>
  import('./CreditWalletModal').then((m) => ({ default: m.CreditWalletModal }))
);
const PremiumModal = React.lazy(() =>
  import('./PremiumModal').then((m) => ({ default: m.PremiumModal }))
);

export interface NavbarProps {
  currentUser: User | null;
  activeTab: NavTab | string;
  onTabChange?: (tab: NavTab) => void;
  setActiveTab?: (tab: any) => void;
  onOpenAuthModal?: () => void;
  onOpenAuth?: () => void;
  onOpenProfileModal?: () => void;
  onOpenProfile?: () => void;
  onOpenScratchpad?: () => void;
  onLogout?: () => void;
  megaEventsCount?: number;
  notifications?: AppNotification[];
  unreadNotificationCount?: number;
  readNotificationIds?: string[];
  onMarkNotificationRead?: (id: string) => void;
  onMarkAllNotificationsRead?: () => void;
  onNotificationClick?: (notif: AppNotification) => void;
}

export const Navbar: React.FC<NavbarProps> = ({
  currentUser,
  activeTab,
  onTabChange,
  setActiveTab,
  onOpenAuthModal,
  onOpenAuth,
  onOpenProfileModal,
  onOpenProfile,
  onOpenScratchpad,
  onLogout,
  notifications = [],
  unreadNotificationCount = 0,
  readNotificationIds = [],
  onMarkNotificationRead,
  onMarkAllNotificationsRead,
  onNotificationClick,
}) => {
  const [isUserMenuOpen, setIsUserMenuOpen] = useState(false);
  const [isNotificationOpen, setIsNotificationOpen] = useState(false);
  const [isMobileDrawerOpen, setIsMobileDrawerOpen] = useState(false);
  const [isCreditWalletOpen, setIsCreditWalletOpen] = useState(false);
  const [creditWalletInitialView, setCreditWalletInitialView] = useState<'wallet' | 'buy_packs'>('wallet');
  const [isPremiumModalOpen, setIsPremiumModalOpen] = useState(false);
  const [premiumModalTab, setPremiumModalTab] = useState<'plans' | 'manage'>('plans');
  const [premiumModalSource, setPremiumModalSource] = useState<string | null>(null);
  const [subscriptionState, setSubscriptionState] = useState<SubscriptionInfo | null>(null);
  const [creditBalance, setCreditBalance] = useState<DeepAICreditBalance | null>(null);
  const [creditsLoading, setCreditsLoading] = useState<boolean>(true);
  const userMenuRef = useRef<HTMLDivElement>(null);
  const notifMenuRef = useRef<HTMLDivElement>(null);

  const loadCredits = () => {
    if (currentUser?.id) {
      setCreditsLoading(true);
      apiGetCredits(currentUser.id)
        .then((bal) => {
          setCreditBalance(bal);
        })
        .catch((err) => {
          console.error('[Navbar] Failed to load credits:', err);
          setCreditBalance(null);
        })
        .finally(() => {
          setCreditsLoading(false);
        });
    } else {
      setCreditBalance(null);
      setCreditsLoading(false);
    }
  };

  const loadSubscription = () => {
    if (currentUser?.id) {
      apiGetMySubscription(currentUser.id)
        .then((sub) => setSubscriptionState(sub))
        .catch((err) => console.error('[Navbar] Failed to load subscription:', err));
    } else {
      setSubscriptionState(null);
    }
  };

  useEffect(() => {
    loadCredits();
    loadSubscription();

    const handleCreditsUpdated = (e: any) => {
      if (typeof e?.detail?.credits === 'number') {
        setCreditBalance((prev) =>
          prev ? { ...prev, total: e.detail.credits, totalAvailable: e.detail.credits } : null
        );
      }
      loadCredits();
    };

    const handleOpenWalletEvent = (e: any) => {
      const view = e?.detail?.view === 'buy_packs' ? 'buy_packs' : 'wallet';
      setCreditWalletInitialView(view);
      setIsPremiumModalOpen(false);
      setIsCreditWalletOpen(true);
    };

    const handleSubUpdated = () => {
      loadSubscription();
    };

    const handleOpenPremiumModal = (e: any) => {
      const tab = e?.detail?.tab === 'manage' ? 'manage' : 'plans';
      const source = e?.detail?.source || (e?.detail?.fromWallet ? 'credit_wallet' : null);
      setPremiumModalSource(source);
      setPremiumModalTab(tab);
      setIsCreditWalletOpen(false);
      setIsPremiumModalOpen(true);
    };

    const handleFocus = () => {
      loadCredits();
      loadSubscription();
    };

    window.addEventListener('firstround:credits-updated', handleCreditsUpdated);
    window.addEventListener('firstround:open-credit-wallet', handleOpenWalletEvent);
    window.addEventListener('firstround:subscription-updated', handleSubUpdated);
    window.addEventListener('firstround:open-premium-modal', handleOpenPremiumModal);
    window.addEventListener('focus', handleFocus);

    return () => {
      window.removeEventListener('firstround:credits-updated', handleCreditsUpdated);
      window.removeEventListener('firstround:open-credit-wallet', handleOpenWalletEvent);
      window.removeEventListener('firstround:subscription-updated', handleSubUpdated);
      window.removeEventListener('firstround:open-premium-modal', handleOpenPremiumModal);
      window.removeEventListener('focus', handleFocus);
    };
  }, [currentUser?.id]);

  const handleNav = (tab: NavTab) => {
    if (onTabChange) {
      onTabChange(tab);
    } else if (setActiveTab) {
      setActiveTab(tab);
    }
    setIsMobileDrawerOpen(false);
    setIsNotificationOpen(false);
    setIsUserMenuOpen(false);
  };

  const handleOpenAuth = () => {
    setIsUserMenuOpen(false);
    setIsNotificationOpen(false);
    setIsMobileDrawerOpen(false);
    if (onOpenAuthModal) onOpenAuthModal();
    else if (onOpenAuth) onOpenAuth();
  };

  const handleOpenProfile = () => {
    setIsUserMenuOpen(false);
    setIsNotificationOpen(false);
    setIsMobileDrawerOpen(false);
    if (onOpenProfileModal) onOpenProfileModal();
    else if (onOpenProfile) onOpenProfile();
  };

  const handleLogout = () => {
    setIsUserMenuOpen(false);
    setIsNotificationOpen(false);
    setIsMobileDrawerOpen(false);
    if (onLogout) {
      onLogout();
    } else {
      handleOpenAuth();
    }
  };

  // Prevent background scrolling when mobile drawer is open
  useEffect(() => {
    if (isMobileDrawerOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [isMobileDrawerOpen]);

  // Close dropdowns & drawer on ESC key or clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (userMenuRef.current && !userMenuRef.current.contains(event.target as Node)) {
        setIsUserMenuOpen(false);
      }
      if (notifMenuRef.current && !notifMenuRef.current.contains(event.target as Node)) {
        setIsNotificationOpen(false);
      }
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setIsUserMenuOpen(false);
        setIsNotificationOpen(false);
        setIsMobileDrawerOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, []);

  const displayName = currentUser?.name || 'Candidate';
  const userInitial = displayName.charAt(0).toUpperCase();

  const navLinks: { id: NavTab; label: string; icon: React.ReactNode; badge?: string }[] = [
    { id: 'home', label: 'Home', icon: <LayoutDashboard className="w-4 h-4" /> },
    { id: 'tests', label: 'Explore Tests', icon: <Target className="w-4 h-4" /> },
    { id: 'vault', label: 'Revision Vault', icon: <BookOpen className="w-4 h-4" /> },
    { id: 'leaderboard', label: 'Leaderboard', icon: <Trophy className="w-4 h-4 text-amber-500" /> },
  ];

  return (
    <>
      {/* ========================================================= */}
      {/* MAIN TOP HEADER BAR (DESKTOP + MOBILE)                    */}
      {/* ========================================================= */}
      <header className="w-full sticky top-0 z-40 bg-surface border-b border-border/90 shadow-2xs">
        <div className="max-w-7xl mx-auto px-3.5 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-14 sm:h-16 gap-2 sm:gap-6">
            {/* Left: Brand Logo + Desktop Nav Pills */}
            <div className="flex items-center gap-4 lg:gap-6 shrink-0 min-w-0">
              {/* Logo */}
              <button
                id="brand-logo-btn"
                onClick={() => handleNav('home')}
                className="flex items-center gap-2 sm:gap-2.5 group focus:outline-none shrink-0"
                title="FirstRound Home"
              >
                <div className="w-8 h-8 sm:w-9 sm:h-9 rounded-xl bg-primary text-amber-400 flex items-center justify-center shadow-xs transition-transform group-hover:scale-105">
                  <Zap className="w-4 h-4 sm:w-5 sm:h-5 fill-amber-400" />
                </div>
                <div className="flex items-baseline">
                  <span className="font-extrabold text-base sm:text-lg lg:text-xl tracking-tight text-text-primary font-['Outfit']">
                    First<span className="text-amber-500">Round</span>
                  </span>
                </div>
              </button>

              {/* Desktop Pill Navigation Bar (Hidden on mobile/tablet) */}
              <nav
                id="desktop-nav-pill-group"
                className="hidden lg:flex items-center bg-surface-hover/90 p-1 rounded-full border border-border/60 shadow-2xs"
              >
                <button
                  id="nav-home-btn"
                  onClick={() => handleNav('home')}
                  className={`px-4 py-1.5 text-xs font-bold rounded-full transition-all ${
                    activeTab === 'home'
                      ? 'bg-primary text-white shadow-xs'
                      : 'text-text-secondary hover:text-text-primary hover:bg-slate-200/60'
                  }`}
                >
                  Home
                </button>

                <button
                  id="nav-tests-btn"
                  onClick={() => handleNav('tests')}
                  className={`px-4 py-1.5 text-xs font-bold rounded-full transition-all ${
                    activeTab === 'tests'
                      ? 'bg-primary text-white shadow-xs'
                      : 'text-text-secondary hover:text-text-primary hover:bg-slate-200/60'
                  }`}
                >
                  Explore Tests
                </button>

                <button
                  id="nav-vault-btn"
                  onClick={() => handleNav('vault')}
                  className={`px-4 py-1.5 text-xs font-bold rounded-full transition-all flex items-center gap-1.5 ${
                    activeTab === 'vault'
                      ? 'bg-primary text-white shadow-xs'
                      : 'text-text-secondary hover:text-text-primary hover:bg-slate-200/60'
                  }`}
                >
                  <BookOpen className="w-3.5 h-3.5" />
                  <span>Revision Vault</span>
                </button>

                <button
                  id="nav-leaderboard-btn"
                  onClick={() => handleNav('leaderboard')}
                  className={`px-4 py-1.5 text-xs font-bold rounded-full transition-all flex items-center gap-1.5 ${
                    activeTab === 'leaderboard'
                      ? 'bg-primary text-white shadow-xs'
                      : 'text-text-secondary hover:text-text-primary hover:bg-slate-200/60'
                  }`}
                >
                  <Trophy className="w-3.5 h-3.5 text-amber-500" />
                  <span>Leaderboard</span>
                </button>

                {(currentUser?.role === 'admin' || currentUser?.role === 'super_admin') && (
                  <button
                    id="nav-admin-btn"
                    onClick={() => handleNav('admin')}
                    className={`px-3.5 py-1.5 text-xs font-bold rounded-full transition-all flex items-center gap-1 ${
                      activeTab === 'admin'
                        ? 'bg-purple-700 text-white shadow-xs'
                        : 'text-purple-700 hover:bg-purple-100/70'
                    }`}
                  >
                    <ShieldCheck className="w-3.5 h-3.5" />
                    <span>Admin</span>
                  </button>
                )}
              </nav>
            </div>

            {/* Right: Quick Tools, Notifications, Profile & Mobile Hamburger */}
            <div className="flex items-center gap-1.5 sm:gap-2.5 lg:gap-3 shrink-0">
              {/* Desktop Placement Toolkit Quick Tool */}
              {onOpenScratchpad && (
                <button
                  id="header-scratchpad-btn"
                  onClick={onOpenScratchpad}
                  title="Open Placement Toolkit (Notes, Formulas, Solver)"
                  className="hidden sm:flex items-center gap-1.5 px-3 py-1.5 bg-surface-hover hover:bg-slate-200/80 text-slate-700 text-xs font-semibold rounded-full border border-border/70 transition-colors"
                >
                  <Zap className="w-3.5 h-3.5 text-amber-500 fill-amber-500" />
                  <span>Toolkit</span>
                </button>
              )}

              {/* Deep AI Credit Wallet Navbar Trigger */}
              {currentUser && (
                <button
                  id="header-credits-wallet-btn"
                  onClick={() => {
                    setIsCreditWalletOpen(true);
                    setIsUserMenuOpen(false);
                    setIsNotificationOpen(false);
                  }}
                  title="Open Deep AI Credit Wallet"
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-white hover:bg-slate-50 active:bg-slate-100 text-[#00223E] text-xs rounded-xl border border-slate-200 hover:border-slate-300 shadow-2xs transition-all duration-150 active:scale-[0.98] shrink-0"
                >
                  <Sparkles className="w-3.5 h-3.5 text-[#FFC412] fill-[#FFC412] shrink-0" />
                  {creditsLoading ? (
                    <span className="font-medium text-slate-500">Checking...</span>
                  ) : creditBalance === null ? (
                    <span className="font-medium text-slate-700">AI Credits</span>
                  ) : (
                    <div className="flex items-center gap-1">
                      <span className="font-bold text-[#00223E]">
                        {typeof creditBalance.total === 'number'
                          ? creditBalance.total
                          : typeof creditBalance.totalAvailable === 'number'
                          ? creditBalance.totalAvailable
                          : 0}
                      </span>
                      <span className="font-medium text-slate-600">
                        {(creditBalance.total ?? creditBalance.totalAvailable ?? 0) === 1 ? 'AI Credit' : 'AI Credits'}
                      </span>
                    </div>
                  )}
                </button>
              )}



              {/* Notification Bell */}
              <div className="relative" ref={notifMenuRef}>
                <button
                  id="header-notification-bell-btn"
                  onClick={() => {
                    setIsNotificationOpen(!isNotificationOpen);
                    setIsUserMenuOpen(false);
                  }}
                  title="Notifications"
                  aria-label="Notifications"
                  className={`p-2 text-text-muted hover:text-slate-800 rounded-full transition-colors relative min-w-[36px] min-h-[36px] flex items-center justify-center ${
                    isNotificationOpen ? 'bg-surface-hover text-text-primary' : 'hover:bg-surface-hover'
                  }`}
                >
                  <Bell className="w-4 h-4 sm:w-4.5 sm:h-4.5" />
                  {unreadNotificationCount > 0 && (
                    <span
                      id="header-notification-indicator"
                      className="absolute top-1.5 right-1.5 w-2 h-2 bg-amber-500 rounded-full ring-2 ring-white"
                    ></span>
                  )}
                </button>

                <NotificationCenter
                  notifications={notifications}
                  unreadCount={unreadNotificationCount}
                  readIds={readNotificationIds}
                  isOpen={isNotificationOpen}
                  onClose={() => setIsNotificationOpen(false)}
                  onMarkRead={(id) => onMarkNotificationRead?.(id)}
                  onMarkAllRead={() => onMarkAllNotificationsRead?.()}
                  onNotificationClick={(notif) => {
                    setIsNotificationOpen(false);
                    if (onNotificationClick) {
                      onNotificationClick(notif);
                    } else if (notif.actionTab) {
                      handleNav(notif.actionTab);
                    }
                  }}
                />
              </div>

              {/* User Avatar Circle with Dropdown (Desktop & Quick Profile access) */}
              {currentUser ? (
                <div className="relative" ref={userMenuRef}>
                  <button
                    id="user-profile-menu-btn"
                    onClick={() => {
                      // On desktop toggle dropdown, on small mobile screens toggle dropdown or let user use menu
                      setIsUserMenuOpen(!isUserMenuOpen);
                    }}
                    className="flex items-center gap-1 sm:gap-1.5 p-1 sm:pl-1.5 sm:pr-2 hover:bg-surface-hover rounded-full border border-border transition-colors group focus:outline-none min-h-[36px]"
                    aria-expanded={isUserMenuOpen}
                    title="User Profile & Settings"
                  >
                    <div className="w-7 h-7 rounded-full bg-primary text-white font-bold text-xs flex items-center justify-center shadow-2xs group-hover:ring-2 group-hover:ring-amber-400 transition-all shrink-0 overflow-hidden">
                      {(currentUser.avatarUrl || currentUser.avatar) ? (
                        <img src={currentUser.avatarUrl || currentUser.avatar} alt={displayName} className="w-full h-full object-cover" />
                      ) : (
                        <span>{userInitial}</span>
                      )}
                    </div>
                    <ChevronDown className="w-3.5 h-3.5 text-slate-400 group-hover:text-slate-700 transition-transform hidden sm:inline" />
                  </button>

                  {/* Clean Profile & Account Dropdown */}
                  {isUserMenuOpen && (
                    <div className="absolute right-0 mt-2 w-56 bg-surface border border-border rounded-2xl shadow-xl py-2 z-50 animate-in fade-in zoom-in-95 duration-150">
                      <div className="px-4 py-2.5 border-b border-slate-100 flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full bg-primary text-white font-bold text-xs flex items-center justify-center shrink-0 overflow-hidden">
                          {(currentUser.avatarUrl || currentUser.avatar) ? (
                            <img src={currentUser.avatarUrl || currentUser.avatar} alt={displayName} className="w-full h-full object-cover" />
                          ) : (
                            <span>{userInitial}</span>
                          )}
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="text-xs font-bold text-text-primary truncate">
                            {displayName}
                          </p>
                          <p className="text-[11px] text-text-muted truncate mt-0.5">
                            {currentUser.targetCompany ? `Target: ${currentUser.targetCompany}` : 'Target company not set'}
                          </p>
                        </div>
                      </div>

                      <div className="py-1">
                        <button
                          id="dropdown-candidate-profile-btn"
                          onClick={handleOpenProfile}
                          className="w-full px-4 py-2 text-left text-xs font-semibold text-slate-700 hover:bg-app-bg hover:text-text-primary flex items-center gap-2"
                        >
                          <UserIcon className="w-3.5 h-3.5 text-slate-400" />
                          <span>Candidate Profile</span>
                        </button>

                        <button
                          id="dropdown-account-settings-btn"
                          onClick={() => {
                            setIsUserMenuOpen(false);
                            if (onTabChange) onTabChange('settings');
                            else if (setActiveTab) setActiveTab('settings');
                          }}
                          className="w-full px-4 py-2 text-left text-xs font-semibold text-slate-700 hover:bg-app-bg hover:text-text-primary flex items-center gap-2"
                        >
                          <Settings className="w-3.5 h-3.5 text-slate-400" />
                          <span>Account Settings</span>
                        </button>
                      </div>

                      <div className="border-t border-slate-100 pt-1">
                        <button
                          id="dropdown-logout-btn"
                          onClick={handleLogout}
                          className="w-full px-4 py-2 text-left text-xs font-semibold text-rose-600 hover:bg-rose-50 flex items-center gap-2"
                        >
                          <LogOut className="w-3.5 h-3.5" />
                          <span>Log Out</span>
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                <button
                  id="sign-in-btn"
                  onClick={handleOpenAuth}
                  className="px-3 sm:px-4 py-1.5 bg-primary hover:bg-primary-hover text-white font-bold text-xs rounded-full shadow-xs transition-all shrink-0"
                >
                  Sign In
                </button>
              )}

              {/* Mobile Hamburger Drawer Trigger Button */}
              <button
                id="mobile-menu-toggle-btn"
                onClick={() => setIsMobileDrawerOpen(!isMobileDrawerOpen)}
                className="lg:hidden p-2 text-slate-700 hover:text-slate-950 hover:bg-surface-hover active:bg-slate-200 rounded-xl transition-colors min-h-[40px] min-w-[40px] flex items-center justify-center"
                aria-label={isMobileDrawerOpen ? 'Close Navigation Menu' : 'Open Navigation Menu'}
                aria-expanded={isMobileDrawerOpen}
              >
                {isMobileDrawerOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* ========================================================= */}
      {/* MOBILE NAVIGATION DRAWER / SHEET                          */}
      {/* ========================================================= */}
      {isMobileDrawerOpen && (
        <div
          id="mobile-nav-drawer-backdrop"
          className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-xs lg:hidden flex justify-end animate-in fade-in duration-200"
          onClick={(e) => {
            if (e.target === e.currentTarget) setIsMobileDrawerOpen(false);
          }}
        >
          <div
            id="mobile-nav-drawer-panel"
            className="w-full max-w-xs sm:max-w-sm bg-surface h-full shadow-2xl flex flex-col justify-between border-l border-border animate-in slide-in-from-right duration-200 overflow-y-auto"
          >
            {/* Drawer Header */}
            <div>
              <div className="p-4 sm:p-5 border-b border-slate-150 flex items-center justify-between gap-3 bg-app-bg/70">
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-xl bg-primary text-amber-400 flex items-center justify-center shadow-xs">
                    <Zap className="w-4 h-4 fill-amber-400" />
                  </div>
                  <div>
                    <span className="font-extrabold text-base tracking-tight text-text-primary font-['Outfit'] block leading-none">
                      First<span className="text-amber-500">Round</span>
                    </span>
                    <span className="text-[10px] text-text-muted font-bold uppercase tracking-wider block mt-1">
                      Placement Navigation
                    </span>
                  </div>
                </div>

                <button
                  id="close-mobile-nav-btn"
                  onClick={() => setIsMobileDrawerOpen(false)}
                  className="p-2 text-slate-400 hover:text-slate-700 hover:bg-slate-200/60 rounded-xl transition-colors min-h-[40px] min-w-[40px] flex items-center justify-center"
                  aria-label="Close navigation"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Main Navigation Link Stack */}
              <div className="p-3.5 sm:p-4 space-y-1.5">
                <div className="px-2 pb-1 text-[10px] font-extrabold uppercase tracking-widest text-slate-400">
                  Main Assessment Tabs
                </div>

                {navLinks.map((item) => {
                  const isActive = activeTab === item.id;
                  return (
                    <button
                      key={item.id}
                      id={`mobile-nav-${item.id}-btn`}
                      onClick={() => handleNav(item.id)}
                      className={`w-full min-h-[48px] px-3.5 py-2.5 rounded-xl text-left text-xs font-bold flex items-center justify-between gap-3 transition-all ${
                        isActive
                          ? 'bg-primary text-white shadow-xs'
                          : 'text-slate-700 hover:bg-surface-hover active:bg-slate-200'
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        <span className={`${isActive ? 'text-amber-400' : 'text-text-muted'}`}>
                          {item.icon}
                        </span>
                        <span className="text-sm font-bold">{item.label}</span>
                      </div>

                      {isActive ? (
                        <span className="text-[10px] uppercase tracking-wider font-extrabold px-2 py-0.5 rounded bg-surface/20 text-white">
                          Active
                        </span>
                      ) : (
                        <ChevronRight className="w-4 h-4 text-slate-400" />
                      )}
                    </button>
                  );
                })}

                {(currentUser?.role === 'admin' || currentUser?.role === 'super_admin') && (
                  <button
                    id="mobile-nav-admin-btn"
                    onClick={() => handleNav('admin')}
                    className={`w-full min-h-[48px] px-3.5 py-2.5 rounded-xl text-left text-xs font-bold flex items-center justify-between gap-3 transition-all ${
                      activeTab === 'admin'
                        ? 'bg-purple-700 text-white shadow-xs'
                        : 'text-purple-700 hover:bg-purple-50 active:bg-purple-100'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <ShieldCheck className="w-4 h-4 text-purple-600" />
                      <span className="text-sm font-bold">Admin Console</span>
                    </div>
                    <ChevronRight className="w-4 h-4 text-purple-400" />
                  </button>
                )}

                {/* Secondary Action: Placement Toolkit Quick Access */}
                {onOpenScratchpad && (
                  <div className="pt-3">
                    <button
                      id="mobile-drawer-toolkit-btn"
                      onClick={() => {
                        setIsMobileDrawerOpen(false);
                        onOpenScratchpad();
                      }}
                      className="w-full min-h-[46px] p-3 rounded-xl bg-amber-50/80 hover:bg-amber-100/90 active:bg-amber-200/90 border border-amber-200/90 text-left transition-colors flex items-center justify-between gap-2"
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        <div className="w-7 h-7 rounded-lg bg-amber-400/30 text-amber-800 flex items-center justify-center shrink-0">
                          <Zap className="w-3.5 h-3.5 fill-amber-600 text-amber-700" />
                        </div>
                        <div className="min-w-0">
                          <div className="text-xs font-bold text-amber-950 truncate">
                            Placement Toolkit
                          </div>
                          <div className="text-[10px] text-amber-700 truncate">
                            Notes, Formulas & Quick Solver
                          </div>
                        </div>
                      </div>
                      <ChevronRight className="w-4 h-4 text-amber-700 shrink-0" />
                    </button>
                  </div>
                )}

                {/* Deep AI Credit Wallet Drawer Trigger */}
                {currentUser && (
                  <div className="pt-2">
                    <button
                      id="mobile-drawer-credits-btn"
                      onClick={() => {
                        setIsMobileDrawerOpen(false);
                        setIsCreditWalletOpen(true);
                      }}
                      className="w-full min-h-[46px] p-3 rounded-xl bg-white hover:bg-slate-50 active:bg-slate-100 border border-slate-200 text-left transition-colors flex items-center justify-between gap-2 shadow-2xs"
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        <div className="w-7 h-7 rounded-lg bg-amber-50 text-amber-600 border border-amber-200 flex items-center justify-center shrink-0 font-bold">
                          <Sparkles className="w-3.5 h-3.5 fill-amber-500 text-amber-500" />
                        </div>
                        <div className="min-w-0">
                          <div className="text-xs font-bold text-[#00223E] truncate">
                            Deep AI Credits
                          </div>
                          <div className="text-[10px] text-slate-500 truncate">
                            {creditsLoading
                              ? 'Checking balance...'
                              : `${creditBalance?.total ?? creditBalance?.totalAvailable ?? 0} available for Practice`}
                          </div>
                        </div>
                      </div>
                      <ChevronRight className="w-4 h-4 text-slate-400 shrink-0" />
                    </button>
                  </div>
                )}
              </div>
            </div>

            {/* Drawer Footer: User Profile / Auth Actions */}
            <div className="p-4 border-t border-slate-150 bg-app-bg/80 space-y-3">
              {currentUser ? (
                <div className="space-y-2.5">
                  {/* Candidate Card */}
                  <div className="p-3 bg-surface border border-border/90 rounded-xl flex items-center gap-2.5 shadow-2xs">
                    <div className="w-8 h-8 rounded-full bg-primary text-white font-bold text-xs flex items-center justify-center shrink-0 shadow-2xs">
                      {userInitial}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-bold text-text-primary truncate">
                        {displayName}
                      </p>
                      <p className="text-[10px] text-text-muted truncate">
                        {currentUser.targetCompany ? `Target: ${currentUser.targetCompany}` : 'Target company not set'}
                      </p>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <button
                      id="mobile-drawer-profile-btn"
                      onClick={handleOpenProfile}
                      className="min-h-[44px] py-2 px-3 bg-surface hover:bg-surface-hover active:bg-slate-200 border border-border rounded-xl text-xs font-bold text-slate-700 flex items-center justify-center gap-1.5 transition-colors"
                    >
                      <UserIcon className="w-3.5 h-3.5 text-text-muted" />
                      <span>Profile</span>
                    </button>

                    <button
                      id="mobile-drawer-logout-btn"
                      onClick={handleLogout}
                      className="min-h-[44px] py-2 px-3 bg-rose-50 hover:bg-rose-100 active:bg-rose-200 border border-rose-200 rounded-xl text-xs font-bold text-rose-700 flex items-center justify-center gap-1.5 transition-colors"
                    >
                      <LogOut className="w-3.5 h-3.5" />
                      <span>Log Out</span>
                    </button>
                  </div>
                </div>
              ) : (
                <button
                  id="mobile-drawer-signin-btn"
                  onClick={handleOpenAuth}
                  className="w-full min-h-[44px] py-2.5 px-4 bg-primary hover:bg-primary-hover active:bg-primary-active text-white text-xs font-extrabold rounded-xl shadow-xs transition-all flex items-center justify-center gap-2"
                >
                  <UserIcon className="w-4 h-4 text-amber-400" />
                  <span>Sign In / Register</span>
                </button>
              )}
            </div>
          </div>
        </div>
      )}
      {/* Deep AI Credit Wallet Modal */}
      <CreditWalletModal
        isOpen={isCreditWalletOpen}
        onClose={() => setIsCreditWalletOpen(false)}
        currentUser={currentUser}
        creditBalance={creditBalance}
        isLoading={creditsLoading}
        onRefresh={loadCredits}
        initialView={creditWalletInitialView}
      />

      {/* FirstRound Premium Modal */}
      <PremiumModal
        isOpen={isPremiumModalOpen}
        onClose={() => setIsPremiumModalOpen(false)}
        currentUser={currentUser}
        initialTab={premiumModalTab}
        source={premiumModalSource}
        onRefreshSubscription={loadSubscription}
      />
    </>
  );
};
