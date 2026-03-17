import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { useProfiles, useCreateProfile, useDeleteProfile } from '../hooks/useProfiles';
import { Profile, ScraperOptions, ProviderDefinition } from '@app/shared';
import { api } from '../lib/api';
import { Landmark, CreditCard, Smartphone, Tag, Plus, Trash2, ShieldCheck } from 'lucide-react';

interface ProfileManagerProps {
    currentCompanyId: string;
    currentCredentials: Record<string, string>;
    currentOptions: ScraperOptions;
    selectedProfileId?: string;
    onLoadProfile: (profile: Profile) => void;
    onAddNewProfile: () => void;
    hideSaveButton?: boolean;
}

interface ProviderIconProps {
    companyId: string;
}

function ProviderIcon({ companyId }: ProviderIconProps) {
    const [hasError, setHasError] = useState(false);
    const iconPath = `/icons/providers/${companyId}.png`;
    
    const banks = ['hapoalim', 'leumi', 'mizrahi', 'discount', 'mercantile', 'otsarHahayal', 'union', 'beinleumi', 'massad', 'yahav', 'pagi'];
    const cards = ['max', 'visaCal', 'isracard', 'amex'];
    const digital = ['oneZero'];
    const special = ['behatsdaa', 'beyahadBishvilha'];

    const fallbackIcon = (() => {
        if (banks.includes(companyId)) return <Landmark className="w-4 h-4 text-blue-600" />;
        if (cards.includes(companyId)) return <CreditCard className="w-4 h-4 text-indigo-600" />;
        if (digital.includes(companyId)) return <Smartphone className="w-4 h-4 text-emerald-600" />;
        if (special.includes(companyId)) return <Tag className="w-4 h-4 text-orange-600" />;
        return <ShieldCheck className="w-4 h-4 text-gray-500" />;
    })();

    if (hasError) {
        return <>{fallbackIcon}</>;
    }

    return (
        <img 
            src={iconPath} 
            alt="" 
            className="w-5 h-5 object-contain"
            onError={() => setHasError(true)}
        />
    );
}

