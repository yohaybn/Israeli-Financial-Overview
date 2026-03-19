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

const API_BASE = '/api';

export function GoogleSettings({ isOpen, onClose, isInline }: GoogleSettingsProps) {
    const { t } = useTranslation();
    const queryClient = useQueryClient();
    const { data: settings } = useGoogleSettings();
    const { mutate: updateSettings, isPending: isUpdating } = useUpdateGoogleSettings();

    const [clientId, setClientId] = useState('');
    const [clientSecret, setClientSecret] = useState('');
    const [redirectUri, setRedirectUri] = useState(`${window.location.origin}/api/auth/google/callback`);
    const [selectedFolderId, setSelectedFolderId] = useState('');
    const [selectedFolderName, setSelectedFolderName] = useState('');
    const [currentBrowsingFolderId, setCurrentBrowsingFolderId] = useState<string | null>(null);
    const [folderPath, setFolderPath] = useState<Array<{ id: string | null; name: string }>>([]);
    const [notification, setNotification] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
    const [testError, setTestError] = useState<string | null>(null);

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
            if (!res.ok) throw new Error(data.error || t('google_settings.errors.save_folder_failed'));
            return data;
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['googleFolderConfig'] });
            showNotification('success', t('google_settings.folder_saved'));
        },
        onError: (err: any) => {
            const errorMsg = err?.message || t('common.unknown_error');
            showNotification('error', t('google_settings.errors.save_folder_failed_with_error', { error: errorMsg }));
        }
    });

    // Mutation to clear folder config
    const { mutate: clearFolderConfig, isPending: isClearingFolder } = useMutation({
        mutationFn: async () => {
            const res = await fetch(`${API_BASE}/sheets/folder-config`, {
                method: 'DELETE'
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || t('google_settings.errors.clear_folder_failed'));
            return data;
        },
        onSuccess: () => {
            setSelectedFolderId('');
            setSelectedFolderName('');
            setCurrentBrowsingFolderId(null);
            setFolderPath([]);
            queryClient.invalidateQueries({ queryKey: ['googleFolderConfig'] });
            showNotification('success', t('google_settings.folder_cleared'));
        },
        onError: (err: any) => {
            const errorMsg = err?.message || t('common.unknown_error');
            showNotification('error', t('google_settings.errors.clear_folder_failed_with_error', { error: errorMsg }));
        }
    });

    // Mutation to test Google Drive connection
    const { mutate: testDriveConnection, isPending: isTestingDrive } = useMutation({
        mutationFn: async () => {
            setTestError(null);
            const res = await fetch(`${API_BASE}/auth/google/test`);
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || t('google_settings.test_failed'));
            return data;
        },
        onSuccess: () => {
            setTestError(null);
            showNotification('success', t('google_settings.test_success'));
        },
        onError: (err: any) => {
            const message = err?.message || t('google_settings.test_failed');
            setTestError(message);
            showNotification('error', message);
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
            setRedirectUri(settings.redirectUri || `${window.location.origin}/api/auth/google/callback`);
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
                showNotification('success', t('common.save_success'));
                onClose?.();
            },
            onError: (err: any) => {
                const errorMsg = err?.response?.data?.error || err.message || t('common.unknown_error');
                showNotification('error', t('common.save_failed_with_error', { error: errorMsg }));
            }
        });
    };

    if (!isInline && !isOpen) return null;

    const isLoading = isFoldersLoading || isFolderContentsLoading;
    const displayFolders = currentBrowsingFolderId ? folderContents?.folders : folders;

    const content = (
        <div className={`${isInline ? 'space-y-6' : 'bg-white rounded-3xl shadow-2xl w-full max-w-2xl overflow-hidden animate-in zoom-in-95 duration-200 max-h-[90vh] flex flex-col'}`}>
            {!isInline && (
                <div className="p-6 bg-green-600 text-white flex justify-between items-center shrink-0">
                    <h2 className="text-xl font-bold text-gray-800 flex items-center gap-2">
                        <svg className="w-6 h-6 text-green-100" fill="currentColor" viewBox="0 0 24 24">
                            <path d="M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zM9 17H7v-2h2v2zm0-4H7v-2h2v2zm0-4H7V7h2v2zm4 8h-2v-2h2v2zm0-4h-2v-2h2v2zm0-4h-2V7h2v2zm4 8h-2v-2h2v2zm0-4h-2v-2h2v2zm0-4h-2V7h2v2z" />
                        </svg>
                        <span className="text-white">{t('google_settings.title')}</span>
                    </h2>
                    <button onClick={onClose} className="p-2 hover:bg-white/20 rounded-full transition-colors">
                        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
                        </svg>
                    </button>
                </div>
            )}

            <div className={`space-y-6 ${isInline ? '' : 'p-6 overflow-y-auto'}`}>
                <section className={`${isInline ? 'bg-white rounded-2xl p-6 shadow-sm border border-gray-100' : 'bg-gray-50 rounded-2xl p-5 border border-gray-100'}`}>
                    <p className="text-sm text-gray-500 italic pb-2 border-b border-gray-100">
                    {t('google_settings.description_prefix')}{' '}
                    <a href="https://console.cloud.google.com/" target="_blank" rel="noreferrer" className="text-blue-600 hover:underline">
                        {t('google_settings.google_cloud_console')}
                    </a>
                    {t('google_settings.description_suffix')}
                    </p>

                    <div className="space-y-1">
                    <label className="text-xs font-bold text-gray-400 uppercase tracking-wider">{t('google_settings.client_id')}</label>
                    <input
                        type="text"
                        value={clientId}
                        onChange={(e) => setClientId(e.target.value)}
                        className="w-full p-2.5 bg-white border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-green-500 outline-none shadow-sm transition-all"
                        placeholder={t('google_settings.placeholder_client_id')}
                    />
                    </div>

                    <div className="space-y-1">
                    <label className="text-xs font-bold text-gray-400 uppercase tracking-wider">{t('google_settings.client_secret')}</label>
                    <input
                        type="password"
                        value={clientSecret}
                        onChange={(e) => setClientSecret(e.target.value)}
                        className="w-full p-2.5 bg-white border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-green-500 outline-none shadow-sm transition-all"
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
                </section>

                <section className={`${isInline ? 'bg-white rounded-2xl p-6 shadow-sm border border-gray-100' : 'bg-gray-50 rounded-2xl p-5 border border-gray-100'} bg-gradient-to-br from-blue-50 to-cyan-50`}>
                    <h3 className="text-sm font-bold text-gray-700 mb-3 flex items-center gap-2">
                        <svg className="w-4 h-4 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
                        </svg>
                        {t('google_settings.defaultDriveFolder')}
                    </h3>
                    <p className="text-[10px] text-gray-600 mb-4">{t('google_settings.browseFolderHelp')}</p>

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
                                {t('google_settings.driveRoot')}
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
                                {t('common.loading')}
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
                                            {t('common.select')}
                                        </button>
                                    </div>
                                ))}
                            </div>
                        ) : (
                            <div className="p-6 text-center text-sm text-gray-500">
                                {currentBrowsingFolderId ? t('google_settings.noFoldersOrFiles') : t('google_settings.noFoldersInDrive')}
                            </div>
                        )}
                    </div>
                </section>

                {selectedFolderId && (
                    <section className={`${isInline ? 'bg-white rounded-2xl p-6 shadow-sm border border-gray-100' : 'bg-gray-50 rounded-2xl p-5 border border-gray-100'}`}>
                        <div className="flex items-center justify-between p-3 bg-green-50 rounded-xl border border-green-200">
                        <div className="flex items-center gap-2 text-sm text-green-700">
                            <svg className="w-5 h-5 text-green-600" fill="currentColor" viewBox="0 0 24 24">
                                <path d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
                            </svg>
                            <div>
                                <div className="font-medium">{t('google_settings.selectedLabel')}</div>
                                <div className="text-xs text-green-600">{selectedFolderName}</div>
                            </div>
                        </div>
                        <button
                            onClick={() => clearFolderConfig()}
                            disabled={isClearingFolder}
                            className="text-xs bg-white text-green-700 hover:bg-green-100 px-3 py-1.5 rounded transition-colors border border-green-300 font-medium"
                        >
                            {t('common.clear')}
                        </button>
                        </div>
                    </section>
                )}

                <section className={`${isInline ? 'bg-white rounded-2xl p-6 shadow-sm border border-gray-100' : 'bg-gray-50 rounded-2xl p-5 border border-gray-100'}`}>
                    <div className="bg-gray-50 p-3 rounded-lg border border-gray-100">
                    <p className="text-[10px] text-gray-600 font-mono">
                        <strong>{t('common.tip')}:</strong> {t('google_settings.envFolderTipPrefix')} <code className="bg-white px-1 py-0.5 rounded">GOOGLE_DRIVE_FOLDER_ID</code> {t('google_settings.envFolderTipSuffix')}
                    </p>
                    </div>
                </section>
                </div>

            <div className={`shrink-0 ${isInline ? 'sticky bottom-0 bg-gray-50/80 backdrop-blur-sm pt-4 pb-4 border-t border-gray-200 -mx-6 px-6 z-10' : 'p-6 bg-gray-50 border-t border-gray-100'}`}>
                {testError && (
                    <div className="mb-3 flex items-start gap-2 p-3 rounded-xl bg-red-50 border border-red-200 text-red-800 text-sm" role="alert">
                        <svg className="w-5 h-5 shrink-0 mt-0.5 text-red-500" fill="currentColor" viewBox="0 0 20 20">
                            <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.28 7.22a.75.75 0 00-1.06 1.06L8.94 10l-1.72 1.72a.75.75 0 101.06 1.06L10 11.06l1.72 1.72a.75.75 0 101.06-1.06L11.06 10l1.72-1.72a.75.75 0 00-1.06-1.06L10 8.94 8.28 7.22z" clipRule="evenodd" />
                        </svg>
                        <span>{testError}</span>
                    </div>
                )}
                <div className="flex gap-3">
                    <button
                        onClick={onClose}
                        className="flex-1 py-2.5 text-sm font-bold text-gray-600 hover:bg-white rounded-xl transition-all border border-transparent hover:border-gray-200"
                    >
                        {t('common.cancel')}
                    </button>
                    <button
                        onClick={() => testDriveConnection()}
                        disabled={isTestingDrive || !clientId || !clientSecret}
                        className="flex-1 py-2.5 text-sm font-bold text-gray-700 bg-white hover:bg-gray-50 border border-gray-200 rounded-xl transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                    >
                        {isTestingDrive ? (
                            <>
                                <div className="w-4 h-4 border-2 border-gray-400 border-t-transparent rounded-full animate-spin"></div>
                                {t('google_settings.testing')}
                            </>
                        ) : (
                            t('google_settings.test')
                        )}
                    </button>
                    <button
                        onClick={handleSave}
                        disabled={isUpdating || !clientId || !clientSecret}
                        className="flex-1 py-2.5 text-sm font-black text-white bg-green-600 hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed rounded-2xl transition-all shadow-lg active:scale-95 flex items-center justify-center gap-2"
                    >
                        {isUpdating ? (
                            <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                        ) : t('ai_settings.save_button')}
                    </button>
                </div>
            </div>
        </div>
    );

    const notificationToast = notification ? (
        <div
            className={`fixed top-4 right-4 px-6 py-3 rounded-lg shadow-lg text-white font-medium z-[110] animate-in fade-in slide-in-from-right-5 ${notification.type === 'success' ? 'bg-green-600' : 'bg-red-600'}`}
            role={notification.type === 'error' ? 'alert' : 'status'}
        >
            {notification.message}
        </div>
    ) : null;

    if (isInline) {
        return (
            <>
                {notificationToast}
                {content}
            </>
        );
    }

    return (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[100] backdrop-blur-sm animate-in fade-in duration-200">
            {notificationToast}
            {content}
        </div>
    );
}
