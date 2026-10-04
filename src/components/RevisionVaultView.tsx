import React, { useState, useMemo, useEffect } from 'react';
import {
  AlertCircle,
  AlertTriangle,
  Bookmark,
  BookmarkX,
  BookOpen,
  Bot,
  Brain,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Filter,
  Flame,
  HelpCircle,
  Lightbulb,
  Loader2,
  MessageCircle,
  MessageSquare,
  RefreshCw,
  RotateCcw,
  Search,
  Send,
  Sparkles,
  Trash2,
  XCircle,
  Zap,
  ArrowRight,
  X
} from 'lucide-react';
import { AIDoubtResponse, BookmarkedItem, Question, WeakQuestionItem, TestSeries, TestMode, User } from '../types';
import { apiGetQuestionHint, apiDeepAIHelp } from '../api';

interface RevisionVaultViewProps {
  weakQuestions: WeakQuestionItem[];
  bookmarkedItems: BookmarkedItem[];
  tests?: TestSeries[];
  onRemoveBookmark: (questionId: string) => Promise<boolean>;
  onStartCustomQuiz: (questions: Question[]) => void;
  onStartTest?: (test: TestSeries, mode?: TestMode) => void;
  onAskAI?: (payload: { question: Question; userSelectedOption?: string | null; studentQuestion?: string }) => Promise<AIDoubtResponse>;
  currentUser?: User | null;
}

interface ChatMessage {
  sender: 'user' | 'ai';
  text: string;
  timestamp: number;
}

