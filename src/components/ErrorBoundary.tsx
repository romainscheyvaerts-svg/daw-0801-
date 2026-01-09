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
  // FIX: Initialized state within the constructor, which is a standard and widely supported method for class components.
  constructor(props: ErrorBoundaryProps) {
    super(props);
    // FIX: `state` is a property of the component instance and must be assigned to `this.state`.
    // FIX: Property 'state' does not exist on type 'ErrorBoundary'.
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

    // FIX: `setState` is a method on the component instance and must be called via `this.setState`.
    // FIX: Property 'setState' does not exist on type 'ErrorBoundary'.
    this.setState({
      error,
      errorInfo,
    });

    // FIX: `props` are accessed via `this.props` in class components.
    // FIX: Property 'props' does not exist on type 'ErrorBoundary'.
    if (this.props.onError) {
      // FIX: `props` are accessed via `this.props` in class components.
      // FIX: Property 'props' does not exist on type 'ErrorBoundary'.
      this.props.onError(error, errorInfo);
    }
  }

  handleReset = () => {
    // FIX: `setState` is a method on the component instance and must be called via `this.setState`.
    // FIX: Property 'setState' does not exist on type 'ErrorBoundary'.
    this.setState({
      hasError: false,
      error: null,
      errorInfo: null,
    });
  };

  render() {
    // FIX: `state` is accessed via `this.state` in class components.
    // FIX: Property 'state' does not exist on type 'ErrorBoundary'.
    if (this.state.hasError) {
      // FIX: `props` are accessed via `this.props` in class components.
      // FIX: Property 'props' does not exist on type 'ErrorBoundary'.
      if (this.props.fallback) {
        // FIX: `props` are accessed via `this.props` in class components.
        // FIX: Property 'props' does not exist on type 'ErrorBoundary'.
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
            {/* FIX: Component methods must be called on the `this` instance. */}
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

    // FIX: `props` are accessed via `this.props` in class components.
    // FIX: Property 'props' does not exist on type 'ErrorBoundary'.
    return this.props.children;
  }
}

// FIX: Add default export to match expected module structure
export default ErrorBoundary;
