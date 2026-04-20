import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { X } from 'lucide-react';
import { ScraperOptions, isSensitiveCredentialKey, parseExcludedAccountNumbersInput } from '@app/shared';
import { useProfile, useUpdateProfile } from '../hooks/useProfiles';
import { useProviders, getProviderDisplayName } from '../hooks/useProviders';
import { ProviderIcon } from './ProfileManager';
import { OneZeroLongTermTokenHelper } from './OneZeroLongTermTokenHelper';

export interface EditProfileModalProps {
    profileId: string;
    onClose: () => void;
    /** When true, editing is disabled (app lock) */
    restricted?: boolean;
}

export function EditProfileModal({ profileId, onClose, restricted }: EditProfileModalProps) {
    const { t, i18n } = useTranslation();
    const { data: profile, isLoading, isError } = useProfile(profileId);
    const { data: providers } = useProviders();
    const { mutate: updateProfile, isPending } = useUpdateProfile();

    const [name, setName] = useState('');
    const [credentials, setCredentials] = useState<Record<string, string>>({});
    const [options, setOptions] = useState<Partial<ScraperOptions>>({});

    useEffect(() => {
        if (!profile) return;
        setName(profile.name);
        setCredentials({ ...profile.credentials });
        setOptions({ ...profile.options });
    }, [profile]);

    const provider = providers?.find((p) => p.id === profile?.companyId);

    const getFieldLabel = (label: string, labelHe?: string) =>
        i18n.language === 'he' ? labelHe || label : label;

    const getFieldPlaceholder = (placeholder?: string, placeholderHe?: string) =>
        i18n.language === 'he' ? placeholderHe || placeholder : placeholder;

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (!profile || restricted) return;

        const credPayload: Record<string, string> = {};
        for (const field of provider?.credentialFields ?? []) {
            const v = credentials[field.name];
            if (isSensitiveCredentialKey(field.name, profile.companyId)) {
                if (typeof v === 'string' && v.trim() !== '') {
                    credPayload[field.name] = v.trim();
                }
            } else if (v !== undefined) {
                credPayload[field.name] = v;
            }
        }

        updateProfile(
            {
                id: profile.id,
                name: name.trim(),
                options: { ...options, startDate: undefined },
                credentials: credPayload,
            },
            {
                onSuccess: () => onClose(),
                onError: (err: unknown) => {
                    const msg =
                        (err as { response?: { data?: { error?: string } } })?.response?.data?.error ||
                        (err as Error)?.message ||
                        t('common.unknown_error');
                    alert(t('profiles.update_failed', { error: msg }));
                },
            }
        );
    };

    return (
        <div
            className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-in fade-in duration-200"
            onClick={(ev) => ev.target === ev.currentTarget && !isPending && onClose()}
        >
            <div
                role="dialog"
                aria-modal="true"
                className="bg-white rounded-xl shadow-xl border border-gray-200 max-w-lg w-full max-h-[90vh] overflow-y-auto animate-in zoom-in-95 duration-200"
                onClick={(e) => e.stopPropagation()}
            >
                <div className="flex items-center justify-between gap-3 p-4 border-b border-gray-100">
                    <div className="flex items-center gap-2 min-w-0">
                        {profile && (
                            <div className="p-1.5 rounded-md bg-gray-50 shrink-0">
                                <ProviderIcon companyId={profile.companyId} />
                            </div>
                        )}
                        <h2 className="text-lg font-semibold text-gray-900 truncate">
                            {t('profiles.edit_title')}
                        </h2>
                    </div>
                    <button
                        type="button"
                        onClick={onClose}
                        disabled={isPending}
                        className="p-2 rounded-lg text-gray-500 hover:bg-gray-100 hover:text-gray-800 transition-colors"
                        aria-label={t('common.close')}
                    >
                        <X className="w-5 h-5" />
                    </button>
                </div>

                <div className="p-4">
                    {isLoading && (
                        <p className="text-sm text-gray-500">{t('profiles.loading')}</p>
                    )}
                    {isError && (
                        <p className="text-sm text-red-600">{t('profiles.edit_load_failed')}</p>
                    )}
                    {profile && provider && !isLoading && !isError && (
                        <form onSubmit={handleSubmit} className="space-y-4">
                            <div>
                                <label className="block text-sm font-medium text-gray-700">
                                    {t('profiles.name_label')}
                                </label>
                                <input
                                    type="text"
                                    value={name}
                                    onChange={(e) => setName(e.target.value)}
                                    required
                                    disabled={restricted || isPending}
                                    className="mt-1 block w-full rounded-md border border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm p-2"
                                />
                            </div>

                            <div>
                                <span className="block text-sm font-medium text-gray-700">
                                    {t('scraper.provider')}
                                </span>
                                <p className="mt-1 text-sm text-gray-600">
                                    {getProviderDisplayName(profile.companyId, providers, i18n.language)}
                                </p>
                            </div>

                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                {provider.credentialFields.map((field) => (
                                    <div key={field.name} className={field.type === 'password' ? 'sm:col-span-2' : ''}>
                                        <label className="block text-sm font-medium text-gray-700">
                                            {getFieldLabel(field.label, field.labelHe)}
                                        </label>
                                        <input
                                            type={
                                                field.type === 'password' ||
                                                isSensitiveCredentialKey(field.name, profile.companyId)
                                                    ? 'password'
                                                    : 'text'
                                            }
                                            value={credentials[field.name] ?? ''}
                                            onChange={(e) =>
                                                setCredentials((prev) => ({
                                                    ...prev,
                                                    [field.name]: e.target.value,
                                                }))
                                            }
                                            placeholder={
                                                isSensitiveCredentialKey(field.name, profile.companyId)
                                                    ? t('profiles.password_unchanged_placeholder')
                                                    : getFieldPlaceholder(field.placeholder, field.placeholderHe)
                                            }
                                            required={
                                                field.required &&
                                                !isSensitiveCredentialKey(field.name, profile.companyId)
                                            }
                                            disabled={restricted || isPending}
                                            autoComplete="off"
                                            className="mt-1 block w-full rounded-md border border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm p-2"
                                        />
                                    </div>
                                ))}
                            </div>

                            {profile.companyId === 'oneZero' && (
                                <OneZeroLongTermTokenHelper
                                    phoneNumber={credentials.phoneNumber ?? ''}
                                    onTokenGenerated={(token) =>
                                        setCredentials((prev) => ({ ...prev, otpLongTermToken: token }))
                                    }
                                    disabled={restricted || isPending}
                                />
                            )}

                            <div className="border-t border-gray-100 pt-4 space-y-3">
                                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
                                    {t('profiles.options_section')}
                                </p>
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                    <div>
                                        <label className="block text-sm text-gray-700">
                                            {t('scraper.timeout')} (ms)
                                        </label>
                                        <input
                                            type="number"
                                            min={10000}
                                            step={1000}
                                            value={options.timeout ?? 120000}
                                            onChange={(e) =>
                                                setOptions((o) => ({
                                                    ...o,
                                                    timeout: Number(e.target.value) || 120000,
                                                }))
                                            }
                                            disabled={restricted || isPending}
                                            className="mt-1 block w-full rounded-md border border-gray-300 p-2 text-sm"
                                        />
                                    </div>
                                    <label className="flex items-center gap-2 text-sm text-gray-700 pt-6">
                                        <input
                                            type="checkbox"
                                            checked={options.showBrowser ?? false}
                                            onChange={(e) =>
                                                setOptions((o) => ({ ...o, showBrowser: e.target.checked }))
                                            }
                                            disabled={restricted || isPending}
                                            className="rounded border-gray-300"
                                        />
                                        {t('scraper.show_browser')}
                                    </label>
                                    <label className="flex items-center gap-2 text-sm text-gray-700">
                                        <input
                                            type="checkbox"
                                            checked={options.verbose ?? true}
                                            onChange={(e) =>
                                                setOptions((o) => ({ ...o, verbose: e.target.checked }))
                                            }
                                            disabled={restricted || isPending}
                                            className="rounded border-gray-300"
                                        />
                                        {t('scraper.verbose')}
                                    </label>
                                    <label className="flex items-center gap-2 text-sm text-gray-700">
                                        <input
                                            type="checkbox"
                                            checked={options.combineInstallments ?? false}
                                            onChange={(e) =>
                                                setOptions((o) => ({
                                                    ...o,
                                                    combineInstallments: e.target.checked,
                                                }))
                                            }
                                            disabled={restricted || isPending}
                                            className="rounded border-gray-300"
                                        />
                                        {t('scraper.combine_installments')}
                                    </label>
                                </div>
                                <div className="sm:col-span-2">
                                    <label className="block text-sm text-gray-700" htmlFor="profileExcludedAccounts">
                                        {t('scraper.excluded_accounts')}
                                    </label>
                                    <textarea
                                        id="profileExcludedAccounts"
                                        rows={3}
                                        value={(options.excludedAccountNumbers || []).join('\n')}
                                        onChange={(e) =>
                                            setOptions((o) => ({
                                                ...o,
                                                excludedAccountNumbers: parseExcludedAccountNumbersInput(
                                                    e.target.value
                                                ),
                                            }))
                                        }
                                        disabled={restricted || isPending}
                                        className="mt-1 block w-full rounded-md border border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm p-2 font-mono"
                                    />
                                    <p className="mt-1 text-xs text-gray-500">{t('scraper.excluded_accounts_hint')}</p>
                                </div>
                            </div>

                            <div className="flex justify-end gap-2 pt-2">
                                <button
                                    type="button"
                                    onClick={onClose}
                                    disabled={isPending}
                                    className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50"
                                >
                                    {t('common.cancel')}
                                </button>
                                <button
                                    type="submit"
                                    disabled={restricted || isPending || !name.trim()}
                                    className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700 disabled:bg-blue-400"
                                >
                                    {isPending ? t('common.saving') : t('common.save')}
                                </button>
                            </div>
                        </form>
                    )}
                </div>
            </div>
        </div>
    );
}
