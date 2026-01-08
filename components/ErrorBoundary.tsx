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
  // FIX: Switched to a constructor for state initialization.
  // The class property `state = {}` syntax might not be correctly transformed by some build setups,
  // leading to `this` context issues. A constructor is the standard, universally compatible way to initialize state.
  constructor(props: ErrorBoundaryProps) {
    super(props);
    // FIX: Class properties like 'state' must be assigned to 'this.state' inside a constructor.
    this.state = {
      hasError: false,
      error: null,
      errorInfo: null,
    };
  }

  static getDerivedStateFromError(error: Error): Partial<ErrorBoundaryState> {
    // This lifecycle method is called after an error has been thrown by a descendant component.
    // It receives the error that was thrown as a parameter and should return a value to update state.
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('ErrorBoundary caught an error:', error, errorInfo);

    // FIX: 'setState' and 'props' must be accessed via 'this' in class components.
    this.setState({
      error,
      errorInfo,
    });

    if (this.props.onError) {
      this.props.onError(error, errorInfo);
    }
  }

  handleReset = () => {
    // FIX: 'setState' must be accessed via 'this' in class components.
    this.setState({
      hasError: false,
      error: null,
      errorInfo: null,
    });
  };

  render() {
    // FIX: 'state' and 'props' must be accessed via 'this' in class components.
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
