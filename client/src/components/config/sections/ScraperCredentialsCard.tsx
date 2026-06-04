import { useTranslation } from 'react-i18next';
import type { GlobalScrapeConfig } from '@app/shared';
import { ConfigSectionCard } from './ConfigSectionCard';
import { ToggleSwitch } from '../../ToggleSwitch';

interface ScraperCredentialsCardProps {
    config: GlobalScrapeConfig;
    onToggle: (key: 'showBrowser' | 'verbose' | 'combineInstallments', value: boolean) => void;
}

export function ScraperCredentialsCard({ config, onToggle }: ScraperCredentialsCardProps) {
    const { t } = useTranslation();

    return (
        <ConfigSectionCard title={t('scraper.global_options')} subtitle={t('scraper.config_desc')}>
            <div className="space-y-3">
                <ToggleSwitch
                    checked={Boolean(config.scraperOptions.showBrowser)}
                    onChange={(next) => onToggle('showBrowser', next)}
                    label={t('scraper.show_browser')}
                    description={t('scraper.show_browser_desc')}
                />
                <ToggleSwitch
                    checked={config.scraperOptions.verbose ?? true}
                    onChange={(next) => onToggle('verbose', next)}
                    label={t('scraper.verbose')}
                    description={t('scraper.verbose_desc')}
                />
                <ToggleSwitch
                    checked={Boolean(config.scraperOptions.combineInstallments)}
                    onChange={(next) => onToggle('combineInstallments', next)}
                    label={t('scraper.combine_installments')}
                    description={t('scraper.combine_installments_desc')}
                />
            </div>
        </ConfigSectionCard>
    );
}
