import React, { Component, ErrorInfo, ReactNode } from 'react';

interface ErrorBoundaryProps {
  children?: ReactNode;
  fallback?: ReactNode;
  onError?: (error: Error, errorInfo: ErrorInfo) => void;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
}

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
      errorInfo: null,
    };
    // FIX: To ensure 'this' context within handleReset, it's bound here.
    // This is a robust alternative to class property arrow functions, which may not be
    // supported in all build environments.
    this.handleReset = this.handleReset.bind(this);
  }

  static getDerivedStateFromError(error: Error): Partial<ErrorBoundaryState> {
    // This lifecycle method is called after an error has been thrown by a descendant component.
    // It receives the error that was thrown as a parameter and should return a value to update state.
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    // This lifecycle method is also called after an error has been thrown by a descendant component.
    // It receives two parameters: the error and an errorInfo object with a componentStack key.
    console.error('ErrorBoundary caught an error:', error, errorInfo);

    this.setState({
      error,
      errorInfo,
    });

    if (this.props.onError) {
      this.props.onError(error, errorInfo);
    }
  }

  // FIX: Converted from an arrow function class property to a standard class method
  // to maintain consistency with constructor-based initialization and binding.
  handleReset() {
    this.setState({
      hasError: false,
      error: null,
      errorInfo: null,
    });
  }

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }

      return (
        <div className="min-h-screen bg-black flex items-center justify-center p-6">
          <div className="max-w-2xl w-full bg-gray-900 rounded-lg border border-red-500/30 p-8">
            <h1 className="text-2xl font-black text-red-500 text-center mb-4 uppercase">
              Something Went Wrong
            </h1>
            <p className="text-gray-400 text-center mb-8">
              An unexpected error occurred.
            </p>
            <button
                onClick={this.handleReset}
                className="w-full px-6 py-3 bg-cyan-500 hover:bg-cyan-600 text-black font-black rounded uppercase transition-colors"
              >
                Try Again
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
