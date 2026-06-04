import { useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Radio } from 'lucide-react';
import { getApiRoot } from '../lib/api';
import type { MqttConfig } from '@app/shared';

/** Defaults for empty / new MQTT config (aligns with server fallbacks where applicable). */
const MQTT_FORM_DEFAULTS: Partial<MqttConfig> = {
    enabled: false,
    brokerUrl: '',
    useTls: false,
    rejectUnauthorized: true,
    topic: 'bank_scraper/notify',
    commandTopic: 'bank_scraper/command',
    commandResponseTopic: 'bank_scraper/command/response',
    clientId: '',
    username: '',
    willTopic: 'bank_scraper/status',
    willMessage: 'offline',
    deviceId: 'bank_scraper',
    discoveryPrefix: 'homeassistant',
    enableHaDiscovery: false,
    stateTopicPrefix: 'bank_scraper/state',
};

function mergeConfigIntoForm(api: MqttConfig): Partial<MqttConfig> {
    const merged: Partial<MqttConfig> = { ...MQTT_FORM_DEFAULTS, ...api };
    if (!String(merged.topic ?? '').trim()) {
        merged.topic = MQTT_FORM_DEFAULTS.topic;
    }
    if (merged.willMessage === undefined || merged.willMessage === null || !String(merged.willMessage).trim()) {
        merged.willMessage = MQTT_FORM_DEFAULTS.willMessage;
    }
    if (merged.rejectUnauthorized === undefined) {
        merged.rejectUnauthorized = MQTT_FORM_DEFAULTS.rejectUnauthorized;
    }
    if (merged.enabled === undefined) {
        merged.enabled = MQTT_FORM_DEFAULTS.enabled;
    }
    if (merged.useTls === undefined) {
        merged.useTls = MQTT_FORM_DEFAULTS.useTls;
    }
    merged.password =
        api.password && String(api.password).startsWith('***') ? '' : api.password ?? '';
    merged.commandSecret =
        api.commandSecret && String(api.commandSecret).startsWith('***') ? '' : api.commandSecret ?? '';
    return merged;
}

interface MqttSettingsProps {
    isInline?: boolean;
}

