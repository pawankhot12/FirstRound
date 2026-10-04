import React, { useState, useEffect, useRef, FC, Fragment } from 'react';
import { Sparkles, X, ArrowRight, Bot, RotateCcw, Send } from 'lucide-react';
import { apiGetPlacementStrategy, apiAskAICopilot } from '../api';
import {
  User,
  ChatMessage,
  AICopilotMode,
  PlacementStrategy,
  AICopilotUserContext,
  AIRecommendedAction,
  AICopilotResponse,
} from '../types';

export interface FirstRoundAICopilotModalProps {
  currentUser: User | null;
  onClose: () => void;
  onNavigateTab?: (tab: string) => void;
  onExecuteAction?: (action: AIRecommendedAction) => Promise<void> | void;
}

const FormattedText: React.FC<{ content: string }> = ({ content }) => {

  if (!content) return null;
  const lines = content.split('\n');

  return (
    <div className="space-y-1.5">
      {lines.map((line, lineIdx) => {
        const trimmed = line.trim();
        if (!trimmed) return <div key={lineIdx} className="h-1" />;

        // Horizontal rule
        if (/^-{3,}$/.test(trimmed) || /^\*{3,}$/.test(trimmed)) {
          return <hr key={lineIdx} className="border-border/60 my-1" />;
        }

        // Markdown headers — render as styled text, strip # symbols
        const headerMatch = trimmed.match(/^(#{1,3})\s+(.+)$/);
        if (headerMatch) {
          const level = headerMatch[1].length;
          const headerText = headerMatch[2];
          const headerClass = level === 1
            ? 'text-sm font-bold text-text-primary'
            : level === 2
            ? 'text-[13px] font-bold text-text-primary'
            : 'text-xs font-semibold text-text-primary';
          return (
            <p key={lineIdx} className={`${headerClass} leading-relaxed`}>
              {headerText}
            </p>
          );
        }

        const isBullet = trimmed.startsWith('- ') || trimmed.startsWith('* ');
        const isNumbered = /^\d+[.)\s]/.test(trimmed);
        const cleanLine = isBullet ? trimmed.substring(2).trim() : isNumbered ? trimmed.replace(/^\d+[.)\s]+/, '').trim() : trimmed;
        const numberPrefix = isNumbered ? trimmed.match(/^(\d+)[.)\s]/)?.[1] : null;

        const parseInline = (str: string) => {
          const parts = str.split(/(\*\*[^*]+\*\*|\*[^*]+\*|_[^_]+_|`[^`]+`)/g);
          return parts.map((part, partIdx) => {
            if (part.startsWith('**') && part.endsWith('**') && part.length > 4) {
              return (
                <strong key={partIdx} className="font-bold text-text-primary">
                  {part.slice(2, -2)}
                </strong>
              );
            }
            if (part.startsWith('*') && part.endsWith('*') && part.length > 2) {
              return (
                <em key={partIdx} className="italic">
                  {part.slice(1, -1)}
                </em>
              );
            }
            if (part.startsWith('_') && part.endsWith('_') && part.length > 2) {
              return (
                <em key={partIdx} className="italic">
                  {part.slice(1, -1)}
                </em>
              );
            }
            if (part.startsWith('`') && part.endsWith('`') && part.length > 2) {
              return (
                <code key={partIdx} className="px-1 py-0.5 bg-slate-800 text-amber-300 rounded text-[11px] font-mono">
                  {part.slice(1, -1)}
                </code>
              );
            }
            // Strip any leftover raw markdown tokens
            const sanitized = part.replace(/\*\*/g, '').replace(/__/g, '').replace(/#{1,3}\s*/g, '');
            return <React.Fragment key={partIdx}>{sanitized}</React.Fragment>;
          });
        };

        if (isBullet) {
          return (
            <div key={lineIdx} className="flex items-start gap-2 text-xs sm:text-sm pl-1">
              <span className="text-amber-500 font-bold select-none">•</span>
              <span className="flex-1 leading-relaxed">{parseInline(cleanLine)}</span>
            </div>
          );
        }

        if (isNumbered && numberPrefix) {
          return (
            <div key={lineIdx} className="flex items-start gap-2 text-xs sm:text-sm pl-1">
              <span className="text-amber-500 font-bold select-none min-w-[1rem] text-right">{numberPrefix}.</span>
              <span className="flex-1 leading-relaxed">{parseInline(cleanLine)}</span>
            </div>
          );
        }

        return (
          <p key={lineIdx} className="text-xs sm:text-sm leading-relaxed">
            {parseInline(trimmed)}
          </p>
        );
      })}
    </div>
  );
};

export const FirstRoundAICopilotModal: React.FC<FirstRoundAICopilotModalProps> = ({
  currentUser,
  onClose,
  onNavigateTab,
  onExecuteAction,
}) => {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputQuery, setInputQuery] = useState('');
  const [activeMode, setActiveMode] = useState<AICopilotMode>('PLACEMENT_COACH');
  const [isLoading, setIsLoading] = useState(false);
  const [errorState, setErrorState] = useState<{ message: string; lastQuery?: string } | null>(null);
  const [strategy, setStrategy] = useState<PlacementStrategy | null>(null);
  const [isLoadingStrategy, setIsLoadingStrategy] = useState(false);

  const isMountedRef = useRef(true);
  const chatEndRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const prevLoadingRef = useRef(isLoading);

  useEffect(() => {
    isMountedRef.current = true;
    inputRef.current?.focus();
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    if (prevLoadingRef.current && !isLoading) {
      const timer = setTimeout(() => {
        if (isMountedRef.current) {
          inputRef.current?.focus();
        }
      }, 0);
      return () => clearTimeout(timer);
    }
    prevLoadingRef.current = isLoading;
  }, [isLoading]);

  useEffect(() => {
    if (currentUser?.id) {
      setIsLoadingStrategy(true);
      apiGetPlacementStrategy(currentUser.id)
        .then((res) => {
          if (isMountedRef.current && res?.strategy) {
            setStrategy(res.strategy);
          }
        })
        .catch((err) => {
          console.warn('Failed to load placement strategy:', err);
        })
        .finally(() => {
          if (isMountedRef.current) {
            setIsLoadingStrategy(false);
          }
        });
    }
  }, [currentUser?.id]);

  // Auto scroll to bottom
  const scrollToBottom = () => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, isLoading, errorState]);

  // ESC key listener
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  // Build safe user context payload
  const getUserContext = (): AICopilotUserContext => {
    if (!currentUser) return {};
    return {
      userId: currentUser.id,
      name: currentUser.name,
      targetRole: currentUser.targetRole || undefined,
      targetCompany: currentUser.targetCompany || undefined,
      lifetimeXp: currentUser.totalPoints,
      level: currentUser.level || Math.floor((currentUser.totalPoints || 0) / 500) + 1,
      weeklyXp: currentUser.weeklyXp,
      leagueTier: currentUser.currentLeague || 'Bronze',
    };
  };

  // Smart Suggestion Chips based on state
  const getSmartSuggestionChips = () => {
    const chips: Array<{ label: string; mode?: AICopilotMode }> = [];

    // Adaptive: show weakness chip only if there's a real weakness
    if (strategy?.contextSummary?.criticalWeakness) {
      chips.push({ label: `Improve my weak areas`, mode: 'LEARNING_ASSISTANT' });
    }

    // Adaptive: show performance chip only if they have data
    if (currentUser?.totalPoints && currentUser.totalPoints > 0) {
      chips.push({ label: 'Analyze my latest test', mode: 'PERFORMANCE_COACH' });
    }

    // Adaptive: company prep
    if (currentUser?.targetCompany) {
      chips.push({ label: `Prepare for ${currentUser.targetCompany}`, mode: 'PLACEMENT_COACH' });
    }

    chips.push({ label: 'Explain a topic', mode: 'LEARNING_ASSISTANT' });
    chips.push({ label: 'Make me a study plan', mode: 'STUDY_PLANNER' });

    return chips.slice(0, 5);
  };

  const handleSendMessage = async (queryText: string, modeOverride?: AICopilotMode) => {
    const textToSend = (queryText || '').trim();
    if (!textToSend || isLoading) return;

    setErrorState(null);
    const chosenMode = modeOverride || activeMode;

    const userMsg: ChatMessage = {
      id: `msg_user_${Date.now()}`,
      sender: 'user',
      text: textToSend,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    };

    const historyPayload = messages.slice(-6).map((m) => ({
      sender: m.sender,
      text: m.text,
    }));

    setMessages((prev) => [...prev, userMsg]);
    setInputQuery('');
    setIsLoading(true);

    try {
      const response: AICopilotResponse = await apiAskAICopilot({
        message: textToSend,
        mode: chosenMode,
        userContext: getUserContext(),
        history: historyPayload,
        userId: currentUser?.id,
      });

      if (!isMountedRef.current) return;

      const safeText =
        typeof response?.text === 'string' && response.text.trim().length > 0
          ? response.text
          : "FirstRound AI couldn't complete that request.";

      const safeActions = Array.isArray(response?.actions)
        ? response.actions.filter(
            (act): act is AIRecommendedAction =>
              !!act &&
              typeof act === 'object' &&
              typeof act.actionType === 'string' &&
              typeof (act.payload || act.target) === 'string' &&
              typeof act.label === 'string' &&
              act.label.trim().length > 0 &&
              !act.label.includes('0 items')
          )
        : [];

      const assistantMsg: ChatMessage = {
        id: `msg_assistant_${Date.now()}`,
        sender: 'assistant',
        text: safeText,
        mode: response?.mode || chosenMode,
        actions: safeActions,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      };

      setMessages((prev) => [...prev, assistantMsg]);
    } catch (err: any) {
      if (!isMountedRef.current) return;
      setErrorState({
        message: "FirstRound AI couldn't complete that request.",
        lastQuery: textToSend,
      });
    } finally {
      if (isMountedRef.current) {
        setIsLoading(false);
      }
    }
  };

  const [isExecutingAction, setIsExecutingAction] = useState(false);

  const handleActionClick = async (action: AIRecommendedAction) => {
    if (isExecutingAction) return;
    setIsExecutingAction(true);
    try {
      if (onExecuteAction) {
        await onExecuteAction(action);
      } else if (action.actionType === 'NAVIGATE_TAB' && onNavigateTab && action.payload) {
        onNavigateTab(action.payload);
        onClose();
      }
    } finally {
      setTimeout(() => setIsExecutingAction(false), 500);
    }
  };

  const handleRetry = () => {
    if (errorState?.lastQuery) {
      handleSendMessage(errorState.lastQuery);
    }
  };

  return (
    <div
      id="firstround-ai-copilot-backdrop"
      className="fixed inset-0 z-50 overflow-hidden bg-slate-950/75 backdrop-blur-sm p-2 sm:p-4 md:p-6 flex items-center justify-center animate-in fade-in duration-200"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        id="firstround-ai-copilot-card"
        className="bg-surface border border-border w-full max-w-2xl h-[90vh] max-h-[750px] rounded-2xl sm:rounded-3xl shadow-2xl overflow-hidden flex flex-col text-text-primary animate-in zoom-in-95 duration-200"
        role="dialog"
        aria-modal="true"
      >
        {/* ========================================================= */}
        {/* COPILOT HEADER                                            */}
        {/* ========================================================= */}
        <header className="bg-slate-950 border-b border-slate-800 px-4 sm:px-6 py-4 text-white flex items-center justify-between gap-3 shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-gradient-to-tr from-amber-500 via-amber-400 to-yellow-300 text-slate-950 font-black flex items-center justify-center shadow-lg shrink-0">
              <Sparkles className="w-5 h-5 fill-slate-950 text-slate-950" />
            </div>

            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-base sm:text-lg font-black text-white font-['Outfit'] tracking-tight">
                  FirstRound AI
                </h1>
                <span className="px-2 py-0.5 rounded-full bg-amber-400/20 text-amber-300 border border-amber-400/30 text-[10px] font-black uppercase tracking-wider">
                  Copilot
                </span>
              </div>
              <p className="text-xs text-slate-400 font-medium">
                Your placement assistant
              </p>
            </div>
          </div>

          <button
            id="ai-copilot-close-btn"
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-white bg-slate-900 hover:bg-slate-800 rounded-xl transition-colors"
            aria-label="Close"
          >
            <X className="w-5 h-5" />
          </button>
        </header>

        {/* ========================================================= */}
        {/* COPILOT CHAT FEED                                         */}
        {/* ========================================================= */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-4 bg-app-bg/50">
          {/* Initial Welcome & Smart Suggestion Chips */}
          {messages.length === 0 && (
            <div className="space-y-3">
              <div className="p-4 bg-surface border border-border rounded-2xl shadow-2xs space-y-1.5">
                <h2 className="text-base font-bold text-text-primary font-['Outfit']">
                  Hey 👋 How can I help with your placement preparation today?
                </h2>
                <p className="text-xs text-text-muted leading-relaxed">
                  Ask me anything about aptitude concepts, company pattern analysis, recent test performance, or study planning.
                </p>
              </div>

              {/* Smart Suggestion Chips */}
              <div className="space-y-1.5 pt-1">
                <div className="text-[10px] font-bold text-text-muted uppercase tracking-wider">
                  Suggested Prompts:
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {getSmartSuggestionChips().map((chip, idx) => (
                    <button
                      key={`smart_chip_${idx}`}
                      id={`ai-suggested-chip-${idx}`}
                      onClick={() => {
                        if (chip.mode) setActiveMode(chip.mode);
                        handleSendMessage(chip.label, chip.mode);
                      }}
                      disabled={isLoading}
                      className="px-3 py-1.5 bg-surface hover:bg-amber-500/10 active:scale-95 text-text-primary hover:text-amber-500 border border-border hover:border-amber-400/40 rounded-full text-xs font-medium transition-all text-left disabled:opacity-50 cursor-pointer"
                    >
                      <span>💡 {chip.label}</span>
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* Conversation History Feed */}
          {messages.map((msg) => (
            <div
              key={msg.id}
              className={`flex flex-col ${msg.sender === 'user' ? 'items-end' : 'items-start'} space-y-1`}
            >
              <div
                className={`max-w-[85%] rounded-2xl p-4 text-xs sm:text-sm leading-relaxed break-words overflow-wrap-anywhere ${
                  msg.sender === 'user'
                    ? 'bg-primary text-white font-medium rounded-br-xs shadow-xs'
                    : 'bg-surface border border-border text-text-primary rounded-bl-xs shadow-xs'
                }`}
              >
                {msg.sender === 'assistant' && (
                  <div className="flex items-center gap-1.5 mb-2 pb-2 border-b border-border/80 text-[10px] font-extrabold uppercase tracking-wider text-amber-600">
                    <Bot className="w-3.5 h-3.5 text-amber-600" />
                    <span>FirstRound AI</span>
                  </div>
                )}
                
                <FormattedText content={typeof msg.text === 'string' ? msg.text : String(msg.text || '')} />

                {msg.sender === 'assistant' && Array.isArray(msg.actions) && msg.actions.length > 0 && (
                  <div className="mt-3 pt-3 border-t border-border/80 flex flex-wrap gap-2">
                    {msg.actions.map((act, idx) => (
                      <button
                        key={idx}
                        id={`ai-action-card-${idx}`}
                        disabled={isExecutingAction}
                        onClick={() => handleActionClick(act)}
                        className="px-3 py-1.5 bg-amber-400 hover:bg-amber-300 active:bg-amber-500 text-slate-950 font-extrabold text-xs rounded-xl shadow-2xs transition-all flex items-center gap-1.5 active:scale-95 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        <span>{String(act?.label || 'Action')}</span>
                        <ArrowRight className="w-3.5 h-3.5" />
                      </button>
                    ))}
                  </div>
                )}
              </div>
              <span className="text-[10px] text-text-muted px-1">
                {msg.timestamp}
              </span>
            </div>
          ))}

          {/* Loading Typing Indicator */}
          {isLoading && (
            <div className="flex flex-col items-start space-y-1 animate-in fade-in duration-150">
              <div className="bg-surface border border-border rounded-2xl rounded-bl-xs p-4 shadow-xs space-y-2">
                <div className="flex items-center gap-2 text-xs font-bold text-amber-600">
                  <Sparkles className="w-3.5 h-3.5 animate-spin" />
                  <span>FirstRound AI is thinking...</span>
                </div>

                <div className="flex items-center gap-1.5 pt-1">
                  <span className="w-2 h-2 rounded-full bg-amber-400 animate-bounce [animation-delay:-0.3s] motion-reduce:animate-pulse" />
                  <span className="w-2 h-2 rounded-full bg-amber-400 animate-bounce [animation-delay:-0.15s] motion-reduce:animate-pulse" />
                  <span className="w-2 h-2 rounded-full bg-amber-400 animate-bounce motion-reduce:animate-pulse" />
                </div>
              </div>
            </div>
          )}

          {/* Error State Card */}
          {errorState && (
            <div className="p-4 bg-rose-50 border border-rose-200 text-rose-900 rounded-2xl space-y-3 text-xs font-semibold animate-in fade-in duration-200">
              <p>FirstRound AI couldn't complete that request.</p>
              <div className="flex items-center gap-2">
                <button
                  id="ai-copilot-try-again-btn"
                  onClick={handleRetry}
                  className="px-3.5 py-1.5 bg-rose-600 hover:bg-rose-700 active:bg-rose-800 text-white rounded-xl text-xs font-bold transition-all inline-flex items-center gap-1.5 shadow-2xs active:scale-95 cursor-pointer"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  <span>Try Again</span>
                </button>
                <button
                  id="ai-copilot-error-close-btn"
                  onClick={() => setErrorState(null)}
                  className="px-3.5 py-1.5 bg-slate-200 hover:bg-slate-300 text-slate-800 rounded-xl text-xs font-bold transition-all active:scale-95 cursor-pointer"
                >
                  Close
                </button>
              </div>
            </div>
          )}

          <div ref={chatEndRef} />
        </div>

        {/* ========================================================= */}
        {/* INPUT FOOTER                                              */}
        {/* ========================================================= */}
        <footer className="bg-surface border-t border-border p-3 sm:p-4 shrink-0">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              handleSendMessage(inputQuery);
            }}
            className="flex items-center gap-2"
          >
            <input
              ref={inputRef}
              id="ai-copilot-input"
              type="text"
              autoFocus
              value={inputQuery}
              onChange={(e) => setInputQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  handleSendMessage(inputQuery);
                }
              }}
              placeholder="Ask FirstRound AI e.g. 'How to improve TCS NQT speed?'..."
              disabled={isLoading}
              aria-label="Ask FirstRound AI Copilot"
              className="flex-1 min-h-[44px] px-4 bg-app-bg border border-border rounded-xl text-xs font-medium text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-2 focus:ring-amber-400 focus:border-amber-400 disabled:opacity-50 transition-all"
            />

            <button
              id="ai-copilot-send-btn"
              type="submit"
              disabled={!inputQuery.trim() || isLoading}
              aria-label="Send message"
              className="min-h-[44px] px-4 bg-primary hover:bg-primary-hover active:bg-primary-active text-white text-xs font-extrabold rounded-xl transition-all disabled:opacity-50 flex items-center justify-center shrink-0 shadow-2xs cursor-pointer"
            >
              <Send className="w-4 h-4" />
            </button>
          </form>
        </footer>
      </div>
    </div>
  );
};
