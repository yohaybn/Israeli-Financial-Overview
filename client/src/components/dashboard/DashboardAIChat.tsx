import React, { useState, useRef, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useUnifiedAIChat, useAISettings } from '../../hooks/useScraper';
import { AISettings } from '../AISettings';
import { mapAIError, AIErrorDetails } from '../../utils/aiErrorMapper';
import ReactMarkdown from 'react-markdown';

interface Message {
    id: string;
    role: 'user' | 'assistant';
    content: string;
    isError?: boolean;
    errorDetails?: AIErrorDetails;
    userQuery?: string;
}

interface DashboardAIChatProps {
    isOpen: boolean;
    onClose: () => void;
    scope: 'all' | string; // 'all' or specific filename
    contextMonth: string;
    onNavigateToLogs?: () => void;
}

export function DashboardAIChat({ isOpen, onClose, scope, contextMonth, onNavigateToLogs }: DashboardAIChatProps) {
    const { t } = useTranslation();
    const [messages, setMessages] = useState<Message[]>([]);
    const [input, setInput] = useState('');
    const [showSettings, setShowSettings] = useState(false);
    const { data: aiSettings } = useAISettings();
    const chatMutation = useUnifiedAIChat();
    const messagesEndRef = useRef<HTMLDivElement>(null);

    // Initial greeting when opened
    useEffect(() => {
        if (isOpen && messages.length === 0) {
            setMessages([{
                id: 'greeting',
                role: 'assistant',
                content: t('ai_chat.greeting'),
            }]);
        }
    }, [isOpen, messages.length, t]);

    useEffect(() => {
        if (isOpen) {
            messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
        }
    }, [messages, isOpen]);

    const handleSend = async (msgToSend: string, isRetry: boolean = false) => {
        if (!msgToSend.trim() || chatMutation.isPending) return;

        if (!isRetry) {
            setInput('');
            setMessages(prev => [...prev, {
                id: Date.now().toString(),
                role: 'user',
                content: msgToSend,
            }]);
        } else {
            // Remove previous error message
            setMessages(prev => prev.filter(m => !m.isError));
        }

        const historyNote = `The user is currently viewing the dashboard for the month of ${contextMonth}. When answering, make sure to distinguish between their historical data (all transactions) and the data for this specific month if it is relevant to their question.`;

        try {
            const response = await chatMutation.mutateAsync({
                query: msgToSend,
                scope: scope === 'all' ? 'all' : undefined,
                filename: scope !== 'all' ? scope : undefined,
                historyNote
            });

            setMessages(prev => [...prev, {
                id: (Date.now() + 1).toString(),
                role: 'assistant',
                content: response
            }]);
        } catch (error: any) {
            console.error('AI Chat Error:', error);
            const errorDetails = mapAIError(error.response?.data || error);
            setMessages(prev => [...prev, {
                id: (Date.now() + 1).toString(),
                role: 'assistant',
                content: errorDetails.description,
                isError: true,
                errorDetails,
                userQuery: msgToSend
            }]);
        }
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        handleSend(input);
    };

    if (!isOpen) return null;

    return (
        <>
            {/* Backdrop */}
            <div
                className="fixed inset-0 bg-gray-900/20 backdrop-blur-sm z-40 transition-opacity"
                onClick={onClose}
            />

            {/* Drawer */}
            <div className="fixed inset-y-0 right-0 w-full md:w-[450px] bg-white shadow-2xl z-50 flex flex-col transform transition-transform duration-300 pointer-events-auto">
                {/* Header */}
                <div className="flex items-center justify-between p-4 border-b border-gray-100 bg-gradient-to-r from-indigo-50 to-blue-50/50">
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 bg-gradient-to-br from-indigo-500 to-blue-600 rounded-xl flex items-center justify-center shadow-md shadow-blue-200">
                            <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z" />
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 8h.01" />
                            </svg>
                        </div>
                        <div>
                            <h3 className="text-[15px] font-bold text-gray-800">
                                {t('dashboard.ai_analyst')}
                            </h3>
                            <p className="text-xs text-gray-500">
                                Powered by {aiSettings?.chatModel || 'Gemini 2.5 Pro'}
                            </p>
                        </div>
                    </div>
                    <div className="flex items-center gap-2">
                        <button
                            onClick={() => setShowSettings(true)}
                            className="p-2 text-gray-400 hover:text-blue-600 hover:bg-white rounded-full transition-colors"
                            title={t('ai_settings.title')}
                        >
                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                            </svg>
                        </button>
                        <button
                            onClick={onClose}
                            className="p-2 text-gray-400 hover:text-gray-600 hover:bg-white rounded-full transition-colors"
                        >
                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
                            </svg>
                        </button>
                    </div>
                </div>

                {/* Messages Area */}
                <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-gray-50/30">
                    {messages.map((msg) => (
                        <div key={msg.id} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                            <div className={`max-w-[85%] rounded-2xl p-3.5 ${msg.role === 'user'
                                ? 'bg-blue-600 text-white rounded-tr-sm shadow-sm'
                                : 'bg-white border border-gray-100 text-gray-700 rounded-tl-sm shadow-sm'
                                } ${msg.isError ? 'border-red-200 bg-red-50 text-red-700' : ''}`}>
                                {msg.isError ? (
                                    <div className="space-y-2">
                                        <div className="font-bold flex items-center gap-1 text-red-800">
                                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                                            {msg.errorDetails?.title || t('common.error')}
                                        </div>
                                        <div className="text-sm leading-relaxed">
                                            <ReactMarkdown
                                                components={{
                                                    p: ({ children }) => <p className="mb-1 last:mb-0">{children}</p>,
                                                    strong: ({ children }) => <span className="font-bold">{children}</span>,
                                                    em: ({ children }) => <span className="italic">{children}</span>,
                                                    code: ({ children }) => <code className="bg-red-100/50 px-1 rounded text-xs font-mono">{children}</code>
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
                                                        onClick={onNavigateToLogs}
                                                        className="block mt-1 text-blue-600 hover:underline not-italic font-semibold"
                                                    >
                                                        {t('ai_chat.view_ai_logs')}
                                                    </button>
                                                )}
                                            </div>
                                        )}
                                        {msg.userQuery && (
                                            <button
                                                onClick={() => handleSend(msg.userQuery!, true)}
                                                className="mt-2 text-xs font-semibold hover:opacity-75 flex items-center gap-1 text-red-600"
                                            >
                                                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>
                                                {t('common.retry')}
                                            </button>
                                        )}
                                    </div>
                                ) : (
                                    <div className={`text-sm leading-relaxed ${msg.role === 'user' ? 'text-white' : 'text-gray-700'}`}>
                                        <ReactMarkdown
                                            components={{
                                                p: ({ children }) => <p className="mb-1 last:mb-0">{children}</p>,
                                                strong: ({ children }) => <span className="font-bold">{children}</span>,
                                                em: ({ children }) => <span className="italic">{children}</span>,
                                                ul: ({ children }) => <ul className={`list-disc pl-4 mb-2 ${msg.role === 'user' ? 'border-white/20' : 'border-gray-200'}`}>{children}</ul>,
                                                ol: ({ children }) => <ol className={`list-decimal pl-4 mb-2 ${msg.role === 'user' ? 'border-white/20' : 'border-gray-200'}`}>{children}</ol>,
                                                li: ({ children }) => <li className="mb-0.5">{children}</li>,
                                                code: ({ children }) => (
                                                    <code className={`px-1 rounded text-xs font-mono ${msg.role === 'user'
                                                        ? 'bg-blue-700 text-blue-50'
                                                        : 'bg-gray-100 text-gray-800'
                                                        }`}>
                                                        {children}
                                                    </code>
                                                )
                                            }}
                                        >
                                            {msg.content}
                                        </ReactMarkdown>
                                    </div>
                                )}
                            </div>
                        </div>
                    ))}
                    {chatMutation.isPending && (
                        <div className="flex justify-start">
                            <div className="max-w-[85%] bg-white border border-gray-100 rounded-2xl p-4 rounded-tl-sm shadow-sm">
                                <div className="flex items-center gap-1.5">
                                    <div className="w-2 h-2 bg-blue-400 rounded-full animate-bounce"></div>
                                    <div className="w-2 h-2 bg-blue-500 rounded-full animate-bounce" style={{ animationDelay: '0.2s' }}></div>
                                    <div className="w-2 h-2 bg-indigo-500 rounded-full animate-bounce" style={{ animationDelay: '0.4s' }}></div>
                                </div>
                            </div>
                        </div>
                    )}
                    <div ref={messagesEndRef} />
                </div>

                {/* Input Area */}
                <div className="p-4 bg-white border-t border-gray-100">
                    <form onSubmit={handleSubmit} className="relative">
                        <textarea
                            value={input}
                            onChange={(e) => setInput(e.target.value)}
                            onKeyDown={(e) => {
                                if (e.key === 'Enter' && !e.shiftKey) {
                                    e.preventDefault();
                                    handleSubmit(e);
                                }
                            }}
                            placeholder={t('dashboard.ask_ai_placeholder')}
                            className="w-full bg-gray-50 border border-gray-200 text-gray-800 text-sm rounded-xl pl-4 pr-12 py-3 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 resize-none"
                            rows={2}
                        />
                        <button
                            type="submit"
                            disabled={!input.trim() || chatMutation.isPending}
                            className="absolute right-2 bottom-2 p-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:hover:bg-blue-600 transition-colors shadow-sm"
                        >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
                            </svg>
                        </button>
                    </form>
                    <div className="mt-2 text-center">
                        <span className="text-[10px] text-gray-400">
                            {t('dashboard.ai_disclaimer')}
                        </span>
                    </div>
                </div>
            </div>

            <AISettings isOpen={showSettings} onClose={() => setShowSettings(false)} />
        </>
    );
}
