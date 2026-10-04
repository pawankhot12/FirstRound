import React, { useEffect, useMemo, useState } from 'react';
import confetti from 'canvas-confetti';
import {
  AlertCircle,
  ArrowLeft,
  ArrowRight,
  Bot,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  ChevronUp,
  Clock,
  ExternalLink,
  Flame,
  HelpCircle,
  Layers,
  Lightbulb,
  RotateCcw,
  Sparkles,
  Target,
  TrendingDown,
  TrendingUp,
  Trophy,
  X,
  XCircle,
  Zap,
} from 'lucide-react';
import { AIDoubtResponse, Question, QuestionResponseDetail, TestAttempt } from '../types';
import { AIDoubtDrawer } from './AIDoubtDrawer';

class TestResultErrorBoundary extends React.Component<
  { children: React.ReactNode; onErrorFallback: () => void },
  { hasError: boolean }
> {
  constructor(props: { children: React.ReactNode; onErrorFallback: () => void }) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error: any, errorInfo: any) {
    console.error('TestResultModal render error caught by Error Boundary:', error, errorInfo);
    this.props.onErrorFallback();
  }

  render() {
    if (this.state.hasError) {
      return null;
    }
    return this.props.children;
  }
}

interface TestResultModalProps {
  attempt: TestAttempt;
  onClose: () => void;
  onRetake: () => void;
  onAskAI: (payload: { question: Question; userSelectedOption?: string | null; studentQuestion?: string }) => Promise<AIDoubtResponse>;
}

