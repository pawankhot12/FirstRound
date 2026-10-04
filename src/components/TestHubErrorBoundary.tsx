import React, { Component, ErrorInfo, ReactNode } from 'react';
import { RotateCcw, AlertTriangle, Home } from 'lucide-react';

interface Props {
  children: ReactNode;
  onResetCategory?: () => void;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class TestHubErrorBoundary extends React.Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null,
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('[TestHub Error Boundary] Captured section render error:', error, errorInfo);
  }

  private handleReset = () => {
    try {
      sessionStorage.removeItem('firstround_testhub_category');
    } catch {}
    if (this.props.onResetCategory) {
      this.props.onResetCategory();
    }
    this.setState({ hasError: false, error: null });
  };

  public render() {
    if (this.state.hasError) {
      return (
        <div
          id="testhub-section-error-boundary"
          className="w-full max-w-2xl mx-auto my-12 p-8 bg-surface border border-border rounded-3xl text-center space-y-5 shadow-lg"
        >
          <div className="w-14 h-14 rounded-2xl bg-amber-500/10 border border-amber-500/20 text-amber-600 flex items-center justify-center mx-auto">
            <AlertTriangle className="w-7 h-7" />
          </div>

          <div className="space-y-2">
            <h3 className="text-xl font-bold font-['Outfit'] text-text-primary">
              Unable to Load Section
            </h3>
            <p className="text-xs text-text-muted leading-relaxed max-w-md mx-auto">
              An unexpected issue occurred while displaying this section of TestHub. Your profile, account settings, and test progress remain completely safe.
            </p>
            {this.state.error?.message && (
              <div className="p-3 bg-app-bg border border-border rounded-xl text-2xs font-mono text-rose-500 max-w-md mx-auto text-left overflow-x-auto">
                {this.state.error.message}
              </div>
            )}
          </div>

          <div className="flex items-center justify-center gap-3 pt-2">
            <button
              id="testhub-error-retry-btn"
              onClick={this.handleReset}
              className="px-5 py-2.5 bg-primary hover:bg-primary-hover active:scale-95 text-white font-extrabold text-xs rounded-xl shadow-xs transition-all flex items-center gap-1.5 cursor-pointer"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>Retry & Reset View</span>
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
