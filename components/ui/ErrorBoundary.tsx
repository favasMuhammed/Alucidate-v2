import React from 'react';
import { ErrorBoundary as ReactErrorBoundary, FallbackProps } from 'react-error-boundary';

interface ErrorBoundaryProps {
    children: React.ReactNode;
    fallback?: React.ReactNode;
}

const ErrorFallback = ({ error, resetErrorBoundary }: FallbackProps) => {
    return (
        <div className="flex flex-col items-center justify-center min-h-[60vh] text-center px-6">
            <div className="text-4xl mb-4">⚠️</div>
            <h2 className="text-xl font-bold text-ink mb-2">Something went wrong</h2>
            <p className="text-sm text-ink-2 max-w-sm mb-6">
                {(error as any).message || 'An unexpected error occurred.'}
            </p>
            <button
                onClick={resetErrorBoundary}
                className="px-5 py-2 bg-brand text-white text-sm font-bold rounded-lg hover:bg-brand-dim transition-colors"
            >
                Try Again
            </button>
        </div>
    );
};

export const ErrorBoundary: React.FC<ErrorBoundaryProps> = ({ children, fallback }) => {
    return (
        <ReactErrorBoundary
            FallbackComponent={fallback ? () => <>{fallback}</> : ErrorFallback}
            onReset={() => {
                // Optional: reset the state of your app here
            }}
        >
            {children}
        </ReactErrorBoundary>
    );
};
