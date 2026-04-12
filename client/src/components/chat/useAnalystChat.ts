import { useState, useRef, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { useQueryClient } from '@tanstack/react-query';
import { useUnifiedAIChat, type UnifiedAIChatTurn } from '../../hooks/useScraper';
import { AI_TOP_INSIGHTS_QUERY_KEY } from '../dashboard/TopInsightsCard';
import { mapAIError, type AIErrorDetails } from '../../utils/aiErrorMapper';

export interface AnalystMessage {
    id: string;
    role: 'user' | 'assistant';
    content: string;
    isError?: boolean;
    errorDetails?: AIErrorDetails;
    userQuery?: string;
    usedFallbackModel?: string;
}

export function useAnalystChat({
    scope,
    contextMonth,
}: {
    scope: 'all' | string;
    contextMonth: string;
}) {
    const { t } = useTranslation();
    const queryClient = useQueryClient();
    const chatMutation = useUnifiedAIChat();
    const [messages, setMessages] = useState<AnalystMessage[]>([]);
    const [input, setInput] = useState('');
    const messagesEndRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (messages.length === 0) {
            setMessages([
                {
                    id: 'greeting',
                    role: 'assistant',
                    content: t('ai_chat.greeting'),
                },
            ]);
        }
    }, [messages.length, t]);

    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [messages, chatMutation.isPending]);

    const handleSend = useCallback(
        async (msgToSend: string, isRetry: boolean = false) => {
            if (!msgToSend.trim() || chatMutation.isPending) return;

            const priorTurns = messages.filter(
                (m) => m.id !== 'greeting' && !m.isError && (m.role === 'user' || m.role === 'assistant')
            );
            const turnsForApi: UnifiedAIChatTurn[] = (isRetry ? priorTurns : [...priorTurns, { id: 'pending', role: 'user', content: msgToSend }])
                .slice(-12)
                .map((m) => ({
                    role: m.role === 'user' ? ('user' as const) : ('model' as const),
                    text: m.content,
                }));

            if (!isRetry) {
                setInput('');
                setMessages((prev) => [
                    ...prev,
                    {
                        id: Date.now().toString(),
                        role: 'user',
                        content: msgToSend,
                    },
                ]);
            } else {
                setMessages((prev) => prev.filter((m) => !m.isError));
            }

            const historyNote = `The user is currently viewing the dashboard for the month of ${contextMonth}. When answering, make sure to distinguish between their historical data (all transactions) and the data for this specific month if it is relevant to their question.`;

            try {
                const result = await chatMutation.mutateAsync({
                    query: msgToSend,
                    scope: scope === 'all' ? 'all' : undefined,
                    filename: scope !== 'all' ? scope : undefined,
                    historyNote,
                    conversationHistory: turnsForApi.length > 0 ? turnsForApi : undefined,
                });

                const memoryNote =
                    result.factsAdded > 0 || result.insightsAdded > 0 || result.alertsAdded > 0
                        ? `\n\n_${t('ai_chat.memory_saved', {
                              facts: result.factsAdded,
                              insights: result.insightsAdded,
                              alerts: result.alertsAdded,
                          })}_`
                        : '';

                if (result.factsAdded > 0 || result.insightsAdded > 0 || result.alertsAdded > 0) {
                    queryClient.invalidateQueries({ queryKey: AI_TOP_INSIGHTS_QUERY_KEY });
                    queryClient.invalidateQueries({ queryKey: ['ai-memory-insights'] });
                    queryClient.invalidateQueries({ queryKey: ['ai-memory-alerts'] });
                }

                setMessages((prev) => [
                    ...prev,
                    {
                        id: (Date.now() + 1).toString(),
                        role: 'assistant',
                        content: result.response + memoryNote,
                        ...(result.usedFallbackModel ? { usedFallbackModel: result.usedFallbackModel } : {}),
                    },
                ]);
            } catch (error: unknown) {
                console.error('AI Chat Error:', error);
                const err = error as { response?: { data?: unknown } };
                const mapped = mapAIError(err.response?.data || error);
                const errorDetails: AIErrorDetails = mapped.i18nKey
                    ? {
                          ...mapped,
                          title: t(`ai_errors.${mapped.i18nKey}.title`),
                          description: t(`ai_errors.${mapped.i18nKey}.description`),
                          solution: t(`ai_errors.${mapped.i18nKey}.solution`),
                      }
                    : mapped;
                setMessages((prev) => [
                    ...prev,
                    {
                        id: (Date.now() + 1).toString(),
                        role: 'assistant',
                        content: errorDetails.description,
                        isError: true,
                        errorDetails,
                        userQuery: msgToSend,
                    },
                ]);
            }
        },
        [chatMutation, contextMonth, messages, scope, t, queryClient]
    );

    return { messages, input, setInput, handleSend, messagesEndRef, chatMutation };
}
