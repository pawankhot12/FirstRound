import React, { useEffect, useRef } from 'react';
import {
  Award,
  Bell,
  Bookmark,
  Briefcase,
  Check,
  CheckCircle2,
  ChevronRight,
  ClipboardCheck,
  Clock,
  CreditCard,
  Crown,
  Info,
  Megaphone,
  Sparkles,
  Trophy,
  X,
} from 'lucide-react';
import { AppNotification, NotificationType } from '../types';

interface NotificationCenterProps {
  notifications: AppNotification[];
  unreadCount: number;
  readIds: string[];
  isOpen: boolean;
  onClose: () => void;
  onMarkRead: (id: string) => void;
  onMarkAllRead: () => void;
  onNotificationClick: (notif: AppNotification) => void;
}

export const NotificationCenter: React.FC<NotificationCenterProps> = ({
  notifications,
  unreadCount,
  readIds,
  isOpen,
  onClose,
  onMarkRead,
  onMarkAllRead,
  onNotificationClick,
}) => {
  const panelRef = useRef<HTMLDivElement>(null);
  const readSet = new Set(readIds);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(event.target as Node)) {
        onClose();
      }
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose();
      }
    };

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      document.addEventListener('keydown', handleKeyDown);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const formatNotificationDate = (dateStr: string) => {
    try {
      const d = new Date(dateStr);
      if (isNaN(d.getTime())) return 'Today';
      const now = new Date();

      const isToday =
        d.getDate() === now.getDate() &&
        d.getMonth() === now.getMonth() &&
        d.getFullYear() === now.getFullYear();

      const yesterday = new Date(now);
      yesterday.setDate(now.getDate() - 1);
      const isYesterday =
        d.getDate() === yesterday.getDate() &&
        d.getMonth() === yesterday.getMonth() &&
        d.getFullYear() === yesterday.getFullYear();

      const timeStr = d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit', hour12: true });

      if (isToday) return `Today • ${timeStr}`;
      if (isYesterday) return `Yesterday • ${timeStr}`;
      return `${d.toLocaleDateString([], { month: 'short', day: 'numeric' })} • ${timeStr}`;
    } catch {
      return 'Today';
    }
  };

  const getTypeIcon = (type: NotificationType | string) => {
    switch (type) {
      case 'ANNOUNCEMENT':
        return <Megaphone className="w-4 h-4 text-sky-500" />;
      case 'NEW_TEST':
      case 'ASSESSMENT_REMINDER':
        return <ClipboardCheck className="w-4 h-4 text-amber-500" />;
      case 'RESULT_AVAILABLE':
        return <CheckCircle2 className="w-4 h-4 text-emerald-500" />;
      case 'REVISION_REMINDER':
      case 'REVISION':
        return <Bookmark className="w-4 h-4 text-purple-500" />;
      case 'LEAGUE_UPDATE':
      case 'LEAGUE_POSITION':
      case 'COMPETITION':
      case 'LEADERBOARD':
      case 'LEAGUE':
        return <Trophy className="w-4 h-4 text-amber-500" />;
      case 'CAREER_UPDATE':
      case 'CAREER':
        return <Briefcase className="w-4 h-4 text-indigo-500" />;
      case 'AI_CREDIT_WARNING':
      case 'AI_CREDITS_EXHAUSTED':
      case 'AI_CREDITS':
        return <Sparkles className="w-4 h-4 text-pink-500" />;
      case 'PAYMENT_CONFIRMATION':
      case 'SUBSCRIPTION_UPDATE':
        return <CreditCard className="w-4 h-4 text-emerald-500" />;
      case 'SYSTEM_NOTICE':
      case 'SYSTEM':
      case 'REMINDER':
      default:
        return <Bell className="w-4 h-4 text-sky-500" />;
    }
  };

  const getActionLabel = (notif: AppNotification) => {
    if (notif.actionLabel) return notif.actionLabel;
    switch (notif.actionType) {
      case 'OPEN_TEST':
        return 'Open Assessment';
      case 'OPEN_REVISION':
        return 'Open Revision Vault';
      case 'OPEN_CAREER':
        return 'Open Career Track';
      case 'OPEN_CREDITS':
        return 'View Credits';
      case 'OPEN_LEADERBOARD':
        return 'View League';
      case 'OPEN_PROFILE':
        return 'View Profile';
      case 'OPEN_ANNOUNCEMENT':
        return 'View Details';
      default:
        if (notif.actionTab === 'vault') return 'Open Revision Vault';
        if (notif.actionTab === 'career') return 'Open Career Track';
        if (notif.actionTab === 'credits') return 'View Credits';
        if (notif.actionTab === 'leaderboard') return 'View League';
        if (notif.actionTab === 'tests') return 'Open Assessment';
        return null;
    }
  };

  return (
    <div
      ref={panelRef}
      id="notification-center-dropdown"
      className="fixed inset-x-3 top-16 sm:absolute sm:inset-x-auto sm:right-0 sm:top-auto sm:mt-2 sm:w-96 max-w-[calc(100vw-1.5rem)] bg-surface border border-border rounded-2xl shadow-xl z-50 overflow-hidden animate-in fade-in zoom-in-95 duration-150"
    >
      {/* Header */}
      <div className="px-4 py-3 bg-app-bg border-b border-border flex items-center justify-between">
        <div className="flex items-center gap-2">
          <h3 className="text-xs font-extrabold text-text-primary tracking-tight font-['Outfit']">
            Notifications
          </h3>
          {unreadCount > 0 && (
            <span
              id="notification-unread-pill"
              className="px-2 py-0.5 bg-amber-500 text-slate-950 font-extrabold text-[10px] rounded-full"
            >
              {unreadCount} Unread
            </span>
          )}
        </div>

        <div className="flex items-center gap-2">
          {unreadCount > 0 && (
            <button
              id="notification-mark-all-read-btn"
              onClick={onMarkAllRead}
              className="text-[11px] font-bold text-amber-600 hover:text-amber-700 dark:text-amber-400 hover:underline flex items-center gap-1 transition-colors cursor-pointer"
            >
              <Check className="w-3 h-3" />
              <span>Mark all read</span>
            </button>
          )}

          <button
            onClick={onClose}
            className="p-1 text-slate-400 hover:text-text-secondary rounded-md hover:bg-surface-hover transition-colors cursor-pointer"
            aria-label="Close notifications"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Notifications List */}
      <div className="max-h-[390px] overflow-y-auto divide-y divide-border/60">
        {notifications.length === 0 ? (
          <div className="py-10 px-6 text-center space-y-2">
            <div className="w-10 h-10 rounded-full bg-surface-hover text-slate-400 flex items-center justify-center mx-auto border border-border">
              <Bell className="w-5 h-5 text-amber-500/80" />
            </div>
            <p className="text-xs font-bold text-text-primary">You're all caught up.</p>
            <p className="text-[11px] text-text-muted max-w-xs mx-auto">
              Important updates will appear here.
            </p>
          </div>
        ) : (
          notifications.map((notif) => {
            const isRead = readSet.has(notif.id) || !!notif.readAt || !!notif.read;
            const actionLabel = getActionLabel(notif);
            const isCritical = notif.priority === 'Critical';
            const isImportant = notif.priority === 'Important';

            return (
              <div
                key={notif.id}
                id={`notification-item-${notif.id}`}
                onClick={() => {
                  if (!isRead) onMarkRead(notif.id);
                  onNotificationClick(notif);
                }}
                className={`p-3.5 transition-colors cursor-pointer flex items-start gap-3 group relative ${
                  isRead
                    ? 'bg-surface hover:bg-surface-hover/70 opacity-85 hover:opacity-100'
                    : isCritical
                    ? 'bg-red-500/10 hover:bg-red-500/15 border-l-2 border-l-red-500'
                    : isImportant
                    ? 'bg-amber-500/10 hover:bg-amber-500/15 border-l-2 border-l-amber-500'
                    : 'bg-amber-500/5 hover:bg-amber-500/10'
                }`}
              >
                {/* Icon Circle */}
                <div
                  className={`w-8 h-8 rounded-xl flex items-center justify-center shrink-0 border ${
                    isRead
                      ? 'bg-surface-hover border-border text-text-secondary'
                      : 'bg-surface border-amber-500/30 shadow-2xs'
                  }`}
                >
                  {getTypeIcon(notif.type)}
                </div>

                {/* Content */}
                <div className="flex-1 min-w-0 space-y-1">
                  <div className="flex items-center justify-between gap-1.5">
                    <div className="flex items-center gap-1.5 truncate">
                      <h4
                        className={`text-xs truncate ${
                          isRead
                            ? 'text-text-secondary font-medium'
                            : 'text-text-primary font-extrabold'
                        }`}
                      >
                        {notif.title}
                      </h4>
                      {isCritical && (
                        <span className="px-1.5 py-0.2 bg-red-500 text-white font-extrabold text-[9px] rounded-sm shrink-0 uppercase">
                          Critical
                        </span>
                      )}
                      {isImportant && !isCritical && (
                        <span className="px-1.5 py-0.2 bg-amber-500/20 text-amber-500 font-extrabold text-[9px] rounded-sm shrink-0 uppercase">
                          Important
                        </span>
                      )}
                    </div>
                    <span className="text-[10px] text-text-muted font-medium shrink-0">
                      {formatNotificationDate(notif.createdAt)}
                    </span>
                  </div>

                  <p className="text-[11px] text-text-secondary line-clamp-2 leading-relaxed">
                    {notif.message}
                  </p>

                  {actionLabel && (
                    <div className="pt-1 flex items-center gap-1 text-[11px] font-extrabold text-amber-500 group-hover:text-amber-400">
                      <span>{actionLabel}</span>
                      <ChevronRight className="w-3 h-3 group-hover:translate-x-0.5 transition-transform" />
                    </div>
                  )}
                </div>

                {/* Unread indicator dot */}
                {!isRead && (
                  <div className="w-2.5 h-2.5 rounded-full bg-amber-500 shrink-0 mt-1.5 ring-2 ring-amber-500/30 shadow-xs" />
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};
