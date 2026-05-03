import { useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Radio } from 'lucide-react';
import { getApiRoot } from '../lib/api';
import type { MqttConfig } from '@app/shared';

interface MqttSettingsProps {
    isInline?: boolean;
}

export function MqttSettings({ isInline }: MqttSettingsProps) {
    const { t } = useTranslation();
    const queryClient = useQueryClient();
    const enabled = isInline !== false;

    const [form, setForm] = useState<Partial<MqttConfig>>({});
    const [notification, setNotification] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

    const showNotification = useCallback((type: 'success' | 'error', message: string) => {
        setNotification({ type, message });
        setTimeout(() => setNotification(null), 5000);
    }, []);

    const { data: config, isLoading } = useQuery({
        queryKey: ['mqttConfig'],
        queryFn: async () => {
            const res = await fetch(`${getApiRoot()}/mqtt/config`);
            const json = await res.json();
            if (!json.success) throw new Error(json.error);
            return json.data as MqttConfig;
        },
        enabled,
    });

    useEffect(() => {
        if (config) {
            setForm({
                ...config,
                password:
                    config.password && String(config.password).startsWith('***') ? '' : config.password,
            });
        }
    }, [config]);

    const { data: status } = useQuery({
        queryKey: ['mqttStatus'],
        queryFn: async () => {
            const res = await fetch(`${getApiRoot()}/mqtt/status`);
            const json = await res.json();
            return json.data as { connected: boolean; lastError: string | null; brokerHost: string | null };
        },
        enabled,
        refetchInterval: 5000,
    });

    const saveMutation = useMutation({
        mutationFn: async (body: Partial<MqttConfig>) => {
            const res = await fetch(`${getApiRoot()}/mqtt/config`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(body),
            });
            const json = await res.json();
            if (!json.success) throw new Error(json.error || 'Save failed');
            return json;
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['mqttConfig'] });
            queryClient.invalidateQueries({ queryKey: ['mqttStatus'] });
            queryClient.invalidateQueries({ queryKey: ['notificationChannels'] });
            showNotification('success', t('mqtt.save_ok'));
        },
        onError: (e: Error) => showNotification('error', e.message),
    });

    const testMutation = useMutation({
        mutationFn: async () => {
            const res = await fetch(`${getApiRoot()}/mqtt/test`, { method: 'POST' });
            const json = await res.json();
            if (!json.success) throw new Error(json.error || 'Test failed');
        },
        onSuccess: () => showNotification('success', t('mqtt.test_ok')),
        onError: (e: Error) => showNotification('error', e.message),
    });

    const updateField = (key: keyof MqttConfig, value: unknown) => {
        setForm((prev) => ({ ...prev, [key]: value }));
    };

    const onSave = () => saveMutation.mutate(form);

    if (isLoading && !config) {
        return (
            <div className="p-6 text-sm text-gray-500">{t('common.loading')}</div>
        );
    }

    return (
        <div className="space-y-6 max-w-2xl">
            {notification && (
                <div
                    className={`rounded-xl px-4 py-2 text-sm font-medium ${
                        notification.type === 'success' ? 'bg-emerald-50 text-emerald-800' : 'bg-red-50 text-red-800'
                    }`}
                >
                    {notification.message}
                </div>
            )}

            <div className="flex items-center gap-3 p-4 bg-white rounded-2xl border border-gray-100 shadow-sm">
                <Radio className={`w-8 h-8 ${status?.connected ? 'text-emerald-500' : 'text-gray-300'}`} />
                <div>
                    <div className="text-sm font-bold text-gray-900">{t('mqtt.connection')}</div>
                    <div className="text-xs text-gray-500">
                        {status?.connected ? t('mqtt.connected') : t('mqtt.disconnected')}
                        {status?.brokerHost ? ` · ${status.brokerHost}` : ''}
                        {status?.lastError ? ` · ${status.lastError}` : ''}
                    </div>
                </div>
            </div>

            <div className="grid gap-4 p-4 bg-white rounded-2xl border border-gray-100 shadow-sm">
                <label className="flex items-center gap-2">
                    <input
                        type="checkbox"
                        checked={!!form.enabled}
                        onChange={(e) => updateField('enabled', e.target.checked)}
                        className="rounded border-gray-300"
                    />
                    <span className="text-sm font-semibold text-gray-800">{t('mqtt.enabled')}</span>
                </label>

                <label className="block">
                    <span className="text-xs font-bold text-gray-600">{t('mqtt.broker_url')}</span>
                    <input
                        className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
                        placeholder="mqtt://localhost or mqtts://"
                        value={form.brokerUrl || ''}
                        onChange={(e) => updateField('brokerUrl', e.target.value)}
                    />
                </label>

                <div className="grid grid-cols-2 gap-3">
                    <label className="block">
                        <span className="text-xs font-bold text-gray-600">{t('mqtt.port')}</span>
                        <input
                            type="number"
                            className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
                            placeholder="1883"
                            value={form.port ?? ''}
                            onChange={(e) =>
                                updateField('port', e.target.value ? parseInt(e.target.value, 10) : undefined)
                            }
                        />
                    </label>
                    <label className="flex items-end gap-2 pb-2">
                        <input
                            type="checkbox"
                            checked={!!form.useTls}
                            onChange={(e) => updateField('useTls', e.target.checked)}
                            className="rounded border-gray-300"
                        />
                        <span className="text-sm text-gray-700">{t('mqtt.use_tls')}</span>
                    </label>
                </div>

                <label className="block">
                    <span className="text-xs font-bold text-gray-600">{t('mqtt.notify_topic')}</span>
                    <input
                        className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm font-mono"
                        placeholder="bank-scraper/notify"
                        value={form.topic || ''}
                        onChange={(e) => updateField('topic', e.target.value)}
                    />
                </label>

                <label className="block">
                    <span className="text-xs font-bold text-gray-600">{t('mqtt.client_id')}</span>
                    <input
                        className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
                        value={form.clientId || ''}
                        onChange={(e) => updateField('clientId', e.target.value)}
                    />
                </label>

                <div className="grid grid-cols-2 gap-3">
                    <label className="block">
                        <span className="text-xs font-bold text-gray-600">{t('mqtt.username')}</span>
                        <input
                            className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
                            autoComplete="off"
                            value={form.username || ''}
                            onChange={(e) => updateField('username', e.target.value)}
                        />
                    </label>
                    <label className="block">
                        <span className="text-xs font-bold text-gray-600">{t('mqtt.password')}</span>
                        <input
                            type="password"
                            className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
                            autoComplete="new-password"
                            placeholder={config?.password?.startsWith?.('***') ? '••••••••' : ''}
                            value={form.password || ''}
                            onChange={(e) => updateField('password', e.target.value)}
                        />
                    </label>
                </div>

                <label className="flex items-center gap-2">
                    <input
                        type="checkbox"
                        checked={form.rejectUnauthorized !== false}
                        onChange={(e) => updateField('rejectUnauthorized', e.target.checked)}
                        className="rounded border-gray-300"
                    />
                    <span className="text-sm text-gray-700">{t('mqtt.reject_unauthorized')}</span>
                </label>

                <div className="border-t border-gray-100 pt-3 space-y-2">
                    <div className="text-xs font-bold text-gray-500 uppercase">{t('mqtt.lwt_section')}</div>
                    <label className="block">
                        <span className="text-xs font-bold text-gray-600">{t('mqtt.will_topic')}</span>
                        <input
                            className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm font-mono"
                            placeholder={t('mqtt.will_topic_placeholder')}
                            value={form.willTopic || ''}
                            onChange={(e) => updateField('willTopic', e.target.value)}
                        />
                    </label>
                    <label className="block">
                        <span className="text-xs font-bold text-gray-600">{t('mqtt.will_message')}</span>
                        <input
                            className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
                            value={form.willMessage ?? ''}
                            onChange={(e) => updateField('willMessage', e.target.value)}
                        />
                    </label>
                </div>

                <div className="flex flex-wrap gap-2 pt-2">
                    <button
                        type="button"
                        onClick={() => onSave()}
                        disabled={saveMutation.isPending}
                        className="px-4 py-2 rounded-xl bg-indigo-600 text-white text-sm font-bold hover:bg-indigo-700 disabled:opacity-50"
                    >
                        {t('common.save')}
                    </button>
                    <button
                        type="button"
                        onClick={() => testMutation.mutate()}
                        disabled={testMutation.isPending || !form.enabled}
                        className="px-4 py-2 rounded-xl border border-gray-200 text-sm font-bold text-gray-700 hover:bg-gray-50 disabled:opacity-50"
                    >
                        {t('mqtt.test_publish')}
                    </button>
                </div>
            </div>
        </div>
    );
}
