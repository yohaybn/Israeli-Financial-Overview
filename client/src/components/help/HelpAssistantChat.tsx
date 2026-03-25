import { useState, useRef, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { MessageSquare, X, Send, User, Bot, HelpCircle, Loader2 } from 'lucide-react';
import { api } from '../../lib/api';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

interface Message {
    role: 'user' | 'assistant';
    content: string;
}

export function HelpAssistantChat() {
    const { t } = useTranslation();
    const [isOpen, setIsOpen] = useState(false);
    const [isHidden, setIsHidden] = useState(() => {
        return localStorage.getItem('hideHelpWidget') === 'true';
    });
    const [messages, setMessages] = useState<Message[]>([]);
    const [input, setInput] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const messagesEndRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const handleToggleHelp = (e: any) => {
            setIsHidden(false);
            localStorage.removeItem('hideHelpWidget');
            if (e.detail?.open) {
                setIsOpen(true);
            }
        };
        window.addEventListener('toggle-help-widget', handleToggleHelp);
        return () => window.removeEventListener('toggle-help-widget', handleToggleHelp);
    }, []);

    useEffect(() => {
        if (messagesEndRef.current) {
            messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
        }
    }, [messages]);

    const handleHide = (e: React.MouseEvent) => {
        e.stopPropagation();
        setIsHidden(true);
        setIsOpen(false);
        localStorage.setItem('hideHelpWidget', 'true');
    };

    const handleSend = async (e?: React.FormEvent) => {
        e?.preventDefault();
        const trimmed = input.trim();
        if (!trimmed || isLoading) return;

        const newMessages: Message[] = [...messages, { role: 'user', content: trimmed }];
        setMessages(newMessages);
        setInput('');
        setIsLoading(true);

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
    };

    if (isHidden) return null;

    return (
        <div className="fixed bottom-6 right-6 z-50 flex flex-col items-end">
            {isOpen && (
                <div className="mb-4 w-96 max-w-[calc(100vw-3rem)] h-[500px] max-h-[80vh] bg-white rounded-2xl shadow-2xl flex flex-col border border-gray-100 overflow-hidden animate-in zoom-in-95 duration-200">
                    <div className="p-4 bg-gradient-to-r from-blue-600 to-indigo-600 text-white flex justify-between items-center shrink-0">
                        <div className="flex items-center gap-2 font-bold">
                            <HelpCircle className="w-5 h-5" />
                            {t('help.title', 'App Assistant')}
                        </div>
                        <button onClick={() => setIsOpen(false)} className="p-1 hover:bg-white/20 rounded-full transition-colors">
                            <X className="w-5 h-5" />
                        </button>
                    </div>

                    <div className="flex-1 p-4 overflow-y-auto bg-gray-50 flex flex-col gap-4">
                        {messages.length === 0 && (
                            <div className="text-center text-gray-400 mt-10">
                                <HelpCircle className="w-12 h-12 mx-auto mb-3 opacity-20" />
                                <p className="text-sm">{t('help.empty_state', 'Ask me anything about how to use the app!')}</p>
                            </div>
                        )}
                        {messages.map((m, i) => (
                            <div key={i} className={`flex gap-3 ${m.role === 'user' ? 'flex-row-reverse' : 'flex-row'}`}>
                                <div className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 shadow-sm ${m.role === 'user' ? 'bg-indigo-100 text-indigo-700' : 'bg-blue-600 text-white'}`}>
                                    {m.role === 'user' ? <User className="w-5 h-5" /> : <Bot className="w-5 h-5" />}
                                </div>
                                <div className={`px-4 py-3 rounded-2xl max-w-[80%] text-sm ${m.role === 'user' ? 'bg-indigo-600 text-white rounded-tr-none' : 'bg-white border border-gray-100 shadow-sm text-gray-800 rounded-tl-none prose prose-sm prose-p:my-1 prose-a:text-blue-600 prose-ul:my-1 prose-li:my-0'}`}>
                                    {m.role === 'user' ? m.content : (
                                        <ReactMarkdown 
                                            remarkPlugins={[remarkGfm]}
                                            components={{
                                                a: ({node, ...props}) => {
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
                                                    return <a {...props} className="text-blue-600 hover:text-blue-800 underline transition-colors" target="_blank" rel="noopener noreferrer" />;
                                                }
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
                    </div>

                    <form onSubmit={handleSend} className="p-3 bg-white border-t border-gray-100 flex gap-2 shrink-0">
                        <input
                            type="text"
                            value={input}
                            onChange={(e) => setInput(e.target.value)}
                            placeholder={t('help.input_placeholder', 'Ask a question...')}
                            className="flex-1 px-4 py-2 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all"
                            disabled={isLoading}
                        />
                        <button
                            type="submit"
                            disabled={!input.trim() || isLoading}
                            className="p-2.5 bg-blue-600 text-white rounded-xl hover:bg-blue-700 disabled:opacity-50 transition-colors shadow-sm"
                        >
                            <Send className="w-4 h-4" />
                        </button>
                    </form>
                </div>
            )}

            {!isOpen && (
                <div className="relative group">
                    <button
                        onClick={() => setIsOpen(true)}
                        className="w-14 h-14 bg-gradient-to-br from-blue-600 to-indigo-600 text-white rounded-full shadow-lg hover:shadow-xl hover:scale-105 active:scale-95 transition-all flex items-center justify-center"
                        aria-label={t('help.open_button', 'Open Help Assistant')}
                    >
                        <MessageSquare className="w-6 h-6" />
                    </button>
                    <button
                        onClick={handleHide}
                        className="absolute -top-2 -right-2 w-6 h-6 bg-white border border-gray-200 text-gray-500 rounded-full shadow-sm flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity hover:bg-red-50 hover:text-red-500"
                        title={t('common.hide_section', 'Hide')}
                    >
                        <X className="w-4 h-4" />
                    </button>
                </div>
            )}
        </div>
    );
}
