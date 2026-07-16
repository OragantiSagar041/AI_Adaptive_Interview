import React from 'react';
import { AlertCircle } from 'lucide-react';

class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    console.error("ErrorBoundary caught an error:", error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex flex-col items-center justify-center h-full w-full p-6 bg-[#0a0f1e] text-white rounded-xl shadow-lg border border-rose-500/20">
          <AlertCircle size={48} className="text-rose-500 mb-4" />
          <h3 className="text-xl font-bold text-rose-400 mb-2">
            Something went wrong while loading this module.
          </h3>
          <p className="text-sm text-slate-400 mb-6 max-w-md text-center">
            {this.state.error?.message || "An unexpected error occurred."}
          </p>
          <button 
            className="px-6 py-2 bg-rose-500 hover:bg-rose-600 text-white font-semibold rounded-lg transition-colors"
            onClick={() => this.setState({ hasError: false })}
          >
            Try Again
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;
