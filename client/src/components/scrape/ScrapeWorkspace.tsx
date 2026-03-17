import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { ScrapeProgress } from '../ScrapeProgress';
import { ScrapeSettings } from '../ScrapeSettings';
import { ScraperForm } from '../ScraperForm';
import { ResultsExplorer } from '../ResultsExplorer';
import { useScrapeResults } from '../../hooks/useScraper';

interface ScrapeWorkspaceProps {
    onOpenImport: () => void;
}

export function ScrapeWorkspace({ onOpenImport }: ScrapeWorkspaceProps) {
    const { t } = useTranslation();
    const [isScrapeSettingsOpen, setIsScrapeSettingsOpen] = useState(false);
    const { data: files } = useScrapeResults();

    // Re-use logic for selected files if we want them to persist or be shared
    const [selectedFiles, setSelectedFiles] = useState<string[]>([]);
    const [isFormCollapsed, setIsFormCollapsed] = useState(true);

    // Auto-select most recent file if none selected
    useEffect(() => {
        if (selectedFiles.length === 0 && files && files.length > 0) {
            const sorted = [...files].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
            setSelectedFiles([sorted[0].filename]);
        }
    }, [files, selectedFiles.length]);

    const handleFileClick = (file: string) => {
        if (selectedFiles.includes(file)) {
            setSelectedFiles(selectedFiles.filter(f => f !== file));
        } else {
            setSelectedFiles([...selectedFiles, file]);
        }
    };



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
                        externalSelectedFiles={selectedFiles}
                        onExternalToggleFile={handleFileClick}
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

