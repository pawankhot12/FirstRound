import React, { Component, ErrorInfo, ReactNode } from 'react';
import { RotateCcw, X, AlertTriangle } from 'lucide-react';

interface Props {
  children: ReactNode;
  onClose: () => void;
}

interface State {
  hasError: boolean;
}

export class AIErrorBoundary extends React.Component<Props, State> {
  public state: State = {
    hasError: false,
  };

  public static getDerivedStateFromError(_: Error): State {
    return { hasError: true };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('[AI Error Boundary] Captured AI Assistant crash:', error, errorInfo);
  }

  private handleReset = () => {
    this.setState({ hasError: false });
  };

  public render() {
    if (this.state.hasError) {
      return (
        <div
          id="ai-error-boundary-backdrop"
          className="fixed inset-0 z-50 overflow-hidden bg-slate-950/75 backdrop-blur-sm p-4 flex items-center justify-center animate-in fade-in duration-200"
        >
          <div
            id="ai-error-boundary-card"
            className="bg-surface border border-border w-full max-w-md rounded-2xl p-6 shadow-2xl space-y-4 text-text-primary text-center"
            role="alert"
          >
            <div className="w-12 h-12 rounded-full bg-rose-500/10 border border-rose-500/20 text-rose-500 flex items-center justify-center mx-auto">
              <AlertTriangle className="w-6 h-6" />
            </div>

            <div className="space-y-1">
              <h3 className="text-base font-bold text-text-primary font-['Outfit']">
                FirstRound AI couldn't complete that request.
              </h3>
              <p className="text-xs text-text-muted leading-relaxed">
                An unexpected issue occurred while rendering the AI assistant response. Your placement progress and session remain completely safe.
              </p>
            </div>

            <div className="flex items-center justify-center gap-3 pt-2">
              <button
                id="ai-error-boundary-retry-btn"
                onClick={this.handleReset}
                className="px-4 py-2 bg-primary hover:bg-primary-hover active:scale-95 text-white font-extrabold text-xs rounded-xl shadow-2xs transition-all flex items-center gap-1.5"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>Try Again</span>
              </button>

              <button
                id="ai-error-boundary-close-btn"
                onClick={this.props.onClose}
                className="px-4 py-2 bg-slate-800 hover:bg-slate-700 active:scale-95 text-slate-200 font-bold text-xs rounded-xl transition-all flex items-center gap-1.5"
              >
                <X className="w-3.5 h-3.5" />
                <span>Close</span>
              </button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
