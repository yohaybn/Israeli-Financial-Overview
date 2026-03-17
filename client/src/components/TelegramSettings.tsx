import { useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Settings, Play, Square, AlertCircle, CheckCircle, Copy } from 'lucide-react';

interface TelegramSettingsProps {
    isOpen?: boolean;
    onClose?: () => void;
    isInline?: boolean;
}

const API_BASE = '/api';

export function TelegramSettings({ isOpen, onClose, isInline }: TelegramSettingsProps) {
    const { t } = useTranslation();
    const queryClient = useQueryClient();

    const [botToken, setBotToken] = useState('');
    const [chatId, setChatId] = useState('');
    const [showAdvanced, setShowAdvanced] = useState(false);
    const [notification, setNotification] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
    const [newAllowedUser, setNewAllowedUser] = useState('');
    const [allowedUsers, setAllowedUsers] = useState<string[]>([]);
    const [botLanguage, setBotLanguage] = useState<'en' | 'he'>('en');

    const showNotification = useCallback((type: 'success' | 'error', message: string) => {
        setNotification({ type, message });
        setTimeout(() => setNotification(null), 5000);
    }, []);

    // Fetch Telegram config
    const { data: config } = useQuery({
        queryKey: ['telegramConfig'],
        queryFn: async () => {
            const res = await fetch(`${API_BASE}/telegram/config`);
            const data = await res.json();
            return data.data;
        },
        enabled: isOpen,
    });

    // Load config data when available
    useEffect(() => {
        if (config) {
            if (config.botToken && !config.botToken.startsWith('***')) {
                setBotToken(config.botToken);
            }
            if (config.allowedUsers) {
                setAllowedUsers(config.allowedUsers);
            }
            if (config.language) {
                setBotLanguage(config.language);
            }
        }
    }, [config]);

    // Fetch Telegram status
    const { data: status, isLoading: isLoadingStatus } = useQuery({
        queryKey: ['telegramStatus'],
        queryFn: async () => {
            const res = await fetch(`${API_BASE}/telegram/status`);
            const data = await res.json();
            return data.data;
        },
        enabled: isOpen,
        refetchInterval: 5000,
    });

    // Fetch notification chats
    const { data: notificationChats } = useQuery({
        queryKey: ['telegramNotificationChats'],
        queryFn: async () => {
            const res = await fetch(`${API_BASE}/telegram/notification-chats`);
            const data = await res.json();
            return data.data || [];
        },
        enabled: isOpen,
    });

    // Start bot mutation
    const { mutate: startBot, isPending: isStarting } = useMutation({
        mutationFn: async () => {
            const res = await fetch(`${API_BASE}/telegram/start`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ botToken: botToken || undefined }),
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || t('telegram.errors.start_failed'));
            return data;
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['telegramStatus'] });
            queryClient.invalidateQueries({ queryKey: ['telegramConfig'] });
            showNotification('success', t('telegram.bot_started'));
        },
        onError: (err: any) => {
            showNotification('error', err.message || t('telegram.errors.start_failed'));
        },
    });

    // Stop bot mutation
    const { mutate: stopBot, isPending: isStopping } = useMutation({
        mutationFn: async () => {
            const res = await fetch(`${API_BASE}/telegram/stop`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || t('telegram.errors.stop_failed'));
            return data;
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['telegramStatus'] });
            showNotification('success', t('telegram.bot_stopped'));
        },
        onError: (err: any) => {
            showNotification('error', err.message || t('telegram.errors.stop_failed'));
        },
    });

    // Update config mutation
    const { mutate: updateConfig, isPending: isUpdating } = useMutation({
        mutationFn: async (newConfig: any) => {
            const res = await fetch(`${API_BASE}/telegram/config`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(newConfig),
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || t('telegram.errors.update_config_failed'));
            return data;
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['telegramConfig'] });
            showNotification('success', t('telegram.config_saved'));
        },
        onError: (err: any) => {
            showNotification('error', err.message || t('telegram.errors.save_config_failed'));
        },
    });

    // Test connection mutation
    const { mutate: testConnection, isPending: isTesting } = useMutation({
        mutationFn: async () => {
            if (!botToken || !chatId) {
                throw new Error('Bot token and chat ID are required');
            }
            const res = await fetch(`${API_BASE}/telegram/test`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ botToken, chatId }),
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || 'Test failed');
            return data;
        },
        onSuccess: () => {
            showNotification('success', t('telegram.test_success'));
        },
        onError: (err: any) => {
            showNotification('error', err.message || 'Test failed');
        },
    });

    // Add notification chat mutation
    const { mutate: addNotificationChat } = useMutation({
        mutationFn: async () => {
            if (!chatId) throw new Error('Chat ID is required');
            const res = await fetch(`${API_BASE}/telegram/notification-chat/add`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ chatId }),
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || t('telegram.errors.add_chat_failed'));
            return data;
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['telegramNotificationChats'] });
            setChatId('');
            showNotification('success', t('telegram.chat_added'));
        },
        onError: (err: any) => {
            showNotification('error', err.message || t('telegram.errors.add_chat_failed'));
        },
    });

    // Remove notification chat mutation
    const { mutate: removeNotificationChat } = useMutation({
        mutationFn: async (id: string) => {
            const res = await fetch(`${API_BASE}/telegram/notification-chat/remove`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ chatId: id }),
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || t('telegram.errors.remove_chat_failed'));
            return data;
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['telegramNotificationChats'] });
            showNotification('success', t('telegram.chat_removed'));
        },
        onError: (err: any) => {
            showNotification('error', err.message || t('telegram.errors.remove_chat_failed'));
        },
    });

    // Add allowed user mutation
    const { mutate: addAllowedUser, isPending: isAddingUser } = useMutation({
        mutationFn: async () => {
            if (!newAllowedUser.trim()) throw new Error('User ID is required');
            const updatedUsers = [...allowedUsers, newAllowedUser.trim()];
            const res = await fetch(`${API_BASE}/telegram/config`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ allowedUsers: updatedUsers }),
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || t('telegram.errors.add_user_failed'));
            return data;
        },
        onSuccess: () => {
            setAllowedUsers([...allowedUsers, newAllowedUser.trim()]);
            setNewAllowedUser('');
            queryClient.invalidateQueries({ queryKey: ['telegramConfig', 'telegramStatus'] });
            showNotification('success', t('telegram.user_added'));
        },
        onError: (err: any) => {
            showNotification('error', err.message || t('telegram.errors.add_user_failed'));
        },
    });

    // Remove allowed user mutation
    const { mutate: removeAllowedUser } = useMutation({
        mutationFn: async (userId: string) => {
            const updatedUsers = allowedUsers.filter(id => id !== userId);
            const res = await fetch(`${API_BASE}/telegram/config`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ allowedUsers: updatedUsers }),
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || t('telegram.errors.remove_user_failed'));
            return data;
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['telegramConfig', 'telegramStatus'] });
            showNotification('success', t('telegram.user_removed'));
        },
        onError: (err: any) => {
            showNotification('error', err.message || t('telegram.errors.remove_user_failed'));
        },
    });

    const handleSaveToken = () => {
        if (!botToken.trim()) {
            showNotification('error', 'Bot token is required');
            return;
        }
        updateConfig({ botToken, language: botLanguage });
    };

    const handleStartBot = () => {
        // Allow starting when the server already has a configured token
        if (!botToken.trim() && !status?.hasToken) {
            showNotification('error', 'Bot token is required');
            return;
        }
        startBot();
    };

    if (!isInline && !isOpen) return null;

    return (
        <div className="space-y-6">
            <div className={`${isInline ? 'space-y-6' : 'bg-white rounded-3xl shadow-2xl w-full max-w-4xl p-6 overflow-y-auto max-h-[90vh] animate-in zoom-in-95 duration-200'}`}>
                <div className="flex items-center justify-between mb-6">
                    <div className="flex items-center gap-2">
                        <Settings className="w-6 h-6 text-blue-600" />
                        <h2 className="text-2xl font-bold">
                            {t('telegram.settings_title')}
                        </h2>
                    </div>
                    {!isInline && onClose && (
                        <button
                            onClick={onClose}
                            className="text-gray-500 hover:text-gray-700"
                        >
                            ✕
                        </button>
                    )}
                </div>

                {/* Notification */}
                {notification && (
                    <div
                        className={`mb-4 p-4 rounded-xl border flex items-center gap-2 ${notification.type === 'success'
                                ? 'bg-green-100 text-green-800'
                                : 'bg-red-100 text-red-800'
                            }`}
                    >
                        {notification.type === 'success' ? (
                            <CheckCircle className="w-5 h-5" />
                        ) : (
                            <AlertCircle className="w-5 h-5" />
                        )}
                        {notification.message}
                    </div>
                )}

                {/* Status */}
                {isLoadingStatus ? (
                    <div className="text-gray-500 mb-4">{t('telegram.loading_status')}</div>
                ) : (
                    <>
                        <div className={`mb-6 p-4 rounded-2xl border ${status?.isActive ? 'bg-green-100 border-green-300' : 'bg-gray-100 border-gray-300'}`}>
                            <div className="flex items-center justify-between">
                                <div>
                                    <p className="font-semibold">
                                        {t('telegram.bot_status')}
                                    </p>
                                    <p className={`text-sm ${status?.isActive ? 'text-green-700' : 'text-gray-700'}`}>
                                        {status?.isActive
                                            ? t('telegram.status_active')
                                            : t('telegram.status_inactive')}
                                    </p>
                                </div>
                                <div className="flex gap-2">
                                    {!status?.isActive ? (
                                        <button
                                            onClick={() => handleStartBot()}
                                            disabled={isStarting || (!botToken && !status?.hasToken)}
                                            className="flex items-center gap-2 bg-green-600 text-white px-4 py-2.5 rounded-2xl hover:bg-green-700 disabled:bg-gray-400"
                                        >
                                            <Play className="w-4 h-4" />
                                            {isStarting ? t('telegram.starting') : t('telegram.start')}
                                        </button>
                                    ) : (
                                        <button
                                            onClick={() => stopBot()}
                                            disabled={isStopping}
                                            className="flex items-center gap-2 bg-red-600 text-white px-4 py-2.5 rounded-2xl hover:bg-red-700 disabled:bg-gray-400"
                                        >
                                            <Square className="w-4 h-4" />
                                            {isStopping ? t('telegram.stopping') : t('telegram.stop')}
                                        </button>
                                    )}
                                </div>
                            </div>
                        </div>

                        {/* Warning if no users configured */}
                        {!status?.usersConfigured && (
                            <div className="mb-6 p-4 rounded-2xl bg-amber-100 border border-amber-300 flex items-start gap-3">
                                <AlertCircle className="w-5 h-5 text-amber-700 flex-shrink-0 mt-0.5" />
                                <div>
                                    <p className="font-semibold text-amber-900">
                                        {t('telegram.warning_no_users')}
                                    </p>
                                    <p className="text-sm text-amber-800 mt-1">
                                        {t('telegram.warning_no_users_desc')}
                                    </p>
                                </div>
                            </div>
                        )}
                    </>
                )}


                {/* Bot Language */}
                <div className="space-y-4 mb-6">
                    <div>
                        <label className="block text-sm font-semibold mb-2">
                            {t('telegram.bot_language')}
                        </label>
                        <div className="flex gap-3 items-center">
                            <button
                                type="button"
                                onClick={() => { setBotLanguage('en'); updateConfig({ language: 'en' }); }}
                                className={`px-5 py-2.5 rounded-xl text-sm font-bold border transition-all ${botLanguage === 'en' ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'}`}
                            >
                                🇬🇧 English
                            </button>
                            <button
                                type="button"
                                onClick={() => { setBotLanguage('he'); updateConfig({ language: 'he' }); }}
                                className={`px-5 py-2.5 rounded-xl text-sm font-bold border transition-all ${botLanguage === 'he' ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'}`}
                            >
                                🇮🇱 עברית
                            </button>
                        </div>
                        <p className="text-xs text-gray-500 mt-1">
                            {t('telegram.bot_language_help')}
                        </p>
                    </div>
                </div>

                {/* Bot Token Configuration */}
                <div className="space-y-4 mb-6">
                    <div>
                        <label className="block text-sm font-semibold mb-2">
                            {t('telegram.bot_token')}
                            <span className="text-red-600"> *</span>
                        </label>
                        <div className="flex gap-2">
                            <input
                                type="password"
                                value={botToken}
                                onChange={(e) => setBotToken(e.target.value)}
                                placeholder={t('telegram.token_placeholder')}
                                className="flex-1 px-4 py-2.5 bg-white border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 shadow-sm"
                            />
                            <button
                                onClick={handleSaveToken}
                                disabled={isUpdating || !botToken}
                                className="bg-blue-600 text-white px-4 py-2.5 rounded-xl hover:bg-blue-700 disabled:bg-gray-400 font-bold"
                            >
                                {isUpdating ? t('telegram.saving') : t('telegram.save')}
                            </button>
                        </div>
                        <p className="text-xs text-gray-600 mt-1">
                            {t('telegram.token_help')}
                        </p>
                    </div>


                    {/* Test Connection */}
                    {botToken && (
                        <div>
                            <label className="block text-sm font-semibold mb-2">
                                {t('telegram.test_connection')}
                            </label>
                            <div className="flex gap-2">
                                <input
                                    type="text"
                                    value={chatId}
                                    onChange={(e) => setChatId(e.target.value)}
                                    placeholder={t('telegram.chat_id_placeholder')}
                                    className="flex-1 px-4 py-2.5 bg-white border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 shadow-sm"
                                />
                                <button
                                    onClick={() => testConnection()}
                                    disabled={isTesting || !botToken || !chatId}
                                    className="bg-green-600 text-white px-4 py-2.5 rounded-xl hover:bg-green-700 disabled:bg-gray-400 font-bold"
                                >
                                    {isTesting ? t('telegram.testing') : t('telegram.test')}
                                </button>
                            </div>
                            <p className="text-xs text-gray-600 mt-1">
                                {t('telegram.chat_id_help')}
                            </p>
                        </div>
                    )}
                </div>

                {/* Notification Chats */}
                <div className="space-y-4 mb-6">
                    <div>
                        <h3 className="text-lg font-semibold mb-3">
                            {t('telegram.notification_chats')}
                        </h3>
                        <p className="text-sm text-gray-600 mb-3">
                            {t('telegram.notification_chats_help')}
                        </p>

                        {/* Add chat */}
                        <div className="flex gap-2 mb-4">
                            <input
                                type="text"
                                value={chatId}
                                onChange={(e) => setChatId(e.target.value)}
                                placeholder={t('telegram.chat_id_placeholder')}
                                className="flex-1 px-4 py-2.5 bg-white border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 shadow-sm"
                            />
                            <button
                                onClick={() => addNotificationChat()}
                                disabled={!chatId.trim()}
                                className="bg-blue-600 text-white px-4 py-2.5 rounded-xl hover:bg-blue-700 disabled:bg-gray-400 font-bold"
                            >
                                {t('telegram.add')}
                            </button>
                        </div>

                        {/* List of chats */}
                        {notificationChats && notificationChats.length > 0 ? (
                            <div className="space-y-2">
                                {notificationChats.map((id: string) => (
                                    <div
                                        key={id}
                                        className="flex items-center justify-between bg-gray-50 border border-gray-200 p-3 rounded-xl"
                                    >
                                        <div className="flex items-center gap-2">
                                            <code className="bg-white px-2 py-1 rounded text-sm">{id}</code>
                                            <button
                                                onClick={() => {
                                                    navigator.clipboard.writeText(id);
                                                    showNotification('success', t('telegram.copied'));
                                                }}
                                                className="text-blue-600 hover:text-blue-700"
                                            >
                                                <Copy className="w-4 h-4" />
                                            </button>
                                        </div>
                                        <button
                                            onClick={() => removeNotificationChat(id)}
                                            className="bg-red-600 text-white px-3 py-1.5 rounded-xl hover:bg-red-700 text-sm font-bold"
                                        >
                                            {t('telegram.remove')}
                                        </button>
                                    </div>
                                ))}
                            </div>
                        ) : (
                            <p className="text-gray-500 text-center py-4">
                                {t('telegram.no_chats')}
                            </p>
                        )}
                    </div>
                </div>

                {/* Allowed Users */}
                <div className="space-y-4 mb-6">
                    <div>
                        <h3 className="text-lg font-semibold mb-3">
                            {t('telegram.allowed_users')}
                        </h3>
                        <p className="text-sm text-gray-600 mb-3">
                            {t('telegram.allowed_users_help')}
                        </p>

                        {/* Add user */}
                        <div className="flex gap-2 mb-4">
                            <input
                                type="text"
                                value={newAllowedUser}
                                onChange={(e) => setNewAllowedUser(e.target.value)}
                                placeholder={t('telegram.user_id_placeholder')}
                                className="flex-1 px-4 py-2.5 bg-white border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 shadow-sm"
                            />
                            <button
                                onClick={() => addAllowedUser()}
                                disabled={!newAllowedUser.trim() || isAddingUser}
                                className="bg-blue-600 text-white px-4 py-2.5 rounded-xl hover:bg-blue-700 disabled:bg-gray-400 font-bold"
                            >
                                {isAddingUser ? t('telegram.adding') : t('telegram.add')}
                            </button>
                        </div>

                        {/* List of users */}
                        {allowedUsers && allowedUsers.length > 0 ? (
                            <div className="space-y-2">
                                {allowedUsers.map((userId: string) => (
                                    <div
                                        key={userId}
                                        className="flex items-center justify-between bg-gray-50 border border-gray-200 p-3 rounded-xl"
                                    >
                                        <div className="flex items-center gap-2">
                                            <code className="bg-white px-2 py-1 rounded text-sm">{userId}</code>
                                            <button
                                                onClick={() => {
                                                    navigator.clipboard.writeText(userId);
                                                    showNotification('success', t('telegram.copied'));
                                                }}
                                                className="text-blue-600 hover:text-blue-700"
                                            >
                                                <Copy className="w-4 h-4" />
                                            </button>
                                        </div>
                                        <button
                                            onClick={() => removeAllowedUser(userId)}
                                            className="bg-red-600 text-white px-3 py-1.5 rounded-xl hover:bg-red-700 text-sm font-bold"
                                        >
                                            {t('telegram.remove')}
                                        </button>
                                    </div>
                                ))}
                            </div>
                        ) : (
                            <p className="text-gray-500 text-center py-4">
                                {t('telegram.no_users')}
                            </p>
                        )}
                    </div>
                </div>

                {/* Advanced Settings */}
                <div className="border-t pt-4">
                    <button
                        onClick={() => setShowAdvanced(!showAdvanced)}
                        className="text-blue-600 hover:text-blue-700 font-semibold text-sm"
                    >
                        {showAdvanced
                            ? t('telegram.hide_advanced')
                            : t('telegram.show_advanced')}
                    </button>

                    {showAdvanced && (
                        <div className="mt-4 p-4 bg-gray-50 rounded-lg space-y-4">
                            <div>
                                <h4 className="font-semibold mb-2">
                                    {t('telegram.bot_features')}
                                </h4>
                                <ul className="list-disc list-inside space-y-1 text-sm text-gray-700">
                                    <li>{t('telegram.feature_notifications')}</li>
                                    <li>{t('telegram.feature_ai_chat')}</li>
                                    <li>{t('telegram.feature_scraper_control')}</li>
                                    <li>{t('telegram.feature_settings_mgmt')}</li>
                                </ul>
                            </div>

                            <div>
                                <h4 className="font-semibold mb-2">
                                    {t('telegram.bot_commands')}
                                </h4>
                                <div className="space-y-2 text-sm">
                                    <div>
                                        <code className="bg-white px-2 py-1 rounded">/start</code>
                                        <span className="ml-2 text-gray-600">{t('telegram.cmd_start')}</span>
                                    </div>
                                    <div>
                                        <code className="bg-white px-2 py-1 rounded">/help</code>
                                        <span className="ml-2 text-gray-600">{t('telegram.cmd_help')}</span>
                                    </div>
                                    <div>
                                        <code className="bg-white px-2 py-1 rounded">/scrape</code>
                                        <span className="ml-2 text-gray-600">{t('telegram.cmd_scrape')}</span>
                                    </div>
                                    <div>
                                        <code className="bg-white px-2 py-1 rounded">/chat</code>
                                        <span className="ml-2 text-gray-600">{t('telegram.cmd_chat')}</span>
                                    </div>
                                    <div>
                                        <code className="bg-white px-2 py-1 rounded">/settings</code>
                                        <span className="ml-2 text-gray-600">{t('telegram.cmd_settings')}</span>
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