export const TestResultModal: React.FC<TestResultModalProps> = ({
  attempt,
  onClose,
  onRetake,
  onAskAI,
}) => {
  if (!attempt) return null;

  const [filterType, setFilterType] = useState<'all' | 'correct' | 'incorrect' | 'unattempted'>('all');
  const [activeDoubtQuestion, setActiveDoubtQuestion] = useState<{ question: Question; userChoice?: string | null } | null>(null);
  const [expandedQuestions, setExpandedQuestions] = useState<Record<string, boolean>>({});
  const [expandAll, setExpandAll] = useState(false);

  // Trigger celebration if passed with solid score
  useEffect(() => {
    if (attempt.accuracyPercentage >= 65) {
      try {
        confetti({
          particleCount: 60,
          spread: 70,
          origin: { y: 0.4 },
        });
      } catch (e) {
        // ignore if confetti fails in sandboxed iframe
      }
    }
  }, [attempt.accuracyPercentage]);

  // ESC key to close
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  // 1. Safe & Complete Data Derivations
  const responses = attempt.responses || [];
  const totalQuestions = attempt.totalQuestions || responses.length || 1;
  const correctCount = attempt.correctCount ?? responses.filter((r) => r.isCorrect).length;
  const incorrectCount =
    attempt.incorrectCount ??
    responses.filter((r) => !r.isCorrect && r.selectedOption !== null && r.selectedOption !== undefined).length;
  const unattemptedCount =
    attempt.unattemptedCount ??
    responses.filter((r) => r.selectedOption === null || r.selectedOption === undefined).length;

  const isExam = attempt.mode === 'exam';
  const scorePoints = attempt.scorePoints ?? Math.max(0, correctCount * 10 - incorrectCount * 2);
  const accuracyPercentage =
    attempt.accuracyPercentage ?? (attempt.attemptedQuestions > 0 ? Math.round((correctCount / attempt.attemptedQuestions) * 100) : 0);

  const isPassed = accuracyPercentage >= 65;

  // View Step State: Exam mode opens in dedicated 'xp' celebration view first, Practice mode opens in 'report' view.
  const [viewStep, setViewStep] = useState<'xp' | 'report'>(isExam ? 'xp' : 'report');

  // Prevent duplicate celebration on refresh
  useEffect(() => {
    if (isExam) {
      const sessionKey = `celebrated_attempt_${attempt.id || attempt.testInstanceId || 'attempt'}`;
      const alreadyCelebrated = typeof sessionStorage !== 'undefined' && sessionStorage.getItem(sessionKey);

      if (!alreadyCelebrated) {
        if (typeof sessionStorage !== 'undefined') {
          sessionStorage.setItem(sessionKey, 'true');
        }
        try {
          confetti({
            particleCount: 80,
            spread: 80,
            origin: { y: 0.35 },
          });
        } catch (e) {
          // ignore iframe sandboxing limits
        }
      }
    }
  }, [isExam, attempt.id, attempt.testInstanceId]);

  // 2. Computed Topic Performance (Always real data derived from attempt)
  const topicStats = useMemo(() => {
    const map: Record<string, { topic: string; total: number; correct: number; accuracy: number }> = {};

    // Build from actual responses to ensure 100% data integrity
    responses.forEach((r) => {
      const topicName = r.question?.topic || 'General Aptitude';
      if (!map[topicName]) {
        map[topicName] = { topic: topicName, total: 0, correct: 0, accuracy: 0 };
      }
      map[topicName].total += 1;
      if (r.isCorrect) {
        map[topicName].correct += 1;
      }
    });

    return Object.values(map).map((item) => ({
      ...item,
      accuracy: item.total > 0 ? Math.round((item.correct / item.total) * 100) : 0,
    }));
  }, [responses]);

  // Sort topics: weakest first for actionable insights, or strongest
  const sortedTopics = useMemo(() => {
    return [...topicStats].sort((a, b) => a.accuracy - b.accuracy);
  }, [topicStats]);

  const weakestTopic = sortedTopics.length > 0 ? sortedTopics[0] : null;
  const strongestTopic = sortedTopics.length > 0 ? sortedTopics[sortedTopics.length - 1] : null;

  // Concise data-driven recommendation
  const performanceInsight = useMemo(() => {
    if (accuracyPercentage >= 80) {
      return {
        headline: 'Strong Placement Readiness',
        description: `You cleared typical Tier-1 company cutoffs (65%+) with high precision across ${topicStats.length} tested topics.`,
        recommendation: `Maintain your momentum. Advance to higher-difficulty technical mocks or time-pressured speed rounds.`,
      };
    }
    if (accuracyPercentage >= 65) {
      return {
        headline: 'Qualified for Next Round',
        description: `You met the baseline qualification cutoff with ${accuracyPercentage}% accuracy, but there is room for speed and accuracy optimization.`,
        recommendation: weakestTopic
          ? `Focus on strengthening ${weakestTopic.topic} (${weakestTopic.accuracy}% accuracy) to build a safe margin.`
          : `Review any missed questions to eliminate negative markings.`,
      };
    }
    return {
      headline: 'Target Practice Required',
      description: `Your accuracy (${accuracyPercentage}%) is currently below the competitive placement benchmark (65%+).`,
      recommendation: weakestTopic
        ? `Dedicate focused revision to ${weakestTopic.topic} where ${weakestTopic.total - weakestTopic.correct} questions were missed.`
        : `Review step-by-step solutions for incorrect questions and reattempt.`,
    };
  }, [accuracyPercentage, topicStats.length, weakestTopic]);

  // Recommended Next Action Card
  const nextAction = useMemo(() => {
    if (incorrectCount > 0 && weakestTopic && weakestTopic.accuracy < 80) {
      return {
        title: `Practice ${weakestTopic.topic}`,
        subtitle: `You missed ${weakestTopic.total - weakestTopic.correct} of ${weakestTopic.total} questions in this topic (${weakestTopic.accuracy}% accuracy).`,
        ctaLabel: 'Review Weak Topic Questions',
        actionType: 'filter_weak' as const,
      };
    }
    if (incorrectCount > 0) {
      return {
        title: 'Review All Incorrect Questions',
        subtitle: `Review the hints and answers for the ${incorrectCount} questions you missed.`,
        ctaLabel: 'Show Incorrect Questions',
        actionType: 'filter_incorrect' as const,
      };
    }
    return {
      title: 'Full Test Mastery Achieved',
      subtitle: `Zero negative markings! Ready to attempt another company-specific placement test.`,
      ctaLabel: 'Retake Mock Test',
      actionType: 'retake' as const,
    };
  }, [incorrectCount, weakestTopic]);

  // Filtered Questions for Question Review
  const filteredResponses = useMemo(() => {
    return responses.filter((r) => {
      if (filterType === 'correct') return r.isCorrect;
      if (filterType === 'incorrect') return !r.isCorrect && r.selectedOption !== null && r.selectedOption !== undefined;
      if (filterType === 'unattempted') return r.selectedOption === null || r.selectedOption === undefined;
      return true;
    });
  }, [responses, filterType]);

  const toggleQuestion = (id: string) => {
    setExpandedQuestions((prev) => ({
      ...prev,
      [id]: !prev[id],
    }));
  };

  const handleToggleExpandAll = () => {
    const nextState = !expandAll;
    setExpandAll(nextState);
    const newMap: Record<string, boolean> = {};
    responses.forEach((r, idx) => {
      const qId = r.question?.id || `q_${idx}`;
      newMap[qId] = nextState;
    });
    setExpandedQuestions(newMap);
  };

  const handleNextActionClick = () => {
    if (nextAction.actionType === 'filter_weak' || nextAction.actionType === 'filter_incorrect') {
      setFilterType('incorrect');
      // Expand all incorrect questions for instant study
      const newMap: Record<string, boolean> = {};
      responses.forEach((r, idx) => {
        if (!r.isCorrect) {
          const qId = r.question?.id || `q_${idx}`;
          newMap[qId] = true;
        }
      });
      setExpandedQuestions(newMap);
      // Smooth scroll down to question review
      const el = document.getElementById('question-review-section');
      if (el) {
        el.scrollIntoView({ behavior: 'smooth' });
      }
    } else {
      onRetake();
    }
  };

  return (
    <div
      id="test-result-modal-backdrop"
      className="fixed inset-0 z-50 overflow-y-auto bg-slate-950/75 backdrop-blur-sm p-2 sm:p-4 md:p-6 flex items-center justify-center animate-in fade-in duration-200"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        id="test-result-report-card"
        className="bg-surface border border-border w-full max-w-5xl max-h-[92vh] rounded-2xl sm:rounded-3xl shadow-2xl overflow-hidden flex flex-col text-text-primary animate-in zoom-in-95 duration-200"
        role="dialog"
        aria-modal="true"
      >
        {/* ========================================================= */}
        {/* REPORT HEADER                                             */}
        {/* ========================================================= */}
        <header className="sticky top-0 z-20 bg-primary border-b border-primary-dark px-3.5 sm:px-6 py-3 sm:py-3.5 text-white flex items-center justify-between gap-2.5 shadow-sm">
          <div className="flex items-center gap-2 sm:gap-3 min-w-0 flex-1">
            <button
              id="report-back-btn"
              onClick={onClose}
              className="p-1.5 sm:p-2 bg-surface/10 hover:bg-surface/20 active:bg-surface/30 text-slate-200 hover:text-white rounded-lg sm:rounded-xl transition-colors flex items-center justify-center shrink-0"
              title="Back to Dashboard"
            >
              <ArrowLeft className="w-4 h-4 sm:w-4.5 sm:h-4.5" />
            </button>

            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1.5 sm:gap-2">
                <span
                  id="report-status-badge"
                  className={`px-2 py-0.5 rounded-md text-[10px] sm:text-[11px] font-extrabold uppercase tracking-wide shrink-0 ${
                    isPassed
                      ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                      : 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
                  }`}
                >
                  {isPassed ? '✓ Cutoff Cleared' : 'Mock Completed'}
                </span>
                {attempt.companyName && (
                  <span className="text-[11px] text-slate-300 font-semibold truncate hidden sm:inline">
                    • {attempt.companyName}
                  </span>
                )}
              </div>
              <h1 className="text-sm sm:text-base lg:text-lg font-bold text-white truncate leading-tight mt-0.5 font-['Outfit']">
                {attempt.testTitle}
              </h1>
            </div>
          </div>

          {/* Right Header Actions */}
          <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
            <button
              id="report-header-retake-btn"
              onClick={onRetake}
              className="hidden sm:flex items-center gap-1 px-3 py-1.5 bg-primary-hover hover:bg-primary-hover active:bg-primary-active text-amber-300 border border-primary-active text-xs font-bold rounded-xl transition-colors shadow-2xs"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>Retake Mock</span>
            </button>

            <button
              id="report-close-btn"
              onClick={onClose}
              className="p-1.5 sm:p-2 text-slate-300 hover:text-white bg-surface/10 hover:bg-surface/20 rounded-lg sm:rounded-xl transition-colors flex items-center justify-center"
              title="Close Report"
              aria-label="Close"
            >
              <X className="w-4 h-4 sm:w-5 sm:h-5" />
            </button>
          </div>
        </header>

        {/* ========================================================= */}
        {/* REPORT BODY WITH ERROR BOUNDARY FALLBACK                  */}
        {/* ========================================================= */}
        <TestResultErrorBoundary onErrorFallback={() => setViewStep('report')}>
          {viewStep === 'xp' && isExam ? (
            <div className="flex-1 overflow-y-auto p-4 sm:p-8 space-y-6">
              <div className="bg-gradient-to-br from-slate-950 via-primary-dark to-slate-900 rounded-3xl p-6 sm:p-10 text-white border border-slate-800 shadow-2xl space-y-6 relative overflow-hidden text-center">
                {/* Header Badge */}
                <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-amber-400/20 text-amber-300 border border-amber-400/40 text-xs font-black uppercase tracking-wider shadow-sm">
                  <Trophy className="w-4 h-4 text-amber-400" />
                  <span>🏆 Assessment Complete</span>
                </div>

                {/* XP Earned Title */}
                <div className="space-y-1">
                  <h2 className="text-4xl sm:text-6xl font-black text-white font-['Outfit'] tracking-tight">
                    +{scorePoints} XP
                  </h2>
                  <p className="text-xs sm:text-sm text-slate-300 font-semibold">
                    Official Exam Submission • Real League & XP Applied
                  </p>
                </div>

                {/* Compact XP Breakdown */}
                <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-4 sm:p-5 max-w-lg mx-auto space-y-3 text-left">
                  <span className="text-[10px] font-black uppercase tracking-widest text-slate-400 block text-center">
                    XP Calculation Breakdown
                  </span>

                  <div className="space-y-2 text-xs">
                    <div className="flex items-center justify-between py-1.5 border-b border-slate-800">
                      <span className="text-slate-300">Base Performance ({correctCount} correct × 10)</span>
                      <span className="font-mono font-extrabold text-emerald-400">+{correctCount * 10} XP</span>
                    </div>

                    {incorrectCount > 0 && (
                      <div className="flex items-center justify-between py-1.5 border-b border-slate-800">
                        <span className="text-slate-300">Penalty ({incorrectCount} incorrect × -2)</span>
                        <span className="font-mono font-extrabold text-rose-400">-{incorrectCount * 2} XP</span>
                      </div>
                    )}

                    <div className="flex items-center justify-between pt-1 text-sm font-black">
                      <span className="text-white">Total XP Earned</span>
                      <span className="font-mono text-amber-400">+{scorePoints} XP</span>
                    </div>
                  </div>
                </div>

                {/* Lifetime & Weekly XP Gain Cards */}
                <div className="grid grid-cols-2 gap-3 max-w-lg mx-auto">
                  <div className="p-4 bg-slate-900/80 border border-slate-800 rounded-2xl text-center space-y-1">
                    <span className="text-[10px] font-extrabold uppercase tracking-wider text-slate-400">
                      Lifetime XP Gained
                    </span>
                    <p className="text-2xl font-black text-amber-400 font-mono">+{scorePoints} XP</p>
                    <p className="text-[10px] text-slate-400">Permanent Level Progress</p>
                  </div>

                  <div className="p-4 bg-slate-900/80 border border-slate-800 rounded-2xl text-center space-y-1">
                    <span className="text-[10px] font-extrabold uppercase tracking-wider text-slate-400">
                      Weekly XP Gained
                    </span>
                    <p className="text-2xl font-black text-sky-400 font-mono">+{scorePoints} XP</p>
                    <p className="text-[10px] text-slate-400">Weekly League Division</p>
                  </div>
                </div>

                {/* Action Buttons */}
                <div className="flex flex-wrap items-center justify-center gap-3 pt-3">
                  <button
                    id="exam-view-solutions-btn"
                    onClick={() => setViewStep('report')}
                    className="px-6 py-3 bg-amber-400 hover:bg-amber-300 active:bg-amber-500 text-slate-950 text-xs font-black rounded-xl shadow-md transition-all flex items-center gap-1.5 active:scale-95"
                  >
                    <span>View Breakdown & Solutions</span>
                    <ChevronRight className="w-4 h-4" />
                  </button>
                  <button
                    id="exam-continue-dashboard-btn"
                    onClick={onClose}
                    className="px-6 py-3 bg-slate-800 hover:bg-slate-700 active:bg-slate-900 text-white text-xs font-extrabold rounded-xl border border-slate-700 transition-all active:scale-95"
                  >
                    Continue to Dashboard
                  </button>
                </div>
              </div>
            </div>
          ) : (
          <div className="flex-1 overflow-y-auto p-3.5 sm:p-5 lg:p-6 space-y-4 sm:space-y-6">
            {/* PRACTICE MODE ZERO-XP COMPLETION HERO CARD */}
            {!isExam ? (
              <div className="bg-gradient-to-r from-slate-900 via-primary-dark to-slate-900 rounded-3xl p-6 sm:p-8 text-white border border-slate-800 shadow-xl space-y-4 text-center">
                <div className="w-14 h-14 bg-emerald-500/20 border border-emerald-400/40 rounded-full flex items-center justify-center mx-auto text-2xl shadow-inner">
                  💪
                </div>
                <div className="space-y-1.5">
                  <h2 className="text-2xl sm:text-3xl font-black text-white font-['Outfit']">
                    Practice Complete
                  </h2>
                  <p className="text-xs sm:text-sm text-slate-300 max-w-lg mx-auto leading-relaxed">
                    Great work. Practice helps you improve your skills, but does not affect XP or your League.
                  </p>
                </div>

                <div className="grid grid-cols-3 gap-3 bg-slate-900/80 p-4 rounded-2xl border border-slate-700/80 max-w-md mx-auto text-center pt-2">
                  <div>
                    <p className="text-[10px] uppercase font-bold text-slate-400">Correct</p>
                    <p className="text-lg font-black text-emerald-400 mt-0.5">{correctCount}</p>
                  </div>
                  <div className="border-x border-slate-800">
                    <p className="text-[10px] uppercase font-bold text-slate-400">Accuracy</p>
                    <p className="text-lg font-black text-white mt-0.5">{accuracyPercentage}%</p>
                  </div>
                  <div>
                    <p className="text-[10px] uppercase font-bold text-slate-400">Avg Speed</p>
                    <p className="text-lg font-black text-sky-400 mt-0.5">
                      {attempt.avgTimePerQuestionSeconds || Math.round(attempt.timeTakenSeconds / Math.max(1, attempt.attemptedQuestions))}s/Q
                    </p>
                  </div>
                </div>

                <div className="flex flex-wrap items-center justify-center gap-3 pt-2">
                  <button
                    id="practice-again-btn"
                    onClick={onRetake}
                    className="px-5 py-2.5 bg-surface-hover hover:bg-slate-200 text-slate-800 text-xs font-bold rounded-xl border border-slate-300 transition-all"
                  >
                    Practice Again
                  </button>
                  <button
                    id="practice-continue-btn"
                    onClick={onClose}
                    className="px-6 py-2.5 bg-primary hover:bg-primary-hover text-white text-xs font-extrabold rounded-xl shadow-xs transition-all"
                  >
                    Continue
                  </button>
                </div>
              </div>
            ) : (
              /* EXAM SUMMARY CARD WHEN VIEWING DETAILED REPORT */
              <div className="bg-surface border border-border/90 rounded-2xl p-4 sm:p-5 lg:p-6 shadow-xs space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-2 pb-3 border-b border-slate-100">
                  <div>
                    <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
                      Performance Summary
                    </span>
                    <h2 className="text-base sm:text-lg font-extrabold text-text-primary font-['Outfit']">
                      Overall Score & Readiness
                    </h2>
                  </div>

                  <span
                    className={`px-3 py-1 rounded-xl text-xs font-extrabold flex items-center gap-1.5 shadow-2xs ${
                      isPassed
                        ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                        : 'bg-amber-50 text-amber-900 border border-amber-200'
                    }`}
                  >
                    {isPassed ? (
                      <>
                        <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                        <span>Pass / Ready for Rounds</span>
                      </>
                    ) : (
                      <>
                        <AlertCircle className="w-4 h-4 text-amber-600 shrink-0" />
                        <span>Needs Target Practice</span>
                      </>
                    )}
                  </span>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 p-3.5 sm:p-4 bg-app-bg/80 rounded-xl border border-border/80">
                  <div className="space-y-1">
                    <span className="text-[11px] font-semibold text-text-muted flex items-center gap-1">
                      <Zap className="w-3.5 h-3.5 text-amber-500 fill-amber-500" />
                      Score Points
                    </span>
                    <div className="flex items-baseline gap-1.5">
                      <span className="text-2xl sm:text-3xl font-black text-text-primary font-['Outfit']">
                        {scorePoints}
                      </span>
                      <span className="text-[11px] text-text-muted font-medium">pts</span>
                    </div>
                  </div>

                  <div className="space-y-1">
                    <span className="text-[11px] font-semibold text-text-muted flex items-center gap-1">
                      <Target className="w-3.5 h-3.5 text-sky-600" />
                      Accuracy
                    </span>
                    <div className="flex items-baseline gap-1.5">
                      <span className="text-2xl sm:text-3xl font-black text-emerald-700 font-['Outfit']">
                        {accuracyPercentage}%
                      </span>
                    </div>
                  </div>

                  <div className="col-span-2 sm:col-span-1 space-y-1">
                    <span className="text-[11px] font-semibold text-text-muted flex items-center gap-1">
                      <Clock className="w-3.5 h-3.5 text-text-muted" />
                      Avg Speed
                    </span>
                    <div className="flex items-baseline gap-1.5">
                      <span className="text-2xl sm:text-3xl font-black text-text-primary font-['Outfit']">
                        {attempt.avgTimePerQuestionSeconds || Math.round(attempt.timeTakenSeconds / Math.max(1, attempt.attemptedQuestions))}s
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* SECTION 5 — COLLAPSIBLE QUESTION REVIEW */}
            <div
              id="question-review-section"
              className="bg-surface border border-border/90 rounded-2xl p-4 sm:p-5 lg:p-6 shadow-xs space-y-4 pt-4"
            >
              <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 border-b border-slate-100 pb-3">
                <div>
                  <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
                    Detailed Verification
                  </span>
                  <h3 className="text-sm sm:text-base font-bold text-text-primary font-['Outfit']">
                    Question Review
                  </h3>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <div className="flex items-center gap-1 bg-surface-hover p-1 rounded-xl text-xs font-bold">
                    <button
                      id="filter-all-questions-btn"
                      onClick={() => setFilterType('all')}
                      className={`px-2.5 py-1 rounded-lg transition-all ${
                        filterType === 'all'
                          ? 'bg-primary text-white shadow-2xs'
                          : 'text-text-secondary hover:text-text-primary'
                      }`}
                    >
                      All ({responses.length})
                    </button>
                    <button
                      id="filter-correct-questions-btn"
                      onClick={() => setFilterType('correct')}
                      className={`px-2.5 py-1 rounded-lg transition-all ${
                        filterType === 'correct'
                          ? 'bg-emerald-600 text-white shadow-2xs'
                          : 'text-text-secondary hover:text-emerald-700'
                      }`}
                    >
                      Correct ({correctCount})
                    </button>
                    <button
                      id="filter-incorrect-questions-btn"
                      onClick={() => setFilterType('incorrect')}
                      className={`px-2.5 py-1 rounded-lg transition-all ${
                        filterType === 'incorrect'
                          ? 'bg-rose-600 text-white shadow-2xs'
                          : 'text-text-secondary hover:text-rose-700'
                      }`}
                    >
                      Incorrect ({incorrectCount})
                    </button>
                  </div>

                  <button
                    id="toggle-expand-all-btn"
                    onClick={handleToggleExpandAll}
                    className="px-2.5 py-1.5 bg-app-bg hover:bg-surface-hover border border-border text-xs font-semibold text-slate-700 rounded-xl transition-colors"
                  >
                    {expandAll ? 'Collapse All' : 'Expand All'}
                  </button>
                </div>
              </div>

              {filteredResponses.length === 0 ? (
                <div className="p-8 text-center bg-app-bg rounded-xl border border-border/80 text-xs text-text-muted space-y-1">
                  <p className="font-semibold text-slate-700">No questions found in this category.</p>
                </div>
              ) : (
                <div className="space-y-2.5">
                  {filteredResponses.map((resp, idx) => {
                    const q = resp.question;
                    if (!q) return null;

                    const qId = q.id || `q_${idx}`;
                    const isExpanded = expandedQuestions[qId] ?? expandAll;
                    const isCorrect = resp.isCorrect;
                    const isSkipped = resp.selectedOption === null || resp.selectedOption === undefined;

                    const getShortHintText = (questionItem: Question): string => {
                      if (questionItem.hint && questionItem.hint.trim().length > 0) {
                        return questionItem.hint.trim();
                      }
                      if (questionItem.shortcutFormula && questionItem.shortcutFormula.trim().length > 0) {
                        return questionItem.shortcutFormula.trim();
                      }
                      if (questionItem.explanation) {
                        const lines = questionItem.explanation
                          .split('\n')
                          .map((l) => l.trim())
                          .filter((l) => l.length > 0 && !l.toLowerCase().startsWith('step') && !l.toLowerCase().startsWith('solution'));
                        if (lines.length > 0) {
                          const summary = lines.slice(0, 2).join(' ');
                          if (summary.length <= 180) return summary;
                          return summary.substring(0, 177) + '...';
                        }
                      }
                      return 'Review the core formula and concept for this topic.';
                    };

                    return (
                      <div
                        key={qId}
                        className={`rounded-xl border transition-all overflow-hidden ${
                          isCorrect
                            ? 'bg-surface border-emerald-200/90 shadow-2xs'
                            : isSkipped
                            ? 'bg-surface border-border'
                            : 'bg-surface border-rose-200/90 shadow-2xs'
                        }`}
                      >
                        <div
                          id={`question-review-row-${idx + 1}`}
                          onClick={() => toggleQuestion(qId)}
                          className="p-3 sm:p-3.5 flex items-center justify-between gap-2.5 cursor-pointer hover:bg-app-bg/80 transition-colors select-none"
                        >
                          <div className="flex items-center gap-2 sm:gap-3 min-w-0 flex-1">
                            <span
                              className={`w-7 h-7 rounded-lg text-xs font-black flex items-center justify-center shrink-0 ${
                                isCorrect
                                  ? 'bg-emerald-100 text-emerald-800'
                                  : isSkipped
                                  ? 'bg-surface-hover text-slate-700'
                                  : 'bg-rose-100 text-rose-800'
                              }`}
                            >
                              Q{idx + 1}
                            </span>

                            <div className="min-w-0 flex-1">
                              <div className="flex items-center gap-1.5 sm:gap-2">
                                <span className="text-xs font-bold text-text-primary truncate max-w-[130px] sm:max-w-[200px]">
                                  {q.topic}
                                </span>
                                <span
                                  className={`text-[10px] font-extrabold px-2 py-0.5 rounded shrink-0 ${
                                    isCorrect
                                      ? 'bg-emerald-100 text-emerald-800'
                                      : isSkipped
                                      ? 'bg-surface-hover text-text-secondary'
                                      : 'bg-rose-100 text-rose-800'
                                  }`}
                                >
                                  {isCorrect ? '✓ Correct' : isSkipped ? 'Unanswered' : '✕ Incorrect'}
                                </span>
                              </div>
                              <p className="text-xs text-text-muted truncate mt-0.5 max-w-md sm:max-w-xl">
                                {q.questionText}
                              </p>
                            </div>
                          </div>

                          <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
                            <button className="p-1 text-slate-400 hover:text-slate-700 rounded-md">
                              {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                            </button>
                          </div>
                        </div>

                        {isExpanded && (
                          <div className="px-3.5 sm:px-5 pb-4 pt-2 border-t border-slate-150 space-y-3 bg-app-bg/50 text-xs">
                            <p className="text-text-primary font-semibold whitespace-pre-line leading-relaxed sm:text-sm">
                              {q.questionText}
                            </p>

                            {q.codeSnippet && (
                              <div className="p-3 bg-primary rounded-xl border border-primary-active font-mono text-xs text-sky-300 overflow-x-auto whitespace-pre leading-relaxed">
                                {q.codeSnippet}
                              </div>
                            )}

                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 bg-surface p-3 rounded-xl border border-border">
                              <div>
                                <span className="text-text-muted font-medium">Your Answer: </span>
                                <span className={`font-bold ${isCorrect ? 'text-emerald-700' : 'text-rose-700'}`}>
                                  {resp.selectedOption ? `Option (${resp.selectedOption})` : 'Not Attempted'}
                                </span>
                              </div>
                              <div>
                                <span className="text-text-muted font-medium">Correct Answer: </span>
                                <span className="font-bold text-emerald-700">Option ({q.correctOption})</span>
                              </div>
                            </div>

                            <div className="p-3.5 bg-amber-500/5 rounded-xl border border-amber-500/20 text-xs space-y-1">
                              <span className="font-extrabold text-amber-700 flex items-center gap-1">
                                <Lightbulb className="w-3.5 h-3.5 text-amber-600" />
                                <span>Hint</span>
                              </span>
                              <p className="text-slate-700 leading-relaxed font-medium">
                                {getShortHintText(q)}
                              </p>
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        )}
        </TestResultErrorBoundary>

        {/* ========================================================= */}
        {/* STICKY BOTTOM ACTION FOOTER                               */}
        {/* ========================================================= */}
        <footer
          id="test-report-footer"
          className="sticky bottom-0 z-20 bg-app-bg/95 backdrop-blur-xs border-t border-border px-4 sm:px-6 py-3 flex items-center justify-between gap-3 shadow-inner"
          style={{ paddingBottom: 'max(0.75rem, env(safe-area-inset-bottom))' }}
        >
          <button
            id="report-footer-retake-btn"
            onClick={onRetake}
            className="min-h-[44px] px-4 py-2 bg-surface hover:bg-surface-hover active:bg-slate-200 border border-slate-300 text-slate-800 text-xs font-bold rounded-xl transition-all flex items-center gap-1.5 active:scale-95 shadow-2xs"
          >
            <RotateCcw className="w-4 h-4 text-text-secondary" />
            <span>Retake Mock</span>
          </button>

          <button
            id="report-footer-dashboard-btn"
            onClick={onClose}
            className="min-h-[44px] px-5 py-2 bg-primary hover:bg-primary-hover active:bg-primary-active text-white text-xs font-extrabold rounded-xl transition-all shadow-sm flex items-center gap-1.5 active:scale-95"
          >
            <span>Back to Dashboard</span>
            <ArrowRight className="w-4 h-4" />
          </button>
        </footer>
      </div>

      {/* Floating AI Doubt Drawer Modal */}
      {activeDoubtQuestion && (
        <AIDoubtDrawer
          question={activeDoubtQuestion.question}
          userSelectedOption={activeDoubtQuestion.userChoice}
          onClose={() => setActiveDoubtQuestion(null)}
          onAskAI={onAskAI}
        />
      )}
    </div>
  );
};
