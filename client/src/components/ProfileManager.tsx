import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { useProfiles, useCreateProfile, useDeleteProfile } from '../hooks/useProfiles';
import { Profile, ScraperOptions, ProviderDefinition } from '@app/shared';
import { api } from '../lib/api';

interface ProfileManagerProps {
    currentCompanyId: string;
    currentCredentials: Record<string, string>;
    currentOptions: ScraperOptions;
    onLoadProfile: (profile: Profile) => void;
}

export function ProfileManager({
    currentCompanyId,
    currentCredentials,
    currentOptions,
    onLoadProfile,
}: ProfileManagerProps) {
    const { i18n } = useTranslation();
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
                const errorMsg = err?.response?.data?.error || err.message || 'Unknown error';
                alert(`Failed to save profile: ${errorMsg}`);
            }
        });
    };

    const handleLoadProfile = (profile: Profile) => {
        onLoadProfile(profile);
    };

    const handleDeleteProfile = (id: string, e: React.MouseEvent) => {
        e.stopPropagation();
        if (confirm('Are you sure you want to delete this profile?')) {
            deleteProfile(id, {
                onError: (err: any) => {
                    const errorMsg = err?.response?.data?.error || err.message || 'Unknown error';
                    alert(`Failed to delete profile: ${errorMsg}`);
                }
            });
        }
    };

    if (isLoading) {
        return <div className="text-sm text-gray-500">Loading profiles...</div>;
    }

    return (
        <div className="bg-white p-4 rounded-lg shadow-md border border-gray-200">
            <div className="flex items-center justify-between mb-3">
                <h3 className="font-semibold text-gray-800">Saved Profiles</h3>
                <button
                    onClick={() => setShowSaveInput(!showSaveInput)}
                    className="text-xs text-blue-600 hover:text-blue-800"
                >
                    {showSaveInput ? 'Cancel' : '+ Save Current'}
                </button>
            </div>

            {/* Save New Profile Input */}
            {showSaveInput && (
                <div className="mb-3 flex gap-2">
                    <input
                        type="text"
                        value={newProfileName}
                        onChange={(e) => setNewProfileName(e.target.value)}
                        placeholder="Profile name..."
                        className="flex-1 text-sm p-2 border border-gray-300 rounded"
                    />
                    <button
                        onClick={handleSaveProfile}
                        disabled={isCreating || !newProfileName.trim()}
                        className="px-3 py-1 bg-blue-600 text-white text-sm rounded hover:bg-blue-700 disabled:bg-blue-400"
                    >
                        {isCreating ? 'Saving...' : 'Save'}
                    </button>
                </div>
            )}

            {/* Profile List */}
            {profiles && profiles.length > 0 ? (
                <div className="space-y-2 max-h-40 overflow-y-auto">
                    {profiles.map((profile) => (
                        <div
                            key={profile.id}
                            onClick={() => handleLoadProfile(profile)}
                            className="p-2 bg-gray-50 rounded border border-gray-200 cursor-pointer hover:bg-gray-100 flex items-center justify-between group"
                        >
                            <div>
                                <div className="font-medium text-sm text-gray-800">{profile.name}</div>
                                <div className="text-xs text-gray-500">{getProviderName(profile.companyId)}</div>
                            </div>
                            <button
                                onClick={(e) => handleDeleteProfile(profile.id, e)}
                                disabled={isDeleting}
                                className="text-red-500 hover:text-red-700 opacity-0 group-hover:opacity-100 transition-opacity text-xs"
                            >
                                Delete
                            </button>
                        </div>
                    ))}
                </div>
            ) : (
                <div className="text-sm text-gray-500 text-center py-2">
                    No saved profiles yet.
                </div>
            )}
        </div>
    );
}
