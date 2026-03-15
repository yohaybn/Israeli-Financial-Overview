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
            if (!res.ok) throw new Error(data.error || 'Failed to start bot');
            return data;
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['telegramStatus'] });
            queryClient.invalidateQueries({ queryKey: ['telegramConfig'] });
            showNotification('success', t('telegram.bot_started', 'Bot started successfully'));
        },
        onError: (err: any) => {
            showNotification('error', err.message || 'Failed to start bot');
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
            if (!res.ok) throw new Error(data.error || 'Failed to stop bot');
            return data;
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['telegramStatus'] });
            showNotification('success', t('telegram.bot_stopped', 'Bot stopped'));
        },
        onError: (err: any) => {
            showNotification('error', err.message || 'Failed to stop bot');
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
            if (!res.ok) throw new Error(data.error || 'Failed to update config');
            return data;
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['telegramConfig'] });
            showNotification('success', t('telegram.config_saved', 'Configuration saved'));
        },
        onError: (err: any) => {
            showNotification('error', err.message || 'Failed to save configuration');
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
            showNotification('success', t('telegram.test_success', 'Test message sent successfully'));
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
            if (!res.ok) throw new Error(data.error || 'Failed to add chat');
            return data;
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['telegramNotificationChats'] });
            setChatId('');
            showNotification('success', t('telegram.chat_added', 'Chat added to notifications'));
        },
        onError: (err: any) => {
            showNotification('error', err.message || 'Failed to add chat');
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
            if (!res.ok) throw new Error(data.error || 'Failed to remove chat');
            return data;
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['telegramNotificationChats'] });
            showNotification('success', t('telegram.chat_removed', 'Chat removed from notifications'));
        },
        onError: (err: any) => {
            showNotification('error', err.message || 'Failed to remove chat');
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
            if (!res.ok) throw new Error(data.error || 'Failed to add user');
            return data;
        },
        onSuccess: () => {
            setAllowedUsers([...allowedUsers, newAllowedUser.trim()]);
            setNewAllowedUser('');
            queryClient.invalidateQueries({ queryKey: ['telegramConfig', 'telegramStatus'] });
            showNotification('success', t('telegram.user_added', 'User added to allowed list'));
        },
        onError: (err: any) => {
            showNotification('error', err.message || 'Failed to add user');
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
            if (!res.ok) throw new Error(data.error || 'Failed to remove user');
            return data;
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['telegramConfig', 'telegramStatus'] });
            showNotification('success', t('telegram.user_removed', 'User removed from allowed list'));
        },
        onError: (err: any) => {
            showNotification('error', err.message || 'Failed to remove user');
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
            <div className={`${isInline ? '' : 'bg-white rounded-lg shadow-lg p-6'}`}>
                <div className="flex items-center justify-between mb-6">
                    <div className="flex items-center gap-2">
                        <Settings className="w-6 h-6 text-blue-600" />
                        <h2 className="text-2xl font-bold">
                            {t('telegram.settings_title', 'Telegram Bot Settings')}
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
                        className={`mb-4 p-4 rounded-lg flex items-center gap-2 ${notification.type === 'success'
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
                    <div className="text-gray-500 mb-4">Loading status...</div>
                ) : (
                    <>
                        <div className={`mb-6 p-4 rounded-lg ${status?.isActive ? 'bg-green-100 border-l-4 border-green-600' : 'bg-gray-100 border-l-4 border-gray-400'}`}>
                            <div className="flex items-center justify-between">
                                <div>
                                    <p className="font-semibold">
                                        {t('telegram.bot_status', 'Bot Status')}
                                    </p>
                                    <p className={`text-sm ${status?.isActive ? 'text-green-700' : 'text-gray-700'}`}>
                                        {status?.isActive
                                            ? t('telegram.status_active', '🟢 Active')
                                            : t('telegram.status_inactive', '⚫ Inactive')}
                                    </p>
                                </div>
                                <div className="flex gap-2">
                                    {!status?.isActive ? (
                                        <button
                                            onClick={() => handleStartBot()}
                                            disabled={isStarting || (!botToken && !status?.hasToken)}
                                            className="flex items-center gap-2 bg-green-600 text-white px-4 py-2 rounded-lg hover:bg-green-700 disabled:bg-gray-400"
                                        >
                                            <Play className="w-4 h-4" />
                                            {isStarting ? t('telegram.starting', 'Starting...') : t('telegram.start', 'Start')}
                                        </button>
                                    ) : (
                                        <button
                                            onClick={() => stopBot()}
                                            disabled={isStopping}
                                            className="flex items-center gap-2 bg-red-600 text-white px-4 py-2 rounded-lg hover:bg-red-700 disabled:bg-gray-400"
                                        >
                                            <Square className="w-4 h-4" />
                                            {isStopping ? t('telegram.stopping', 'Stopping...') : t('telegram.stop', 'Stop')}
                                        </button>
                                    )}
                                </div>
                            </div>
                        </div>

                        {/* Warning if no users configured */}
                        {!status?.usersConfigured && (
                            <div className="mb-6 p-4 rounded-lg bg-amber-100 border-l-4 border-amber-600 flex items-start gap-3">
                                <AlertCircle className="w-5 h-5 text-amber-700 flex-shrink-0 mt-0.5" />
                                <div>
                                    <p className="font-semibold text-amber-900">
                                        {t('telegram.warning_no_users', 'No Users Configured')}
                                    </p>
                                    <p className="text-sm text-amber-800 mt-1">
                                        {t('telegram.warning_no_users_desc', 'No users are currently allowed to use the bot. Please configure allowedUsers in the settings to enable access.')}
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
                            {t('telegram.bot_language', 'Bot Language')}
                        </label>
                        <div className="flex gap-3 items-center">
                            <button
                                type="button"
                                onClick={() => { setBotLanguage('en'); updateConfig({ language: 'en' }); }}
                                className={`px-5 py-2 rounded-lg text-sm font-bold border transition-all ${botLanguage === 'en' ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'}`}
                            >
                                🇬🇧 English
                            </button>
                            <button
                                type="button"
                                onClick={() => { setBotLanguage('he'); updateConfig({ language: 'he' }); }}
                                className={`px-5 py-2 rounded-lg text-sm font-bold border transition-all ${botLanguage === 'he' ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'}`}
                            >
                                🇮🇱 עברית
                            </button>
                        </div>
                        <p className="text-xs text-gray-500 mt-1">
                            {t('telegram.bot_language_help', 'All bot messages and notifications will be sent in the selected language.')}
                        </p>
                    </div>
                </div>

                {/* Bot Token Configuration */}
                <div className="space-y-4 mb-6">
                    <div>
                        <label className="block text-sm font-semibold mb-2">
                            {t('telegram.bot_token', 'Bot Token')}
                            <span className="text-red-600"> *</span>
                        </label>
                        <div className="flex gap-2">
                            <input
                                type="password"
                                value={botToken}
                                onChange={(e) => setBotToken(e.target.value)}
                                placeholder={t('telegram.token_placeholder', 'Enter your Telegram bot token')}
                                className="flex-1 px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                            />
                            <button
                                onClick={handleSaveToken}
                                disabled={isUpdating || !botToken}
                                className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 disabled:bg-gray-400"
                            >
                                {isUpdating ? t('telegram.saving', 'Saving...') : t('telegram.save', 'Save')}
                            </button>
                        </div>
                        <p className="text-xs text-gray-600 mt-1">
                            {t('telegram.token_help', 'Get your token from @BotFather on Telegram')}
                        </p>
                    </div>


                    {/* Test Connection */}
                    {botToken && (
                        <div>
                            <label className="block text-sm font-semibold mb-2">
                                {t('telegram.test_connection', 'Test Connection')}
                            </label>
                            <div className="flex gap-2">
                                <input
                                    type="text"
                                    value={chatId}
                                    onChange={(e) => setChatId(e.target.value)}
                                    placeholder={t('telegram.chat_id_placeholder', 'Enter chat ID or group ID')}
                                    className="flex-1 px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                                />
                                <button
                                    onClick={() => testConnection()}
                                    disabled={isTesting || !botToken || !chatId}
                                    className="bg-green-600 text-white px-4 py-2 rounded-lg hover:bg-green-700 disabled:bg-gray-400"
                                >
                                    {isTesting ? t('telegram.testing', 'Testing...') : t('telegram.test', 'Test')}
                                </button>
                            </div>
                            <p className="text-xs text-gray-600 mt-1">
                                {t('telegram.chat_id_help', 'Typically starts with - for groups or is a number for private chats')}
                            </p>
                        </div>
                    )}
                </div>

                {/* Notification Chats */}
                <div className="space-y-4 mb-6">
                    <div>
                        <h3 className="text-lg font-semibold mb-3">
                            {t('telegram.notification_chats', 'Notification Chats')}
                        </h3>
                        <p className="text-sm text-gray-600 mb-3">
                            {t('telegram.notification_chats_help', 'Select which chats should receive transaction notifications')}
                        </p>

                        {/* Add chat */}
                        <div className="flex gap-2 mb-4">
                            <input
                                type="text"
                                value={chatId}
                                onChange={(e) => setChatId(e.target.value)}
                                placeholder={t('telegram.chat_id_placeholder', 'Enter chat ID or group ID')}
                                className="flex-1 px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                            />
                            <button
                                onClick={() => addNotificationChat()}
                                disabled={!chatId.trim()}
                                className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 disabled:bg-gray-400"
                            >
                                {t('telegram.add', 'Add')}
                            </button>
                        </div>

                        {/* List of chats */}
                        {notificationChats && notificationChats.length > 0 ? (
                            <div className="space-y-2">
                                {notificationChats.map((id: string) => (
                                    <div
                                        key={id}
                                        className="flex items-center justify-between bg-gray-100 p-3 rounded-lg"
                                    >
                                        <div className="flex items-center gap-2">
                                            <code className="bg-white px-2 py-1 rounded text-sm">{id}</code>
                                            <button
                                                onClick={() => {
                                                    navigator.clipboard.writeText(id);
                                                    showNotification('success', t('telegram.copied', 'Copied'));
                                                }}
                                                className="text-blue-600 hover:text-blue-700"
                                            >
                                                <Copy className="w-4 h-4" />
                                            </button>
                                        </div>
                                        <button
                                            onClick={() => removeNotificationChat(id)}
                                            className="bg-red-600 text-white px-3 py-1 rounded hover:bg-red-700 text-sm"
                                        >
                                            {t('telegram.remove', 'Remove')}
                                        </button>
                                    </div>
                                ))}
                            </div>
                        ) : (
                            <p className="text-gray-500 text-center py-4">
                                {t('telegram.no_chats', 'No notification chats configured yet')}
                            </p>
                        )}
                    </div>
                </div>

                {/* Allowed Users */}
                <div className="space-y-4 mb-6">
                    <div>
                        <h3 className="text-lg font-semibold mb-3">
                            {t('telegram.allowed_users', 'Allowed Users')}
                        </h3>
                        <p className="text-sm text-gray-600 mb-3">
                            {t('telegram.allowed_users_help', 'Only users in this list can use the bot. Leave empty to disable bot access completely.')}
                        </p>

                        {/* Add user */}
                        <div className="flex gap-2 mb-4">
                            <input
                                type="text"
                                value={newAllowedUser}
                                onChange={(e) => setNewAllowedUser(e.target.value)}
                                placeholder={t('telegram.user_id_placeholder', 'Enter Telegram user ID')}
                                className="flex-1 px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                            />
                            <button
                                onClick={() => addAllowedUser()}
                                disabled={!newAllowedUser.trim() || isAddingUser}
                                className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 disabled:bg-gray-400"
                            >
                                {isAddingUser ? t('telegram.adding', 'Adding...') : t('telegram.add', 'Add')}
                            </button>
                        </div>

                        {/* List of users */}
                        {allowedUsers && allowedUsers.length > 0 ? (
                            <div className="space-y-2">
                                {allowedUsers.map((userId: string) => (
                                    <div
                                        key={userId}
                                        className="flex items-center justify-between bg-gray-100 p-3 rounded-lg"
                                    >
                                        <div className="flex items-center gap-2">
                                            <code className="bg-white px-2 py-1 rounded text-sm">{userId}</code>
                                            <button
                                                onClick={() => {
                                                    navigator.clipboard.writeText(userId);
                                                    showNotification('success', t('telegram.copied', 'Copied'));
                                                }}
                                                className="text-blue-600 hover:text-blue-700"
                                            >
                                                <Copy className="w-4 h-4" />
                                            </button>
                                        </div>
                                        <button
                                            onClick={() => removeAllowedUser(userId)}
                                            className="bg-red-600 text-white px-3 py-1 rounded hover:bg-red-700 text-sm"
                                        >
                                            {t('telegram.remove', 'Remove')}
                                        </button>
                                    </div>
                                ))}
                            </div>
                        ) : (
                            <p className="text-gray-500 text-center py-4">
                                {t('telegram.no_users', 'No users allowed yet. Add at least one to enable bot access.')}
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
                            ? t('telegram.hide_advanced', '▼ Advanced Settings')
                            : t('telegram.show_advanced', '▶ Advanced Settings')}
                    </button>

                    {showAdvanced && (
                        <div className="mt-4 p-4 bg-gray-50 rounded-lg space-y-4">
                            <div>
                                <h4 className="font-semibold mb-2">
                                    {t('telegram.bot_features', 'Available Bot Features')}
                                </h4>
                                <ul className="list-disc list-inside space-y-1 text-sm text-gray-700">
                                    <li>{t('telegram.feature_notifications', 'Send transaction notifications')}</li>
                                    <li>{t('telegram.feature_ai_chat', 'Chat with AI about transactions')}</li>
                                    <li>{t('telegram.feature_scraper_control', 'Run scrapers from the bot')}</li>
                                    <li>{t('telegram.feature_settings_mgmt', 'Manage settings via chat commands')}</li>
                                </ul>
                            </div>

                            <div>
                                <h4 className="font-semibold mb-2">
                                    {t('telegram.bot_commands', 'Bot Commands')}
                                </h4>
                                <div className="space-y-2 text-sm">
                                    <div>
                                        <code className="bg-white px-2 py-1 rounded">/start</code>
                                        <span className="ml-2 text-gray-600">{t('telegram.cmd_start', 'Initialize bot')}</span>
                                    </div>
                                    <div>
                                        <code className="bg-white px-2 py-1 rounded">/help</code>
                                        <span className="ml-2 text-gray-600">{t('telegram.cmd_help', 'Show help')}</span>
                                    </div>
                                    <div>
                                        <code className="bg-white px-2 py-1 rounded">/scrape</code>
                                        <span className="ml-2 text-gray-600">{t('telegram.cmd_scrape', 'Run scraper')}</span>
                                    </div>
                                    <div>
                                        <code className="bg-white px-2 py-1 rounded">/chat</code>
                                        <span className="ml-2 text-gray-600">{t('telegram.cmd_chat', 'Start AI chat')}</span>
                                    </div>
                                    <div>
                                        <code className="bg-white px-2 py-1 rounded">/settings</code>
                                        <span className="ml-2 text-gray-600">{t('telegram.cmd_settings', 'Manage settings')}</span>
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
