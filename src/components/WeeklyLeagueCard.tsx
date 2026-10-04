import React, { useEffect, useState } from 'react';
import { ChevronRight, Clock, Trophy, Users, AlertCircle } from 'lucide-react';
import { LeagueEmblem } from './LeagueEmblem';
import { apiGetCurrentLeague } from '../api';

interface WeeklyLeagueCardProps {
  userId?: string | null;
  onNavigateTab: (tab: any) => void;
}

export const WeeklyLeagueCard: React.FC<WeeklyLeagueCardProps> = ({
  userId,
  onNavigateTab,
}) => {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!userId) {
      setLoading(false);
      return;
    }
    let isMounted = true;

    apiGetCurrentLeague(userId)
      .then((res) => {
        if (isMounted) {
          setData(res);
          setLoading(false);
        }
      })
      .catch((err) => {
        if (isMounted) {
          setError(err.message || 'Failed to load weekly league info');
          setLoading(false);
        }
      });

    return () => {
      isMounted = false;
    };
  }, [userId]);

  // Countdown timer formatting helper
  const formatCountdown = (totalSeconds: number) => {
    if (totalSeconds <= 0) return 'Season ending now';
    const days = Math.floor(totalSeconds / 86400);
    const hours = Math.floor((totalSeconds % 86400) / 3600);
    const mins = Math.floor((totalSeconds % 3600) / 60);

    if (days > 0) return `${days}d ${hours}h remaining`;
    if (hours > 0) return `${hours}h ${mins}m remaining`;
    return `${mins}m remaining`;
  };

  if (loading) {
    return (
      <div className="bg-surface rounded-2xl p-6 border border-border shadow-xs space-y-4 animate-pulse">
        <div className="flex items-center justify-between">
          <div className="h-4 w-32 bg-slate-200 rounded"></div>
          <div className="h-4 w-12 bg-slate-200 rounded"></div>
        </div>
        <div className="flex items-center gap-4 py-2">
          <div className="w-12 h-12 bg-slate-200 rounded-full"></div>
          <div className="space-y-2 flex-1">
            <div className="h-5 w-24 bg-slate-200 rounded"></div>
            <div className="h-3 w-36 bg-slate-200 rounded"></div>
          </div>
        </div>
        <div className="h-8 bg-slate-200 rounded-xl w-full"></div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="bg-surface rounded-2xl p-6 border border-border shadow-xs text-center space-y-3">
        <div className="flex items-center justify-between text-xs font-bold text-text-muted border-b border-slate-100 pb-2">
          <span className="flex items-center gap-1.5 text-text-primary">
            <Trophy className="w-4 h-4 text-amber-500" />
            Weekly League
          </span>
        </div>
        <p className="text-xs text-text-muted pt-2">
          {error || 'Join weekly competition by taking an assessment.'}
        </p>
        <button
          onClick={() => onNavigateTab('leaderboard')}
          className="w-full py-2 bg-primary text-white font-bold text-xs rounded-xl hover:bg-primary-hover transition-colors"
        >
          View Leaderboard →
        </button>
      </div>
    );
  }

  const {
    userLeague,
    userGroup,
    cohortSize,
    currentRank,
    weeklyXp,
    movement,
    timeRemainingSeconds,
    promotionZone,
  } = data;

  const getStatusBadge = () => {
    if (movement === 'PROMOTE') {
      return (
        <span className="px-2.5 py-1 rounded-md bg-emerald-100 text-emerald-900 border border-emerald-300 text-[11px] font-black flex items-center gap-1">
          <span>▲</span> Promotion Zone
        </span>
      );
    }
    if (movement === 'DEMOTE') {
      return (
        <span className="px-2.5 py-1 rounded-md bg-rose-100 text-rose-900 border border-rose-300 text-[11px] font-black flex items-center gap-1">
          <span>▼</span> Demotion Zone
        </span>
      );
    }
    if (movement === 'STAY') {
      return (
        <span className="px-2.5 py-1 rounded-md bg-slate-100 text-slate-800 border border-slate-300 text-[11px] font-black flex items-center gap-1">
          <span>—</span> Safe Zone
        </span>
      );
    }
    return (
      <span className="px-2.5 py-1 rounded-md bg-slate-100 text-slate-800 border border-slate-300 text-[11px] font-black flex items-center gap-1">
        <span>—</span> Safe Zone
      </span>
    );
  };

  return (
    <div
      id="weekly-league-dashboard-card"
      className="bg-surface rounded-2xl p-5 border border-border shadow-xs space-y-4 hover:border-amber-300 transition-all"
    >
      {/* Header */}
      <div className="flex items-center justify-between">
        <button
          onClick={() => onNavigateTab('leaderboard')}
          className="group flex items-center gap-1.5 text-xs font-extrabold uppercase tracking-wider text-text-primary hover:text-sky-700 transition-colors"
        >
          <Trophy className="w-4 h-4 text-amber-500" />
          <span>Weekly League</span>
          <ChevronRight className="w-3.5 h-3.5 text-slate-400 group-hover:translate-x-0.5 transition-transform" />
        </button>
      </div>

      {/* Primary Card Body */}
      <div className="flex items-center gap-4 bg-app-bg p-3.5 rounded-xl border border-border">
        <LeagueEmblem tier={userLeague} size="md" showGlow={true} />

        <div className="space-y-1 min-w-0 flex-1">
          <div className="flex items-center justify-between">
            <h4 className="text-base font-black text-text-primary font-['Outfit'] tracking-tight">
              {userLeague.toUpperCase()}
            </h4>
            <span className="text-xs font-black text-slate-900 font-mono">
              Rank #{currentRank || '-'}
            </span>
          </div>

          <div className="flex items-center justify-between text-xs">
            <span className="text-text-muted font-medium">Weekly XP:</span>
            <span className="font-extrabold text-amber-600 font-mono">
              {weeklyXp.toLocaleString()} XP
            </span>
          </div>
        </div>
      </div>

      {/* Status Zone & Countdown */}
      <div className="flex items-center justify-between gap-2 pt-0.5">
        {getStatusBadge()}

        <div className="flex items-center gap-1 text-[11px] font-semibold text-text-muted">
          <Clock className="w-3 h-3 text-slate-400" />
          <span>{formatCountdown(timeRemainingSeconds)}</span>
        </div>
      </div>

      {/* CTA Button */}
      <button
        onClick={() => onNavigateTab('leaderboard')}
        className="w-full py-2.5 bg-primary hover:bg-primary-hover text-white font-bold text-xs rounded-xl shadow-xs transition-all flex items-center justify-center gap-1.5"
      >
        <span>View Full Weekly League</span>
        <ChevronRight className="w-3.5 h-3.5" />
      </button>
    </div>
  );
};
