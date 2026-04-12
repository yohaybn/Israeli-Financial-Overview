import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Play, Square, AlertCircle, CheckCircle, Info, Send, Trash2, ExternalLink } from 'lucide-react';
import { getApiRoot } from '../lib/api';

interface TelegramSettingsProps {
    isOpen?: boolean;
    onClose?: () => void;
    isInline?: boolean;
}

const TOKEN_MASK = '*****';

const AVATAR_PALETTE = ['bg-emerald-500', 'bg-rose-400', 'bg-slate-500', 'bg-amber-500', 'bg-blue-500', 'bg-violet-500'];

function avatarColorClass(id: string): string {
    let h = 0;
    for (let i = 0; i < id.length; i++) {
        h = (h + id.charCodeAt(i) * (i + 1)) % 1_000_000;
    }
    return AVATAR_PALETTE[Math.abs(h) % AVATAR_PALETTE.length];
}

function avatarLetter(label: string): string {
    const s = label.replace(/^@/, '').trim();
    return (s[0] || '?').toUpperCase();
}

function botDisplayName(bot: { firstName: string; lastName?: string }): string {
    const s = [bot.firstName, bot.lastName].filter(Boolean).join(' ').trim();
    return s || bot.firstName;
}

function parseAccountsMapFromInput(input: Record<string, string>, ids: string[]): Record<string, string[]> {
    const out: Record<string, string[]> = {};
    for (const id of ids) {
        const raw = (input[id] || '').trim();
        if (!raw) continue;
        const arr = raw.split(',').map((x) => x.trim()).filter(Boolean);
        if (arr.length) out[id] = arr;
    }
    return out;
}

