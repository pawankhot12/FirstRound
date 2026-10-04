import React, { useEffect, useState } from 'react';
import {
  Award,
  CheckCircle2,
  ChevronRight,
  Clock,
  Crown,
  Flame,
  Globe,
  Info,
  Layers,
  Medal,
  RefreshCw,
  Sparkles,
  Target,
  Trophy,
  Users,
  Zap,
} from 'lucide-react';
import { LeaderboardEntry } from '../types';
import { LeagueEmblem, LeagueTierName } from './LeagueEmblem';
import { apiGetCurrentLeague, apiGetNationalLeague } from '../api';

interface LeaderboardViewProps {
  leaderboard?: LeaderboardEntry[];
  currentUserId?: string;
  currentUser?: any;
  onNavigateTab?: (tab: string) => void;
}

const LEAGUE_TIERS_LIST: LeagueTierName[] = [
  'Bronze',
  'Silver',
  'Gold',
  'Platinum',
  'Diamond',
  'Heroic',
  'Elite Heroic',
  'Master',
  'Elite Master',
];

export const LeaderboardView: React.FC<LeaderboardViewProps> = ({
  currentUserId,
  currentUser,
  onNavigateTab,
}) => {
  const [activeTab, setActiveTab] = useState<'league' | 'national'>('league');

  // Weekly League Data State
  const [leagueData, setLeagueData] = useState<any>(null);
  const [leagueLoading, setLeagueLoading] = useState(true);
  const [leagueError, setLeagueError] = useState<string | null>(null);

  // National Ranking Data State
  const [nationalData, setNationalData] = useState<any>(null);
  const [nationalLoading, setNationalLoading] = useState(true);
  const [nationalError, setNationalError] = useState<string | null>(null);
  const [filterCompany, setFilterCompany] = useState('all');

  // Load Weekly League
  const loadWeeklyLeague = () => {
    setLeagueLoading(true);
    setLeagueError(null);
    apiGetCurrentLeague(currentUserId || '')
      .then((data) => {
        setLeagueData(data);
        setLeagueLoading(false);
      })
      .catch((err) => {
        setLeagueError(err.message || 'Failed to load weekly league info');
        setLeagueLoading(false);
      });
  };

  // Load National Ranking
  const loadNationalRanking = (company = filterCompany) => {
    setNationalLoading(true);
    setNationalError(null);
    apiGetNationalLeague(currentUserId, company)
      .then((data) => {
        setNationalData(data);
        setNationalLoading(false);
      })
      .catch((err) => {
        setNationalError(err.message || 'Failed to load national ranking');
        setNationalLoading(false);
      });
  };

  useEffect(() => {
    loadWeeklyLeague();
  }, [currentUserId]);

  useEffect(() => {
    if (activeTab === 'national') {
      loadNationalRanking(filterCompany);
    }
  }, [activeTab, filterCompany, currentUserId]);

  // Countdown timer calculation
  const formatCountdown = (totalSeconds: number) => {
    if (totalSeconds <= 0) return 'Season ending now';
    const days = Math.floor(totalSeconds / 86400);
    const hours = Math.floor((totalSeconds % 86400) / 3600);
    const mins = Math.floor((totalSeconds % 3600) / 60);

    if (days > 0) return `${days}d ${hours}h remaining`;
    if (hours > 0) return `${hours}h ${mins}m remaining`;
    return `${mins}m remaining`;
  };

  return (
    <div className="space-y-6 pb-16">
      {/* Top Main Navigation Tabs: WEEKLY LEAGUE vs ALL-INDIA RANKING */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-4 border-b border-border pb-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-black text-text-primary font-['Outfit'] flex items-center gap-2.5">
            <Trophy className="w-7 h-7 text-amber-500" />
            <span>Competitive Leaderboards</span>
          </h1>
          <p className="text-xs sm:text-sm text-text-muted mt-0.5">
            Weekly 40-player league divisions & nationwide All-India placement rankings.
          </p>
        </div>

        {/* Tab Switcher Buttons */}
        <div className="flex items-center gap-1.5 p-1 bg-surface-hover border border-border rounded-xl">
          <button
            onClick={() => setActiveTab('league')}
            className={`flex-1 sm:flex-none px-4 py-2 text-xs font-extrabold rounded-lg transition-all flex items-center justify-center gap-2 ${
              activeTab === 'league'
                ? 'bg-primary text-white shadow-sm'
                : 'text-text-secondary hover:text-slate-900 hover:bg-slate-200'
            }`}
          >
            <Zap className="w-4 h-4 text-amber-400 fill-amber-400" />
            <span>Weekly League</span>
          </button>

          <button
            onClick={() => setActiveTab('national')}
            className={`flex-1 sm:flex-none px-4 py-2 text-xs font-extrabold rounded-lg transition-all flex items-center justify-center gap-2 ${
              activeTab === 'national'
                ? 'bg-primary text-white shadow-sm'
                : 'text-text-secondary hover:text-slate-900 hover:bg-slate-200'
            }`}
          >
            <Globe className="w-4 h-4 text-sky-400" />
            <span>🇮🇳 All-India Ranking</span>
          </button>
        </div>
      </div>

      {/* ========================================================= */}
      {/* TAB 1: WEEKLY LEAGUE (PRIMARY EXPERIENCE)                  */}
      {/* ========================================================= */}
      {activeTab === 'league' && (
        <div className="space-y-6">
          {leagueLoading ? (
            <div className="p-12 text-center bg-surface border border-border rounded-3xl space-y-4 animate-pulse">
              <div className="w-16 h-16 bg-slate-200 rounded-full mx-auto"></div>
              <div className="h-6 w-48 bg-slate-200 rounded mx-auto"></div>
              <div className="h-4 w-64 bg-slate-200 rounded mx-auto"></div>
            </div>
          ) : leagueError ? (
            <div className="p-8 text-center bg-surface border border-rose-200 rounded-3xl space-y-3">
              <Info className="w-8 h-8 text-rose-500 mx-auto" />
              <h3 className="text-base font-bold text-slate-800">Failed to load Weekly League</h3>
              <p className="text-xs text-slate-500 max-w-md mx-auto">{leagueError}</p>
              <button
                onClick={loadWeeklyLeague}
                className="px-4 py-2 bg-primary text-white text-xs font-bold rounded-xl inline-flex items-center gap-1.5"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                <span>Retry</span>
              </button>
            </div>
          ) : !leagueData ? (
            <div className="p-12 text-center bg-surface border border-border rounded-3xl space-y-3">
              <Trophy className="w-10 h-10 text-slate-300 mx-auto" />
              <h3 className="text-base font-bold text-slate-800">No Active Weekly Season</h3>
              <p className="text-xs text-text-muted">Complete 1 Exam assessment to enter your weekly 40-player league.</p>
            </div>
          ) : (
            <>
              {/* League Header Card */}
              <div className="bg-gradient-to-r from-slate-900 via-primary-dark to-slate-900 rounded-3xl p-6 sm:p-8 text-white border border-slate-800 shadow-xl relative overflow-hidden">
                <div className="flex flex-col md:flex-row items-center justify-between gap-6 relative z-10">
                  {/* Left Emblem & Tier Info */}
                  <div className="flex items-center gap-5 text-center sm:text-left">
                    <LeagueEmblem
                      tier={leagueData.userLeague}
                      size="xl"
                      showGlow={true}
                    />

                    <div className="space-y-1">
                      <div className="flex items-center gap-2 flex-wrap justify-center sm:justify-start">
                        <span className="px-2.5 py-0.5 rounded-full bg-amber-400 text-slate-950 font-black text-[10px] tracking-wider uppercase">
                          ACTIVE LEAGUE TIER
                        </span>
                      </div>

                      <h2 className="text-3xl sm:text-4xl font-black text-white font-['Outfit'] tracking-tight">
                        {leagueData.userLeague} League
                      </h2>

                      <p className="text-xs text-slate-300 flex items-center gap-3 justify-center sm:justify-start pt-1">
                        <span className="font-bold text-amber-400">
                          Compete this week. Earn XP. Climb the ranks.
                        </span>
                        <span>•</span>
                        <span className="flex items-center gap-1">
                          <Clock className="w-3.5 h-3.5 text-amber-400" />
                          {formatCountdown(leagueData.timeRemainingSeconds)}
                        </span>
                      </p>
                    </div>
                  </div>

                  {/* Right User League Stat Metrics */}
                  <div className="grid grid-cols-3 gap-3 bg-slate-900/80 p-4 rounded-2xl border border-slate-700/80 w-full md:w-auto text-center">
                    <div className="p-2">
                      <p className="text-[10px] uppercase font-bold text-slate-400">Your Rank</p>
                      <p className="text-xl sm:text-2xl font-black text-white font-mono mt-0.5">
                        #{leagueData.currentRank || '-'}
                      </p>
                      <p className="text-[10px] text-slate-400">Weekly Standing</p>
                    </div>

                    <div className="p-2 border-x border-slate-800">
                      <p className="text-[10px] uppercase font-bold text-slate-400">Weekly XP</p>
                      <p className="text-xl sm:text-2xl font-black text-amber-400 font-mono mt-0.5">
                        {leagueData.weeklyXp.toLocaleString()}
                      </p>
                      <p className="text-[10px] text-slate-400">Exam Mode</p>
                    </div>

                    <div className="p-2">
                      <p className="text-[10px] uppercase font-bold text-slate-400">Status</p>
                      <div className="mt-1">
                        {leagueData.movement === 'PROMOTE' && (
                          <span className="px-2 py-1 bg-emerald-500/20 text-emerald-400 border border-emerald-500/40 rounded text-[11px] font-black">
                            ▲ PROMOTE
                          </span>
                        )}
                        {leagueData.movement === 'STAY' && (
                          <span className="px-2 py-1 bg-slate-500/20 text-slate-300 border border-slate-500/40 rounded text-[11px] font-black">
                            — STAY
                          </span>
                        )}
                        {leagueData.movement === 'DEMOTE' && (
                          <span className="px-2 py-1 bg-rose-500/20 text-rose-400 border border-rose-500/40 rounded text-[11px] font-black">
                            ▼ DEMOTE
                          </span>
                        )}
                        {leagueData.movement === 'PENDING' && (
                          <span className="px-2 py-1 bg-amber-500/20 text-amber-300 border border-amber-500/40 rounded text-[11px] font-black">
                            ⏳ PENDING
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                </div>

                {/* Tier Progression Bar */}
                <div className="mt-6 pt-5 border-t border-slate-800/80">
                  <p className="text-[10px] uppercase font-extrabold tracking-wider text-slate-400 mb-3 text-center sm:text-left">
                    LEAGUE TIER PROGRESSION
                  </p>

                  <div className="grid grid-cols-9 gap-1 sm:gap-2">
                    {LEAGUE_TIERS_LIST.map((tName) => {
                      const isCurrent = tName.toLowerCase() === leagueData.userLeague.toLowerCase();
                      return (
                        <div
                          key={tName}
                          className={`p-1.5 sm:p-2.5 rounded-xl border text-center transition-all flex flex-col items-center gap-1 ${
                            isCurrent
                              ? 'bg-amber-400/20 border-amber-400 text-white shadow-sm ring-2 ring-amber-400/30'
                              : 'bg-slate-900/40 border-slate-800 text-slate-400 opacity-60 hover:opacity-100'
                          }`}
                        >
                          <LeagueEmblem tier={tName} size="xs" showGlow={isCurrent} />
                          <span className="text-[9px] sm:text-[10px] font-extrabold truncate w-full">
                            {tName}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>

              {/* Weekly Cohort Standings Table */}
              <div className="bg-surface border border-border rounded-2xl overflow-hidden shadow-sm space-y-0">
                <div className="p-4 bg-app-bg border-b border-border flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2">
                  <div>
                    <h3 className="text-base font-bold text-text-primary">
                      Weekly League Standings
                    </h3>
                    <p className="text-xs text-text-muted">
                      Compete this week. Earn XP strictly by completing Exam assessments.
                    </p>
                  </div>

                  <div className="flex items-center gap-3 text-xs font-extrabold">
                    <span className="flex items-center gap-1 text-emerald-600">
                      <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
                      Top 8 Promote
                    </span>
                    <span className="flex items-center gap-1 text-slate-500">
                      <span className="w-2 h-2 rounded-full bg-slate-400"></span>
                      Mid 24 Stay
                    </span>
                    <span className="flex items-center gap-1 text-rose-600">
                      <span className="w-2 h-2 rounded-full bg-rose-500"></span>
                      Bottom 8 Demote
                    </span>
                  </div>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs text-slate-700">
                    <thead className="bg-app-bg border-b border-border text-[11px] uppercase font-extrabold text-text-muted tracking-wider">
                      <tr>
                        <th className="py-3 px-4 text-center">Rank</th>
                        <th className="py-3 px-4">Candidate</th>
                        <th className="py-3 px-4 text-center">Status</th>
                        <th className="py-3 px-4 text-right">Weekly XP</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {leagueData.standings && leagueData.standings.length > 0 ? (
                        leagueData.standings.map((member: any, idx: number) => {
                          const rank = idx + 1;
                          const isCurrentUser = member.userId === currentUserId;

                          // Compute Zone type for member
                          const isPromotionZone = rank <= 8;
                          const isDemotionZone = rank >= 33;

                          return (
                            <React.Fragment key={member.userId}>
                              {/* Promotion Zone Divider line after Rank 8 */}
                              {rank === 9 && (
                                <tr className="bg-emerald-50/80 border-y-2 border-emerald-400 text-[10px] font-black text-emerald-900">
                                  <td colSpan={4} className="py-1.5 px-4 text-center tracking-wider uppercase">
                                    ▲ PROMOTION ZONE CUTOFF (RANKS 1–8 PROMOTE TO NEXT TIER)
                                  </td>
                                </tr>
                              )}

                              {/* Demotion Zone Divider line before Rank 33 */}
                              {rank === 33 && (
                                <tr className="bg-rose-50/80 border-y-2 border-rose-400 text-[10px] font-black text-rose-900">
                                  <td colSpan={4} className="py-1.5 px-4 text-center tracking-wider uppercase">
                                    ▼ DEMOTION ZONE CUTOFF (RANKS 33–40 DEMOTE TO LOWER TIER)
                                  </td>
                                </tr>
                              )}

                              <tr
                                className={`transition-colors ${
                                  isCurrentUser
                                    ? 'bg-amber-50/80 font-bold border-l-4 border-l-amber-400'
                                    : isPromotionZone
                                    ? 'hover:bg-emerald-50/30'
                                    : isDemotionZone
                                    ? 'hover:bg-rose-50/30'
                                    : 'hover:bg-app-bg'
                                }`}
                              >
                                <td className="py-3 px-4 text-center">
                                  <span
                                    className={`inline-flex items-center justify-center w-7 h-7 rounded-xl font-extrabold text-xs font-mono ${
                                      rank === 1
                                        ? 'bg-amber-400 text-slate-950 shadow-xs'
                                        : rank === 2
                                        ? 'bg-slate-200 text-slate-800'
                                        : rank === 3
                                        ? 'bg-amber-100 text-amber-900 border border-amber-300'
                                        : 'bg-surface-hover text-text-secondary'
                                    }`}
                                  >
                                    {rank}
                                  </span>
                                </td>

                                <td className="py-3 px-4">
                                  <div className="flex items-center gap-2.5">
                                    <div className="w-8 h-8 rounded-lg bg-surface-hover border border-border text-xs font-extrabold text-slate-800 flex items-center justify-center shrink-0">
                                      {member.userName ? member.userName.charAt(0) : 'C'}
                                    </div>
                                    <div className="flex items-center gap-1.5">
                                      <p className="font-bold text-text-primary">
                                        {member.userName || 'Candidate'}
                                      </p>
                                      {isCurrentUser && (
                                        <span className="text-[10px] font-black px-1.5 py-0.2 rounded bg-amber-400 text-slate-950">
                                          YOU
                                        </span>
                                      )}
                                    </div>
                                  </div>
                                </td>

                                <td className="py-3 px-4 text-center">
                                  {isPromotionZone ? (
                                    leagueData.userLeague === 'Elite Master' ? (
                                      <span className="text-[11px] font-bold text-slate-600 bg-slate-100 px-2.5 py-1 rounded-md border border-slate-200">
                                        — STAY
                                      </span>
                                    ) : (
                                      <span className="text-[11px] font-black text-emerald-700 bg-emerald-50 px-2.5 py-1 rounded-md border border-emerald-200">
                                        ▲ PROMOTE
                                      </span>
                                    )
                                  ) : isDemotionZone ? (
                                    leagueData.userLeague === 'Bronze' ? (
                                      <span className="text-[11px] font-bold text-slate-600 bg-slate-100 px-2.5 py-1 rounded-md border border-slate-200">
                                        — STAY
                                      </span>
                                    ) : (
                                      <span className="text-[11px] font-black text-rose-700 bg-rose-50 px-2.5 py-1 rounded-md border border-rose-200">
                                        ▼ DEMOTE
                                      </span>
                                    )
                                  ) : (
                                    <span className="text-[11px] font-bold text-slate-600 bg-slate-100 px-2.5 py-1 rounded-md border border-slate-200">
                                      — STAY
                                    </span>
                                  )}
                                </td>

                                <td className="py-3 px-4 text-right">
                                  <span className="text-sm font-extrabold text-amber-600 font-mono">
                                    {member.weeklyXp.toLocaleString()} XP
                                  </span>
                                </td>
                              </tr>
                            </React.Fragment>
                          );
                        })
                      ) : (
                        <tr>
                          <td colSpan={4} className="py-12 text-center text-text-muted">
                            No candidates in this weekly league yet.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </>
          )}
        </div>
      )}

      {/* ========================================================= */}
      {/* TAB 2: ALL-INDIA NATIONAL RANKING                          */}
      {/* ========================================================= */}
      {activeTab === 'national' && (
        <div className="space-y-6">
          {/* National Hero Banner */}
          <div className="rounded-3xl bg-slate-900 border border-slate-800 p-7 sm:p-10 text-center space-y-3 text-white shadow-xl relative overflow-hidden">
            <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-amber-400 text-slate-950 text-xs font-black shadow-xs">
              <span>🇮🇳</span>
              <span>ALL-INDIA RANKING</span>
            </div>

            <h2 className="text-3xl sm:text-4xl font-black text-white font-['Outfit'] tracking-tight">
              India's Placement Leaderboard
            </h2>

            <p className="text-xs sm:text-sm text-slate-300 max-w-2xl mx-auto leading-relaxed">
              See where you stand among candidates across India. Your rank is powered by your Lifetime XP.
            </p>

            {/* Unranked Banner Subtext */}
            {nationalData && nationalData.isUnranked && (
              <div className="mt-4 pt-4 border-t border-slate-800 max-w-md mx-auto">
                <div className="p-3.5 bg-slate-950/80 rounded-2xl border border-slate-800 text-center space-y-1">
                  <p className="text-xs font-black text-amber-400 uppercase tracking-wider">
                    You're not ranked yet
                  </p>
                  <p className="text-xs text-slate-300 font-medium">
                    Complete your first official placement assessment to enter the All-India Ranking.
                  </p>
                </div>
              </div>
            )}
          </div>

          {/* Personal National Position Card */}
          {nationalData && (
            <div id="personal-national-position-card" className="bg-surface rounded-2xl p-5 border border-border shadow-xs">
              {nationalData.isUnranked ? (
                <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
                  <div className="space-y-1 text-center sm:text-left">
                    <span className="px-2.5 py-1 rounded-md bg-amber-100 text-amber-900 border border-amber-300 text-[11px] font-black uppercase">
                      NOT RANKED YET
                    </span>
                    <h3 className="text-base font-extrabold text-text-primary pt-1">
                      Take your first official assessment
                    </h3>
                    <p className="text-xs text-text-muted">
                      Earn Lifetime XP on official placement exams to join candidates across India on the All-India Leaderboard.
                    </p>
                  </div>
                  {onNavigateTab && (
                    <button
                      onClick={() => onNavigateTab('explore')}
                      className="w-full sm:w-auto px-5 py-2.5 bg-primary hover:bg-primary-hover text-white text-xs font-bold rounded-xl shadow-xs transition-all shrink-0"
                    >
                      Take Placement Assessment →
                    </button>
                  )}
                </div>
              ) : (
                <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
                  <div className="flex items-center gap-4 text-center sm:text-left w-full sm:w-auto">
                    <div className="w-12 h-12 rounded-2xl bg-amber-400/20 border border-amber-400/40 text-amber-600 flex items-center justify-center shrink-0">
                      <Trophy className="w-6 h-6" />
                    </div>
                    <div>
                      <span className="text-[11px] font-black uppercase text-amber-600 tracking-wider">Your All-India Standing</span>
                      <h3 className="text-xl sm:text-2xl font-black text-text-primary font-mono tracking-tight">
                        {nationalData.userExactRank
                          ? `#${nationalData.userExactRank.toLocaleString()} Nationwide`
                          : (nationalData.userPercentile || 'Unranked')}
                      </h3>
                    </div>
                  </div>

                  <div className="flex items-center gap-4 sm:gap-6 border-t sm:border-t-0 sm:border-l border-border pt-3 sm:pt-0 sm:pl-6 w-full sm:w-auto justify-around sm:justify-end">
                    <div>
                      <p className="text-[10px] uppercase font-extrabold text-text-muted">Lifetime XP</p>
                      <p className="text-base sm:text-lg font-black text-amber-600 font-mono">
                        {(currentUser?.totalPoints ?? (nationalData.standings.find((s: any) => s.userId === currentUserId)?.totalPoints || 0)).toLocaleString()} XP
                      </p>
                    </div>
                    <div>
                      <p className="text-[10px] uppercase font-extrabold text-text-muted">Assessments</p>
                      <p className="text-base sm:text-lg font-black text-text-primary font-mono">
                        {currentUser?.totalTestsAttempted ?? (nationalData.standings.find((s: any) => s.userId === currentUserId)?.totalTestsAttempted || 0)} Completed
                      </p>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Company Filter Bar */}
          <div className="flex flex-col sm:flex-row items-center justify-between gap-3 bg-surface p-4 rounded-2xl border border-border shadow-xs">
            <div className="flex items-center gap-2">
              <Trophy className="w-4 h-4 text-amber-500" />
              <span className="text-xs font-bold text-text-primary">Filter by Company:</span>
            </div>

            <div className="flex items-center gap-1.5 w-full sm:w-auto justify-end overflow-x-auto pb-1 sm:pb-0">
              {['all', 'tcs', 'infosys', 'accenture', 'capgemini', 'wipro', 'cognizant'].map((c) => (
                <button
                  key={c}
                  onClick={() => setFilterCompany(c)}
                  className={`px-3 py-1.5 text-xs font-bold uppercase rounded-lg transition-all ${
                    filterCompany === c
                      ? 'bg-primary text-white shadow-xs'
                      : 'bg-surface-hover text-text-secondary hover:bg-slate-200'
                  }`}
                >
                  {c}
                </button>
              ))}
            </div>
          </div>

          {/* National Standings Table */}
          {nationalLoading ? (
            <div className="p-12 text-center bg-surface border border-border rounded-2xl space-y-4 animate-pulse">
              <div className="h-6 w-48 bg-slate-200 rounded mx-auto"></div>
              <div className="h-4 w-64 bg-slate-200 rounded mx-auto"></div>
            </div>
          ) : nationalError ? (
            <div className="p-8 text-center bg-surface border border-rose-200 rounded-2xl space-y-3">
              <Info className="w-8 h-8 text-rose-500 mx-auto" />
              <h3 className="text-base font-bold text-text-primary">Failed to load National Rankings</h3>
              <p className="text-xs text-text-muted">{nationalError}</p>
            </div>
          ) : (
            <div className="bg-surface border border-border rounded-2xl overflow-hidden shadow-xs">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs text-slate-700">
                  <thead className="bg-app-bg border-b border-border text-[11px] uppercase font-extrabold text-text-muted tracking-wider">
                    <tr>
                      <th className="py-3.5 px-4 text-center">Rank</th>
                      <th className="py-3.5 px-4">Candidate</th>
                      <th className="py-3.5 px-4 text-center">Assessments</th>
                      <th className="py-3.5 px-4 text-right">Lifetime XP</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {nationalData && nationalData.standings && nationalData.standings.length > 0 ? (
                      nationalData.standings.map((entry: any) => {
                        const isCurrentUser = entry.userId === currentUserId;
                        const isPodium1 = entry.rank === 1;
                        const isPodium2 = entry.rank === 2;
                        const isPodium3 = entry.rank === 3;

                        return (
                          <tr
                            key={entry.userId}
                            className={`transition-colors ${
                              isCurrentUser
                                ? 'bg-amber-50/80 font-bold border-l-4 border-l-amber-400 text-slate-950'
                                : 'hover:bg-app-bg'
                            }`}
                          >
                            {/* Rank Column with Podium Styling */}
                            <td className="py-3.5 px-4 text-center">
                              {isPodium1 ? (
                                <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-xl bg-amber-400 text-slate-950 font-black text-xs shadow-xs">
                                  🥇 #1
                                </span>
                              ) : isPodium2 ? (
                                <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-xl bg-slate-200 text-slate-800 font-black text-xs">
                                  🥈 #2
                                </span>
                              ) : isPodium3 ? (
                                <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-xl bg-amber-100 text-amber-900 border border-amber-300 font-black text-xs">
                                  🥉 #3
                                </span>
                              ) : (
                                <span className="inline-flex items-center justify-center w-7 h-7 rounded-xl font-bold text-xs bg-surface-hover text-text-secondary font-mono">
                                  #{entry.rank}
                                </span>
                              )}
                            </td>

                            {/* Candidate Column */}
                            <td className="py-3.5 px-4">
                              <div className="flex items-center gap-2.5">
                                <div className="w-8 h-8 rounded-lg bg-surface-hover border border-border text-xs font-bold text-slate-800 flex items-center justify-center shrink-0">
                                  {entry.userName ? entry.userName.charAt(0) : 'C'}
                                </div>
                                <div className="flex items-center gap-1.5">
                                  <p className="font-bold text-text-primary">
                                    {entry.userName}
                                  </p>
                                  {isCurrentUser && (
                                    <span className="text-[10px] font-black px-1.5 py-0.2 rounded bg-amber-400 text-slate-950">
                                      YOU
                                    </span>
                                  )}
                                </div>
                              </div>
                            </td>

                            {/* Assessments Column */}
                            <td className="py-3.5 px-4 text-center font-bold text-slate-700">
                              {entry.totalTestsAttempted} Completed
                            </td>

                            {/* Lifetime XP Column */}
                            <td className="py-3.5 px-4 text-right">
                              <span className="text-sm font-extrabold text-amber-600 font-mono">
                                {entry.totalPoints.toLocaleString()} XP
                              </span>
                            </td>
                          </tr>
                        );
                      })
                    ) : (
                      <tr>
                        <td colSpan={4} className="py-12 px-4 text-center text-text-muted">
                          <Trophy className="w-8 h-8 text-slate-300 mx-auto mb-2" />
                          <p className="font-bold text-sm text-text-primary">No candidates ranked yet</p>
                          <p className="text-xs text-text-muted mt-1">
                            Complete a placement assessment to claim your national standing.
                          </p>
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