export function MqttSettings({ isInline }: MqttSettingsProps) {
    const { t } = useTranslation();
    const queryClient = useQueryClient();
    const enabled = isInline !== false;

    const [form, setForm] = useState<Partial<MqttConfig>>(() => ({ ...MQTT_FORM_DEFAULTS }));
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
            setForm(mergeConfigIntoForm(config));
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

    const { data: haPresets } = useQuery({
        queryKey: ['mqttHaPresets'],
        queryFn: async () => {
            const res = await fetch(`${getApiRoot()}/mqtt/ha-presets`);
            const json = await res.json();
            if (!json.success) throw new Error(json.error);
            return json.data as {
                isHomeAssistantAddon: boolean;
                preset: Partial<MqttConfig>;
                exampleScrapePayload: string;
            };
        },
        enabled,
    });

    const applyHaPreset = () => {
        if (!haPresets?.preset) return;
        setForm((prev) => ({
            ...prev,
            ...mergeConfigIntoForm(haPresets.preset as MqttConfig),
            enabled: true,
        }));
        showNotification('success', t('mqtt.ha_preset_applied'));
    };

    const saveMutation = useMutation({
        mutationFn: async (body: Partial<MqttConfig>) => {
            const res = await fetch(`${getApiRoot()}/mqtt/config`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(body),
            });
            const json = await res.json();
            if (!json.success) throw new Error(json.error || t('mqtt.errors.save_failed'));
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
            if (!json.success) throw new Error(json.error || t('mqtt.errors.test_failed'));
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

            <div className="flex flex-wrap gap-2 p-4 bg-indigo-50 rounded-2xl border border-indigo-100">
                <button
                    type="button"
                    onClick={applyHaPreset}
                    className="px-4 py-2 rounded-xl bg-white border border-indigo-200 text-sm font-bold text-indigo-800 hover:bg-indigo-100"
                >
                    {t('mqtt.ha_preset_button')}
                </button>
                {haPresets?.isHomeAssistantAddon && (
                    <span className="text-xs text-indigo-700 self-center">{t('mqtt.ha_addon_detected')}</span>
                )}
                <a
                    href="https://github.com/yohaybn/Israeli-Financial-Overview/blob/main/docs/HOME_ASSISTANT.md"
                    target="_blank"
                    rel="noreferrer"
                    className="text-xs text-indigo-600 underline self-center"
                >
                    {t('mqtt.ha_guide_link')}
                </a>
            </div>

            <div className="grid gap-4 p-4 bg-white rounded-2xl border border-gray-100 shadow-sm">
                <label className="flex items-center gap-2">
                    <input
                        type="checkbox"
                        checked={!!form.enableHaDiscovery}
                        onChange={(e) => updateField('enableHaDiscovery', e.target.checked)}
                        className="rounded border-gray-300"
                    />
                    <span className="text-sm font-semibold text-gray-800">{t('mqtt.enable_ha_discovery')}</span>
                </label>
                {form.enableHaDiscovery && !form.commandSecret?.trim() && (
                    <p className="text-xs text-amber-700 bg-amber-50 rounded-lg px-3 py-2">{t('mqtt.ha_discovery_secret_warning')}</p>
                )}

                <div className="grid grid-cols-2 gap-3">
                    <label className="block">
                        <span className="text-xs font-bold text-gray-600">{t('mqtt.device_id')}</span>
                        <input
                            className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm font-mono"
                            value={form.deviceId || ''}
                            onChange={(e) => updateField('deviceId', e.target.value)}
                        />
                    </label>
                    <label className="block">
                        <span className="text-xs font-bold text-gray-600">{t('mqtt.state_topic_prefix')}</span>
                        <input
                            className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm font-mono"
                            value={form.stateTopicPrefix || ''}
                            onChange={(e) => updateField('stateTopicPrefix', e.target.value)}
                        />
                    </label>
                </div>

                {haPresets?.exampleScrapePayload && (
                    <div className="rounded-lg bg-gray-50 border border-gray-100 p-3">
                        <div className="text-xs font-bold text-gray-500 mb-1">{t('mqtt.example_scrape_payload')}</div>
                        <pre className="text-xs font-mono text-gray-700 whitespace-pre-wrap break-all">{haPresets.exampleScrapePayload}</pre>
                    </div>
                )}

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
                        placeholder={t('mqtt.broker_url_placeholder')}
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
                            placeholder={t('mqtt.port_placeholder')}
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
                        placeholder={MQTT_FORM_DEFAULTS.topic}
                        value={form.topic || ''}
                        onChange={(e) => updateField('topic', e.target.value)}
                    />
                    <p className="mt-1 text-xs text-gray-500">{t('mqtt.notify_topic_hint')}</p>
                </label>

                <div className="border-t border-gray-100 pt-3 space-y-3">
                    <div className="text-xs font-bold text-gray-500 uppercase">{t('mqtt.commands_section')}</div>
                    <label className="block">
                        <span className="text-xs font-bold text-gray-600">{t('mqtt.command_topic')}</span>
                        <input
                            className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm font-mono"
                            placeholder={t('mqtt.command_topic_placeholder')}
                            value={form.commandTopic || ''}
                            onChange={(e) => updateField('commandTopic', e.target.value)}
                        />
                    </label>
                    <label className="block">
                        <span className="text-xs font-bold text-gray-600">{t('mqtt.command_response_topic')}</span>
                        <input
                            className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm font-mono"
                            placeholder={t('mqtt.command_response_placeholder')}
                            value={form.commandResponseTopic || ''}
                            onChange={(e) => updateField('commandResponseTopic', e.target.value)}
                        />
                    </label>
                    <label className="block">
                        <span className="text-xs font-bold text-gray-600">{t('mqtt.command_secret')}</span>
                        <input
                            type="password"
                            className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
                            autoComplete="new-password"
                            placeholder={
                                config?.commandSecret?.startsWith?.('***') ? t('mqtt.mask_placeholder') : ''
                            }
                            value={form.commandSecret || ''}
                            onChange={(e) => updateField('commandSecret', e.target.value)}
                        />
                        <p className="mt-1 text-xs text-gray-500">{t('mqtt.command_secret_hint')}</p>
                    </label>
                </div>

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
                            placeholder={config?.password?.startsWith?.('***') ? t('mqtt.mask_placeholder') : ''}
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
                            placeholder={MQTT_FORM_DEFAULTS.willMessage ?? 'offline'}
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
                        disabled={testMutation.isPending || !form.enabled || !form.topic?.trim()}
                        className="px-4 py-2 rounded-xl border border-gray-200 text-sm font-bold text-gray-700 hover:bg-gray-50 disabled:opacity-50"
                        title={!form.topic?.trim() ? t('mqtt.test_requires_notify_topic') : undefined}
                    >
                        {t('mqtt.test_publish')}
                    </button>
                </div>
            </div>
        </div>
    );
}
