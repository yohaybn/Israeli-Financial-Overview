import { useTranslation } from 'react-i18next';
import { ChevronDown, ChevronUp } from 'lucide-react';
import { useCollapsibleBanner } from '../hooks/useCollapsibleBanner';

export const DEMO_BANNER_STORAGE_KEY = 'demo-banner-seen';

export function DemoBanner() {
    const { t } = useTranslation();
    const { collapsed, expand, collapse } = useCollapsibleBanner(DEMO_BANNER_STORAGE_KEY);

    if (collapsed) {
        return (
            <div
                className="shrink-0 bg-violet-50 border-b border-violet-200 text-violet-950 px-4 py-1"
                role="status"
            >
                <div className="container mx-auto max-w-[1600px] flex items-center justify-center gap-2 text-xs">
                    <span className="truncate">{t('common.demo_banner_short')}</span>
                    <button
                        type="button"
                        onClick={expand}
                        aria-label={t('common.expand_section')}
                        className="shrink-0 text-violet-700 hover:text-violet-900"
                    >
                        <ChevronDown className="w-3.5 h-3.5" />
                    </button>
                </div>
            </div>
        );
    }

    return (
        <div
            className="shrink-0 bg-violet-50 border-b border-violet-200 text-violet-950 text-sm py-2 px-4"
            role="status"
        >
            <div className="container mx-auto max-w-[1600px] flex items-center justify-center gap-2">
                <span className="text-center">{t('common.demo_banner')}</span>
                <button
                    type="button"
                    onClick={collapse}
                    aria-label={t('common.collapse_section')}
                    className="shrink-0 text-violet-700 hover:text-violet-900"
                >
                    <ChevronUp className="w-4 h-4" />
                </button>
            </div>
        </div>
    );
}
