'use client';

import React, { Component, ErrorInfo, ReactNode } from 'react';
import { trace, SpanStatusCode } from '@opentelemetry/api';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
  onError?: (error: Error, errorInfo: ErrorInfo) => void;
}

interface State {
  hasError: boolean;
  error?: Error;
  errorInfo?: ErrorInfo;
}

/**
 * Error Boundary component that catches JavaScript errors anywhere in the child component tree,
 * logs those errors to OpenTelemetry, and displays a fallback UI instead of the component tree that crashed.
 */
export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(error: Error): State {
    // Update state so the next render will show the fallback UI
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    // Log error to OpenTelemetry
    const tracer = trace.getTracer('caltrain-app');
    
    tracer.startActiveSpan('react-error-boundary', (span) => {
      span.recordException(error);
      span.setAttributes({
        'error.type': 'react_error',
        'error.component': errorInfo.componentStack?.split('\n')[1]?.trim() || 'unknown',
        'error.message': error.message,
        'error.stack': error.stack || 'no stack trace',
        'error.component_stack': errorInfo.componentStack || 'no component stack'
      });
      span.setStatus({ code: SpanStatusCode.ERROR, message: error.message });
      span.end();
    });

    // Log to console for development
    console.error('React Error Boundary caught an error:', error, errorInfo);

    // Update state with error info
    this.setState({ error, errorInfo });

    // Call custom error handler if provided
    if (this.props.onError) {
      this.props.onError(error, errorInfo);
    }
  }

  private handleRetry = () => {
    this.setState({ hasError: false, error: undefined, errorInfo: undefined });
  };

  private handleReload = () => {
    window.location.reload();
  };

  render() {
    if (this.state.hasError) {
      // Custom fallback UI
      if (this.props.fallback) {
        return this.props.fallback;
      }

      // Default fallback UI
      return (
        <div className="bg-red-50 border border-red-200 rounded-lg p-6 m-4">
          <div className="flex items-start">
            <div className="flex-shrink-0">
              <svg className="h-5 w-5 text-red-400" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
              </svg>
            </div>
            <div className="ml-3 flex-1">
              <h3 className="text-sm font-medium text-red-800">
                Something went wrong
              </h3>
              <div className="mt-2 text-sm text-red-700">
                <p>
                  We encountered an unexpected error while loading this component. 
                  This has been automatically reported to our monitoring system.
                </p>
              </div>
              <div className="mt-4 flex space-x-3">
                <button
                  onClick={this.handleRetry}
                  className="bg-red-100 hover:bg-red-200 text-red-800 px-3 py-2 rounded-md text-sm font-medium transition-colors"
                >
                  Try Again
                </button>
                <button
                  onClick={this.handleReload}
                  className="bg-gray-100 hover:bg-gray-200 text-gray-800 px-3 py-2 rounded-md text-sm font-medium transition-colors"
                >
                  Reload Page
                </button>
              </div>
              {process.env.NODE_ENV === 'development' && this.state.error && (
                <details className="mt-4">
                  <summary className="text-sm font-medium text-red-800 cursor-pointer">
                    Error Details (Development Only)
                  </summary>
                  <div className="mt-2 p-3 bg-red-100 rounded border text-xs font-mono text-red-900 overflow-auto">
                    <div className="mb-2">
                      <strong>Error:</strong> {this.state.error.message}
                    </div>
                    {this.state.error.stack && (
                      <div className="mb-2">
                        <strong>Stack Trace:</strong>
                        <pre className="whitespace-pre-wrap">{this.state.error.stack}</pre>
                      </div>
                    )}
                    {this.state.errorInfo?.componentStack && (
                      <div>
                        <strong>Component Stack:</strong>
                        <pre className="whitespace-pre-wrap">{this.state.errorInfo.componentStack}</pre>
                      </div>
                    )}
                  </div>
                </details>
              )}
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

/**
 * Higher-order component that wraps a component with an ErrorBoundary
 */
export function withErrorBoundary<P extends object>(
  Component: React.ComponentType<P>,
  fallback?: ReactNode,
  onError?: (error: Error, errorInfo: ErrorInfo) => void
) {
  const WrappedComponent = (props: P) => (
    <ErrorBoundary fallback={fallback} onError={onError}>
      <Component {...props} />
    </ErrorBoundary>
  );

  WrappedComponent.displayName = `withErrorBoundary(${Component.displayName || Component.name})`;
  
  return WrappedComponent;
}

/**
 * Hook for handling async errors in functional components
 * Since Error Boundaries only catch errors in render methods and lifecycle methods,
 * this hook can be used to manually trigger the error boundary for async errors.
 */
export function useErrorHandler() {
  const [, setError] = React.useState<Error | null>(null);

  return React.useCallback((error: Error) => {
    // Log async error to OpenTelemetry
    const tracer = trace.getTracer('caltrain-app');
    
    tracer.startActiveSpan('async-error', (span) => {
      span.recordException(error);
      span.setAttributes({
        'error.type': 'async_error',
        'error.message': error.message,
        'error.stack': error.stack || 'no stack trace'
      });
      span.setStatus({ code: SpanStatusCode.ERROR, message: error.message });
      span.end();
    });

    console.error('Async error caught by useErrorHandler:', error);
    
    // Trigger error boundary by setting error in state
    setError(() => {
      throw error;
    });
  }, []);
}

/**
 * Simple error fallback component for specific use cases
 */
export function SimpleErrorFallback({ 
  error, 
  resetError, 
  message = "Something went wrong" 
}: { 
  error?: Error; 
  resetError?: () => void; 
  message?: string; 
}) {
  return (
    <div className="text-center py-8">
      <div className="text-red-600 mb-4">
        <svg className="mx-auto h-12 w-12" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L3.732 16.5c-.77.833.192 2.5 1.732 2.5z" />
        </svg>
      </div>
      <h3 className="text-lg font-medium text-gray-900 mb-2">{message}</h3>
      <p className="text-gray-600 mb-4">Please try refreshing the page or contact support if the problem persists.</p>
      {resetError && (
        <button
          onClick={resetError}
          className="bg-blue-500 hover:bg-blue-600 text-white px-4 py-2 rounded transition-colors"
        >
          Try Again
        </button>
      )}
    </div>
  );
}
