import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ScrapeProgress } from '../ScrapeProgress';
import { ScrapeSettings } from '../ScrapeSettings';
import { ScraperForm } from '../ScraperForm';
import { ScrapeSchedulerSection } from '../SchedulerSettings';
import { ImportModal } from '../ImportModal';
import { CollapsibleCard } from '../CollapsibleCard';

interface ScrapeWorkspaceProps {
    onOpenImportProfile: () => void;
    onViewInLogs?: (logId: string, filename?: string | null) => void;
}

export function ScrapeWorkspace({ onOpenImportProfile, onViewInLogs }: ScrapeWorkspaceProps) {
    const { t } = useTranslation();
    const [isScrapeSettingsOpen, setIsScrapeSettingsOpen] = useState(false);
    const [isFormCollapsed, setIsFormCollapsed] = useState(true);

    return (
        <div className="flex flex-col h-full bg-gray-50">
            <div className="p-4 space-y-4 max-w-[1600px] mx-auto w-full">
                <header className="rounded-xl border border-gray-200 bg-white px-4 py-3 shadow-sm">
                    <h2 className="text-base font-bold text-gray-900">{t('common.scrape')}</h2>
                    <p className="mt-0.5 text-xs text-gray-500 sm:text-sm">{t('scrape_workspace.subtitle')}</p>
                </header>

                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 items-start">
                    <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden min-w-0 h-full">
                        <div
                            className="lg:hidden p-4 bg-gray-50 flex justify-between items-center cursor-pointer border-b border-gray-100"
                            onClick={() => setIsFormCollapsed(!isFormCollapsed)}
                        >
                            <h3 className="font-bold text-gray-700 flex items-center gap-2">
                                <svg className="w-5 h-5 text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path
                                        strokeLinecap="round"
                                        strokeLinejoin="round"
                                        strokeWidth="2"
                                        d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"
                                    />
                                </svg>
                                {t('scraper.new_scrape')}
                            </h3>
                            <svg
                                className={`w-5 h-5 text-gray-400 transition-transform ${isFormCollapsed ? '' : 'rotate-180'}`}
                                fill="none"
                                stroke="currentColor"
                                viewBox="0 0 24 24"
                            >
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" />
                            </svg>
                        </div>
                        <div className="hidden lg:flex px-6 pt-6 pb-2 border-b border-gray-100">
                            <h3 className="font-bold text-gray-900">{t('scraper.new_scrape')}</h3>
                        </div>
                        <div className={`${isFormCollapsed ? 'hidden' : 'block'} lg:block p-4 lg:px-6 lg:pb-6 lg:pt-4`}>
                            <ScraperForm onOpenSettings={() => setIsScrapeSettingsOpen(true)} />
                            <ScrapeSchedulerSection embedded />
                        </div>
                    </div>

                    <CollapsibleCard
                        title={t('explorer.import_files')}
                        subtitle={t('explorer.import_description')}
                        defaultOpen
                        className="min-w-0 h-full"
                        bodyClassName="px-6 pb-6 pt-0"
                    >
                        <ImportModal isInline onOpenImportProfile={onOpenImportProfile} />
                    </CollapsibleCard>
                </div>
            </div>

            <ScrapeProgress onViewInLogs={onViewInLogs} />

            <ScrapeSettings isOpen={isScrapeSettingsOpen} onClose={() => setIsScrapeSettingsOpen(false)} />
        </div>
    );
}
