import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useEnvConfig, useUpdateEnvConfig, useRestartServer } from '../hooks/useConfig';

export function EnvironmentSettings() {
    const { t } = useTranslation();
    const { data: env, isLoading } = useEnvConfig();
    const { mutate: updateEnv, isPending: isUpdating } = useUpdateEnvConfig();
    const { mutate: restartServer, isPending: isRestarting } = useRestartServer();

    const [form, setForm] = useState<Record<string, string>>({});
    const [errors, setErrors] = useState<Record<string, string>>({});

    useEffect(() => {
        if (env) {
            setForm(env);
        }
    }, [env]);

    const handleChange = (key: string, value: string) => {
        setForm(prev => ({ ...prev, [key]: value }));
        // Clear error when user changes value
        if (errors[key]) {
            setErrors(prev => {
                const newErrors = { ...prev };
                delete newErrors[key];
                return newErrors;
            });
        }
    };

    const validate = () => {
        const newErrors: Record<string, string> = {};

        // Validate ENCRYPTION_KEY if changed and not masked
        if (form.ENCRYPTION_KEY && !form.ENCRYPTION_KEY.includes('***')) {
            if (!/^[0-9a-fA-F]{64}$/.test(form.ENCRYPTION_KEY)) {
                newErrors.ENCRYPTION_KEY = t('env.validation.encryption_key_hex_64');
            }
        }

        setErrors(newErrors);
        return Object.keys(newErrors).length === 0;
    };

    const handleSave = () => {
        if (!validate()) return;

        updateEnv(form, {
            onSuccess: () => {
                if (window.confirm(t('env.confirm_restart_after_save'))) {
                    handleRestart();
                }
            },
            onError: (err: any) => {
                alert(t('env.save_failed', { error: err.message || t('common.unknown_error') }));
            }
        });
    };

    const handleRestart = () => {
        restartServer(undefined, {
            onSuccess: () => {
                alert(t('env.restart_in_progress'));
                // Optional: countdown or auto-refresh
            },
            onError: (err: any) => {
                alert(t('env.restart_failed', { error: err.message || t('common.unknown_error') }));
            }
        });
    };

    if (isLoading) {
        return <div className="p-8 text-center text-gray-500">{t('common.loading')}</div>;
    }

    const fieldGroups = [
        {
            titleKey: 'env.groups.ai_external',
            fields: [
                {
                    key: 'GEMINI_API_KEY',
                    labelKey: 'env.fields.gemini_api_key.label',
                    helpKey: 'env.fields.gemini_api_key.help',
                    link: { textKey: 'env.links.google_ai_studio', url: 'https://aistudio.google.com/app/apikey' }
                }
            ]
        },
        {
            titleKey: 'env.groups.google_integration',
            fields: [
                {
                    key: 'GOOGLE_CLIENT_ID',
                    labelKey: 'env.fields.google_client_id.label',
                    helpKey: 'env.fields.google_client_id.help',
                    link: { textKey: 'env.links.google_cloud_console', url: 'https://console.cloud.google.com/apis/credentials' }
                },
                {
                    key: 'GOOGLE_CLIENT_SECRET',
                    labelKey: 'env.fields.google_client_secret.label',
                    helpKey: 'env.fields.google_client_secret.help'
                },
                {
                    key: 'GOOGLE_REDIRECT_URI',
                    labelKey: 'env.fields.google_redirect_uri.label',
                    helpKey: 'env.fields.google_redirect_uri.help',
                    helpArgs: { example: `${window.location.origin}/api/auth/google/callback` }
                },
                {
                    key: 'DRIVE_FOLDER_ID',
                    labelKey: 'env.fields.drive_folder_id.label',
                    helpKey: 'env.fields.drive_folder_id.help'
                }
            ]
        },
        {
            titleKey: 'env.groups.system_security',
            fields: [
                {
                    key: 'ENCRYPTION_KEY',
                    labelKey: 'env.fields.encryption_key.label',
                    helpKey: 'env.fields.encryption_key.help'
                },
                {
                    key: 'PORT',
                    labelKey: 'env.fields.port.label',
                    helpKey: 'env.fields.port.help'
                },
                {
                    key: 'DATA_DIR',
                    labelKey: 'env.fields.data_dir.label',
                    helpKey: 'env.fields.data_dir.help'
                }
            ]
        }
    ];

    const generateRandomKey = (key: string) => {
        const randomBytes = new Uint8Array(32);
        window.crypto.getRandomValues(randomBytes);
        const hexKey = Array.from(randomBytes).map(b => b.toString(16).padStart(2, '0')).join('');
        handleChange(key, hexKey);
    };

    return (
        <div className="space-y-8">
            <div className="bg-white rounded-2xl p-6 shadow-sm border border-gray-100">
                <div className="flex items-center justify-between mb-6">
                    <div>
                        <h3 className="text-lg font-bold text-gray-800">{t('env.title')}</h3>
                        <p className="text-sm text-gray-500 mt-1">{t('env.subtitle')}</p>
                    </div>
                </div>

                <div className="space-y-8">
                    {fieldGroups.map(group => (
                        <div key={group.titleKey} className="space-y-4">
                            <h4 className="text-xs font-black uppercase tracking-wider text-gray-400 border-b border-gray-100 pb-2">
                                {t(group.titleKey)}
                            </h4>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-4">
                                {group.fields.map(field => (
                                    <div key={field.key} className="space-y-1">
                                        <div className="flex items-center justify-between">
                                            <label className="text-sm font-bold text-gray-700 block">{field.labelKey ? t(field.labelKey) : field.key}</label>
                                        </div>
                                        <div className="flex gap-2">
                                            <input
                                                type={field.key.includes('KEY') || field.key.includes('SECRET') ? 'password' : 'text'}
                                                value={form[field.key] || ''}
                                                onChange={(e) => handleChange(field.key, e.target.value)}
                                                className={`w-full px-4 py-2.5 bg-white border rounded-xl text-sm transition-all focus:ring-2 focus:ring-blue-500 outline-none shadow-sm ${errors[field.key] ? 'border-red-500 bg-red-50' : 'border-gray-200'}`}
                                                placeholder={t('env.enter_value', { key: field.key })}
                                            />
                                            {field.key === 'ENCRYPTION_KEY' && (
                                                <button
                                                    onClick={() => generateRandomKey(field.key)}
                                                    className="px-3 py-2 bg-gray-100 text-gray-600 rounded-xl text-xs font-bold hover:bg-gray-200 transition-all active:scale-95 border border-gray-200"
                                                    title={t('env.generate_random_key')}
                                                >
                                                    {t('common.generate')}
                                                </button>
                                            )}
                                        </div>
                                        <div className="flex flex-col gap-1">
                                            {errors[field.key] && <p className="text-xs text-red-600 font-medium">{errors[field.key]}</p>}
                                            {field.helpKey && (
                                                <p className="text-[11px] text-gray-400 leading-tight">
                                                    {t(field.helpKey, field.helpArgs)}
                                                    {field.link && (
                                                        <a
                                                            href={field.link.url}
                                                            target="_blank"
                                                            rel="noopener noreferrer"
                                                            className="text-blue-500 hover:underline font-medium"
                                                        >
                                                            {field.link.textKey ? t(field.link.textKey) : ''}
                                                        </a>
                                                    )}
                                                </p>
                                            )}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    ))}
                </div>

                <div className="mt-8 pt-6 border-t border-gray-100 flex items-center justify-between">
                    <div className="text-xs text-amber-600 font-medium bg-amber-50 px-3 py-1.5 rounded-lg border border-amber-100 max-w-sm">
                        {t('env.restart_required_hint')}
                    </div>
                    <div className="flex gap-3">
                        <button
                            onClick={handleRestart}
                            disabled={isRestarting}
                            className="px-6 py-2.5 bg-amber-100 text-amber-700 rounded-xl text-sm font-bold hover:bg-amber-200 transition-all active:scale-95 disabled:opacity-50"
                        >
                            {isRestarting ? t('env.restarting') : t('env.restart_server')}
                        </button>
                        <button
                            onClick={handleSave}
                            disabled={isUpdating}
                            className="px-8 py-2.5 bg-blue-600 text-white rounded-2xl text-sm font-black shadow-lg hover:bg-blue-700 transition-all active:scale-95 disabled:opacity-50"
                        >
                            {isUpdating ? t('common.saving') : t('env.save_settings')}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}
