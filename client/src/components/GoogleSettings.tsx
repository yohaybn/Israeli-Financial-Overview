import { useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { useGoogleSettings, useUpdateGoogleSettings } from '../hooks/useScraper';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';

interface GoogleSettingsProps {
    isOpen?: boolean;
    onClose?: () => void;
    isInline?: boolean;
}

interface GoogleFolder {
    id: string;
    name: string;
}

const API_BASE = 'http://localhost:3000/api';

export function GoogleSettings({ isOpen, onClose, isInline }: GoogleSettingsProps) {
    const { t } = useTranslation();
    const queryClient = useQueryClient();
    const { data: settings } = useGoogleSettings();
    const { mutate: updateSettings, isPending: isUpdating } = useUpdateGoogleSettings();

    const [clientId, setClientId] = useState('');
    const [clientSecret, setClientSecret] = useState('');
    const [redirectUri, setRedirectUri] = useState('http://localhost:3000/api/auth/google/callback');
    const [selectedFolderId, setSelectedFolderId] = useState('');
    const [selectedFolderName, setSelectedFolderName] = useState('');
    const [currentBrowsingFolderId, setCurrentBrowsingFolderId] = useState<string | null>(null);
    const [folderPath, setFolderPath] = useState<Array<{ id: string | null; name: string }>>([]);
    const [notification, setNotification] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

    const showNotification = useCallback((type: 'success' | 'error', message: string) => {
        setNotification({ type, message });
        setTimeout(() => setNotification(null), 5000);
    }, []);

    // Fetch folder config
    const { data: folderConfig } = useQuery({
        queryKey: ['googleFolderConfig'],
        queryFn: async () => {
            const res = await fetch(`${API_BASE}/sheets/folder-config`);
            const data = await res.json();
            return data.data;
        },
        enabled: isOpen
    });

    // Fetch root folders
    const { data: folders, isLoading: isFoldersLoading } = useQuery({
        queryKey: ['googleFolders'],
        queryFn: async () => {
            const res = await fetch(`${API_BASE}/sheets/drive-folders`);
            const data = await res.json();
            return data.data || [];
        },
        enabled: isOpen && currentBrowsingFolderId === null
    });

    // Fetch folder contents when browsing
    const { data: folderContents, isLoading: isFolderContentsLoading } = useQuery({
        queryKey: ['googleFolderContents', currentBrowsingFolderId],
        queryFn: async () => {
            if (!currentBrowsingFolderId) return null;
            const res = await fetch(`${API_BASE}/sheets/drive-folder-contents/${currentBrowsingFolderId}`);
            const data = await res.json();
            return data.data;
        },
        enabled: currentBrowsingFolderId !== null
    });

    // Mutation to save folder config
    const { mutate: saveFolderConfig } = useMutation({
        mutationFn: async (folderId: string) => {
            const folderName = selectedFolderName;
            const res = await fetch(`${API_BASE}/sheets/folder-config`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ folderId, folderName })
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || 'Failed to save folder config');
            return data;
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['googleFolderConfig'] });
            showNotification('success', t('settings.folder_saved', 'Folder configuration saved successfully'));
        },
        onError: (err: any) => {
            const errorMsg = err?.message || 'Unknown error';
            showNotification('error', `Failed to save folder: ${errorMsg}`);
        }
    });

    // Mutation to clear folder config
    const { mutate: clearFolderConfig, isPending: isClearingFolder } = useMutation({
        mutationFn: async () => {
            const res = await fetch(`${API_BASE}/sheets/folder-config`, {
                method: 'DELETE'
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || 'Failed to clear folder config');
            return data;
        },
        onSuccess: () => {
            setSelectedFolderId('');
            setSelectedFolderName('');
            setCurrentBrowsingFolderId(null);
            setFolderPath([]);
            queryClient.invalidateQueries({ queryKey: ['googleFolderConfig'] });
            showNotification('success', t('settings.folder_cleared', 'Folder configuration cleared'));
        },
        onError: (err: any) => {
            const errorMsg = err?.message || 'Unknown error';
            showNotification('error', `Failed to clear folder: ${errorMsg}`);
        }
    });

    const handleSelectFolder = (folderId: string, folderName: string) => {
        setSelectedFolderId(folderId);
        setSelectedFolderName(folderName);
        saveFolderConfig(folderId);
        setCurrentBrowsingFolderId(null);
        setFolderPath([]);
    };

    const handleBrowseFolder = (folderId: string, folderName: string) => {
        setCurrentBrowsingFolderId(folderId);
        setFolderPath([...folderPath, { id: folderId, name: folderName }]);
    };

    const handleNavigateBack = (stepBack: number = 1) => {
        const newPath = folderPath.slice(0, -stepBack);
        if (newPath.length === 0) {
            setCurrentBrowsingFolderId(null);
        } else {
            setCurrentBrowsingFolderId(newPath[newPath.length - 1].id);
        }
        setFolderPath(newPath);
    };

    useEffect(() => {
        if (settings) {
            setClientId(settings.clientId || '');
            setClientSecret(settings.clientSecret || '');
            setRedirectUri(settings.redirectUri || 'http://localhost:3000/api/auth/google/callback');
        }
    }, [settings]);

    useEffect(() => {
        if (folderConfig) {
            setSelectedFolderId(folderConfig.folderId || '');
            setSelectedFolderName(folderConfig.folderName || '');
        }
    }, [folderConfig]);

    const handleSave = () => {
        updateSettings({ clientId, clientSecret, redirectUri }, {
            onSuccess: () => {
                showNotification('success', t('settings.saved', 'Settings saved successfully'));
                onClose?.();
            },
            onError: (err: any) => {
                const errorMsg = err?.response?.data?.error || err.message || 'Unknown error';
                showNotification('error', `Failed to save settings: ${errorMsg}`);
            }
        });
    };

    if (!isInline && !isOpen) return null;

    const isLoading = isFoldersLoading || isFolderContentsLoading;
    const displayFolders = currentBrowsingFolderId ? folderContents?.folders : folders;

    const content = (
        <div className={`${isInline ? '' : 'bg-white rounded-2xl shadow-2xl w-full max-w-2xl overflow-hidden animate-in zoom-in-95 duration-200 max-h-[90vh] overflow-y-auto'}`}>
            {!isInline && (
                <div className="p-6 border-b border-gray-100 flex justify-between items-center bg-gray-50/50 sticky top-0">
                    <h2 className="text-xl font-bold text-gray-800 flex items-center gap-2">
                        <svg className="w-6 h-6 text-green-600" fill="currentColor" viewBox="0 0 24 24">
                            <path d="M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zM9 17H7v-2h2v2zm0-4H7v-2h2v2zm0-4H7V7h2v2zm4 8h-2v-2h2v2zm0-4h-2v-2h2v2zm0-4h-2V7h2v2zm4 8h-2v-2h2v2zm0-4h-2v-2h2v2zm0-4h-2V7h2v2z" />
                        </svg>
                        {t('google_settings.title')}
                    </h2>
                    <button onClick={onClose} className="text-gray-400 hover:text-gray-600 transition-colors">
                        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
                        </svg>
                    </button>
                </div>
            )}

            <div className="p-6 space-y-5">
                <p className="text-sm text-gray-500 italic pb-2 border-b border-gray-100">
                    {t('google_settings.description', 'Obtain these from the')} <a href="https://console.cloud.google.com/" target="_blank" rel="noreferrer" className="text-blue-600 hover:underline">Google Cloud Console</a>.
                </p>

                {/* OAuth Settings */}
                <div className="space-y-1">
                    <label className="text-xs font-bold text-gray-400 uppercase tracking-wider">{t('google_settings.client_id')}</label>
                    <input
                        type="text"
                        value={clientId}
                        onChange={(e) => setClientId(e.target.value)}
                        className="w-full p-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-green-500 outline-none transition-all"
                        placeholder={t('google_settings.placeholder_client_id')}
                    />
                </div>

                <div className="space-y-1">
                    <label className="text-xs font-bold text-gray-400 uppercase tracking-wider">{t('google_settings.client_secret')}</label>
                    <input
                        type="password"
                        value={clientSecret}
                        onChange={(e) => setClientSecret(e.target.value)}
                        className="w-full p-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-green-500 outline-none transition-all"
                        placeholder={t('google_settings.placeholder_client_secret')}
                    />
                </div>

                <div className="space-y-1">
                    <label className="text-xs font-bold text-gray-400 uppercase tracking-wider">{t('google_settings.redirect_uri')}</label>
                    <input
                        type="text"
                        value={redirectUri}
                        onChange={(e) => setRedirectUri(e.target.value)}
                        className="w-full p-2.5 bg-gray-100 border border-gray-200 rounded-xl text-sm text-gray-500 cursor-not-allowed"
                        readOnly
                    />
                    <p className="text-[10px] text-gray-400">{t('google_settings.redirect_uri_hint')}</p>
                </div>

                {/* Folder Browser */}
                <div className="pt-4 border-t border-gray-100 bg-gradient-to-br from-blue-50 to-cyan-50 p-4 rounded-xl">
                    <h3 className="text-sm font-bold text-gray-700 mb-3 flex items-center gap-2">
                        <svg className="w-4 h-4 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
                        </svg>
                        Default Google Drive Folder
                    </h3>
                    <p className="text-[10px] text-gray-600 mb-4">Browse and select a folder for auto-organization</p>

                    {/* Breadcrumb Navigation */}
                    {folderPath.length > 0 && (
                        <div className="mb-3 flex items-center gap-2 text-xs bg-white p-2 rounded-lg border border-blue-200">
                            <button
                                onClick={() => {
                                    setCurrentBrowsingFolderId(null);
                                    setFolderPath([]);
                                }}
                                className="text-blue-600 hover:text-blue-800 font-medium"
                            >
                                Drive
                            </button>
                            {folderPath.map((item, idx) => (
                                <div key={item.id} className="flex items-center gap-2">
                                    <span className="text-gray-400">/</span>
                                    <button
                                        onClick={() => handleNavigateBack(folderPath.length - idx)}
                                        className="text-blue-600 hover:text-blue-800"
                                    >
                                        {item.name}
                                    </button>
                                </div>
                            ))}
                        </div>
                    )}

                    {/* Folder/File Browser */}
                    <div className="bg-white rounded-lg border border-gray-200 max-h-64 overflow-y-auto">
                        {isLoading ? (
                            <div className="flex items-center justify-center p-6 text-sm text-gray-500">
                                <div className="w-4 h-4 border-2 border-gray-300 border-t-blue-600 rounded-full animate-spin mr-2"></div>
                                Loading...
                            </div>
                        ) : displayFolders && displayFolders.length > 0 ? (
                            <div className="divide-y divide-gray-100">
                                {displayFolders.map((folder: GoogleFolder) => (
                                    <div
                                        key={folder.id}
                                        className="flex items-center justify-between p-3 hover:bg-blue-50 transition-colors group"
                                    >
                                        <button
                                            onClick={() => handleBrowseFolder(folder.id, folder.name)}
                                            className="flex items-center gap-2 flex-1 text-left text-sm text-gray-700 hover:text-blue-600 font-medium"
                                        >
                                            <svg className="w-4 h-4 text-gray-400 group-hover:text-blue-500" fill="currentColor" viewBox="0 0 24 24">
                                                <path d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
                                            </svg>
                                            {folder.name}
                                        </button>
                                        <button
                                            onClick={() => handleSelectFolder(folder.id, folder.name)}
                                            className="px-3 py-1 text-xs bg-blue-600 text-white rounded hover:bg-blue-700 transition-colors opacity-0 group-hover:opacity-100"
                                        >
                                            Select
                                        </button>
                                    </div>
                                ))}
                            </div>
                        ) : (
                            <div className="p-6 text-center text-sm text-gray-500">
                                {currentBrowsingFolderId ? 'No folders or files found' : 'No folders found in Google Drive'}
                            </div>
                        )}
                    </div>
                </div>

                {/* Current Selection */}
                {selectedFolderId && (
                    <div className="flex items-center justify-between p-3 bg-green-50 rounded-lg border border-green-200">
                        <div className="flex items-center gap-2 text-sm text-green-700">
                            <svg className="w-5 h-5 text-green-600" fill="currentColor" viewBox="0 0 24 24">
                                <path d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
                            </svg>
                            <div>
                                <div className="font-medium">Selected:</div>
                                <div className="text-xs text-green-600">{selectedFolderName}</div>
                            </div>
                        </div>
                        <button
                            onClick={() => clearFolderConfig()}
                            disabled={isClearingFolder}
                            className="text-xs bg-white text-green-700 hover:bg-green-100 px-3 py-1.5 rounded transition-colors border border-green-300 font-medium"
                        >
                            Clear
                        </button>
                    </div>
                )}

                {/* Env Tip */}
                <div className="pt-2 border-t border-gray-100 bg-gray-50 p-3 rounded-lg">
                    <p className="text-[10px] text-gray-600 font-mono">
                        <strong>Tip:</strong> You can also set <code className="bg-white px-1 py-0.5 rounded">GOOGLE_DRIVE_FOLDER_ID</code> in .env
                    </p>
                </div>
            </div>

            <div className="p-6 bg-gray-50 border-t border-gray-100 flex gap-3 sticky bottom-0">
                <button
                    onClick={onClose}
                    className="flex-1 py-2.5 text-sm font-bold text-gray-600 hover:bg-white rounded-xl transition-all border border-transparent hover:border-gray-200"
                >
                    {t('common.cancel')}
                </button>
                <button
                    onClick={handleSave}
                    disabled={isUpdating || !clientId || !clientSecret}
                    className="flex-1 py-2.5 text-sm font-bold text-white bg-green-600 hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed rounded-xl transition-all shadow-md shadow-green-200 active:scale-95 flex items-center justify-center gap-2"
                >
                    {isUpdating ? (
                        <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                    ) : t('ai_settings.save_button')}
                </button>
            </div>
        </div>
    );

    if (isInline) return content;

    return (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[100] backdrop-blur-sm animate-in fade-in duration-200">
            {/* Notification Toast */}
            {notification && (
                <div className={`fixed top-4 right-4 px-6 py-3 rounded-lg shadow-lg text-white font-medium z-50 animate-in fade-in slide-in-from-right-5 ${notification.type === 'success' ? 'bg-green-600' : 'bg-red-600'
                    }`}>
                    {notification.message}
                </div>
            )}
            {content}
        </div>
    );
}
