import { useState, useRef, useLayoutEffect, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { useDashboardConfig } from '../../hooks/useDashboardConfig';

function computePanelPosition(rect: DOMRect): { top: number; left: number; width: number } {
    const margin = 8;
    const maxW = Math.min(320, window.innerWidth - margin * 2);
    let left = rect.right - maxW;
    left = Math.max(margin, Math.min(left, window.innerWidth - maxW - margin));
    const top = rect.bottom + margin;
    return { top, left, width: maxW };
}

export function CCPaymentDateSettings() {
    const { t, i18n } = useTranslation();
    const { config, updateConfig } = useDashboardConfig();
    const [isOpen, setIsOpen] = useState(false);
    const anchorRef = useRef<HTMLDivElement>(null);
    const [panelPos, setPanelPos] = useState({ top: 0, left: 0, width: 320 });

    const [draftDate, setDraftDate] = useState(config.ccPaymentDate);
    const [draftForecastMonths, setDraftForecastMonths] = useState(config.forecastMonths ?? 6);

    const COMMON_DATES = [1, 2, 10, 15, 20, 28];
    const FORECAST_OPTIONS = [3, 6, 12];

    useEffect(() => {
        if (isOpen) {
            setDraftDate(config.ccPaymentDate);
            setDraftForecastMonths(config.forecastMonths ?? 6);
        }
    }, [isOpen, config.ccPaymentDate, config.forecastMonths]);

    useLayoutEffect(() => {
        if (!isOpen || !anchorRef.current) return;

        const update = () => {
            if (anchorRef.current) {
                setPanelPos(computePanelPosition(anchorRef.current.getBoundingClientRect()));
            }
        };
        update();
        window.addEventListener('resize', update);
        window.addEventListener('scroll', update, true);
        return () => {
            window.removeEventListener('resize', update);
            window.removeEventListener('scroll', update, true);
        };
    }, [isOpen]);

    const handleSave = () => {
        updateConfig({
            ccPaymentDate: draftDate,
            forecastMonths: draftForecastMonths,
        });
        setIsOpen(false);
    };

    const removeKeyword = (kw: string) => {
        updateConfig({
            customCCKeywords: (config.customCCKeywords ?? []).filter((k) => k !== kw),
        });
    };

    const panelDir = i18n.language === 'he' ? 'rtl' : 'ltr';

    const popover =
        isOpen &&
        createPortal(
            <>
                <div
                    className="fixed inset-0 z-[100] bg-black/20"
                    aria-hidden
                    onClick={() => setIsOpen(false)}
                />
                <div
                    role="dialog"
                    aria-modal="true"
                    aria-labelledby="dashboard-settings-title"
                    dir={panelDir}
                    className="fixed z-[110] max-h-[min(88vh,calc(100dvh-1rem))] overflow-y-auto overscroll-contain bg-white/95 backdrop-blur-xl rounded-2xl shadow-2xl border border-gray-100 p-5 ring-1 ring-black/5"
                    style={{
                        top: panelPos.top,
                        left: panelPos.left,
                        width: panelPos.width,
                        maxWidth: 'calc(100vw - 1rem)',
                    }}
                    onClick={(e) => e.stopPropagation()}
                >
                    <h4 id="dashboard-settings-title" className="font-bold text-gray-800 mb-4 flex items-center gap-2">
                        <svg className="w-5 h-5 shrink-0 text-emerald-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden>
                            <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                strokeWidth={2}
                                d="M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4"
                            />
                        </svg>
                        <span className="min-w-0">{t('dashboard.dashboard_settings')}</span>
                    </h4>

                    <div className="space-y-5">
                        <div>
                            <label className="block text-xs font-bold text-gray-400 mb-2 uppercase tracking-wider">
                                {t('dashboard.cc_billing_date')}
                            </label>
                            <p className="text-xs text-gray-500 mb-2 leading-relaxed">{t('dashboard.cc_billing_desc')}</p>
                            <div className="flex flex-wrap gap-2">
                                <select
                                    className="min-w-0 flex-1 bg-gray-50 border border-gray-200 text-gray-800 rounded-xl px-3 py-2 focus:ring-2 focus:ring-blue-500 outline-none text-sm"
                                    value={draftDate}
                                    onChange={(e) => setDraftDate(Number(e.target.value))}
                                >
                                    {COMMON_DATES.map((date) => (
                                        <option key={date} value={date}>
                                            {date}
                                            {t('dashboard.date_suffix')} {t('dashboard.of_month')}
                                        </option>
                                    ))}
                                    {!COMMON_DATES.includes(draftDate) && (
                                        <option value={draftDate}>
                                            {draftDate}
                                            {t('dashboard.date_suffix')} {t('dashboard.custom')}
                                        </option>
                                    )}
                                </select>
                                <input
                                    type="number"
                                    min="1"
                                    max="31"
                                    className="w-16 shrink-0 bg-gray-50 border border-gray-200 rounded-xl px-2 py-2 text-sm font-bold text-gray-700 focus:ring-2 focus:ring-blue-500 outline-none text-center"
                                    value={draftDate}
                                    onChange={(e) => setDraftDate(Math.max(1, Math.min(31, Number(e.target.value) || 1)))}
                                />
                            </div>
                        </div>

                        <div>
                            <label className="block text-xs font-bold text-gray-400 mb-2 uppercase tracking-wider">
                                {t('dashboard.forecast_window')}
                            </label>
                            <p className="text-xs text-gray-500 mb-2 leading-relaxed">{t('dashboard.forecast_window_desc')}</p>
                            <div className="flex gap-2">
                                {FORECAST_OPTIONS.map((mo) => (
                                    <button
                                        key={mo}
                                        type="button"
                                        onClick={() => setDraftForecastMonths(mo)}
                                        className={`flex-1 py-1.5 rounded-xl text-sm font-bold transition-all border ${
                                            draftForecastMonths === mo
                                                ? 'bg-blue-600 text-white border-blue-600 shadow-sm'
                                                : 'bg-gray-50 text-gray-600 border-gray-200 hover:border-blue-300'
                                        }`}
                                    >
                                        {mo}M
                                    </button>
                                ))}
                            </div>
                        </div>

                        {(config.customCCKeywords ?? []).length > 0 && (
                            <div>
                                <label className="block text-xs font-bold text-gray-400 mb-2 uppercase tracking-wider">
                                    {t('dashboard.cc_patterns')}
                                </label>
                                <p className="text-xs text-gray-500 mb-2">{t('dashboard.cc_patterns_desc')}</p>
                                <div className="space-y-1 max-h-36 overflow-y-auto">
                                    {(config.customCCKeywords ?? []).map((kw) => (
                                        <div key={kw} className="flex items-center justify-between gap-2 bg-amber-50 border border-amber-100 rounded-lg px-3 py-1.5">
                                            <span className="text-xs text-amber-800 font-medium min-w-0 break-words">{kw}</span>
                                            <button
                                                type="button"
                                                onClick={() => removeKeyword(kw)}
                                                className="shrink-0 text-amber-400 hover:text-red-500 transition-colors text-sm font-bold"
                                                title={t('common.remove')}
                                            >
                                                ×
                                            </button>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}

                        <div className="pt-3 border-t border-gray-100 flex flex-wrap justify-end gap-2">
                            <button
                                type="button"
                                onClick={() => setIsOpen(false)}
                                className="px-4 py-2 text-sm font-medium text-gray-600 hover:text-gray-900 transition-colors"
                            >
                                {t('common.cancel')}
                            </button>
                            <button
                                type="button"
                                onClick={handleSave}
                                className="bg-blue-600 hover:bg-blue-700 text-white font-medium text-sm px-5 py-2 rounded-xl shadow-md shadow-blue-500/20 transition-all hover:shadow-lg hover:-translate-y-0.5"
                            >
                                {t('common.save')}
                            </button>
                        </div>
                    </div>
                </div>
            </>,
            document.body
        );

    return (
        <div ref={anchorRef} className="relative inline-block">
            <button
                type="button"
                onClick={() => setIsOpen(!isOpen)}
                className="p-2 text-gray-500 hover:text-gray-800 hover:bg-white/50 rounded-xl transition-colors flex items-center gap-2 group border border-transparent hover:border-gray-200"
                title={t('dashboard.dashboard_settings')}
                aria-expanded={isOpen}
                aria-haspopup="dialog"
            >
                <div className="bg-white p-1.5 rounded-lg shadow-sm group-hover:shadow border border-gray-100 text-emerald-700">
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden>
                        <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4"
                        />
                    </svg>
                </div>
            </button>
            {popover}
        </div>
    );
}
