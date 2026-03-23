import { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { 
    useGoogleAuthUrl, 
    useGoogleAuthStatus, 
    useGoogleLogout, 
    useCreateSpreadsheet, 
    useSyncToSheets, 
    useGoogleConfigStatus, 
    useScrapeResult,
    useScrapeResults 
} from '../hooks/useScraper';
import { GoogleSettings } from './GoogleSettings';
import { getApiRoot } from '../lib/api';

interface GoogleSheetsSyncProps {
    selectedFile?: string | null;
    isInline?: boolean;
}

export function GoogleSheetsSync({ selectedFile: propSelectedFile, isInline }: GoogleSheetsSyncProps) {
    const { t } = useTranslation();
    const { data: configStatus, isLoading: isLoadingConfig } = useGoogleConfigStatus();
    const { data: folderConfig } = useQuery({
        queryKey: ['googleFolderConfig'],
        queryFn: async () => {
            const res = await fetch(`${getApiRoot()}/sheets/folder-config`);
            const data = await res.json();
            return data.data;
        }
    });
    const { data: authStatus, isLoading: isLoadingAuth } = useGoogleAuthStatus();
    const { refetch: getAuthUrl } = useGoogleAuthUrl();
    const { mutate: logout } = useGoogleLogout();
    const { data: scrapeResults } = useScrapeResults();
    
    const [localSelectedFile, setLocalSelectedFile] = useState<string>('');
    const effectiveFile = propSelectedFile || localSelectedFile;

    const { data: spreadsheets, isLoading: isLoadingSheets, isError: isDriveError, error: driveError } = useQuery({
        queryKey: ['spreadsheets', folderConfig?.folderId],
        queryFn: async () => {
            const url = folderConfig?.folderId
                ? `${getApiRoot()}/sheets/list?folderId=${folderConfig.folderId}`
                : `${getApiRoot()}/sheets/list`;
            const res = await fetch(url);
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || 'Request failed');
            return data.data;
        },
        enabled: authStatus?.authenticated === true,
        retry: false
    });
    const isDriveConnectionError = isDriveError && (driveError as any)?.message && /invalid_grant|expired|revoked|401|unauthorized|not authenticated/i.test(String((driveError as any).message));
    const { mutate: createSheet, isPending: isCreating } = useCreateSpreadsheet();
    const { mutate: sync, isPending: isSyncing } = useSyncToSheets();
    const { data: scrapeResult } = useScrapeResult(effectiveFile);

    const [selectedSheetId, setSelectedSheetId] = useState<string>('');
    const [status, setStatus] = useState<{ message: string; type: 'info' | 'error' | 'success' } | null>(null);
    const [showSettings, setShowSettings] = useState(false);
    const [isHidden, setIsHidden] = useState(false);

    const sortedFiles = useMemo(() => {
        if (!scrapeResults) return [];
        return [...scrapeResults].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    }, [scrapeResults]);

    const handleConnect = async () => {
        const { data: url } = await getAuthUrl();
        if (url) {
            window.location.href = url;
        }
    };

    const handleCreateSheet = () => {
        const name = prompt(
            t('google_sheets.prompt_name'),
            t('google_sheets.default_sheet_name', { date: new Date().toLocaleDateString() })
        );
        if (name) {
            createSheet(name, {
                onSuccess: (data: any) => {
                    setSelectedSheetId(data.spreadsheetId);
                    setStatus({ message: t('google_sheets.create_success'), type: 'success' });
                },
                onError: (err: any) => {
                    setStatus({ message: t('google_sheets.create_fail', { error: err.message || t('common.unknown_error') }), type: 'error' });
                }
            });
        }
    };

    const handleSync = () => {
        if (!effectiveFile || !selectedSheetId) return;

        setStatus({ message: t('google_sheets.syncing'), type: 'info' });
        sync({ filename: effectiveFile, spreadsheetId: selectedSheetId }, {
            onSuccess: () => {
                setStatus({ message: t('google_sheets.sync_success'), type: 'success' });
                // Clear status after 3 seconds
                setTimeout(() => setStatus(null), 3000);
            },
            onError: (err: any) => {
                setStatus({ message: t('google_sheets.sync_fail', { error: err.message || t('common.unknown_error') }), type: 'error' });
            }
        });
    };

    if (isLoadingAuth || isLoadingConfig) return <div className="text-xs text-gray-400">{t('google_sheets.loading_status')}</div>;

    if (isHidden) return null;

    if (!configStatus?.configured) {
        return (
            <>
                <div className={`p-6 bg-white rounded-2xl shadow-sm border border-gray-100 flex flex-col gap-4 ${isInline ? '' : 'mt-4'}`}>
                    <div className="flex items-center justify-between text-gray-700 font-semibold mb-1">
                        <div className="flex items-center gap-2">
                            <svg className="w-5 h-5 text-gray-400" fill="currentColor" viewBox="0 0 24 24">
                                <path d="M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zM9 17H7v-2h2v2zm0-4H7v-2h2v2zm0-4H7V7h2v2zm4 8h-2v-2h2v2zm0-4h-2v-2h2v2zm0-4h-2V7h2v2zm4 8h-2v-2h2v2zm0-4h-2v-2h2v2zm0-4h-2V7h2v2z" />
                            </svg>
                            {t('google_sheets.title')}
                        </div>
                        {!isInline && (
                            <button onClick={() => setIsHidden(true)} className="text-gray-300 hover:text-gray-500" title={t('common.hide_section')}>
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
                                </svg>
                            </button>
                        )}
                    </div>
                    <p className="text-xs text-gray-500 italic">{t('google_sheets.not_configured')}</p>
                    <button
                        onClick={() => setShowSettings(true)}
                        className="w-full py-2.5 bg-white border border-gray-200 rounded-xl hover:bg-gray-50 transition-all text-sm font-bold text-gray-700 shadow-sm"
                    >
                        {t('google_sheets.configure_now')}
                    </button>
                </div>
                <GoogleSettings isOpen={showSettings} onClose={() => setShowSettings(false)} />
            </>
        );
    }

    if (!authStatus?.authenticated) {
        return (
            <>
                <div className={`p-6 bg-white rounded-2xl shadow-sm border border-gray-100 flex flex-col gap-4 ${isInline ? '' : 'mt-4'}`}>
                    <div className="flex items-center justify-between text-gray-700 font-semibold mb-1">
                        <div className="flex items-center gap-2 text-gray-700 font-semibold">
                            <svg className="w-5 h-5 text-green-600" fill="currentColor" viewBox="0 0 24 24">
                                <path d="M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zM9 17H7v-2h2v2zm0-4H7v-2h2v2zm0-4H7V7h2v2zm4 8h-2v-2h2v2zm0-4h-2v-2h2v2zm0-4h-2V7h2v2zm4 8h-2v-2h2v2zm0-4h-2v-2h2v2zm0-4h-2V7h2v2z" />
                            </svg>
                            {t('google_sheets.sync_title')}
                        </div>
                    </div>
                    <p className="text-sm text-gray-500">{t('google_sheets.connect_desc')}</p>
                    <button
                        onClick={handleConnect}
                        className="flex items-center justify-center gap-2 bg-white border border-gray-300 py-2.5 rounded-xl hover:bg-gray-50 transition-colors text-sm font-bold shadow-sm"
                    >
                        <svg className="w-4 h-4" viewBox="0 0 48 48">
                            <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z" />
                            <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z" />
                            <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24s.92 7.54 2.56 10.78l7.97-6.19z" />
                            <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z" />
                            <path fill="none" d="M0 0h48v48H0z" />
                        </svg>
                        {t('google_sheets.connect_button')}
                    </button>
                </div>
                <GoogleSettings isOpen={showSettings} onClose={() => setShowSettings(false)} />
            </>
        );
    }

    return (
        <>
            <div className={`p-6 bg-white rounded-2xl shadow-sm border border-gray-100 flex flex-col gap-4 ${isInline ? '' : 'mt-4'}`}>
                <div className="flex items-center justify-between text-gray-700 font-semibold mb-1">
                    <div className="flex items-center gap-2">
                        <svg className="w-5 h-5 text-green-600" fill="currentColor" viewBox="0 0 24 24">
                            <path d="M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zM9 17H7v-2h2v2zm0-4H7v-2h2v2zm0-4H7V7h2v2zm4 8h-2v-2h2v2zm0-4h-2v-2h2v2zm0-4h-2V7h2v2zm4 8h-2v-2h2v2zm0-4h-2v-2h2v2zm0-4h-2V7h2v2z" />
                        </svg>
                        {t('google_sheets.sync_title')}
                    </div>
                    <button
                        onClick={() => logout()}
                        className="inline-flex items-center gap-2 py-2 px-3 rounded-xl text-xs font-bold border-2 border-red-200 text-red-700 bg-red-50 hover:bg-red-100 hover:border-red-300 transition-colors"
                        title={t('google_sheets.disconnect')}
                    >
                        <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                        </svg>
                        {t('google_sheets.disconnect_button')}
                    </button>
                </div>

                {isDriveConnectionError && (
                    <div className="p-4 rounded-xl bg-amber-50 border border-amber-200 flex flex-col gap-3">
                        <p className="text-sm font-medium text-amber-800">{t('google_sheets.connection_error_prompt')}</p>
                        <button
                            onClick={handleConnect}
                            className="flex items-center justify-center gap-2 bg-white border-2 border-amber-400 py-3 px-4 rounded-xl hover:bg-amber-50 transition-colors text-sm font-bold text-amber-800 shadow-sm"
                        >
                            <svg className="w-5 h-5" viewBox="0 0 48 48">
                                <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z" />
                                <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z" />
                                <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24s.92 7.54 2.56 10.78l7.97-6.19z" />
                                <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z" />
                                <path fill="none" d="M0 0h48v48H0z" />
                            </svg>
                            {t('google_sheets.connect_button')}
                        </button>
                    </div>
                )}

                <div className="space-y-3">
                    {/* File Selection (Only if not provided via props) */}
                    {!propSelectedFile && (
                        <div className="flex flex-col gap-1">
                            <label className="text-[10px] uppercase tracking-wider text-gray-400 font-bold">
                                {t('google_sheets.select_source')}
                            </label>
                            <select
                                value={localSelectedFile}
                                onChange={(e) => setLocalSelectedFile(e.target.value)}
                                className="w-full text-sm border border-gray-200 rounded-xl p-2.5 bg-white focus:ring-2 focus:ring-green-500 outline-none shadow-sm"
                            >
                                <option value="">{t('google_sheets.select_file')}</option>
                                {sortedFiles.map(f => (
                                    <option key={f.filename} value={f.filename}>
                                        {f.filename.replace('.json', '')} ({f.transactionCount} txns)
                                    </option>
                                ))}
                            </select>
                        </div>
                    )}

                    <div className="flex flex-col gap-1">
                        <label className="text-[10px] uppercase tracking-wider text-gray-400 font-bold">
                            {t('google_sheets.target_spreadsheet')}
                            {folderConfig?.folderId && <span className="text-blue-600 ml-2">({t('google_sheets.from_folder')})</span>}
                        </label>
                        <div className="flex gap-2">
                            <select
                                value={selectedSheetId}
                                onChange={(e) => setSelectedSheetId(e.target.value)}
                                className="flex-1 text-sm border border-gray-200 rounded-xl p-2.5 bg-white focus:ring-2 focus:ring-green-500 outline-none shadow-sm"
                                disabled={isLoadingSheets}
                            >
                                <option value="">{folderConfig?.folderId ? t('google_sheets.select_sheet_folder') : t('google_sheets.select_sheet')}</option>
                                {spreadsheets?.map((s: any) => (
                                    <option key={s.id} value={s.id}>{s.name}</option>
                                ))}
                            </select>
                            <button
                                onClick={handleCreateSheet}
                                disabled={isCreating}
                                className="p-2.5 bg-green-50 text-green-600 rounded-xl hover:bg-green-100 transition-colors border border-green-100"
                                title={t('google_sheets.create_new')}
                            >
                                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4v16m8-8H4" />
                                </svg>
                            </button>
                        </div>
                        {folderConfig?.folderId && (
                            <div className="text-[9px] text-blue-600 mt-1 px-2">📁 {t('google_sheets.showing_from')} <strong>{folderConfig.folderName || folderConfig.folderId}</strong></div>
                        )}
                    </div>

                    {scrapeResult?.lastSync && (
                        <div className="pt-2 border-t border-gray-50 flex flex-col gap-1">
                            <div className="flex items-center justify-between text-[10px]">
                                <span className="text-gray-400">{t('google_sheets.last_synced')}</span>
                                <span className={`font-medium ${scrapeResult.lastSync.status === 'success' ? 'text-green-600' : 'text-red-600'}`}>
                                    {new Date(scrapeResult.lastSync.timestamp).toLocaleString()}
                                </span>
                            </div>
                            {scrapeResult.lastSync.status === 'failed' && (
                                <p className="text-[9px] text-red-500 italic">{t('common.error_with_message', { error: scrapeResult.lastSync.error })}</p>
                            )}
                        </div>
                    )}

                    <button
                        onClick={handleSync}
                        disabled={!effectiveFile || !selectedSheetId || isSyncing}
                        className={`w-full py-2.5 rounded-2xl text-sm font-black transition-all shadow-lg flex items-center justify-center gap-2 ${!effectiveFile || !selectedSheetId || isSyncing
                            ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
                            : 'bg-green-600 text-white hover:bg-green-700 active:scale-[0.98]'
                            }`}
                    >
                        {isSyncing ? (
                            <>
                                <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                                {t('google_sheets.syncing_button')}
                            </>
                        ) : (
                            <>
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16v1a2 2 0 002 2h12a2 2 0 002-2v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
                                </svg>
                                {t('google_sheets.sync_button_text')}
                            </>
                        )}
                    </button>

                    {status && (
                        <div className={`text-[10px] p-2 rounded border ${status.type === 'error' ? 'bg-red-50 text-red-600 border-red-100' :
                            status.type === 'success' ? 'bg-green-50 text-green-600 border-green-100' :
                                'bg-blue-50 text-blue-600 border-blue-100'
                            }`}>
                            {status.message}
                        </div>
                    )}

                    {!effectiveFile && (
                        <p className="text-[10px] text-gray-400 italic text-center">{t('google_sheets.select_hint')}</p>
                    )}
                </div>
            </div>
            <GoogleSettings isOpen={showSettings} onClose={() => setShowSettings(false)} />
        </>
    );
}
