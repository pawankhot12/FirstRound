import React, { useEffect, useRef, useState } from 'react';
import {
  Bell,
  Check,
  ChevronRight,
  Crown,
  Globe,
  Loader2,
  Lock,
  Mail,
  MessageSquare,
  MoreHorizontal,
  Share2,
  ShieldAlert,
  Sparkles,
  Star,
  Trash2,
  Upload,
  User as UserIcon,
  X,
  Zap,
} from 'lucide-react';
import { User, DeepAICreditBalance, SubscriptionInfo } from '../types';
import {
  apiGetCredits,
  apiUpdateUserProfile,
  apiDeleteOwnAccount,
  apiUploadAvatar,
  apiRemoveAvatar,
  apiSubmitFeedback,
  apiUpdatePassword,
  apiGetMySubscription,
} from '../api';

export interface AccountSettingsViewProps {
  currentUser: User;
  onUpdateUser: (updatedUser: User) => void;
  onNavigateTab: (tab: any) => void;
  onOpenCreditWallet?: () => void;
  onLogout?: () => void;
  onDeleteAccountSuccess?: () => void;
}

type SettingsSection =
  | 'general'
  | 'subscription'
  | 'credits'
  | 'notifications'
  | 'social'
  | 'password'
  | 'emails'
  | 'more';

