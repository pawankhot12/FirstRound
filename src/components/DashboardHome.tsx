import React, { useState, useEffect } from 'react';
import {
  ArrowRight,
  BookOpen,
  Building2,
  Calculator,
  Check,
  CheckCircle2,
  ChevronRight,
  Circle,
  Clock,
  Crown,
  Edit3,
  FileText,
  Flame,
  Layers,
  MapPin,
  Play,
  RotateCcw,
  Sparkles,
  Target,
  Trophy,
  Zap,
} from 'lucide-react';
import {
  BookmarkedItem,
  LeaderboardEntry,
  NavTab,
  TestAttempt,
  TestMode,
  TestSeries,
  UserProfile,
  WeakQuestionItem,
  Advertisement,
} from '../types';
import { HomeSearchBar } from './HomeSearchBar';
import { recommendationEngine } from '../services/RecommendationEngine';
import { apiGetTestHistory } from '../api';
import { WeeklyLeagueCard } from './WeeklyLeagueCard';
import { SponsorAdCard } from './SponsorAdCard';
import { SponsorAdSlot } from './SponsorAdSlot';
import { TopSponsorAdSlot } from './TopSponsorBanner';

interface DashboardHomeProps {
  currentUser: UserProfile | null;
  tests: TestSeries[];
  weakQuestions: WeakQuestionItem[];
  bookmarkedItems: BookmarkedItem[];
  userAttempts: TestAttempt[];
  leaderboard: LeaderboardEntry[];
  onStartTest: (test: TestSeries, mode: TestMode) => void;
  onNavigateTab: (tab: NavTab) => void;
  onOpenScratchpad: () => void;
  onOpenProfile: () => void;
  onViewAttemptReport?: (attempt: TestAttempt) => void;
}

interface TargetTestStatus {
  testId: string;
  status: 'not_started' | 'in_progress' | 'completed';
  progressPercentage: number;
  answeredCount: number;
  totalQuestions: number;
  latestAttempt?: TestAttempt;
}

