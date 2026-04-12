import { useEffect, useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ScrapeProgress } from '../ScrapeProgress';
import { ScrapeSettings } from '../ScrapeSettings';
import { ScraperForm } from '../ScraperForm';
import { ResultsExplorer } from '../ResultsExplorer';
import { useScrapeResults } from '../../hooks/useScraper';

interface ScrapeWorkspaceProps {
    onOpenImport: () => void;
    resultFile: string | null;
    onResultFileChange: (filename: string | null) => void;
}

export function ScrapeWorkspace({ onOpenImport, resultFile, onResultFileChange }: ScrapeWorkspaceProps) {
    const { t } = useTranslation();
    const [isScrapeSettingsOpen, setIsScrapeSettingsOpen] = useState(false);
    const { data: files } = useScrapeResults();

    const [isFormCollapsed, setIsFormCollapsed] = useState(true);

    const pickNewestFilename = useCallback(() => {
        if (!files?.length) return null;
        const sorted = [...files].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
        return sorted[0].filename;
    }, [files]);

    useEffect(() => {
        if (files === undefined) return;
        if (files.length === 0) {
            if (resultFile) onResultFileChange(null);
            return;
        }
        const names = new Set(files.map((f) => f.filename));
        if (resultFile && names.has(resultFile)) return;
        onResultFileChange(pickNewestFilename());
    }, [files, resultFile, onResultFileChange, pickNewestFilename]);

    const handleSelectFile = useCallback(
        (file: string) => {
            onResultFileChange(file);
        },
        [onResultFileChange]
    );

    return (
        <div className="flex flex-col h-full bg-gray-50">
            <div className="p-4 space-y-4 max-w-[1600px] mx-auto w-full">
                {/* Scraper Form Card */}
                <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
                    <div
                        className="lg:hidden p-4 bg-gray-50 flex justify-between items-center cursor-pointer border-b border-gray-100"
                        onClick={() => setIsFormCollapsed(!isFormCollapsed)}
                    >
                        <h3 className="font-bold text-gray-700 flex items-center gap-2">
                            <svg className="w-5 h-5 text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg>
                            {t('common.scrape')}
                        </h3>
                        <svg className={`w-5 h-5 text-gray-400 transition-transform ${isFormCollapsed ? '' : 'rotate-180'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" /></svg>
                    </div>
                    <div className={`${isFormCollapsed ? 'hidden' : 'block'} lg:block p-4 lg:p-6`}>
                        <ScraperForm onOpenSettings={() => setIsScrapeSettingsOpen(true)} />
                    </div>
                </div>

                {/* Results Viewer - Full Width Below */}
                <div className="bg-white rounded-2xl shadow-lg border border-gray-200 overflow-hidden min-h-[600px]">
                    <ResultsExplorer
                        layout="viewer-only"
                        onOpenImport={onOpenImport}
                        externalSelectedFile={resultFile}
                        onExternalSelectFile={handleSelectFile}
                    />
                </div>
            </div>

            <ScrapeProgress />

            <ScrapeSettings
                isOpen={isScrapeSettingsOpen}
                onClose={() => setIsScrapeSettingsOpen(false)}
            />
        </div>
    );
}
