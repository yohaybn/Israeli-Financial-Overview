import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';

export interface ScrapeResultFileMeta {
    filename: string;
    transactionCount: number;
    accountCount: number;
    createdAt: string;
}

interface ScrapeFileListProps {
    files: ScrapeResultFileMeta[];
    selectedFiles: string[];
    onToggleFile: (filename: string) => void;
    onSelectAll: (checked: boolean) => void;
    onRenameClick: (filename: string) => void;
    onDeleteClick: (filename: string) => void;
    onOpenImport?: () => void;
}

export function ScrapeFileList({
    files,
    selectedFiles,
    onToggleFile,
    onSelectAll,
    onRenameClick,
    onDeleteClick,
    onOpenImport
}: ScrapeFileListProps) {
    const { t } = useTranslation();

    const sortedFiles = useMemo(() => {
        return [...(files || [])].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    }, [files]);

    const stripJsonExtension = (filename: string) => (filename.endsWith('.json') ? filename.slice(0, -5) : filename);

    return (
        <div className="border border-gray-200 bg-white shadow-inner rounded-xl overflow-hidden">
            <div className="p-4 bg-gray-50 border-b border-gray-200 font-bold text-gray-600 flex justify-between items-center sticky top-0 z-20 group/sidebar">
                <div className="flex flex-col">
                    <span className="text-xs uppercase tracking-tighter text-gray-400">{t('explorer.records')}</span>
                    <div className="flex items-center gap-2">
                        <span>{t('explorer.scrape')}</span>
                        <span className="text-[10px] bg-gray-200 px-2 py-0.5 rounded-full">{files?.length || 0}</span>
                    </div>
                </div>
                <div className="flex items-center gap-2">
                    <input
                        type="checkbox"
                        checked={sortedFiles.length > 0 && selectedFiles.length === sortedFiles.length}
                        onChange={(e) => onSelectAll(e.target.checked)}
                        className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500 cursor-pointer"
                        title={t('explorer.select_all')}
                    />

                    {onOpenImport && (
                        <button
                            onClick={onOpenImport}
                            className="w-9 h-9 flex items-center justify-center hover:bg-white hover:text-blue-600 rounded-full transition-all border border-transparent hover:border-blue-100 shadow-sm bg-white md:bg-transparent text-gray-500"
                            title={t('explorer.import_files')}
                        >
                            <span className="text-xl leading-none font-black">+</span>
                        </button>
                    )}
                </div>
            </div>

            <ul>
                {selectedFiles.length > 1 && (
                    <li className="p-3 bg-blue-50 border-b border-blue-100 text-xs text-blue-700 font-medium">
                        {selectedFiles.length === 1
                            ? t('explorer.files_selected_count', { count: selectedFiles.length })
                            : t('explorer.files_selected_count_plural', { count: selectedFiles.length })}
                    </li>
                )}
                {sortedFiles.map((file) => (
                    <li
                        key={file.filename}
                        onClick={() => onToggleFile(file.filename)}
                        className={`p-4 border-b border-gray-100 cursor-pointer hover:bg-blue-50 transition-all flex items-center justify-between group ${selectedFiles.includes(file.filename) ? 'bg-blue-100 border-l-4 border-blue-500 shadow-inner' : ''}`}
                    >
                        <div className="flex items-center gap-3">
                            <div className={`w-4 h-4 rounded border-2 flex items-center justify-center transition-all ${selectedFiles.includes(file.filename) ? 'bg-blue-600 border-blue-600 rotate-0 scale-110' : 'border-gray-300 rotate-90 scale-100 group-hover:border-blue-400'}`}>
                                {selectedFiles.includes(file.filename) && (
                                    <svg className="w-3 h-3 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M5 13l4 4L19 7" />
                                    </svg>
                                )}
                            </div>
                            <div className="flex flex-col">
                                <span className="text-sm font-semibold text-gray-800 break-all">{stripJsonExtension(file.filename)}</span>
                                <span className="text-[10px] text-gray-400 mt-1">{file.transactionCount} transactions • {file.accountCount} accounts</span>
                            </div>
                        </div>
                        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                            <button
                                onClick={(e) => { e.stopPropagation(); onRenameClick(file.filename); }}
                                className="p-1.5 text-gray-400 hover:text-blue-600 transition-all rounded-md hover:bg-blue-50"
                                title={t('common.rename')}
                            >
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                                </svg>
                            </button>
                            <button
                                onClick={(e) => { e.stopPropagation(); onDeleteClick(file.filename); }}
                                className="p-1.5 text-gray-400 hover:text-red-500 transition-all rounded-md hover:bg-red-50"
                                title={t('common.delete')}
                            >
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                </svg>
                            </button>
                        </div>
                    </li>
                ))}
                {files?.length === 0 && (
                    <li className="p-10 text-center text-gray-400 italic">
                        <svg className="w-12 h-12 mx-auto mb-2 opacity-20" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4" />
                        </svg>
                        {t('explorer.no_results')}
                    </li>
                )}
            </ul>
        </div>
    );
}

