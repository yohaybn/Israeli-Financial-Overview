import { useMemo, useState } from 'react';
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
    const [isAdvancedOpen, setIsAdvancedOpen] = useState(false);
    const errors = useMemo(() => {
        const next: { outlierZScore?: string; foreignCurrencyMinOriginalAmount?: string } = {};
        if ((thresholds.outlierZScore ?? 0) <= 0) {
            next.outlierZScore = t('config_validation.min_value', { min: 0.1 });
        }
        if ((thresholds.foreignCurrencyMinOriginalAmount ?? 0) < 0) {
            next.foreignCurrencyMinOriginalAmount = t('config_validation.min_value', { min: 0 });
        }
        return next;
    }, [thresholds, t]);
    const updateValidatedThreshold = (
        key: 'outlierZScore' | 'foreignCurrencyMinOriginalAmount',
        rawValue: string,
        min: number
    ) => {
        const trimmed = rawValue.trim();
        if (!trimmed) return;
        const next = Number(trimmed);
        if (!Number.isFinite(next) || next < min) return;
        onThresholdChange({ [key]: next });
    };

    return (
        <ConfigSectionCard title={t('fraud_settings.thresholds')} subtitle={t('fraud_settings.thresholds_intro')}>
            <div className="rounded-xl bg-slate-50 border border-slate-200/70">
                <button
                    type="button"
                    onClick={() => setIsAdvancedOpen((prev) => !prev)}
                    className="w-full px-4 py-3 text-left text-sm font-semibold text-slate-700"
                >
                    {t('config_sidebar.show_advanced')}
                </button>
                <div className={isAdvancedOpen ? 'grid gap-4 px-4 pb-4 sm:grid-cols-2' : 'hidden'}>
                    <div className="space-y-1.5">
                        <label className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                            {t('fraud_settings.outlier_zscore')}
                        </label>
                        <input
                            type="number"
                            step="0.1"
                            value={thresholds.outlierZScore ?? ''}
                            onChange={(e) => updateValidatedThreshold('outlierZScore', e.target.value, 0.1)}
                            className={inputClass}
                        />
                        {errors.outlierZScore && <p className="text-rose-500 text-xs mt-1">{errors.outlierZScore}</p>}
                    </div>
                    <div className="space-y-1.5">
                        <label className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                            {t('fraud_settings.min_fx_amount')}
                        </label>
                        <input
                            type="number"
                            value={thresholds.foreignCurrencyMinOriginalAmount ?? ''}
                            onChange={(e) => updateValidatedThreshold('foreignCurrencyMinOriginalAmount', e.target.value, 0)}
                            className={inputClass}
                        />
                        {errors.foreignCurrencyMinOriginalAmount && (
                            <p className="text-rose-500 text-xs mt-1">{errors.foreignCurrencyMinOriginalAmount}</p>
                        )}
                    </div>
                </div>
            </div>
        </ConfigSectionCard>
    );
}
