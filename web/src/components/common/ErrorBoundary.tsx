/**
 * AttendSure - Fault Isolation Error Boundary
 * File: web/src/components/common/ErrorBoundary.tsx
 *
 * Prevents isolated page issues from crashing the entire web portal.
 */

import React, { Component } from 'react';
import type { ErrorInfo, ReactNode } from 'react';
import { AlertTriangle, RefreshCw, Copy, Check, RotateCcw } from 'lucide-react';

export interface ErrorBoundaryProps {
  children: ReactNode;
  featureName?: string;
  fallback?: ReactNode | ((props: { error: Error; resetError: () => void }) => ReactNode);
  onReset?: () => void;
  onError?: (error: Error, errorInfo: ErrorInfo) => void;
  resetKeys?: unknown[];
}

interface State {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
  copied: boolean;
  showDetails: boolean;
}

const IS_DEV = Boolean(import.meta.env.DEV);

export class ErrorBoundary extends Component<ErrorBoundaryProps, State> {
  private copyTimer: ReturnType<typeof setTimeout> | null = null;

  public state: State = {
    hasError: false,
    error: null,
    errorInfo: null,
    copied: false,
    showDetails: false,
  };

  public static getDerivedStateFromError(error: Error): Partial<State> {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    this.setState({ errorInfo });
    this.props.onError?.(error, errorInfo);
  }

  public componentDidUpdate(prevProps: ErrorBoundaryProps) {
    if (!this.state.hasError) return;

    if (this.props.resetKeys && prevProps.resetKeys) {
      const hasChanged = this.props.resetKeys.some(
        (key, index) => key !== prevProps.resetKeys?.[index]
      );
      if (hasChanged) {
        this.handleReset();
      }
    }
  }

  public componentWillUnmount() {
    if (this.copyTimer) {
      clearTimeout(this.copyTimer);
      this.copyTimer = null;
    }
  }

  private handleReset = () => {
    this.props.onReset?.();
    this.setState({
      hasError: false,
      error: null,
      errorInfo: null,
      copied: false,
      showDetails: false,
    });
  };

  private handleCopyDiagnostic = async () => {
    const lines = [
      `Feature: ${this.props.featureName || 'Application Section'}`,
      `Time: ${new Date().toISOString()}`,
      `Error: ${this.state.error?.name || 'Error'}`,
    ];
    if (IS_DEV) {
      lines.push(`Message: ${this.state.error?.message || ''}`);
      lines.push(`Stack: ${this.state.error?.stack || 'None'}`);
    }
    const errorText = lines.join('\n');

    let success = false;
    if (navigator.clipboard && window.isSecureContext) {
      try {
        await navigator.clipboard.writeText(errorText);
        success = true;
      } catch {
        success = false;
      }
    }

    if (!success) {
      try {
        const textArea = document.createElement('textarea');
        textArea.value = errorText;
        textArea.style.position = 'fixed';
        textArea.style.left = '-999999px';
        textArea.style.top = '-999999px';
        document.body.appendChild(textArea);
        textArea.focus();
        textArea.select();
        success = document.execCommand('copy');
        textArea.remove();
      } catch {
        success = false;
      }
    }

    if (success) {
      this.setState({ copied: true });
      if (this.copyTimer) clearTimeout(this.copyTimer);
      this.copyTimer = setTimeout(() => {
        this.setState({ copied: false });
        this.copyTimer = null;
      }, 2500);
    }
  };

