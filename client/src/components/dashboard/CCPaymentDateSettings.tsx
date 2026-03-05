import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useDashboardConfig } from '../../hooks/useDashboardConfig';

export function CCPaymentDateSettings() {
    const { t } = useTranslation();
    const { config, updateConfig } = useDashboardConfig();
    const [isOpen, setIsOpen] = useState(false);

    const [draftDate, setDraftDate] = useState(config.ccPaymentDate);
    const [draftForecastMonths, setDraftForecastMonths] = useState(config.forecastMonths ?? 6);

    const COMMON_DATES = [1, 2, 10, 15, 20, 28];
    const FORECAST_OPTIONS = [3, 6, 12];

    const handleSave = () => {
        updateConfig({
            ccPaymentDate: draftDate,
            forecastMonths: draftForecastMonths,
        });
        setIsOpen(false);
    };

    const removeKeyword = (kw: string) => {
        updateConfig({
            customCCKeywords: (config.customCCKeywords ?? []).filter(k => k !== kw),
        });
    };

    return (
        <div className="relative inline-block">
            <button
                onClick={() => setIsOpen(!isOpen)}
                className="p-2 text-gray-500 hover:text-gray-800 hover:bg-white/50 rounded-xl transition-colors flex items-center gap-2 group border border-transparent hover:border-gray-200"
                title={t('dashboard.dashboard_settings', 'Dashboard Settings')}
            >
                <div className="bg-white p-1.5 rounded-lg shadow-sm group-hover:shadow border border-gray-100">
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                    </svg>
                </div>
            </button>

            {isOpen && (
                <>
                    <div className="fixed inset-0 z-40" onClick={() => setIsOpen(false)} />
                    <div className="absolute right-0 mt-2 w-80 bg-white/95 backdrop-blur-xl rounded-2xl shadow-2xl border border-gray-100 z-50 p-5 origin-top-right ring-1 ring-black/5">
                        <h4 className="font-bold text-gray-800 mb-4 flex items-center gap-2">
                            <svg className="w-5 h-5 text-blue-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                            </svg>
                            {t('dashboard.dashboard_settings', 'Dashboard Settings')}
                        </h4>

                        <div className="space-y-5">
                            {/* CC Billing Date */}
                            <div>
                                <label className="block text-xs font-bold text-gray-400 mb-2 uppercase tracking-wider">
                                    {t('dashboard.cc_billing_date', 'CC Billing Date')}
                                </label>
                                <p className="text-xs text-gray-500 mb-2 leading-relaxed">
                                    {t('dashboard.cc_billing_desc', 'Day of month when credit cards are debited from your bank.')}
                                </p>
                                <div className="flex gap-2">
                                    <select
                                        className="flex-1 bg-gray-50 border border-gray-200 text-gray-800 rounded-xl px-3 py-2 focus:ring-2 focus:ring-blue-500 outline-none text-sm"
                                        value={draftDate}
                                        onChange={(e) => setDraftDate(Number(e.target.value))}
                                    >
                                        {COMMON_DATES.map(date => (
                                            <option key={date} value={date}>{date}{t('dashboard.date_suffix', 'th')} of month</option>
                                        ))}
                                        {!COMMON_DATES.includes(draftDate) && (
                                            <option value={draftDate}>{draftDate}{t('dashboard.date_suffix', 'th')} (Custom)</option>
                                        )}
                                    </select>
                                    <input
                                        type="number"
                                        min="1" max="31"
                                        className="w-16 bg-gray-50 border border-gray-200 rounded-xl px-2 py-2 text-sm font-bold text-gray-700 focus:ring-2 focus:ring-blue-500 outline-none text-center"
                                        value={draftDate}
                                        onChange={(e) => setDraftDate(Math.max(1, Math.min(31, Number(e.target.value) || 1)))}
                                    />
                                </div>
                            </div>

                            {/* Forecast Window */}
                            <div>
                                <label className="block text-xs font-bold text-gray-400 mb-2 uppercase tracking-wider">
                                    {t('dashboard.forecast_window', 'Forecast History Window')}
                                </label>
                                <p className="text-xs text-gray-500 mb-2 leading-relaxed">
                                    {t('dashboard.forecast_window_desc', 'Months of data used to compute spending averages. Capped to your available data.')}
                                </p>
                                <div className="flex gap-2">
                                    {FORECAST_OPTIONS.map(mo => (
                                        <button
                                            key={mo}
                                            onClick={() => setDraftForecastMonths(mo)}
                                            className={`flex-1 py-1.5 rounded-xl text-sm font-bold transition-all border ${draftForecastMonths === mo
                                                    ? 'bg-blue-600 text-white border-blue-600 shadow-sm'
                                                    : 'bg-gray-50 text-gray-600 border-gray-200 hover:border-blue-300'
                                                }`}
                                        >
                                            {mo}M
                                        </button>
                                    ))}
                                </div>
                            </div>

                            {/* Custom CC Patterns */}
                            {(config.customCCKeywords ?? []).length > 0 && (
                                <div>
                                    <label className="block text-xs font-bold text-gray-400 mb-2 uppercase tracking-wider">
                                        {t('dashboard.cc_patterns', 'CC Payment Patterns')}
                                    </label>
                                    <p className="text-xs text-gray-500 mb-2">
                                        {t('dashboard.cc_patterns_desc', 'Transactions flagged as CC payments. Remove to stop auto-detection.')}
                                    </p>
                                    <div className="space-y-1 max-h-36 overflow-y-auto">
                                        {(config.customCCKeywords ?? []).map(kw => (
                                            <div key={kw} className="flex items-center justify-between bg-amber-50 border border-amber-100 rounded-lg px-3 py-1.5">
                                                <span className="text-xs text-amber-800 font-medium truncate flex-1">{kw}</span>
                                                <button
                                                    onClick={() => removeKeyword(kw)}
                                                    className="ml-2 text-amber-400 hover:text-red-500 transition-colors text-sm font-bold flex-shrink-0"
                                                    title={t('common.remove', 'Remove')}
                                                >
                                                    ×
                                                </button>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}

                            <div className="pt-3 border-t border-gray-100 flex justify-end gap-2">
                                <button
                                    onClick={() => setIsOpen(false)}
                                    className="px-4 py-2 text-sm font-medium text-gray-600 hover:text-gray-900 transition-colors"
                                >
                                    {t('common.cancel', 'Cancel')}
                                </button>
                                <button
                                    onClick={handleSave}
                                    className="bg-blue-600 hover:bg-blue-700 text-white font-medium text-sm px-5 py-2 rounded-xl shadow-md shadow-blue-500/20 transition-all hover:shadow-lg hover:-translate-y-0.5"
                                >
                                    {t('common.save', 'Save')}
                                </button>
                            </div>
                        </div>
                    </div>
                </>
            )}
        </div>
    );
}
