import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { X, MessageSquare, Settings } from 'lucide-react';
import { useAISettings } from '../../hooks/useScraper';
import { AISettings } from '../AISettings';
import { useHelpChat } from './useHelpChat';
import { useAnalystChat } from './useAnalystChat';
import {
    HelpChatBody,
    AnalystChatBody,
    HelpChatFooterInput,
    AnalystChatFooterInput,
} from './ChatTabBodies';

export type AiPanelTab = 'help' | 'analyst';

export type UnifiedAiChatPanelProps = {
    isOpen: boolean;
    onClose: () => void;
    activeTab: AiPanelTab;
    onTabChange: (tab: AiPanelTab) => void;
    scope: 'all' | string;
    contextMonth: string;
    onNavigateToLogs?: () => void;
};

export function UnifiedAiChatPanel({
    isOpen,
    onClose,
    activeTab,
    onTabChange,
    scope,
    contextMonth,
    onNavigateToLogs,
}: UnifiedAiChatPanelProps) {
    const { t } = useTranslation();
    const { data: aiSettings } = useAISettings();
    const [showSettings, setShowSettings] = useState(false);

    const help = useHelpChat();
    const analyst = useAnalystChat({ scope, contextMonth });

    const subtitle =
        activeTab === 'analyst'
            ? `${t('unified_ai.powered_by', 'Powered by')} ${aiSettings?.chatModel || 'Gemini'}`
            : t('unified_ai.subtitle_help', 'How to use the app');

    if (!isOpen) return null;

    return (
        <>
            <div className="fixed bottom-6 right-6 z-[110] flex flex-col items-end pointer-events-none max-w-[calc(100vw-1.5rem)]">
                <div className="pointer-events-auto w-96 max-w-[calc(100vw-3rem)] h-[min(560px,80vh)] max-h-[80vh] bg-white rounded-2xl shadow-2xl flex flex-col border border-gray-100 overflow-hidden animate-in zoom-in-95 duration-200">
                    {/* Shared header */}
                    <div className="shrink-0 p-4 bg-gradient-to-r from-indigo-600 to-blue-600 text-white flex justify-between items-start gap-2">
                        <div className="flex items-start gap-2 min-w-0">
                            <MessageSquare className="w-5 h-5 shrink-0 mt-0.5" />
                            <div className="min-w-0">
                                <h2 className="font-bold text-sm leading-tight">{t('unified_ai.title', 'AI Chat')}</h2>
                                <p className="text-xs text-white/85 mt-0.5 truncate">{subtitle}</p>
                            </div>
                        </div>
                        <div className="flex items-center gap-0.5 shrink-0">
                            {activeTab === 'analyst' && (
                                <button
                                    type="button"
                                    onClick={() => setShowSettings(true)}
                                    className="p-1.5 hover:bg-white/20 rounded-full transition-colors"
                                    title={t('ai_settings.title')}
                                    aria-label={t('ai_settings.title')}
                                >
                                    <Settings className="w-5 h-5" />
                                </button>
                            )}
                            <button
                                type="button"
                                onClick={onClose}
                                className="p-1.5 hover:bg-white/20 rounded-full transition-colors"
                                aria-label={t('common.close')}
                                title={t('common.close')}
                            >
                                <X className="w-5 h-5" />
                            </button>
                        </div>
                    </div>

                    {/* Messages */}
                    <div className="flex-1 overflow-y-auto p-4 bg-gray-50/80 min-h-0 flex flex-col">
                        <div className={`flex flex-col flex-1 min-h-0 ${activeTab === 'help' ? '' : 'hidden'}`} aria-hidden={activeTab !== 'help'}>
                            <HelpChatBody
                                messages={help.messages}
                                isLoading={help.isLoading}
                                messagesEndRef={help.messagesEndRef}
                            />
                        </div>
                        <div className={`flex flex-col flex-1 min-h-0 ${activeTab === 'analyst' ? '' : 'hidden'}`} aria-hidden={activeTab !== 'analyst'}>
                            <AnalystChatBody
                                messages={analyst.messages}
                                isPending={analyst.chatMutation.isPending}
                                messagesEndRef={analyst.messagesEndRef}
                                onRetry={(q) => analyst.handleSend(q, true)}
                                onNavigateToLogs={onNavigateToLogs}
                            />
                        </div>
                    </div>

                    {activeTab === 'help' && help.messages.length > 0 && (
                        <div className="shrink-0 px-3 py-2 border-t border-gray-100 bg-gray-50/90 text-center">
                            <button
                                type="button"
                                onClick={() => window.dispatchEvent(new CustomEvent('open-feedback-modal'))}
                                className="text-xs text-blue-600 hover:text-blue-800 underline"
                            >
                                {t('feedback.chat_link')}
                            </button>
                        </div>
                    )}

                    {/* Shared footer: tab selector + input */}
                    <div className="shrink-0 border-t border-gray-100 bg-white">
                        <div className="p-2 border-b border-gray-50">
                            <div className="flex rounded-xl bg-gray-100 p-1 gap-1" role="tablist" aria-label={t('unified_ai.tablist_aria', 'Chat mode')}>
                                <button
                                    type="button"
                                    role="tab"
                                    aria-selected={activeTab === 'help'}
                                    onClick={() => onTabChange('help')}
                                    className={`flex-1 min-w-0 rounded-lg px-3 py-2 text-xs font-semibold transition-colors ${
                                        activeTab === 'help'
                                            ? 'bg-white text-blue-700 shadow-sm'
                                            : 'text-gray-600 hover:text-gray-800'
                                    }`}
                                >
                                    {t('unified_ai.tab_help', 'Help')}
                                </button>
                                <button
                                    type="button"
                                    role="tab"
                                    aria-selected={activeTab === 'analyst'}
                                    onClick={() => onTabChange('analyst')}
                                    className={`flex-1 min-w-0 rounded-lg px-3 py-2 text-xs font-semibold transition-colors ${
                                        activeTab === 'analyst'
                                            ? 'bg-white text-indigo-700 shadow-sm'
                                            : 'text-gray-600 hover:text-gray-800'
                                    }`}
                                >
                                    {t('unified_ai.tab_analyst', 'Analyst')}
                                </button>
                            </div>
                        </div>
                        <div className="p-3 pt-2">
                            {activeTab === 'help' ? (
                                <HelpChatFooterInput
                                    input={help.input}
                                    setInput={help.setInput}
                                    isLoading={help.isLoading}
                                    onSubmit={help.handleSend}
                                />
                            ) : (
                                <>
                                    <AnalystChatFooterInput
                                        input={analyst.input}
                                        setInput={analyst.setInput}
                                        isPending={analyst.chatMutation.isPending}
                                        onSubmit={(e) => {
                                            e.preventDefault();
                                            analyst.handleSend(analyst.input);
                                        }}
                                    />
                                    <div className="mt-2 text-center">
                                        <span className="text-[10px] text-gray-400">{t('dashboard.ai_disclaimer')}</span>
                                    </div>
                                </>
                            )}
                        </div>
                    </div>
                </div>
            </div>

            <AISettings isOpen={showSettings} onClose={() => setShowSettings(false)} />
        </>
    );
}