export function TelegramSettings({ isOpen, onClose, isInline }: TelegramSettingsProps) {
    const { t } = useTranslation();
    const queryClient = useQueryClient();
    const isEnabled = isInline || !!isOpen;

    const [botToken, setBotToken] = useState('');
    const [chatId, setChatId] = useState('');
    const [notification, setNotification] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
    const [newUserId, setNewUserId] = useState('');
    const [allowedUsers, setAllowedUsers] = useState<string[]>([]);
    const [accountsByChatInput, setAccountsByChatInput] = useState<Record<string, string>>({});
    const [botLanguage, setBotLanguage] = useState<'en' | 'he'>('en');
    const [sendingTestChatId, setSendingTestChatId] = useState<string | null>(null);
    const [tokenFieldFocused, setTokenFieldFocused] = useState(false);
    const lastTokenSaveSnapRef = useRef<string>('');

    const showNotification = useCallback((type: 'success' | 'error', message: string) => {
        setNotification({ type, message });
        setTimeout(() => setNotification(null), 5000);
    }, []);

    const { data: config } = useQuery({
        queryKey: ['telegramConfig'],
        queryFn: async () => {
            const res = await fetch(`${getApiRoot()}/telegram/config`);
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
            if (config.notificationAccountsByChatId && typeof config.notificationAccountsByChatId === 'object') {
                const next: Record<string, string> = {};
                for (const [k, v] of Object.entries(config.notificationAccountsByChatId as Record<string, string[]>)) {
                    next[k] = Array.isArray(v) ? v.join(', ') : '';
                }
                setAccountsByChatInput(next);
            } else {
                setAccountsByChatInput({});
            }
            lastTokenSaveSnapRef.current = `${config.botToken || ''}|${config.language || 'en'}`;
        }
    }, [config]);

    const { data: status, isLoading: isLoadingStatus } = useQuery({
        queryKey: ['telegramStatus'],
        queryFn: async () => {
            const res = await fetch(`${getApiRoot()}/telegram/status`);
            const data = await res.json();
            return data.data;
        },
        enabled: isEnabled,
        refetchInterval: 5000,
    });

    const hasSavedToken = Boolean(
        status?.hasToken || (typeof config?.botToken === 'string' && config.botToken.startsWith('***'))
    );

    const {
        data: botInfo,
        isLoading: isLoadingBotInfo,
        isError: isBotInfoError,
    } = useQuery({
        queryKey: ['telegramBotInfo'],
        queryFn: async () => {
            const res = await fetch(`${getApiRoot()}/telegram/bot-info`);
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || 'bot-info failed');
            return data.data as {
                id: number;
                firstName: string;
                lastName?: string;
                username?: string;
                openTelegramUrl: string;
                hasAvatar: boolean;
            } | null;
        },
        enabled: isEnabled && hasSavedToken && Boolean(status?.isActive),
        refetchInterval: status?.isActive ? 60_000 : false,
    });

    const showTokenMask = hasSavedToken && !botToken.trim() && !tokenFieldFocused;
    const tokenInputValue = showTokenMask ? TOKEN_MASK : botToken;

    const { data: notificationChats } = useQuery({
        queryKey: ['telegramNotificationChats'],
        queryFn: async () => {
            const res = await fetch(`${getApiRoot()}/telegram/notification-chats`);
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
            const res = await fetch(`${getApiRoot()}/telegram/user-labels`, {
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
            const res = await fetch(`${getApiRoot()}/telegram/start`, {
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
            queryClient.invalidateQueries({ queryKey: ['telegramBotInfo'] });
            showNotification('success', t('telegram.bot_started'));
        },
        onError: (err: any) => {
            showNotification('error', err.message || t('telegram.errors.start_failed'));
        },
    });

    const { mutate: stopBot, isPending: isStopping } = useMutation({
        mutationFn: async () => {
            const res = await fetch(`${getApiRoot()}/telegram/stop`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || t('telegram.errors.stop_failed'));
            return data;
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['telegramStatus'] });
            queryClient.invalidateQueries({ queryKey: ['telegramBotInfo'] });
            showNotification('success', t('telegram.bot_stopped'));
        },
        onError: (err: any) => {
            showNotification('error', err.message || t('telegram.errors.stop_failed'));
        },
    });

    const { mutate: updateConfig, isPending: isUpdating } = useMutation({
        mutationFn: async (newConfig: Record<string, unknown>) => {
            const res = await fetch(`${getApiRoot()}/telegram/config`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(newConfig),
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || t('telegram.errors.update_config_failed'));
            return data;
        },
        onSuccess: (_data, variables: Record<string, unknown>) => {
            queryClient.invalidateQueries({ queryKey: ['telegramConfig'] });
            queryClient.invalidateQueries({ queryKey: ['telegramStatus'] });
            queryClient.invalidateQueries({ queryKey: ['telegramNotificationChats'] });
            queryClient.invalidateQueries({ queryKey: ['telegramBotInfo'] });
            if (typeof variables?.botToken === 'string' && variables.botToken.trim()) {
                setBotToken('');
                setTokenFieldFocused(false);
            }
            const keys = Object.keys(variables || {});
            const onlyAccounts =
                keys.length === 1 && keys[0] === 'notificationAccountsByChatId';
            if (!onlyAccounts) {
                showNotification('success', t('telegram.config_saved'));
            }
        },
        onError: (err: any) => {
            showNotification('error', err.message || t('telegram.errors.save_config_failed'));
        },
    });

    useEffect(() => {
        if (!isEnabled) return;
        const trimmed = botToken.trim();
        if (!trimmed) return;
        const snap = `${trimmed}|${botLanguage}`;
        if (snap === lastTokenSaveSnapRef.current) return;
        const timer = setTimeout(() => {
            updateConfig({ botToken: trimmed, language: botLanguage });
            lastTokenSaveSnapRef.current = snap;
        }, 1000);
        return () => clearTimeout(timer);
    }, [botToken, botLanguage, isEnabled, updateConfig]);

    const { mutate: sendTestToChat } = useMutation({
        mutationFn: async (targetChatId: string) => {
            const res = await fetch(`${getApiRoot()}/telegram/send-test-message`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ chatId: targetChatId }),
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || 'Failed to send test message');
            return data;
        },
        onMutate: (targetChatId) => {
            setSendingTestChatId(targetChatId);
        },
        onSettled: () => {
            setSendingTestChatId(null);
        },
        onSuccess: () => {
            showNotification('success', t('telegram.test_sent_to_chat'));
        },
        onError: (err: any) => {
            showNotification('error', err.message || 'Failed to send test message');
        },
    });

    const { mutate: testConnection, isPending: isTesting } = useMutation({
        mutationFn: async () => {
            const trimmed = botToken.trim();
            if (!trimmed || !chatId) {
                throw new Error('Bot token and chat ID are required');
            }
            const res = await fetch(`${getApiRoot()}/telegram/test`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ botToken: trimmed, chatId }),
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
            const res = await fetch(`${getApiRoot()}/telegram/notification-chat/${endpoint}`, {
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
            const res = await fetch(`${getApiRoot()}/telegram/config`, {
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

    const { mutate: removeUserRow, isPending: isRemovingUser } = useMutation({
        mutationFn: async (id: string) => {
            const nextAllowed = (allowedUsers || []).filter((u) => u !== id);
            const nextNotif = ((notificationChats as string[]) || []).filter((c) => c !== id);
            const nextAccInput = { ...accountsByChatInput };
            delete nextAccInput[id];
            const nextRows = userRows.filter((u) => u !== id);
            const notificationAccountsByChatId = parseAccountsMapFromInput(nextAccInput, nextRows);
            const res = await fetch(`${getApiRoot()}/telegram/config`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    allowedUsers: nextAllowed,
                    notificationChatIds: nextNotif,
                    notificationAccountsByChatId,
                }),
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || t('telegram.errors.remove_user_failed'));
            return { id, nextAllowed, nextNotif, nextAccInput };
        },
        onSuccess: ({ nextAllowed, nextAccInput }) => {
            setAllowedUsers(nextAllowed);
            setAccountsByChatInput(nextAccInput);
            queryClient.invalidateQueries({ queryKey: ['telegramConfig'] });
            queryClient.invalidateQueries({ queryKey: ['telegramNotificationChats'] });
            queryClient.invalidateQueries({ queryKey: ['telegramStatus'] });
            queryClient.invalidateQueries({ queryKey: ['telegramUserLabels'] });
            showNotification('success', t('telegram.user_deleted_row'));
        },
        onError: (err: any) => {
            showNotification('error', err.message || t('telegram.errors.remove_user_failed'));
        },
    });

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

    const downloadUserManifest = () => {
        const rows = userRows.map((id) => ({
            telegram_id: id,
            display_label: getLabel(id),
            allowed_chat: allowedUsers.includes(id) ? 'true' : 'false',
            notifications_enabled: ((notificationChats as string[]) || []).includes(id) ? 'true' : 'false',
        }));
        const header = ['telegram_id', 'display_label', 'allowed_chat', 'notifications_enabled'];
        const lines = [header.join(','), ...rows.map((r) => header.map((h) => JSON.stringify(String((r as any)[h]))).join(','))];
        const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `telegram-users-${new Date().toISOString().slice(0, 10)}.csv`;
        a.click();
        URL.revokeObjectURL(url);
    };

    if (!isInline && !isOpen) return null;

    const cardShell = isInline ? 'space-y-6' : 'bg-white rounded-3xl shadow-2xl w-full max-w-5xl p-6 md:p-8 overflow-y-auto max-h-[90vh] animate-in zoom-in-95 duration-200';

    return (
        <div className="space-y-6">
            <div className={cardShell}>
                {!isInline && onClose && (
                    <div className="flex justify-end mb-4">
                        <button type="button" onClick={onClose} className="text-gray-500 hover:text-gray-700">
                            ×
                        </button>
                    </div>
                )}

                {notification && (
                    <div
                        className={`mb-4 p-4 rounded-xl border flex items-center gap-2 ${notification.type === 'success' ? 'bg-emerald-50 text-emerald-900 border-emerald-200' : 'bg-red-50 text-red-800 border-red-200'}`}
                    >
                        {notification.type === 'success' ? <CheckCircle className="w-5 h-5 shrink-0" /> : <AlertCircle className="w-5 h-5 shrink-0" />}
                        {notification.message}
                    </div>
                )}

                {isLoadingStatus ? (
                    <div className="text-gray-500 mb-4">{t('telegram.loading_status')}</div>
                ) : (
                    <>
                        <div
                            className={`mb-6 p-5 rounded-2xl border flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 ${status?.isActive ? 'bg-emerald-50/80 border-emerald-200' : 'bg-slate-50 border-slate-200'}`}
                        >
                            <div className="flex items-start gap-3">
                                <span
                                    className={`mt-1.5 w-2.5 h-2.5 rounded-full shrink-0 ${status?.isActive ? 'bg-emerald-500' : 'bg-slate-400'}`}
                                    aria-hidden
                                />
                                <div>
                                    <p className="font-bold text-gray-900">
                                        {status?.isActive ? t('telegram.status_active') : t('telegram.status_inactive')}
                                    </p>
                                    <p className="text-sm text-gray-600 mt-0.5">
                                        {status?.isActive ? t('telegram.status_active_subtitle') : t('telegram.status_inactive_subtitle')}
                                    </p>
                                </div>
                            </div>
                            <div className="flex gap-2 shrink-0">
                                {!status?.isActive ? (
                                    <button
                                        type="button"
                                        onClick={handleStartBot}
                                        disabled={isStarting || (!botToken.trim() && !status?.hasToken)}
                                        className="flex items-center gap-2 bg-emerald-600 text-white px-5 py-2.5 rounded-xl hover:bg-emerald-700 disabled:bg-gray-400 font-semibold"
                                    >
                                        <Play className="w-4 h-4" />
                                        {isStarting ? t('telegram.starting') : t('telegram.start')}
                                    </button>
                                ) : (
                                    <button
                                        type="button"
                                        onClick={() => stopBot()}
                                        disabled={isStopping}
                                        className="flex items-center gap-2 bg-red-600 text-white px-5 py-2.5 rounded-xl hover:bg-red-700 disabled:bg-gray-400 font-semibold"
                                    >
                                        <Square className="w-4 h-4" />
                                        {isStopping ? t('telegram.stopping') : t('telegram.stop')}
                                    </button>
                                )}
                            </div>
                        </div>

                        {!status?.isActive && status?.lastStartError && (
                            <div className="mb-6 p-4 rounded-2xl bg-red-50 border border-red-200 flex items-start gap-3">
                                <AlertCircle className="w-5 h-5 text-red-600 shrink-0 mt-0.5" />
                                <div>
                                    <p className="font-semibold text-red-900">{t('telegram.why_bot_not_started')}</p>
                                    <p className="text-sm text-red-800 mt-1">{status.lastStartError}</p>
                                </div>
                            </div>
                        )}

                        {!status?.usersConfigured && (
                            <div className="mb-6 p-4 rounded-2xl bg-amber-50 border border-amber-200 flex items-start gap-3">
                                <AlertCircle className="w-5 h-5 text-amber-700 shrink-0 mt-0.5" />
                                <div>
                                    <p className="font-semibold text-amber-900">{t('telegram.warning_no_users')}</p>
                                    <p className="text-sm text-amber-800 mt-1">{t('telegram.warning_no_users_desc')}</p>
                                </div>
                            </div>
                        )}
                    </>
                )}

                {hasSavedToken && status?.isActive && (
                    <div className="mb-6 p-5 rounded-2xl border border-slate-200 bg-white shadow-sm">
                        <p className="text-xs font-bold tracking-wide text-gray-500 uppercase mb-3">
                            {t('telegram.bot_identity_title')}
                        </p>
                        {isBotInfoError && (
                            <p className="text-sm text-red-700">{t('telegram.bot_identity_error')}</p>
                        )}
                        {isLoadingBotInfo && !isBotInfoError && (
                            <p className="text-sm text-gray-500">{t('telegram.bot_identity_loading')}</p>
                        )}
                        {!isLoadingBotInfo && !isBotInfoError && botInfo === null && (
                            <p className="text-sm text-gray-600">{t('telegram.bot_identity_unavailable')}</p>
                        )}
                        {!isLoadingBotInfo && !isBotInfoError && botInfo && (
                            <div className="flex flex-col sm:flex-row sm:items-center gap-4">
                                <div className="flex shrink-0 items-center gap-3">
                                    {botInfo.hasAvatar ? (
                                        <img
                                            src={`${getApiRoot()}/telegram/bot-avatar`}
                                            alt={botDisplayName(botInfo)}
                                            className="h-16 w-16 rounded-full object-cover border border-slate-200 bg-slate-100"
                                        />
                                    ) : (
                                        <span
                                            className={`flex h-16 w-16 shrink-0 items-center justify-center rounded-full text-xl font-bold text-white ${avatarColorClass(String(botInfo.id))}`}
                                        >
                                            {avatarLetter(botDisplayName(botInfo))}
                                        </span>
                                    )}
                                </div>
                                <div className="min-w-0 flex-1">
                                    <p className="font-bold text-gray-900 truncate">{botDisplayName(botInfo)}</p>
                                    {botInfo.username ? (
                                        <p className="text-sm text-gray-600 truncate">@{botInfo.username}</p>
                                    ) : null}
                                    <a
                                        href={botInfo.openTelegramUrl}
                                        target="_blank"
                                        rel="noreferrer"
                                        className="inline-flex items-center gap-1.5 mt-2 text-sm font-semibold text-emerald-700 hover:text-emerald-800 hover:underline"
                                    >
                                        {t('telegram.open_in_telegram')}
                                        <ExternalLink className="w-4 h-4 shrink-0" aria-hidden />
                                    </a>
                                </div>
                            </div>
                        )}
                    </div>
                )}

                <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 lg:gap-8">
                    <div className="lg:col-span-4 space-y-6">
                        <div>
                            <label className="block text-sm font-bold text-gray-800 mb-3">{t('telegram.bot_language')}</label>
                            <div className="flex flex-wrap gap-2">
                                <button
                                    type="button"
                                    onClick={() => {
                                        setBotLanguage('en');
                                        lastTokenSaveSnapRef.current = `${botToken.trim()}|en`;
                                        updateConfig({ language: 'en' });
                                    }}
                                    className={`px-5 py-2.5 rounded-full text-sm font-semibold border transition-all ${botLanguage === 'en' ? 'bg-white text-gray-900 border-gray-200 shadow-sm' : 'bg-slate-100 text-gray-600 border-transparent hover:bg-slate-200'}`}
                                >
                                    English
                                </button>
                                <button
                                    type="button"
                                    onClick={() => {
                                        setBotLanguage('he');
                                        lastTokenSaveSnapRef.current = `${botToken.trim()}|he`;
                                        updateConfig({ language: 'he' });
                                    }}
                                    className={`px-5 py-2.5 rounded-full text-sm font-semibold border transition-all ${botLanguage === 'he' ? 'bg-white text-gray-900 border-gray-200 shadow-sm' : 'bg-slate-100 text-gray-600 border-transparent hover:bg-slate-200'}`}
                                >
                                    עברית
                                </button>
                            </div>
                            <p className="text-xs text-gray-500 mt-2 leading-relaxed">{t('telegram.bot_language_help')}</p>
                        </div>

                        <div className="rounded-2xl border border-slate-200 bg-slate-50/80 p-4">
                            <div className="flex items-center gap-2 text-xs font-bold tracking-wide text-gray-500 uppercase mb-2">
                                <Info className="w-4 h-4 text-slate-500" aria-hidden />
                                {t('telegram.token_security_title')}
                            </div>
                            <p className="text-sm text-gray-600 leading-relaxed">
                                {t('telegram.token_security_line1')}{' '}
                                <span className="text-red-600 font-semibold">{t('telegram.token_security_stop')}</span>{' '}
                                {t('telegram.token_security_line2')}
                            </p>
                        </div>

                        {!status?.isActive && (
                            <div className="space-y-4">
                                <div>
                                    <label className="block text-sm font-bold text-gray-800 mb-2">
                                        {t('telegram.bot_token')}
                                        <span className="text-red-600"> *</span>
                                    </label>
                                    <div className="flex flex-col sm:flex-row gap-2">
                                        <input
                                            type={showTokenMask ? 'text' : 'password'}
                                            readOnly={showTokenMask}
                                            autoComplete="off"
                                            value={tokenInputValue}
                                            onFocus={() => setTokenFieldFocused(true)}
                                            onBlur={() => {
                                                if (!botToken.trim()) setTokenFieldFocused(false);
                                            }}
                                            onChange={(e) => setBotToken(e.target.value)}
                                            placeholder={t('telegram.token_placeholder')}
                                            className="flex-1 px-4 py-2.5 bg-white border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/40 shadow-sm"
                                        />
                                        {isUpdating && (
                                            <span className="text-xs text-emerald-700 font-semibold self-center whitespace-nowrap px-2">
                                                {t('telegram.saving')}
                                            </span>
                                        )}
                                    </div>
                                    <p className="text-xs text-gray-600 mt-2">
                                        {t('telegram.token_help')}{' '}
                                        <a href="https://t.me/botfather" target="_blank" rel="noreferrer" className="text-emerald-700 hover:underline font-semibold">
                                            @BotFather
                                        </a>
                                    </p>
                                </div>

                                {botToken.trim() && !showTokenMask && (
                                    <div>
                                        <label className="block text-sm font-bold text-gray-800 mb-2">{t('telegram.test_connection')}</label>
                                        <div className="flex flex-col sm:flex-row gap-2">
                                            <input
                                                type="text"
                                                value={chatId}
                                                onChange={(e) => setChatId(e.target.value)}
                                                placeholder={t('telegram.chat_id_placeholder')}
                                                className="flex-1 px-4 py-2.5 bg-white border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/40 shadow-sm"
                                            />
                                            <button
                                                type="button"
                                                onClick={() => testConnection()}
                                                disabled={isTesting || !botToken.trim() || !chatId}
                                                className="bg-emerald-600 text-white px-4 py-2.5 rounded-xl hover:bg-emerald-700 disabled:bg-gray-400 font-semibold whitespace-nowrap"
                                            >
                                                {isTesting ? t('telegram.testing') : t('telegram.test')}
                                            </button>
                                        </div>
                                    </div>
                                )}
                            </div>
                        )}
                    </div>

                    <div className="lg:col-span-8 space-y-4">
                        <div>
                            <h3 className="text-base font-bold text-gray-900">{t('telegram.users_management')}</h3>
                            <p className="text-sm text-gray-500 mt-1">{t('telegram.users_management_help')}</p>
                            <p className="text-xs text-gray-600 mt-2 max-w-3xl">{t('telegram.accounts_routing_help')}</p>
                        </div>

                        <div className="flex flex-col sm:flex-row gap-2">
                            <input
                                type="text"
                                value={newUserId}
                                onChange={(e) => setNewUserId(e.target.value)}
                                placeholder={t('telegram.user_id_placeholder')}
                                className="flex-1 px-4 py-2.5 bg-white border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/40 shadow-sm"
                            />
                            <button
                                type="button"
                                onClick={handleAddUser}
                                disabled={!newUserId.trim() || isUpdatingAllowedUser}
                                className="bg-emerald-600 text-white px-5 py-2.5 rounded-xl hover:bg-emerald-700 disabled:bg-gray-400 font-semibold whitespace-nowrap"
                            >
                                {isUpdatingAllowedUser ? t('telegram.adding') : t('telegram.add')}
                            </button>
                        </div>

                        <div className="overflow-x-auto border border-gray-200 rounded-2xl bg-white">
                            <table className="min-w-full text-sm">
                                <thead className="bg-slate-50 border-b border-gray-200">
                                    <tr>
                                        <th className="text-left px-4 py-3 font-bold text-gray-700 text-xs uppercase tracking-wide">
                                            {t('telegram.col_username')}
                                        </th>
                                        <th className="text-center px-3 py-3 font-bold text-gray-700 text-xs uppercase tracking-wide w-28">
                                            {t('telegram.col_allowed_chat')}
                                        </th>
                                        <th className="text-center px-3 py-3 font-bold text-gray-700 text-xs uppercase tracking-wide w-28">
                                            {t('telegram.col_notification')}
                                        </th>
                                        <th className="text-left px-3 py-3 font-bold text-gray-700 text-xs uppercase tracking-wide min-w-[10rem]">
                                            {t('telegram.col_accounts')}
                                        </th>
                                        <th className="text-right px-4 py-3 font-bold text-gray-700 text-xs uppercase tracking-wide w-28">
                                            {t('telegram.col_actions')}
                                        </th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {userRows.length === 0 && (
                                        <tr>
                                            <td colSpan={5} className="px-4 py-10 text-center text-gray-500">
                                                {t('telegram.no_users')}
                                            </td>
                                        </tr>
                                    )}
                                    {userRows.map((id) => {
                                        const isAllowed = allowedUsers.includes(id);
                                        const isNotify = ((notificationChats as string[]) || []).includes(id);
                                        const label = getLabel(id);
                                        const letter = avatarLetter(label);
                                        const busyTest = sendingTestChatId === id;
                                        return (
                                            <tr key={id} className="border-b border-gray-100 last:border-b-0">
                                                <td className="px-4 py-3">
                                                    <div className="flex items-center gap-3 min-w-0">
                                                        <span
                                                            className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-sm font-bold text-white ${avatarColorClass(id)}`}
                                                        >
                                                            {letter}
                                                        </span>
                                                        <div className="min-w-0">
                                                            <div className="font-medium text-gray-900 truncate">{label}</div>
                                                            {label !== id && <div className="text-xs text-gray-500 truncate">{id}</div>}
                                                        </div>
                                                    </div>
                                                </td>
                                                <td className="px-3 py-3 text-center">
                                                    <input
                                                        type="checkbox"
                                                        checked={isAllowed}
                                                        onChange={(e) => setAllowedUser({ id, enabled: e.target.checked })}
                                                        className="w-4 h-4 rounded border-gray-300 text-emerald-600 focus:ring-emerald-500"
                                                    />
                                                </td>
                                                <td className="px-3 py-3 text-center">
                                                    <input
                                                        type="checkbox"
                                                        checked={isNotify}
                                                        onChange={(e) => setNotificationChat({ id, enabled: e.target.checked })}
                                                        className="w-4 h-4 rounded border-gray-300 text-emerald-600 focus:ring-emerald-500"
                                                    />
                                                </td>
                                                <td className="px-3 py-3">
                                                    <input
                                                        type="text"
                                                        value={accountsByChatInput[id] ?? ''}
                                                        onChange={(e) =>
                                                            setAccountsByChatInput((prev) => ({
                                                                ...prev,
                                                                [id]: e.target.value,
                                                            }))
                                                        }
                                                        onBlur={(e) => {
                                                            const next = { ...accountsByChatInput, [id]: e.target.value };
                                                            setAccountsByChatInput(next);
                                                            updateConfig({
                                                                notificationAccountsByChatId:
                                                                    parseAccountsMapFromInput(next, userRows),
                                                            });
                                                        }}
                                                        placeholder="131, 5326, *"
                                                        disabled={isUpdating}
                                                        className="w-full min-w-[8rem] max-w-[14rem] px-2 py-1.5 text-xs bg-white border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500/40"
                                                    />
                                                </td>
                                                <td className="px-4 py-3 text-right">
                                                    <div className="inline-flex items-center justify-end gap-1">
                                                        <button
                                                            type="button"
                                                            title={t('telegram.send_test_to_user')}
                                                            disabled={!status?.isActive || busyTest}
                                                            onClick={() => sendTestToChat(id)}
                                                            className="p-2 rounded-lg text-slate-600 hover:bg-slate-100 hover:text-emerald-700 disabled:opacity-40 disabled:hover:bg-transparent"
                                                        >
                                                            <Send className="w-4 h-4" />
                                                        </button>
                                                        <button
                                                            type="button"
                                                            title={t('telegram.delete_user')}
                                                            disabled={isRemovingUser}
                                                            onClick={() => removeUserRow(id)}
                                                            className="p-2 rounded-lg text-slate-600 hover:bg-red-50 hover:text-red-600 disabled:opacity-40"
                                                        >
                                                            <Trash2 className="w-4 h-4" />
                                                        </button>
                                                    </div>
                                                </td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>

                        {userRows.length > 0 && (
                            <button
                                type="button"
                                onClick={downloadUserManifest}
                                className="text-emerald-700 hover:text-emerald-800 font-bold text-xs uppercase tracking-wider"
                            >
                                {t('telegram.download_user_manifest')}
                            </button>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}
