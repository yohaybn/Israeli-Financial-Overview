import { useState } from 'react';
import { ScrapeProgress } from '../ScrapeProgress';
import { ScrapeSettings } from '../ScrapeSettings';
import { ScraperForm } from '../ScraperForm';
import { ResultsExplorer } from '../ResultsExplorer';

interface ScrapeWorkspaceProps {
    onOpenImport: () => void;
}

export function ScrapeWorkspace({ onOpenImport }: ScrapeWorkspaceProps) {
    const [isScrapeSettingsOpen, setIsScrapeSettingsOpen] = useState(false);

    return (
        <div className="p-4 space-y-4">
            <ScraperForm onOpenSettings={() => setIsScrapeSettingsOpen(true)} />
            <ScrapeProgress />

            <ResultsExplorer
                layout="stacked"
                onOpenImport={onOpenImport}
            />

            <ScrapeSettings
                isOpen={isScrapeSettingsOpen}
                onClose={() => setIsScrapeSettingsOpen(false)}
            />
        </div>
    );
}