export function ProfileManager({
    currentCompanyId,
    currentCredentials,
    currentOptions,
    selectedProfileId,
    onLoadProfile,
    onAddNewProfile,
    hideSaveButton,
}: ProfileManagerProps) {
    const { t, i18n } = useTranslation();
    const { data: profiles, isLoading } = useProfiles();
    const { data: providers } = useQuery({
        queryKey: ['providers'],
        queryFn: async () => {
            const { data } = await api.get<{ success: boolean; data: ProviderDefinition[] }>('/definitions');
            return data.data;
        },
    });
    const { mutate: createProfile, isPending: isCreating } = useCreateProfile();
    const { mutate: deleteProfile, isPending: isDeleting } = useDeleteProfile();

    const [newProfileName, setNewProfileName] = useState('');
    const [showSaveInput, setShowSaveInput] = useState(false);

    const getProviderName = (companyId: string): string => {
        const provider = providers?.find(p => p.id === companyId);
        if (!provider) return companyId;
        return i18n.language === 'he' ? (provider.nameHe || provider.name) : provider.name;
    };


    const handleSaveProfile = () => {
        if (!newProfileName.trim() || !currentCompanyId) return;

        createProfile({
            name: newProfileName.trim(),
            companyId: currentCompanyId,
            credentials: currentCredentials,
            options: currentOptions,
        }, {
            onSuccess: () => {
                setNewProfileName('');
                setShowSaveInput(false);
            },
            onError: (err: any) => {
                const errorMsg = err?.response?.data?.error || err.message || t('common.unknown_error');
                alert(t('profiles.save_failed', { error: errorMsg }));
            }
        });
    };

    const handleLoadProfile = (profile: Profile) => {
        onLoadProfile(profile);
    };

    const handleDeleteProfile = (id: string, e: React.MouseEvent) => {
        e.stopPropagation();
        if (confirm(t('profiles.confirm_delete'))) {
            deleteProfile(id, {
                onError: (err: any) => {
                    const errorMsg = err?.response?.data?.error || err.message || t('common.unknown_error');
                    alert(t('profiles.delete_failed', { error: errorMsg }));
                }
            });
        }
    };

    if (isLoading) {
        return <div className="text-sm text-gray-500 p-4">{t('profiles.loading')}</div>;
    }

    return (
        <div className="space-y-4">
            <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold text-gray-700">{t('profiles.title')}</h3>
                <div className="flex gap-2">
                    {!hideSaveButton && !showSaveInput && currentCompanyId && (
                        <button
                            onClick={() => setShowSaveInput(true)}
                            className="text-xs text-gray-500 hover:text-blue-600 underline"
                        >
                            {t('profiles.save_current')}
                        </button>
                    )}
                </div>
            </div>

            {/* Save New Profile Input */}
            {showSaveInput && (
                <div className="p-3 bg-blue-50/50 rounded-lg border border-blue-100 mb-2">
                    <div className="flex gap-2">
                        <input
                            type="text"
                            value={newProfileName}
                            onChange={(e) => setNewProfileName(e.target.value)}
                            placeholder={t('profiles.name_placeholder')}
                            className="flex-1 text-sm p-2 border border-gray-300 rounded focus:ring-1 focus:ring-blue-400 outline-none"
                            autoFocus
                        />
                        <button
                            onClick={handleSaveProfile}
                            disabled={isCreating || !newProfileName.trim()}
                            className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded hover:bg-blue-700 disabled:bg-blue-400 transition-colors"
                        >
                            {isCreating ? t('common.saving') : t('common.save')}
                        </button>
                        <button
                            onClick={() => setShowSaveInput(false)}
                            className="px-2 text-gray-400 hover:text-gray-600"
                        >
                            ✕
                        </button>
                    </div>
                    <p className="mt-1.5 text-[10px] text-blue-600/70 ml-1">
                        {t('profiles.saving_hint', { defaultValue: 'Saving settings for ' }) + getProviderName(currentCompanyId)}
                    </p>
                </div>
            )}

            {/* Profile List */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {/* Add New Profile Card */}
                <div
                    onClick={onAddNewProfile}
                    className="p-3 rounded-lg border-2 border-dashed border-gray-200 hover:border-blue-400 hover:bg-blue-50/30 transition-all cursor-pointer flex items-center gap-3 group"
                >
                    <div className="p-2 rounded-md bg-gray-50 group-hover:bg-blue-100 transition-colors">
                        <Plus className="w-5 h-5 text-gray-400 group-hover:text-blue-600" />
                    </div>
                    <div className="flex-1">
                        <div className="font-bold text-sm text-gray-500 group-hover:text-blue-700 transition-colors">{t('profiles.add_new', { defaultValue: 'Add New Profile' })}</div>
                    </div>
                </div>

                {profiles?.map((profile) => (
                    <div
                        key={profile.id}
                        onClick={() => handleLoadProfile(profile)}
                        className={`p-3 rounded-lg border transition-all cursor-pointer flex items-center gap-3 group relative
                            ${selectedProfileId === profile.id 
                                ? 'border-blue-500 bg-blue-50/50 ring-1 ring-blue-500' 
                                : 'border-gray-200 bg-white hover:border-blue-300 hover:shadow-sm'
                            }`}
                    >
                        <div className={`p-2 rounded-md ${selectedProfileId === profile.id ? 'bg-blue-100' : 'bg-gray-50 group-hover:bg-blue-50'}`}>
                            <ProviderIcon companyId={profile.companyId} />
                        </div>
                        <div className="flex-1 min-w-0">
                            <div className="font-semibold text-sm text-gray-800 truncate">{profile.name}</div>
                            <div className="text-xs text-gray-500 truncate">{getProviderName(profile.companyId)}</div>
                        </div>
                        
                        <button
                            onClick={(e) => handleDeleteProfile(profile.id, e)}
                            disabled={isDeleting}
                            className="p-1.5 text-gray-400 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-all rounded-md hover:bg-red-50"
                            title={t('common.delete')}
                        >
                            <Trash2 className="w-4 h-4" />
                        </button>
                    </div>
                ))}
            </div>
        </div>
    );
}
