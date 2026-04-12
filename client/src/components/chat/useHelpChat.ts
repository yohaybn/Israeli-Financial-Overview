import { useState, useRef, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { api } from '../../lib/api';

interface HelpMessage {
    role: 'user' | 'assistant';
    content: string;
}

export function useHelpChat() {
    const { t } = useTranslation();
    const [messages, setMessages] = useState<HelpMessage[]>([]);
    const [input, setInput] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const messagesEndRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [messages, isLoading]);

    const handleSend = useCallback(
        async (e?: React.FormEvent) => {
            e?.preventDefault();
            const trimmed = input.trim();
            if (!trimmed || isLoading) return;
            setInput('');
            setIsLoading(true);
            setMessages((prev) => {
                const newMessages = [...prev, { role: 'user' as const, content: trimmed }];
                void (async () => {
                    try {
                        const res = await api.post<{ success: boolean; text: string }>('/help/chat', { messages: newMessages });
                        if (res.data.success) {
                            setMessages([...newMessages, { role: 'assistant', content: res.data.text }]);
                        } else {
                            setMessages([...newMessages, { role: 'assistant', content: t('common.error_occurred') }]);
                        }
                    } catch (error) {
                        console.error('Help Chat error:', error);
                        setMessages([...newMessages, { role: 'assistant', content: t('common.error_occurred') }]);
                    } finally {
                        setIsLoading(false);
                    }
                })();
                return newMessages;
            });
        },
        [input, isLoading, t]
    );

    return { messages, input, setInput, isLoading, handleSend, messagesEndRef };
}
