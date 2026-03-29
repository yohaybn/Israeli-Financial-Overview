import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useEnvConfig, useUpdateEnvConfig, useRestartServer } from '../hooks/useConfig';
import { CollapsibleCard } from './CollapsibleCard';

const PATH_KEYS = ['PORT', 'DATA_DIR'] as const;

/**
 * Server listen port and data directory (runtime-settings.json). Formerly under Environment.
 */
export function MaintenanceServerPathsCard() {
    const { t } = useTranslation();
    const { data: env, isLoading } = useEnvConfig();
    const { mutate: updateEnv, isPending: isUpdating } = useUpdateEnvConfig();
    const { mutate: restartServer, isPending: isRestarting } = useRestartServer();

    const [form, setForm] = useState<Record<string, string>>({});

    useEffect(() => {
        if (env) setForm(env);
    }, [env]);

    const handleChange = (key: string, value: string) => {
        setForm((prev) => ({ ...prev, [key]: value }));
    };

    const save = () => {
        if (!env) return;
        const next = { ...env };
        for (const key of PATH_KEYS) {
            if (form[key] !== undefined) next[key] = form[key];
        }
        updateEnv(next, {
            onSuccess: () => {
                if (window.confirm(t('env.confirm_restart_after_save'))) {
                    restartServer(undefined, {
                        onSuccess: () => alert(t('env.restart_in_progress')),
                        onError: (err: any) =>
                            alert(t('env.restart_failed', { error: err.message || t('common.unknown_error') })),
                    });
                }
            },
            onError: (err: any) => {
                alert(t('env.save_failed', { error: err.message || t('common.unknown_error') }));
            },
        });
    };

    if (isLoading) {
        return (
            <div className="bg-white rounded-2xl p-6 border border-gray-100 text-sm text-gray-500">{t('common.loading')}</div>
        );
    }

    return (
        <CollapsibleCard
            title={t('maintenance.server_paths_title')}
            subtitle={t('maintenance.server_paths_subtitle')}
            defaultOpen
            bodyClassName="px-6 pb-6 pt-0 space-y-4"
        >
            <p className="text-sm text-slate-600 bg-slate-50 border border-slate-100 rounded-xl px-4 py-3 leading-relaxed">
                {t('env.profile_encryption_note')}
            </p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-4">
                <div className="space-y-1">
                    <label className="text-sm font-bold text-gray-700 block">{t('env.fields.port.label')}</label>
                    <input
                        type="text"
                        value={form.PORT || ''}
                        onChange={(e) => handleChange('PORT', e.target.value)}
                        className="w-full px-4 py-2.5 bg-white border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-amber-500 outline-none"
                        placeholder={t('env.enter_value', { key: 'PORT' })}
                    />
                    <p className="text-[11px] text-gray-400 leading-tight">{t('env.fields.port.help')}</p>
                </div>
                <div className="space-y-1">
                    <label className="text-sm font-bold text-gray-700 block">{t('env.fields.data_dir.label')}</label>
                    <input
                        type="text"
                        value={form.DATA_DIR || ''}
                        onChange={(e) => handleChange('DATA_DIR', e.target.value)}
                        className="w-full px-4 py-2.5 bg-white border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-amber-500 outline-none"
                        placeholder={t('env.enter_value', { key: 'DATA_DIR' })}
                    />
                    <p className="text-[11px] text-gray-400 leading-tight">{t('env.fields.data_dir.help')}</p>
                </div>
            </div>
            <p className="text-xs text-amber-700 bg-amber-50 border border-amber-100 rounded-lg px-3 py-2">{t('env.restart_required_hint')}</p>
            <div className="flex flex-wrap gap-2 justify-end pt-1">
                <button
                    type="button"
                    onClick={() =>
                        restartServer(undefined, {
                            onSuccess: () => alert(t('env.restart_in_progress')),
                            onError: (err: any) =>
                                alert(t('env.restart_failed', { error: err.message || t('common.unknown_error') })),
                        })
                    }
                    disabled={isRestarting}
                    className="px-4 py-2 bg-amber-100 text-amber-800 rounded-xl text-sm font-bold hover:bg-amber-200 disabled:opacity-50"
                >
                    {isRestarting ? t('env.restarting') : t('env.restart_server')}
                </button>
                <button
                    type="button"
                    onClick={save}
                    disabled={isUpdating}
                    className="px-6 py-2 bg-amber-600 text-white rounded-xl text-sm font-bold hover:bg-amber-700 disabled:opacity-50"
                >
                    {isUpdating ? t('common.saving') : t('env.save_settings')}
                </button>
            </div>
        </CollapsibleCard>
    );
}