export const RevisionVaultView: React.FC<RevisionVaultViewProps> = ({
  weakQuestions,
  bookmarkedItems,
  tests = [],
  onRemoveBookmark,
  onStartCustomQuiz,
  onStartTest,
  currentUser,
}) => {
  const [activeTab, setActiveTab] = useState<'weak' | 'bookmarks'>('weak');
  const [searchTerm, setSearchTerm] = useState('');

  // Filters
  const [selectedTopic, setSelectedTopic] = useState('all');
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [selectedCompany, setSelectedCompany] = useState('all');
  const [selectedDifficulty, setSelectedDifficulty] = useState('all');

  // Sorting
  const [weakSortOrder, setWeakSortOrder] = useState<'default' | 'most-failed' | 'recent'>('default');

  // Quiz configuration
  const [quizCount, setQuizCount] = useState<'5' | '10' | 'all'>('all');

  // Accordion state for question review pattern
  const [expandedQuestions, setExpandedQuestions] = useState<Record<string, boolean>>({});
  const [expandAll, setExpandAll] = useState<boolean>(false);

  const toggleQuestion = (questionId: string) => {
    setExpandedQuestions((prev) => ({
      ...prev,
      [questionId]: !(prev[questionId] ?? expandAll),
    }));
  };

  const handleToggleExpandAll = () => {
    const nextState = !expandAll;
    setExpandAll(nextState);
    setExpandedQuestions({});
  };

  // AI Hint state (0 user credits, cached question-level)
  const [hints, setHints] = useState<Record<string, { loading: boolean; text: string | null; error: boolean }>>({});

  // Deep AI Workspace states
  const [openDeepAIId, setOpenDeepAIId] = useState<string | null>(null);
  const [deepAITab, setDeepAITab] = useState<Record<string, 'menu' | 'solution' | 'chat'>>({});
  const [sessionInfo, setSessionInfo] = useState<Record<string, { loading: boolean; sessionId?: string; creditsLeft?: number; error?: string }>>({});
  const [solutions, setSolutions] = useState<Record<string, { loading: boolean; data?: any; error?: string }>>({});
  const [chatMessages, setChatMessages] = useState<Record<string, ChatMessage[]>>({});
  const [chatInput, setChatInput] = useState<Record<string, string>>({});
  const [chatSending, setChatSending] = useState<Record<string, boolean>>({});

  // Pre-process current list and map metadata
  const currentListRaw = activeTab === 'weak' ? weakQuestions : bookmarkedItems;

  const currentListWithMeta = useMemo(() => {
    return currentListRaw.map((item) => {
      const q = 'question' in item ? item.question : (item as any).question;
      const test = tests.find((t) => t.id === q.testSeriesId);
      const isWeak = activeTab === 'weak';
      return {
        item,
        q,
        test,
        timesFailed: isWeak ? (item as WeakQuestionItem).timesFailed : 0,
        lastAttemptedAt: isWeak ? (item as WeakQuestionItem).lastAttemptedAt : (item as BookmarkedItem).addedAt,
      };
    });
  }, [currentListRaw, tests, activeTab]);

  // Derived available filters
  const availableTopics = Array.from(new Set(currentListWithMeta.map((m) => m.q.topic).filter(Boolean)));
  const availableCategories = Array.from(new Set(currentListWithMeta.map((m) => m.test?.category).filter(Boolean)));
  const availableCompanies = Array.from(new Set(currentListWithMeta.map((m) => m.q.companyTag || m.test?.company).filter(Boolean)));
  const availableDifficulties = Array.from(new Set(currentListWithMeta.map((m) => m.q.difficulty).filter(Boolean)));

  // Apply Search, Filters, and Sort
  const filteredItems = useMemo(() => {
    let result = [...currentListWithMeta];

    // Search
    if (searchTerm.trim()) {
      const lowerSearch = searchTerm.toLowerCase();
      result = result.filter(
        (m) =>
          m.q.questionText.toLowerCase().includes(lowerSearch) ||
          m.q.topic.toLowerCase().includes(lowerSearch) ||
          (m.test?.title || '').toLowerCase().includes(lowerSearch) ||
          (m.q.companyTag || m.test?.company || '').toLowerCase().includes(lowerSearch)
      );
    }

    // Filters
    if (selectedTopic !== 'all') result = result.filter((m) => m.q.topic === selectedTopic);
    if (selectedCategory !== 'all') result = result.filter((m) => m.test?.category === selectedCategory);
    if (selectedCompany !== 'all') result = result.filter((m) => (m.q.companyTag || m.test?.company) === selectedCompany);
    if (selectedDifficulty !== 'all') result = result.filter((m) => m.q.difficulty === selectedDifficulty);

    // Sorting
    if (weakSortOrder === 'most-failed' && activeTab === 'weak') {
      result.sort((a, b) => b.timesFailed - a.timesFailed);
    } else if (weakSortOrder === 'recent') {
      result.sort((a, b) => new Date(b.lastAttemptedAt || 0).getTime() - new Date(a.lastAttemptedAt || 0).getTime());
    }

    return result;
  }, [currentListWithMeta, searchTerm, selectedTopic, selectedCategory, selectedCompany, selectedDifficulty, weakSortOrder, activeTab]);

  const finalFilteredQuestions = filteredItems.map((m) => m.q);

  // Derive Quiz options
  const quizCountOptions = useMemo(() => {
    const total = finalFilteredQuestions.length;
    const opts = [];
    if (total >= 5) opts.push({ label: '5', value: '5' });
    if (total >= 10) opts.push({ label: '10', value: '10' });
    opts.push({ label: `All (${total})`, value: 'all' });
    return opts;
  }, [finalFilteredQuestions.length]);

  if (quizCount !== 'all' && parseInt(quizCount) > finalFilteredQuestions.length && finalFilteredQuestions.length > 0) {
    setQuizCount('all');
  }

  const handleStartQuiz = () => {
    let qList = finalFilteredQuestions;
    if (quizCount !== 'all') {
      qList = qList.slice(0, parseInt(quizCount));
    }
    onStartCustomQuiz(qList);
  };

  // ─── Automatic AI Hint Fetching ───────────────────────────────────────────
  const loadQuestionHint = async (questionId: string) => {
    if (hints[questionId]?.text || hints[questionId]?.loading) return;

    setHints((prev) => ({
      ...prev,
      [questionId]: { loading: true, text: null, error: false },
    }));

    try {
      const res = await apiGetQuestionHint(questionId, currentUser?.id);
      if (res && res.hint) {
        setHints((prev) => ({
          ...prev,
          [questionId]: { loading: false, text: res.hint, error: false },
        }));
      } else {
        setHints((prev) => ({
          ...prev,
          [questionId]: { loading: false, text: null, error: true },
        }));
      }
    } catch (err) {
      setHints((prev) => ({
        ...prev,
        [questionId]: { loading: false, text: null, error: true },
      }));
    }
  };

  useEffect(() => {
    filteredItems.forEach((meta) => {
      if (!hints[meta.q.id]) {
        loadQuestionHint(meta.q.id);
      }
    });
  }, [filteredItems]);

  // ─── Deep AI Helper (Uses standard Auth Header Pipeline) ───────────────────
  const callDeepAIHelp = async (payload: {
    question: Question;
    action?: 'init' | 'query';
    requestType?: 'init' | 'solution' | 'chat';
    studentQuestion?: string;
    assessmentId?: string;
  }) => {
    return await apiDeepAIHelp({
      question: payload.question,
      mode: 'revision',
      assessmentId: payload.assessmentId || payload.question.testSeriesId || 'revision_vault',
      action: payload.action || 'query',
      requestType: payload.requestType || 'init',
      studentQuestion: payload.studentQuestion,
      userId: currentUser?.id,
    });
  };

  const handleToggleDeepAI = async (q: Question) => {
    if (openDeepAIId === q.id) {
      setOpenDeepAIId(null);
      return;
    }

    setOpenDeepAIId(q.id);
    if (!deepAITab[q.id]) {
      setDeepAITab((prev) => ({ ...prev, [q.id]: 'menu' }));
    }

    // Initialize session if not already initialized
    if (!sessionInfo[q.id]?.sessionId) {
      setSessionInfo((prev) => ({
        ...prev,
        [q.id]: { loading: true },
      }));

      try {
        const res = await callDeepAIHelp({
          question: q,
          action: 'init',
          requestType: 'init',
        });
        setSessionInfo((prev) => ({
          ...prev,
          [q.id]: { loading: false, sessionId: res.sessionId, creditsLeft: res.creditsLeft },
        }));
      } catch (err: any) {
        setSessionInfo((prev) => ({
          ...prev,
          [q.id]: { loading: false, error: err.message || 'Failed to start Deep AI session' },
        }));
      }
    }
  };

  const handleSelectDeepSolution = async (q: Question) => {
    setDeepAITab((prev) => ({ ...prev, [q.id]: 'solution' }));

    if (solutions[q.id]?.data || solutions[q.id]?.loading) return;

    setSolutions((prev) => ({
      ...prev,
      [q.id]: { loading: true },
    }));

    try {
      const res = await callDeepAIHelp({
        question: q,
        action: 'query',
        requestType: 'solution',
      });
      setSolutions((prev) => ({
        ...prev,
        [q.id]: { loading: false, data: res },
      }));
      if (res.creditsLeft !== undefined) {
        setSessionInfo((prev) => ({
          ...prev,
          [q.id]: { ...prev[q.id], creditsLeft: res.creditsLeft },
        }));
      }
    } catch (err: any) {
      setSolutions((prev) => ({
        ...prev,
        [q.id]: { loading: false, error: err.message || 'Failed to generate Deep Solution' },
      }));
    }
  };

  const handleSelectDeepChat = (q: Question) => {
    setDeepAITab((prev) => ({ ...prev, [q.id]: 'chat' }));

    if (!chatMessages[q.id] || chatMessages[q.id].length === 0) {
      setChatMessages((prev) => ({
        ...prev,
        [q.id]: [
          {
            sender: 'ai',
            text: `Hello! I am your Deep AI Assistant for this question. Ask me any follow-up question or clarification!`,
            timestamp: Date.now(),
          },
        ],
      }));
    }
  };

  const handleSendChatMessage = async (q: Question, customText?: string) => {
    const text = (customText || chatInput[q.id] || '').trim();
    if (!text || chatSending[q.id]) return;

    setChatInput((prev) => ({ ...prev, [q.id]: '' }));
    setChatSending((prev) => ({ ...prev, [q.id]: true }));

    const userMsg: ChatMessage = { sender: 'user', text, timestamp: Date.now() };
    setChatMessages((prev) => ({
      ...prev,
      [q.id]: [...(prev[q.id] || []), userMsg],
    }));

    try {
      const res = await callDeepAIHelp({
        question: q,
        action: 'query',
        requestType: 'chat',
        studentQuestion: text,
      });

      const aiMsgText = res.explanation || res.answer || 'Here is the clarification for your query.';
      const aiMsg: ChatMessage = { sender: 'ai', text: aiMsgText, timestamp: Date.now() };

      setChatMessages((prev) => ({
        ...prev,
        [q.id]: [...(prev[q.id] || []), aiMsg],
      }));

      if (res.creditsLeft !== undefined) {
        setSessionInfo((prev) => ({
          ...prev,
          [q.id]: { ...prev[q.id], creditsLeft: res.creditsLeft },
        }));
      }
    } catch (err: any) {
      const errorMsg: ChatMessage = {
        sender: 'ai',
        text: `⚠️ Unable to process query: ${err.message || 'Error communicating with Deep AI'}`,
        timestamp: Date.now(),
      };
      setChatMessages((prev) => ({
        ...prev,
        [q.id]: [...(prev[q.id] || []), errorMsg],
      }));
    } finally {
      setChatSending((prev) => ({ ...prev, [q.id]: false }));
    }
  };

  return (
    <div className="space-y-8 pb-16">
      {/* Hero Header */}
      <div className="rounded-3xl bg-gradient-to-r from-gradient-start via-gradient-mid to-gradient-end p-7 sm:p-10 space-y-3 text-white shadow-xl relative overflow-hidden">
        <div className="inline-flex items-center gap-2 px-3.5 py-1 rounded-full bg-amber-400 text-slate-950 text-xs font-bold shadow-sm">
          <BookOpen className="w-4 h-4 text-slate-950" />
          <span>Smart Revision & Memory Vault</span>
        </div>

        <h1 className="text-3xl sm:text-4xl font-extrabold text-white font-['Outfit']">
          Revision Vault & Weak Areas
        </h1>
        <p className="text-xs sm:text-sm text-slate-200 max-w-2xl leading-relaxed">
          Automated collection of questions you answered incorrectly across mock tests. Re-attempt weak concepts until you achieve 100% mastery.
        </p>

        {finalFilteredQuestions.length > 0 && (
          <div className="pt-4 flex flex-wrap items-center gap-3">
            <div className="bg-surface/10 backdrop-blur-sm rounded-xl p-1 border border-white/20 flex items-center">
              <select
                value={quizCount}
                onChange={(e) => setQuizCount(e.target.value as any)}
                className="bg-transparent text-white text-xs font-bold focus:outline-none px-2 py-1 appearance-none cursor-pointer"
              >
                {quizCountOptions.map((o) => (
                  <option key={o.value} value={o.value} className="text-slate-900">
                    {o.label} Questions
                  </option>
                ))}
              </select>
              <ChevronDown className="w-3 h-3 text-white/70 mr-2" />
            </div>
            <button
              onClick={handleStartQuiz}
              className="px-5 py-2 bg-amber-400 hover:bg-amber-300 text-slate-950 font-bold text-xs rounded-xl shadow-md transition-all flex items-center gap-2"
            >
              <RotateCcw className="w-4 h-4" />
              Start Revision Quiz
            </button>
          </div>
        )}
      </div>

      {/* Controls Container */}
      <div className="bg-surface rounded-2xl border border-border p-4 shadow-sm space-y-4">
        {/* Top Row: Tabs, Search, Sort */}
        <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-4">
          <div className="flex items-center gap-2 overflow-x-auto pb-1 w-full lg:w-auto no-scrollbar">
            <button
              onClick={() => {
                setActiveTab('weak');
                setWeakSortOrder('default');
                setExpandAll(false);
                setExpandedQuestions({});
              }}
              className={`whitespace-nowrap px-4 py-2 text-xs font-bold rounded-xl transition-all flex items-center gap-2 ${
                activeTab === 'weak'
                  ? 'bg-primary text-white shadow-sm'
                  : 'bg-surface text-text-secondary border border-border hover:bg-app-bg'
              }`}
            >
              <XCircle className="w-4 h-4 text-rose-400" />
              <span>Weak Questions ({weakQuestions.length})</span>
            </button>

            <button
              onClick={() => {
                setActiveTab('bookmarks');
                setWeakSortOrder('default');
                setExpandAll(false);
                setExpandedQuestions({});
              }}
              className={`whitespace-nowrap px-4 py-2 text-xs font-bold rounded-xl transition-all flex items-center gap-2 ${
                activeTab === 'bookmarks'
                  ? 'bg-primary text-white shadow-sm'
                  : 'bg-surface text-text-secondary border border-border hover:bg-app-bg'
              }`}
            >
              <Bookmark className="w-4 h-4 text-amber-400" />
              <span>Bookmarks ({bookmarkedItems.length})</span>
            </button>
          </div>

          <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3 w-full lg:w-auto">
            <div className="relative w-full sm:w-64">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-muted" />
              <input
                type="text"
                placeholder="Search questions, topics..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-9 pr-4 py-2 bg-app-bg border border-border rounded-xl text-xs text-text-primary focus:outline-none focus:border-primary transition-colors"
              />
            </div>

            <div className="flex items-center gap-2">
              <span className="text-text-muted text-xs font-semibold whitespace-nowrap">Sort:</span>
              <select
                value={weakSortOrder}
                onChange={(e) => setWeakSortOrder(e.target.value as any)}
                className="px-3 py-1.5 bg-app-bg border border-border rounded-xl text-xs text-text-primary focus:outline-none focus:border-primary"
              >
                <option value="default">Default</option>
                <option value="recent">Recently Failed</option>
                {activeTab === 'weak' && <option value="most-failed">Most Failed</option>}
              </select>
            </div>
          </div>
        </div>

        {/* Bottom Row: Filters */}
        <div className="flex flex-wrap items-center gap-3 pt-4 border-t border-border">
          <div className="flex items-center gap-1.5 text-text-muted text-xs font-semibold mr-2">
            <Filter className="w-3.5 h-3.5" /> Filters:
          </div>

          {availableTopics.length > 0 && (
            <select
              value={selectedTopic}
              onChange={(e) => setSelectedTopic(e.target.value)}
              className="px-3 py-1.5 bg-app-bg border border-border rounded-xl text-xs text-text-primary focus:outline-none focus:border-primary"
            >
              <option value="all">All Topics</option>
              {availableTopics.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          )}

          {availableCategories.length > 0 && (
            <select
              value={selectedCategory}
              onChange={(e) => setSelectedCategory(e.target.value)}
              className="px-3 py-1.5 bg-app-bg border border-border rounded-xl text-xs text-text-primary focus:outline-none focus:border-primary"
            >
              <option value="all">All Categories</option>
              {availableCategories.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          )}

          {availableCompanies.length > 0 && (
            <select
              value={selectedCompany}
              onChange={(e) => setSelectedCompany(e.target.value)}
              className="px-3 py-1.5 bg-app-bg border border-border rounded-xl text-xs text-text-primary focus:outline-none focus:border-primary"
            >
              <option value="all">All Companies</option>
              {availableCompanies.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          )}

          {availableDifficulties.length > 0 && (
            <select
              value={selectedDifficulty}
              onChange={(e) => setSelectedDifficulty(e.target.value)}
              className="px-3 py-1.5 bg-app-bg border border-border rounded-xl text-xs text-text-primary focus:outline-none focus:border-primary"
            >
              <option value="all">All Difficulties</option>
              {availableDifficulties.map((d) => (
                <option key={d} value={d}>
                  {d}
                </option>
              ))}
            </select>
          )}

          {(selectedTopic !== 'all' ||
            selectedCategory !== 'all' ||
            selectedCompany !== 'all' ||
            selectedDifficulty !== 'all' ||
            searchTerm !== '') && (
            <button
              onClick={() => {
                setSelectedTopic('all');
                setSelectedCategory('all');
                setSelectedCompany('all');
                setSelectedDifficulty('all');
                setSearchTerm('');
              }}
              className="px-3 py-1.5 text-xs font-semibold text-rose-500 hover:bg-rose-50 rounded-xl transition-colors"
            >
              Clear Filters
            </button>
          )}
        </div>
      </div>

      {/* Header bar above questions list with Expand All / Collapse All control */}
      <div className="flex items-center justify-between gap-3 pt-1 px-1">
        <div className="text-xs font-bold text-text-primary">
          {filteredItems.length} {activeTab === 'weak' ? 'Weak' : 'Bookmarked'} Question{filteredItems.length !== 1 ? 's' : ''}
        </div>

        {filteredItems.length > 0 && (
          <button
            id="toggle-expand-all-vault-btn"
            type="button"
            onClick={handleToggleExpandAll}
            className="px-3 py-1.5 bg-surface hover:bg-surface-hover border border-border text-xs font-semibold text-text-primary rounded-xl transition-colors flex items-center gap-1.5 cursor-pointer shadow-2xs"
          >
            {expandAll ? <ChevronUp className="w-3.5 h-3.5 text-slate-600" /> : <ChevronDown className="w-3.5 h-3.5 text-slate-600" />}
            <span>{expandAll ? 'Collapse All' : 'Expand All'}</span>
          </button>
        )}
      </div>

      {/* Questions List */}
      <div className="space-y-4">
        {filteredItems.length === 0 ? (
          <div className="bg-surface border border-border rounded-2xl p-12 text-center space-y-3 shadow-sm">
            <CheckCircle2 className="w-12 h-12 text-emerald-500 mx-auto" />
            <h3 className="text-base font-bold text-text-primary">
              {activeTab === 'weak'
                ? 'No weak questions match your criteria.'
                : 'No bookmarked questions match your criteria.'}
            </h3>
            <p className="text-xs text-text-muted max-w-md mx-auto leading-relaxed">
              Try adjusting your search terms or clearing the active filters.
            </p>
          </div>
        ) : (
          filteredItems.map((meta, idx) => {
            const q = meta.q;
            const isExpanded = expandedQuestions[q.id] ?? expandAll;

            return (
              <div
                key={q.id}
                className="bg-surface border border-border rounded-2xl overflow-hidden shadow-2xs transition-all hover:border-slate-300"
              >
                {/* Collapsible Meta Header */}
                <div
                  id={`vault-question-header-${q.id}`}
                  onClick={() => toggleQuestion(q.id)}
                  className="p-4 sm:p-5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 cursor-pointer hover:bg-app-bg/60 transition-colors select-none"
                >
                  <div className="flex items-center gap-2.5 sm:gap-3 min-w-0 flex-1 w-full sm:w-auto">
                    <span className="w-7 h-7 rounded-lg bg-surface-hover text-text-primary font-bold text-xs flex items-center justify-center shrink-0">
                      #{idx + 1}
                    </span>

                    <div className="min-w-0 flex-1 space-y-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="px-2.5 py-0.5 rounded-md bg-sky-50 text-sky-800 border border-sky-200 text-[10px] font-bold uppercase tracking-wider">
                          {q.topic}
                        </span>
                        {q.difficulty && (
                          <span
                            className={`px-2.5 py-0.5 rounded-md border text-[10px] font-bold uppercase tracking-wider ${
                              q.difficulty === 'Hard'
                                ? 'bg-rose-50 text-rose-700 border-rose-200'
                                : q.difficulty === 'Medium'
                                ? 'bg-amber-50 text-amber-700 border-amber-200'
                                : 'bg-emerald-50 text-emerald-700 border-emerald-200'
                            }`}
                          >
                            {q.difficulty}
                          </span>
                        )}
                        {(q.companyTag || meta.test?.company) && (
                          <span className="px-2 py-0.5 rounded bg-surface-hover text-text-secondary border border-border text-[10px] font-bold uppercase tracking-wider">
                            🏢 {q.companyTag || meta.test?.company}
                          </span>
                        )}
                        {activeTab === 'weak' && meta.timesFailed > 0 && (
                          <span className="px-2 py-0.5 rounded bg-rose-50 text-rose-700 border border-rose-200 text-[10px] font-bold flex items-center gap-1">
                            <Flame className="w-3 h-3 text-rose-600" />
                            Failed {meta.timesFailed}x
                          </span>
                        )}
                      </div>

                      {/* Question Text Preview */}
                      <p className="text-xs sm:text-sm font-semibold text-text-primary truncate max-w-xl sm:max-w-2xl">
                        {q.questionText}
                      </p>
                    </div>
                  </div>

                  <div
                    className="flex items-center gap-2 shrink-0 self-end sm:self-auto"
                    onClick={(e) => e.stopPropagation()}
                  >
                    {/* Deep AI Button */}
                    <button
                      type="button"
                      onClick={() => handleToggleDeepAI(q)}
                      className={`px-3.5 py-1.5 rounded-xl text-xs font-bold flex items-center gap-1.5 shadow-xs transition-all cursor-pointer ${
                        openDeepAIId === q.id
                          ? 'bg-amber-400 text-slate-950 hover:bg-amber-300'
                          : 'bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-500 hover:to-indigo-500 text-white'
                      }`}
                    >
                      <Sparkles className="w-3.5 h-3.5 text-amber-300 fill-amber-300 shrink-0" />
                      <span>Deep AI</span>
                    </button>

                    {activeTab === 'bookmarks' && (
                      <button
                        type="button"
                        onClick={() => onRemoveBookmark(q.id)}
                        className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors cursor-pointer"
                        title="Remove from bookmarks"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    )}

                    <button
                      type="button"
                      onClick={() => toggleQuestion(q.id)}
                      className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-surface-hover rounded-lg transition-colors cursor-pointer"
                      title={isExpanded ? 'Collapse Question' : 'Expand Question'}
                    >
                      {isExpanded ? <ChevronUp className="w-4 h-4 text-slate-600" /> : <ChevronDown className="w-4 h-4 text-slate-600" />}
                    </button>
                  </div>
                </div>

                {/* Detailed Expanded Body */}
                {isExpanded && (
                  <div className="p-4 sm:p-6 border-t border-slate-200/80 space-y-4 bg-slate-50/40">
                    {/* Source Assessment Context Box */}
                    {meta.test && (
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3 bg-white border border-border rounded-xl shadow-2xs">
                        <div className="flex items-center flex-wrap gap-2 text-xs">
                          <span className="text-text-muted font-medium">Source Test:</span>
                          <span className="font-bold text-text-primary">{meta.test.title}</span>
                          {meta.test.category && (
                            <span className="px-1.5 py-0.5 rounded bg-surface-hover text-[10px] text-text-secondary border border-border">
                              {meta.test.category}
                            </span>
                          )}
                        </div>
                        {onStartTest && (
                          <button
                            type="button"
                            onClick={() => onStartTest(meta.test!, 'practice')}
                            className="flex items-center gap-1 text-[11px] font-bold text-primary hover:text-primary-active transition-colors shrink-0 cursor-pointer"
                          >
                            Practice This Test <ArrowRight className="w-3 h-3" />
                          </button>
                        )}
                      </div>
                    )}

                    {/* Complete Question Statement */}
                    <p className="text-xs sm:text-sm font-semibold text-text-primary leading-relaxed whitespace-pre-line">
                      {q.questionText}
                    </p>

                    {q.codeSnippet && (
                      <div className="p-3 bg-primary rounded-xl border border-primary-active font-mono text-xs text-sky-300 whitespace-pre overflow-x-auto">
                        {q.codeSnippet}
                      </div>
                    )}

                    {/* Options List */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                      {q.options &&
                        q.options.map((opt) => {
                          const isCorrect = opt.id === q.correctOption;
                          return (
                            <div
                              key={opt.id}
                              className={`p-3 rounded-xl border text-xs flex items-center gap-2.5 ${
                                isCorrect
                                  ? 'bg-emerald-50 border-emerald-300 text-emerald-950 font-semibold'
                                  : 'bg-white border-border text-slate-700'
                              }`}
                            >
                              <span className="w-5 h-5 rounded bg-slate-200 font-bold text-[11px] flex items-center justify-center text-slate-700 shrink-0">
                                {opt.id}
                              </span>
                              <span className="flex-1">{opt.text}</span>
                              {isCorrect && (
                                <span className="text-[10px] font-black text-emerald-700 shrink-0">✓ Correct</span>
                              )}
                            </div>
                          );
                        })}
                    </div>

                    {/* Automatic AI Hint Box */}
                    <div className="p-3.5 sm:p-4 rounded-2xl bg-amber-50/90 border border-amber-200/90 space-y-2.5 transition-colors">
                      <div className="flex items-center gap-2">
                        <div className="w-7 h-7 rounded-xl bg-amber-100/90 text-amber-800 flex items-center justify-center shrink-0">
                          <Lightbulb className="w-4 h-4 text-amber-700" />
                        </div>
                        <span className="text-xs font-extrabold text-amber-900 font-['Outfit'] uppercase tracking-wider">
                          AI Hint
                        </span>
                      </div>
                      <div className="text-xs sm:text-sm leading-relaxed">
                        {hints[q.id]?.loading ? (
                          <span className="text-xs text-amber-900 italic flex items-center gap-1.5 font-medium">
                            <Loader2 className="w-3.5 h-3.5 animate-spin text-amber-600 shrink-0" /> Generating concise hint...
                          </span>
                        ) : hints[q.id]?.text ? (
                          <p className="m-0 text-xs sm:text-sm leading-relaxed text-slate-800 font-medium">
                            {hints[q.id].text}
                          </p>
                        ) : hints[q.id]?.error ? (
                          <span className="text-xs text-rose-700 flex items-center gap-2 font-medium">
                            <span>AI Hint unavailable</span>
                            <button
                              type="button"
                              onClick={() => loadQuestionHint(q.id)}
                              className="text-xs font-bold underline hover:text-rose-800 cursor-pointer"
                            >
                              Retry
                            </button>
                          </span>
                        ) : (
                          <span className="text-xs text-amber-800 italic font-medium">No hint available</span>
                        )}
                      </div>
                    </div>

                    {/* Deep AI Workspace Drawer */}
                    {openDeepAIId === q.id && (
                  <div className="mt-4 border border-indigo-200 dark:border-indigo-900/50 rounded-2xl bg-slate-900 text-white p-5 space-y-4 shadow-lg animate-in fade-in">
                    {/* Workspace Header */}
                    <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                      <div className="flex items-center gap-2">
                        <Sparkles className="w-4 h-4 text-amber-400 fill-amber-400 shrink-0" />
                        <h4 className="text-sm font-bold text-white">Deep AI Workspace</h4>
                        {sessionInfo[q.id]?.creditsLeft !== undefined && (
                          <span className="px-2 py-0.5 text-[10px] font-bold rounded-full bg-indigo-900/60 text-indigo-300 border border-indigo-700">
                            {sessionInfo[q.id].creditsLeft} credits left
                          </span>
                        )}
                      </div>
                      <button
                        onClick={() => setOpenDeepAIId(null)}
                        className="p-1 text-slate-400 hover:text-white rounded-lg transition-colors"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>

                    {sessionInfo[q.id]?.loading ? (
                      <div className="p-8 text-center space-y-2">
                        <Loader2 className="w-6 h-6 animate-spin text-amber-400 mx-auto" />
                        <p className="text-xs text-slate-300">Initializing Deep AI session...</p>
                      </div>
                    ) : sessionInfo[q.id]?.error ? (
                      <div className="p-4 rounded-xl bg-rose-950/50 border border-rose-800 text-rose-300 text-xs space-y-2">
                        <div className="flex items-center gap-2 font-bold">
                          <AlertCircle className="w-4 h-4 text-rose-400" />
                          <span>Deep AI Access Locked</span>
                        </div>
                        <p>{sessionInfo[q.id].error}</p>
                      </div>
                    ) : (
                      <>
                        {/* Sub-tab Navigation */}
                        <div className="flex items-center gap-2 border-b border-slate-800 pb-2">
                          <button
                            onClick={() => handleSelectDeepSolution(q)}
                            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 ${
                              deepAITab[q.id] === 'solution'
                                ? 'bg-amber-400 text-slate-950 shadow-sm'
                                : 'bg-slate-800 text-slate-300 hover:bg-slate-700 hover:text-white'
                            }`}
                          >
                            <Brain className="w-3.5 h-3.5" />
                            Deep Solution
                          </button>
                          <button
                            onClick={() => handleSelectDeepChat(q)}
                            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 ${
                              deepAITab[q.id] === 'chat'
                                ? 'bg-amber-400 text-slate-950 shadow-sm'
                                : 'bg-slate-800 text-slate-300 hover:bg-slate-700 hover:text-white'
                            }`}
                          >
                            <MessageCircle className="w-3.5 h-3.5" />
                            Deep Chat
                          </button>
                        </div>

                        {/* MENU VIEW */}
                        {(!deepAITab[q.id] || deepAITab[q.id] === 'menu') && (
                          <div className="p-6 text-center space-y-4 bg-slate-950/50 rounded-xl border border-slate-800">
                            <h5 className="text-sm font-bold text-white">How would you like to continue?</h5>
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 max-w-md mx-auto">
                              <button
                                onClick={() => handleSelectDeepSolution(q)}
                                className="p-4 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700 hover:border-amber-400/50 transition-all text-left space-y-2 group"
                              >
                                <div className="flex items-center gap-2 font-bold text-amber-400 group-hover:text-amber-300 text-xs">
                                  <Brain className="w-4 h-4" />
                                  <span>Deep Solution</span>
                                </div>
                                <p className="text-[11px] text-slate-300 leading-normal">
                                  Step-by-step reasoning, calculations, option elimination, and full exam derivation.
                                </p>
                              </button>
                              <button
                                onClick={() => handleSelectDeepChat(q)}
                                className="p-4 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700 hover:border-amber-400/50 transition-all text-left space-y-2 group"
                              >
                                <div className="flex items-center gap-2 font-bold text-amber-400 group-hover:text-amber-300 text-xs">
                                  <MessageCircle className="w-4 h-4" />
                                  <span>Deep Chat</span>
                                </div>
                                <p className="text-[11px] text-slate-300 leading-normal">
                                  Ask custom follow-up questions, request simpler explanations or shortcut tricks.
                                </p>
                              </button>
                            </div>
                          </div>
                        )}

                        {/* SOLUTION VIEW */}
                        {deepAITab[q.id] === 'solution' && (
                          <div className="space-y-4 animate-in fade-in">
                            {solutions[q.id]?.loading ? (
                              <div className="p-8 text-center space-y-2">
                                <Loader2 className="w-6 h-6 animate-spin text-amber-400 mx-auto" />
                                <p className="text-xs text-slate-300">Generating detailed Deep Solution...</p>
                              </div>
                            ) : solutions[q.id]?.error ? (
                              <div className="p-4 rounded-xl bg-rose-950/50 border border-rose-800 text-rose-300 text-xs space-y-2">
                                <p className="font-bold">Failed to generate Deep Solution</p>
                                <p className="text-[11px]">{solutions[q.id].error}</p>
                                <button
                                  onClick={() => {
                                    setSolutions((prev) => ({ ...prev, [q.id]: { loading: false } }));
                                    handleSelectDeepSolution(q);
                                  }}
                                  className="px-3 py-1 bg-rose-800 hover:bg-rose-700 text-white font-bold rounded-lg text-xs"
                                >
                                  Retry
                                </button>
                              </div>
                            ) : (
                              <div className="p-4 rounded-xl bg-slate-950/60 border border-slate-800 space-y-3 text-xs leading-relaxed text-slate-200">
                                <div className="font-bold text-amber-400 flex items-center gap-2 text-xs">
                                  <Brain className="w-4 h-4" />
                                  <span>Deep Solution & Derivation</span>
                                </div>
                                <div className="whitespace-pre-line font-mono text-[11px] bg-slate-900/90 p-3.5 rounded-lg border border-slate-800 text-slate-200">
                                  {solutions[q.id]?.data?.explanation || `Correct Option: (${q.correctOption})\n\n${q.explanation}`}
                                </div>
                                {solutions[q.id]?.data?.stepByStep && solutions[q.id].data.stepByStep.length > 0 && (
                                  <div className="space-y-1.5 pt-2">
                                    <p className="font-bold text-slate-300">Step-by-Step Reasoning:</p>
                                    <ol className="list-decimal list-inside space-y-1 text-slate-300">
                                      {solutions[q.id].data.stepByStep.map((s: string, sIdx: number) => (
                                        <li key={sIdx}>{s}</li>
                                      ))}
                                    </ol>
                                  </div>
                                )}
                              </div>
                            )}
                          </div>
                        )}

                        {/* CHAT VIEW */}
                        {deepAITab[q.id] === 'chat' && (
                          <div className="space-y-3 animate-in fade-in">
                            <div className="max-h-64 overflow-y-auto space-y-2 p-3 bg-slate-950/60 rounded-xl border border-slate-800">
                              {(chatMessages[q.id] || []).map((msg, mIdx) => (
                                <div
                                  key={mIdx}
                                  className={`flex ${msg.sender === 'user' ? 'justify-end' : 'justify-start'}`}
                                >
                                  <div
                                    className={`max-w-[85%] p-3 rounded-xl text-xs ${
                                      msg.sender === 'user'
                                        ? 'bg-amber-400 text-slate-950 font-medium'
                                        : 'bg-slate-800 text-slate-200 border border-slate-700'
                                    }`}
                                  >
                                    {msg.text}
                                  </div>
                                </div>
                              ))}
                              {chatSending[q.id] && (
                                <div className="flex justify-start">
                                  <div className="p-2.5 rounded-xl bg-slate-800 text-slate-400 text-xs flex items-center gap-2">
                                    <Loader2 className="w-3.5 h-3.5 animate-spin" /> AI is thinking...
                                  </div>
                                </div>
                              )}
                            </div>

                            {/* Quick suggestion pills */}
                            <div className="flex flex-wrap items-center gap-1.5">
                              {[
                                'Explain this more simply.',
                                'Why is option B wrong?',
                                'Can you show the shortcut?',
                                'Explain this calculation.',
                              ].map((pill) => (
                                <button
                                  key={pill}
                                  onClick={() => handleSendChatMessage(q, pill)}
                                  className="px-2.5 py-1 rounded-full bg-slate-800 hover:bg-slate-700 border border-slate-700 text-[10px] font-semibold text-slate-300 transition-colors"
                                >
                                  {pill}
                                </button>
                              ))}
                            </div>

                            {/* Chat Input */}
                            <div className="flex items-center gap-2">
                              <input
                                type="text"
                                placeholder="Ask a follow-up question..."
                                value={chatInput[q.id] || ''}
                                onChange={(e) => setChatInput((prev) => ({ ...prev, [q.id]: e.target.value }))}
                                onKeyDown={(e) => {
                                  if (e.key === 'Enter') handleSendChatMessage(q);
                                }}
                                className="flex-1 bg-slate-950 border border-slate-700 rounded-xl px-3.5 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-amber-400"
                              />
                              <button
                                onClick={() => handleSendChatMessage(q)}
                                disabled={chatSending[q.id] || !(chatInput[q.id] || '').trim()}
                                className="p-2 bg-amber-400 hover:bg-amber-300 disabled:opacity-50 text-slate-950 rounded-xl font-bold transition-all"
                              >
                                <Send className="w-4 h-4" />
                              </button>
                            </div>
                          </div>
                        )}
                      </>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        );
      })
        )}
      </div>
    </div>
  );
};
