'use client';

import React, { Component, ErrorInfo, ReactNode } from 'react';
import { logger, meter } from '@/otel-server';
import { SeverityNumber } from '@opentelemetry/api-logs';

// Metrics for error boundary
const errorBoundaryCounter = meter.createCounter('error_boundary_catches_total', {
  description: 'Total number of errors caught by error boundaries',
});

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
  onError?: (error: Error, errorInfo: ErrorInfo) => void;
}

interface State {
  hasError: boolean;
  error?: Error;
  errorInfo?: ErrorInfo;
  retryCount: number;
}

class ErrorBoundary extends Component<Props, State> {
  private retryTimeoutId?: NodeJS.Timeout;

  constructor(props: Props) {
    super(props);
    this.state = {
      hasError: false,
      retryCount: 0,
    };
  }

  static getDerivedStateFromError(error: Error): State {
    // Update state so the next render will show the fallback UI
    return {
      hasError: true,
      error,
      retryCount: 0,
    };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    // Log the error
    this.logError(error, errorInfo);

    // Update state with error info
    this.setState({
      error,
      errorInfo,
    });

    // Call custom error handler if provided
    if (this.props.onError) {
      this.props.onError(error, errorInfo);
    }

    // Auto-retry for chunk loading errors
    if (this.isChunkLoadError(error)) {
      this.scheduleRetry();
    }
  }

  componentWillUnmount() {
    if (this.retryTimeoutId) {
      clearTimeout(this.retryTimeoutId);
    }
  }

  private logError(error: Error, errorInfo: ErrorInfo) {
    const errorType = this.getErrorType(error);
    
    errorBoundaryCounter.add(1, { 
      error_type: errorType,
      component_stack: errorInfo.componentStack ? 'present' : 'missing'
    });

    logger.emit({
      severityNumber: SeverityNumber.ERROR,
      severityText: 'ERROR',
      body: 'Error boundary caught an error',
      attributes: {
        error_message: error.message,
        error_stack: error.stack?.substring(0, 1000), // Limit stack trace length
        error_type: errorType,
        component_stack: errorInfo.componentStack?.substring(0, 1000),
        retry_count: this.state.retryCount,
      },
    });
  }

  private getErrorType(error: Error): string {
    const message = error.message.toLowerCase();
    
    if (message.includes('chunk') || message.includes('loading')) {
      return 'chunk_load_error';
    }
    if (message.includes('network')) {
      return 'network_error';
    }
    if (message.includes('timeout')) {
      return 'timeout_error';
    }
    if (message.includes('script')) {
      return 'script_error';
    }
    
    return 'unknown_error';
  }

  private isChunkLoadError(error: Error): boolean {
    const message = error.message.toLowerCase();
    return message.includes('chunk') || 
           message.includes('loading css chunk') ||
           message.includes('loading chunk') ||
           message.includes('failed to import');
  }

  private scheduleRetry = () => {
    if (this.state.retryCount < 3) { // Max 3 retries
      const delay = Math.min(1000 * Math.pow(2, this.state.retryCount), 10000); // Exponential backoff, max 10s
      
      this.retryTimeoutId = setTimeout(() => {
        this.setState(prevState => ({
          hasError: false,
          error: undefined,
          errorInfo: undefined,
          retryCount: prevState.retryCount + 1,
        }));
      }, delay);
    }
  };

  private handleManualRetry = () => {
    // For manual retry, reload the page to ensure fresh chunks
    if (this.isChunkLoadError(this.state.error!)) {
      window.location.reload();
    } else {
      this.setState({
        hasError: false,
        error: undefined,
        errorInfo: undefined,
        retryCount: 0,
      });
    }
  };

  private handleReportError = () => {
    // In a real app, this would send the error to a reporting service
    const errorReport = {
      message: this.state.error?.message,
      stack: this.state.error?.stack,
      componentStack: this.state.errorInfo?.componentStack,
      userAgent: navigator.userAgent,
      url: window.location.href,
      timestamp: new Date().toISOString(),
    };

    console.log('Error report:', errorReport);
    
    // You could send this to an error reporting service like Sentry
    // Example: Sentry.captureException(this.state.error, { extra: errorReport });
  };

  render() {
    if (this.state.hasError) {
      // Custom fallback UI
      if (this.props.fallback) {
        return this.props.fallback;
      }

      // Default fallback UI
      const isChunkError = this.state.error && this.isChunkLoadError(this.state.error);
      
      return (
        <div className="min-h-screen bg-gray-50 flex flex-col justify-center py-12 sm:px-6 lg:px-8">
          <div className="sm:mx-auto sm:w-full sm:max-w-md">
            <div className="bg-white py-8 px-4 shadow sm:rounded-lg sm:px-10">
              <div className="text-center">
                <div className="mx-auto flex items-center justify-center h-12 w-12 rounded-full bg-red-100">
                  <svg
                    className="h-6 w-6 text-red-600"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L3.732 16.5c-.77.833.192 2.5 1.732 2.5z"
                    />
                  </svg>
                </div>
                
                <h2 className="mt-4 text-lg font-medium text-gray-900">
                  {isChunkError ? 'Loading Error' : 'Something went wrong'}
                </h2>
                
                <p className="mt-2 text-sm text-gray-600">
                  {isChunkError
                    ? 'There was a problem loading part of the application. This usually happens when the app has been updated.'
                    : 'An unexpected error occurred. Please try again.'}
                </p>

                {this.state.error && (
                  <details className="mt-4 text-left">
                    <summary className="text-sm text-gray-500 cursor-pointer hover:text-gray-700">
                      Error details
                    </summary>
                    <pre className="mt-2 text-xs text-gray-600 bg-gray-100 p-2 rounded overflow-auto max-h-32">
                      {this.state.error.message}
                    </pre>
                  </details>
                )}

                <div className="mt-6 flex flex-col space-y-3">
                  <button
                    onClick={this.handleManualRetry}
                    className="w-full flex justify-center py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
                  >
                    {isChunkError ? 'Reload Page' : 'Try Again'}
                  </button>
                  
                  <button
                    onClick={() => window.location.href = '/'}
                    className="w-full flex justify-center py-2 px-4 border border-gray-300 rounded-md shadow-sm text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
                  >
                    Go to Home
                  </button>

                  <button
                    onClick={this.handleReportError}
                    className="w-full flex justify-center py-2 px-4 border border-gray-300 rounded-md shadow-sm text-sm font-medium text-gray-500 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
                  >
                    Report Error
                  </button>
                </div>

                {this.state.retryCount > 0 && (
                  <p className="mt-4 text-xs text-gray-500">
                    Retry attempt: {this.state.retryCount}/3
                  </p>
                )}
              </div>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

// Higher-order component for easier usage
export function withErrorBoundary<P extends object>(
  Component: React.ComponentType<P>,
  fallback?: ReactNode
) {
  const WrappedComponent = (props: P) => (
    <ErrorBoundary fallback={fallback}>
      <Component {...props} />
    </ErrorBoundary>
  );

  WrappedComponent.displayName = `withErrorBoundary(${Component.displayName || Component.name})`;
  
  return WrappedComponent;
}

export default ErrorBoundary;
