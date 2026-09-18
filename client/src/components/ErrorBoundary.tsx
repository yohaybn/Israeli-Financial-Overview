import { Component, type ErrorInfo, type ReactNode } from 'react';
import i18n from '../i18n';

type ErrorBoundaryProps = {
    children: ReactNode;
    /** Optional custom fallback UI instead of the built-in error screen. */
    fallback?: ReactNode;
    /** Label for logging - which part of the app crashed (e.g. 'view:dashboard'). */
    name?: string;
};

type ErrorBoundaryState = {
    error: Error | null;
};

/**
 * Catches render errors below it and shows a recoverable error screen instead of
 * a white page. Mounted at the app root (main.tsx) and around the per-view content
 * area (App.tsx) so a single crashing view keeps the header and navigation alive.
 */
export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
    state: ErrorBoundaryState = { error: null };

    static getDerivedStateFromError(error: Error): ErrorBoundaryState {
        return { error };
    }

    componentDidCatch(error: Error, info: ErrorInfo): void {
        // eslint-disable-next-line no-console -- last-resort crash logging; there is no client logger
        console.error(`[ErrorBoundary${this.props.name ? `:${this.props.name}` : ''}]`, error, info.componentStack);
    }

    private handleRetry = (): void => {
        this.setState({ error: null });
    };

    private handleReload = (): void => {
        window.location.reload();
    };

    render(): ReactNode {
        const { error } = this.state;
        if (!error) {
            return this.props.children;
        }
        if (this.props.fallback) {
            return this.props.fallback;
        }

        const t = (key: string, defaultValue: string): string =>
            i18n.t(key, { defaultValue });

        return (
            <div
                role="alert"
                className="flex h-full min-h-[16rem] flex-col items-center justify-center gap-4 p-6 text-center bg-gray-50"
            >
                <div className="max-w-md rounded-2xl border border-red-200 bg-white p-6 shadow-sm">
                    <h2 className="text-lg font-bold text-red-800">
                        {t('errors.boundary.title', 'משהו השתבש')}
                    </h2>
                    <p className="mt-2 text-sm text-gray-600">
                        {t('errors.boundary.description', 'חלק מהמסך קרס. אפשר לנסות שוב, או לרענן את הדף אם הבעיה חוזרת.')}
                    </p>
                    <div className="mt-4 flex items-center justify-center gap-3">
                        <button
                            type="button"
                            onClick={this.handleRetry}
                            className="rounded-lg bg-emerald-700 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500"
                        >
                            {t('errors.boundary.retry', 'ניסוי חוזר')}
                        </button>
                        <button
                            type="button"
                            onClick={this.handleReload}
                            className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500"
                        >
                            {t('errors.boundary.reload', 'רענון הדף')}
                        </button>
                    </div>
                    {import.meta.env.DEV && (
                        <pre className="mt-4 max-h-40 overflow-auto rounded bg-gray-100 p-2 text-start text-xs text-gray-500 whitespace-pre-wrap" dir="ltr">
                            {String(error?.message || error)}
                        </pre>
                    )}
                </div>
            </div>
        );
    }
}

export default ErrorBoundary;
