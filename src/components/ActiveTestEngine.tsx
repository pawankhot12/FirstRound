import React, { useEffect, useState, useCallback } from 'react';
import {
  AlertCircle,
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  Bookmark,
  BookmarkCheck,
  BrainCircuit,
  Check,
  CheckCircle,
  CheckCircle2,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  Clock,
  Crown,
  Eye,
  FileSpreadsheet,
  Grid,
  HelpCircle,
  Layers,
  Lightbulb,
  Lock,
  Maximize2,
  MessageSquare,
  Minimize2,
  PenTool,
  RotateCcw,
  Send,
  Sparkles,
  ShieldCheck,
  Star,
  Trash2,
  X,
  Zap,
} from 'lucide-react';
import { Question, QuestionResponse, TestMode, TestSeries } from '../types';
import { PlacementToolkitModal } from './PlacementToolkitModal';
import { CodingEnvironmentRegistry } from '../services/CodingEnvironmentRegistry';
import { apiGetDeepAIStatus, apiGetCredits, apiAskDeepAI, apiDeductWeeklyXP, apiGetWeeklyXP, apiGetQuestionHint } from '../api';

const HINT_WEEKLY_XP_COST = 1;

interface ActiveTestEngineProps {
  test: TestSeries & { questions: Question[] };
  mode: TestMode;
  userId: string;
  onExit: () => void;
  onSubmit: (responses: QuestionResponse[], timeTakenSeconds: number) => void;
  onToggleBookmark: (questionId: string) => Promise<boolean>;
  initialBookmarkedIds: Set<string>;
  onOpenScratchpad: () => void;
}

