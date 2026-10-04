import React, { Component, ErrorInfo, ReactNode } from 'react';
import { RotateCcw, ArrowLeft, AlertTriangle } from 'lucide-react';

interface Props {
  children: ReactNode;
  onExit: () => void;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class TestEngineErrorBoundary extends React.Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null,
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('[Test Engine Error Boundary] Captured test engine crash:', error, errorInfo);
  }

  private handleReset = () => {
    this.setState({ hasError: false, error: null });
  };

  public render() {
    if (this.state.hasError) {
      return (
        <div
          id="test-engine-error-boundary"
          className="min-h-screen bg-slate-950 flex items-center justify-center p-4 font-['Plus_Jakarta_Sans']"
        >
          <div
            id="test-engine-error-card"
            className="bg-slate-900 border border-slate-800 w-full max-w-md rounded-3xl p-6 sm:p-8 shadow-2xl space-y-5 text-white text-center"
            role="alert"
          >
            <div className="w-14 h-14 rounded-2xl bg-rose-500/10 border border-rose-500/20 text-rose-400 flex items-center justify-center mx-auto">
              <AlertTriangle className="w-7 h-7" />
            </div>

            <div className="space-y-2">
              <h3 className="text-lg font-bold text-white font-['Outfit']">
                Unable to Load Assessment Interface
              </h3>
              <p className="text-xs text-slate-400 leading-relaxed">
                An unexpected issue occurred while rendering this assessment. Your account and test entitlements remain completely safe.
              </p>
              {this.state.error?.message && (
                <div className="p-3 bg-slate-950/80 border border-slate-800 rounded-xl text-2xs font-mono text-rose-300 overflow-x-auto max-h-24 text-left">
                  {this.state.error.message}
                </div>
              )}
            </div>

            <div className="flex items-center justify-center gap-3 pt-2">
              <button
                id="test-engine-error-retry-btn"
                onClick={this.handleReset}
                className="px-4 py-2.5 bg-slate-800 hover:bg-slate-700 active:scale-95 text-slate-200 font-bold text-xs rounded-xl border border-slate-700 transition-all flex items-center gap-1.5 cursor-pointer"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>Retry</span>
              </button>

              <button
                id="test-engine-error-exit-btn"
                onClick={this.props.onExit}
                className="px-5 py-2.5 bg-primary hover:bg-primary-hover active:scale-95 text-white font-extrabold text-xs rounded-xl shadow-xs transition-all flex items-center gap-1.5 cursor-pointer"
              >
                <ArrowLeft className="w-3.5 h-3.5" />
                <span>Return to TestHub</span>
              </button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