export const DashboardHome: React.FC<DashboardHomeProps> = ({
  currentUser,
  tests,
  weakQuestions,
  bookmarkedItems,
  userAttempts,
  leaderboard,
  onStartTest,
  onNavigateTab,
  onOpenScratchpad,
  onOpenProfile,
  onViewAttemptReport,
}) => {
  const [testHistory, setTestHistory] = useState<any[]>([]);
  const [activeAds, setActiveAds] = useState<Advertisement[]>([]);
  const [topAds, setTopAds] = useState<Advertisement[]>([]);

  useEffect(() => {
    let isMounted = true;

    const loadDashAds = () => {
      // Fetch Dashboard Bottom / Sidebar Ads
      fetch('/api/advertisements/active?placement=DASHBOARD_SIDEBAR')
        .then((res) => res.json())
        .then((data) => {
          if (isMounted && data?.success) {
            if (Array.isArray(data.advertisements)) {
              setActiveAds(data.advertisements);
            } else if (data.advertisement) {
              setActiveAds([data.advertisement]);
            } else {
              setActiveAds([]);
            }
          } else if (isMounted) {
            setActiveAds([]);
          }
        })
        .catch(() => {
          if (isMounted) setActiveAds([]);
        });

      // Fetch Dashboard Top Ads
      fetch('/api/advertisements/active?placement=DASHBOARD_TOP')
        .then((res) => res.json())
        .then((data) => {
          if (isMounted && data?.success) {
            if (Array.isArray(data.advertisements)) {
              setTopAds(data.advertisements);
            } else if (data.advertisement) {
              setTopAds([data.advertisement]);
            } else {
              setTopAds([]);
            }
          } else if (isMounted) {
            setTopAds([]);
          }
        })
        .catch(() => {
          if (isMounted) setTopAds([]);
        });
    };

    loadDashAds();
    window.addEventListener('firstround:sponsors-updated', loadDashAds);

    return () => {
      isMounted = false;
      window.removeEventListener('firstround:sponsors-updated', loadDashAds);
    };
  }, []);

  useEffect(() => {
    if (currentUser?.id) {
      apiGetTestHistory(currentUser.id)
        .then(setTestHistory)
        .catch(console.error);
    }
  }, [currentUser?.id, userAttempts.length]);

  const getTestHistoryStatus = (testId: string) => {
    return testHistory.find(h => h.testId === testId);
  };

  // User Stats & Identity (strictly derived from authenticated user)
  const displayName = currentUser?.name || 'Candidate';
  const displayPoints = currentUser?.totalPoints ?? 0;
  const initial = displayName.charAt(0).toUpperCase();

  // Real Streak calculation based on distinct submission dates
  const attemptDates = Array.from(new Set(userAttempts.map((a) => a.submittedAt.split('T')[0])));
  const streakDays = attemptDates.length;

  // Level System based strictly on existing XP (totalPoints)
  const getLevelInfo = (xp: number) => {
    const thresholds = [0, 100, 250, 500, 1000, 2000, 3500, 5000, 7500, 10000];
    let level = 1;
    let nextLevelXp = thresholds[1];

    for (let i = 0; i < thresholds.length; i++) {
      if (xp >= thresholds[i]) {
        level = i + 1;
        nextLevelXp = thresholds[i + 1] || thresholds[thresholds.length - 1] + 5000;
      } else {
        break;
      }
    }

    if (xp >= thresholds[thresholds.length - 1]) {
      const excess = xp - thresholds[thresholds.length - 1];
      const extraLevels = Math.floor(excess / 5000);
      level = thresholds.length + extraLevels;
      nextLevelXp = thresholds[thresholds.length - 1] + (extraLevels + 1) * 5000;
    }

    return { level, currentXp: xp, nextLevelXp };
  };

  const levelInfo = getLevelInfo(displayPoints);


  // Real Leaderboard standing: only ranked if the user has completed eligible assessments and earned points
  const activeLeaderboardParticipants = leaderboard.filter((l) => l.totalPoints > 0);
  const userLeaderboardEntry = currentUser
    ? activeLeaderboardParticipants.find((l) => l.userId === currentUser.id)
    : null;
  const hasCompletedTests = userAttempts.length > 0;
  const isUserEligibleForRank = Boolean(
    userLeaderboardEntry && displayPoints > 0 && hasCompletedTests
  );

  const userRank = isUserEligibleForRank && userLeaderboardEntry ? userLeaderboardEntry.rank : null;
  const totalRankedCount = activeLeaderboardParticipants.length;
  const outperformingPercentile =
    userRank && totalRankedCount > 1
      ? Math.max(1, Math.min(99, Math.round(((totalRankedCount - userRank + 1) / totalRankedCount) * 100)))
      : null;

  // Placement Journey Milestones derived strictly from authentic user data
  const completedAssessmentsCount = userAttempts.length;
  const latestUserAttempt = userAttempts.length > 0 ? userAttempts[0] : null;

  const m1Complete = completedAssessmentsCount >= 1;
  const m2Complete = completedAssessmentsCount >= 1 && latestUserAttempt !== null;
  const m3Complete = completedAssessmentsCount >= 3;
  const m3Progress = Math.min(completedAssessmentsCount, 3);

  const totalWeakCount = weakQuestions.length;
  const masteredWeakCount = weakQuestions.filter((q) => q.isMastered).length;
  const hasWeakAreaEvidence = completedAssessmentsCount > 0 && totalWeakCount > 0;
  const m4Complete =
    hasWeakAreaEvidence &&
    masteredWeakCount > 0 &&
    masteredWeakCount >= Math.min(3, totalWeakCount);
  const m4InProgress = hasWeakAreaEvidence && !m4Complete;

  const m5Complete = levelInfo.level >= 5;

  const journeyCompletedCount = [
    m1Complete,
    m2Complete,
    m3Complete,
    m4Complete,
    m5Complete,
  ].filter(Boolean).length;

  // -------------------------------------------------------------
  // CANONICAL RECOMMENDATION ENGINE INTEGRATION
  // -------------------------------------------------------------
  const rankedRecommendations = recommendationEngine.rankAssessments(
    tests,
    currentUser,
    userAttempts,
    weakQuestions
  );

  const primaryRecommendation = rankedRecommendations.length > 0 ? rankedRecommendations[0] : null;
  const targetTest: TestSeries | undefined = primaryRecommendation?.test || tests[0];

  // Concept B & C: Target Placement Test Status & Unfinished Attempt (strictly scoped to targetTest.id + currentUser.id)
  const targetTestStatus: TargetTestStatus = (() => {
    if (!targetTest || !currentUser) {
      return {
        testId: targetTest?.id || '',
        status: 'not_started',
        progressPercentage: 0,
        answeredCount: 0,
        totalQuestions: targetTest?.totalQuestions || 10,
      };
    }

    const targetId = targetTest.id;
    const totalQuestions = targetTest.totalQuestions || 10;

    // 1. Check for real unfinished draft saved in localStorage for this exact user and test
    const storageKey = `firstround_progress_${currentUser.id}_${targetId}`;
    let savedProgress: any = null;
    try {
      const raw = localStorage.getItem(storageKey);
      if (raw) savedProgress = JSON.parse(raw);
    } catch {}

    const answeredCount =
      savedProgress?.answeredCount ||
      (savedProgress?.selectedAnswers
        ? Object.values(savedProgress.selectedAnswers).filter(Boolean).length
        : 0);

    if (
      savedProgress &&
      (answeredCount > 0 || (savedProgress.elapsedSeconds && savedProgress.elapsedSeconds > 0))
    ) {
      const progressPct = Math.min(100, Math.round((answeredCount / totalQuestions) * 100));
      return {
        testId: targetId,
        status: 'in_progress',
        progressPercentage: progressPct,
        answeredCount,
        totalQuestions,
      };
    }

    // 2. Check for completed attempts matching THIS EXACT target test ID
    const targetAttempts = userAttempts.filter(
      (a) => a.testSeriesId === targetId || (a as any).testId === targetId
    );

    if (targetAttempts.length > 0) {
      const latest = targetAttempts[0];
      return {
        testId: targetId,
        status: 'completed',
        progressPercentage: 100,
        answeredCount: latest.attemptedQuestions || latest.totalQuestions || totalQuestions,
        totalQuestions: latest.totalQuestions || totalQuestions,
        latestAttempt: latest,
      };
    }

    // 3. Never started
    return {
      testId: targetId,
      status: 'not_started',
      progressPercentage: 0,
      answeredCount: 0,
      totalQuestions,
    };
  })();

  // -------------------------------------------------------------
  // ADAPTIVE SPRINT TRACK ENGINE (Strictly derived from real activity)
  // -------------------------------------------------------------
  
  const renderHistoryBadge = (testId: string) => {
    const history = getTestHistoryStatus(testId);
    if (!history) return null;
    if (history.status === 'COMPLETED') {
      return (
        <span className="hidden sm:inline-block px-2 py-0.5 bg-emerald-100 text-emerald-700 rounded text-[10px] font-bold border border-emerald-200">
          ✓ Completed
        </span>
      );
    }
    if (history.status === 'IN_PROGRESS') {
      return (
        <span className="hidden sm:inline-block px-2 py-0.5 bg-amber-100 text-amber-700 rounded text-[10px] font-bold border border-amber-200">
          ● In Progress
        </span>
      );
    }
    if (history.status === 'VISITED') {
      return (
        <span className="hidden sm:inline-block px-2 py-0.5 bg-surface-hover text-text-muted rounded text-[10px] font-bold border border-border">
          Visited
        </span>
      );
    }
    return null;
  };

  const sprintSteps = recommendationEngine.getSprintTrack(
    tests,
    currentUser,
    userAttempts,
    weakQuestions
  );

  const focusAreas = recommendationEngine.getFocusAreas(tests, userAttempts, weakQuestions);

  // Resolve Adaptive Sprint Track Test & Subtitle based on real user state
  let sprintTrackSubtitle = 'FOUNDATIONAL SPRINT TRACK';
  let sprintTrackReason = primaryRecommendation?.reason || 'Benchmark your aptitude speed across core quantitative and logical reasoning patterns.';
  let trackTest: TestSeries | undefined = sprintSteps.length > 1 ? sprintSteps[1].test : (sprintSteps[0]?.test || tests[1]);

  if (focusAreas.length > 0) {
    sprintTrackSubtitle = 'ADAPTIVE WEAKNESS SPRINT';
    sprintTrackReason = `Targeted for accuracy improvement in ${focusAreas[0].topic} (${focusAreas[0].weaknessCount} weak question${focusAreas[0].weaknessCount > 1 ? 's' : ''} recorded in Vault).`;
    if (focusAreas[0].recommendedTest) {
      trackTest = focusAreas[0].recommendedTest;
    }
  } else if (targetTestStatus.status === 'completed') {
    sprintTrackSubtitle = 'NEXT-LEVEL SPEED DRILL';
    sprintTrackReason = 'Target test completed! Challenge your problem-solving speed with this recommended follow-up track.';
  } else if (currentUser?.targetRole) {
    sprintTrackSubtitle = 'ROLE-SPECIFIC SPRINT TRACK';
    sprintTrackReason = `Curated foundational practice specifically for your desired role: ${currentUser.targetRole}.`;
  }

  // Recommended mock tests list (Featured Tests) - derived canonically
  const featuredTests = rankedRecommendations
    .filter((r) => r.test.id !== targetTest?.id && r.test.id !== trackTest?.id)
    .map((r) => r.test)
    .slice(0, 5);

  const isTargetTestCompanyMatch = Boolean(
    currentUser?.targetCompany &&
      targetTest &&
      (targetTest.companyName?.toLowerCase().includes(currentUser.targetCompany.toLowerCase()) ||
        targetTest.companyId?.toLowerCase() === currentUser.targetCompany.toLowerCase() ||
        targetTest.company?.toLowerCase() === currentUser.targetCompany.toLowerCase())
  );

  const isTargetTestRoleMatch = Boolean(
    currentUser?.targetRole &&
      targetTest &&
      (targetTest.supportedRoles?.some((r) =>
        r.toLowerCase().includes(currentUser.targetRole!.toLowerCase())
      ) ||
        targetTest.skills?.some((s) =>
          s.toLowerCase().includes(currentUser.targetRole!.toLowerCase())
        ) ||
        targetTest.topics?.some((top) =>
          top.toLowerCase().includes(currentUser.targetRole!.toLowerCase())
        ))
  );

  return (
    <div className="space-y-8 pb-16">
      {/* Top Scoped Home Search Bar */}
      <div className="w-full">
        <HomeSearchBar
          tests={tests}
          onStartTest={onStartTest}
          onNavigateTab={onNavigateTab}
        />
      </div>

      {/* Adaptive Guidance Alert Strip (Real User Guidance) */}
      <div
        id="home-guidance-strip"
        className="p-4 rounded-2xl bg-gradient-to-r from-slate-900 to-primary text-white border border-primary-hover shadow-2xs flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3"
      >
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-xl bg-amber-400/20 text-amber-400 border border-amber-400/30 flex items-center justify-center shrink-0">
            <Sparkles className="w-4 h-4" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-extrabold uppercase tracking-wider text-amber-400">
                RECOMMENDED NEXT STEP
              </span>
              {currentUser?.targetCompany && (
                <span className="text-[10px] text-slate-300 font-medium hidden sm:inline">
                  • Target: {currentUser.targetCompany}
                </span>
              )}
            </div>
            <p className="text-xs text-slate-200 mt-0.5">
              {targetTestStatus.status === 'in_progress' ? (
                <span>
                  You have an unfinished assessment in progress for <strong className="text-white">{targetTest?.title}</strong> ({targetTestStatus.answeredCount}/{targetTestStatus.totalQuestions} Qs). Continue to finalize your score.
                </span>
              ) : targetTestStatus.status === 'completed' ? (
                weakQuestions.length > 0 ? (
                  <span>
                    Target test completed! Review your <strong className="text-amber-400">{weakQuestions.length} missed concepts</strong> in Revision Vault or take the adaptive weakness sprint below.
                  </span>
                ) : (
                  <span>
                    Target test completed with great accuracy! Keep your momentum active by testing your speed on advanced company tracks.
                  </span>
                )
              ) : (
                targetTestStatus.status === 'not_started' && currentUser?.targetCompany && !isTargetTestCompanyMatch && isTargetTestRoleMatch ? (
                  <span>
                    No {currentUser?.targetCompany}-specific test yet. Prepare for the <strong className="text-white">{currentUser?.targetRole}</strong> role with this assessment meanwhile.
                  </span>
                ) : (
                  <span>
                    Start your <strong className="text-white">{targetTest?.title || 'Target Placement Test'}</strong> to benchmark your baseline readiness and unlock your campus rank.
                  </span>
                )
              )}
            </p>
          </div>
        </div>

        <div className="shrink-0 flex items-center gap-2 w-full sm:w-auto">
          {targetTest?.status === 'coming_soon' ? (
            <div className="w-full sm:w-auto px-4 py-2 bg-slate-800/80 border border-slate-700 text-slate-400 font-bold text-xs rounded-xl flex items-center justify-center gap-1.5 cursor-not-allowed">
              <Clock className="w-3.5 h-3.5" />
              <span>Questions Pending</span>
            </div>
          ) : targetTestStatus.status === 'in_progress' && targetTest ? (
            <button
              onClick={() => onStartTest(targetTest, 'exam')}
              className="w-full sm:w-auto px-4 py-2 bg-amber-400 hover:bg-amber-300 text-slate-950 font-bold text-xs rounded-xl shadow-xs transition-all flex items-center justify-center gap-1.5"
            >
              <span>Continue Test</span>
              <Play className="w-3 h-3 fill-slate-950" />
            </button>
          ) : targetTestStatus.status === 'completed' && weakQuestions.length > 0 ? (
            <button
              onClick={() => onNavigateTab('vault')}
              className="w-full sm:w-auto px-4 py-2 bg-amber-400 hover:bg-amber-300 text-slate-950 font-bold text-xs rounded-xl shadow-xs transition-all flex items-center justify-center gap-1.5"
            >
              <Zap className="w-3 h-3 text-slate-950 fill-slate-950" />
              <span>Open Vault ({weakQuestions.length})</span>
            </button>
          ) : targetTest ? (
            <button
              onClick={() => onStartTest(targetTest, 'exam')}
              className="w-full sm:w-auto px-4 py-2 bg-amber-400 hover:bg-amber-300 text-slate-950 font-bold text-xs rounded-xl shadow-xs transition-all flex items-center justify-center gap-1.5"
            >
              <span>Start Assessment</span>
              <Play className="w-3 h-3 fill-slate-950" />
            </button>
          ) : null}
        </div>
      </div>

      {/* 2-Column Responsive Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* ========================================================= */}
        {/* LEFT / MAIN COLUMN (approx 8 of 12 cols on desktop)       */}
        {/* ========================================================= */}
        <div className="lg:col-span-8 space-y-6">
          {/* Section Header */}
          <div className="flex items-center justify-between">
            <button
              onClick={() => onNavigateTab('tests')}
              className="group flex items-center gap-1.5 text-lg font-bold text-text-primary hover:text-sky-700 transition-colors"
            >
              <Target className="w-5 h-5 text-sky-700" />
              <span>Practice & Placement Tests</span>
              <ChevronRight className="w-4 h-4 text-slate-400 group-hover:translate-x-0.5 transition-transform" />
            </button>

            <button
              onClick={() => onNavigateTab('tests')}
              className="text-xs font-semibold text-sky-700 hover:text-sky-800 hover:underline"
            >
              Explore All {tests.length} Tests →
            </button>
          </div>

          {/* Top Hero Cards Row (Featured Target Test + Sprint Track) */}
          <div className="grid grid-cols-1 md:grid-cols-12 gap-4">
            {/* Primary Navy Featured Test Card */}
            {targetTest && (
              <div
                id="target-placement-test-card"
                className="md:col-span-7 bg-primary rounded-2xl p-6 text-white border border-primary-hover relative overflow-hidden shadow-sm flex flex-col justify-between min-h-[220px]"
              >
                {/* Subtle background graphic */}
                <div className="absolute right-0 top-0 bottom-0 w-1/2 opacity-10 pointer-events-none">
                  <svg viewBox="0 0 200 200" className="w-full h-full text-white fill-current">
                    <path d="M40,-65.4C52.1,-58.3,62.3,-47.9,69.5,-35.3C76.7,-22.8,81,-8,79.9,6.4C78.8,20.8,72.4,34.8,63.1,46.3C53.8,57.7,41.7,66.6,28.2,71.2C14.7,75.7,-0.2,76,-15.1,72.6C-30,69.3,-45,62.4,-56.3,51.4C-67.6,40.4,-75.2,25.3,-77.4,9.6C-79.6,-6.1,-76.3,-22.4,-68,-35.6C-59.7,-48.7,-46.3,-58.7,-32.6,-64.8C-18.9,-71,-4.8,-73.3,4.7,-74.2C14.2,-75.1,28,-72.5,40,-65.4Z" />
                  </svg>
                </div>

                <div className="relative z-10 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] font-extrabold uppercase tracking-wider text-amber-400">
                      TARGET PLACEMENT TEST
                    </span>
                    <span className="text-[11px] font-semibold bg-surface/10 px-2 py-0.5 rounded-full text-slate-200">
                      {targetTest.companyName || targetTest.category}
                    </span>
                  </div>

                  <h3 className="text-xl font-bold tracking-tight text-white leading-snug">
                    {targetTest.title}
                  </h3>

                  {/* Progress & Duration Bar */}
                  <div className="pt-2">
                    <div className="flex items-center justify-between text-xs text-slate-300 mb-1.5 font-medium">
                      <div className="w-full bg-slate-700/60 rounded-full h-2 mr-3 overflow-hidden">
                        <div
                          className={`h-2 rounded-full transition-all duration-500 ${
                            targetTestStatus.status === 'completed'
                              ? 'bg-emerald-400'
                              : targetTestStatus.status === 'in_progress'
                              ? 'bg-amber-400'
                              : 'bg-slate-600'
                          }`}
                          style={{
                            width:
                            targetTestStatus.status === 'completed'
                              ? '100%'
                              : `${targetTestStatus.progressPercentage}%`,
                          }}
                        ></div>
                      </div>

                      <span
                        className={`font-bold whitespace-nowrap text-[11px] ${
                          targetTestStatus.status === 'completed'
                            ? 'text-emerald-400'
                            : targetTestStatus.status === 'in_progress'
                            ? 'text-amber-400'
                            : 'text-slate-400'
                        }`}
                      >
                        {targetTestStatus.status === 'completed'
                          ? `Completed • ${targetTestStatus.latestAttempt?.scorePoints ?? 0} pts`
                          : targetTestStatus.status === 'in_progress'
                          ? `${targetTestStatus.answeredCount}/${targetTestStatus.totalQuestions} Qs (${targetTestStatus.progressPercentage}%)`
                          : 'Ready to Start • 0%'}
                      </span>
                    </div>

                    <p className="text-xs text-slate-300 flex items-center gap-2">
                      <Clock className="w-3.5 h-3.5 text-amber-400" />
                      <span>
                        {targetTest.durationMinutes} mins • {targetTest.totalQuestions} Questions
                        {targetTestStatus.status === 'completed' && targetTestStatus.latestAttempt
                          ? ` • ${targetTestStatus.latestAttempt.accuracyPercentage}% Accuracy`
                          : ''}
                      </span>
                    </p>
                  </div>
                </div>

                {/* Conditional Actions based strictly on targetTestStatus */}
                <div className="relative z-10 pt-5 flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5 sm:gap-3">
                  {targetTest?.status === 'coming_soon' ? (
                    <div className="px-5 py-2.5 bg-slate-800/80 border border-slate-700 text-slate-400 font-bold text-xs rounded-xl flex items-center justify-center gap-2">
                      <Clock className="w-3.5 h-3.5" />
                      <span>Questions Pending</span>
                    </div>
                  ) : targetTestStatus.status === 'in_progress' ? (
                    <>
                      <button
                        id="target-test-continue-btn"
                        onClick={() => onStartTest(targetTest, 'exam')}
                        className="px-5 py-2.5 bg-amber-400 hover:bg-amber-300 text-slate-950 font-bold text-xs rounded-xl shadow-md transition-all flex items-center justify-center gap-2 transform active:scale-95"
                      >
                        <span>Continue Test</span>
                        <Play className="w-3.5 h-3.5 fill-slate-950" />
                      </button>

                      <button
                        id="target-test-practice-btn"
                        onClick={() => onStartTest(targetTest, 'practice')}
                        className="px-4 py-2.5 bg-primary-dark hover:bg-primary-hover border border-primary-active text-white font-semibold text-xs rounded-xl transition-colors flex items-center justify-center gap-1.5"
                      >
                        <Zap className="w-3.5 h-3.5 text-amber-400 fill-amber-400" />
                        <span>Practice Mode</span>
                      </button>
                    </>
                  ) : targetTestStatus.status === 'completed' ? (
                    <>
                      <button
                        id="target-test-retake-btn"
                        onClick={() => onStartTest(targetTest, 'exam')}
                        className="px-5 py-2.5 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-xs rounded-xl shadow-md transition-all flex items-center justify-center gap-2 transform active:scale-95"
                      >
                        <RotateCcw className="w-3.5 h-3.5" />
                        <span>Retake Test</span>
                      </button>

                      {onViewAttemptReport && targetTestStatus.latestAttempt ? (
                        <button
                          id="target-test-view-result-btn"
                          onClick={() => onViewAttemptReport(targetTestStatus.latestAttempt!)}
                          className="px-4 py-2.5 bg-primary-dark hover:bg-primary-hover border border-primary-active text-white font-semibold text-xs rounded-xl transition-colors flex items-center justify-center gap-1.5"
                        >
                          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                          <span>View Result</span>
                        </button>
                      ) : (
                        <button
                          id="target-test-practice-btn"
                          onClick={() => onStartTest(targetTest, 'practice')}
                          className="px-4 py-2.5 bg-primary-dark hover:bg-primary-hover border border-primary-active text-white font-semibold text-xs rounded-xl transition-colors flex items-center justify-center gap-1.5"
                        >
                          <Zap className="w-3.5 h-3.5 text-amber-400 fill-amber-400" />
                          <span>Practice Mode</span>
                        </button>
                      )}
                    </>
                  ) : (
                    <>
                      <button
                        id="target-test-start-btn"
                        onClick={() => onStartTest(targetTest, 'exam')}
                        className="px-5 py-2.5 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-xs rounded-xl shadow-md transition-all flex items-center justify-center gap-2 transform active:scale-95"
                      >
                        <span>Start Test</span>
                        <Play className="w-3.5 h-3.5 fill-slate-950" />
                      </button>

                      <button
                        id="target-test-practice-btn"
                        onClick={() => onStartTest(targetTest, 'practice')}
                        className="px-4 py-2.5 bg-primary-dark hover:bg-primary-hover border border-primary-active text-white font-semibold text-xs rounded-xl transition-colors flex items-center justify-center gap-1.5"
                      >
                        <Zap className="w-3.5 h-3.5 text-amber-400 fill-amber-400" />
                        <span>Practice Mode</span>
                      </button>
                    </>
                  )}
                </div>
              </div>
            )}

            {/* Adaptive Sprint Track Card */}
            {trackTest && (
              <div
                id="sprint-track-card"
                className="md:col-span-5 bg-surface rounded-2xl p-6 border border-border shadow-xs flex flex-col justify-between min-h-[220px] relative overflow-hidden group hover:border-slate-300 transition-all"
              >
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span
                      className={`text-[10px] font-extrabold uppercase tracking-wider ${
                        sprintTrackSubtitle.includes('WEAKNESS')
                          ? 'text-amber-700 bg-amber-50 px-2 py-0.5 rounded border border-amber-200'
                          : 'text-text-muted'
                      }`}
                    >
                      {sprintTrackSubtitle}
                    </span>
                    <span className="text-[10px] font-bold text-slate-400">
                      {trackTest.category}
                    </span>
                  </div>

                  <h4 className="text-lg font-bold text-text-primary group-hover:text-sky-700 transition-colors">
                    {trackTest.title}
                  </h4>

                  <p className="text-xs text-text-secondary line-clamp-2 leading-relaxed">
                    {sprintTrackReason || trackTest.description}
                  </p>
                </div>

                <div className="pt-4 border-t border-slate-100 flex items-center justify-between">
                  <div className="flex items-center gap-1.5 text-xs text-text-secondary font-medium">
                    <span className="px-2 py-0.5 bg-amber-50 text-amber-900 border border-amber-200 rounded font-bold text-[11px]">
                      {trackTest.difficulty}
                    </span>
                    <span>• {trackTest.totalQuestions} Qs</span>
                  </div>

                  {trackTest.status === 'coming_soon' ? (
                    <div className="px-3 py-1.5 bg-surface-hover text-slate-400 text-xs font-bold rounded-lg flex items-center gap-1.5 cursor-not-allowed">
                      <Clock className="w-3.5 h-3.5" />
                      <span>Coming Soon</span>
                    </div>
                  ) : (
                    <button
                      onClick={() => onStartTest(trackTest!, 'exam')}
                      className="text-xs font-bold text-sky-700 hover:text-sky-900 flex items-center gap-1 hover:underline"
                    >
                      <span>Start Track</span>
                      <ChevronRight className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Section 2: Review & Revision (Derived purely from real user weak questions) */}
          <div
            id="review-revision-section"
            className="bg-surface rounded-2xl p-6 border border-border shadow-xs space-y-4"
          >
            <div className="flex items-center justify-between">
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <h3 className="text-base font-bold text-text-primary">Review & Revision</h3>
                  {weakQuestions.length > 0 && (
                    <span className="px-2 py-0.5 bg-amber-500 text-white font-extrabold rounded-full text-xs">
                      {weakQuestions.length}
                    </span>
                  )}
                </div>
                <p className="text-xs text-text-muted">
                  {weakQuestions.length > 0
                    ? 'Targeted practice opportunities based on your recent mistakes and bookmarked concepts.'
                    : 'Build your preparation by taking your first assessment.'}
                </p>
              </div>

              {weakQuestions.length > 0 && (
                <button
                  onClick={() => onNavigateTab('vault')}
                  className="text-xs font-bold text-sky-700 hover:text-sky-900 hover:underline flex items-center gap-1"
                >
                  <span>All Practices in Vault</span>
                  <ChevronRight className="w-3.5 h-3.5" />
                </button>
              )}
            </div>

            {/* Real weak questions or intentional empty state */}
            {weakQuestions.length > 0 ? (
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-2">
                {weakQuestions.slice(0, 3).map((item, idx) => {
                  const targetTest =
                    tests.find((t) => t.id === item.question.testSeriesId) || tests[0];
                  return (
                    <div
                      key={`weak_${item.question.id}_${idx}`}
                      onClick={() => targetTest && onStartTest(targetTest, 'practice')}
                      className="bg-app-bg hover:bg-surface p-4 rounded-xl border border-border hover:border-amber-400/80 hover:shadow-sm transition-all cursor-pointer flex flex-col justify-between min-h-[110px] group"
                    >
                      <div className="space-y-1">
                        <span className="text-[10px] font-bold tracking-wider uppercase text-slate-400 group-hover:text-amber-600 transition-colors">
                          PRACTICE • #{idx + 1}
                        </span>
                        <h5 className="text-xs font-bold text-slate-800 group-hover:text-text-primary line-clamp-2">
                          {item.question.topic} ({item.timesFailed}x review)
                        </h5>
                      </div>

                      <div className="flex items-center justify-between text-[11px] text-sky-700 font-semibold pt-2">
                        <span className="text-slate-400 group-hover:text-text-secondary">
                          {item.question.difficulty}
                        </span>
                        <span className="group-hover:translate-x-0.5 transition-transform">
                          Solve →
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="py-8 px-4 rounded-xl bg-app-bg border border-dashed border-border text-center space-y-3">
                <BookOpen className="w-8 h-8 text-slate-300 mx-auto" />
                <div className="space-y-1">
                  <h4 className="text-sm font-bold text-slate-800">No revision activity yet.</h4>
                  <p className="text-xs text-text-muted max-w-md mx-auto">
                    Complete a test and your mistakes will automatically appear here for targeted
                    practice.
                  </p>
                </div>
                <button
                  onClick={() => onNavigateTab('tests')}
                  className="px-4 py-2 bg-primary hover:bg-primary-hover text-white text-xs font-bold rounded-xl shadow-xs transition-all inline-flex items-center gap-1.5"
                >
                  <span>Explore Practice Tests →</span>
                </button>
              </div>
            )}
          </div>

          {/* Section 3: Recommended Placement Mocks */}
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Building2 className="w-5 h-5 text-sky-700" />
                <h3 className="text-base font-bold text-text-primary">
                  Featured Placement Test Series
                </h3>
              </div>

              <button
                onClick={() => onNavigateTab('tests')}
                className="text-xs font-bold text-sky-700 hover:text-sky-900 hover:underline"
              >
                View All Tests →
              </button>
            </div>

            {/* List of Mock Test Items */}
            <div className="bg-surface rounded-2xl border border-border divide-y divide-slate-100 shadow-xs overflow-hidden">
              {featuredTests.map((test) => (
                <div
                  key={test.id}
                  className="p-4 sm:p-5 flex items-center justify-between gap-4 hover:bg-app-bg/80 transition-colors group"
                >
                  <div className="flex items-center gap-4 min-w-0">
                    <div className="w-10 h-10 rounded-xl bg-surface-hover group-hover:bg-amber-100/60 border border-border group-hover:border-amber-300 flex items-center justify-center text-slate-700 group-hover:text-amber-900 font-bold text-xs transition-colors shrink-0">
                      {test.companyId ? test.companyId.slice(0, 3).toUpperCase() : 'APT'}
                    </div>

                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <h4 className="text-sm font-bold text-text-primary group-hover:text-sky-700 transition-colors truncate">
                          {test.title}
                        </h4>
                        <span className="hidden sm:inline-block px-2 py-0.5 bg-surface-hover text-text-secondary rounded text-[10px] font-semibold">
                          {test.category}
                        </span>
                        {renderHistoryBadge(test.id)}
                      </div>
                      <p className="text-xs text-text-muted truncate max-w-md">
                        {test.description}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-3 shrink-0">
                    <div className="hidden sm:flex flex-col text-right text-xs text-slate-400">
                      <span className="font-semibold text-slate-700">{test.durationMinutes} mins</span>
                      <span>{test.totalQuestions} Questions</span>
                    </div>

                    {test.status === 'coming_soon' ? (
                      <div className="px-3.5 py-1.5 bg-surface-hover text-slate-400 font-bold text-xs rounded-lg flex items-center gap-1.5 cursor-not-allowed">
                        <Clock className="w-3.5 h-3.5" />
                        <span className="hidden sm:inline">Coming Soon</span>
                      </div>
                    ) : (
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => onStartTest(test, 'practice')}
                          className="px-3.5 py-1.5 bg-surface hover:bg-app-bg border border-border text-slate-700 font-bold text-xs rounded-lg transition-all"
                        >
                          Practice
                        </button>
                        <button
                          onClick={() => onStartTest(test, 'exam')}
                          className="px-3.5 py-1.5 bg-amber-400 hover:bg-amber-300 text-slate-950 font-bold text-xs rounded-lg transition-all shadow-xs"
                        >
                          Start Test
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Section 4: Dynamic Sponsor Advertisement Slot */}
          <SponsorAdSlot ads={activeAds} />
        </div>

        {/* ========================================================= */}
        {/* RIGHT COLUMN / SIDEBAR (approx 4 of 12 cols on desktop)   */}
        {/* ========================================================= */}
        <div className="lg:col-span-4 space-y-6">
          {/* Card 1: My Placement Profile */}
          <div
            id="user-profile-card"
            className="bg-surface rounded-2xl p-6 border border-border shadow-xs space-y-5"
          >
            <div className="flex items-center justify-between">
              <button
                onClick={onOpenProfile}
                className="group flex items-center gap-1 text-sm font-bold text-text-primary hover:text-sky-700 transition-colors"
              >
                <span>My Placement Profile</span>
                <ChevronRight className="w-4 h-4 text-slate-400 group-hover:translate-x-0.5 transition-transform" />
              </button>

              <button
                onClick={onOpenProfile}
                className="text-xs font-semibold text-text-muted hover:text-slate-800"
              >
                Edit
              </button>
            </div>

            <div className="flex items-center gap-4">
              <div className="w-14 h-14 rounded-full bg-primary border-2 border-amber-400 text-white flex items-center justify-center font-extrabold text-xl shadow-sm shrink-0">
                {initial}
              </div>

              <div className="space-y-0.5 min-w-0">
                <h4 className="text-base font-extrabold text-text-primary leading-tight truncate">
                  {displayName}
                </h4>
                <p className="text-xs text-text-muted truncate">
                  {currentUser?.targetCompany
                    ? `Target: ${currentUser.targetCompany}${currentUser.targetRole ? ` • ${currentUser.targetRole}` : ''}`
                    : 'Target company not set'}
                </p>
                {currentUser?.college && (
                  <p className="text-[11px] text-slate-400 truncate">{currentUser.college}</p>
                )}
              </div>
            </div>

            {/* Streak, Total XP & Overall Readiness metrics */}
            <div className="grid grid-cols-3 gap-2.5 pt-2 border-t border-slate-100">
              <div className="p-2.5 bg-app-bg rounded-xl border border-slate-100 text-center">
                <span className="text-[10px] font-semibold text-text-muted block">Streak</span>
                <div className="flex items-center justify-center gap-1 mt-1">
                  <Flame className="w-3.5 h-3.5 text-amber-500 fill-amber-500" />
                  <span className="text-sm font-extrabold text-text-primary">
                    {streakDays}d
                  </span>
                </div>
              </div>

              <div className="p-2.5 bg-app-bg rounded-xl border border-slate-100 text-center">
                <span className="text-[10px] font-semibold text-text-muted block">Points</span>
                <div className="flex items-center justify-center gap-1 mt-1">
                  <Zap className="w-3.5 h-3.5 text-amber-500 fill-amber-500" />
                  <span className="text-sm font-extrabold text-text-primary">
                    {displayPoints} XP
                  </span>
                </div>
              </div>

              <div className="p-2.5 bg-app-bg rounded-xl border border-slate-100 text-center">
                <span className="text-[10px] font-semibold text-text-muted block">Level {levelInfo.level}</span>
                <div className="flex items-center justify-center gap-1 mt-1">
                  <Crown className="w-3.5 h-3.5 text-sky-600" />
                  <span className="text-xs font-extrabold text-text-primary">
                    {levelInfo.currentXp} / {levelInfo.nextLevelXp}
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Card 2: Weekly League 2.0 Card */}
          <WeeklyLeagueCard userId={currentUser?.id} onNavigateTab={onNavigateTab} />

          {/* Card 3: Placement Journey */}
          <div
            id="placement-journey-card"
            className="bg-surface rounded-2xl p-6 border border-border shadow-xs space-y-4"
          >
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div>
                <h4 className="text-xs font-bold uppercase tracking-wider text-text-muted">
                  Placement Journey
                </h4>
                <p className="text-xs text-text-muted mt-0.5">
                  Track your progress from first assessment to placement readiness.
                </p>
              </div>

              <span className="px-2 py-0.5 bg-surface-hover border border-border text-slate-700 text-[10px] font-extrabold rounded-full shrink-0">
                {journeyCompletedCount} / 5 Done
              </span>
            </div>

            {/* Structured Milestones Progress List */}
            <div className="space-y-3 pt-1">
              {/* Milestone 1: First Assessment */}
              <div
                id="journey-milestone-1"
                className={`p-3 rounded-xl border transition-all ${
                  m1Complete
                    ? 'bg-emerald-50/50 border-emerald-200'
                    : 'bg-app-bg/80 border-border'
                }`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-start gap-2.5 min-w-0">
                    <div
                      className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold shrink-0 mt-0.5 ${
                        m1Complete
                          ? 'bg-emerald-500 text-white shadow-2xs'
                          : 'bg-slate-200 text-text-secondary'
                      }`}
                    >
                      {m1Complete ? <Check className="w-3.5 h-3.5" /> : '1'}
                    </div>

                    <div className="min-w-0">
                      <h5 className="text-xs font-bold text-text-primary leading-tight">
                        First Assessment
                      </h5>
                      <p className="text-[11px] text-text-muted mt-0.5">
                        {m1Complete
                          ? 'Completed'
                          : 'Complete your first mock assessment.'}
                      </p>
                    </div>
                  </div>

                  {!m1Complete && targetTest && (
                    <button
                      onClick={() => onStartTest(targetTest, 'exam')}
                      className="px-2.5 py-1 bg-amber-400 hover:bg-amber-300 text-slate-950 font-bold text-[11px] rounded-lg shrink-0 transition-all shadow-2xs"
                    >
                      Start Mock
                    </button>
                  )}
                </div>
              </div>

              {/* Milestone 2: Performance Analysis */}
              <div
                id="journey-milestone-2"
                className={`p-3 rounded-xl border transition-all ${
                  m2Complete
                    ? 'bg-emerald-50/50 border-emerald-200'
                    : 'bg-app-bg/80 border-border opacity-80'
                }`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-start gap-2.5 min-w-0">
                    <div
                      className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold shrink-0 mt-0.5 ${
                        m2Complete
                          ? 'bg-emerald-500 text-white shadow-2xs'
                          : 'bg-slate-200 text-text-secondary'
                      }`}
                    >
                      {m2Complete ? <Check className="w-3.5 h-3.5" /> : '2'}
                    </div>

                    <div className="min-w-0">
                      <h5 className="text-xs font-bold text-text-primary leading-tight">
                        Performance Analysis
                      </h5>
                      <p className="text-[11px] text-text-muted mt-0.5">
                        {m2Complete
                          ? 'Your first result is ready.'
                          : 'Complete an assessment to unlock performance analysis.'}
                      </p>
                    </div>
                  </div>

                  {m2Complete && latestUserAttempt && onViewAttemptReport && (
                    <button
                      onClick={() => onViewAttemptReport(latestUserAttempt)}
                      className="px-2.5 py-1 bg-sky-50 hover:bg-sky-100 border border-sky-200 text-sky-800 font-bold text-[11px] rounded-lg shrink-0 transition-all"
                    >
                      View Report
                    </button>
                  )}
                </div>
              </div>

              {/* Milestone 3: Build Your Practice Base */}
              <div
                id="journey-milestone-3"
                className={`p-3 rounded-xl border transition-all ${
                  m3Complete
                    ? 'bg-emerald-50/50 border-emerald-200'
                    : completedAssessmentsCount > 0
                    ? 'bg-sky-50/40 border-sky-200'
                    : 'bg-app-bg/80 border-border opacity-80'
                }`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-start gap-2.5 min-w-0">
                    <div
                      className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold shrink-0 mt-0.5 ${
                        m3Complete
                          ? 'bg-emerald-500 text-white shadow-2xs'
                          : completedAssessmentsCount > 0
                          ? 'bg-sky-600 text-white'
                          : 'bg-slate-200 text-text-secondary'
                      }`}
                    >
                      {m3Complete ? <Check className="w-3.5 h-3.5" /> : '3'}
                    </div>

                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <h5 className="text-xs font-bold text-text-primary leading-tight">
                          Build Your Practice Base
                        </h5>
                        <span className="px-1.5 py-0.2 bg-surface-hover text-text-secondary text-[10px] font-bold rounded">
                          {m3Progress} / 3
                        </span>
                      </div>
                      <p className="text-[11px] text-text-muted mt-0.5">
                        {m3Complete
                          ? '3 assessments completed.'
                          : 'Complete 3 assessments to establish benchmark accuracy.'}
                      </p>
                    </div>
                  </div>

                  {!m3Complete && (
                    <button
                      onClick={() => onNavigateTab('tests')}
                      className="px-2.5 py-1 bg-surface-hover hover:bg-slate-200 text-slate-700 font-bold text-[11px] rounded-lg shrink-0 transition-all"
                    >
                      Explore
                    </button>
                  )}
                </div>
              </div>

              {/* Milestone 4: Master Weak Areas */}
              <div
                id="journey-milestone-4"
                className={`p-3 rounded-xl border transition-all ${
                  m4Complete
                    ? 'bg-emerald-50/50 border-emerald-200'
                    : m4InProgress
                    ? 'bg-amber-50/40 border-amber-200'
                    : 'bg-app-bg/80 border-border opacity-80'
                }`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-start gap-2.5 min-w-0">
                    <div
                      className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold shrink-0 mt-0.5 ${
                        m4Complete
                          ? 'bg-emerald-500 text-white shadow-2xs'
                          : m4InProgress
                          ? 'bg-amber-500 text-slate-950 font-extrabold'
                          : 'bg-slate-200 text-text-secondary'
                      }`}
                    >
                      {m4Complete ? <Check className="w-3.5 h-3.5" /> : '4'}
                    </div>

                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <h5 className="text-xs font-bold text-text-primary leading-tight">
                          Master Weak Areas
                        </h5>
                        {hasWeakAreaEvidence && (
                          <span className="px-1.5 py-0.2 bg-amber-100/80 text-amber-900 text-[10px] font-bold rounded">
                            {masteredWeakCount} / {totalWeakCount}
                          </span>
                        )}
                      </div>
                      <p className="text-[11px] text-text-muted mt-0.5">
                        {!hasWeakAreaEvidence
                          ? 'Complete assessments to identify areas to improve.'
                          : masteredWeakCount > 0
                          ? `${masteredWeakCount} of ${totalWeakCount} weak topics improved in Revision Vault.`
                          : 'Turn mistakes into mastered topics in Revision Vault.'}
                      </p>
                    </div>
                  </div>

                  {hasWeakAreaEvidence ? (
                    <button
                      onClick={() => onNavigateTab('vault')}
                      className="px-2.5 py-1 bg-amber-100 hover:bg-amber-200 text-amber-950 font-bold text-[11px] rounded-lg shrink-0 transition-all"
                    >
                      Vault
                    </button>
                  ) : (
                    <button
                      onClick={() => onNavigateTab('tests')}
                      className="px-2.5 py-1 bg-surface-hover hover:bg-slate-200 text-text-secondary font-bold text-[11px] rounded-lg shrink-0 transition-all"
                    >
                      Practice
                    </button>
                  )}
                </div>
              </div>

              {/* Milestone 5: Placement Ready */}
              <div
                id="journey-milestone-5"
                className={`p-3 rounded-xl border transition-all ${
                  m5Complete
                    ? 'bg-emerald-50/70 border-emerald-200'
                    : 'bg-app-bg/80 border-border opacity-80'
                }`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-start gap-2.5 min-w-0">
                    <div
                      className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold shrink-0 mt-0.5 ${
                        m5Complete
                          ? 'bg-emerald-500 text-white shadow-2xs'
                          : 'bg-slate-200 text-text-secondary'
                      }`}
                    >
                      {m5Complete ? <Check className="w-3.5 h-3.5" /> : '5'}
                    </div>

                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <h5 className="text-xs font-bold text-text-primary leading-tight">
                          FirstRound Progress
                        </h5>
                        <span
                          className={`px-1.5 py-0.2 text-[10px] font-bold rounded ${
                            m5Complete
                              ? 'bg-emerald-100 text-emerald-800'
                              : 'bg-surface-hover text-text-secondary'
                          }`}
                        >
                          Level {levelInfo.level}
                        </span>
                      </div>
                      <p className="text-[11px] text-text-muted mt-0.5">
                        {m5Complete
                          ? 'You are making great progress through FirstRound!'
                          : `Keep completing assessments and revision to progress.`}
                      </p>
                    </div>
                  </div>

                  <button
                    onClick={onOpenProfile}
                    className="px-2.5 py-1 bg-surface-hover hover:bg-slate-200 text-slate-700 font-bold text-[11px] rounded-lg shrink-0 transition-all"
                  >
                    Status
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* Card 4: Placement Toolkit (ONE SINGLE CARD) */}
          <div
            id="placement-toolkit-card"
            className="bg-primary rounded-2xl p-5 text-white border border-primary-hover space-y-3.5 shadow-xs"
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="w-7 h-7 rounded-lg bg-amber-400 text-slate-950 flex items-center justify-center font-bold">
                  <Zap className="w-3.5 h-3.5 fill-slate-950" />
                </div>
                <div>
                  <h4 className="text-xs font-bold uppercase tracking-wider text-amber-400">
                    Placement Toolkit
                  </h4>
                  <span className="text-[10px] text-slate-400 block font-medium">
                    Quick Notes • Formula Library • Quick Solver
                  </span>
                </div>
              </div>
            </div>

            <p className="text-xs text-slate-300 leading-relaxed">
              Calculate faster, revise formulas, and keep your rough work in one place.
            </p>

            <button
              id="open-placement-toolkit-btn"
              onClick={onOpenScratchpad}
              className="w-full py-2.5 bg-primary-dark hover:bg-primary-hover border border-primary-active text-white font-bold text-xs rounded-xl transition-all flex items-center justify-center gap-2 group shadow-xs"
            >
              <Calculator className="w-3.5 h-3.5 text-amber-400 group-hover:scale-110 transition-transform" />
              <span>Open Toolkit</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