  public render() {
    if (this.state.hasError && this.state.error) {
      if (typeof this.props.fallback === 'function') {
        return this.props.fallback({
          error: this.state.error,
          resetError: this.handleReset,
        });
      }

      if (this.props.fallback) {
        return this.props.fallback;
      }

      const featureTitle = this.props.featureName || 'Section';

      return (
        <div style={errorContainerStyle}>
          <div style={errorCardStyle}>
            <div style={iconBadgeStyle}>
              <AlertTriangle size={24} color="var(--danger, #dc2626)" />
            </div>

            <div style={{ textAlign: 'center', width: '100%' }}>
              <h3 style={{ margin: '0 0 6px 0', fontSize: '1.05rem', fontWeight: 800, color: 'var(--text-primary, #0f172a)' }}>
                {featureTitle} Temporarily Unavailable
              </h3>
              <p style={{ margin: '0 0 14px 0', fontSize: '0.82rem', color: 'var(--text-secondary, #64748b)', lineHeight: 1.45 }}>
                A temporary problem occurred while displaying this section. Other AttendSure tabs, classroom QR scanning, and background tasks are still running normally.
              </p>

              {IS_DEV && (
                <div style={debugCodeStyle}>
                  {this.state.error.message || 'Unexpected rendering error.'}
                </div>
              )}

              {IS_DEV && this.state.showDetails && (
                <div style={stackTraceContainerStyle}>
                  <pre style={stackTracePreStyle}>
                    {this.state.error.stack || 'No extended details available.'}
                    {this.state.errorInfo?.componentStack || ''}
                  </pre>
                </div>
              )}
            </div>

            <div style={actionsRowStyle}>
              <button
                type="button"
                onClick={this.handleReset}
                style={primaryBtnStyle}
              >
                <RefreshCw size={14} />
                <span>Try Again</span>
              </button>

              <button
                type="button"
                onClick={this.handleCopyDiagnostic}
                style={secondaryBtnStyle}
                title="Copy report reference"
              >
                {this.state.copied ? <Check size={14} color="var(--success, #059669)" /> : <Copy size={14} />}
                <span>{this.state.copied ? 'Copied' : 'Copy Details'}</span>
              </button>

              {IS_DEV && (
                <button
                  type="button"
                  onClick={() => this.setState((prev) => ({ showDetails: !prev.showDetails }))}
                  style={secondaryBtnStyle}
                >
                  <span>{this.state.showDetails ? 'Hide Details' : 'Details'}</span>
                </button>
              )}

              <button
                type="button"
                onClick={() => window.location.reload()}
                style={secondaryBtnStyle}
                title="Reload the page"
              >
                <RotateCcw size={14} />
                <span>Reload</span>
              </button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;

const errorContainerStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  width: '100%',
  minHeight: '280px',
  padding: '24px 16px',
  boxSizing: 'border-box',
  backgroundColor: 'var(--bg-app, #f8fafc)',
};

const errorCardStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  backgroundColor: 'var(--bg-surface, #ffffff)',
  borderRadius: 12,
  border: '1px solid var(--border-subtle, #e2e8f0)',
  boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.12)',
  padding: '28px 32px',
  maxWidth: 540,
  width: '100%',
  boxSizing: 'border-box',
};

const iconBadgeStyle: React.CSSProperties = {
  width: 48,
  height: 48,
  borderRadius: '50%',
  backgroundColor: 'var(--danger-bg, #fef2f2)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  marginBottom: 14,
  border: '1px solid var(--border-subtle, #fee2e2)',
};

const debugCodeStyle: React.CSSProperties = {
  fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
  fontSize: '0.74rem',
  color: 'var(--danger, #991b1b)',
  backgroundColor: 'var(--danger-bg, #fef2f2)',
  padding: '8px 12px',
  borderRadius: 6,
  marginBottom: 16,
  wordBreak: 'break-word',
  border: '1px solid var(--border-subtle, #fee2e2)',
  textAlign: 'left',
};

const stackTraceContainerStyle: React.CSSProperties = {
  maxHeight: '140px',
  overflowY: 'auto',
  backgroundColor: '#0f172a',
  borderRadius: 6,
  padding: '8px 12px',
  marginBottom: 16,
  textAlign: 'left',
};

const stackTracePreStyle: React.CSSProperties = {
  margin: 0,
  fontSize: '0.68rem',
  fontFamily: 'ui-monospace, monospace',
  color: '#e2e8f0',
  whiteSpace: 'pre-wrap',
  wordBreak: 'break-all',
};

const actionsRowStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  gap: 8,
  flexWrap: 'wrap',
  width: '100%',
};

const primaryBtnStyle: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 6,
  padding: '8px 16px',
  borderRadius: 6,
  border: 'none',
  backgroundColor: 'var(--brand-button-bg, #0284c7)',
  color: '#ffffff',
  fontWeight: 700,
  fontSize: '0.78rem',
  cursor: 'pointer',
};

const secondaryBtnStyle: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 6,
  padding: '8px 12px',
  borderRadius: 6,
  border: '1px solid var(--border-input, #cbd5e1)',
  backgroundColor: 'var(--bg-surface-subtle, #ffffff)',
  color: 'var(--text-primary, #475569)',
  fontWeight: 600,
  fontSize: '0.78rem',
  cursor: 'pointer',
};