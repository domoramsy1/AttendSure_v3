/**
 * AttendSure V3 - Fault Isolation Error Boundary
 * File: frontend/src/components/common/ErrorBoundary.tsx
 *
 * Prevents sub-feature crashes (such as heavy DepEd report calculations,
 * canvas layout engines, or kiosk monitors) from crashing the entire portal.
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
  resetKeys?: any[];
}

interface State {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
  copied: boolean;
  showDetails: boolean;
}

export class ErrorBoundary extends Component<ErrorBoundaryProps, State> {
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

    console.error(
      `[AttendSure Fault Isolation] Critical render failure in ${this.props.featureName || 'Component'}:`,
      error,
      errorInfo
    );
  }

  public componentDidUpdate(prevProps: ErrorBoundaryProps) {
    if (!this.state.hasError) return;

    // Automatically recover if any resetKey changed (e.g. user switched tabs, selected another section, or re-navigated)
    if (this.props.resetKeys && prevProps.resetKeys) {
      const hasChanged = this.props.resetKeys.some(
        (key, index) => key !== prevProps.resetKeys?.[index]
      );
      if (hasChanged) {
        this.handleReset();
      }
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
    const errorText = [
      `Feature: ${this.props.featureName || 'Application Module'}`,
      `Time: ${new Date().toISOString()}`,
      `Error: ${this.state.error?.name}: ${this.state.error?.message}`,
      `Stack: ${this.state.error?.stack || 'No stack trace'}`,
      `Component Stack: ${this.state.errorInfo?.componentStack || 'No component stack'}`,
    ].join('\n');

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
      } catch (err) {
        console.error('Copy fallback failed:', err);
      }
    }

    if (success) {
      this.setState({ copied: true });
      setTimeout(() => this.setState({ copied: false }), 2500);
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

      const featureTitle = this.props.featureName || 'Module';

      return (
        <div style={errorContainerStyle}>
          <div style={errorCardStyle}>
            <div style={iconBadgeStyle}>
              <AlertTriangle size={24} color="#dc2626" />
            </div>

            <div style={{ textAlign: 'center', width: '100%' }}>
              <h3 style={{ margin: '0 0 6px 0', fontSize: '1.05rem', fontWeight: 800, color: '#0f172a' }}>
                {featureTitle} Temporarily Unavailable
              </h3>
              <p style={{ margin: '0 0 14px 0', fontSize: '0.80rem', color: '#64748b', lineHeight: 1.45 }}>
                An isolated issue occurred while rendering this feature. Other AttendSure tabs, gate monitors, and background tasks remain operational.
              </p>

              <div style={debugCodeStyle}>
                {this.state.error.message || String(this.state.error)}
              </div>

              {this.state.showDetails && (
                <div style={stackTraceContainerStyle}>
                  <pre style={stackTracePreStyle}>
                    {this.state.error.stack || 'No extended stack trace available.'}
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
                <span>Retry Feature</span>
              </button>

              <button
                type="button"
                onClick={this.handleCopyDiagnostic}
                style={secondaryBtnStyle}
                title="Copy technical diagnostic details to clipboard"
              >
                {this.state.copied ? <Check size={14} color="#059669" /> : <Copy size={14} />}
                <span>{this.state.copied ? 'Copied' : 'Copy Log'}</span>
              </button>

              <button
                type="button"
                onClick={() => this.setState((prev) => ({ showDetails: !prev.showDetails }))}
                style={secondaryBtnStyle}
              >
                <span>{this.state.showDetails ? 'Hide Stack' : 'Details'}</span>
              </button>

              <button
                type="button"
                onClick={() => window.location.reload()}
                style={secondaryBtnStyle}
                title="Perform a full page reload"
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

// ============================================================================
// STYLES
// ============================================================================

const errorContainerStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  width: '100%',
  minHeight: '280px',
  padding: '24px 16px',
  boxSizing: 'border-box',
  backgroundColor: '#f8fafc',
};

const errorCardStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  backgroundColor: '#ffffff',
  borderRadius: 12,
  border: '1px solid #fecaca',
  boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.05), 0 8px 10px -6px rgba(0, 0, 0, 0.02)',
  padding: '28px 32px',
  maxWidth: 540,
  width: '100%',
  boxSizing: 'border-box',
};

const iconBadgeStyle: React.CSSProperties = {
  width: 48,
  height: 48,
  borderRadius: '50%',
  backgroundColor: '#fef2f2',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  marginBottom: 14,
  border: '1px solid #fee2e2',
};

const debugCodeStyle: React.CSSProperties = {
  fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
  fontSize: '0.74rem',
  color: '#991b1b',
  backgroundColor: '#fef2f2',
  padding: '8px 12px',
  borderRadius: 6,
  marginBottom: 16,
  wordBreak: 'break-word',
  border: '1px solid #fee2e2',
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
  backgroundColor: '#0284c7',
  color: '#ffffff',
  fontWeight: 700,
  fontSize: '0.78rem',
  cursor: 'pointer',
  boxShadow: '0 2px 4px rgba(2, 132, 199, 0.2)',
};

const secondaryBtnStyle: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 6,
  padding: '8px 12px',
  borderRadius: 6,
  border: '1px solid #cbd5e1',
  backgroundColor: '#ffffff',
  color: '#475569',
  fontWeight: 600,
  fontSize: '0.78rem',
  cursor: 'pointer',
};