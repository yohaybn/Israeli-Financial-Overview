import { useTranslation } from 'react-i18next';
import type { FraudDetectionLocalThresholdsConfig } from '@app/shared';
import { ConfigSectionCard } from './ConfigSectionCard';

interface ParsingEngineCardProps {
    thresholds: FraudDetectionLocalThresholdsConfig;
    onThresholdChange: (patch: Partial<FraudDetectionLocalThresholdsConfig>) => void;
}

const inputClass =
    'w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20';

export function ParsingEngineCard({ thresholds, onThresholdChange }: ParsingEngineCardProps) {
    const { t } = useTranslation();

    return (
        <ConfigSectionCard title={t('fraud_settings.thresholds')} subtitle={t('fraud_settings.thresholds_intro')}>
            <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-1.5">
                    <label className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                        {t('fraud_settings.outlier_zscore')}
                    </label>
                    <input
                        type="number"
                        step="0.1"
                        value={thresholds.outlierZScore ?? ''}
                        onChange={(e) => onThresholdChange({ outlierZScore: Number(e.target.value || 0) })}
                        className={inputClass}
                    />
                </div>
                <div className="space-y-1.5">
                    <label className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                        {t('fraud_settings.min_fx_amount')}
                    </label>
                    <input
                        type="number"
                        value={thresholds.foreignCurrencyMinOriginalAmount ?? ''}
                        onChange={(e) => onThresholdChange({ foreignCurrencyMinOriginalAmount: Number(e.target.value || 0) })}
                        className={inputClass}
                    />
                </div>
            </div>
        </ConfigSectionCard>
    );
}