export const AccountSettingsView: React.FC<AccountSettingsViewProps> = ({
  currentUser,
  onUpdateUser,
  onNavigateTab,
  onOpenCreditWallet,
  onLogout,
  onDeleteAccountSuccess,
}) => {
  const [activeSection, setActiveSection] = useState<SettingsSection>('general');
  const [message, setMessage] = useState<{ text: string; type: 'success' | 'error' } | null>(null);

  // File Upload & Removal Ref
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isUploadingAvatar, setIsUploadingAvatar] = useState(false);
  const [isRemovingAvatar, setIsRemovingAvatar] = useState(false);
  const [showRemoveAvatarModal, setShowRemoveAvatarModal] = useState(false);

  // General Form State
  const nameParts = (currentUser.name || '').trim().split(' ');
  const initialFirstName = nameParts[0] || '';
  const initialLastName = nameParts.slice(1).join(' ') || '';

  const [firstName, setFirstName] = useState(initialFirstName);
  const [lastName, setLastName] = useState(initialLastName);
  const [phone, setPhone] = useState(currentUser.phone || '');
  const [college, setCollege] = useState(currentUser.college || '');
  const [targetCompany, setTargetCompany] = useState(currentUser.targetCompany || '');
  const [targetRole, setTargetRole] = useState(currentUser.targetRole || '');
  const [avatarUrl, setAvatarUrl] = useState(currentUser.avatarUrl || currentUser.avatar || '');
  const [isSavingGeneral, setIsSavingGeneral] = useState(false);

  // Credits State
  const [creditBalance, setCreditBalance] = useState<DeepAICreditBalance | null>(null);
  const [loadingCredits, setLoadingCredits] = useState(false);

  // Social Form State
  const [linkedIn, setLinkedIn] = useState(currentUser.linkedIn || '');
  const [github, setGithub] = useState(currentUser.github || '');
  const [portfolio, setPortfolio] = useState(currentUser.portfolio || '');
  const [isSavingSocial, setIsSavingSocial] = useState(false);

  // Password State
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [isSavingPassword, setIsSavingPassword] = useState(false);

  // Notification Preferences State (Loaded from currentUser metadata)
  const metaNotifs = typeof currentUser.metadata === 'object' ? currentUser.metadata : {};
  const [notifReminders, setNotifReminders] = useState(metaNotifs.notifReminders ?? true);
  const [notifLeague, setNotifLeague] = useState(metaNotifs.notifLeague ?? true);
  const [notifCreditAlerts, setNotifCreditAlerts] = useState(metaNotifs.notifCreditAlerts ?? true);
  const [notifProductUpdates, setNotifProductUpdates] = useState(metaNotifs.notifProductUpdates ?? false);
  const [isSavingNotifs, setIsSavingNotifs] = useState(false);

  // Feedback & Rating State
  const [feedbackRating, setFeedbackRating] = useState<number>(5);
  const [feedbackHoverRating, setFeedbackHoverRating] = useState<number>(0);
  const [feedbackCategory, setFeedbackCategory] = useState<string>('General Feedback');
  const [feedbackMessage, setFeedbackMessage] = useState<string>('');
  const [feedbackContact, setFeedbackContact] = useState<boolean>(false);
  const [isSubmittingFeedback, setIsSubmittingFeedback] = useState<boolean>(false);
  const [feedbackSuccessMessage, setFeedbackSuccessMessage] = useState<string | null>(null);

  // Email Info Modal State
  const [showEmailInfoModal, setShowEmailInfoModal] = useState<boolean>(false);

  // Delete Account Modals State
  const [showFriendlyDeleteModal, setShowFriendlyDeleteModal] = useState(false);
  const [showFinalDeleteModal, setShowFinalDeleteModal] = useState(false);
  const [hasConfirmedDeleteCheck, setHasConfirmedDeleteCheck] = useState(false);
  const [isDeletingAccount, setIsDeletingAccount] = useState(false);

  // Sync state when currentUser prop updates
  useEffect(() => {
    if (currentUser) {
      const parts = (currentUser.name || '').trim().split(' ');
      setFirstName(parts[0] || '');
      setLastName(parts.slice(1).join(' ') || '');
      setPhone(currentUser.phone || '');
      setCollege(currentUser.college || '');
      setTargetCompany(currentUser.targetCompany || '');
      setTargetRole(currentUser.targetRole || '');
      setAvatarUrl(currentUser.avatarUrl || currentUser.avatar || '');
      setLinkedIn(currentUser.linkedIn || '');
      setGithub(currentUser.github || '');
      setPortfolio(currentUser.portfolio || '');

      const m = typeof currentUser.metadata === 'object' ? currentUser.metadata : {};
      if (m.notifReminders !== undefined) setNotifReminders(m.notifReminders);
      if (m.notifLeague !== undefined) setNotifLeague(m.notifLeague);
      if (m.notifCreditAlerts !== undefined) setNotifCreditAlerts(m.notifCreditAlerts);
      if (m.notifProductUpdates !== undefined) setNotifProductUpdates(m.notifProductUpdates);
    }
  }, [currentUser]);

  const triggerCreditWallet = () => {
    if (onOpenCreditWallet) {
      onOpenCreditWallet();
    }
    window.dispatchEvent(new CustomEvent('firstround:open-credit-wallet'));
  };

  const triggerBuyCreditPacks = () => {
    if (onOpenCreditWallet) {
      onOpenCreditWallet();
    }
    window.dispatchEvent(new CustomEvent('firstround:open-credit-wallet', { detail: { view: 'buy_packs' } }));
  };

  const handleRemoveAvatar = async () => {
    if (!currentUser?.id) return;
    try {
      setIsRemovingAvatar(true);
      setMessage(null);
      const res = await apiRemoveAvatar(currentUser.id);
      setAvatarUrl('');
      if (res.user) {
        onUpdateUser(res.user);
      }
      setShowRemoveAvatarModal(false);
      setMessage({ text: 'Profile picture removed successfully!', type: 'success' });
    } catch (err: any) {
      console.error('[AccountSettings] Remove avatar error:', err);
      setMessage({ text: err.message || 'Failed to remove profile picture. Please try again.', type: 'error' });
      setShowRemoveAvatarModal(false);
    } finally {
      setIsRemovingAvatar(false);
    }
  };

  // Subscription State
  const [subscriptionState, setSubscriptionState] = useState<SubscriptionInfo | null>(null);
  const [loadingSub, setLoadingSub] = useState(false);

  useEffect(() => {
    const fetchCredits = () => {
      if (currentUser?.id) {
        setLoadingCredits(true);
        apiGetCredits(currentUser.id)
          .then((balance) => setCreditBalance(balance))
          .catch((err) => console.error('Failed to load credit balance in settings:', err))
          .finally(() => setLoadingCredits(false));
      }
    };
    const fetchSub = () => {
      if (currentUser?.id) {
        setLoadingSub(true);
        apiGetMySubscription(currentUser.id)
          .then((sub) => setSubscriptionState(sub))
          .catch((err) => console.error('Failed to load subscription in settings:', err))
          .finally(() => setLoadingSub(false));
      }
    };
    fetchCredits();
    fetchSub();

    window.addEventListener('firstround:credits-updated', fetchCredits);
    window.addEventListener('firstround:subscription-updated', fetchSub);
    return () => {
      window.removeEventListener('firstround:credits-updated', fetchCredits);
      window.removeEventListener('firstround:subscription-updated', fetchSub);
    };
  }, [currentUser?.id]);

  // Handle Native File Upload for Profile Picture
  const handleNativeFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      setMessage({ text: 'Please select a valid image file (JPG, PNG, WebP, SVG).', type: 'error' });
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      setMessage({ text: 'Image file size must be less than 5MB.', type: 'error' });
      return;
    }

    try {
      setIsUploadingAvatar(true);
      setMessage(null);

      const reader = new FileReader();
      reader.onload = async (event) => {
        const base64Data = event.target?.result as string;
        if (!base64Data) {
          setMessage({ text: 'Failed to read image file.', type: 'error' });
          setIsUploadingAvatar(false);
          return;
        }

        try {
          const res = await apiUploadAvatar(currentUser.id, base64Data);
          setAvatarUrl(res.avatarUrl);
          if (res.user) {
            onUpdateUser(res.user);
          }
          setMessage({ text: 'Profile picture uploaded and saved successfully!', type: 'success' });
        } catch (err: any) {
          setMessage({ text: err.message || 'Failed to upload profile picture.', type: 'error' });
        } finally {
          setIsUploadingAvatar(false);
        }
      };

      reader.onerror = () => {
        setMessage({ text: 'Failed to read file.', type: 'error' });
        setIsUploadingAvatar(false);
      };

      reader.readAsDataURL(file);
    } catch (err: any) {
      setMessage({ text: err.message || 'Avatar upload failed', type: 'error' });
      setIsUploadingAvatar(false);
    }
  };

  const handleSaveGeneral = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentUser?.id) return;
    const fullName = `${firstName.trim()} ${lastName.trim()}`.trim() || currentUser.name;
    try {
      setIsSavingGeneral(true);
      setMessage(null);
      const res = await apiUpdateUserProfile(currentUser.id, {
        name: fullName,
        phone: phone.trim(),
        college: college.trim(),
        targetCompany: targetCompany.trim(),
        targetRole: targetRole.trim(),
        avatarUrl: avatarUrl.trim(),
        avatar: avatarUrl.trim(),
      });
      onUpdateUser(res.user);
      setMessage({ text: 'General settings updated successfully!', type: 'success' });
    } catch (err: any) {
      setMessage({ text: err.message || 'Failed to update general settings', type: 'error' });
    } finally {
      setIsSavingGeneral(false);
    }
  };

  const handleSaveSocial = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentUser?.id) return;
    try {
      setIsSavingSocial(true);
      setMessage(null);
      const res = await apiUpdateUserProfile(currentUser.id, {
        linkedIn: linkedIn.trim(),
        github: github.trim(),
        portfolio: portfolio.trim(),
      });
      onUpdateUser(res.user);
      setMessage({ text: 'Social profiles saved successfully!', type: 'success' });
    } catch (err: any) {
      setMessage({ text: err.message || 'Failed to save social profiles', type: 'error' });
    } finally {
      setIsSavingSocial(false);
    }
  };

  const handleSavePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newPassword || newPassword.length < 6) {
      setMessage({ text: 'New password must be at least 6 characters long.', type: 'error' });
      return;
    }
    if (newPassword !== confirmPassword) {
      setMessage({ text: 'New password and confirm password do not match.', type: 'error' });
      return;
    }
    try {
      setIsSavingPassword(true);
      setMessage(null);
      const res = await apiUpdatePassword(currentUser.id, currentPassword, newPassword);
      if (res.user) {
        onUpdateUser(res.user);
      }
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      setMessage({ text: 'Password updated successfully!', type: 'success' });
    } catch (err: any) {
      setMessage({ text: err.message || 'Failed to update password', type: 'error' });
    } finally {
      setIsSavingPassword(false);
    }
  };

  const handleSaveNotifications = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setIsSavingNotifs(true);
      setMessage(null);
      const updatedMetadata = {
        ...(typeof currentUser.metadata === 'object' ? currentUser.metadata : {}),
        notifReminders,
        notifLeague,
        notifCreditAlerts,
        notifProductUpdates,
      };
      const res = await apiUpdateUserProfile(currentUser.id, {
        metadata: updatedMetadata,
      } as any);
      onUpdateUser(res.user);
      setMessage({ text: 'Notification preferences saved successfully!', type: 'success' });
    } catch (err: any) {
      setMessage({ text: err.message || 'Failed to save notification preferences', type: 'error' });
    } finally {
      setIsSavingNotifs(false);
    }
  };

  const handleSubmitFeedback = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!feedbackMessage.trim()) {
      setMessage({ text: 'Please enter your feedback message before sending.', type: 'error' });
      return;
    }
    try {
      setIsSubmittingFeedback(true);
      setMessage(null);
      setFeedbackSuccessMessage(null);
      await apiSubmitFeedback({
        userId: currentUser.id,
        rating: feedbackRating,
        category: feedbackCategory,
        message: feedbackMessage,
        contactRequested: feedbackContact,
      });
      setFeedbackSuccessMessage('Thanks for helping us improve FirstRound 💛 The team has received your feedback.');
      setFeedbackMessage('');
      setFeedbackRating(5);
      setFeedbackCategory('General Feedback');
      setFeedbackContact(false);
    } catch (err: any) {
      setMessage({ text: err.message || 'Failed to submit feedback', type: 'error' });
    } finally {
      setIsSubmittingFeedback(false);
    }
  };

  const handleExecuteDeleteAccount = async () => {
    if (!hasConfirmedDeleteCheck || !currentUser?.id) return;
    try {
      setIsDeletingAccount(true);
      setMessage(null);
      await apiDeleteOwnAccount(currentUser.id);

      setShowFinalDeleteModal(false);
      setShowFriendlyDeleteModal(false);

      if (onDeleteAccountSuccess) {
        onDeleteAccountSuccess();
      } else if (onLogout) {
        onLogout();
      } else {
        onNavigateTab('home');
      }
    } catch (err: any) {
      console.error('[AccountSettings] Delete account error:', err);
      setMessage({ text: err.message || 'Account deletion failed. Please try again.', type: 'error' });
      setShowFinalDeleteModal(false);
    } finally {
      setIsDeletingAccount(false);
    }
  };

  const navItems: { id: SettingsSection; label: string; icon: React.FC<{ className?: string }> }[] = [
    { id: 'general', label: 'General', icon: UserIcon },
    { id: 'subscription', label: 'Subscription', icon: Crown },
    { id: 'credits', label: 'Credits', icon: Zap },
    { id: 'notifications', label: 'Notifications', icon: Bell },
    { id: 'social', label: 'Social', icon: Share2 },
    { id: 'password', label: 'Password', icon: Lock },
    { id: 'emails', label: 'Emails', icon: Mail },
    { id: 'more', label: 'More', icon: ShieldAlert },
  ];

  const initials = (currentUser.name || 'User')
    .split(' ')
    .map((n) => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 py-6 sm:py-10 space-y-6 sm:space-y-8 animate-in fade-in duration-200">
      {/* Hidden Native File Picker for Avatar Upload */}
      <input
        type="file"
        ref={fileInputRef}
        accept="image/jpeg,image/png,image/webp,image/svg+xml"
        onChange={handleNativeFileUpload}
        className="hidden"
      />

      {/* Page Title Header */}
      <div className="border-b border-slate-200 pb-5">
        <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900 font-['Outfit'] tracking-tight">
          Account Settings
        </h1>
        <p className="text-xs sm:text-sm text-slate-500 font-medium mt-1">
          Manage your profile, subscription, AI credits, security, and notification preferences.
        </p>
      </div>

      {/* Global Message / Feedback Banner */}
      {message && (
        <div
          className={`p-4 rounded-2xl border flex items-center justify-between text-xs font-semibold animate-in slide-in-from-top-2 ${
            message.type === 'success'
              ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
              : 'bg-rose-50 border-rose-200 text-rose-900'
          }`}
        >
          <span>{message.text}</span>
          <button onClick={() => setMessage(null)} className="p-1 hover:opacity-75 cursor-pointer">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Two-Column Settings Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 sm:gap-8 items-start">
        {/* LEFT SIDEBAR NAVIGATION (Desktop) / Horizontal Tabs (Mobile) */}
        <div className="lg:col-span-3 space-y-1">
          {/* Mobile Horizontal Scroll Nav */}
          <div className="flex lg:hidden overflow-x-auto gap-2 pb-2 scrollbar-none border-b border-slate-200">
            {navItems.map((item) => {
              const Icon = item.icon;
              const isActive = activeSection === item.id;
              return (
                <button
                  key={item.id}
                  onClick={() => {
                    setActiveSection(item.id);
                    setMessage(null);
                  }}
                  className={`px-3.5 py-2 rounded-xl text-xs font-bold whitespace-nowrap flex items-center gap-2 transition-all cursor-pointer ${
                    isActive
                      ? 'bg-slate-900 text-white shadow-xs'
                      : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-50'
                  }`}
                >
                  <Icon className={`w-3.5 h-3.5 ${isActive ? 'text-amber-400' : 'text-slate-400'}`} />
                  <span>{item.label}</span>
                </button>
              );
            })}
          </div>

          {/* Desktop Sidebar Navigation */}
          <nav className="hidden lg:block bg-white border border-slate-200 rounded-2xl p-2 space-y-1 shadow-2xs">
            {navItems.map((item) => {
              const Icon = item.icon;
              const isActive = activeSection === item.id;
              return (
                <button
                  key={item.id}
                  onClick={() => {
                    setActiveSection(item.id);
                    setMessage(null);
                  }}
                  className={`w-full px-3.5 py-2.5 rounded-xl text-xs font-bold flex items-center justify-between transition-all cursor-pointer ${
                    isActive
                      ? 'bg-slate-900 text-white shadow-xs'
                      : item.id === 'more'
                      ? 'text-rose-600 hover:bg-rose-50'
                      : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
                  }`}
                >
                  <div className="flex items-center gap-2.5">
                    <Icon className={`w-4 h-4 ${isActive ? 'text-amber-400' : item.id === 'more' ? 'text-rose-500' : 'text-slate-400'}`} />
                    <span>{item.label}</span>
                  </div>
                  <ChevronRight className={`w-3.5 h-3.5 ${isActive ? 'text-amber-400' : 'text-slate-300'}`} />
                </button>
              );
            })}
          </nav>
        </div>

        {/* RIGHT CONTENT PANE */}
        <div className="lg:col-span-9 bg-white border border-slate-200 rounded-3xl p-5 sm:p-8 shadow-2xs space-y-6">
          {/* SECTION 1: GENERAL */}
          {activeSection === 'general' && (
            <form onSubmit={handleSaveGeneral} className="space-y-6">
              <div className="border-b border-slate-100 pb-4">
                <h3 className="text-lg font-bold text-slate-900 font-['Outfit']">General Information</h3>
                <p className="text-xs text-slate-500">Update your profile avatar, personal details, and career targets.</p>
              </div>

              {/* Avatar Section with Native File Picker & Remove Action */}
              <div className="flex items-center gap-4 sm:gap-6 pt-1">
                <div className="w-16 h-16 sm:w-20 sm:h-20 rounded-full bg-slate-800 text-white font-extrabold text-xl sm:text-2xl flex items-center justify-center border-2 border-slate-300 overflow-hidden shrink-0 shadow-sm relative">
                  {avatarUrl ? (
                    <img src={avatarUrl} alt={currentUser.name} className="w-full h-full object-cover" />
                  ) : (
                    <span>{initials}</span>
                  )}
                  {(isUploadingAvatar || isRemovingAvatar) && (
                    <div className="absolute inset-0 bg-slate-900/75 flex items-center justify-center text-white">
                      <Loader2 className="w-5 h-5 animate-spin" />
                    </div>
                  )}
                </div>

                <div className="space-y-1.5">
                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      disabled={isUploadingAvatar || isRemovingAvatar}
                      onClick={() => fileInputRef.current?.click()}
                      className="px-4 py-2 bg-white hover:bg-slate-50 text-slate-800 border border-slate-300 font-bold text-xs rounded-xl transition-all shadow-2xs cursor-pointer flex items-center gap-2 disabled:opacity-50"
                    >
                      <Upload className="w-3.5 h-3.5 text-slate-600" />
                      <span>{isUploadingAvatar ? 'Uploading...' : 'Upload New Picture'}</span>
                    </button>

                    {avatarUrl ? (
                      <button
                        type="button"
                        disabled={isUploadingAvatar || isRemovingAvatar}
                        onClick={() => setShowRemoveAvatarModal(true)}
                        className="px-4 py-2 bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 font-bold text-xs rounded-xl transition-all shadow-2xs cursor-pointer flex items-center gap-2 disabled:opacity-50"
                      >
                        <Trash2 className="w-3.5 h-3.5 text-rose-600" />
                        <span>{isRemovingAvatar ? 'Removing...' : 'Remove Picture'}</span>
                      </button>
                    ) : null}
                  </div>
                  <p className="text-[11px] text-slate-400">JPG, PNG, WebP, or SVG up to 5MB.</p>
                </div>
              </div>

              {/* Name Fields */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">First name *</label>
                  <input
                    type="text"
                    required
                    value={firstName}
                    onChange={(e) => setFirstName(e.target.value)}
                    className="w-full px-3.5 py-2.5 bg-slate-50/50 border border-slate-200 rounded-xl text-xs text-slate-900 focus:outline-none focus:border-amber-500 font-medium"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Last name</label>
                  <input
                    type="text"
                    value={lastName}
                    onChange={(e) => setLastName(e.target.value)}
                    className="w-full px-3.5 py-2.5 bg-slate-50/50 border border-slate-200 rounded-xl text-xs text-slate-900 focus:outline-none focus:border-amber-500 font-medium"
                  />
                </div>
              </div>

              {/* Email & Phone */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">E-mail address</label>
                  <input
                    type="email"
                    disabled
                    value={currentUser.email}
                    className="w-full px-3.5 py-2.5 bg-slate-100 border border-slate-200 rounded-xl text-xs text-slate-500 font-medium cursor-not-allowed"
                  />
                  <p className="text-[10px] text-slate-400 mt-1">Managed via authentication provider.</p>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Phone number</label>
                  <input
                    type="tel"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    placeholder="+91 98765 43210"
                    className="w-full px-3.5 py-2.5 bg-slate-50/50 border border-slate-200 rounded-xl text-xs text-slate-900 focus:outline-none focus:border-amber-500 font-medium"
                  />
                </div>
              </div>

              {/* Placement Goals */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-2">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">College / University</label>
                  <input
                    type="text"
                    value={college}
                    onChange={(e) => setCollege(e.target.value)}
                    placeholder="e.g. IIT Bombay / VTU"
                    className="w-full px-3.5 py-2.5 bg-slate-50/50 border border-slate-200 rounded-xl text-xs text-slate-900 focus:outline-none focus:border-amber-500 font-medium"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Target Company</label>
                  <input
                    type="text"
                    value={targetCompany}
                    onChange={(e) => setTargetCompany(e.target.value)}
                    placeholder="e.g. TCS, Infosys, Google"
                    className="w-full px-3.5 py-2.5 bg-slate-50/50 border border-slate-200 rounded-xl text-xs text-slate-900 focus:outline-none focus:border-amber-500 font-medium"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Target Role</label>
                  <input
                    type="text"
                    value={targetRole}
                    onChange={(e) => setTargetRole(e.target.value)}
                    placeholder="e.g. Software Engineer"
                    className="w-full px-3.5 py-2.5 bg-slate-50/50 border border-slate-200 rounded-xl text-xs text-slate-900 focus:outline-none focus:border-amber-500 font-medium"
                  />
                </div>
              </div>

              {/* Submit Button */}
              <div className="flex justify-end pt-4 border-t border-slate-100">
                <button
                  type="submit"
                  disabled={isSavingGeneral}
                  className="px-6 py-2.5 bg-slate-900 hover:bg-slate-800 text-white font-extrabold text-xs rounded-xl shadow-sm transition-all cursor-pointer disabled:opacity-50"
                >
                  {isSavingGeneral ? 'Saving Changes...' : 'Save General Settings'}
                </button>
              </div>
            </form>
          )}

          {/* SECTION 2: SUBSCRIPTION */}
          {activeSection === 'subscription' && (
            <div className="space-y-6">
              <div className="border-b border-slate-100 pb-4">
                <h3 className="text-lg font-bold text-slate-900 font-['Outfit']">Subscription & Plan</h3>
                <p className="text-xs text-slate-500">View your active subscription status, renewal date, and premium benefits.</p>
              </div>

              {loadingSub ? (
                <div className="p-12 flex items-center justify-center text-slate-400">
                  <Loader2 className="w-6 h-6 animate-spin mr-2" />
                  <span className="text-xs font-medium">Loading subscription details...</span>
                </div>
              ) : (() => {
                const plan = subscriptionState?.plan || (currentUser.isPremium ? 'PRO' : 'FREE');
                const planPrice = plan === 'PRO' ? '₹349/month' : plan === 'PLUS' ? '₹199/month' : '₹0';
                const status = subscriptionState?.subscriptionStatus || (plan !== 'FREE' ? 'active' : 'inactive');
                const isCancelled = subscriptionState?.cancelAtPeriodEnd;
                const renewalDate = subscriptionState?.currentPeriodEnd
                  ? new Date(subscriptionState.currentPeriodEnd).toLocaleDateString('en-IN', {
                      day: 'numeric',
                      month: 'short',
                      year: 'numeric',
                    })
                  : null;
                const selectedCount = subscriptionState?.selectedPlusTestIds?.length || 0;

                return (
                  <div className="p-6 rounded-2xl bg-gradient-to-br from-slate-900 via-slate-850 to-slate-950 text-white space-y-5 border border-slate-800 shadow-lg relative overflow-hidden">
                    <div className="flex flex-wrap items-center justify-between gap-4">
                      <div className="flex items-center gap-3">
                        <div className="w-11 h-11 rounded-xl bg-amber-500/20 text-amber-400 flex items-center justify-center border border-amber-500/30 shrink-0">
                          <Crown className="w-6 h-6" />
                        </div>
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-bold uppercase tracking-wider text-amber-400">FIRSTROUND PREMIUM</span>
                          </div>
                          <h4 className="text-xl font-extrabold text-white font-['Outfit']">
                            {plan === 'PRO' ? 'PRO PLAN' : plan === 'PLUS' ? 'PLUS PLAN' : 'FREE PLAN'}
                          </h4>
                          <p className="text-xs text-slate-400 font-medium">{planPrice}</p>
                        </div>
                      </div>

                      <div className="flex items-center gap-2">
                        <span
                          className={`px-3 py-1 rounded-full text-3xs font-extrabold uppercase tracking-wider ${
                            isCancelled
                              ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                              : status === 'active' || plan !== 'FREE'
                              ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                              : 'bg-slate-800 text-slate-300 border border-slate-700'
                          }`}
                        >
                          {isCancelled ? 'CANCELLATION SCHEDULED' : status === 'active' || plan !== 'FREE' ? 'ACTIVE' : 'FREE TIER'}
                        </span>
                      </div>
                    </div>

                    {isCancelled && renewalDate && (
                      <div className="p-3 bg-amber-500/10 border border-amber-500/20 rounded-xl text-amber-200 text-xs">
                        ⚠️ <strong>Cancellation scheduled:</strong> Premium access continues until {renewalDate}. Your subscription will not renew after that date.
                      </div>
                    )}

                    {subscriptionState?.pendingPlan === 'PLUS' && renewalDate && (
                      <div className="p-3 bg-blue-500/10 border border-blue-500/20 rounded-xl text-blue-200 text-xs">
                        ℹ️ <strong>Downgrade scheduled:</strong> Plan will change to <strong>PLUS</strong> on {renewalDate}.
                      </div>
                    )}

                    <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 pt-1 text-xs border-t border-slate-800/80">
                      <div className="bg-slate-900/60 p-3 rounded-xl border border-slate-800">
                        <span className="text-[10px] text-slate-400 font-semibold block uppercase">Status</span>
                        <span className="font-bold text-slate-200 mt-0.5 block capitalize">{isCancelled ? 'Cancelling' : status}</span>
                      </div>

                      <div className="bg-slate-900/60 p-3 rounded-xl border border-slate-800">
                        <span className="text-[10px] text-slate-400 font-semibold block uppercase">Renewal / Expiry</span>
                        <span className="font-bold text-slate-200 mt-0.5 block">{renewalDate || '—'}</span>
                      </div>

                      <div className="bg-slate-900/60 p-3 rounded-xl border border-slate-800">
                        <span className="text-[10px] text-slate-400 font-semibold block uppercase">Premium Tests</span>
                        <span className="font-bold text-slate-200 mt-0.5 block">
                          {plan === 'PRO' ? 'All Unlocked' : plan === 'PLUS' ? `${selectedCount} / 2 selected` : 'Free catalog only'}
                        </span>
                      </div>

                      <div className="bg-slate-900/60 p-3 rounded-xl border border-slate-800">
                        <span className="text-[10px] text-slate-400 font-semibold block uppercase">AI Credits</span>
                        <span className="font-bold text-slate-200 mt-0.5 block">
                          {creditBalance?.totalAvailable ?? (plan === 'PRO' ? 65 : plan === 'PLUS' ? 50 : 10)} credits
                        </span>
                      </div>
                    </div>

                    <div className="pt-2 flex flex-wrap items-center justify-end gap-3">
                      {plan === 'PLUS' && (
                        <button
                          type="button"
                          onClick={() => {
                            window.dispatchEvent(new CustomEvent('firstround:open-premium-modal', { detail: { tab: 'plans' } }));
                          }}
                          className="px-4 py-2 bg-gradient-to-r from-amber-500 to-amber-400 hover:from-amber-400 hover:to-amber-300 text-slate-950 font-extrabold text-xs rounded-xl shadow-sm transition-all cursor-pointer flex items-center gap-1.5"
                        >
                          <Sparkles className="w-3.5 h-3.5 fill-slate-950" />
                          <span>Upgrade to Pro</span>
                        </button>
                      )}

                      {plan !== 'FREE' ? (
                        <button
                          type="button"
                          onClick={() => {
                            window.dispatchEvent(new CustomEvent('firstround:open-premium-modal', { detail: { tab: 'manage' } }));
                          }}
                          className="px-5 py-2 bg-white/10 hover:bg-white/20 text-white font-extrabold text-xs rounded-xl transition-all cursor-pointer border border-white/20"
                        >
                          Manage Subscription
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={() => {
                            window.dispatchEvent(new CustomEvent('firstround:open-premium-modal', { detail: { tab: 'plans' } }));
                          }}
                          className="px-5 py-2.5 bg-amber-400 hover:bg-amber-300 text-slate-950 font-extrabold text-xs rounded-xl shadow-sm transition-all cursor-pointer flex items-center gap-2"
                        >
                          <Crown className="w-4 h-4" />
                          <span>Buy FirstRound Premium</span>
                        </button>
                      )}
                    </div>
                  </div>
                );
              })()}
            </div>
          )}

          {/* SECTION 3: CREDITS */}
          {activeSection === 'credits' && (
            <div className="space-y-6">
              <div className="border-b border-slate-100 pb-4">
                <h3 className="text-lg font-bold text-slate-900 font-['Outfit']">AI Placement Credits</h3>
                <p className="text-xs text-slate-500">Monitor your AI copilot and doubt resolution credit allowance.</p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="p-5 rounded-2xl bg-amber-500/10 border border-amber-500/30 text-amber-950 space-y-1">
                  <span className="text-2xs font-extrabold uppercase tracking-wider text-amber-700 block">
                    Available Credits
                  </span>
                  <p className="text-3xl font-black font-mono text-slate-900">
                    {loadingCredits ? '...' : creditBalance?.totalAvailable ?? creditBalance?.free ?? 0}
                  </p>
                  <p className="text-[11px] text-slate-600 font-medium">Ready to use for AI hints & doubts</p>
                </div>

                <div className="p-5 rounded-2xl bg-slate-50 border border-slate-200 text-slate-900 space-y-1">
                  <span className="text-2xs font-extrabold uppercase tracking-wider text-slate-500 block">
                    Free Monthly Allowance
                  </span>
                  <p className="text-2xl font-bold font-mono text-slate-800">{creditBalance?.free ?? 0}</p>
                  <p className="text-[11px] text-slate-500">Refreshes monthly</p>
                </div>

                <div className="p-5 rounded-2xl bg-slate-50 border border-slate-200 text-slate-900 space-y-1">
                  <span className="text-2xs font-extrabold uppercase tracking-wider text-slate-500 block">
                    Purchased Top-ups
                  </span>
                  <p className="text-2xl font-bold font-mono text-slate-800">{creditBalance?.purchased ?? 0}</p>
                  <p className="text-[11px] text-slate-500">Never expires</p>
                </div>
              </div>

              <div className="flex justify-end pt-4 border-t border-slate-100">
                <button
                  type="button"
                  onClick={triggerBuyCreditPacks}
                  className="px-6 py-2.5 bg-amber-500 hover:bg-amber-400 text-slate-950 font-extrabold text-xs rounded-xl shadow-sm transition-all cursor-pointer flex items-center gap-2"
                >
                  <Zap className="w-4 h-4 fill-slate-950" />
                  <span>Purchase Additional AI Credits</span>
                </button>
              </div>
            </div>
          )}

          {/* SECTION 4: NOTIFICATIONS */}
          {activeSection === 'notifications' && (
            <form onSubmit={handleSaveNotifications} className="space-y-6">
              <div className="border-b border-slate-100 pb-4">
                <h3 className="text-lg font-bold text-slate-900 font-['Outfit']">Notification Preferences</h3>
                <p className="text-xs text-slate-500">Choose what updates you want to receive on FirstRound.</p>
              </div>

              <div className="space-y-4">
                <div className="p-4 rounded-2xl border border-slate-200/80 flex items-center justify-between hover:bg-slate-50/50 transition-colors">
                  <div className="space-y-0.5">
                    <span className="text-xs font-bold text-slate-900 block">Assessment & Test Reminders</span>
                    <p className="text-2xs text-slate-500">Receive reminders for upcoming practice tests and mega events.</p>
                  </div>
                  <input
                    type="checkbox"
                    checked={notifReminders}
                    onChange={(e) => setNotifReminders(e.target.checked)}
                    className="w-4 h-4 accent-slate-900 cursor-pointer"
                  />
                </div>

                <div className="p-4 rounded-2xl border border-slate-200/80 flex items-center justify-between hover:bg-slate-50/50 transition-colors">
                  <div className="space-y-0.5">
                    <span className="text-xs font-bold text-slate-900 block">Weekly League & Leaderboard Updates</span>
                    <p className="text-2xs text-slate-500">Notifications on rank updates, promotion, and demotion alerts.</p>
                  </div>
                  <input
                    type="checkbox"
                    checked={notifLeague}
                    onChange={(e) => setNotifLeague(e.target.checked)}
                    className="w-4 h-4 accent-slate-900 cursor-pointer"
                  />
                </div>

                <div className="p-4 rounded-2xl border border-slate-200/80 flex items-center justify-between hover:bg-slate-50/50 transition-colors">
                  <div className="space-y-0.5">
                    <span className="text-xs font-bold text-slate-900 block">AI Credit Balance Alerts</span>
                    <p className="text-2xs text-slate-500">Alerts when your AI copilot credit allowance is running low.</p>
                  </div>
                  <input
                    type="checkbox"
                    checked={notifCreditAlerts}
                    onChange={(e) => setNotifCreditAlerts(e.target.checked)}
                    className="w-4 h-4 accent-slate-900 cursor-pointer"
                  />
                </div>

                <div className="p-4 rounded-2xl border border-slate-200/80 flex items-center justify-between hover:bg-slate-50/50 transition-colors">
                  <div className="space-y-0.5">
                    <span className="text-xs font-bold text-slate-900 block">Platform & Feature Updates</span>
                    <p className="text-2xs text-slate-500">Updates on newly added company tests and feature enhancements.</p>
                  </div>
                  <input
                    type="checkbox"
                    checked={notifProductUpdates}
                    onChange={(e) => setNotifProductUpdates(e.target.checked)}
                    className="w-4 h-4 accent-slate-900 cursor-pointer"
                  />
                </div>
              </div>

              <div className="flex justify-end pt-4 border-t border-slate-100">
                <button
                  type="submit"
                  disabled={isSavingNotifs}
                  className="px-6 py-2.5 bg-slate-900 hover:bg-slate-800 text-white font-extrabold text-xs rounded-xl shadow-sm transition-all cursor-pointer disabled:opacity-50"
                >
                  {isSavingNotifs ? 'Saving...' : 'Save Notification Preferences'}
                </button>
              </div>
            </form>
          )}

          {/* SECTION 5: SOCIAL */}
          {activeSection === 'social' && (
            <form onSubmit={handleSaveSocial} className="space-y-6">
              <div className="border-b border-slate-100 pb-4">
                <h3 className="text-lg font-bold text-slate-900 font-['Outfit']">Social & Professional Links</h3>
                <p className="text-xs text-slate-500">Add your professional links for placement profile visibility.</p>
              </div>

              <div className="space-y-4">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">LinkedIn Profile</label>
                  <input
                    type="url"
                    value={linkedIn}
                    onChange={(e) => setLinkedIn(e.target.value)}
                    placeholder="https://linkedin.in/in/username"
                    className="w-full px-3.5 py-2.5 bg-slate-50/50 border border-slate-200 rounded-xl text-xs text-slate-900 focus:outline-none focus:border-amber-500 font-mono"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">GitHub Profile</label>
                  <input
                    type="url"
                    value={github}
                    onChange={(e) => setGithub(e.target.value)}
                    placeholder="https://github.com/username"
                    className="w-full px-3.5 py-2.5 bg-slate-50/50 border border-slate-200 rounded-xl text-xs text-slate-900 focus:outline-none focus:border-amber-500 font-mono"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Portfolio / Personal Website</label>
                  <input
                    type="url"
                    value={portfolio}
                    onChange={(e) => setPortfolio(e.target.value)}
                    placeholder="https://yourportfolio.com"
                    className="w-full px-3.5 py-2.5 bg-slate-50/50 border border-slate-200 rounded-xl text-xs text-slate-900 focus:outline-none focus:border-amber-500 font-mono"
                  />
                </div>
              </div>

              <div className="flex justify-end pt-4 border-t border-slate-100">
                <button
                  type="submit"
                  disabled={isSavingSocial}
                  className="px-6 py-2.5 bg-slate-900 hover:bg-slate-800 text-white font-extrabold text-xs rounded-xl shadow-sm transition-all cursor-pointer disabled:opacity-50"
                >
                  {isSavingSocial ? 'Saving...' : 'Save Social Profiles'}
                </button>
              </div>
            </form>
          )}

          {/* SECTION 6: PASSWORD */}
          {activeSection === 'password' && (
            <div className="space-y-6">
              <div className="border-b border-slate-100 pb-4">
                <h3 className="text-lg font-bold text-slate-900 font-['Outfit']">Password & Security</h3>
                <p className="text-xs text-slate-500">Manage your account authentication credentials.</p>
              </div>

              {currentUser.email.endsWith('@gmail.com') || currentUser.provider === 'google' ? (
                <div className="p-5 rounded-2xl bg-amber-50 border border-amber-200 text-amber-900 space-y-2">
                  <div className="flex items-center gap-2">
                    <Globe className="w-5 h-5 text-amber-600 shrink-0" />
                    <h4 className="text-sm font-bold text-amber-950 font-['Outfit']">Google OAuth Managed Account</h4>
                  </div>
                  <p className="text-xs text-amber-800 leading-relaxed">
                    Your account authenticates securely via Google OAuth. Password changes and security settings are managed directly in your Google Account settings.
                  </p>
                </div>
              ) : (
                <form onSubmit={handleSavePassword} className="space-y-4">
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">Current Password *</label>
                    <input
                      type="password"
                      required
                      value={currentPassword}
                      onChange={(e) => setCurrentPassword(e.target.value)}
                      placeholder="••••••••"
                      className="w-full px-3.5 py-2.5 bg-slate-50/50 border border-slate-200 rounded-xl text-xs text-slate-900 focus:outline-none focus:border-amber-500 font-mono"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">New Password *</label>
                    <input
                      type="password"
                      required
                      minLength={6}
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                      placeholder="••••••••"
                      className="w-full px-3.5 py-2.5 bg-slate-50/50 border border-slate-200 rounded-xl text-xs text-slate-900 focus:outline-none focus:border-amber-500 font-mono"
                    />
                    <p className="text-[10px] text-slate-400 mt-1">Minimum 6 characters required.</p>
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">Confirm New Password *</label>
                    <input
                      type="password"
                      required
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      placeholder="••••••••"
                      className="w-full px-3.5 py-2.5 bg-slate-50/50 border border-slate-200 rounded-xl text-xs text-slate-900 focus:outline-none focus:border-amber-500 font-mono"
                    />
                  </div>

                  <div className="flex justify-end pt-4 border-t border-slate-100">
                    <button
                      type="submit"
                      disabled={isSavingPassword}
                      className="px-6 py-2.5 bg-slate-900 hover:bg-slate-800 text-white font-extrabold text-xs rounded-xl shadow-sm transition-all cursor-pointer disabled:opacity-50"
                    >
                      {isSavingPassword ? 'Updating Password...' : 'Update Password'}
                    </button>
                  </div>
                </form>
              )}
            </div>
          )}

          {/* SECTION 7: EMAILS */}
          {activeSection === 'emails' && (
            <div className="space-y-6">
              <div className="border-b border-slate-100 pb-4">
                <h3 className="text-lg font-bold text-slate-900 font-['Outfit']">Email Settings</h3>
                <p className="text-xs text-slate-500">Manage your primary email identity and verification status.</p>
              </div>

              <div className="p-4 sm:p-5 rounded-2xl border border-slate-200 bg-slate-50/50 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold text-slate-900 font-mono">{currentUser.email}</span>
                    <span className="px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 border border-emerald-200 text-[10px] font-extrabold uppercase">
                      VERIFIED
                    </span>
                  </div>
                  <p className="text-2xs text-slate-500">Primary authentication email for account login and notifications.</p>
                </div>

                <button
                  type="button"
                  onClick={() => setShowEmailInfoModal(true)}
                  className="px-4 py-2 bg-white hover:bg-slate-100 text-slate-700 border border-slate-300 font-bold text-xs rounded-xl transition-all cursor-pointer shrink-0"
                >
                  Verification Info
                </button>
              </div>
            </div>
          )}

          {/* SECTION 8: MORE (FEEDBACK & RATING + DANGER ZONE) */}
          {activeSection === 'more' && (
            <div className="space-y-8">
              <div className="border-b border-slate-100 pb-4">
                <h3 className="text-lg font-bold text-slate-900 font-['Outfit']">Advanced Account Settings</h3>
                <p className="text-xs text-slate-500">Provide product feedback and manage account deletion options.</p>
              </div>

              {/* FEEDBACK & RATING SECTION */}
              <div className="p-6 rounded-3xl border border-slate-200 bg-slate-50/40 space-y-5 shadow-2xs">
                <div className="flex items-start gap-3">
                  <div className="w-10 h-10 rounded-2xl bg-amber-100 text-amber-700 flex items-center justify-center shrink-0 border border-amber-200">
                    <MessageSquare className="w-5 h-5" />
                  </div>
                  <div>
                    <h4 className="text-base font-bold text-slate-900 font-['Outfit']">Feedback & Rating</h4>
                    <p className="text-xs text-slate-500 mt-0.5">
                      How is your FirstRound experience? Let us know how we can make your preparation better.
                    </p>
                  </div>
                </div>

                {feedbackSuccessMessage ? (
                  <div className="p-5 rounded-2xl bg-emerald-50 border border-emerald-200 text-emerald-900 space-y-2 animate-in fade-in">
                    <div className="flex items-center gap-2">
                      <span className="text-xl">💛</span>
                      <p className="text-xs font-bold text-emerald-950">{feedbackSuccessMessage}</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => setFeedbackSuccessMessage(null)}
                      className="text-xs font-bold text-emerald-700 underline hover:text-emerald-900 cursor-pointer pt-1 block"
                    >
                      Submit another response
                    </button>
                  </div>
                ) : (
                  <form onSubmit={handleSubmitFeedback} className="space-y-4 pt-1">
                    {/* Rating Stars */}
                    <div>
                      <label className="block text-xs font-bold text-slate-700 mb-1.5">Rating *</label>
                      <div className="flex items-center gap-1.5">
                        {[1, 2, 3, 4, 5].map((star) => (
                          <button
                            key={star}
                            type="button"
                            onClick={() => setFeedbackRating(star)}
                            onMouseEnter={() => setFeedbackHoverRating(star)}
                            onMouseLeave={() => setFeedbackHoverRating(0)}
                            className="p-1 text-slate-300 hover:scale-110 transition-transform cursor-pointer focus:outline-none"
                          >
                            <Star
                              className={`w-6 h-6 ${
                                star <= (feedbackHoverRating || feedbackRating)
                                  ? 'fill-amber-400 text-amber-400'
                                  : 'text-slate-300'
                              }`}
                            />
                          </button>
                        ))}
                        <span className="text-xs font-bold text-slate-600 ml-2">
                          {feedbackRating === 5
                            ? 'Excellent 🌟'
                            : feedbackRating === 4
                            ? 'Good 👍'
                            : feedbackRating === 3
                            ? 'Average 👌'
                            : feedbackRating === 2
                            ? 'Needs Improvement'
                            : 'Poor'}
                        </span>
                      </div>
                    </div>

                    {/* Category Select */}
                    <div>
                      <label className="block text-xs font-bold text-slate-700 mb-1">Feedback Type</label>
                      <select
                        value={feedbackCategory}
                        onChange={(e) => setFeedbackCategory(e.target.value)}
                        className="w-full px-3.5 py-2.5 bg-white border border-slate-200 rounded-xl text-xs text-slate-900 focus:outline-none focus:border-amber-500 font-medium"
                      >
                        <option value="General Feedback">General Feedback</option>
                        <option value="Bug Report">Bug Report</option>
                        <option value="Feature Request">Feature Request</option>
                        <option value="UI/UX Feedback">UI/UX Feedback</option>
                        <option value="Other">Other</option>
                      </select>
                    </div>

                    {/* Message Textarea */}
                    <div>
                      <label className="block text-xs font-bold text-slate-700 mb-1">Message *</label>
                      <textarea
                        required
                        rows={4}
                        value={feedbackMessage}
                        onChange={(e) => setFeedbackMessage(e.target.value)}
                        placeholder="Tell us what you love or what features you would like to see added..."
                        className="w-full px-3.5 py-2.5 bg-white border border-slate-200 rounded-xl text-xs text-slate-900 focus:outline-none focus:border-amber-500 font-medium resize-y"
                      />
                    </div>

                    {/* Contact Preference Checkbox */}
                    <div className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        id="feedback-contact"
                        checked={feedbackContact}
                        onChange={(e) => setFeedbackContact(e.target.checked)}
                        className="w-4 h-4 accent-slate-900 cursor-pointer"
                      />
                      <label htmlFor="feedback-contact" className="text-xs text-slate-600 cursor-pointer">
                        Would you like us to contact you about this feedback?
                      </label>
                    </div>

                    <div className="flex justify-end pt-2">
                      <button
                        type="submit"
                        disabled={isSubmittingFeedback}
                        className="px-6 py-2.5 bg-amber-500 hover:bg-amber-400 text-slate-950 font-extrabold text-xs rounded-xl shadow-xs transition-all cursor-pointer disabled:opacity-50"
                      >
                        {isSubmittingFeedback ? 'Sending Feedback...' : 'Send Feedback'}
                      </button>
                    </div>
                  </form>
                )}
              </div>

              {/* DANGER ZONE PANEL */}
              <div className="p-6 rounded-3xl border-2 border-rose-200 bg-rose-50/30 space-y-4 shadow-2xs">
                <div className="flex items-start gap-3">
                  <div className="w-10 h-10 rounded-2xl bg-rose-100 text-rose-600 flex items-center justify-center shrink-0 border border-rose-200">
                    <ShieldAlert className="w-5 h-5" />
                  </div>
                  <div>
                    <h4 className="text-base font-bold text-rose-950 font-['Outfit']">Danger Zone</h4>
                    <p className="text-xs text-rose-700 mt-0.5">
                      Actions here are permanent and affect your FirstRound account identity and data.
                    </p>
                  </div>
                </div>

                <div className="p-4 rounded-2xl bg-white border border-rose-200 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                  <div className="space-y-1">
                    <span className="text-xs font-bold text-slate-900 block">Delete FirstRound Account</span>
                    <p className="text-2xs text-slate-500">
                      Permanently delete your profile, bookmarks, test history, and account data. If you ever decide to return, you can register again anytime.
                    </p>
                  </div>

                  <button
                    type="button"
                    onClick={() => setShowFriendlyDeleteModal(true)}
                    className="px-5 py-2.5 bg-rose-600 hover:bg-rose-500 text-white font-extrabold text-xs rounded-xl shadow-xs transition-all cursor-pointer shrink-0 flex items-center gap-1.5"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>Delete Account</span>
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* EMAIL VERIFICATION INFO MODAL */}
      {showEmailInfoModal && (
        <div className="fixed inset-0 z-50 bg-slate-950/70 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in duration-150">
          <div className="bg-white border border-slate-200 rounded-3xl w-full max-w-md shadow-2xl p-6 text-slate-900 space-y-4 animate-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h3 className="text-base font-extrabold text-slate-900 font-['Outfit'] flex items-center gap-2">
                <Mail className="w-4 h-4 text-emerald-600" />
                Email Verification Details
              </h3>
              <button
                onClick={() => setShowEmailInfoModal(false)}
                className="p-1 text-slate-400 hover:text-slate-600 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-3 text-xs text-slate-600 leading-relaxed font-medium">
              <p>
                Your primary email <strong className="text-slate-900 font-mono">{currentUser.email}</strong> is verified and linked to your active FirstRound candidate account identity.
              </p>
              <p>
                Email verification status is securely managed by your authentication provider. Any identity or email adjustments will trigger provider-level verification links automatically.
              </p>
            </div>

            <div className="flex justify-end pt-2">
              <button
                type="button"
                onClick={() => setShowEmailInfoModal(false)}
                className="px-5 py-2 bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs rounded-xl cursor-pointer"
              >
                Got It
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL STEP 1: FRIENDLY "WAIT... DON'T GO YET" DIALOG */}
      {showFriendlyDeleteModal && (
        <div className="fixed inset-0 z-50 bg-slate-950/70 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in duration-150">
          <div className="bg-white border border-slate-200 rounded-3xl w-full max-w-md shadow-2xl p-6 text-slate-900 space-y-5 animate-in zoom-in-95 duration-150">
            <div className="text-center space-y-2">
              <div className="w-14 h-14 rounded-full bg-amber-100 text-amber-600 text-2xl flex items-center justify-center mx-auto shadow-inner">
                💛
              </div>
              <h3 className="text-xl font-extrabold text-slate-900 font-['Outfit']">
                Wait... don't go yet 💛
              </h3>
              <p className="text-xs text-slate-600 leading-relaxed font-medium">
                We'll be sorry to see you leave.
                Deleting your account will remove your FirstRound profile, saved progress, bookmarks, and other account data. If you decide to come back later, you're always welcome to start again.
              </p>
            </div>

            <div className="flex flex-col sm:flex-row items-center justify-end gap-3 pt-3 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setShowFriendlyDeleteModal(false)}
                className="w-full sm:w-auto px-5 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-800 font-bold text-xs rounded-xl transition-all cursor-pointer text-center"
              >
                Keep My Account
              </button>
              <button
                type="button"
                onClick={() => {
                  setShowFriendlyDeleteModal(false);
                  setShowFinalDeleteModal(true);
                }}
                className="w-full sm:w-auto px-5 py-2.5 bg-rose-600 hover:bg-rose-500 text-white font-extrabold text-xs rounded-xl shadow-xs transition-all cursor-pointer text-center"
              >
                Continue with Deletion
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL STEP 2: FINAL CONFIRMATION DIALOG */}
      {showFinalDeleteModal && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in duration-150">
          <div className="bg-white border border-slate-200 rounded-3xl w-full max-w-md shadow-2xl p-6 text-slate-900 space-y-5 animate-in zoom-in-95 duration-150">
            <div className="flex items-start gap-3.5">
              <div className="w-11 h-11 rounded-2xl bg-rose-100 text-rose-600 flex items-center justify-center shrink-0 border border-rose-200">
                <Trash2 className="w-5 h-5" />
              </div>
              <div className="space-y-1">
                <h3 className="text-lg font-bold text-slate-900 font-['Outfit']">
                  Delete your account permanently?
                </h3>
                <p className="text-xs text-slate-600 leading-relaxed font-medium">
                  This action cannot be undone. Your FirstRound account and associated personal data will be deleted.
                </p>
              </div>
            </div>

            <div className="p-3.5 rounded-2xl bg-rose-50 border border-rose-200 text-rose-900 text-xs">
              <label className="flex items-start gap-2.5 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={hasConfirmedDeleteCheck}
                  onChange={(e) => setHasConfirmedDeleteCheck(e.target.checked)}
                  className="mt-0.5 w-4 h-4 accent-rose-600 cursor-pointer shrink-0"
                />
                <span className="font-semibold text-rose-950">
                  I understand that my account and personal data will be permanently deleted.
                </span>
              </label>
            </div>

            <div className="flex flex-col sm:flex-row items-center justify-end gap-3 pt-3 border-t border-slate-100">
              <button
                type="button"
                disabled={isDeletingAccount}
                onClick={() => {
                  setShowFinalDeleteModal(false);
                  setHasConfirmedDeleteCheck(false);
                }}
                className="w-full sm:w-auto px-5 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-800 font-bold text-xs rounded-xl transition-all cursor-pointer disabled:opacity-50 text-center"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={!hasConfirmedDeleteCheck || isDeletingAccount}
                onClick={handleExecuteDeleteAccount}
                className="w-full sm:w-auto px-6 py-2.5 bg-rose-600 hover:bg-rose-500 text-white font-extrabold text-xs rounded-xl shadow-xs transition-all cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2 text-center"
              >
                {isDeletingAccount ? 'Deleting Account...' : 'Delete My Account'}
              </button>
            </div>
          </div>
        </div>
      )}
      {/* REMOVE PROFILE PICTURE CONFIRMATION MODAL */}
      {showRemoveAvatarModal && (
        <div className="fixed inset-0 z-50 bg-slate-950/70 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in duration-150">
          <div className="bg-white border border-slate-200 rounded-3xl w-full max-w-md shadow-2xl p-6 text-slate-900 space-y-5 animate-in zoom-in-95 duration-150">
            <div className="flex items-start gap-3.5">
              <div className="w-11 h-11 rounded-2xl bg-rose-100 text-rose-600 flex items-center justify-center shrink-0 border border-rose-200">
                <Trash2 className="w-5 h-5" />
              </div>
              <div className="space-y-1">
                <h3 className="text-lg font-bold text-slate-900 font-['Outfit']">
                  Remove profile picture?
                </h3>
                <p className="text-xs text-slate-600 leading-relaxed font-medium">
                  This will remove your current profile picture and restore your default avatar. You can upload a new picture anytime.
                </p>
              </div>
            </div>

            <div className="flex flex-col sm:flex-row items-center justify-end gap-3 pt-3 border-t border-slate-100">
              <button
                type="button"
                disabled={isRemovingAvatar}
                onClick={() => setShowRemoveAvatarModal(false)}
                className="w-full sm:w-auto px-5 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-800 font-bold text-xs rounded-xl transition-all cursor-pointer disabled:opacity-50 text-center"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={isRemovingAvatar}
                onClick={handleRemoveAvatar}
                className="w-full sm:w-auto px-6 py-2.5 bg-rose-600 hover:bg-rose-500 text-white font-extrabold text-xs rounded-xl shadow-xs transition-all cursor-pointer disabled:opacity-50 flex items-center justify-center gap-2 text-center"
              >
                {isRemovingAvatar ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    <span>Removing...</span>
                  </>
                ) : (
                  <span>Remove Picture</span>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
