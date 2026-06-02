import React from 'react';

class ErrorBoundary extends React.Component {
    constructor(props) {
        super(props);
        this.state = { hasError: false, error: null, errorInfo: null };
    }

    static getDerivedStateFromError(error) {
        return { hasError: true };
    }

    componentDidCatch(error, errorInfo) {
        console.error("Uncaught error:", error, errorInfo);
        this.setState({ error, errorInfo });
    }

    render() {
        if (this.state.hasError) {
            return (
                <div className="min-h-screen bg-[#0a0a1a] text-red-500 font-mono p-10 flex flex-col gap-4">
                    <h1 className="text-3xl font-bold">OrbitOPS System Critical Failure</h1>
                    <div className="bg-red-900/20 border border-red-500/50 p-6 rounded-xl backdrop-blur-md">
                        <h2 className="text-xl mb-2">Error Log:</h2>
                        <pre className="whitespace-pre-wrap text-sm text-red-300">
                            {this.state.error && this.state.error.toString()}
                        </pre>
                        <details className="mt-4">
                            <summary className="cursor-pointer text-red-400 hover:text-red-300">Stack Trace</summary>
                            <pre className="whitespace-pre-wrap text-xs text-gray-400 mt-2">
                                {this.state.errorInfo && this.state.errorInfo.componentStack}
                            </pre>
                        </details>
                    </div>
                    <button
                        onClick={() => window.location.reload()}
                        className="self-start px-6 py-3 bg-neon-cyan/20 border border-neon-cyan text-neon-cyan rounded-lg hover:bg-neon-cyan hover:text-black transition-colors"
                    >
                        Reboot System
                    </button>
                </div>
            );
        }

        return this.props.children;
    }
}

export default ErrorBoundary;
