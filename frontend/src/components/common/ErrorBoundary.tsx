import React, { Component } from 'react';
import type { ErrorInfo, ReactNode } from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';

interface Props {
  children: ReactNode;
  featureName?: string;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null,
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error(
      `[AttendSure Fault Isolation] Error in ${this.props.featureName || 'feature'}:`,
      error,
      errorInfo
    );
  }

  private handleReset = () => {
    this.setState({ hasError: false, error: null });
  };

  public render() {
    if (this.state.hasError) {
      if (this.props.fallback) return this.props.fallback;

      return (
        <div style={errorContainerStyle}>
          <div style={errorCardStyle}>
            <div style={iconBadgeStyle}>
              <AlertTriangle size={26} color="#dc2626" />
            </div>
            <div style={{ textAlign: 'center' }}>
              <h3 style={{ margin: '0 0 6px 0', fontSize: '1rem', fontWeight: 800, color: '#0f172a' }}>
                {this.props.featureName || 'Feature'} Temporarily Unavailable
              </h3>
              <p style={{ margin: '0 0 14px 0', fontSize: '0.78rem', color: '#64748b', maxWidth: 440 }}>
                An isolated issue occurred while rendering this module. The rest of the system remains fully operational.
              </p>
              {this.state.error && (
                <div style={debugCodeStyle}>
                  {this.state.error.message || String(this.state.error)}
                </div>
              )}
            </div>
            <button
              type="button"
              onClick={this.handleReset}
              style={retryButtonStyle}
            >
              <RefreshCw size={14} />
              <span>Retry Feature</span>
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

const errorContainerStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  width: '100%',
  height: '100%',
  padding: 24,
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
  boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.05)',
  padding: '28px 32px',
  maxWidth: 520,
};

const iconBadgeStyle: React.CSSProperties = {
  width: 48,
  height: 48,
  borderRadius: 24,
  backgroundColor: '#fef2f2',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  marginBottom: 12,
};

const debugCodeStyle: React.CSSProperties = {
  fontFamily: 'monospace',
  fontSize: '0.7rem',
  color: '#b91c1c',
  backgroundColor: '#fef2f2',
  padding: '6px 12px',
  borderRadius: 6,
  marginBottom: 16,
  maxWidth: 420,
  wordBreak: 'break-word',
};

const retryButtonStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 8,
  padding: '8px 18px',
  borderRadius: 6,
  border: 'none',
  backgroundColor: '#0284c7',
  color: '#ffffff',
  fontWeight: 700,
  fontSize: '0.8rem',
  cursor: 'pointer',
};

export default ErrorBoundary;