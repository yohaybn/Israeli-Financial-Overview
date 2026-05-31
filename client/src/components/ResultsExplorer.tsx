import { useState, useMemo, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { useScrapeResults, useDeleteScrapeResult } from '../hooks/useScraper';
import { ScrapeResultPanel } from './ScrapeResultPanel';

interface ResultsExplorerProps {
    externalSelectedFile?: string | null;
    onExternalSelectFile?: (filename: string) => void;
}

export function ResultsExplorer({ externalSelectedFile, onExternalSelectFile }: ResultsExplorerProps) {
    const { t } = useTranslation();
    const { data: files, isLoading: isLoadingList } = useScrapeResults();
    const { mutate: deleteResult } = useDeleteScrapeResult();
    const [internalSelectedFile, setInternalSelectedFile] = useState<string | null>(null);
    const [isDropdownOpen, setIsDropdownOpen] = useState(false);
    const [notification, setNotification] = useState<{ type: 'success' | 'error' | 'info' | 'warning'; message: string } | null>(null);

    const stripJsonExtension = (filename: string) => (filename.endsWith('.json') ? filename.slice(0, -5) : filename);

    const sortedFiles = useMemo(() => {
        return [...(files || [])].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    }, [files]);

    const selectedFile = externalSelectedFile !== undefined ? externalSelectedFile : internalSelectedFile;

    const showNotification = useCallback((type: 'success' | 'error' | 'info' | 'warning', message: string) => {
        setNotification({ type, message });
        setTimeout(() => setNotification(null), 5000);
    }, []);

    const handleFileClick = (file: string) => {
        if (onExternalSelectFile) {
            onExternalSelectFile(file);
        } else {
            setInternalSelectedFile(file);
        }
        setIsDropdownOpen(false);
    };

    if (isLoadingList) {
        return (
            <div className="flex items-center justify-center py-12 text-gray-400">
                <div className="animate-pulse text-sm">{t('explorer.loading_explorer')}</div>
            </div>
        );
    }

    return (
        <div className="flex flex-col">
            {notification && (
                <div
                    className={`fixed top-4 right-4 px-6 py-3 rounded-lg shadow-lg text-white font-medium z-50 ${
                        notification.type === 'success' ? 'bg-green-600' : notification.type === 'error' ? 'bg-red-600' : 'bg-blue-600'
                    }`}
                >
                    {notification.message}
                </div>
            )}

            <div className="flex flex-wrap items-center gap-3 mb-4">
                <div className="relative">
                    <button
                        type="button"
                        onClick={() => setIsDropdownOpen(!isDropdownOpen)}
                        className="flex items-center gap-2 px-4 py-2 bg-gray-50 hover:bg-gray-100 border border-gray-200 rounded-xl text-sm font-semibold text-gray-700 min-w-[200px]"
                    >
                        <span className="flex-1 text-start overflow-hidden text-ellipsis">
                            {!selectedFile ? t('explorer.select_record') : stripJsonExtension(selectedFile)}
                        </span>
                        <svg
                            className={`w-4 h-4 text-gray-400 shrink-0 transition-transform ${isDropdownOpen ? 'rotate-180' : ''}`}
                            fill="none"
                            stroke="currentColor"
                            viewBox="0 0 24 24"
                        >
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" />
                        </svg>
                    </button>

                    {isDropdownOpen && (
                        <div className="absolute top-full start-0 mt-2 w-72 bg-white rounded-xl shadow-xl border border-gray-100 z-30 max-h-96 overflow-y-auto">
                            <div className="p-2 border-b border-gray-50 flex items-center justify-between bg-gray-50/50 sticky top-0">
                                <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider px-2">
                                    {t('explorer.scrape_results')}
                                </span>
                                <span className="text-[10px] bg-gray-200 px-2 py-0.5 rounded-full font-bold text-gray-500">
                                    {files?.length || 0}
                                </span>
                            </div>
                            <div className="py-1">
                                {sortedFiles.map((file) => (
                                    <div
                                        key={file.filename}
                                        onClick={() => handleFileClick(file.filename)}
                                        className={`px-4 py-3 hover:bg-blue-50 cursor-pointer flex items-center justify-between group border-b border-gray-50 last:border-0 ${
                                            selectedFile === file.filename ? 'bg-blue-50/50' : ''
                                        }`}
                                    >
                                        <div className="flex flex-col overflow-hidden">
                                            <span
                                                className={`text-sm truncate ${
                                                    selectedFile === file.filename ? 'font-bold text-blue-700' : 'text-gray-700'
                                                }`}
                                            >
                                                {stripJsonExtension(file.filename)}
                                            </span>
                                            <span className="text-[10px] text-gray-400 truncate">
                                                {file.transactionCount} txns • {new Date(file.createdAt).toLocaleDateString()}
                                            </span>
                                        </div>
                                        <button
                                            type="button"
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                if (confirm(t('explorer.confirm_delete'))) {
                                                    deleteResult(file.filename, {
                                                        onSuccess: () => {
                                                            if (onExternalSelectFile === undefined && selectedFile === file.filename) {
                                                                setInternalSelectedFile(null);
                                                            }
                                                            showNotification('success', t('explorer.delete_success'));
                                                        },
                                                    });
                                                }
                                            }}
                                            className="p-1.5 text-gray-300 hover:text-red-500 hover:bg-red-50 rounded-lg opacity-0 group-hover:opacity-100 transition-all flex-shrink-0"
                                        >
                                            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                <path
                                                    strokeLinecap="round"
                                                    strokeLinejoin="round"
                                                    strokeWidth="2"
                                                    d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                                                />
                                            </svg>
                                        </button>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}
                </div>
            </div>

            {!selectedFile ? (
                <p className="text-sm text-gray-400 py-6 text-center">{t('explorer.select_record')}</p>
            ) : (
                <ScrapeResultPanel filename={selectedFile} />
            )}
        </div>
    );
}