export const ActiveTestEngine: React.FC<ActiveTestEngineProps> = ({
  test,
  mode,
  userId,
  onExit,
  onSubmit,
  onToggleBookmark,
  initialBookmarkedIds,
  onOpenScratchpad,
}) => {
  console.time('[TestPerf] ActiveTestEngineMount');
  const questions = test.questions || [];
  const totalQuestions = questions.length;

  const storageKeySuffix = mode === 'practice' ? '_practice' : '';
  const storageKey = userId ? `firstround_progress_${userId}_${test.id}${storageKeySuffix}` : null;

  // Retrieve saved progress if present
  const getSavedState = () => {
    if (!storageKey) return null;
    try {
      const raw = localStorage.getItem(storageKey);
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  };
  const savedState = getSavedState();

  const [currentIndex, setCurrentIndex] = useState<number>(() => {
    if (savedState && typeof savedState.currentIndex === 'number' && savedState.currentIndex < totalQuestions) {
      return savedState.currentIndex;
    }
    return 0;
  });

  const [selectedAnswers, setSelectedAnswers] = useState<Record<string, 'A' | 'B' | 'C' | 'D' | null>>(() => {
    return savedState?.selectedAnswers || {};
  });

  const [codingSolvedStates, setCodingSolvedStates] = useState<Record<string, boolean>>(() => {
    return savedState?.codingSolvedStates || {};
  });

  const handleCodingSubmissionSuccess = (questionId: string, result: any) => {
    setCodingSolvedStates((prev) => ({
      ...prev,
      [questionId]: true,
    }));
  };

  const [markedForReview, setMarkedForReview] = useState<Record<string, boolean>>(() => {
    return savedState?.markedForReview || {};
  });

  const [visitedQuestions, setVisitedQuestions] = useState<Record<string, boolean>>(() => {
    return savedState?.visitedQuestions || (questions[0]?.id ? { [questions[0].id]: true } : {});
  });

  const [timeSpentPerQuestion, setTimeSpentPerQuestion] = useState<Record<string, number>>(() => {
    return savedState?.timeSpentPerQuestion || {};
  });

  const [bookmarkedIds, setBookmarkedIds] = useState<Set<string>>(initialBookmarkedIds || new Set());
  const [isToolkitOpen, setIsToolkitOpen] = useState(false);
  const [isMobilePaletteOpen, setIsMobilePaletteOpen] = useState(false);

  const [attemptId] = useState<string>(() => {
  // [TestPerf] QuestionInitialization start
  console.time('[TestPerf] QuestionInitialization');
    if (savedState?.attemptId) return savedState.attemptId;
    return `att_${test.id}_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
  });

  // Assessment Integrity & Anti-Cheat State (Exam mode only)
  const [violationCount, setViolationCount] = useState<number>(() => savedState?.violationCount || 0);
  const [isTerminated, setIsTerminated] = useState<boolean>(() => savedState?.isTerminated || false);
  const [showWarningModal, setShowWarningModal] = useState<boolean>(false);
  const [warningDetails, setWarningDetails] = useState<{ count: number; eventType: string } | null>(null);
  const [showTerminationModal, setShowTerminationModal] = useState<boolean>(() => savedState?.isTerminated || false);

  const lastViolationTimeRef = React.useRef<number>(0);

  const handleIntegrityViolation = useCallback(
    async (eventType: string, metadata?: any) => {
      if (mode !== 'exam' || isTerminated) return;

      const now = Date.now();
      // 1000ms sliding window deduplication to group concurrent browser events (e.g. blur + visibilitychange)
      if (now - lastViolationTimeRef.current < 1000) {
        return;
      }
      lastViolationTimeRef.current = now;

      try {
        const res = await fetch(`/api/tests/${test.id}/integrity-event`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-requested-with': 'XMLHttpRequest',
            ...(userId ? { 'x-user-id': userId } : {}),
          },
          body: JSON.stringify({
            attemptId,
            eventType,
            mode: 'exam',
            metadata,
            userId,
          }),
        });

        const data = await res.json();
        if (data && data.success) {
          const newCount = data.violationCount;
          setViolationCount(newCount);

          if (data.terminated || newCount >= 3) {
            setIsTerminated(true);
            setShowTerminationModal(true);
            setShowWarningModal(false);
          } else if (newCount > 0 && !data.deduplicated) {
            setWarningDetails({ count: newCount, eventType });
            setShowWarningModal(true);
          }
        }
      } catch (e) {
        console.error('Failed to log integrity event:', e);
      }
    },
    [test.id, attemptId, mode, userId, isTerminated]
  );

  useEffect(() => {
    if (mode !== 'exam' || isTerminated) return;

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'hidden') {
        handleIntegrityViolation('TAB_HIDDEN', { path: window.location.pathname });
      }
    };

    const handleBlur = () => {
      handleIntegrityViolation('WINDOW_BLUR', { activeElement: document.activeElement?.tagName });
    };

    const handleCopy = () => {
      handleIntegrityViolation('COPY_ATTEMPT');
    };

    const handleCut = () => {
      handleIntegrityViolation('CUT_ATTEMPT');
    };

    const handlePaste = () => {
      handleIntegrityViolation('PASTE_ATTEMPT');
    };

    const handleContextMenu = (e: MouseEvent) => {
      e.preventDefault();
      handleIntegrityViolation('CONTEXT_MENU');
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      const isCtrlOrCmd = e.ctrlKey || e.metaKey;
      const isShift = e.shiftKey;
      const key = e.key.toLowerCase();

      // DevTools shortcuts: F12, Ctrl+Shift+I, Ctrl+Shift+J, Ctrl+Shift+C
      if (
        e.key === 'F12' ||
        (isCtrlOrCmd && isShift && (key === 'i' || key === 'j' || key === 'c'))
      ) {
        e.preventDefault();
        handleIntegrityViolation('DEVTOOLS_SHORTCUT', { key: e.key });
        return;
      }

      // Copy / Cut / Paste shortcuts
      if (isCtrlOrCmd && (key === 'c' || key === 'x' || key === 'v')) {
        handleIntegrityViolation(key === 'c' ? 'COPY_ATTEMPT' : key === 'x' ? 'CUT_ATTEMPT' : 'PASTE_ATTEMPT');
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('blur', handleBlur);
    document.addEventListener('copy', handleCopy);
    document.addEventListener('cut', handleCut);
    document.addEventListener('paste', handlePaste);
    document.addEventListener('contextmenu', handleContextMenu);
    window.addEventListener('keydown', handleKeyDown);

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('blur', handleBlur);
      document.removeEventListener('copy', handleCopy);
      document.removeEventListener('cut', handleCut);
      document.removeEventListener('paste', handlePaste);
      document.removeEventListener('contextmenu', handleContextMenu);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [mode, isTerminated, handleIntegrityViolation]);

  // Timer
  const totalDurationSeconds = (test.durationMinutes || 20) * 60;
  const [secondsRemaining, setSecondsRemaining] = useState<number>(() => {
    if (savedState && typeof savedState.secondsRemaining === 'number' && savedState.secondsRemaining > 0) {
      return savedState.secondsRemaining;
    }
    return totalDurationSeconds;
  });

  const [elapsedSeconds, setElapsedSeconds] = useState<number>(() => {
    if (savedState && typeof savedState.elapsedSeconds === 'number') {
      return savedState.elapsedSeconds;
    }
    return 0;
  });

  // Deep AI Help (Practice Mode, Premium Feature)
  const [deepAIStatus, setDeepAIStatus] = useState<{
    eligible: boolean;
    isPremium: boolean;
    status: 'eligible' | 'locked';
    reason?: string;
    remainingCredits?: number;
  } | null>(null);
  const [creditsBalance, setCreditsBalance] = useState<number>(6);
  const [creditsLoading, setCreditsLoading] = useState<boolean>(true);
  const [creditsFetchError, setCreditsFetchError] = useState<boolean>(false);

  // Hydrate user's Deep AI Credit Balance on Practice Mode startup
  const fetchCreditBalance = useCallback(async () => {
  console.time('[TestPerf] CreditBalance');
    if (!userId || mode !== 'practice') {
      setCreditsLoading(false);
      return;
    }
    setCreditsLoading(true);
    setCreditsFetchError(false);

    let timedOut = false;
    const timeoutId = setTimeout(() => {
      timedOut = true;
      setCreditsLoading(false);
      setCreditsFetchError(true);
    }, 5000);

    try {
      const [statusRes, creditRes] = await Promise.all([
        apiGetDeepAIStatus(userId).catch(() => null),
        apiGetCredits(userId).catch(() => null),
      ]);
      if (timedOut) return;
      clearTimeout(timeoutId);

      if (statusRes) {
        setDeepAIStatus(statusRes);
      }
      if (creditRes && typeof creditRes.total === 'number') {
        setCreditsBalance(creditRes.total);
      } else if (statusRes && typeof statusRes.remainingCredits === 'number') {
        setCreditsBalance(statusRes.remainingCredits);
      }
    } catch (err) {
      if (!timedOut) {
        setCreditsFetchError(true);
      }
    } finally {
      if (!timedOut) {
        clearTimeout(timeoutId);
        setCreditsLoading(false);
      }
    }
  }, [userId, mode]);

  useEffect(() => {
    fetchCreditBalance();
  }, [fetchCreditBalance]);
  // Deep AI UI Workspace State
  const [deepAIViewState, setDeepAIViewState] = useState<Record<string, 'CLOSED' | 'ENTRY' | 'HINT' | 'SOLUTION' | 'CHAT'>>({});
  const [deepAIHintIndex, setDeepAIHintIndex] = useState<Record<string, number>>({});
  const [deepAIChatInput, setDeepAIChatInput] = useState<string>('');
  const [deepAIChatMessages, setDeepAIChatMessages] = useState<Record<string, Array<{ sender: 'user' | 'ai'; text: string; time: string }>>>({});
  const [deepAIResponding, setDeepAIResponding] = useState<Record<string, boolean>>({});
  const [deepAILoading, setDeepAILoading] = useState<Record<string, boolean>>({});
  const [deepAIError, setDeepAIError] = useState<Record<string, string>>({});
  const [deepAIHelpData, setDeepAIHelpData] = useState<Record<string, any>>({});
  const [showDeepAIPremiumModal, setShowDeepAIPremiumModal] = useState<boolean>(false);

  const [userWeeklyXp, setUserWeeklyXp] = useState<number>(10);
  const [hintState, setHintState] = useState<Record<string, 'IDLE' | 'CONFIRM' | 'REVEALED'>>({});
  const [hintLoading, setHintLoading] = useState<Record<string, boolean>>({});
  const [hintContent, setHintContent] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!userId) return;
    apiGetWeeklyXP(userId)
      .then((res) => {
        if (res && typeof res.weeklyXp === 'number') {
          setUserWeeklyXp(res.weeklyXp);
        }
      })
      .catch(() => {});
  }, [userId]);

  const handleConfirmHint = async (q: Question) => {
    if (!q || !q.id || hintLoading[q.id]) return;
    if (userWeeklyXp < HINT_WEEKLY_XP_COST) return;

    setHintLoading((prev) => ({ ...prev, [q.id]: true }));

    try {
      const selectedOpt = selectedAnswers[q.id];
      const hintRes = await apiGetQuestionHint(q.id, selectedOpt);
      const text = hintRes?.hint;

      await apiDeductWeeklyXP(userId, HINT_WEEKLY_XP_COST);
      setUserWeeklyXp((prev) => Math.max(0, prev - HINT_WEEKLY_XP_COST));

      setHintContent((prev) => ({
        ...prev,
        [q.id]: text || q.hint || q.shortcutFormula || `For this ${q.topic || 'problem'} question, analyze how the stated parameters interact.`,
      }));
      setHintState((prev) => ({ ...prev, [q.id]: 'REVEALED' }));
    } catch {
      // Do NOT charge Weekly XP on generation failure
      setHintContent((prev) => ({
        ...prev,
        [q.id]: q.hint || q.shortcutFormula || `For this ${q.topic || 'problem'} question, analyze how the stated parameters interact.`,
      }));
      setHintState((prev) => ({ ...prev, [q.id]: 'REVEALED' }));
    } finally {
      setHintLoading((prev) => ({ ...prev, [q.id]: false }));
    }
  };


  const handleOpenDeepAI = async (q: Question) => {
    if (!q || !q.id) return;

    setDeepAIViewState((prev) => ({
      ...prev,
      [q.id]: prev[q.id] && prev[q.id] !== 'CLOSED' ? prev[q.id] : 'ENTRY',
    }));

    try {
      setDeepAILoading((prev) => ({ ...prev, [q.id]: true }));
      setDeepAIError((prev) => ({ ...prev, [q.id]: '' }));
      const res = await apiAskDeepAI(userId, {
        question: q,
        action: 'init',
        assessmentId: test.id,
        mode,
      });
      if (typeof res.creditsLeft === 'number') {
        setCreditsBalance(res.creditsLeft);
        window.dispatchEvent(new CustomEvent('firstround:credits-updated', { detail: { credits: res.creditsLeft } }));
      }
      if (typeof res.isUnlocked === 'boolean') {
        setDeepAIHelpData((prev) => ({
          ...prev,
          [q.id]: { ...(prev[q.id] || {}), isUnlocked: res.isUnlocked },
        }));
      }
    } catch (err: any) {
      if (err.isLocked || err.insufficientCredits) {
        setCreditsBalance(0);
        window.dispatchEvent(new CustomEvent('firstround:credits-updated', { detail: { credits: 0 } }));
      } else {
        setDeepAIError((prev) => ({ ...prev, [q.id]: err.message || 'Failed to initialize Deep AI' }));
      }
    } finally {
      setDeepAILoading((prev) => ({ ...prev, [q.id]: false }));
    }
  };

  const handleFetchDeepAIAction = async (q: Question, requestType: 'hint' | 'solution' | 'chat', userQuery?: string) => {
    if (!q || !q.id) return;

    const isUnlocked = deepAIHelpData[q.id]?.isUnlocked;
    if (requestType !== 'hint' && !isUnlocked && creditsBalance <= 0) {
      setCreditsBalance(0);
      return { isUnlocked: false, creditsLeft: 0, insufficientCredits: true };
    }

    try {
      setDeepAILoading((prev) => ({ ...prev, [q.id]: true }));
      setDeepAIError((prev) => ({ ...prev, [q.id]: '' }));
      const res = await apiAskDeepAI(userId, {
        question: q,
        userSelectedOption: selectedAnswers[q.id],
        studentQuestion: userQuery,
        requestType,
        assessmentId: test.id,
        mode,
      });
      setDeepAIHelpData((prev) => ({ ...prev, [q.id]: { ...res, isUnlocked: true } }));
      if (typeof res.creditsLeft === 'number') {
        setCreditsBalance(res.creditsLeft);
        window.dispatchEvent(new CustomEvent('firstround:credits-updated', { detail: { credits: res.creditsLeft } }));
      }
      return res;
    } catch (err: any) {
      if (err.isLocked || err.insufficientCredits) {
        setCreditsBalance(0);
        window.dispatchEvent(new CustomEvent('firstround:credits-updated', { detail: { credits: 0 } }));
        setDeepAIHelpData((prev) => ({ ...prev, [q.id]: { ...(prev[q.id] || {}), isUnlocked: false } }));
      } else {
        setDeepAIError((prev) => ({ ...prev, [q.id]: err.message || 'Failed to fetch Deep AI guidance' }));
      }
    } finally {
      setDeepAILoading((prev) => ({ ...prev, [q.id]: false }));
    }
  };

  const handleSendDeepAIChat = async (q: Question) => {
    if (!deepAIChatInput.trim() || deepAIResponding[q.id]) return;
    const userMsgText = deepAIChatInput.trim();

    if (!deepAIHelpData[q.id]?.isUnlocked && creditsBalance <= 0) {
      setCreditsBalance(0);
      return;
    }

    setDeepAIChatInput('');
    const timestamp = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

    setDeepAIChatMessages((prev) => ({
      ...prev,
      [q.id]: [...(prev[q.id] || []), { sender: 'user', text: userMsgText, time: timestamp }],
    }));

    setDeepAIResponding((prev) => ({ ...prev, [q.id]: true }));

    try {
      const res = await handleFetchDeepAIAction(q, 'chat', userMsgText);
      if (res?.insufficientCredits) {
        setDeepAIChatMessages((prev) => ({
          ...prev,
          [q.id]: [...(prev[q.id] || []), { sender: 'ai', text: "You're out of AI credits. Purchase AI credits to continue Deep Chat.", time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) }],
        }));
        return;
      }
      const aiReply = res?.explanation || (Array.isArray(res?.hints) ? res.hints[0] : null) || 'Let us analyze this step by step. What formula or concept applies here?';

      setDeepAIChatMessages((prev) => ({
        ...prev,
        [q.id]: [...(prev[q.id] || []), { sender: 'ai', text: aiReply, time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) }],
      }));
    } catch (err) {
      setDeepAIChatMessages((prev) => ({
        ...prev,
        [q.id]: [...(prev[q.id] || []), { sender: 'ai', text: 'Apologies, I encountered an issue analyzing your query. Please try asking again.', time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) }],
      }));
    } finally {
      setDeepAIResponding((prev) => ({ ...prev, [q.id]: false }));
    }
  };

  // Submit confirmation modal
  const [isSubmitModalOpen, setIsSubmitModalOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Exam mode leave confirmation modal
  const [isLeaveExamModalOpen, setIsLeaveExamModalOpen] = useState(false);

  // Coding Layout Drawer (Desktop)
  const [isCodingDrawerOpen, setIsCodingDrawerOpen] = useState(false);

  const currentQ = questions[currentIndex];
  // [TestPerf] FirstQuestion becoming available
  useEffect(() => {
    if (currentQ) {
      console.time('[TestPerf] FirstQuestion');
    }
  }, [currentQ]);
  const isCodingLayout = currentQ?.questionType === 'CODING';

  // Back button handler: Instant back for Practice, Confirmation modal for Exam
  const handleBackClick = () => {
    if (mode === 'exam') {
      setIsLeaveExamModalOpen(true);
    } else {
      // In practice mode, returns immediately without interrupting prompt
      onExit();
    }
  };

  // Auto-save progress to localStorage on updates
  useEffect(() => {
    if (!storageKey) return;
    const answeredCount = Object.values(selectedAnswers).filter(Boolean).length;
    if (answeredCount > 0 || elapsedSeconds > 0) {
      try {
        localStorage.setItem(
          storageKey,
          JSON.stringify({
            testId: test.id,
            testTitle: test.title,
            mode,
            attemptId,
            currentIndex,
            selectedAnswers,
            codingSolvedStates,
            markedForReview,
            visitedQuestions,
            timeSpentPerQuestion,
            secondsRemaining,
            elapsedSeconds,
            answeredCount,
            totalQuestions,
            violationCount,
            isTerminated,
            updatedAt: new Date().toISOString(),
          })
        );
      } catch (e) {
        console.error('Error saving in-progress state:', e);
      }
    }
  }, [
    storageKey,
    test.id,
    test.title,
    mode,
    attemptId,
    currentIndex,
    selectedAnswers,
    codingSolvedStates,
    markedForReview,
    visitedQuestions,
    timeSpentPerQuestion,
    secondsRemaining,
    elapsedSeconds,
    violationCount,
    isTerminated,
  ]);

  // Timer Effect
  useEffect(() => {
    const timer = setInterval(() => {
      setElapsedSeconds((prev) => prev + 1);

      if (mode === 'exam') {
        setSecondsRemaining((prev) => {
          if (prev <= 1) {
            clearInterval(timer);
            handleFinalSubmit();
            return 0;
          }
          return prev - 1;
        });
      }

      // Track time per active question
      if (currentQ) {
        setTimeSpentPerQuestion((prev) => ({
          ...prev,
          [currentQ.id]: (prev[currentQ.id] || 0) + 1,
        }));
      }
    }, 1000);

    return () => clearInterval(timer);
  }, [mode, currentQ?.id]);

  // Track visited when index changes
  useEffect(() => {
    if (currentQ) {
      setVisitedQuestions((prev) => ({
        ...prev,
        [currentQ.id]: true,
      }));
    }
  }, [currentIndex, currentQ?.id]);

  // Navigation handlers
  // [TestPerf] FirstQuestion rendered end
useEffect(() => {
  if (currentQ) {
    console.timeEnd('[TestPerf] FirstQuestion');
  }
}, [currentQ]);

const handleNext = () => {
    if (currentIndex < totalQuestions - 1) {
      setCurrentIndex((prev) => prev + 1);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  };

  const handlePrev = () => {
    if (currentIndex > 0) {
      setCurrentIndex((prev) => prev - 1);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  };

  const handleSelectOption = (optionId: 'A' | 'B' | 'C' | 'D') => {
    if (!currentQ) return;
    setSelectedAnswers((prev) => ({
      ...prev,
      [currentQ.id]: prev[currentQ.id] === optionId ? null : optionId,
    }));
  };

  const handleClearResponse = () => {
    if (!currentQ) return;
    if (currentQ.questionType === 'CODING') {
      setCodingSolvedStates((prev) => ({
        ...prev,
        [currentQ.id]: false,
      }));
      try {
        const modeKey = mode === 'practice' ? `${test.id || 'practice'}_practice` : (test.id || 'exam');
        localStorage.removeItem(`coding_state:${userId}:${modeKey}:${currentQ.id}`);
      } catch {}
    } else {
      setSelectedAnswers((prev) => ({
        ...prev,
        [currentQ.id]: null,
      }));
    }
  };

  const handleToggleReview = () => {
    if (!currentQ) return;
    setMarkedForReview((prev) => ({
      ...prev,
      [currentQ.id]: !prev[currentQ.id],
    }));
  };

  const handleBookmark = async () => {
    if (!currentQ) return;
    const isNowBookmarked = await onToggleBookmark(currentQ.id);
    setBookmarkedIds((prev) => {
      const next = new Set(prev);
      if (isNowBookmarked) {
        next.add(currentQ.id);
      } else {
        next.delete(currentQ.id);
      }
      return next;
    });
  };

  // Submit test
  const handleFinalSubmit = () => {
    if (isSubmitting) return;
    setIsSubmitting(true);
    if (storageKey) {
      try {
        localStorage.removeItem(storageKey);
      } catch {}
    }
    const responses: QuestionResponse[] = questions.map((q) => {
      let selectedOption: any = null;
      if (q.questionType === 'CODING') {
        selectedOption = codingSolvedStates[q.id] ? 'A' : null;
      } else {
        selectedOption = selectedAnswers[q.id] || null;
      }
      return {
        questionId: q.id,
        selectedOption,
        timeSpentSeconds: timeSpentPerQuestion[q.id] || 0,
      };
    });

    if (mode === 'exam') {
      questions.forEach((q) => {
        if (q.questionType === 'CODING') {
          try {
            const modeKey = mode === 'practice' ? `${test.id || 'practice'}_practice` : (test.id || 'exam');
            localStorage.removeItem(`coding_state:${userId}:${modeKey}:${q.id}`);
          } catch {}
        }
      });
    }

    onSubmit(responses, elapsedSeconds);
  };

  // Format timer
  const formatTime = (secs: number) => {
    const m = Math.floor(secs / 60);
    const s = secs % 60;
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  // Stats for palette summary
  const answeredCount = questions.filter(q => 
    q.questionType === 'CODING' ? Boolean(codingSolvedStates[q.id]) : Boolean(selectedAnswers[q.id])
  ).length;
  const reviewCount = Object.entries(markedForReview).filter(([_, v]) => v).length;
  const unansweredCount = totalQuestions - answeredCount;
  const unvisitedCount = Math.max(0, totalQuestions - Object.keys(visitedQuestions).length);

  const isBookmarked = currentQ ? bookmarkedIds.has(currentQ.id) : false;

  if (!questions || questions.length === 0) {
    return (
      <div id="test-empty-questions-state" className="min-h-screen bg-slate-950 flex items-center justify-center p-4 font-['Plus_Jakarta_Sans']">
        <div className="bg-slate-900 border border-slate-800 rounded-3xl p-8 max-w-md w-full text-center space-y-4 shadow-2xl text-white">
          <div className="w-14 h-14 rounded-2xl bg-amber-500/10 border border-amber-500/20 text-amber-400 flex items-center justify-center mx-auto">
            <AlertCircle className="w-7 h-7" />
          </div>
          <div className="space-y-1.5">
            <h3 className="text-lg font-bold font-['Outfit'] text-white">Assessment Questions Unavailable</h3>
            <p className="text-xs text-slate-400 leading-relaxed">
              Questions for "{test?.title || 'this assessment'}" are currently being prepared. Please try again or select another test.
            </p>
          </div>
          <button
            id="empty-test-exit-btn"
            onClick={onExit}
            className="w-full py-3 bg-primary hover:bg-primary-hover text-white font-bold text-xs rounded-xl shadow-xs transition-colors cursor-pointer"
          >
            Return to TestHub
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 flex flex-col font-['Plus_Jakarta_Sans'] antialiased selection:bg-amber-400 selection:text-slate-950">
      {/* 1. STICKY TOP EXAM HEADER (Mobile-First Single Row + Desktop Accommodating) */}
      <header
        id="active-test-header"
        className="sticky top-0 z-40 bg-primary border-b border-primary-dark px-2.5 sm:px-4 lg:px-6 py-2.5 sm:py-3 text-white shadow-md"
      >
        <div className="max-w-7xl mx-auto flex items-center justify-between gap-1.5 sm:gap-4">
          {/* Left: Back / Exit & Title / Q counter */}
          <div className="flex items-center gap-1.5 sm:gap-3 min-w-0 flex-1">
            <button
              id="exit-test-btn"
              onClick={handleBackClick}
              className="p-1.5 sm:p-2 text-slate-300 hover:text-white hover:bg-white/10 active:bg-white/20 rounded-lg sm:rounded-xl transition-colors shrink-0"
              title={mode === 'exam' ? 'Exit Assessment' : 'Back to Tests'}
              aria-label="Back"
            >
              <ArrowLeft className="w-4 h-4 sm:w-5 sm:h-5" />
            </button>

            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1.5 sm:gap-2">
                <h1 className="text-xs sm:text-sm lg:text-base font-bold text-white truncate font-['Outfit'] leading-tight max-w-[120px] sm:max-w-xs md:max-w-md">
                  {test.title}
                </h1>
                {/* Mode Tag */}
                <span
                  id="active-test-mode-badge"
                  className={`uppercase font-black px-1.5 sm:px-2 py-0.5 rounded text-[9px] sm:text-[10px] tracking-wider shrink-0 shadow-2xs ${
                    mode === 'exam'
                      ? 'bg-rose-500/25 text-rose-300 border border-rose-500/40'
                      : 'bg-emerald-500/25 text-emerald-300 border border-emerald-500/40'
                  }`}
                >
                  {mode === 'exam' ? 'EXAM MODE' : 'PRACTICE MODE'}
                </span>
                {mode === 'exam' && (
                  <span
                    id="active-test-integrity-badge"
                    className="bg-emerald-500/25 text-emerald-300 border border-emerald-500/40 uppercase font-black px-1.5 sm:px-2 py-0.5 rounded text-[9px] sm:text-[10px] tracking-wider shrink-0 shadow-2xs flex items-center gap-1"
                    title="Assessment Integrity Monitoring Active"
                  >
                    <ShieldCheck className="w-3 h-3 text-emerald-400 shrink-0" />
                    <span className="hidden sm:inline">Integrity: Monitored</span>
                    <span className="sm:hidden">Monitored</span>
                  </span>
                )}
              </div>
              <div className="flex items-center gap-1.5 text-[10px] sm:text-[11px] text-slate-300 mt-0.5">
                <span className="font-bold text-amber-400">
                  Q {currentIndex + 1}/{totalQuestions}
                </span>
                <span className="hidden xs:inline text-slate-400">•</span>
                <span className="hidden xs:inline text-slate-300 truncate max-w-[100px] sm:max-w-none">
                  {currentQ?.topic || test.category}
                </span>
              </div>
            </div>
          </div>

          {/* Right: Toolkit (Practice Only) + Questions Trigger (Mobile) + Timer + Submit */}
          <div className="flex items-center gap-1.5 sm:gap-3 shrink-0">
            {/* Placement Toolkit (Rendered ONLY in Practice Mode) */}
            {mode === 'practice' && (
              <button
                id="open-toolkit-btn"
                onClick={() => {
                  setIsToolkitOpen(true);
                  if (onOpenScratchpad) onOpenScratchpad();
                }}
                title="Placement Toolkit (Notes, Formulas, Solver)"
                className="p-1.5 sm:px-3 sm:py-1.5 bg-primary-hover hover:bg-primary-hover active:bg-primary-active border border-primary-border text-slate-200 text-xs font-semibold rounded-lg sm:rounded-xl transition-colors shadow-2xs flex items-center gap-1.5 shrink-0"
              >
                <Zap className="w-3.5 h-3.5 text-amber-400 fill-amber-400 shrink-0" />
                <span className="hidden sm:inline">Toolkit</span>
              </button>
            )}

            {/* Questions Palette Drawer Trigger (hidden on lg for MCQ, visible for Coding layout) */}
            <button
              id="mobile-palette-toggle-btn"
              onClick={() => {
                if (isCodingLayout && window.innerWidth >= 1024) {
                  setIsCodingDrawerOpen(!isCodingDrawerOpen);
                } else {
                  setIsMobilePaletteOpen(true);
                }
              }}
              className={`${isCodingLayout ? 'flex' : 'flex lg:hidden'} p-1.5 sm:px-2.5 sm:py-1.5 bg-primary-hover hover:bg-primary-hover active:bg-primary-active border border-primary-border text-slate-200 text-xs font-bold rounded-lg sm:rounded-xl transition-colors items-center gap-1`}
              title="View all questions"
            >
              <Grid className="w-3.5 h-3.5 text-sky-400 shrink-0" />
              <span className="hidden xs:inline text-[11px]">Questions</span>
            </button>

            {/* Countdown / Elapsed Timer */}
            <div
              id="test-timer-badge"
              className={`flex items-center gap-1 sm:gap-1.5 px-2 sm:px-3 py-1 sm:py-1.5 rounded-lg sm:rounded-xl font-mono text-xs sm:text-sm font-bold border transition-colors shrink-0 ${
                mode === 'exam' && secondsRemaining < 180
                  ? 'bg-red-500/20 border-red-400 text-red-300 animate-pulse'
                  : 'bg-primary-dark border-primary-border text-amber-300'
              }`}
            >
              <Clock className="w-3 h-3 sm:w-3.5 sm:h-3.5 text-amber-400 shrink-0" />
              <span className="tabular-nums">
                {mode === 'exam' ? formatTime(secondsRemaining) : formatTime(elapsedSeconds)}
              </span>
            </div>

            {/* Submit Test Button */}
            <button
              id="submit-test-btn"
              onClick={() => setIsSubmitModalOpen(true)}
              className="px-2.5 sm:px-4 py-1.5 sm:py-2 bg-amber-400 hover:bg-amber-300 active:bg-amber-500 text-slate-950 font-extrabold text-xs rounded-lg sm:rounded-xl shadow-xs transition-all flex items-center gap-1 shrink-0 active:scale-[0.98]"
            >
              <CheckCircle2 className="w-3.5 h-3.5 text-slate-950 shrink-0" />
              <span className="hidden sm:inline">Submit Test</span>
              <span className="sm:hidden">Submit</span>
            </button>
          </div>
        </div>
      </header>

      {/* 2. MAIN WORKSPACE LAYOUT */}
      {isCodingLayout ? (
        <main className="flex-1 w-full mx-auto relative flex flex-col lg:flex-row h-[calc(100vh-64px)] overflow-hidden bg-slate-900 pb-14 lg:pb-0">
          <div className="flex-1 min-w-0 flex flex-col h-full overflow-hidden">
            {(() => {
              const CodingEnv = CodingEnvironmentRegistry.resolve(currentQ);
              return (
                <CodingEnv
                  question={currentQ}
                  userId={userId}
                  testSeriesId={test.id}
                  mode={mode}
                  onSubmissionSuccess={handleCodingSubmissionSuccess}
                />
              );
            })()}
          </div>
        </main>
      ) : (
        <main className="flex-1 max-w-7xl w-full mx-auto p-3 sm:p-5 lg:p-6 pb-28 sm:pb-28 lg:pb-8 grid grid-cols-1 lg:grid-cols-12 gap-4 lg:gap-6 items-start">

        {/* LEFT COLUMN (lg:col-span-8): Question Metadata, Text, Options, Practice Solution */}
        <div className="lg:col-span-8 space-y-4">
          <div className="bg-white border border-slate-200/90 rounded-2xl p-4 sm:p-6 lg:p-7 shadow-xs space-y-5">
            {/* Question Header & Meta Strip */}
            <div className="flex flex-wrap items-center justify-between gap-3 pb-4 border-b border-slate-100">
              <div className="flex flex-wrap items-center gap-2 min-w-0">
                <span className="px-3 py-1 bg-primary text-white text-xs font-bold rounded-lg shadow-2xs tracking-wide">
                  Question {currentIndex + 1} of {totalQuestions}
                </span>
                <span className="px-2.5 py-1 bg-sky-50 text-sky-800 border border-sky-200/80 text-xs font-bold rounded-lg truncate max-w-[140px] sm:max-w-none">
                  {currentQ?.topic || 'Aptitude'}
                </span>
                {currentQ?.subTopic && (
                  <span className="px-2.5 py-1 bg-slate-100 text-slate-700 text-xs font-medium rounded-lg truncate max-w-[120px] sm:max-w-none">
                    {currentQ.subTopic}
                  </span>
                )}
                {currentQ?.companyTag && (
                  <span className="hidden xs:inline-flex items-center px-2.5 py-1 bg-indigo-50 text-indigo-700 border border-indigo-200 text-xs font-semibold rounded-lg">
                    {currentQ.companyTag}
                  </span>
                )}
              </div>

              {/* Bookmark Action */}
              <button
                id="bookmark-toggle-btn"
                onClick={handleBookmark}
                className={`px-3 py-1.5 rounded-xl border text-xs font-semibold flex items-center gap-1.5 transition-all shrink-0 active:scale-95 ${
                  isBookmarked
                    ? 'bg-amber-50 text-amber-900 border-amber-300 shadow-2xs'
                    : 'bg-slate-50 hover:bg-slate-100 text-slate-600 border-slate-200'
                }`}
                title={isBookmarked ? 'Remove Bookmark' : 'Bookmark Question'}
              >
                {isBookmarked ? (
                  <BookmarkCheck className="w-4 h-4 text-amber-600 fill-amber-500" />
                ) : (
                  <Bookmark className="w-4 h-4 text-slate-400" />
                )}
                <span>{isBookmarked ? 'Saved to Vault' : 'Save for Revision'}</span>
              </button>
            </div>

            {/* Question Body */}
            <>
              <div className="space-y-4">
                  <div className="text-slate-900 text-base sm:text-lg font-semibold leading-relaxed whitespace-pre-line">
                    {currentQ?.questionText}
                  </div>

                  {/* Technical Code Snippet (if provided) */}
                  {currentQ?.codeSnippet && (
                    <div className="p-4 bg-slate-900 rounded-xl border border-slate-800 font-mono text-xs sm:text-sm text-sky-300 overflow-x-auto whitespace-pre leading-relaxed shadow-inner">
                      {currentQ.codeSnippet}
                    </div>
                  )}
                </div>

                {/* Answer Options */}
                <div className="space-y-2.5 pt-2">
                  <label className="text-xs font-bold uppercase tracking-wider text-slate-400">
                    Select One Option
                  </label>
                  <div className="space-y-2.5">
                    {(currentQ && 'options' in currentQ ? (currentQ as import('../types').MCQQuestion).options : [])?.map((opt) => {
                      const isSelected = selectedAnswers[currentQ.id] === opt.id;

                      let optionStyle = 'border-slate-200 hover:border-slate-300 bg-white hover:bg-slate-50 text-slate-800';
                      if (isSelected) {
                        optionStyle = 'border-amber-400 bg-amber-50/90 text-slate-950 font-semibold shadow-xs ring-2 ring-amber-400/80';
                      }

                      return (
                        <button
                          key={opt.id}
                          id={`option-choice-${opt.id.toLowerCase()}`}
                          onClick={() => handleSelectOption(opt.id)}
                          className={`w-full min-h-[50px] p-3.5 sm:p-4 rounded-xl border text-left transition-all flex items-center gap-3.5 ${optionStyle} group active:scale-[0.995]`}
                        >
                          <div
                            className={`w-8 h-8 rounded-lg font-extrabold text-xs flex items-center justify-center shrink-0 transition-colors ${
                              isSelected
                                ? 'bg-amber-400 text-slate-950 shadow-2xs'
                                : 'bg-slate-100 text-slate-600 group-hover:bg-slate-200'
                            }`}
                          >
                            {opt.id}
                          </div>
                          <span className="text-xs sm:text-sm text-slate-800 flex-1 leading-relaxed break-words">
                            {opt.text}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              </>

            {/* PRACTICE MODE LEARNING ASSISTANCE FLOW */}
            {mode === 'practice' && currentQ && (
              <div className="pt-4 border-t border-slate-150">
                {hintState[currentQ.id] === 'REVEALED' ? (
                  /* REVEALED HINT CARD */
                  <div className="p-4 bg-amber-500/5 rounded-2xl border border-amber-500/20 space-y-3 animate-in fade-in duration-200">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-extrabold text-amber-800 flex items-center gap-1.5 font-['Outfit']">
                        <Lightbulb className="w-4 h-4 text-amber-600" />
                        <span>Hint</span>
                      </span>
                      <span className="text-[10px] font-semibold text-slate-400">
                        Practice Guidance
                      </span>
                    </div>

                    <p className="text-xs text-slate-800 leading-relaxed font-medium">
                      {hintContent[currentQ.id] || currentQ.hint || currentQ.shortcutFormula || 'Focus on the core concept and invariant properties before evaluating choices.'}
                    </p>

                    <div className="flex items-center justify-between pt-2 border-t border-amber-500/10">
                      <span className="text-[11px] text-slate-500 italic">
                        Try solving with this clue before checking full solution.
                      </span>
                      <button
                        id="open-deep-ai-from-hint-btn"
                        onClick={() => {
                          if (creditsFetchError) {
                            fetchCreditBalance();
                          } else if (creditsBalance <= 0 && deepAIStatus?.status === 'locked') {
                            setShowDeepAIPremiumModal(true);
                          } else {
                            handleOpenDeepAI(currentQ);
                          }
                        }}
                        className="px-3.5 py-1.5 bg-slate-900 hover:bg-slate-800 text-amber-300 hover:text-white text-xs font-extrabold rounded-xl transition-all flex items-center gap-1.5 shadow-2xs cursor-pointer active:scale-95"
                      >
                        <Sparkles className="w-3.5 h-3.5 text-amber-400 fill-amber-400" />
                        <span>Deep AI</span>
                      </button>
                    </div>
                  </div>
                ) : hintState[currentQ.id] === 'CONFIRM' ? (
                  /* CONFIRMATION CARD */
                  <div className="p-4 bg-amber-50/90 rounded-2xl border border-amber-300 space-y-3 animate-in fade-in duration-200">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Lightbulb className="w-4 h-4 text-amber-700 shrink-0" />
                        <span className="text-xs font-bold text-slate-900 font-['Outfit']">Hint Confirmation</span>
                      </div>
                      <span className="text-[10px] font-bold text-slate-500">
                        Weekly XP available: {userWeeklyXp}
                      </span>
                    </div>

                    <p className="text-xs text-slate-700 leading-relaxed font-medium">
                      Get a small conceptual clue without revealing the solution.
                    </p>

                    {userWeeklyXp < HINT_WEEKLY_XP_COST ? (
                      <div className="p-2.5 bg-rose-50 border border-rose-200 rounded-xl text-[11px] font-semibold text-rose-800 flex items-center justify-between gap-2">
                        <span>Not enough Weekly XP for this hint (Cost: {HINT_WEEKLY_XP_COST} Weekly XP).</span>
                        <button
                          onClick={() => setHintState((prev) => ({ ...prev, [currentQ.id]: 'IDLE' }))}
                          className="px-2.5 py-1 bg-surface border border-slate-300 rounded-lg text-slate-700 hover:bg-slate-100 font-bold"
                        >
                          Dismiss
                        </button>
                      </div>
                    ) : (
                      <div className="flex items-center justify-between pt-1">
                        <span className="text-xs font-extrabold text-amber-800">
                          Cost: {HINT_WEEKLY_XP_COST} Weekly XP
                        </span>
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => setHintState((prev) => ({ ...prev, [currentQ.id]: 'IDLE' }))}
                            className="px-3 py-1.5 bg-surface hover:bg-slate-200 border border-slate-300 text-slate-700 text-xs font-bold rounded-xl transition-all cursor-pointer"
                          >
                            Cancel
                          </button>
                          <button
                            id="confirm-hint-btn"
                            onClick={() => handleConfirmHint(currentQ)}
                            disabled={hintLoading[currentQ.id]}
                            className="px-4 py-1.5 bg-amber-400 hover:bg-amber-300 active:bg-amber-500 text-slate-950 text-xs font-black rounded-xl transition-all shadow-2xs flex items-center gap-1 cursor-pointer disabled:opacity-50 active:scale-95"
                          >
                            {hintLoading[currentQ.id] ? 'Unlocking...' : 'Get Hint'}
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                ) : (
                  /* INITIAL COMPACT CARD */
                  <div className="p-3.5 bg-amber-50/60 hover:bg-amber-50 rounded-2xl border border-amber-200/80 flex items-center justify-between gap-3 transition-colors">
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div className="w-8 h-8 rounded-xl bg-amber-100 text-amber-800 flex items-center justify-center shrink-0 font-bold">
                        <Lightbulb className="w-4 h-4 text-amber-700" />
                      </div>
                      <div className="min-w-0">
                        <span className="text-xs font-bold text-slate-800 block">Need a hint?</span>
                        <span className="text-[11px] text-slate-500 block truncate">Get a small clue to guide your thinking.</span>
                      </div>
                    </div>
                    <button
                      id="request-hint-btn"
                      onClick={() => setHintState((prev) => ({ ...prev, [currentQ.id]: 'CONFIRM' }))}
                      className="px-3.5 py-1.5 bg-amber-400 hover:bg-amber-300 active:bg-amber-500 text-slate-950 text-xs font-extrabold rounded-xl transition-all shadow-2xs shrink-0 flex items-center gap-1 cursor-pointer active:scale-95"
                    >
                      <span>Get Hint</span>
                      <ArrowRight className="w-3.5 h-3.5" />
                    </button>
                  </div>
                )}

                {deepAIError[currentQ?.id] && (
                  <div className="mt-2 p-3 bg-rose-50 border border-rose-200 rounded-xl text-rose-800 text-xs font-semibold">
                    {deepAIError[currentQ.id]}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* RIGHT COLUMN (lg:col-span-4): Sticky Question Navigator OR Deep AI Workspace */}
        <div className="hidden lg:block lg:col-span-4">
          {deepAIViewState[currentQ?.id] && deepAIViewState[currentQ?.id] !== 'CLOSED' ? (
            <div className="sticky top-[68px] max-h-[calc(100vh-84px)] flex flex-col bg-slate-900 border border-slate-800 rounded-2xl shadow-xl overflow-hidden text-white">
              {/* Top Header & Compact Navigation Strip */}
              <div className="p-3 bg-slate-950 border-b border-slate-800 flex items-center justify-between shrink-0">
                <div className="flex items-center gap-2 min-w-0">
                  <Sparkles className="w-4 h-4 text-amber-400 fill-amber-400 shrink-0" />
                  <span className="font-extrabold text-xs font-['Outfit'] text-white truncate">Deep AI Tutor</span>
                  <span className="text-[10px] px-2 py-0.5 rounded bg-slate-800 text-amber-300 font-mono border border-slate-700 shrink-0">
                    Q{currentIndex + 1}/{totalQuestions}
                  </span>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <button
                    onClick={() => handleNavigate(Math.max(0, currentIndex - 1))}
                    disabled={currentIndex === 0}
                    className="p-1 hover:bg-slate-800 rounded text-slate-400 hover:text-white disabled:opacity-30 transition-colors cursor-pointer"
                    title="Previous Question"
                  >
                    <ChevronLeft className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => handleNavigate(Math.min(totalQuestions - 1, currentIndex + 1))}
                    disabled={currentIndex === totalQuestions - 1}
                    className="p-1 hover:bg-slate-800 rounded text-slate-400 hover:text-white disabled:opacity-30 transition-colors cursor-pointer"
                    title="Next Question"
                  >
                    <ChevronRight className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => setDeepAIViewState((prev) => ({ ...prev, [currentQ.id]: 'CLOSED' }))}
                    className="p-1 hover:bg-rose-500/20 text-slate-400 hover:text-rose-400 rounded transition-colors ml-1 cursor-pointer"
                    title="Close Deep AI & return to Navigator"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              </div>

              {/* Workspace Content */}
              <div className="flex-1 min-h-0 overflow-y-auto p-4 space-y-4">
                {/* 1. ENTRY VIEW */}
                {deepAIViewState[currentQ.id] === 'ENTRY' && (
                  <div className="space-y-4 animate-in fade-in duration-200">
                    <div className="space-y-1">
                      <h3 className="text-sm font-bold text-white font-['Outfit'] flex items-center gap-2">
                        How do you want help?
                      </h3>
                      <p className="text-xs text-slate-400 font-medium">
                        Select an option below to guide your learning on Question {currentIndex + 1}.
                      </p>
                    </div>

                    <div className="space-y-2.5 pt-1">
                      <button
                        onClick={async () => {
                          setDeepAIViewState((prev) => ({ ...prev, [currentQ.id]: 'HINT' }));
                          if (!deepAIHelpData[currentQ.id]?.hints) {
                            await handleFetchDeepAIAction(currentQ, 'hint');
                          }
                        }}
                        className="w-full p-3.5 bg-slate-800/80 hover:bg-slate-800 border border-slate-700/80 hover:border-amber-400/50 rounded-xl text-left transition-all group flex items-start gap-3 cursor-pointer"
                      >
                        <div className="w-8 h-8 rounded-lg bg-amber-400/10 border border-amber-400/30 text-amber-400 flex items-center justify-center shrink-0 group-hover:scale-105 transition-transform">
                          <Lightbulb className="w-4 h-4" />
                        </div>
                        <div>
                          <span className="font-bold text-xs text-amber-300 group-hover:text-amber-200 block">Hint</span>
                          <span className="text-[11px] text-slate-400 font-normal leading-relaxed block">Get a small conceptual clue without spoiling the solution.</span>
                        </div>
                      </button>

                      <button
                        onClick={async () => {
                          setDeepAIViewState((prev) => ({ ...prev, [currentQ.id]: 'SOLUTION' }));
                          if (!deepAIHelpData[currentQ.id]?.explanation) {
                            await handleFetchDeepAIAction(currentQ, 'solution');
                          }
                        }}
                        className="w-full p-3.5 bg-slate-800/80 hover:bg-slate-800 border border-slate-700/80 hover:border-indigo-400/50 rounded-xl text-left transition-all group flex items-start gap-3 cursor-pointer"
                      >
                        <div className="w-8 h-8 rounded-lg bg-indigo-400/10 border border-indigo-400/30 text-indigo-400 flex items-center justify-center shrink-0 group-hover:scale-105 transition-transform">
                          <BrainCircuit className="w-4 h-4" />
                        </div>
                        <div>
                          <span className="font-bold text-xs text-indigo-300 group-hover:text-indigo-200 block">Solution</span>
                          <span className="text-[11px] text-slate-400 font-normal leading-relaxed block">See the full step-by-step reasoning and calculations.</span>
                        </div>
                      </button>

                      <button
                        onClick={() => {
                          setDeepAIViewState((prev) => ({ ...prev, [currentQ.id]: 'CHAT' }));
                          if (!deepAIChatMessages[currentQ.id]) {
                            setDeepAIChatMessages((prev) => ({
                              ...prev,
                              [currentQ.id]: [
                                {
                                  sender: 'ai',
                                  text: `Hi! I am your Deep AI Socratic Tutor. What part of Question ${currentIndex + 1} would you like to discuss?`,
                                  time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
                                },
                              ],
                            }));
                          }
                        }}
                        className="w-full p-3.5 bg-slate-800/80 hover:bg-slate-800 border border-slate-700/80 hover:border-purple-400/50 rounded-xl text-left transition-all group flex items-start gap-3 cursor-pointer"
                      >
                        <div className="w-8 h-8 rounded-lg bg-purple-400/10 border border-purple-400/30 text-purple-400 flex items-center justify-center shrink-0 group-hover:scale-105 transition-transform">
                          <MessageSquare className="w-4 h-4" />
                        </div>
                        <div>
                          <span className="font-bold text-xs text-purple-300 group-hover:text-purple-200 block">Deep Chat</span>
                          <span className="text-[11px] text-slate-400 font-normal leading-relaxed block">Ask follow-up questions and explore concepts interactively.</span>
                        </div>
                      </button>
                    </div>

                    <div className="pt-2 border-t border-slate-800 flex items-center justify-between text-[11px] text-slate-400">
                      <span>1 credit unlocks full question session</span>
                      <span className="text-amber-400 font-bold">{creditsBalance} credits left</span>
                    </div>
                  </div>
                )}

                {/* 2. HINT VIEW */}
                {deepAIViewState[currentQ.id] === 'HINT' && (
                  <div className="space-y-4 animate-in fade-in duration-200">
                    <div className="flex items-center justify-between pb-2 border-b border-slate-800">
                      <span className="text-xs font-bold text-amber-400 flex items-center gap-1.5">
                        <Lightbulb className="w-4 h-4" /> Socratic Hint
                      </span>
                      <button
                        onClick={() => setDeepAIViewState((prev) => ({ ...prev, [currentQ.id]: 'ENTRY' }))}
                        className="text-[11px] text-slate-400 hover:text-white flex items-center gap-1 cursor-pointer"
                      >
                        <ArrowLeft className="w-3 h-3" /> Back
                      </button>
                    </div>

                    {deepAILoading[currentQ.id] ? (
                      <div className="p-6 text-center text-slate-400 text-xs space-y-2">
                        <Sparkles className="w-6 h-6 text-amber-400 animate-spin mx-auto" />
                        <p>Generating Socratic Hint...</p>
                      </div>
                    ) : (
                      <div className="space-y-4">
                        <div className="p-4 bg-slate-800/90 rounded-xl border border-amber-400/30 text-xs text-slate-200 leading-relaxed font-medium space-y-2">
                          <span className="text-[10px] font-bold uppercase tracking-wider text-amber-300 block">Diagnostic Clue:</span>
                          <p>
                            {Array.isArray(deepAIHelpData[currentQ.id]?.hints) && deepAIHelpData[currentQ.id]?.hints.length > 0
                              ? deepAIHelpData[currentQ.id].hints[(deepAIHintIndex[currentQ.id] || 0) % deepAIHelpData[currentQ.id].hints.length]
                              : 'Analyze the relation between the variables provided in the prompt before comparing option values.'}
                          </p>
                        </div>

                        <div className="space-y-2 pt-2">
                          {Array.isArray(deepAIHelpData[currentQ.id]?.hints) && deepAIHelpData[currentQ.id].hints.length > 1 && (
                            <button
                              onClick={() => setDeepAIHintIndex((prev) => ({ ...prev, [currentQ.id]: (prev[currentQ.id] || 0) + 1 }))}
                              className="w-full py-2 bg-amber-500/20 hover:bg-amber-500/30 border border-amber-500/40 text-amber-300 font-bold text-xs rounded-xl transition-all flex items-center justify-center gap-1.5 cursor-pointer"
                            >
                              <Lightbulb className="w-3.5 h-3.5" /> Another Hint
                            </button>
                          )}

                          <button
                            onClick={async () => {
                              setDeepAIViewState((prev) => ({ ...prev, [currentQ.id]: 'SOLUTION' }));
                              if (!deepAIHelpData[currentQ.id]?.explanation) {
                                await handleFetchDeepAIAction(currentQ, 'solution');
                              }
                            }}
                            className="w-full py-2 bg-indigo-600/30 hover:bg-indigo-600/40 border border-indigo-500/40 text-indigo-300 font-bold text-xs rounded-xl transition-all flex items-center justify-center gap-1.5 cursor-pointer"
                          >
                            <BrainCircuit className="w-3.5 h-3.5" /> Show Solution
                          </button>

                          <button
                            onClick={() => {
                              setDeepAIViewState((prev) => ({ ...prev, [currentQ.id]: 'CHAT' }));
                              if (!deepAIChatMessages[currentQ.id]) {
                                setDeepAIChatMessages((prev) => ({
                                  ...prev,
                                  [currentQ.id]: [
                                    {
                                      sender: 'ai',
                                      text: `Hi! I am your Deep AI Socratic Tutor. What part of Question ${currentIndex + 1} would you like to discuss?`,
                                      time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
                                    },
                                  ],
                                }));
                              }
                            }}
                            className="w-full py-2 bg-purple-600/30 hover:bg-purple-600/40 border border-purple-500/40 text-purple-300 font-bold text-xs rounded-xl transition-all flex items-center justify-center gap-1.5 cursor-pointer"
                          >
                            <MessageSquare className="w-3.5 h-3.5" /> Deep Chat
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {/* 3. SOLUTION VIEW */}
                {deepAIViewState[currentQ.id] === 'SOLUTION' && (
                  <div className="space-y-4 animate-in fade-in duration-200">
                    <div className="flex items-center justify-between pb-2 border-b border-slate-800">
                      <span className="text-xs font-bold text-indigo-400 flex items-center gap-1.5">
                        <BrainCircuit className="w-4 h-4" /> Deep AI Solution
                      </span>
                      <button
                        onClick={() => setDeepAIViewState((prev) => ({ ...prev, [currentQ.id]: 'ENTRY' }))}
                        className="text-[11px] text-slate-400 hover:text-white flex items-center gap-1 cursor-pointer"
                      >
                        <ArrowLeft className="w-3 h-3" /> Back
                      </button>
                    </div>

                    {!deepAIHelpData[currentQ.id]?.isUnlocked && creditsBalance <= 0 ? (
                      <div className="p-4 bg-slate-800/90 border border-amber-400/40 rounded-2xl space-y-3.5 animate-in fade-in duration-200">
                        <div className="flex items-center gap-2">
                          <AlertCircle className="w-4 h-4 text-amber-400 shrink-0" />
                          <span className="text-xs font-bold text-white font-['Outfit']">AI credits required</span>
                        </div>
                        <p className="text-xs text-slate-300 leading-relaxed font-medium">
                          You're out of AI credits. Purchase AI credits to unlock Solution and Deep Chat.
                        </p>
                        <button
                          id="purchase-credits-solution-btn"
                          onClick={() => setShowDeepAIPremiumModal(true)}
                          className="w-full py-2 bg-amber-400 hover:bg-amber-300 text-slate-950 text-xs font-black rounded-xl transition-all shadow-2xs flex items-center justify-center gap-1.5 cursor-pointer active:scale-95"
                        >
                          <Crown className="w-3.5 h-3.5" />
                          <span>Purchase AI Credits</span>
                        </button>
                      </div>
                    ) : deepAILoading[currentQ.id] ? (
                      <div className="p-6 text-center text-slate-400 text-xs space-y-2">
                        <Sparkles className="w-6 h-6 text-indigo-400 animate-spin mx-auto" />
                        <p>Analyzing step-by-step solution...</p>
                      </div>
                    ) : (
                      <div className="space-y-4 text-xs">
                        {deepAIHelpData[currentQ.id]?.conceptualBreakdown && (
                          <div className="p-3 bg-slate-800/80 rounded-xl text-slate-300 border border-slate-700">
                            <span className="font-bold text-amber-300 block mb-1 text-[10px] uppercase tracking-wider">Approach</span>
                            {deepAIHelpData[currentQ.id].conceptualBreakdown}
                          </div>
                        )}

                        {Array.isArray(deepAIHelpData[currentQ.id]?.stepByStep) && deepAIHelpData[currentQ.id].stepByStep.length > 0 && (
                          <div className="space-y-2">
                            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Step-by-Step Breakdown</span>
                            <ol className="space-y-2">
                              {deepAIHelpData[currentQ.id].stepByStep.map((s: string, i: number) => (
                                <li key={i} className="p-2.5 bg-slate-800/60 border border-slate-700/60 rounded-lg text-slate-200 leading-relaxed">
                                  <strong className="text-indigo-300 mr-1.5">Step {i + 1}:</strong> {s}
                                </li>
                              ))}
                            </ol>
                          </div>
                        )}

                        {deepAIHelpData[currentQ.id]?.explanation && (
                          <div className="p-3 bg-slate-800/90 rounded-xl border border-slate-700 text-slate-200 leading-relaxed font-sans whitespace-pre-line">
                            <span className="font-bold text-emerald-400 block mb-1 text-[10px] uppercase tracking-wider">Final Verification</span>
                            {deepAIHelpData[currentQ.id].explanation}
                          </div>
                        )}

                        <button
                          onClick={() => {
                            setDeepAIViewState((prev) => ({ ...prev, [currentQ.id]: 'CHAT' }));
                            if (!deepAIChatMessages[currentQ.id]) {
                              setDeepAIChatMessages((prev) => ({
                                ...prev,
                                [currentQ.id]: [
                                  {
                                    sender: 'ai',
                                    text: `I've provided the detailed solution for Question ${currentIndex + 1}. Do you have any follow-up questions?`,
                                    time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
                                  },
                                ],
                              }));
                            }
                          }}
                          className="w-full py-2 bg-purple-600/30 hover:bg-purple-600/40 border border-purple-500/40 text-purple-300 font-bold text-xs rounded-xl transition-all flex items-center justify-center gap-1.5 cursor-pointer mt-3"
                        >
                          <MessageSquare className="w-3.5 h-3.5" /> Ask Deep AI Follow-up
                        </button>
                      </div>
                    )}
                  </div>
                )}

                {/* 4. DEEP CHAT VIEW */}
                {deepAIViewState[currentQ.id] === 'CHAT' && (
                  <div className="flex flex-col h-[380px] animate-in fade-in duration-200">
                    <div className="flex items-center justify-between pb-2 border-b border-slate-800 shrink-0">
                      <span className="text-xs font-bold text-purple-400 flex items-center gap-1.5">
                        <MessageSquare className="w-4 h-4" /> Deep AI Chat
                      </span>
                      <button
                        onClick={() => setDeepAIViewState((prev) => ({ ...prev, [currentQ.id]: 'ENTRY' }))}
                        className="text-[11px] text-slate-400 hover:text-white flex items-center gap-1 cursor-pointer"
                      >
                        <ArrowLeft className="w-3 h-3" /> Back
                      </button>
                    </div>

                    {!deepAIHelpData[currentQ.id]?.isUnlocked && creditsBalance <= 0 ? (
                      <div className="p-4 bg-slate-800/90 border border-amber-400/40 rounded-2xl space-y-3.5 animate-in fade-in duration-200 mt-3">
                        <div className="flex items-center gap-2">
                          <AlertCircle className="w-4 h-4 text-amber-400 shrink-0" />
                          <span className="text-xs font-bold text-white font-['Outfit']">AI credits required</span>
                        </div>
                        <p className="text-xs text-slate-300 leading-relaxed font-medium">
                          Purchase AI credits to start Deep Chat.
                        </p>
                        <button
                          id="purchase-credits-chat-btn"
                          onClick={() => setShowDeepAIPremiumModal(true)}
                          className="w-full py-2 bg-amber-400 hover:bg-amber-300 text-slate-950 text-xs font-black rounded-xl transition-all shadow-2xs flex items-center justify-center gap-1.5 cursor-pointer active:scale-95"
                        >
                          <Crown className="w-3.5 h-3.5" />
                          <span>Purchase AI Credits</span>
                        </button>
                      </div>
                    ) : (
                      <>
                        <div className="flex-1 overflow-y-auto py-3 space-y-3 pr-1">
                          {(deepAIChatMessages[currentQ.id] || []).map((msg, idx) => (
                            <div key={idx} className={`flex flex-col ${msg.sender === 'user' ? 'items-end' : 'items-start'}`}>
                              <div
                                className={`p-3 rounded-2xl max-w-[88%] text-xs leading-relaxed ${
                                  msg.sender === 'user'
                                    ? 'bg-purple-600 text-white rounded-br-2xs'
                                    : 'bg-slate-800 text-slate-200 border border-slate-700 rounded-bl-2xs'
                                }`}
                              >
                                {msg.text}
                              </div>
                              <span className="text-[9px] text-slate-400 mt-1 px-1">{msg.time}</span>
                            </div>
                          ))}
                          {deepAIResponding[currentQ.id] && (
                            <div className="flex items-center gap-2 text-slate-400 text-xs p-2 bg-slate-800/40 rounded-xl">
                              <Sparkles className="w-3.5 h-3.5 text-purple-400 animate-spin" />
                              <span>Deep AI is analyzing...</span>
                            </div>
                          )}
                        </div>

                        <form
                          onSubmit={(e) => {
                            e.preventDefault();
                            handleSendDeepAIChat(currentQ);
                          }}
                          className="pt-2 border-t border-slate-800 flex items-center gap-2 shrink-0"
                        >
                          <input
                            type="text"
                            value={deepAIChatInput}
                            onChange={(e) => setDeepAIChatInput(e.target.value)}
                            placeholder="Ask follow-up question..."
                            className="flex-1 bg-slate-800 border border-slate-700 text-white placeholder-slate-400 text-xs rounded-xl px-3 py-2 focus:outline-hidden focus:border-purple-400"
                          />
                          <button
                            type="submit"
                            disabled={!deepAIChatInput.trim() || deepAIResponding[currentQ.id]}
                            className="p-2 bg-purple-600 hover:bg-purple-500 disabled:opacity-40 text-white rounded-xl transition-all cursor-pointer"
                          >
                            <Send className="w-4 h-4" />
                          </button>
                        </form>
                      </>
                    )}
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div className="sticky top-[68px] max-h-[calc(100vh-84px)] flex flex-col bg-white border border-slate-200/90 rounded-2xl shadow-xs overflow-hidden">
            {/* 1. Navigator Header with Progress */}
            <div className="p-4 border-b border-slate-150 bg-slate-50/80 shrink-0">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <Grid className="w-4 h-4 text-primary" />
                  <h2 className="text-sm font-bold text-slate-900 font-['Outfit']">Question Navigator</h2>
                </div>
                <span className="text-xs font-bold text-primary bg-white border border-slate-200 px-2 py-0.5 rounded-md">
                  {answeredCount}/{totalQuestions} Answered
                </span>
              </div>

              {/* Progress Track */}
              <div className="w-full bg-slate-200 h-1.5 rounded-full overflow-hidden">
                <div
                  className="bg-emerald-500 h-full transition-all duration-300"
                  style={{ width: `${(answeredCount / totalQuestions) * 100}%` }}
                />
              </div>
            </div>

            {/* 2. Status Legend */}
            <div className="px-4 py-2.5 bg-white border-b border-slate-100 shrink-0">
              <div className="grid grid-cols-2 gap-2 text-[11px] font-semibold">
                <div className="flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 shrink-0"></span>
                  <span className="text-slate-700">Answered ({answeredCount})</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-full bg-purple-500 shrink-0"></span>
                  <span className="text-slate-700">Review ({reviewCount})</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-full bg-amber-400 shrink-0"></span>
                  <span className="text-slate-700">Not Answered ({unansweredCount})</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-full bg-slate-300 shrink-0"></span>
                  <span className="text-slate-700">Unvisited ({unvisitedCount})</span>
                </div>
              </div>
            </div>

            {/* 3. Question Numbers Grid (Scrollable if test has many questions) */}
            <div className="p-3.5 flex-1 min-h-0 overflow-y-auto">
              <div className="grid grid-cols-5 gap-2">
                {questions.map((q, idx) => {
                  const isCurrent = idx === currentIndex;
                  const isAnswered = q.questionType === 'CODING'
                    ? Boolean(codingSolvedStates[q.id])
                    : Boolean(selectedAnswers[q.id]);
                  const isReview = Boolean(markedForReview[q.id]);
                  const isVisited = Boolean(visitedQuestions[q.id]);

                  let bg = 'bg-slate-100 text-slate-600 border border-slate-200';
                  if (isReview) {
                    bg = 'bg-purple-600 text-white border-purple-700 font-bold';
                  } else if (isAnswered) {
                    bg = 'bg-emerald-600 text-white border-emerald-700 font-bold';
                  } else if (isVisited) {
                    bg = 'bg-amber-400 text-slate-950 border-amber-500 font-bold';
                  }

                  return (
                    <button
                      key={q.id}
                      id={`jump-to-q-desktop-${idx + 1}`}
                      onClick={() => {
                        setCurrentIndex(idx);
                        window.scrollTo({ top: 0, behavior: 'smooth' });
                      }}
                      className={`h-9 rounded-xl text-xs flex items-center justify-center transition-all ${bg} ${
                        isCurrent
                          ? 'ring-2 ring-primary ring-offset-1 scale-105 shadow-sm font-extrabold z-10'
                          : 'hover:opacity-90 active:scale-95'
                      }`}
                      title={`Jump to Question ${idx + 1}`}
                    >
                      {idx + 1}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* 4. Marking & Passing Information Micro-bar */}
            <div className="px-4 py-2 bg-slate-50 border-t border-slate-150 text-[11px] text-slate-600 flex items-center justify-between shrink-0">
              <span>Marks: <strong className="text-slate-900">+10 / -2</strong></span>
              <span>Cutoff: <strong className="text-slate-900">{test.passingPercentage}% Pass</strong></span>
            </div>

            {/* 5. INTEGRATED EXAM NAVIGATION CONTROLS (Always Visible, No Scrolling Needed) */}
            <div className="p-3.5 bg-white border-t border-slate-200 space-y-2.5 shrink-0 shadow-xs">
              {/* Secondary Row: Mark for Review & Clear Selection */}
              <div className="grid grid-cols-2 gap-2">
                <button
                  id="desktop-mark-review-btn"
                  onClick={handleToggleReview}
                  className={`min-h-[38px] px-2.5 py-1.5 text-xs font-bold rounded-xl border transition-all flex items-center justify-center gap-1.5 active:scale-95 ${
                    markedForReview[currentQ?.id]
                      ? 'bg-purple-100 text-purple-900 border-purple-300 shadow-2xs ring-1 ring-purple-400'
                      : 'bg-slate-50 hover:bg-purple-50 text-slate-700 hover:text-purple-900 border-slate-200'
                  }`}
                  title="Mark for later review"
                >
                  <Star
                    className={`w-3.5 h-3.5 ${
                      markedForReview[currentQ?.id] ? 'fill-purple-600 text-purple-600' : 'text-slate-400'
                    }`}
                  />
                  <span>{markedForReview[currentQ?.id] ? 'Marked' : 'Mark Review'}</span>
                </button>

                <button
                  id="desktop-clear-selection-btn"
                  onClick={handleClearResponse}
                  disabled={currentQ?.questionType === 'CODING' ? !codingSolvedStates[currentQ?.id] : !selectedAnswers[currentQ?.id]}
                  className="min-h-[38px] px-2.5 py-1.5 bg-slate-50 hover:bg-slate-100 disabled:opacity-40 text-slate-600 hover:text-slate-900 text-xs font-semibold rounded-xl border border-slate-200 transition-all flex items-center justify-center gap-1 active:scale-95"
                  title="Clear selected option"
                >
                  <Trash2 className="w-3.5 h-3.5 text-slate-400" />
                  <span>Clear</span>
                </button>
              </div>

              {/* Primary Movement Row: Previous & Strong Save & Next */}
              <div className="flex items-center gap-2">
                <button
                  id="desktop-prev-question-btn"
                  onClick={handlePrev}
                  disabled={currentIndex === 0}
                  className="min-h-[44px] px-3.5 bg-slate-100 hover:bg-slate-200 active:bg-slate-300 disabled:opacity-30 text-slate-700 text-xs font-bold rounded-xl border border-slate-200 transition-all flex items-center justify-center gap-1 shrink-0 active:scale-95"
                  title="Previous question"
                >
                  <ArrowLeft className="w-4 h-4" />
                  <span>Prev</span>
                </button>

                {currentIndex < totalQuestions - 1 ? (
                  <button
                    id="next-question-btn"
                    onClick={handleNext}
                    className="min-h-[44px] flex-1 px-4 bg-amber-400 hover:bg-amber-300 active:bg-amber-500 text-slate-950 text-xs font-black rounded-xl shadow-xs transition-all flex items-center justify-center gap-1.5 active:scale-[0.98]"
                    title="Save response and advance to next question"
                  >
                    <span>Save & Next</span>
                    <ArrowRight className="w-4 h-4" />
                  </button>
                ) : (
                  <button
                    id="desktop-final-submit-btn"
                    onClick={() => setIsSubmitModalOpen(true)}
                    className="min-h-[44px] flex-1 px-4 bg-emerald-600 hover:bg-emerald-500 active:bg-emerald-700 text-white text-xs font-black rounded-xl shadow-md transition-all flex items-center justify-center gap-1.5 active:scale-[0.98]"
                    title="Finish test and view detailed evaluation"
                  >
                    <span>Final Submit</span>
                    <CheckCircle2 className="w-4 h-4" />
                  </button>
                )}
              </div>
            </div>
          </div>
        )}
        </div>
      </main>
      )}

      {/* 3. CODING NAVIGATOR DRAWER (Desktop Only) */}
      {isCodingLayout && isCodingDrawerOpen && (
        <div className="hidden lg:block absolute top-[64px] right-0 bottom-0 w-[360px] bg-white border-l border-slate-200/90 shadow-2xl z-30 flex flex-col animate-in slide-in-from-right-8">
          {/* Header */}
          <div className="p-4 border-b border-slate-150 bg-slate-50 flex items-center justify-between shrink-0">
            <div className="flex items-center gap-2">
              <Grid className="w-4 h-4 text-primary" />
              <h2 className="text-sm font-bold text-slate-900 font-['Outfit']">Questions</h2>
            </div>
            <button onClick={() => setIsCodingDrawerOpen(false)} className="text-slate-400 hover:text-slate-700">
              <X className="w-5 h-5" />
            </button>
          </div>
          {/* Status Legend */}
          <div className="px-4 py-2.5 bg-white border-b border-slate-100 shrink-0">
            <div className="grid grid-cols-2 gap-2 text-[11px] font-semibold">
              <div className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 shrink-0"></span>
                <span className="text-slate-700">Ans ({answeredCount})</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-full bg-purple-500 shrink-0"></span>
                <span className="text-slate-700">Rev ({reviewCount})</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-full bg-amber-400 shrink-0"></span>
                <span className="text-slate-700">Left ({unansweredCount})</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-full bg-slate-300 shrink-0"></span>
                <span className="text-slate-700">Unvis ({unvisitedCount})</span>
              </div>
            </div>
          </div>
          {/* Question Grid */}
          <div className="p-3.5 flex-1 overflow-y-auto">
            <div className="grid grid-cols-5 gap-2">
              {questions.map((q, idx) => {
                const isCurrent = idx === currentIndex;
                const isAnswered = q.questionType === 'CODING'
                  ? Boolean(codingSolvedStates[q.id])
                  : Boolean(selectedAnswers[q.id]);
                const isReview = Boolean(markedForReview[q.id]);
                const isVisited = Boolean(visitedQuestions[q.id]);
                
                let bg = 'bg-slate-100 text-slate-600 border border-slate-200';
                if (isReview) bg = 'bg-purple-600 text-white border-purple-700 font-bold';
                else if (isAnswered) bg = 'bg-emerald-600 text-white border-emerald-700 font-bold';
                else if (isVisited) bg = 'bg-amber-400 text-slate-950 border-amber-500 font-bold';

                return (
                  <button
                    key={q.id}
                    onClick={() => {
                      setCurrentIndex(idx);
                      // Don't auto-close drawer on desktop to allow quick browsing
                    }}
                    className={`h-9 rounded-xl text-xs flex items-center justify-center transition-all ${bg} ${
                      isCurrent
                        ? 'ring-2 ring-primary ring-offset-1 scale-105 shadow-sm font-extrabold z-10'
                        : 'hover:opacity-90 active:scale-95'
                    }`}
                  >
                    {idx + 1}
                  </button>
                );
              })}
            </div>
          </div>
          {/* Navigation & Submit */}
          <div className="p-4 border-t border-slate-200 bg-white space-y-3 shrink-0 shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.05)]">
             <div className="flex items-center gap-2">
               <button
                 onClick={handlePrev}
                 disabled={currentIndex === 0}
                 className="flex-1 py-2 bg-slate-100 hover:bg-slate-200 disabled:opacity-30 text-slate-700 text-xs font-bold rounded-xl border border-slate-200 transition-all flex items-center justify-center gap-1 active:scale-95"
               >
                 <ArrowLeft className="w-3.5 h-3.5" /> Prev
               </button>
               {currentIndex < totalQuestions - 1 ? (
                 <button
                   onClick={handleNext}
                   className="flex-1 py-2 bg-amber-400 hover:bg-amber-300 text-slate-950 text-xs font-black rounded-xl shadow-xs transition-all flex items-center justify-center gap-1 active:scale-[0.98]"
                 >
                   Next <ArrowRight className="w-3.5 h-3.5" />
                 </button>
               ) : (
                 <button
                   onClick={() => setIsSubmitModalOpen(true)}
                   className="flex-1 py-2 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-black rounded-xl shadow-md transition-all flex items-center justify-center gap-1 active:scale-[0.98]"
                 >
                   Submit <CheckCircle2 className="w-3.5 h-3.5" />
                 </button>
               )}
             </div>
          </div>
        </div>
      )}

      {/* 4. MOBILE FIXED BOTTOM ACTION BAR (Thumb-friendly, min 48px targets, zero scrolling needed) */}

      <div
        id="mobile-exam-bottom-bar"
        className="fixed bottom-0 left-0 right-0 z-40 lg:hidden bg-white/95 backdrop-blur-md border-t border-slate-200 px-3 py-2.5 sm:px-4 sm:py-3 shadow-xl"
        style={{ paddingBottom: 'max(0.625rem, env(safe-area-inset-bottom))' }}
      >
        <div className="max-w-md mx-auto flex items-center justify-between gap-2">
          {/* Previous Button */}
          <button
            id="mobile-prev-btn"
            onClick={handlePrev}
            disabled={currentIndex === 0}
            className="min-h-[44px] px-3 bg-slate-100 hover:bg-slate-200 active:bg-slate-300 disabled:opacity-30 text-slate-700 text-xs font-bold rounded-xl border border-slate-200 transition-all flex items-center justify-center gap-1 shrink-0 active:scale-95"
            title="Previous question"
          >
            <ArrowLeft className="w-4 h-4" />
            <span className="hidden xs:inline">Prev</span>
          </button>

          {/* Mark for Review Toggle */}
          <button
            id="mobile-mark-review-btn"
            onClick={handleToggleReview}
            className={`min-h-[44px] px-2.5 sm:px-3 text-xs font-bold rounded-xl border transition-all flex items-center justify-center gap-1 shrink-0 active:scale-95 ${
              markedForReview[currentQ?.id]
                ? 'bg-purple-600 text-white border-purple-700 shadow-2xs'
                : 'bg-slate-50 hover:bg-slate-100 text-slate-700 border-slate-200'
            }`}
            title="Mark question for review"
          >
            <Star
              className={`w-3.5 h-3.5 ${
                markedForReview[currentQ?.id] ? 'fill-amber-400 text-amber-400' : 'text-slate-400'
              }`}
            />
            <span className="text-[11px] sm:text-xs">
              {markedForReview[currentQ?.id] ? 'Marked' : 'Review'}
            </span>
          </button>

          {/* Clear Response Button (if option is selected) */}
          {selectedAnswers[currentQ?.id] && (
            <button
              id="mobile-clear-btn"
              onClick={handleClearResponse}
              className="min-h-[44px] w-10 bg-slate-100 hover:bg-slate-200 active:bg-slate-300 text-slate-600 text-xs font-semibold rounded-xl border border-slate-200 transition-all flex items-center justify-center shrink-0 active:scale-95"
              title="Clear option selection"
            >
              <Trash2 className="w-4 h-4 text-slate-500" />
            </button>
          )}

          {/* Save & Next / Final Submit Button */}
          {currentIndex < totalQuestions - 1 ? (
            <button
              id="mobile-save-next-btn"
              onClick={handleNext}
              className="min-h-[44px] flex-1 px-3.5 bg-amber-400 hover:bg-amber-300 active:bg-amber-500 text-slate-950 text-xs font-extrabold rounded-xl shadow-xs transition-all flex items-center justify-center gap-1.5 active:scale-[0.98]"
            >
              <span>Save & Next</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          ) : (
            <button
              id="mobile-final-submit-btn"
              onClick={() => setIsSubmitModalOpen(true)}
              className="min-h-[44px] flex-1 px-3.5 bg-emerald-600 hover:bg-emerald-500 active:bg-emerald-700 text-white text-xs font-extrabold rounded-xl shadow-md transition-all flex items-center justify-center gap-1.5 active:scale-[0.98]"
            >
              <span>Submit Test</span>
              <CheckCircle2 className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>

      {/* 5. MOBILE QUESTION PALETTE DRAWER (Bottom Sheet) */}
      {isMobilePaletteOpen && (
        <div
          id="mobile-palette-drawer-backdrop"
          className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-xs flex flex-col justify-end lg:hidden transition-opacity"
          onClick={() => setIsMobilePaletteOpen(false)}
        >
          <div
            id="mobile-palette-drawer-panel"
            className="bg-white rounded-t-3xl max-h-[80vh] overflow-y-auto p-5 space-y-4 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
            style={{ paddingBottom: 'max(1.5rem, env(safe-area-inset-bottom))' }}
          >
            {/* Sheet Header */}
            <div className="flex items-center justify-between pb-3 border-b border-slate-150">
              <div className="flex items-center gap-2">
                <Grid className="w-4 h-4 text-sky-600" />
                <h3 className="text-sm font-bold text-slate-900 font-['Outfit']">
                  Question Palette ({totalQuestions})
                </h3>
              </div>
              <button
                id="close-mobile-palette-btn"
                onClick={() => setIsMobilePaletteOpen(false)}
                className="w-8 h-8 rounded-full bg-slate-100 text-slate-500 flex items-center justify-center hover:bg-slate-200"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Status Breakdown Chips */}
            <div className="grid grid-cols-2 xs:grid-cols-4 gap-2 text-[11px] font-bold">
              <div className="p-2 bg-emerald-50 border border-emerald-200 rounded-xl text-emerald-900 flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 shrink-0"></span>
                <span>Ans: {answeredCount}</span>
              </div>
              <div className="p-2 bg-purple-50 border border-purple-200 rounded-xl text-purple-900 flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-full bg-purple-500 shrink-0"></span>
                <span>Rev: {reviewCount}</span>
              </div>
              <div className="p-2 bg-amber-50 border border-amber-200 rounded-xl text-amber-900 flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-full bg-amber-400 shrink-0"></span>
                <span>Left: {unansweredCount}</span>
              </div>
              <div className="p-2 bg-slate-100 border border-slate-200 rounded-xl text-slate-700 flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-full bg-slate-300 shrink-0"></span>
                <span>Unvis: {unvisitedCount}</span>
              </div>
            </div>

            {/* Question Grid */}
            <div className="space-y-1.5">
              <label className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
                Jump to Question
              </label>
              <div className="grid grid-cols-5 xs:grid-cols-6 sm:grid-cols-8 gap-2 max-h-60 overflow-y-auto p-1">
                {questions.map((q, idx) => {
                  const isCurrent = idx === currentIndex;
                  const isAnswered = Boolean(selectedAnswers[q.id]);
                  const isReview = Boolean(markedForReview[q.id]);
                  const isVisited = Boolean(visitedQuestions[q.id]);

                  let bg = 'bg-slate-100 text-slate-700 border border-slate-200';
                  if (isReview) {
                    bg = 'bg-purple-600 text-white border-purple-700 font-bold';
                  } else if (isAnswered) {
                    bg = 'bg-emerald-600 text-white border-emerald-700 font-bold';
                  } else if (isVisited) {
                    bg = 'bg-amber-400 text-slate-950 border-amber-500 font-bold';
                  }

                  return (
                    <button
                      key={q.id}
                      id={`jump-to-q-${idx + 1}`}
                      onClick={() => {
                        setCurrentIndex(idx);
                        setIsMobilePaletteOpen(false);
                        window.scrollTo({ top: 0, behavior: 'smooth' });
                      }}
                      className={`h-11 rounded-xl text-xs flex items-center justify-center transition-all ${bg} ${
                        isCurrent ? 'ring-2 ring-primary scale-105 font-extrabold shadow-sm' : 'active:scale-95'
                      }`}
                    >
                      {idx + 1}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Quick Submit Trigger in Drawer */}
            <div className="pt-2 border-t border-slate-150 flex items-center gap-2">
              <button
                onClick={() => setIsMobilePaletteOpen(false)}
                className="min-h-[44px] flex-1 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold rounded-xl border border-slate-200"
              >
                Close
              </button>
              <button
                onClick={() => {
                  setIsMobilePaletteOpen(false);
                  setIsSubmitModalOpen(true);
                }}
                className="min-h-[44px] flex-1 py-2.5 bg-amber-400 hover:bg-amber-300 text-slate-950 text-xs font-extrabold rounded-xl shadow-xs"
              >
                Submit Exam
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 6. FINAL SUBMIT CONFIRMATION MODAL */}
      {isSubmitModalOpen && (
        <div
          id="submit-modal-backdrop"
          className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-950/60 backdrop-blur-xs transition-opacity"
        >
          <div
            id="submit-modal-card"
            className="bg-white border border-slate-200 w-full max-w-md rounded-2xl p-5 sm:p-6 shadow-2xl space-y-4 sm:space-y-5 text-slate-900 animate-in fade-in"
          >
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h3 className="text-base sm:text-lg font-bold font-['Outfit']">Submit Placement Test?</h3>
              <button
                id="close-submit-modal-btn"
                onClick={() => setIsSubmitModalOpen(false)}
                className="p-1 text-slate-400 hover:text-slate-700 rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <p className="text-xs text-slate-600 leading-relaxed">
              Please review your summary before finishing. You will receive your instant scorecard, national percentile, and AI solution breakdowns.
            </p>

            <div className="grid grid-cols-3 gap-2 text-center">
              <div className="p-2.5 sm:p-3 bg-emerald-50 border border-emerald-200 rounded-xl">
                <p className="text-[10px] text-emerald-800 font-bold uppercase">Answered</p>
                <p className="text-lg sm:text-xl font-extrabold text-emerald-900 mt-0.5 sm:mt-1">{answeredCount}</p>
              </div>
              <div className="p-2.5 sm:p-3 bg-purple-50 border border-purple-200 rounded-xl">
                <p className="text-[10px] text-purple-800 font-bold uppercase">Review</p>
                <p className="text-lg sm:text-xl font-extrabold text-purple-900 mt-0.5 sm:mt-1">{reviewCount}</p>
              </div>
              <div className="p-2.5 sm:p-3 bg-amber-50 border border-amber-200 rounded-xl">
                <p className="text-[10px] text-amber-800 font-bold uppercase">Unanswered</p>
                <p className="text-lg sm:text-xl font-extrabold text-amber-900 mt-0.5 sm:mt-1">{unansweredCount}</p>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2 pt-2">
              <button
                id="cancel-submit-btn"
                onClick={() => setIsSubmitModalOpen(false)}
                className="min-h-[44px] py-2.5 px-4 bg-slate-100 hover:bg-slate-200 text-slate-800 text-xs font-bold rounded-xl transition-all"
              >
                Return to Test
              </button>

              <button
                id="confirm-submit-btn"
                onClick={handleFinalSubmit}
                disabled={isSubmitting}
                className="min-h-[44px] py-2.5 px-4 bg-amber-400 hover:bg-amber-300 text-slate-950 text-xs font-bold rounded-xl shadow-sm transition-all flex items-center justify-center gap-1.5 active:scale-[0.98]"
              >
                {isSubmitting ? 'Calculating Score...' : 'Confirm Submit'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 7. EXAM MODE LEAVE CONFIRMATION MODAL */}
      {isLeaveExamModalOpen && mode === 'exam' && (
        <div
          id="leave-exam-modal-backdrop"
          className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-950/70 backdrop-blur-xs transition-opacity animate-in fade-in"
          role="dialog"
          aria-modal="true"
        >
          <div
            id="leave-exam-modal-card"
            className="bg-white border border-slate-200 w-full max-w-md rounded-2xl p-5 sm:p-6 shadow-2xl space-y-4 text-slate-900 animate-in zoom-in-95"
          >
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-xl bg-amber-50 border border-amber-200 flex items-center justify-center text-amber-600 shrink-0">
                  <AlertTriangle className="w-4 h-4" />
                </div>
                <h3 className="text-base sm:text-lg font-bold font-['Outfit'] text-slate-900">
                  Leave Assessment?
                </h3>
              </div>
              <button
                id="close-leave-modal-btn"
                onClick={() => setIsLeaveExamModalOpen(false)}
                className="p-1 text-slate-400 hover:text-slate-700 rounded-lg"
                aria-label="Close"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <p className="text-xs sm:text-sm text-slate-600 leading-relaxed">
              Your current answers will be saved, but leaving the assessment may interrupt your exam.
            </p>

            <div className="grid grid-cols-2 gap-2.5 pt-2">
              <button
                id="continue-exam-btn"
                onClick={() => setIsLeaveExamModalOpen(false)}
                className="min-h-[44px] py-2.5 px-4 bg-amber-400 hover:bg-amber-300 active:bg-amber-500 text-slate-950 text-xs font-black rounded-xl shadow-xs transition-all flex items-center justify-center"
              >
                Continue Exam
              </button>
              <button
                id="leave-test-btn"
                onClick={() => {
                  setIsLeaveExamModalOpen(false);
                  onExit();
                }}
                className="min-h-[44px] py-2.5 px-4 bg-slate-100 hover:bg-slate-200 active:bg-slate-300 text-slate-800 text-xs font-bold rounded-xl border border-slate-200 transition-all flex items-center justify-center"
              >
                Leave Test
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Placement Toolkit Drawer / Modal (PRACTICE MODE ONLY) */}
      {isToolkitOpen && mode === 'practice' && (
        <PlacementToolkitModal
          onClose={() => setIsToolkitOpen(false)}
          userId={userId}
          activeTestCategory={test.category}
          activeTestTitle={test.title}
        />
      )}

      {/* Deep AI Premium Modal */}
      {showDeepAIPremiumModal && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-md flex items-center justify-center p-4">
          <div className="bg-white border border-slate-200 rounded-3xl w-full max-w-md shadow-2xl p-6 space-y-5 text-slate-900 animate-in fade-in zoom-in duration-150">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2">
                <div className="w-9 h-9 rounded-xl bg-amber-400 text-slate-950 flex items-center justify-center font-bold shadow-xs">
                  <Crown className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold font-['Outfit'] text-slate-950">Deep AI Help</h3>
                  <p className="text-2xs text-amber-700 font-bold uppercase tracking-wider">FirstRound Premium Feature</p>
                </div>
              </div>
              <button
                onClick={() => setShowDeepAIPremiumModal(false)}
                className="p-1 text-slate-400 hover:text-slate-700 rounded-lg hover:bg-slate-100 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-3 text-xs text-slate-600 leading-relaxed">
              <p className="font-semibold text-slate-800">
                Deep AI Help delivers Socratic diagnostic explanations and step-by-step guidance inside Practice Mode.
              </p>
              <div className="p-3 bg-amber-50 border border-amber-200 rounded-2xl space-y-1">
                <p className="font-bold text-amber-950 text-xs">FirstRound is primarily 100% FREE.</p>
                <p className="text-2xs text-amber-900">
                  Normal AI Doubt Solver and FirstRound AI Placement Copilot remain completely free. Real payment checkout will arrive in Phase 2.
                </p>
              </div>
            </div>

            <div className="pt-2">
              <button
                onClick={() => setShowDeepAIPremiumModal(false)}
                className="w-full py-2.5 bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs rounded-xl shadow-xs transition-all cursor-pointer"
              >
                Understood
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 8. ASSESSMENT INTEGRITY WARNING MODAL */}
      {showWarningModal && !isTerminated && (
        <div
          id="integrity-warning-modal-backdrop"
          className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-950/80 backdrop-blur-xs transition-opacity animate-in fade-in"
          role="dialog"
          aria-modal="true"
        >
          <div
            id="integrity-warning-modal-card"
            className="bg-white border border-amber-300 w-full max-w-md rounded-2xl p-5 sm:p-6 shadow-2xl space-y-4 text-slate-900 animate-in zoom-in-95"
          >
            <div className="w-12 h-12 rounded-2xl bg-amber-100 text-amber-600 border border-amber-200 flex items-center justify-center mx-auto shadow-xs">
              <AlertTriangle className="w-7 h-7 text-amber-600" />
            </div>
            <div className="text-center space-y-1">
              <h3 className="text-lg font-bold font-['Outfit'] text-slate-900">
                Assessment Integrity Warning
              </h3>
              <p className="text-xs font-bold text-amber-600 uppercase tracking-wider">
                Violation {violationCount} of 3
              </p>
            </div>
            <p className="text-xs text-slate-600 text-center leading-relaxed">
              Leaving the assessment window or attempting restricted actions is not allowed during an official exam. Continuing will lead to automatic termination of your test session.
            </p>
            <button
              id="acknowledge-integrity-warning-btn"
              onClick={() => setShowWarningModal(false)}
              className="w-full py-2.5 bg-amber-400 hover:bg-amber-300 text-slate-950 font-bold text-xs rounded-xl shadow-sm transition-all cursor-pointer"
            >
              I Understand & Resume Assessment
            </button>
          </div>
        </div>
      )}

      {/* 9. ASSESSMENT INTEGRITY TERMINATION MODAL */}
      {(showTerminationModal || isTerminated) && (
        <div
          id="integrity-termination-modal-backdrop"
          className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-950/90 backdrop-blur-md transition-opacity animate-in fade-in"
          role="dialog"
          aria-modal="true"
        >
          <div
            id="integrity-termination-modal-card"
            className="bg-white border border-rose-300 w-full max-w-md rounded-2xl p-5 sm:p-6 shadow-2xl space-y-4 text-slate-900 text-center animate-in zoom-in-95"
          >
            <div className="w-14 h-14 rounded-2xl bg-rose-100 border border-rose-200 text-rose-600 flex items-center justify-center mx-auto shadow-xs">
              <AlertCircle className="w-8 h-8 text-rose-600" />
            </div>
            <div className="space-y-1">
              <h3 className="text-xl font-bold font-['Outfit'] text-slate-900">
                Assessment Terminated
              </h3>
              <p className="text-xs font-bold text-rose-600 uppercase tracking-wider">
                Maximum Integrity Violations Reached (3/3)
              </p>
            </div>
            <p className="text-xs text-slate-600 leading-relaxed">
              Your assessment was terminated because the maximum number of integrity violations was reached. Browser-based monitoring recorded multiple tab switches or window focus losses.
            </p>
            <div className="pt-2 flex flex-col gap-2">
              <button
                id="view-terminated-result-btn"
                onClick={() => handleFinalSubmit()}
                className="w-full py-2.5 bg-rose-600 hover:bg-rose-500 text-white font-bold text-xs rounded-xl shadow-sm transition-all cursor-pointer"
              >
                Finish & View Scorecard
              </button>
              <button
                id="exit-terminated-test-btn"
                onClick={onExit}
                className="w-full py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-800 font-bold text-xs rounded-xl border border-slate-200 transition-all cursor-pointer"
              >
                Return to Tests
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
