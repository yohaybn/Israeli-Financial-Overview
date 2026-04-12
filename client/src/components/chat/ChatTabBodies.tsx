import { useTranslation } from 'react-i18next';
import { Send, User, Bot, HelpCircle, Loader2 } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import type { RefObject } from 'react';
import type { AnalystMessage } from './useAnalystChat';

type HelpMsg = { role: 'user' | 'assistant'; content: string };

export function HelpChatBody({
    messages,
    isLoading,
    messagesEndRef,
}: {
    messages: HelpMsg[];
    isLoading: boolean;
    messagesEndRef: RefObject<HTMLDivElement>;
}) {
    const { t } = useTranslation();

    return (
        <>
            {messages.length === 0 && (
                <div className="text-center text-gray-400 mt-10">
                    <HelpCircle className="w-12 h-12 mx-auto mb-3 opacity-20" />
                    <p className="text-sm">{t('help.empty_state', 'Ask me anything about how to use the app!')}</p>
                    <button
                        type="button"
                        onClick={() => window.dispatchEvent(new CustomEvent('open-feedback-modal'))}
                        className="mt-4 inline-block text-sm text-blue-600 hover:text-blue-800 underline"
                    >
                        {t('feedback.chat_link')}
                    </button>
                </div>
            )}
            {messages.map((m, i) => (
                <div key={i} className={`flex gap-3 ${m.role === 'user' ? 'flex-row-reverse' : 'flex-row'}`}>
                    <div
                        className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 shadow-sm ${
                            m.role === 'user' ? 'bg-indigo-100 text-indigo-700' : 'bg-blue-600 text-white'
                        }`}
                    >
                        {m.role === 'user' ? <User className="w-5 h-5" /> : <Bot className="w-5 h-5" />}
                    </div>
                    <div
                        className={`px-4 py-3 rounded-2xl max-w-[80%] text-sm ${
                            m.role === 'user'
                                ? 'bg-indigo-600 text-white rounded-tr-none'
                                : 'bg-white border border-gray-100 shadow-sm text-gray-800 rounded-tl-none prose prose-sm prose-p:my-1 prose-a:text-blue-600 prose-ul:my-1 prose-li:my-0'
                        }`}
                    >
                        {m.role === 'user' ? (
                            m.content
                        ) : (
                            <ReactMarkdown
                                remarkPlugins={[remarkGfm]}
                                components={{
                                    a: ({ ...props }) => {
                                        const isInternal = props.href?.startsWith('/');
                                        if (isInternal) {
                                            return (
                                                <a
                                                    {...props}
                                                    className="text-blue-600 hover:text-blue-800 underline transition-colors"
                                                    onClick={(e) => {
                                                        e.preventDefault();
                                                        window.history.pushState({}, '', props.href);
                                                        window.dispatchEvent(new Event('popstate'));
                                                    }}
                                                />
                                            );
                                        }
                                        return (
                                            <a
                                                {...props}
                                                className="text-blue-600 hover:text-blue-800 underline transition-colors"
                                                target="_blank"
                                                rel="noopener noreferrer"
                                            />
                                        );
                                    },
                                }}
                            >
                                {m.content}
                            </ReactMarkdown>
                        )}
                    </div>
                </div>
            ))}
            {isLoading && (
                <div className="flex gap-3">
                    <div className="w-8 h-8 rounded-full flex items-center justify-center shrink-0 shadow-sm bg-blue-600 text-white">
                        <Bot className="w-5 h-5" />
                    </div>
                    <div className="px-4 py-3 rounded-2xl rounded-tl-none bg-white border border-gray-100 shadow-sm flex items-center gap-2 text-gray-500 text-sm">
                        <Loader2 className="w-4 h-4 animate-spin" />
                        {t('help.thinking', 'Thinking...')}
                    </div>
                </div>
            )}
            <div ref={messagesEndRef} />
        </>
    );
}

export function AnalystChatBody({
    messages,
    isPending,
    messagesEndRef,
    onRetry,
    onNavigateToLogs,
}: {
    messages: AnalystMessage[];
    isPending: boolean;
    messagesEndRef: RefObject<HTMLDivElement>;
    onRetry: (query: string) => void;
    onNavigateToLogs?: () => void;
}) {
    const { t } = useTranslation();

    return (
        <>
            {messages.map((msg) => (
                <div key={msg.id} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                    <div
                        className={`max-w-[85%] rounded-2xl p-3.5 ${
                            msg.role === 'user'
                                ? 'bg-blue-600 text-white rounded-tr-sm shadow-sm'
                                : 'bg-white border border-gray-100 text-gray-700 rounded-tl-sm shadow-sm'
                        } ${msg.isError ? 'border-red-200 bg-red-50 text-red-700' : ''}`}
                    >
                        {msg.isError ? (
                            <div className="space-y-2">
                                <div className="font-bold flex items-center gap-1 text-red-800">
                                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path
                                            strokeLinecap="round"
                                            strokeLinejoin="round"
                                            strokeWidth="2"
                                            d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                                        />
                                    </svg>
                                    {msg.errorDetails?.title || t('common.error')}
                                </div>
                                <div className="text-sm leading-relaxed">
                                    <ReactMarkdown
                                        components={{
                                            p: ({ children }) => <p className="mb-1 last:mb-0">{children}</p>,
                                            strong: ({ children }) => <span className="font-bold">{children}</span>,
                                            em: ({ children }) => <span className="italic">{children}</span>,
                                            code: ({ children }) => (
                                                <code className="bg-red-100/50 px-1 rounded text-xs font-mono">{children}</code>
                                            ),
                                        }}
                                    >
                                        {msg.content}
                                    </ReactMarkdown>
                                </div>
                                {msg.errorDetails?.solution && (
                                    <div className="mt-2 p-2 bg-white/50 rounded-lg border border-red-100 text-xs italic">
                                        <span className="font-semibold not-italic">{t('common.solution')}: </span>
                                        {msg.errorDetails.solution}
                                        {onNavigateToLogs && (
                                            <button
                                                type="button"
                                                onClick={onNavigateToLogs}
                                                className="block mt-1 text-blue-600 hover:underline not-italic font-semibold"
                                            >
                                                {t('ai_chat.view_ai_logs')}
                                            </button>
                                        )}
                                    </div>
                                )}
                                {msg.errorDetails?.rateLimit &&
                                    (msg.errorDetails.rateLimit.limitRequests ||
                                        msg.errorDetails.rateLimit.remainingRequests ||
                                        msg.errorDetails.rateLimit.remainingTokens) && (
                                        <ul className="mt-2 p-2 bg-white/60 rounded-lg border border-red-100 text-xs font-mono text-red-900 space-y-1">
                                            {msg.errorDetails.rateLimit.limitRequests != null &&
                                                msg.errorDetails.rateLimit.limitRequests !== '' && (
                                                    <li>
                                                        <span className="font-sans font-semibold">
                                                            {t('ai_errors.rate_limit_total_requests')}:
                                                        </span>{' '}
                                                        {msg.errorDetails.rateLimit.limitRequests}
                                                    </li>
                                                )}
                                            {msg.errorDetails.rateLimit.remainingRequests != null &&
                                                msg.errorDetails.rateLimit.remainingRequests !== '' && (
                                                    <li>
                                                        <span className="font-sans font-semibold">
                                                            {t('ai_errors.rate_limit_remaining_requests')}:
                                                        </span>{' '}
                                                        {msg.errorDetails.rateLimit.remainingRequests}
                                                    </li>
                                                )}
                                            {msg.errorDetails.rateLimit.remainingTokens != null &&
                                                msg.errorDetails.rateLimit.remainingTokens !== '' && (
                                                    <li>
                                                        <span className="font-sans font-semibold">
                                                            {t('ai_errors.rate_limit_remaining_tokens')}:
                                                        </span>{' '}
                                                        {msg.errorDetails.rateLimit.remainingTokens}
                                                    </li>
                                                )}
                                        </ul>
                                    )}
                                {msg.userQuery && (
                                    <button
                                        type="button"
                                        onClick={() => onRetry(msg.userQuery!)}
                                        className="mt-2 text-xs font-semibold hover:opacity-75 flex items-center gap-1 text-red-600"
                                    >
                                        <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path
                                                strokeLinecap="round"
                                                strokeLinejoin="round"
                                                strokeWidth="2"
                                                d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
                                            />
                                        </svg>
                                        {t('common.retry')}
                                    </button>
                                )}
                            </div>
                        ) : (
                            <div className={`text-sm leading-relaxed ${msg.role === 'user' ? 'text-white' : 'text-gray-700'}`}>
                                {msg.role === 'assistant' && msg.usedFallbackModel && (
                                    <div
                                        className="mb-2.5 rounded-xl border border-amber-200/90 bg-amber-50 px-3 py-2 text-xs text-amber-950 leading-snug"
                                        role="status"
                                    >
                                        {t('ai_chat.fallback_used', { model: msg.usedFallbackModel })}
                                    </div>
                                )}
                                <ReactMarkdown
                                    components={{
                                        p: ({ children }) => <p className="mb-1 last:mb-0">{children}</p>,
                                        strong: ({ children }) => <span className="font-bold">{children}</span>,
                                        em: ({ children }) => <span className="italic">{children}</span>,
                                        ul: ({ children }) => (
                                            <ul
                                                className={`list-disc pl-4 mb-2 ${
                                                    msg.role === 'user' ? 'border-white/20' : 'border-gray-200'
                                                }`}
                                            >
                                                {children}
                                            </ul>
                                        ),
                                        ol: ({ children }) => (
                                            <ol
                                                className={`list-decimal pl-4 mb-2 ${
                                                    msg.role === 'user' ? 'border-white/20' : 'border-gray-200'
                                                }`}
                                            >
                                                {children}
                                            </ol>
                                        ),
                                        li: ({ children }) => <li className="mb-0.5">{children}</li>,
                                        code: ({ children }) => (
                                            <code
                                                className={`px-1 rounded text-xs font-mono ${
                                                    msg.role === 'user' ? 'bg-blue-700 text-blue-50' : 'bg-gray-100 text-gray-800'
                                                }`}
                                            >
                                                {children}
                                            </code>
                                        ),
                                    }}
                                >
                                    {msg.content}
                                </ReactMarkdown>
                            </div>
                        )}
                    </div>
                </div>
            ))}
            {isPending && (
                <div className="flex justify-start">
                    <div className="max-w-[85%] bg-white border border-gray-100 rounded-2xl p-4 rounded-tl-sm shadow-sm">
                        <div className="flex items-center gap-1.5">
                            <div className="w-2 h-2 bg-blue-400 rounded-full animate-bounce" />
                            <div className="w-2 h-2 bg-blue-500 rounded-full animate-bounce" style={{ animationDelay: '0.2s' }} />
                            <div className="w-2 h-2 bg-indigo-500 rounded-full animate-bounce" style={{ animationDelay: '0.4s' }} />
                        </div>
                    </div>
                </div>
            )}
            <div ref={messagesEndRef} />
        </>
    );
}

export function HelpChatFooterInput({
    input,
    setInput,
    isLoading,
    onSubmit,
}: {
    input: string;
    setInput: (v: string) => void;
    isLoading: boolean;
    onSubmit: (e: React.FormEvent) => void;
}) {
    const { t } = useTranslation();
    return (
        <form onSubmit={onSubmit} className="flex gap-2 w-full">
            <input
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder={t('help.input_placeholder', 'Ask a question...')}
                className="flex-1 px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all"
                disabled={isLoading}
            />
            <button
                type="submit"
                disabled={!input.trim() || isLoading}
                className="p-2.5 bg-blue-600 text-white rounded-xl hover:bg-blue-700 disabled:opacity-50 transition-colors shadow-sm shrink-0"
            >
                <Send className="w-4 h-4" />
            </button>
        </form>
    );
}

export function AnalystChatFooterInput({
    input,
    setInput,
    isPending,
    onSubmit,
}: {
    input: string;
    setInput: (v: string) => void;
    isPending: boolean;
    onSubmit: (e: React.FormEvent) => void;
}) {
    const { t } = useTranslation();
    return (
        <form onSubmit={onSubmit} className="relative w-full">
            <textarea
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                        e.preventDefault();
                        onSubmit(e);
                    }
                }}
                placeholder={t('dashboard.ask_ai_placeholder')}
                className="w-full bg-gray-50 border border-gray-200 text-gray-800 text-sm rounded-xl pl-4 pr-12 py-3 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 resize-none"
                rows={2}
                disabled={isPending}
            />
            <button
                type="submit"
                disabled={!input.trim() || isPending}
                className="absolute right-2 bottom-2 p-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:hover:bg-blue-600 transition-colors shadow-sm"
            >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
                </svg>
            </button>
        </form>
    );
}
