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
                newErrors.ENCRYPTION_KEY = 'Encryption key must be a 64-character hex string';
            }
        }

        setErrors(newErrors);
        return Object.keys(newErrors).length === 0;
    };

    const handleSave = () => {
        if (!validate()) return;

        updateEnv(form, {
            onSuccess: () => {
                if (window.confirm('Settings saved. Restart server now to apply?')) {
                    handleRestart();
                }
            },
            onError: (err: any) => {
                alert(`Failed to save settings: ${err.message}`);
            }
        });
    };

    const handleRestart = () => {
        restartServer(undefined, {
            onSuccess: () => {
                alert('Server is restarting. Please refresh the page in a few seconds.');
                // Optional: countdown or auto-refresh
            },
            onError: (err: any) => {
                alert(`Restart failed: ${err.message}`);
            }
        });
    };

    if (isLoading) {
        return <div className="p-8 text-center text-gray-500">{t('common.loading')}</div>;
    }

    const fieldGroups = [
        {
            title: 'AI & External APIs',
            fields: [
                {
                    key: 'GEMINI_API_KEY',
                    label: 'Gemini API Key',
                    help: 'Obtain from ',
                    link: { text: 'Google AI Studio', url: 'https://aistudio.google.com/app/apikey' }
                }
            ]
        },
        {
            title: 'Google Integration',
            fields: [
                {
                    key: 'GOOGLE_CLIENT_ID',
                    label: 'Google Client ID',
                    help: 'Create "OAuth 2.0 Client ID" at ',
                    link: { text: 'Google Cloud Console', url: 'https://console.cloud.google.com/apis/credentials' }
                },
                {
                    key: 'GOOGLE_CLIENT_SECRET',
                    label: 'Google Client Secret',
                    help: 'Found in the same Google Cloud Console project.'
                },
                {
                    key: 'GOOGLE_REDIRECT_URI',
                    label: 'Google Redirect URI',
                    help: `Must match the authorized redirect URI in Cloud Console (e.g., ${window.location.origin}/api/auth/google/callback)`
                },
                {
                    key: 'DRIVE_FOLDER_ID',
                    label: 'Drive Folder ID',
                    help: 'The ID from the URL of your Google Drive folder where results will be saved.'
                }
            ]
        },
        {
            title: 'System & Security',
            fields: [
                {
                    key: 'ENCRYPTION_KEY',
                    label: 'Encryption Key (64 hex)',
                    help: 'Generate using: openssl rand -hex 32'
                },
                {
                    key: 'PORT',
                    label: 'Server Port',
                    help: 'Default is 3000.'
                },
                {
                    key: 'DATA_DIR',
                    label: 'Data Directory',
                    help: 'Path where profiles and results are stored. Default is ./data'
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
        <div className="space-y-8 animate-in fade-in duration-500">
            <div className="bg-white rounded-2xl p-6 shadow-sm border border-gray-100">
                <div className="flex items-center justify-between mb-6">
                    <div>
                        <h3 className="text-xl font-bold text-gray-900">Environment Variables</h3>
                        <p className="text-sm text-gray-500 mt-1">Configure system-level settings stored in .env</p>
                    </div>
                </div>

                <div className="space-y-8">
                    {fieldGroups.map(group => (
                        <div key={group.title} className="space-y-4">
                            <h4 className="text-xs font-black uppercase tracking-wider text-gray-400 border-b border-gray-100 pb-2">
                                {group.title}
                            </h4>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-4">
                                {group.fields.map(field => (
                                    <div key={field.key} className="space-y-1">
                                        <div className="flex items-center justify-between">
                                            <label className="text-sm font-bold text-gray-700 block">{field.label || field.key}</label>
                                        </div>
                                        <div className="flex gap-2">
                                            <input
                                                type={field.key.includes('KEY') || field.key.includes('SECRET') ? 'password' : 'text'}
                                                value={form[field.key] || ''}
                                                onChange={(e) => handleChange(field.key, e.target.value)}
                                                className={`w-full px-4 py-2 bg-gray-50 border rounded-xl text-sm transition-all focus:ring-2 focus:ring-blue-500 outline-none ${errors[field.key] ? 'border-red-500 bg-red-50' : 'border-gray-200 hover:border-gray-300'}`}
                                                placeholder={`Enter ${field.key}...`}
                                            />
                                            {field.key === 'ENCRYPTION_KEY' && (
                                                <button
                                                    onClick={() => generateRandomKey(field.key)}
                                                    className="px-3 py-2 bg-gray-100 text-gray-600 rounded-xl text-xs font-bold hover:bg-gray-200 transition-all active:scale-95 border border-gray-200"
                                                    title="Generate Random Key"
                                                >
                                                    Generate
                                                </button>
                                            )}
                                        </div>
                                        <div className="flex flex-col gap-1">
                                            {errors[field.key] && <p className="text-xs text-red-600 font-medium">{errors[field.key]}</p>}
                                            {field.help && (
                                                <p className="text-[11px] text-gray-400 leading-tight">
                                                    {field.help}
                                                    {field.link && (
                                                        <a
                                                            href={field.link.url}
                                                            target="_blank"
                                                            rel="noopener noreferrer"
                                                            className="text-blue-500 hover:underline font-medium"
                                                        >
                                                            {field.link.text}
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
                        ⚠️ Changes to these variables require a server restart to take effect.
                    </div>
                    <div className="flex gap-3">
                        <button
                            onClick={handleRestart}
                            disabled={isRestarting}
                            className="px-6 py-2.5 bg-amber-100 text-amber-700 rounded-xl text-sm font-bold hover:bg-amber-200 transition-all active:scale-95 disabled:opacity-50"
                        >
                            {isRestarting ? 'Restarting...' : 'Restart Server'}
                        </button>
                        <button
                            onClick={handleSave}
                            disabled={isUpdating}
                            className="px-8 py-2.5 bg-blue-600 text-white rounded-xl text-sm font-bold shadow-lg shadow-blue-200 hover:bg-blue-700 transition-all active:scale-95 disabled:opacity-50"
                        >
                            {isUpdating ? 'Saving...' : 'Save Settings'}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}
