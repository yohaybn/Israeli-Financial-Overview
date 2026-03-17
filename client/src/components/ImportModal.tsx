import { useState, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { useImportFiles } from '../hooks/useScraper';

interface ImportModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSuccess?: (importResults: any[]) => void;
}

interface FileStatus {
    name: string;
    status: 'pending' | 'success' | 'error';
    error?: string;
}

export function ImportModal({ isOpen, onClose, onSuccess }: ImportModalProps) {
    const { t } = useTranslation();
    const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
    const [fileStatuses, setFileStatuses] = useState<FileStatus[]>([]);
    const [isComplete, setIsComplete] = useState(false);
    const [accountNumberOverride, setAccountNumberOverride] = useState('');
    const [useAi, setUseAi] = useState(false);
    const { mutate: importFiles, isPending: isUploading, error: importError } = useImportFiles();
    const fileInputRef = useRef<HTMLInputElement>(null);

    if (!isOpen) return null;

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files) {
            const files = Array.from(e.target.files);
            const validFiles = files.filter(f => {
                const ext = f.name.split('.').pop()?.toLowerCase();
                return ['xls', 'xlsx', 'pdf', 'json'].includes(ext || '');
            });
            setSelectedFiles(prev => [...prev, ...validFiles]);
            setIsComplete(false);
            setFileStatuses([]);
        }
    };

    const removeFile = (index: number) => {
        setSelectedFiles(prev => prev.filter((_, i) => i !== index));
    };

    const handleUpload = () => {
        if (selectedFiles.length === 0) return;

        importFiles({ files: selectedFiles, accountNumberOverride, useAi }, {
            onSuccess: (data) => {
                setFileStatuses(data.results.map((r: any) => ({
                    name: r.originalName,
                    status: r.success ? 'success' : 'error',
                    error: r.error
                })));
                setIsComplete(true);

                if (data.success && data.allSuccessful) {
                    onSuccess?.(data.results);
                    setSelectedFiles([]);
                    setTimeout(() => {
                        onClose();
                        setIsComplete(false);
                        setFileStatuses([]);
                    }, 2000);
                } else if (data.success) {
                    onSuccess?.(data.results);
                }
            }
        });
    };

    const handleDragOver = (e: React.DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
    };

    const handleDrop = (e: React.DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
        if (e.dataTransfer.files) {
            const files = Array.from(e.dataTransfer.files);
            const validFiles = files.filter(f => {
                const ext = f.name.split('.').pop()?.toLowerCase();
                return ['xls', 'xlsx', 'pdf', 'json'].includes(ext || '');
            });
            setSelectedFiles(prev => [...prev, ...validFiles]);
            setIsComplete(false);
            setFileStatuses([]);
        }
    };

    const resetAndClose = () => {
        setSelectedFiles([]);
        setFileStatuses([]);
        setAccountNumberOverride('');
        setUseAi(false);
        setIsComplete(false);
        onClose();
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
            <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg max-h-[90vh] flex flex-col overflow-hidden border border-gray-200">
                <div className="p-6 border-b border-gray-100 flex justify-between items-center">
                    <h2 className="text-xl font-bold text-gray-800">{t('explorer.import_files')}</h2>
                    <button onClick={resetAndClose} className="text-gray-400 hover:text-gray-600">
                        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
                        </svg>
                    </button>
                </div>

                <div className="flex-1 overflow-y-auto p-6 space-y-4">
                    {!isComplete && (
                        <>
                            <p className="text-gray-600 text-sm">{t('explorer.import_description')}</p>

                            <div
                                onDragOver={handleDragOver}
                                onDrop={handleDrop}
                                onClick={() => fileInputRef.current?.click()}
                                className="border-2 border-dashed border-gray-300 rounded-lg p-8 text-center hover:border-blue-500 hover:bg-blue-50 transition-all cursor-pointer group"
                            >
                                <input
                                    type="file"
                                    ref={fileInputRef}
                                    onChange={handleFileChange}
                                    multiple
                                    accept=".xls,.xlsx,.pdf,.json"
                                    className="hidden"
                                />
                                <div className="flex flex-col items-center">
                                    <svg className="w-12 h-12 text-gray-400 group-hover:text-blue-500 mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                                    </svg>
                                    <span className="text-sm font-medium text-gray-700">{t('explorer.drop_files')}</span>
                                    <span className="text-xs text-gray-400 mt-1">{t('explorer.supportedFormats')}</span>
                                </div>
                            </div>

                            <div className="space-y-1">
                                <label htmlFor="accountNumber" className="text-xs font-semibold text-gray-500 uppercase tracking-wider">
                                    {t('common.account_number')} ({t('common.optional')})
                                </label>
                                <input
                                    id="accountNumber"
                                    type="text"
                                    value={accountNumberOverride}
                                    onChange={(e) => setAccountNumberOverride(e.target.value)}
                                    placeholder={t('common.account_number')}
                                    className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition-all text-sm"
                                    disabled={isUploading}
                                />
                                <p className="text-[10px] text-gray-400 italic">
                                    {t('common.auto_detection_hint')}
                                </p>
                            </div>

                            <div className="flex items-center gap-3 p-3 bg-indigo-50 rounded-lg border border-indigo-100 group transition-all hover:bg-indigo-100/50">
                                <label className="relative inline-flex items-center cursor-pointer">
                                    <input
                                        type="checkbox"
                                        checked={useAi}
                                        onChange={(e) => setUseAi(e.target.checked)}
                                        className="sr-only peer"
                                        disabled={isUploading}
                                    />
                                    <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-indigo-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-indigo-600"></div>
                                </label>
                                <div className="flex flex-col">
                                    <span className="text-sm font-semibold text-indigo-900 flex items-center gap-2">
                                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 10V3L4 14h7v7l9-11h-7z" />
                                        </svg>
                                        {t('explorer.use_ai_parsing')}
                                    </span>
                                    <span className="text-[10px] text-indigo-700/70">
                                        {t('explorer.ai_parsing_desc')}
                                    </span>
                                </div>
                            </div>
                        </>
                    )}

                    {(selectedFiles.length > 0 || fileStatuses.length > 0) && (
                        <div className="max-h-60 overflow-y-auto space-y-2 border rounded-lg p-2 bg-gray-50">
                            {isComplete ? (
                                fileStatuses.map((file, idx) => (
                                    <div key={idx} className={`flex items-center justify-between p-3 rounded border text-sm ${file.status === 'success' ? 'bg-green-50 border-green-200 text-green-700' : 'bg-red-50 border-red-200 text-red-700'}`}>
                                        <div className="flex items-center gap-2 overflow-hidden">
                                            {file.status === 'success' ? (
                                                <svg className="w-5 h-5 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                                                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                                                </svg>
                                            ) : (
                                                <svg className="w-5 h-5 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                                                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                                                </svg>
                                            )}
                                            <div className="flex flex-col overflow-hidden">
                                                <span className="truncate font-medium">{file.name}</span>
                                                {file.error && <span className="text-xs opacity-80">{file.error}</span>}
                                            </div>
                                        </div>
                                    </div>
                                ))
                            ) : (
                                selectedFiles.map((file, idx) => (
                                    <div key={idx} className="flex items-center justify-between p-2 bg-white rounded border border-gray-200 text-sm">
                                        <div className="flex items-center gap-2 overflow-hidden">
                                            <svg className="w-4 h-4 flex-shrink-0 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                                            </svg>
                                            <span className="truncate">{file.name}</span>
                                        </div>
                                        <button onClick={(e) => { e.stopPropagation(); removeFile(idx); }} className="text-red-500 hover:text-red-700 ml-2">
                                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
                                            </svg>
                                        </button>
                                    </div>
                                ))
                            )}
                        </div>
                    )}

                    {importError && (
                        <div className="p-3 bg-red-50 text-red-700 text-xs rounded border border-red-200">
                            {(importError as any).message || t('common.error')}
                        </div>
                    )}
                </div>

                <div className="p-6 border-t border-gray-100 flex justify-end gap-3">
                    {isComplete ? (
                        <button
                            onClick={resetAndClose}
                            className="px-6 py-2 text-sm font-medium bg-gray-800 text-white rounded-lg hover:bg-gray-900 transition-all shadow-md active:scale-95"
                        >
                            {t('common.close')}
                        </button>
                    ) : (
                        <>
                            <button
                                onClick={onClose}
                                className="px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
                                disabled={isUploading}
                            >
                                {t('common.cancel')}
                            </button>
                            <button
                                onClick={handleUpload}
                                disabled={selectedFiles.length === 0 || isUploading}
                                className={`px-6 py-2 text-sm font-medium text-white rounded-lg transition-all shadow-md ${selectedFiles.length === 0 || isUploading ? 'bg-blue-400 cursor-not-allowed' : 'bg-blue-600 hover:bg-blue-700 hover:shadow-lg active:scale-95'}`}
                            >
                                {isUploading ? (
                                    <span className="flex items-center gap-2">
                                        <svg className="animate-spin h-4 w-4 text-white" fill="none" viewBox="0 0 24 24">
                                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                                        </svg>
                                        {t('explorer.uploading')}
                                    </span>
                                ) : t('common.save')}
                            </button>
                        </>
                    )}
                </div>
            </div>
        </div >
    );
}
