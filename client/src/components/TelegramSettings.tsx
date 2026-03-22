import { useState, useEffect, useCallback, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Settings, Play, Square, AlertCircle, CheckCircle } from 'lucide-react';

interface TelegramSettingsProps {
    isOpen?: boolean;
    onClose?: () => void;
    isInline?: boolean;
}

const API_BASE = '/api';

export function TelegramSettings({ isOpen, onClose, isInline }: TelegramSettingsProps) {
    const { t } = useTranslation();
    const queryClient = useQueryClient();
    const isEnabled = isInline || !!isOpen;

    const [botToken, setBotToken] = useState('');
    const [chatId, setChatId] = useState('');
    const [showAdvanced, setShowAdvanced] = useState(false);
    const [notification, setNotification] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
    const [newUserId, setNewUserId] = useState('');
    const [allowedUsers, setAllowedUsers] = useState<string[]>([]);
    const [botLanguage, setBotLanguage] = useState<'en' | 'he'>('en');
    const [spendingDigestEnabled, setSpendingDigestEnabled] = useState(false);

    const showNotification = useCallback((type: 'success' | 'error', message: string) => {
        setNotification({ type, message });
        setTimeout(() => setNotification(null), 5000);
    }, []);

    const { data: config } = useQuery({
        queryKey: ['telegramConfig'],
        queryFn: async () => {
            const res = await fetch(`${API_BASE}/telegram/config`);
            const data = await res.json();
            return data.data;
        },
        enabled: isEnabled,
    });

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
            if (config.spendingDigestEnabled !== undefined) {
                setSpendingDigestEnabled(!!config.spendingDigestEnabled);
            }
        }
    }, [config]);

    const { data: status, isLoading: isLoadingStatus } = useQuery({
        queryKey: ['telegramStatus'],
        queryFn: async () => {
            const res = await fetch(`${API_BASE}/telegram/status`);
            const data = await res.json();
            return data.data;
        },
        enabled: isEnabled,
        refetchInterval: 5000,
    });

    const { data: notificationChats } = useQuery({
        queryKey: ['telegramNotificationChats'],
        queryFn: async () => {
            const res = await fetch(`${API_BASE}/telegram/notification-chats`);
            const data = await res.json();
            return data.data || [];
        },
        enabled: isEnabled,
    });

    const userRows = useMemo(() => {
        const users = new Set<string>([...(allowedUsers || []), ...((notificationChats as string[]) || [])]);
        return Array.from(users).sort((a, b) => a.localeCompare(b));
    }, [allowedUsers, notificationChats]);

    const { data: userLabels } = useQuery({
        queryKey: ['telegramUserLabels', userRows],
        queryFn: async () => {
            if (userRows.length === 0) return {} as Record<string, string>;
            const res = await fetch(`${API_BASE}/telegram/user-labels`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ ids: userRows }),
            });
            const data = await res.json();
            return (data.data || {}) as Record<string, string>;
        },
        enabled: isEnabled && userRows.length > 0,
    });

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
            queryClient.invalidateQueries({ queryKey: ['telegramStatus'] });
            showNotification('success', t('telegram.config_saved'));
        },
        onError: (err: any) => {
            showNotification('error', err.message || t('telegram.errors.save_config_failed'));
        },
    });

    const { mutate: sendTestMessage, isPending: isSendingTest } = useMutation({
        mutationFn: async () => {
            const res = await fetch(`${API_BASE}/telegram/send-test-message`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({}),
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || 'Failed to send test message');
            return data;
        },
        onSuccess: (data) => {
            const msg = data?.sent > 0
                ? (data.sent === 1 ? t('telegram.test_success') : `Test message sent to ${data.sent} chats.`)
                : (data?.errors?.[0] || t('telegram.test_success'));
            showNotification('success', msg);
        },
        onError: (err: any) => {
            showNotification('error', err.message || 'Failed to send test message');
        },
    });

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

    const { mutate: setNotificationChat } = useMutation({
        mutationFn: async ({ id, enabled }: { id: string; enabled: boolean }) => {
            const endpoint = enabled ? 'add' : 'remove';
            const res = await fetch(`${API_BASE}/telegram/notification-chat/${endpoint}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ chatId: id }),
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || t('telegram.errors.update_config_failed'));
            return data;
        },
        onSuccess: (_, vars) => {
            queryClient.invalidateQueries({ queryKey: ['telegramNotificationChats'] });
            queryClient.invalidateQueries({ queryKey: ['telegramUserLabels'] });
            showNotification('success', vars.enabled ? t('telegram.chat_added') : t('telegram.chat_removed'));
        },
        onError: (err: any) => {
            showNotification('error', err.message || t('telegram.errors.update_config_failed'));
        },
    });

    const { mutate: setAllowedUser, isPending: isUpdatingAllowedUser } = useMutation({
        mutationFn: async ({ id, enabled }: { id: string; enabled: boolean }) => {
            const updatedUsers = enabled ? Array.from(new Set([...(allowedUsers || []), id])) : allowedUsers.filter((u) => u !== id);
            const res = await fetch(`${API_BASE}/telegram/config`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ allowedUsers: updatedUsers }),
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || t('telegram.errors.update_config_failed'));
            return { data, updatedUsers };
        },
        onSuccess: ({ updatedUsers }, vars) => {
            setAllowedUsers(updatedUsers);
            queryClient.invalidateQueries({ queryKey: ['telegramConfig'] });
            queryClient.invalidateQueries({ queryKey: ['telegramStatus'] });
            queryClient.invalidateQueries({ queryKey: ['telegramUserLabels'] });
            showNotification('success', vars.enabled ? t('telegram.user_added') : t('telegram.user_removed'));
        },
        onError: (err: any) => {
            showNotification('error', err.message || t('telegram.errors.update_config_failed'));
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
        if (!botToken.trim() && !status?.hasToken) {
            showNotification('error', 'Bot token is required');
            return;
        }
        startBot();
    };

    const handleAddUser = () => {
        const id = newUserId.trim();
        if (!id) return;
        setAllowedUser({ id, enabled: true });
        setNewUserId('');
    };

    const getLabel = (id: string) => {
        const label = (userLabels as Record<string, string> | undefined)?.[id];
        return label && label !== id ? label : id;
    };

    if (!isInline && !isOpen) return null;

    return (
        <div className="space-y-6">
            <div className={`${isInline ? 'space-y-6' : 'bg-white rounded-3xl shadow-2xl w-full max-w-4xl p-6 overflow-y-auto max-h-[90vh] animate-in zoom-in-95 duration-200'}`}>
                <div className="flex items-center justify-between mb-6">
                    <div className="flex items-center gap-2">
                        <Settings className="w-6 h-6 text-blue-600" />
                        <h2 className="text-2xl font-bold">{t('telegram.settings_title')}</h2>
                    </div>
                    {!isInline && onClose && (
                        <button onClick={onClose} className="text-gray-500 hover:text-gray-700">
                            x
                        </button>
                    )}
                </div>

                {notification && (
                    <div className={`mb-4 p-4 rounded-xl border flex items-center gap-2 ${notification.type === 'success' ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>
                        {notification.type === 'success' ? <CheckCircle className="w-5 h-5" /> : <AlertCircle className="w-5 h-5" />}
                        {notification.message}
                    </div>
                )}

                {isLoadingStatus ? (
                    <div className="text-gray-500 mb-4">{t('telegram.loading_status')}</div>
                ) : (
                    <>
                        <div className={`mb-6 p-4 rounded-2xl border ${status?.isActive ? 'bg-green-100 border-green-300' : 'bg-gray-100 border-gray-300'}`}>
                            <div className="flex items-center justify-between">
                                <div>
                                    <p className="font-semibold">{t('telegram.bot_status')}</p>
                                    <p className={`text-sm ${status?.isActive ? 'text-green-700' : 'text-gray-700'}`}>
                                        {status?.isActive ? t('telegram.status_active') : t('telegram.status_inactive')}
                                    </p>
                                </div>
                                <div className="flex gap-2">
                                    {!status?.isActive ? (
                                        <button
                                            onClick={handleStartBot}
                                            disabled={isStarting || (!botToken && !status?.hasToken)}
                                            className="flex items-center gap-2 bg-green-600 text-white px-4 py-2.5 rounded-2xl hover:bg-green-700 disabled:bg-gray-400"
                                        >
                                            <Play className="w-4 h-4" />
                                            {isStarting ? t('telegram.starting') : t('telegram.start')}
                                        </button>
                                    ) : (
                                        <>
                                            <button
                                                onClick={() => sendTestMessage()}
                                                disabled={isSendingTest}
                                                className="flex items-center gap-2 bg-blue-600 text-white px-4 py-2.5 rounded-2xl hover:bg-blue-700 disabled:bg-gray-400"
                                            >
                                                {isSendingTest ? t('telegram.testing') : t('telegram.send_test_message')}
                                            </button>
                                            <button
                                                onClick={() => stopBot()}
                                                disabled={isStopping}
                                                className="flex items-center gap-2 bg-red-600 text-white px-4 py-2.5 rounded-2xl hover:bg-red-700 disabled:bg-gray-400"
                                            >
                                                <Square className="w-4 h-4" />
                                                {isStopping ? t('telegram.stopping') : t('telegram.stop')}
                                            </button>
                                        </>
                                    )}
                                </div>
                            </div>
                        </div>

                        {!status?.isActive && status?.lastStartError && (
                            <div className="mb-6 p-4 rounded-2xl bg-red-50 border border-red-200 flex items-start gap-3">
                                <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
                                <div>
                                    <p className="font-semibold text-red-900">{t('telegram.why_bot_not_started')}</p>
                                    <p className="text-sm text-red-800 mt-1">{status.lastStartError}</p>
                                </div>
                            </div>
                        )}

                        {!status?.usersConfigured && (
                            <div className="mb-6 p-4 rounded-2xl bg-amber-100 border border-amber-300 flex items-start gap-3">
                                <AlertCircle className="w-5 h-5 text-amber-700 flex-shrink-0 mt-0.5" />
                                <div>
                                    <p className="font-semibold text-amber-900">{t('telegram.warning_no_users')}</p>
                                    <p className="text-sm text-amber-800 mt-1">{t('telegram.warning_no_users_desc')}</p>
                                </div>
                            </div>
                        )}
                    </>
                )}

                <div className="space-y-4 mb-6">
                    <label className="block text-sm font-semibold mb-2">{t('telegram.bot_language')}</label>
                    <div className="flex gap-3 items-center">
                        <button
                            type="button"
                            onClick={() => {
                                setBotLanguage('en');
                                updateConfig({ language: 'en' });
                            }}
                            className={`px-5 py-2.5 rounded-xl text-sm font-bold border transition-all ${botLanguage === 'en' ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'}`}
                        >
                            English
                        </button>
                        <button
                            type="button"
                            onClick={() => {
                                setBotLanguage('he');
                                updateConfig({ language: 'he' });
                            }}
                            className={`px-5 py-2.5 rounded-xl text-sm font-bold border transition-all ${botLanguage === 'he' ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'}`}
                        >
                            עברית
                        </button>
                    </div>
                    <p className="text-xs text-gray-500 mt-1">{t('telegram.bot_language_help')}</p>
                </div>

                <div className="mb-6 p-4 rounded-2xl border border-gray-200 bg-gray-50/80">
                    <label className="flex items-start gap-3 cursor-pointer">
                        <input
                            type="checkbox"
                            checked={spendingDigestEnabled}
                            onChange={(e) => {
                                const v = e.target.checked;
                                setSpendingDigestEnabled(v);
                                updateConfig({ spendingDigestEnabled: v });
                            }}
                            disabled={isUpdating}
                            className="mt-1 w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                        />
                        <span>
                            <span className="text-sm font-semibold text-gray-900 block">{t('telegram.spending_digest')}</span>
                            <span className="text-xs text-gray-600">{t('telegram.spending_digest_help')}</span>
                        </span>
                    </label>
                </div>

                {!status?.isActive ? (
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
                                {t('telegram.token_help')}{' '}
                                <a href="https://t.me/botfather" target="_blank" rel="noreferrer" className="text-blue-600 hover:underline font-semibold">
                                    @BotFather
                                </a>
                            </p>
                        </div>

                        {botToken && (
                            <div>
                                <label className="block text-sm font-semibold mb-2">{t('telegram.test_connection')}</label>
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
                            </div>
                        )}
                    </div>
                ) : (
                    <div className="mb-6 p-3 bg-blue-50 border border-blue-200 rounded-xl text-sm text-blue-800">
                        Bot token is hidden while the bot is running. Stop the bot to edit the token.
                    </div>
                )}

                <div className="space-y-4 mb-6">
                    <h3 className="text-lg font-semibold">Users</h3>
                    <p className="text-sm text-gray-600">Toggle access and notifications per user/chat. Usernames are shown when Telegram can resolve them.</p>

                    <div className="flex gap-2">
                        <input
                            type="text"
                            value={newUserId}
                            onChange={(e) => setNewUserId(e.target.value)}
                            placeholder={t('telegram.user_id_placeholder')}
                            className="flex-1 px-4 py-2.5 bg-white border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 shadow-sm"
                        />
                        <button
                            onClick={handleAddUser}
                            disabled={!newUserId.trim() || isUpdatingAllowedUser}
                            className="bg-blue-600 text-white px-4 py-2.5 rounded-xl hover:bg-blue-700 disabled:bg-gray-400 font-bold"
                        >
                            {isUpdatingAllowedUser ? t('telegram.adding') : t('telegram.add')}
                        </button>
                    </div>

                    <div className="overflow-x-auto border border-gray-200 rounded-xl">
                        <table className="min-w-full text-sm">
                            <thead className="bg-gray-50 border-b border-gray-200">
                                <tr>
                                    <th className="text-left px-4 py-2.5 font-semibold text-gray-700">UserName</th>
                                    <th className="text-center px-4 py-2.5 font-semibold text-gray-700">Allowed chat</th>
                                    <th className="text-center px-4 py-2.5 font-semibold text-gray-700">Notification</th>
                                </tr>
                            </thead>
                            <tbody>
                                {userRows.length === 0 && (
                                    <tr>
                                        <td colSpan={3} className="px-4 py-6 text-center text-gray-500">
                                            {t('telegram.no_users')}
                                        </td>
                                    </tr>
                                )}
                                {userRows.map((id) => {
                                    const isAllowed = allowedUsers.includes(id);
                                    const isNotify = ((notificationChats as string[]) || []).includes(id);
                                    const label = getLabel(id);
                                    return (
                                        <tr key={id} className="border-b border-gray-100 last:border-b-0">
                                            <td className="px-4 py-2.5">
                                                <div className="font-medium text-gray-800">{label}</div>
                                                {label !== id && <div className="text-xs text-gray-500">{id}</div>}
                                            </td>
                                            <td className="px-4 py-2.5 text-center">
                                                <input
                                                    type="checkbox"
                                                    checked={isAllowed}
                                                    onChange={(e) => setAllowedUser({ id, enabled: e.target.checked })}
                                                    className="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                                                />
                                            </td>
                                            <td className="px-4 py-2.5 text-center">
                                                <input
                                                    type="checkbox"
                                                    checked={isNotify}
                                                    onChange={(e) => setNotificationChat({ id, enabled: e.target.checked })}
                                                    className="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                                                />
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                </div>

                <div className="border-t pt-4">
                    <button onClick={() => setShowAdvanced(!showAdvanced)} className="text-blue-600 hover:text-blue-700 font-semibold text-sm">
                        {showAdvanced ? t('telegram.hide_advanced') : t('telegram.show_advanced')}
                    </button>

                    {showAdvanced && (
                        <div className="mt-4 p-4 bg-gray-50 rounded-lg space-y-4">
                            <div>
                                <h4 className="font-semibold mb-2">{t('telegram.bot_features')}</h4>
                                <ul className="list-disc list-inside space-y-1 text-sm text-gray-700">
                                    <li>{t('telegram.feature_notifications')}</li>
                                    <li>{t('telegram.feature_ai_chat')}</li>
                                    <li>{t('telegram.feature_scraper_control')}</li>
                                    <li>{t('telegram.feature_settings_mgmt')}</li>
                                </ul>
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
